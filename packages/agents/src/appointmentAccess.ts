import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthUser } from '@hospital/shared';
import { HospitalDatabase } from './security.js';

export const appointmentScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PATIENT'), userId: z.string().uuid(), patientId: z.string().uuid() }),
  z.object({ kind: z.literal('DOCTOR'), userId: z.string().uuid(), doctorId: z.string().uuid() }),
  z.object({ kind: z.literal('DEPARTMENT'), userId: z.string().uuid(), role: z.enum(['ADMIN', 'RECEPTIONIST']), departmentIds: z.array(z.string().uuid()) }),
]);
export type AppointmentScope = z.infer<typeof appointmentScopeSchema>;

export function personalAppointmentScope(user: AuthUser): AppointmentScope {
  if (!user.patientId) throw Object.assign(new Error('403 Forbidden: Personal appointments require a linked patient profile.'), { statusCode: 403 });
  return { kind: 'PATIENT', userId: user.id, patientId: user.patientId };
}

/** Staff scheduling access is explicit; no department grants means no appointment rows. */
export async function appointmentScope(user: AuthUser, db: HospitalDatabase): Promise<AppointmentScope> {
  if (user.role === 'PATIENT') return personalAppointmentScope(user);
  if (user.role === 'DOCTOR') {
    if (!user.doctorId) throw Object.assign(new Error('403 Forbidden: This account has no linked doctor profile.'), { statusCode: 403 });
    return { kind: 'DOCTOR', userId: user.id, doctorId: user.doctorId };
  }
  const grants = await db.schedulingDepartmentAccess.findMany({ where: { userId: user.id }, select: { departmentId: true }, orderBy: { departmentId: 'asc' } });
  return { kind: 'DEPARTMENT', userId: user.id, role: user.role, departmentIds: grants.map((grant) => grant.departmentId) };
}

export function appointmentScopeWhere(scope: AppointmentScope): Prisma.AppointmentWhereInput {
  if (scope.kind === 'PATIENT') return { patientId: scope.patientId };
  if (scope.kind === 'DOCTOR') return { doctorId: scope.doctorId };
  return { doctor: { departmentId: { in: scope.departmentIds } } };
}

export async function authorizeAppointment(user: AuthUser, appointment: { patientId: string; doctorId: string }, db: HospitalDatabase): Promise<void> {
  if (user.patientId === appointment.patientId) return;
  const scope = await appointmentScope(user, db);
  if (scope.kind === 'PATIENT') throw Object.assign(new Error('403 Forbidden: You can only access your own appointments.'), { statusCode: 403 });
  if (scope.kind === 'DOCTOR' && scope.doctorId === appointment.doctorId) return;
  if (scope.kind === 'DEPARTMENT') {
    const doctor = await db.doctor.findUnique({ where: { id: appointment.doctorId }, select: { departmentId: true } });
    if (doctor && scope.departmentIds.includes(doctor.departmentId)) return;
  }
  throw Object.assign(new Error('403 Forbidden: This appointment is outside your assigned scheduling scope.'), { statusCode: 403 });
}
