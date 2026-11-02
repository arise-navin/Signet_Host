import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index.js';
import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { getAppointmentsTool } from '@hospital/agents';
import { AGENT_IDS, AuthUser } from '@hospital/shared';

let app: FastifyInstance;
let adminAuthorization: string;
const authorizations = new Map<string, string>();

beforeAll(async () => {
  const { server } = await createServer();
  app = server;
  await app.ready();
  const users = await prisma.user.findMany({ where: { email: { in: ['admin@hospital.com', 'patient1@example.com'] } } });
  for (const user of users) {
    const login = await app.inject({ method: 'POST', url: '/api/auth/switch', payload: { userId: user.id } });
    const token = JSON.parse(login.body).token as string;
    authorizations.set(user.id, `Bearer ${token}`);
    if (user.email === 'admin@hospital.com') adminAuthorization = `Bearer ${token}`;
  }
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('Hospital AI Application Integration Tests', () => {
  it('GET /api/health returns healthy backend status', async () => {
    const res = await app.inject({
      headers: { authorization: adminAuthorization },
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.services.backend.status).toBe('up');
    expect(body.services.database.status).toBe('connected');
  });

  it('GET /api/dashboard/stats returns real counts from PostgreSQL', async () => {
    const res = await app.inject({
      headers: { authorization: adminAuthorization },
      method: 'GET',
      url: '/api/dashboard/stats',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.metrics.totalPatients).toBeGreaterThanOrEqual(50);
    expect(body.metrics.totalDoctors).toBeGreaterThanOrEqual(10);
    expect(body.agents.length).toBe(4);
  });

  it('GET /api/patients lists seeded synthetic patients for admin and enforces patient scoping', async () => {
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@hospital.com' } });
    const resAdmin = await app.inject({
      method: 'GET',
      url: '/api/patients?limit=5',
      headers: { authorization: authorizations.get(adminUser!.id)! },
    });

    expect(resAdmin.statusCode).toBe(200);
    const bodyAdmin = JSON.parse(resAdmin.body);
    expect(bodyAdmin.patients.length).toBe(5);
    expect(bodyAdmin.patients[0].mrn).toMatch(/^MRN-2026-/);

    // Patient boundary verification
    const patientUser = await prisma.user.findFirst({ where: { email: 'patient1@example.com' } });
    const resPatient = await app.inject({
      method: 'GET',
      url: '/api/patients?limit=5',
      headers: { authorization: authorizations.get(patientUser!.id)! },
    });
    expect(resPatient.statusCode).toBe(200);
    const bodyPatient = JSON.parse(resPatient.body);
    expect(bodyPatient.patients.length).toBe(1);
  });

  it('GET /api/doctors returns doctors with departments and availability', async () => {
    const res = await app.inject({
      headers: { authorization: adminAuthorization },
      method: 'GET',
      url: '/api/doctors',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBeGreaterThanOrEqual(10);
    expect(body[0].department).toBeDefined();
    expect(body[0].schedules.length).toBeGreaterThan(0);
  });

  it('Appointment tool scopes patient and doctor schedules and rejects another patient', async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: ['patient1@example.com', 'dr.mitchell@hospital.com'] } },
      include: { role: true, patient: true, doctor: true },
    });
    expect(users).toHaveLength(2);
    for (const user of users) {
      const authUser: AuthUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.doctor ? 'DOCTOR' : 'PATIENT',
        patientId: user.patient?.id,
        doctorId: user.doctor?.id,
      };
      const context = { authUser, agentId: AGENT_IDS.APPOINTMENT };
      const actual = await getAppointmentsTool.execute({}, context, prisma);
      const expected = await prisma.appointment.findMany({
        where: user.doctor ? { doctorId: user.doctor.id } : { patientId: user.patient!.id },
        orderBy: { startTime: 'desc' },
        take: 50,
      });
      expect(actual.map((appointment: { appointmentId: string }) => appointment.appointmentId))
        .toEqual(expected.map((appointment) => appointment.id));
      if (user.patient) {
        await expect(getAppointmentsTool.execute({ patientId: user.id }, context, prisma))
          .rejects.toThrow('403 Forbidden');
      }
    }
  });

  describe('Executable Test Lab Scenarios (TEST-001 through TEST-016)', () => {
    const testIds = [
      'TEST-001',
      'TEST-002',
      'TEST-003',
      'TEST-004',
      'TEST-005',
      'TEST-006',
      'TEST-007',
      'TEST-008',
      'TEST-009',
      'TEST-010',
      'TEST-011',
      'TEST-012',
      'TEST-013',
      'TEST-014',
      'TEST-015',
      'TEST-016',
    ];

    for (const testId of testIds) {
      it(`Executes scenario ${testId}`, async () => {
        const res = await app.inject({
          headers: { authorization: adminAuthorization },
          method: 'POST',
          url: `/api/test-lab/run/${testId}`,
        });

        expect(res.statusCode).toBe(200);
        const result = JSON.parse(res.body);
        if (!result.passed) {
          console.error(`TEST FAILURE [${result.testId}]:`, result.actualResult);
        }
        expect(result.testId).toBe(testId);
        expect(result.passed).toBe(true);
      });
    }
  });
});
