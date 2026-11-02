import { AppointmentStatus, Prisma } from '@prisma/client';
import { HospitalDatabase } from './security.js';
import { hospitalDate, hospitalTimezone, localTimeToUtc } from './time.js';

export const activeAppointmentStatuses: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'];

/** Both doctors and patients are exclusive scheduling resources; lock them in a consistent order. */
export async function lockAppointmentParticipants(doctorId: string, patientId: string, tx: Prisma.TransactionClient): Promise<void> {
  for (const key of [`doctor:${doctorId}`, `patient:${patientId}`].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

export async function validatePatientSlot(patientId: string, startTime: Date, endTime: Date, excludedAppointmentId: string | undefined, tx: Prisma.TransactionClient): Promise<void> {
  const conflict = await tx.appointment.findFirst({ where: {
    patientId, id: excludedAppointmentId ? { not: excludedAppointmentId } : undefined,
    status: { in: activeAppointmentStatuses }, startTime: { lt: endTime }, endTime: { gt: startTime },
  }, select: { id: true } });
  if (conflict) throw Object.assign(new Error('This patient already has an active overlapping appointment. Select another time.'), { statusCode: 409 });
}

export async function availableDoctorSlots(doctorId: string, date: string, excludedAppointmentId: string | undefined, db: HospitalDatabase): Promise<string[]> {
  const zone = hospitalTimezone();
  const dayStart = localTimeToUtc(date, '00:00', zone);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const doctor = await db.doctor.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!doctor) throw Object.assign(new Error(`Doctor not found: ${doctorId}`), { statusCode: 404 });
  const availability = await db.doctorAvailability.findMany({ where: { doctorId, dayOfWeek: weekday } });
  const appointments = await db.appointment.findMany({
    where: { doctorId, id: excludedAppointmentId ? { not: excludedAppointmentId } : undefined, status: { in: activeAppointmentStatuses }, endTime: { gt: dayStart } },
    select: { startTime: true, endTime: true },
  });
  const blocked = await db.doctorUnavailablePeriod.findMany({ where: { doctorId, endTime: { gt: dayStart } }, select: { startTime: true, endTime: true } });
  const now = Date.now();
  return [...new Set(availability.flatMap((window) => {
    if (window.slotMinutes <= 0) throw new Error(`Invalid slot length for doctor availability ${window.id}.`);
    const start = localTimeToUtc(date, window.startTime, zone).getTime();
    const end = localTimeToUtc(date, window.endTime, zone).getTime();
    if (end <= start) throw new Error(`Invalid availability window ${window.id}: end must be after start.`);
    const slots: string[] = [];
    const step = window.slotMinutes * 60000;
    for (let slot = start; slot + step <= end; slot += step) {
      if (slot <= now) continue;
      if ([...appointments, ...blocked].some((period) => period.startTime.getTime() < slot + step && period.endTime.getTime() > slot)) continue;
      slots.push(new Date(slot).toISOString());
    }
    return slots;
  }))].sort();
}

/** The caller must hold the doctor's transaction lock until its write commits. */
export async function validateBookingSlot(doctorId: string, start: Date, excludedAppointmentId: string | undefined, tx: Prisma.TransactionClient): Promise<Date> {
  if (start.getTime() <= Date.now()) throw Object.assign(new Error('Past appointments cannot be booked. Select a future hospital time.'), { statusCode: 400 });
  const slots = await availableDoctorSlots(doctorId, hospitalDate(start), excludedAppointmentId, tx);
  if (!slots.includes(start.toISOString())) throw Object.assign(new Error('Selected slot is unavailable: it is booked, blocked for leave, or outside the doctor schedule. Refresh available times.'), { statusCode: 409 });
  const windows = await tx.doctorAvailability.findMany({ where: { doctorId, dayOfWeek: new Date(`${hospitalDate(start)}T00:00:00Z`).getUTCDay() } });
  const window = windows.find((candidate) => {
    const first = localTimeToUtc(hospitalDate(start), candidate.startTime, hospitalTimezone()).getTime();
    const last = localTimeToUtc(hospitalDate(start), candidate.endTime, hospitalTimezone()).getTime();
    return start.getTime() >= first && start.getTime() + candidate.slotMinutes * 60000 <= last && (start.getTime() - first) % (candidate.slotMinutes * 60000) === 0;
  });
  if (!window) throw new Error('Slot validation failed: availability changed within the booking transaction.');
  return new Date(start.getTime() + window.slotMinutes * 60000);
}
