import { z } from 'zod';
import { ToolExecutionResult } from '@hospital/shared';
import { appointmentDetailsSchema } from './tools/implementations.js';

export const verificationRecordSchema = appointmentDetailsSchema.partial().extend({
  appointmentId: z.string().uuid(),
  doctorId: z.string().uuid().optional(),
  startTime: z.string().datetime({ offset: true }).optional(),
  duplicateActiveBookings: z.number().int().nonnegative().optional(),
});

/** Exact record verification takes precedence over references to previous booking attempts. */
export function isReadOnlyAppointmentRequest(prompt: string): boolean {
  if (!/\b(?:appointment|booking)\b/i.test(prompt)) return false;
  if (/\bread[- ]only\b/i.test(prompt)) return true;
  if (/\b(?:ticket|support|help)\b/i.test(prompt)) return false;
  const instructions = prompt.replace(/\b(?:do not|don't|never|without)\s+(?:(?:book|create|schedule|reschedule|cancel)(?:ing)?[\s,]*(?:or|and)?[\s,]*)+/gi, '');
  return !/\b(?:book|create|schedule|reschedule|cancel)\b/i.test(instructions)
    && /\b(?:verify|check|lookup|look up|show|view|find|retrieve|appointment\s+(?:id\s*)?[0-9a-f]{8}-)\b/i.test(prompt);
}

export function readOnlyAppointmentId(prompt: string): string | undefined {
  if (!isReadOnlyAppointmentRequest(prompt)) return undefined;
  return prompt.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0];
}

export function appointmentVerificationText(appointmentId: string, lookup: ToolExecutionResult): string {
  if (!lookup.success) {
    if (lookup.statusCode === 403) return 'Authorization failure: appointment access denied. No record details are disclosed.';
    if (lookup.statusCode === 404) return 'Appointment: NOT FOUND.';
    throw Object.assign(new Error(`Appointment lookup failed: ${lookup.error}`), { statusCode: lookup.statusCode });
  }
  if (lookup.data === null || lookup.data === undefined) return 'Appointment: NOT FOUND (lookup executed successfully; no record returned).';
  const record = verificationRecordSchema.parse(lookup.data);
  if (record.appointmentId.toLowerCase() !== appointmentId.toLowerCase()) return 'Appointment: NOT VERIFIED (lookup returned a different record).';
  return `**Appointment ID:** ${record.appointmentId}\n\n**Status:** ${record.status ?? 'NOT VERIFIED'}\n\n**Patient:** ${record.patientName ?? 'NOT VERIFIED'}\n\n**Doctor:** ${record.doctorName ?? 'NOT VERIFIED'}\n\n**Time:** ${record.startTime ?? 'NOT VERIFIED'}${record.localStartTime ? ` (${record.localStartTime})` : ''}\n\n**Visit reason:** ${record.reason === null ? 'Not recorded' : record.reason ?? 'NOT VERIFIED'}\n\n**Duplicate active bookings:** ${record.duplicateActiveBookings ?? 'NOT VERIFIED'}`;
}
