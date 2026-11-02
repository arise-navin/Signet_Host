import { z } from 'zod';
import { ticketReceiptSchema } from '@hospital/shared';

const historyToolsSchema = z.array(z.object({
  toolName: z.string(), success: z.boolean(),
  data: z.union([ticketReceiptSchema, z.array(z.object({})), z.object({})]).optional(),
}));

/** Old appointment tables are display history, never reusable authorization or model context. */
export function appointmentHistoryContent(message: { content: string; toolCalls: string | null }): string {
  if (!message.toolCalls) return message.content;
  const tools = historyToolsSchema.parse(JSON.parse(message.toolCalls));
  if (!tools.some((tool) => tool.toolName === 'get_appointments')) return message.content;
  const receipts = tools.filter((tool) => tool.success && tool.toolName === 'create_support_ticket').map((tool) => ticketReceiptSchema.parse(tool.data));
  return JSON.stringify({
    previousAppointmentList: true,
    instruction: 'Resolve numbered references through the server-side mapping and retrieve current authorized appointments. Do not reuse historical appointment details.',
    supportTickets: receipts,
  });
}
