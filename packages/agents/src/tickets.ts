import { Prisma, PrismaClient } from '@prisma/client';
import { AuthUser, supportTicketSummarySchema } from '@hospital/shared';
import { z } from 'zod';

export function authorizedTicketWhere(user: AuthUser): Prisma.SupportTicketWhereInput {
  return user.role === 'PATIENT' ? { createdById: user.id } : { OR: [{ createdById: user.id }, { assignedTo: user.id }] };
}

export async function readAuthorizedTicket(ticketId: string, user: AuthUser, db: PrismaClient): Promise<z.infer<typeof supportTicketSummarySchema>> {
  const ticket = await db.supportTicket.findFirst({ where: { id: ticketId, AND: [authorizedTicketWhere(user)] } });
  if (!ticket) throw Object.assign(new Error('403 Forbidden: This ticket is unavailable in your authorized support scope.'), { statusCode: 403 });
  return supportTicketSummarySchema.parse({ ...ticket, createdAt: ticket.createdAt.toISOString() });
}

export function ticketReceiptText(receipt: { ticketId: string; status: string; priority: string; appointmentId: string | null }): string {
  return `Support ticket saved.\n\n**Ticket ID:** \`${receipt.ticketId}\`\n\n**Status:** ${receipt.status}\n\n**Priority:** ${receipt.priority}\n\n**Appointment:** ${receipt.appointmentId ?? 'None'}\n\nNo appointment was rescheduled by this support request.`;
}

export const ticketLookupTools: readonly string[] = ['get_support_ticket', 'list_my_support_tickets', 'transfer_to_agent'];

export function isTicketLookupRequest(prompt: string): boolean {
  const request = prompt.replace(/\b(?:do not|don't|never)\s+create\b/gi, '');
  return /\b(?:tickets?|support requests?)\b/i.test(request) && /\b(?:show|list|view|lookup|retrieve|check|status|find|track)\b/i.test(request) && !/\b(?:create|file|raise)\b|\bopen\s+(?:a|an|new|another)\b/i.test(request);
}
