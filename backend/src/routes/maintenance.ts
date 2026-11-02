import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';

const tables = [
  'roles', 'users', 'departments', 'scheduling_department_access', 'patients', 'doctors',
  'doctor_availabilities', 'doctor_unavailable_periods', 'appointments', 'patient_visits',
  'medical_records', 'prescriptions', 'lab_tests', 'lab_reports', 'support_tickets', 'ai_agents',
  'conversations', 'displayed_appointment_lists', 'messages', 'agent_executions', 'tool_executions',
  'audit_logs', 'notifications', 'doctor_patient_assignments', 'patient_symptom_requests', 'ai_recommendations',
] as const;
interface TableBackup { table: string; rows: string }
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

async function snapshot(tx: Prisma.TransactionClient): Promise<TableBackup[]> {
  const backup: TableBackup[] = [];
  for (const table of tables) {
    const records = await tx.$queryRawUnsafe<Array<{ rows: string }>>(
      `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text AS rows FROM public."${table}" t`,
    );
    if (!records[0]) throw new Error(`Backup query returned no result for table ${table}`);
    backup.push({ table, rows: records[0].rows });
  }
  return backup;
}

/** Temporary, expiring maintenance job. A successful reset consumes its key through an audit marker. */
export async function maintenanceRoutes(server: FastifyInstance): Promise<void> {
  const token = process.env.MAINTENANCE_TOKEN;
  const expiry = process.env.MAINTENANCE_EXPIRES_AT;
  if (!token || !expiry) throw new Error('Temporary maintenance job requires MAINTENANCE_TOKEN and MAINTENANCE_EXPIRES_AT.');
  const keyHash = digest(token);
  const authorize = async (req: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    if (!Number.isFinite(Date.parse(expiry)) || Date.now() >= Date.parse(expiry)) {
      reply.status(410).send({ error: 'Maintenance authorization expired.' });
      return false;
    }
    if (!timingSafeEqual(Buffer.from(digest(String(req.headers['x-maintenance-token'] || ''))), Buffer.from(keyHash))) {
      reply.status(401).send({ error: 'Maintenance authorization required.' });
      return false;
    }
    if (await prisma.auditLog.findFirst({ where: { action: 'ADMIN_DATA_RESET', resourceId: keyHash } })) {
      reply.status(410).send({ error: 'Maintenance authorization has already been consumed.' });
      return false;
    }
    reply.header('Cache-Control', 'no-store');
    return true;
  };
  server.get('/api/maintenance/export', async (req, reply) => {
    if (!await authorize(req, reply)) return;
    return prisma.$transaction(async (tx) => ({ tables: await snapshot(tx) }), { isolationLevel: 'Serializable', timeout: 30000 });
  });
  server.post('/api/maintenance/reset', async (req, reply) => {
    if (!await authorize(req, reply)) return;
    const input = z.object({ backupSha256: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map((table) => `public."${table}"`).join(', ')} IN ACCESS EXCLUSIVE MODE`);
      const backup = { tables: await snapshot(tx) };
      if (digest(JSON.stringify(backup)) !== input.backupSha256) {
        throw new Error('Database changed since backup export. Export and save a fresh backup before resetting.');
      }
      const admin = await tx.user.findUniqueOrThrow({ where: { email: 'admin@hospital.com' }, include: { role: true } });
      if (admin.role.name !== 'ADMIN' || !admin.isActive) throw new Error('Expected active administrator account was not found. Reset refused.');
      const clear = tables.filter((table) => !['roles', 'users', 'ai_agents'].includes(table));
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${clear.map((table) => `public."${table}"`).join(', ')} RESTART IDENTITY`);
      const removed = await tx.user.deleteMany({ where: { id: { not: admin.id } } });
      const retained = await tx.user.findUniqueOrThrow({ where: { id: admin.id }, include: { role: true } });
      if (JSON.stringify(retained) !== JSON.stringify(admin)) throw new Error('Administrator account changed unexpectedly; reset rolled back.');
      await tx.auditLog.create({ data: { userId: admin.id, action: 'ADMIN_DATA_RESET', resource: 'Maintenance', resourceId: keyHash, details: JSON.stringify({ removedUsers: removed.count, backupSha256: input.backupSha256 }) } });
      return { removedUsers: removed.count, remainingUsers: await tx.user.count(), clearedTables: clear, adminCredentialsUnchanged: true };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  });
}
