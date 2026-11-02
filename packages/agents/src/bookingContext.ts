import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthUser } from '@hospital/shared';

export const verifiedDoctorSchema = z.object({ id: z.string().uuid(), name: z.string() });
export type VerifiedDoctor = z.infer<typeof verifiedDoctorSchema>;

function normalizeDoctorName(value: string): string {
  return value.toLowerCase().replace(/\bdr\.?(?:\s+|$)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function selectedConversationDoctor(conversationId: string, user: AuthUser, db: PrismaClient): Promise<VerifiedDoctor | undefined> {
  const saved = await db.auditLog.findFirst({ where: { userId: user.id, resource: 'Conversation', resourceId: conversationId, action: 'VERIFIED_DOCTOR_SELECTION' }, orderBy: { createdAt: 'desc' } });
  if (!saved) return undefined;
  const selection = verifiedDoctorSchema.parse(JSON.parse(saved.details!));
  const doctor = await db.doctor.findUnique({ where: { id: selection.id }, select: { id: true, user: { select: { name: true } } } });
  if (!doctor) throw Object.assign(new Error('The previously selected doctor is no longer available. Select a doctor from the current directory.'), { statusCode: 400 });
  return { id: doctor.id, name: doctor.user.name };
}

export function requestedDoctors(prompt: string, directory: VerifiedDoctor[]): VerifiedDoctor[] {
  const text = normalizeDoctorName(prompt);
  const targets = directory.filter((doctor) => text.includes(`with ${normalizeDoctorName(doctor.name)}`) || text.includes(`doctor ${normalizeDoctorName(doctor.name)}`));
  return targets.length ? targets : directory.filter((doctor) => text.includes(normalizeDoctorName(doctor.name)));
}

export function resolveVerifiedDoctor(prompt: string, input: { doctorId?: string; doctorName?: string }, directory: VerifiedDoctor[], selected: VerifiedDoctor | undefined): VerifiedDoctor {
  const explicitName = prompt.match(/\bwith\s+Dr\.?\s+([a-z]+(?:\s+[a-z]+){1,2})(?=\s+(?:on|at|for|tomorrow)\b|[,(.]|$)/i)?.[1];
  if (explicitName && !/^(?:the|same|previous|selected)\b/i.test(explicitName) && !directory.some((doctor) => normalizeDoctorName(doctor.name) === normalizeDoctorName(explicitName))) throw Object.assign(new Error('The requested doctor name was not found in the current directory. Please clarify the name.'), { statusCode: 400 });
  const names = requestedDoctors(prompt, directory);
  const matches = names.length ? names : selected ? directory.filter((doctor) => doctor.id === selected.id) : input.doctorName ? directory.filter((doctor) => doctor.name.toLowerCase() === input.doctorName!.toLowerCase()) : directory.filter((doctor) => doctor.id === input.doctorId);
  if (matches.length !== 1) throw Object.assign(new Error('Select one doctor by name from the current directory. No missing, ambiguous or unverified doctor ID can be used.'), { statusCode: 400 });
  return matches[0];
}

export async function rememberVerifiedDoctor(conversationId: string, user: AuthUser, selection: VerifiedDoctor, db: PrismaClient): Promise<void> {
  const conversation = await db.conversation.findFirst({ where: { id: conversationId, userId: user.id }, select: { id: true } });
  if (!conversation) throw Object.assign(new Error('403 Forbidden: Doctor selection belongs to another conversation owner.'), { statusCode: 403 });
  await db.auditLog.create({ data: { userId: user.id, resource: 'Conversation', resourceId: conversationId, action: 'VERIFIED_DOCTOR_SELECTION', details: JSON.stringify(selection) } });
}

export function isBookingRecall(prompt: string): boolean {
  return /\b(?:failed|rejected|unsuccessful)\b.{0,45}\b(?:booking|appointment)\b|\b(?:booking|appointment)\b.{0,45}\b(?:failed|rejected|unsuccessful|just tried|just booked)\b|\b(?:retrieve|show|find|view)\b.{0,20}\b(?:that|requested|newly booked|just booked)\b.{0,15}\b(?:booking|appointment)\b/i.test(prompt);
}
