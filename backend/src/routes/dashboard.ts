import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { authorizedTicketWhere, appointmentScope, appointmentScopeWhere, hospitalDate, hospitalTimezone, localTimeToUtc } from '@hospital/agents';
import { Prisma } from '@prisma/client';
import { AGENT_METADATA_LIST } from '@hospital/shared';

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/api/dashboard/stats', async (req, reply) => {
    const todayStart = localTimeToUtc(hospitalDate(new Date()), '00:00', hospitalTimezone());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    const authUser = req.authUser!;
    const visibleAppointments = appointmentScopeWhere(await appointmentScope(authUser, prisma));
    const [
      totalPatients,
      totalDoctors,
      todayAppointmentsCount,
      totalAppointments,
      activeTicketsCount,
      recentExecutions,
      recentAppointments,
    ] = await Promise.all([
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.appointment.count({
        where: {
          startTime: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.appointment.count(),
      prisma.supportTicket.count({
        where: { AND: [authorizedTicketWhere(authUser)], status: 'OPEN' },
      }),
      prisma.agentExecution.findMany({
        where: { userId: authUser.id },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: true,
          toolExecutions: true,
        },
      }),
      prisma.appointment.findMany({
        where: visibleAppointments,
        take: 6,
        orderBy: { startTime: 'desc' },
        include: {
          patient: { include: { user: { select: { name: true } } } },
          doctor: { include: { user: { select: { name: true } }, department: { select: { name: true } } } },
        },
      }),
    ]);

    return {
      metrics: {
        totalPatients,
        totalDoctors,
        todayAppointments: todayAppointmentsCount,
        totalAppointments,
        activeTickets: activeTicketsCount,
      },
      agents: AGENT_METADATA_LIST,
      recentActivities: recentExecutions.map((e) => ({
        id: e.id,
        agentId: e.agentId,
        agentName: e.agent.name,
        prompt: e.userPrompt,
        status: e.status,
        durationMs: e.durationMs,
        toolCount: e.toolExecutions.length,
        createdAt: e.createdAt.toISOString(),
      })),
      recentAppointments: recentAppointments.map((a) => ({
        id: a.id,
        patientName: a.patient.user.name,
        doctorName: a.doctor.user.name,
        department: a.doctor.department.name,
        startTime: a.startTime.toISOString(),
        status: a.status,
        reason: a.reason,
      })),
    };
  });
}
