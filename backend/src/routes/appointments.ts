import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { appointmentScope, appointmentScopeWhere, ToolExecutor, authorizeCarePatient, formatHospitalTime, hospitalTimezone } from '@hospital/agents';
import { AGENT_IDS, ToolExecutionResult } from '@hospital/shared';
import { prisma } from '../db.js';
import { Prisma, AppointmentStatus } from '@prisma/client';

export async function appointmentRoutes(fastify: FastifyInstance) {
  // List appointments with role-scoped security
  fastify.get('/api/appointments', async (req, reply) => {
    const { status, patientId, doctorId, page = '1', limit = '20' } = (req.query as any) || {};
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const scope = await appointmentScope(req.authUser!, prisma);
    const where: Prisma.AppointmentWhereInput = { AND: [appointmentScopeWhere(scope)] };
    if (status) {
      where.status = z.nativeEnum(AppointmentStatus).parse(status);
    }

    const authUser = req.authUser;
    if (authUser?.role === 'PATIENT' && authUser.patientId) {
      where.patientId = authUser.patientId;
    } else if (patientId) {
      where.patientId = patientId;
    }

    if (authUser?.role === 'DOCTOR' && authUser.doctorId) {
      where.doctorId = authUser.doctorId;
    } else if (doctorId) {
      where.doctorId = doctorId;
    }

    if (patientId) await authorizeCarePatient(req.authUser!, z.string().uuid().parse(patientId), prisma);
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take,
        include: {
          patient: { include: { user: { select: { name: true, email: true } } } },
          doctor: { include: { user: { select: { name: true } }, department: { select: { name: true } } } },
        },
        orderBy: { startTime: 'desc' },
      }),
      prisma.appointment.count({ where }),
    ]);

    return {
      total,
      timezone: hospitalTimezone(),
      page: parseInt(page, 10),
      limit: take,
      appointments: appointments.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        patientName: a.patient.user.name,
        patientEmail: a.patient.user.email,
        doctorId: a.doctorId,
        doctorName: a.doctor.user.name,
        department: a.doctor.department.name,
        localStartTime: formatHospitalTime(a.startTime),
        timezone: hospitalTimezone(),
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        status: a.status,
        reason: a.reason,
        notes: a.notes,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });

  async function executeMutation(toolName: string, args: object, req: FastifyRequest, reply: FastifyReply): Promise<ToolExecutionResult> {
    const requestId = req.headers['idempotency-key'];
    if (requestId !== undefined) z.string().uuid().parse(requestId);
    const result = await new ToolExecutor().executeTool(toolName, args, {
      authUser: req.authUser!, agentId: AGENT_IDS.APPOINTMENT, traceId: req.id, requestId: typeof requestId === 'string' ? requestId : undefined,
    }, prisma, req.id);
    if (!result.success) reply.status(result.statusCode ?? 400);
    return result;
  }

  fastify.post('/api/appointments/book', async (req, reply) => {
    const result = await executeMutation('book_appointment', z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).parse(req.body), req, reply);
    return result.success ? { message: result.data.message, appointment: { ...result.data, id: result.data.appointmentId } } : { error: result.error };
  });

  fastify.post('/api/appointments/:id/reschedule', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ newStartTime: z.string() }).parse(req.body);
    const result = await executeMutation('reschedule_appointment', { appointmentId: id, ...body }, req, reply);
    return result.success ? { message: result.data.message, appointment: { ...result.data, id: result.data.appointmentId } } : { error: result.error };
  });

  fastify.post('/api/appointments/:id/cancel', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ reason: z.string().optional() }).parse(req.body);
    const result = await executeMutation('cancel_appointment', { appointmentId: id, ...body }, req, reply);
    return result.success ? { message: result.data.message, appointment: { ...result.data, id: result.data.appointmentId } } : { error: result.error };
  });
}
