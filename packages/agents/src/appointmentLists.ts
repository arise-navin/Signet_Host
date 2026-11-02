import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthUser } from '@hospital/shared';
import { AppointmentScope, appointmentScopeSchema, appointmentScopeWhere, authorizeAppointment } from './appointmentAccess.js';
import { activeAppointmentStatuses } from './scheduling.js';
import { formatHospitalTime } from './time.js';

export const appointmentChoiceSchema = z.object({
  appointmentId: z.string().uuid(), patientId: z.string().uuid(), patientName: z.string(), doctorId: z.string().uuid(),
  doctorName: z.string(), localStartTime: z.string(), startTime: z.string(),
});
export type AppointmentChoice = z.infer<typeof appointmentChoiceSchema>;
const listItemSchema = z.object({ itemNumber: z.number().int().positive(), appointmentId: z.string().uuid() });

export type AppointmentReference = { kind: 'NONE' } | { kind: 'NUMBER'; itemNumber: number } | { kind: 'AMBIGUOUS' };
export type ResolvedAppointmentReference = { kind: 'NONE' } | { kind: 'UNAVAILABLE'; reason: string } | { kind: 'RESOLVED'; appointmentId: string; displayedListId: string };

export function appointmentReference(prompt: string): AppointmentReference {
  const explicit = [...prompt.matchAll(/\bappointment\s*#?\s*(\d+)(?![\da-f-])\b/gi)].map((match) => Number(match[1]));
  if (new Set(explicit).size > 1) return { kind: 'AMBIGUOUS' };
  if (explicit.length) return { kind: 'NUMBER', itemNumber: explicit[0] };
  const short = prompt.trim().match(/^(?:(?:please\s+)?(?:select|choose|use)\s+)?(?:(?:option|number)\s*|#\s*)?(\d+)(?:\s*(?:please|one|appointment))?[.!]?$/i);
  if (short) return { kind: 'NUMBER', itemNumber: Number(short[1]) };
  const ordinal = prompt.trim().match(/^(?:(?:please\s+)?(?:select|choose|use)\s+)?(?:the\s+)?(first|second|third|fourth|fifth)(?:\s+(?:appointment|one))?[.!]?$/i);
  return ordinal ? { kind: 'NUMBER', itemNumber: ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(ordinal[1].toLowerCase()) + 1 } : { kind: 'NONE' };
}

function tableCell(value: string): string {
  return value.replace(/[\\`*_{}[\]<>()!|]/g, '\\$&').replace(/\r?\n/g, ' ');
}

export function appointmentTable(choices: AppointmentChoice[]): string {
  return ['| # | Patient | Doctor | Hospital time |', '| --- | --- | --- | --- |',
    ...choices.map((choice, index) => `| ${index + 1} | ${tableCell(choice.patientName)} | ${tableCell(choice.doctorName)} | ${tableCell(choice.localStartTime)} |`),
  ].join('\n');
}

/** Store exactly the order rendered by the server, not the model's interpretation of a tool result. */
export async function rememberAppointmentList(conversationId: string, user: AuthUser, scope: AppointmentScope, choices: AppointmentChoice[], db: PrismaClient): Promise<string> {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { userId: true } });
  if (conversation.userId !== user.id || scope.userId !== user.id) throw Object.assign(new Error('403 Forbidden: Appointment list owner does not match this conversation.'), { statusCode: 403 });
  const authorized = await db.appointment.findMany({ where: { AND: [appointmentScopeWhere(scope), { id: { in: choices.map((choice) => choice.appointmentId) } }] }, select: { id: true } });
  if (authorized.length !== choices.length) throw Object.assign(new Error('403 Forbidden: Appointment list contains entries outside the current scheduling scope.'), { statusCode: 403 });
  return (await db.displayedAppointmentList.create({ data: {
    conversationId, userId: user.id, authorizationScope: { ...scope },
    items: choices.map((choice, index) => ({ itemNumber: index + 1, appointmentId: choice.appointmentId })),
    expiresAt: new Date(Date.now() + 15 * 60000),
  } })).id;
}

export async function resolveAppointmentReference(prompt: string, conversationId: string, user: AuthUser, scope: AppointmentScope, db: PrismaClient): Promise<ResolvedAppointmentReference> {
  const reference = appointmentReference(prompt);
  if (reference.kind === 'NONE') return reference;
  if (reference.kind === 'AMBIGUOUS') return { kind: 'UNAVAILABLE', reason: 'More than one appointment number was supplied. Please choose one appointment.' };
  const lists = await db.displayedAppointmentList.findMany({ where: { conversationId, userId: user.id, publishedAt: { not: null } }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 2 });
  const list = lists[0];
  if (!list || list.expiresAt.getTime() <= Date.now()) return { kind: 'UNAVAILABLE', reason: 'The earlier appointment list is missing or expired. Please confirm a choice from the refreshed list.' };
  if (lists.length > 1 && /\b(previous|earlier|old)\s+list\b/i.test(prompt)) return { kind: 'UNAVAILABLE', reason: 'There is more than one earlier list. Please confirm a choice from the refreshed list.' };
  const savedScope = appointmentScopeSchema.parse(list.authorizationScope);
  if (JSON.stringify(savedScope) !== JSON.stringify(scope)) return { kind: 'UNAVAILABLE', reason: 'Your scheduling permissions changed. Please confirm a choice from the refreshed authorized list.' };
  const item = z.array(listItemSchema).parse(list.items).find((entry) => entry.itemNumber === reference.itemNumber);
  if (!item) return { kind: 'UNAVAILABLE', reason: 'That number is not in the displayed list. Please confirm a valid choice.' };
  return { kind: 'RESOLVED', appointmentId: item.appointmentId, displayedListId: list.id };
}

export async function selectedAppointment(appointmentId: string, user: AuthUser, db: PrismaClient): Promise<AppointmentChoice> {
  const owner = await db.appointment.findUnique({ where: { id: appointmentId }, select: { patientId: true, doctorId: true, status: true, startTime: true } });
  if (!owner) throw Object.assign(new Error('The selected appointment no longer exists. Request a fresh list.'), { statusCode: 404 });
  await authorizeAppointment(user, owner, db);
  if (!activeAppointmentStatuses.includes(owner.status) || owner.startTime.getTime() <= Date.now()) throw Object.assign(new Error('The selected appointment is no longer upcoming and active. Request a fresh list.'), { statusCode: 409 });
  const appointment = await db.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { patient: { include: { user: { select: { name: true } } } }, doctor: { include: { user: { select: { name: true } } } } } });
  return { appointmentId: appointment.id, patientId: appointment.patientId, patientName: appointment.patient.user.name, doctorId: appointment.doctorId, doctorName: appointment.doctor.user.name, startTime: appointment.startTime.toISOString(), localStartTime: formatHospitalTime(appointment.startTime) };
}
