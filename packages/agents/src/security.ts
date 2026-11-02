import { Prisma, PrismaClient } from '@prisma/client';
import { AuthUser } from '@hospital/shared';

export type HospitalDatabase = PrismaClient | Prisma.TransactionClient;

export function careRelationshipFilter(doctorId: string): Prisma.PatientWhereInput {
  return { OR: [
    { appointments: { some: { doctorId, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED'] } } } },
    { visits: { some: { doctorId } } },
    { doctorAssignments: { some: { doctorId, active: true } } },
  ] };
}

export async function authorizeCarePatient(user: AuthUser, patientId: string, db: HospitalDatabase): Promise<void> {
  if (user.role === 'PATIENT') {
    if (!user.patientId || user.patientId !== patientId) throw Object.assign(new Error('403 Forbidden: You can only access your own patient information.'), { statusCode: 403 });
    return;
  }
  if (user.role === 'DOCTOR' && user.patientId === patientId) return;
  if (user.role === 'DOCTOR') {
    if (!user.doctorId) throw Object.assign(new Error('403 Forbidden: Doctor profile is not linked to this account.'), { statusCode: 403 });
    const relationship = await db.patient.findFirst({ where: { id: patientId, ...careRelationshipFilter(user.doctorId) }, select: { id: true } });
    if (!relationship) throw Object.assign(new Error('403 Forbidden: No authorized care relationship exists for this patient.'), { statusCode: 403 });
  }
}

/** Administrators and authorized care participants can access clinical records. */
export async function authorizeClinicalPatient(user: AuthUser, patientId: string, db: HospitalDatabase): Promise<void> {
  if (user.role === 'RECEPTIONIST') {
    throw Object.assign(new Error('403 Forbidden: This role has no clinical record permission. Use an assigned clinician account.'), { statusCode: 403 });
  }
  await authorizeCarePatient(user, patientId, db);
}

export async function resolveClinicalPatient(requestedId: string | undefined, user: AuthUser, db: HospitalDatabase): Promise<string> {
  const patientId = requestedId ?? user.patientId;
  if (!patientId) throw Object.assign(new Error('400 Bad Request: Select an authorized patient before requesting clinical records. A doctor account is not a patient account.'), { statusCode: 400 });
  await authorizeClinicalPatient(user, patientId, db);
  return patientId;
}

export async function resolveBookingPatient(requestedId: string | undefined, user: AuthUser, db: HospitalDatabase): Promise<string> {
  const patientId = requestedId ?? user.patientId;
  if (!patientId) throw Object.assign(new Error('400 Bad Request: Select a patient before booking. Personal appointments require a linked patient profile.'), { statusCode: 400 });
  await authorizeCarePatient(user, patientId, db);
  return patientId;
}
