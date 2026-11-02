import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorizedTicketWhere, readAuthorizedTicket } from '@hospital/agents';
import { supportTicketListSchema } from '@hospital/shared';
import { prisma } from '../db.js';

export async function supportTicketRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/support-tickets', async (req) => {
    const query = z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where = authorizedTicketWhere(req.authUser!);
    const [tickets, total] = await prisma.$transaction([
      prisma.supportTicket.findMany({ where, select: { id: true, ticketNumber: true, category: true, subject: true, description: true, priority: true, status: true, appointmentId: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.supportTicket.count({ where }),
    ]);
    return supportTicketListSchema.parse({ tickets: tickets.map((ticket) => ({ ...ticket, createdAt: ticket.createdAt.toISOString() })), total, page, limit });
  });
  server.get('/api/support-tickets/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const ticket = await readAuthorizedTicket(id, req.authUser!, prisma);
    return { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, appointmentId: ticket.appointmentId, status: ticket.status, priority: ticket.priority };
  });
}
