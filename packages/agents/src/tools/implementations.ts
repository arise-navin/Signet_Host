import { authorizedTicketWhere, readAuthorizedTicket } from '../tickets.js';
import { appointmentScope, appointmentScopeWhere, personalAppointmentScope, authorizeAppointment } from '../appointmentAccess.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authorizeCarePatient, authorizeClinicalPatient, resolveClinicalPatient, resolveBookingPatient, careRelationshipFilter } from '../security.js';
import { lockAppointmentParticipants, validatePatientSlot, availableDoctorSlots, validateBookingSlot, activeAppointmentStatuses } from '../scheduling.js';
import { formatHospitalTime, hospitalTimezone, hospitalDate, parseAppointmentTime } from '../time.js';
import { mutationKey, previousMutation, recordMutation } from '../idempotency.js';
import { Prisma, PrismaClient, AppointmentStatus, LabTestStatus, TicketStatus, TicketPriority } from '@prisma/client';
import { AGENT_IDS, RoleType } from '@hospital/shared';
import { RegisteredTool, ToolContext } from './ToolRegistry.js';

export const getAppointmentsTool: RegisteredTool<{ patientId?: string; scope?: 'personal'; fromTime?: string }> = {
  name: 'get_appointments',
  description: 'List real appointments and their IDs. Patients see only their appointments; doctors see only their own schedule.',
  schema: z.object({
    patientId: z.string().uuid().optional().describe('Optional patient UUID to filter appointments'),
    scope: z.literal('personal').optional().describe('Only for explicit personal patient appointments; omit for doctor professional schedule'),
    fromTime: z.string().datetime({ offset: true }).optional().describe('Earliest appointment time for upcoming requests'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (args, context, prisma) => {
    const { authUser } = context;
    if (authUser.role === 'PATIENT' && !authUser.patientId) {
      throw Object.assign(new Error('Patient session is missing its patient profile ID.'), { statusCode: 403 });
    }
    if (authUser.role === 'DOCTOR' && !authUser.doctorId) {
      throw Object.assign(new Error('Doctor session is missing its doctor profile ID.'), { statusCode: 403 });
    }
    if (authUser.role === 'PATIENT' && args.patientId && args.patientId !== authUser.patientId) {
      throw Object.assign(new Error('403 Forbidden: You can only view your own appointments.'), { statusCode: 403 });
    }
    if (args.scope === 'personal' && !authUser.patientId) {
      throw Object.assign(new Error('400 Bad Request: Personal appointments require a linked patient profile. This doctor account only has a professional schedule.'), { statusCode: 400 });
    }
    if (args.patientId) await authorizeCarePatient(authUser, args.patientId, prisma);
    const scope = args.scope === 'personal' ? personalAppointmentScope(authUser) : await appointmentScope(authUser, prisma);
    const where: Prisma.AppointmentWhereInput = {
      AND: [appointmentScopeWhere(scope), { patientId: args.patientId }],
      startTime: args.fromTime ? { gte: new Date(args.fromTime) } : undefined,
      status: args.fromTime ? { in: activeAppointmentStatuses } : undefined,
    };
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { include: { user: { select: { name: true } } } },
        doctor: { include: { user: { select: { name: true } }, department: true } },
      },
      orderBy: { startTime: 'desc' },
      take: 50,
    });
    return appointments.map((appointment) => ({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      patientName: appointment.patient.user.name,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctor.user.name,
      department: appointment.doctor.department.name,
      localStartTime: formatHospitalTime(appointment.startTime),
      timezone: hospitalTimezone(),
      startTime: appointment.startTime.toISOString(),
      endTime: appointment.endTime.toISOString(),
      status: appointment.status,
      reason: appointment.reason,
    }));
  },
};

export const appointmentDetailsSchema = z.object({
  appointmentId: z.string().uuid(), status: z.nativeEnum(AppointmentStatus),
  patientName: z.string(), doctorName: z.string(), startTime: z.string(),
  localStartTime: z.string(), reason: z.string().nullable(),
});

export const getAppointmentByIdTool: RegisteredTool<{ appointmentId: string }> = {
  name: 'get_appointment_by_id',
  description: 'Retrieve one exact PostgreSQL appointment by ID with independently enforced session authorization. Returns saved ID, status, patient, doctor, time and visit reason. IDs confer no permission.',
  schema: z.object({ appointmentId: z.string().uuid() }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (args, context, db) => {
    const scope = await appointmentScope(context.authUser, db);
    const appointment = await db.appointment.findFirst({
      where: { id: args.appointmentId, OR: [appointmentScopeWhere(scope), ...(context.authUser.patientId ? [{ patientId: context.authUser.patientId }] : [])] },
      select: { id: true, status: true, patientId: true, doctorId: true, startTime: true, endTime: true, reason: true, patient: { select: { user: { select: { name: true } } } }, doctor: { select: { user: { select: { name: true } } } } },
    });
    if (!appointment) {
      const exists = await db.appointment.findUnique({ where: { id: args.appointmentId }, select: { id: true } });
      if (exists) throw Object.assign(new Error('403 Forbidden: Appointment access denied.'), { statusCode: 403 });
      return null;
    }
    await authorizeAppointment(context.authUser, appointment, db);
    const duplicateActiveBookings = await db.appointment.count({ where: {
      id: { not: appointment.id }, patientId: appointment.patientId, doctorId: appointment.doctorId,
      status: { in: activeAppointmentStatuses }, startTime: { lt: appointment.endTime }, endTime: { gt: appointment.startTime },
    } });
    return { duplicateActiveBookings, appointmentId: appointment.id, status: appointment.status, patientId: appointment.patientId, patientName: appointment.patient.user.name, doctorId: appointment.doctorId, doctorName: appointment.doctor.user.name, startTime: appointment.startTime.toISOString(), endTime: appointment.endTime.toISOString(), localStartTime: formatHospitalTime(appointment.startTime), timezone: hospitalTimezone(), reason: appointment.reason };
  },
};

export const getDoctorsTool: RegisteredTool = {
  name: 'get_doctors',
  description: 'Search for hospital doctors by department name or medical specialization.',
  schema: z.object({
    name: z.string().min(2).optional().describe('Doctor name to search'),
    department: z.string().optional().describe('Department name such as Cardiology, Neurology, Pediatrics, Orthopedics, Oncology'),
    specialization: z.string().optional().describe('Medical specialization or keyword'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (args, context, prisma) => {
    const where: Prisma.DoctorWhereInput = {};
    if (args.name) where.user = { name: { contains: args.name, mode: 'insensitive' } };
    if (args.department) {
      where.department = {
        name: { contains: args.department, mode: 'insensitive' },
      };
    }
    if (args.specialization) {
      where.specialization = { contains: args.specialization, mode: 'insensitive' };
    }

    const doctors = await prisma.doctor.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        department: { select: { name: true, code: true } },
        availabilities: true,
      },
    });

    return doctors.map((d) => ({
      id: d.id,
      name: d.user.name,
      department: d.department.name,
      specialization: d.specialization,
      consultationFee: Number(d.consultationFee),
      licenseNumber: d.licenseNumber,
      availabilitySummary: d.availabilities.map((a) => `Day ${a.dayOfWeek}: ${a.startTime}-${a.endTime}`).join('; '),
    }));
  },
};

export const getAvailableSlotsTool: RegisteredTool = {
  name: 'get_available_slots',
  description: 'Retrieve open slots for a doctor and date. Supply startTime to verify that exact slot: OCCUPIED requires a database-confirmed active appointment; UNAVAILABLE does not imply occupancy.',
  schema: z.object({
    doctorId: z.string().uuid().optional().describe('Actual Doctor.id from get_doctors, never User.id'),
    doctorName: z.string().min(2).optional().describe('Exact doctor name from get_doctors; preferred over guessing an ID'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format'),
    startTime: z.string().datetime({ offset: true }).optional().describe('Exact requested slot timestamp with UTC offset; must match date in hospital timezone'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (args, context, prisma) => {
    const candidates = await prisma.doctor.findMany({ where: args.doctorName ? { user: { name: { equals: args.doctorName, mode: 'insensitive' } } } : { id: args.doctorId ?? '' }, include: { user: true, department: true } });
    if (candidates.length !== 1) throw Object.assign(new Error('Select exactly one doctor returned by get_doctors. Use the doctor profile ID or exact name, not an account ID.'), { statusCode: 400 });
    const doctor = candidates[0];
    if (args.doctorId && args.doctorName && args.doctorId !== doctor.id) throw Object.assign(new Error('Doctor ID and doctor name do not refer to the same verified doctor.'), { statusCode: 400 });
    const slots = await availableDoctorSlots(doctor.id, args.date, undefined, prisma);
    const requestedStart = args.startTime ? parseAppointmentTime(args.startTime) : undefined;
    if (requestedStart && hospitalDate(requestedStart) !== args.date) throw Object.assign(new Error('Requested startTime must fall on date in the hospital timezone.'), { statusCode: 400 });
    const occupied = requestedStart ? await prisma.appointment.findFirst({ where: { doctorId: doctor.id, status: { in: activeAppointmentStatuses }, startTime: { lte: requestedStart }, endTime: { gt: requestedStart } }, select: { id: true } }) : undefined;
    const requestedSlot = requestedStart ? { startTime: requestedStart.toISOString(), available: slots.includes(requestedStart.toISOString()), occupied: Boolean(occupied), status: occupied ? 'OCCUPIED' : slots.includes(requestedStart.toISOString()) ? 'AVAILABLE' : 'UNAVAILABLE' } : undefined;
    return {
      requestedSlot,
      doctorId: doctor.id, doctorName: doctor.user.name, department: doctor.department.name,
      date: args.date, timezone: hospitalTimezone(), totalAvailable: slots.length,
      availableSlots: slots,
      localSlots: slots.map((slot) => ({ startTime: slot, localTime: formatHospitalTime(new Date(slot)) })),
    };
  },
};

export const bookingArgumentsSchema = z.object({
  doctorId: z.string().uuid(),
  startTime: z.string().min(1),
  reason: z.string().trim().min(3),
  patientId: z.string().uuid().optional(),
});

export const validateAppointmentBookingTool: RegisteredTool<z.infer<typeof bookingArgumentsSchema>> = {
  name: 'validate_appointment_booking',
  description: 'Read-only pre-booking authorization, timezone, reason and availability checks. Never creates an appointment.',
  schema: bookingArgumentsSchema,
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (args, context, db) => {
    const patientId = await resolveBookingPatient(args.patientId, context.authUser, db);
    await authorizeAppointment(context.authUser, { patientId, doctorId: args.doctorId }, db);
    const startTime = parseAppointmentTime(args.startTime);
    const endTime = await validateBookingSlot(args.doctorId, startTime, undefined, db);
    await validatePatientSlot(patientId, startTime, endTime, undefined, db);
    return { patientId, doctorId: args.doctorId, startTime: startTime.toISOString(), reason: args.reason, timezone: hospitalTimezone(), status: 'READY' };
  },
};

export const getBookingAttemptTool: RegisteredTool<Record<string, never>> = {
  name: 'get_booking_attempt',
  description: 'Retrieve the exact last booking outcome in this authenticated conversation. A rejected booking has no appointment ID; never substitute unrelated appointments.',
  schema: z.object({}),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (_args, context, db) => {
    if (!context.conversationId) throw Object.assign(new Error('A conversation is required to retrieve a booking attempt.'), { statusCode: 400 });
    const attempt = await db.toolExecution.findFirst({ where: { execution: { conversationId: context.conversationId, userId: context.authUser.id }, OR: [{ toolName: 'book_appointment' }, { toolName: 'validate_appointment_booking', success: false }] }, orderBy: { createdAt: 'desc' } });
    if (!attempt) return { response: 'No booking attempt was found in this conversation. Provide the patient, doctor, date and time, or return to the original conversation. No appointment creation can be confirmed.' };
    if (!attempt.success) return { response: `No appointment was created by the requested booking attempt. ${attempt.error} There is no appointment ID for this failed attempt.` };
    const receipt = z.object({ appointmentId: z.string().uuid() }).parse(JSON.parse(attempt.result!));
    const appointment = await db.appointment.findUniqueOrThrow({ where: { id: receipt.appointmentId } });
    await authorizeAppointment(context.authUser, appointment, db);
    await authorizeCarePatient(context.authUser, appointment.patientId, db);
    return { response: `**Appointment ID:** \`${appointment.id}\`\n\n**Status:** ${appointment.status}\n\n**Time:** ${formatHospitalTime(appointment.startTime)}`, appointmentId: appointment.id };
  },
};

export const bookAppointmentTool: RegisteredTool = {
  name: 'book_appointment',
  description: 'Book an appointment after independent backend patient-relationship and scheduling authorization. Supplied IDs identify records only and confer no permission.',
  schema: bookingArgumentsSchema,
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (args, context, prisma) => {
    const patientId = await resolveBookingPatient(args.patientId, context.authUser, prisma);
    await authorizeAppointment(context.authUser, { patientId, doctorId: args.doctorId }, prisma);
    const startTime = parseAppointmentTime(args.startTime);
    const key = mutationKey(context.authUser.id, 'book_appointment', context.requestId, JSON.stringify([patientId, args.doctorId, startTime.toISOString(), args.reason]));
    const appointment = await prisma.$transaction(async (tx) => {
      await resolveBookingPatient(patientId, context.authUser, tx);
      await authorizeAppointment(context.authUser, { patientId, doctorId: args.doctorId }, tx);
      const previousId = await previousMutation(key, context.requestId ? undefined : new Date(Date.now() - 300000), tx);
      if (previousId) {
        const previous = await tx.appointment.findUniqueOrThrow({ where: { id: previousId }, include: { doctor: { include: { user: true, department: true } }, patient: { include: { user: true } } } });
        if (previous.patientId !== patientId || previous.doctorId !== args.doctorId || previous.startTime.getTime() !== startTime.getTime() || previous.reason !== args.reason) throw Object.assign(new Error('Idempotency key was already used for another appointment request.'), { statusCode: 409 });
        return previous;
      }
      await lockAppointmentParticipants(args.doctorId, patientId, tx);
      const endTime = await validateBookingSlot(args.doctorId, startTime, undefined, tx);
      await validatePatientSlot(patientId, startTime, endTime, undefined, tx);
      const created = await tx.appointment.create({
        data: { patientId, doctorId: args.doctorId, startTime, endTime, status: AppointmentStatus.SCHEDULED, reason: args.reason, notes: 'Booked via Hospital AI Lab' },
        include: { doctor: { include: { user: true, department: true } }, patient: { include: { user: true } } },
      });
      await recordMutation(key, context.authUser.id, 'Appointment', created.id, tx);
      await tx.auditLog.create({ data: { userId: context.authUser.id, action: 'BOOK_APPOINTMENT', resource: 'Appointment', resourceId: created.id } });
      return created;
    });
    return {
      appointmentId: appointment.id, patientName: appointment.patient.user.name, doctorName: appointment.doctor.user.name,
      department: appointment.doctor.department.name, startTime: appointment.startTime.toISOString(), endTime: appointment.endTime.toISOString(),
      localStartTime: formatHospitalTime(appointment.startTime), timezone: hospitalTimezone(), status: appointment.status,
      message: `Appointment booked with ${appointment.doctor.user.name} for ${formatHospitalTime(appointment.startTime)}.`,
    };
  },
};

export const rescheduleAppointmentTool: RegisteredTool = {
  name: 'reschedule_appointment',
  description: 'Reschedule an existing appointment to a new date and time.',
  schema: z.object({
    appointmentId: z.string().uuid().describe('Appointment UUID'),
    newStartTime: z.string().describe('New ISO 8601 appointment start time'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (args, context, prisma) => {
    const appt = await prisma.appointment.findUnique({ where: { id: args.appointmentId } });
    if (!appt) throw Object.assign(new Error('Appointment not found.'), { statusCode: 404 });
    await authorizeAppointment(context.authUser, appt, prisma);
    const startTime = parseAppointmentTime(args.newStartTime);
    return prisma.$transaction(async (tx) => {
      await lockAppointmentParticipants(appt.doctorId, appt.patientId, tx);
      const current = await tx.appointment.findUniqueOrThrow({ where: { id: appt.id } });
      if (!activeAppointmentStatuses.includes(current.status)) throw Object.assign(new Error('Only active appointments can be rescheduled.'), { statusCode: 409 });
      const endTime = await validateBookingSlot(appt.doctorId, startTime, appt.id, tx);
      await validatePatientSlot(appt.patientId, startTime, endTime, appt.id, tx);
      const updated = await tx.appointment.update({ where: { id: appt.id }, data: { startTime, endTime, status: AppointmentStatus.RESCHEDULED } });
      await tx.auditLog.create({ data: { userId: context.authUser.id, action: 'RESCHEDULE_APPOINTMENT', resource: 'Appointment', resourceId: appt.id } });
      return { appointmentId: updated.id, newStartTime: updated.startTime.toISOString(), status: updated.status, timezone: hospitalTimezone(), message: `Appointment rescheduled to ${formatHospitalTime(updated.startTime)}.` };
    });
  },
};

export const cancelAppointmentTool: RegisteredTool = {
  name: 'cancel_appointment',
  description: 'Cancel an existing hospital appointment.',
  schema: z.object({
    appointmentId: z.string().uuid().describe('Appointment UUID'),
    reason: z.string().optional().describe('Reason for cancellation'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.APPOINTMENT],
  execute: async (args, context, prisma) => {
    const appt = await prisma.appointment.findUnique({
      where: { id: args.appointmentId },
    });
    if (!appt) {
      throw Object.assign(new Error(`Appointment not found: ${args.appointmentId}`), { statusCode: 404 });
    }

    await authorizeAppointment(context.authUser, appt, prisma);

    const updated = await prisma.appointment.update({
      where: { id: args.appointmentId },
      data: {
        status: AppointmentStatus.CANCELLED,
        notes: `Cancelled: ${args.reason || 'Requested by user'}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: context.authUser.id,
        action: 'CANCEL_APPOINTMENT',
        resource: 'Appointment',
        resourceId: updated.id,
        details: JSON.stringify({ reason: args.reason }),
      },
    });

    return {
      appointmentId: updated.id,
      status: updated.status,
      message: 'Appointment was successfully cancelled.',
    };
  },
};

// ==========================================
// 2. PATIENT RECORDS AGENT TOOLS
// ==========================================

export const getPatientProfileTool: RegisteredTool = {
  name: 'get_patient_profile',
  description: 'Retrieve authorized patient clinical demographics, MRN, allergies, and chronic conditions.',
  schema: z.object({
    patientId: z.string().uuid().optional().describe('Patient UUID (enforced to own record for patients)'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'ADMIN'],
  allowedAgents: [AGENT_IDS.RECORDS],
  execute: async (args, context, prisma) => {
    const patientId = await resolveClinicalPatient(args.patientId, context.authUser, prisma);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!patient) {
      throw new Error(`Patient profile not found for ID: ${patientId}`);
    }

    return {
      patientId: patient.id,
      mrn: patient.mrn,
      name: patient.user.name,
      dateOfBirth: patient.dateOfBirth.toISOString().split('T')[0],
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      emergencyContact: patient.emergencyContact,
    };
  },
};

export const getMedicalHistoryTool: RegisteredTool = {
  name: 'get_medical_history',
  description: 'Retrieve authorized patient clinical history notes and diagnostic assessments.',
  schema: z.object({
    patientId: z.string().uuid().optional().describe('Patient UUID'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'ADMIN'],
  allowedAgents: [AGENT_IDS.RECORDS],
  execute: async (args, context, prisma) => {
    const patientId = await resolveClinicalPatient(args.patientId, context.authUser, prisma);

    const records = await prisma.medicalRecord.findMany({
      where: { patientId },
      include: {
        doctor: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => ({
      recordId: r.id,
      recordType: r.recordType,
      title: r.title,
      content: r.content,
      doctorName: r.doctor?.user.name || 'Hospital Clinical Staff',
      date: r.createdAt.toISOString().split('T')[0],
    }));
  },
};

export const getVisitSummaryTool: RegisteredTool = {
  name: 'get_visit_summary',
  description: 'Retrieve past hospital visit summaries, recorded vitals, and physician diagnoses.',
  schema: z.object({
    visitId: z.string().uuid().optional().describe('Specific visit UUID'),
    patientId: z.string().uuid().optional().describe('Patient UUID'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'ADMIN'],
  allowedAgents: [AGENT_IDS.RECORDS],
  execute: async (args, context, prisma) => {
    const patientId = await resolveClinicalPatient(args.patientId, context.authUser, prisma);

    const where: any = { patientId };
    if (args.visitId) {
      where.id = args.visitId;
    }

    const visits = await prisma.patientVisit.findMany({
      where,
      include: {
        doctor: { include: { user: { select: { name: true } }, department: { select: { name: true } } } },
      },
      orderBy: { visitDate: 'desc' },
      take: 5,
    });

    return visits.map((v) => ({
      visitId: v.id,
      visitDate: v.visitDate.toISOString().split('T')[0],
      doctorName: v.doctor.user.name,
      department: v.doctor.department.name,
      summary: v.summary,
      vitals: v.vitals ? JSON.parse(v.vitals) : null,
      diagnosis: v.diagnosis,
    }));
  },
};

export const getPrescriptionsTool: RegisteredTool = {
  name: 'get_prescriptions',
  description: 'Retrieve authorized patient prescriptions, medications, dosages, and instructions.',
  schema: z.object({
    patientId: z.string().uuid().optional().describe('Patient UUID'),
    activeOnly: z.boolean().optional().default(true).describe('Filter to active prescriptions only'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'ADMIN'],
  allowedAgents: [AGENT_IDS.RECORDS],
  execute: async (args, context, prisma) => {
    const patientId = await resolveClinicalPatient(args.patientId, context.authUser, prisma);

    const where: any = { patientId };
    if (args.activeOnly) {
      where.active = true;
    }

    const prescriptions = await prisma.prescription.findMany({
      where,
      include: {
        doctor: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return prescriptions.map((p) => ({
      prescriptionId: p.id,
      medication: p.medication,
      dosage: p.dosage,
      frequency: p.frequency,
      instructions: p.instructions,
      prescribedBy: p.doctor.user.name,
      startDate: p.startDate.toISOString().split('T')[0],
      endDate: p.endDate ? p.endDate.toISOString().split('T')[0] : null,
      active: p.active,
    }));
  },
};

// ==========================================
// 3. LAB REPORT AGENT TOOLS
// ==========================================

export const getLabStatusTool: RegisteredTool = {
  name: 'get_lab_status',
  description: 'Check status of ordered diagnostic lab tests for the authenticated patient.',
  schema: z.object({
    patientId: z.string().uuid().optional().describe('Patient UUID'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'ADMIN'],
  allowedAgents: [AGENT_IDS.LAB],
  execute: async (args, context, prisma) => {
    const patientId = await resolveClinicalPatient(args.patientId, context.authUser, prisma);

    const reports = await prisma.labReport.findMany({
      where: { patientId },
      include: { labTest: true },
      orderBy: { orderedAt: 'desc' },
      take: 10,
    });

    return reports.map((r) => ({
      reportId: r.id,
      testCode: r.labTest.code,
      testName: r.labTest.name,
      category: r.labTest.category,
      status: r.status,
      orderedAt: r.orderedAt.toISOString().split('T')[0],
      completedAt: r.completedAt ? r.completedAt.toISOString().split('T')[0] : null,
    }));
  },
};

export const getLabReportTool: RegisteredTool = {
  name: 'get_lab_report',
  description: 'Retrieve full details and synthetic biomarker values of a specific lab report.',
  schema: z.object({
    reportId: z.string().uuid().describe('Lab report UUID'),
    patientId: z.string().uuid().optional().describe('Patient UUID for validation'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'ADMIN'],
  allowedAgents: [AGENT_IDS.LAB],
  execute: async (args, context, prisma) => {
    const owner = await prisma.labReport.findUnique({ where: { id: args.reportId }, select: { patientId: true } });
    if (!owner) throw Object.assign(new Error('Lab report not found.'), { statusCode: 404 });
    await authorizeClinicalPatient(context.authUser, owner.patientId, prisma);
    if (args.patientId && args.patientId !== owner.patientId) throw Object.assign(new Error('403 Forbidden: Report does not belong to the selected patient.'), { statusCode: 403 });
    const report = await prisma.labReport.findUniqueOrThrow({ where: { id: args.reportId }, include: { labTest: true, reviewedBy: { include: { user: { select: { name: true } } } } } });

    return {
      reportId: report.id,
      testName: report.labTest.name,
      testCode: report.labTest.code,
      category: report.labTest.category,
      status: report.status,
      normalRange: report.labTest.normalRange,
      resultValues: JSON.parse(report.resultValues),
      clinicalSummary: report.clinicalSummary,
      reviewedByDoctor: report.reviewedBy?.user.name || null,
      orderedAt: report.orderedAt.toISOString().split('T')[0],
      completedAt: report.completedAt ? report.completedAt.toISOString().split('T')[0] : null,
      disclaimer: 'SYNTHETIC DATA NOTICE: Lab values are synthetic demonstrations and not intended for clinical self-diagnosis.',
    };
  },
};

export const getLabTestsTool: RegisteredTool = {
  name: 'get_lab_tests',
  description: 'List standard lab diagnostic panels offered by the hospital.',
  schema: z.object({}),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.LAB],
  execute: async (args, context, prisma) => {
    const tests = await prisma.labTest.findMany();
    return tests.map((t) => ({
      code: t.code,
      name: t.name,
      category: t.category,
      normalRange: t.normalRange,
      description: t.description,
    }));
  },
};

export const requestDoctorReviewTool: RegisteredTool = {
  name: 'request_doctor_review',
  description: 'Submit an electronic request for a physician to review a completed lab report.',
  schema: z.object({
    reportId: z.string().uuid().describe('Lab report UUID'),
    reason: z.string().min(5).describe('Reason for requesting physician review'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'ADMIN'],
  allowedAgents: [AGENT_IDS.LAB],
  execute: async (args, context, prisma) => {
    const owner = await prisma.labReport.findUnique({ where: { id: args.reportId }, select: { patientId: true } });
    if (!owner) throw Object.assign(new Error('Lab report not found.'), { statusCode: 404 });
    await authorizeClinicalPatient(context.authUser, owner.patientId, prisma);
    const report = await prisma.labReport.findUniqueOrThrow({ where: { id: args.reportId }, include: { labTest: true } });

    const updated = await prisma.labReport.update({
      where: { id: args.reportId },
      data: {
        status: LabTestStatus.REVIEW_REQUESTED,
        doctorNotes: `Clinician review requested by ${context.authUser.name}: ${args.reason}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: context.authUser.id,
        action: 'REQUEST_LAB_REVIEW',
        resource: 'LabReport',
        resourceId: report.id,
        details: JSON.stringify({ reason: args.reason }),
      },
    });

    return {
      reportId: updated.id,
      status: updated.status,
      message: `A clinician review request has been logged for test ${report.labTest.name}. An attending doctor will review the findings.`,
    };
  },
};

// ==========================================
// 4. CARE COORDINATOR AGENT TOOLS
// ==========================================

export const searchHospitalFaqTool: RegisteredTool = {
  name: 'search_hospital_faq',
  description: 'Search official hospital information, visiting hours, parking, cafeteria, insurance, and department locations.',
  schema: z.object({
    query: z.string().describe('Search topic or question'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.CARE],
  execute: async (args, context, prisma) => {
    const faqs = [
      {
        topic: 'Visiting Hours',
        content: 'General inpatient visiting hours are 08:00 AM to 08:00 PM daily. Intensive Care Unit (ICU) visiting hours are 10:00 AM - 12:00 PM and 05:00 PM - 07:00 PM.',
      },
      {
        topic: 'Emergency Services',
        content: 'Emergency Department is open 24/7/365 at the North Wing ground floor. Direct emergency ambulance hotline: 555-0911.',
      },
      {
        topic: 'Parking',
        content: 'Patient and visitor parking is available in Garage A (Main Entrance) and Garage B (Emergency). First 2 hours are complimentary. Valet service is available at Main Entrance 07:00 - 19:00.',
      },
      {
        topic: 'Insurance and Billing',
        content: 'We accept Medicare, Blue Cross Blue Shield, Aetna, Cigna, and UnitedHealthcare. Financial counselors are available Monday-Friday 08:00-17:00.',
      },
      {
        topic: 'Pharmacy and Cafeteria',
        content: 'Hospital Outpatient Pharmacy is located in the Central Atrium, open 08:00 - 20:00. The Garden Terrace Cafeteria operates 06:30 - 21:00.',
      },
      {
        topic: 'Medical Records Requests',
        content: 'Patients can view their records in the Hospital Portal or contact the Health Information Management (HIM) department at ext. 4200.',
      },
    ];

    const q = args.query.toLowerCase();
    const matches = faqs.filter((f) => f.topic.toLowerCase().includes(q) || f.content.toLowerCase().includes(q));

    return {
      query: args.query,
      results: matches.length > 0 ? matches : faqs.slice(0, 3),
    };
  },
};

export const getSupportTicketTool: RegisteredTool<{ ticketId: string }> = {
  name: 'get_support_ticket',
  description: 'Read an existing support ticket by its exact database ticket ID. Never creates a ticket.',
  schema: z.object({ ticketId: z.string().uuid() }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.CARE],
  execute: async (args, context, db) => readAuthorizedTicket(args.ticketId, context.authUser, db),
};

export const listMySupportTicketsTool: RegisteredTool<{ page?: number }> = {
  name: 'list_my_support_tickets',
  description: 'List existing support tickets owned by you or explicitly assigned to your staff account, newest first. Read-only.',
  schema: z.object({ page: z.number().int().min(1).optional() }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.CARE],
  execute: async (args, context, db) => {
    const tickets = await db.supportTicket.findMany({ where: authorizedTicketWhere(context.authUser), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 25, skip: ((args.page ?? 1) - 1) * 25, select: { id: true } });
    return Promise.all(tickets.map((ticket) => readAuthorizedTicket(ticket.id, context.authUser, db)));
  },
};

export const listAuthorizedPatientsTool: RegisteredTool<{ search?: string }> = {
  name: 'list_authorized_patients',
  description: 'List patients assigned to the authenticated doctor through verified appointments or visits. Resolve patient names using search, and select a returned patientId before booking or requesting clinical records. IDs alone confer no permission.',
  schema: z.object({ search: z.string().min(1).optional() }),
  allowedRoles: ['DOCTOR'],
  allowedAgents: [AGENT_IDS.APPOINTMENT, AGENT_IDS.RECORDS, AGENT_IDS.LAB],
  execute: async (args, context, db) => {
    if (!context.authUser.doctorId) throw Object.assign(new Error('403 Forbidden: A linked doctor profile is required.'), { statusCode: 403 });
    const patients = await db.patient.findMany({ where: { AND: [careRelationshipFilter(context.authUser.doctorId), ...(args.search ? [{ user: { name: { contains: args.search, mode: 'insensitive' as const } } }] : [])] }, select: { id: true, user: { select: { name: true } } }, orderBy: { id: 'asc' }, take: 50 });
    return patients.map((patient) => ({ patientId: patient.id, name: patient.user.name }));
  },
};

export const createSupportTicketTool: RegisteredTool = {
  name: 'create_support_ticket',
  description: 'Create an official hospital patient support or inquiry ticket.',
  schema: z.object({
    appointmentId: z.string().uuid().optional().describe('Selected authorized appointment UUID, required for appointment-linked support; omit for APPOINTMENT_ASSISTANCE'),
    category: z.string().describe('Ticket category e.g. Billing, Navigation, Technical, General Inquiry'),
    subject: z.string().min(5).describe('Brief subject line'),
    description: z.string().min(10).describe('Detailed problem description'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.CARE],
  execute: async (args, context, prisma) => {
    if (/appointment/i.test(args.category) && args.category !== 'APPOINTMENT_ASSISTANCE' && !args.appointmentId) throw Object.assign(new Error('Select an appointment before creating an appointment support ticket.'), { statusCode: 400 });
    let patientId = context.authUser.patientId ?? null;
    if (args.appointmentId) {
      const appointment = await prisma.appointment.findUnique({ where: { id: args.appointmentId } });
      if (!appointment) throw Object.assign(new Error('The selected appointment was not found.'), { statusCode: 404 });
      await authorizeAppointment(context.authUser, appointment, prisma);
      if (appointment.startTime.getTime() <= Date.now() || !activeAppointmentStatuses.includes(appointment.status)) throw Object.assign(new Error('Select an active upcoming appointment before creating this ticket.'), { statusCode: 409 });
      patientId = appointment.patientId;
    }
    const ticketNumber = `TICK-${randomUUID()}`;

    const priorityMap: Record<string, TicketPriority> = {
      LOW: TicketPriority.LOW,
      MEDIUM: TicketPriority.MEDIUM,
      HIGH: TicketPriority.HIGH,
      URGENT: TicketPriority.URGENT,
    };

    const key = mutationKey(context.authUser.id, 'create_support_ticket', context.ticketOperationId ?? context.requestId, JSON.stringify(args));
    const contentKey = mutationKey(context.authUser.id, 'create_support_ticket', undefined, JSON.stringify([args.appointmentId ?? null, context.intentKey ?? args]));
    const ticket = await prisma.$transaction(async (tx) => {
      const previousId = await previousMutation(key, context.requestId ? undefined : new Date(Date.now() - 300000), tx);
      const recentId = await previousMutation(contentKey, new Date(Date.now() - 300000), tx);
      const resultId = previousId ?? recentId;
      if (resultId) {
        if (!previousId && key !== contentKey) await recordMutation(key, context.authUser.id, 'SupportTicket', resultId, tx);
        const previous = await tx.supportTicket.findUniqueOrThrow({ where: { id: resultId } });
        if (previous.appointmentId !== (args.appointmentId ?? null)) throw Object.assign(new Error('Ticket request reference was already used for a different appointment.'), { statusCode: 409 });
        return previous;
      }
      const created = await tx.supportTicket.create({
        data: {
          ticketNumber,
          patientId,
          appointmentId: args.appointmentId,
          createdById: context.authUser.id,
          category: args.category,
          subject: args.subject,
          description: args.description,
          priority: priorityMap[args.priority || 'MEDIUM'] || TicketPriority.MEDIUM,
          status: TicketStatus.OPEN,
        },
      });
      await tx.auditLog.create({ data: { userId: context.authUser.id, action: 'CREATE_SUPPORT_TICKET', resource: 'SupportTicket', resourceId: created.id, details: JSON.stringify({ ticketNumber: created.ticketNumber, category: args.category }) } });
      await recordMutation(key, context.authUser.id, 'SupportTicket', created.id, tx);
      if (key !== contentKey) await recordMutation(contentKey, context.authUser.id, 'SupportTicket', created.id, tx);
      return created;
    });

    return {
      ticketId: ticket.id,
      appointmentId: ticket.appointmentId,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      priority: ticket.priority,
      message: `Support ticket ${ticket.ticketNumber} created successfully. Our care team will respond shortly.`,
    };
  },
};

export const createFollowupRequestTool: RegisteredTool = {
  name: 'create_followup_request',
  description: 'Schedule a care coordination follow-up request regarding an existing care plan or appointment.',
  schema: z.object({
    appointmentId: z.string().uuid().optional().describe('Related appointment UUID'),
    notes: z.string().min(5).describe('Follow-up care notes'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.CARE],
  execute: async (args, context, prisma) => {
    const count = await prisma.supportTicket.count();
    if (args.appointmentId) {
      const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: args.appointmentId } });
      await authorizeAppointment(context.authUser, appointment, prisma);
    }
    const ticketNumber = `FOL-2026-${String(4001 + count).padStart(5, '0')}`;

    const key = mutationKey(context.authUser.id, 'create_followup_request', context.requestId, JSON.stringify(args));
    const contentKey = mutationKey(context.authUser.id, 'create_followup_request', undefined, context.intentKey ?? JSON.stringify(args));
    const ticket = await prisma.$transaction(async (tx) => {
      const previousId = await previousMutation(key, context.requestId ? undefined : new Date(Date.now() - 300000), tx);
      const recentId = await previousMutation(contentKey, new Date(Date.now() - 300000), tx);
      const resultId = previousId ?? recentId;
      if (resultId) {
        if (!previousId && key !== contentKey) await recordMutation(key, context.authUser.id, 'SupportTicket', resultId, tx);
        return tx.supportTicket.findUniqueOrThrow({ where: { id: resultId } });
      }
      const created = await tx.supportTicket.create({
        data: {
          ticketNumber,
          patientId: context.authUser.patientId || null,
          createdById: context.authUser.id,
          category: 'Care Coordination Follow-up',
          subject: `Follow-up Care Request: ${args.notes.slice(0, 40)}...`,
          description: `Follow-up coordinator request. Notes: ${args.notes}. Linked appointment: ${args.appointmentId || 'None'}`,
          status: TicketStatus.OPEN,
          priority: TicketPriority.MEDIUM,
        },
      });
      await recordMutation(key, context.authUser.id, 'SupportTicket', created.id, tx);
      if (key !== contentKey) await recordMutation(contentKey, context.authUser.id, 'SupportTicket', created.id, tx);
      return created;
    });

    return {
      referenceNumber: ticket.ticketNumber,
      status: 'LOGGED',
      message: `Follow-up request ${ticket.ticketNumber} logged for the clinical care team.`,
    };
  },
};

export const requestStaffAssistanceTool: RegisteredTool = {
  name: 'request_staff_assistance',
  description: 'Escalate a patient request directly to live hospital nursing or administrative staff.',
  schema: z.object({
    urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).describe('Level of urgency'),
    reason: z.string().min(5).describe('Reason patient needs human assistance'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.CARE],
  execute: async (args, context, prisma) => {
    const ticketNumber = `ESC-${randomUUID()}`;

    const priority = args.urgency === 'EMERGENCY' ? TicketPriority.URGENT : args.urgency === 'URGENT' ? TicketPriority.HIGH : TicketPriority.MEDIUM;

    const key = mutationKey(context.authUser.id, 'request_staff_assistance', context.requestId, JSON.stringify(args));
    const contentKey = mutationKey(context.authUser.id, 'request_staff_assistance', undefined, context.intentKey ?? JSON.stringify(args));
    const ticket = await prisma.$transaction(async (tx) => {
      const previousId = await previousMutation(key, context.requestId ? undefined : new Date(Date.now() - 300000), tx);
      const recentId = await previousMutation(contentKey, new Date(Date.now() - 300000), tx);
      const resultId = previousId ?? recentId;
      if (resultId) {
        if (!previousId && key !== contentKey) await recordMutation(key, context.authUser.id, 'SupportTicket', resultId, tx);
        return tx.supportTicket.findUniqueOrThrow({ where: { id: resultId } });
      }
      const created = await tx.supportTicket.create({
        data: {
          ticketNumber,
          patientId: context.authUser.patientId || null,
          createdById: context.authUser.id,
          category: 'Live Staff Escalation',
          subject: `[${args.urgency}] Staff Escalation: ${args.reason.slice(0, 40)}`,
          description: `Patient requested live staff assistance. Urgency: ${args.urgency}. Reason: ${args.reason}`,
          priority,
          status: TicketStatus.OPEN,
        },
      });
      await recordMutation(key, context.authUser.id, 'SupportTicket', created.id, tx);
      if (key !== contentKey) await recordMutation(contentKey, context.authUser.id, 'SupportTicket', created.id, tx);
      return created;
    });

    return {
      escalationId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      urgency: args.urgency,
      message: `Live staff escalation recorded under ${ticket.ticketNumber}. A hospital staff member will connect with you. If this is a medical emergency, call 911 immediately.`,
    };
  },
};

export const transferToAgentTool: RegisteredTool = {
  name: 'transfer_to_agent',
  description: 'Hand off the conversation to another specialized hospital agent (appointment-agent, records-agent, lab-agent, care-agent).',
  schema: z.object({
    targetAgentId: z.enum([AGENT_IDS.APPOINTMENT, AGENT_IDS.RECORDS, AGENT_IDS.LAB, AGENT_IDS.CARE]).describe('Target agent ID to transfer to'),
    reason: z.string().describe('Reason for agent handoff'),
    initialMessage: z.string().optional().describe('Message to pass forward to the target agent'),
  }),
  allowedRoles: ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'],
  allowedAgents: [AGENT_IDS.CARE, AGENT_IDS.APPOINTMENT, AGENT_IDS.RECORDS, AGENT_IDS.LAB],
  execute: async (args, context, prisma) => {
    if (args.targetAgentId === context.agentId) {
      throw new Error(`Cannot transfer to the same agent (${context.agentId}).`);
    }

    return {
      isHandoff: true,
      targetAgentId: args.targetAgentId,
      reason: args.reason,
      initialMessage: args.initialMessage,
      message: `Handing off your request to the ${args.targetAgentId} to assist you with ${args.reason}...`,
    };
  },
};

export const ALL_TOOLS: RegisteredTool[] = [
  getAppointmentsTool,
  getAppointmentByIdTool,
  getDoctorsTool,
  getAvailableSlotsTool,
  bookAppointmentTool,
  validateAppointmentBookingTool,
  getBookingAttemptTool,
  rescheduleAppointmentTool,
  cancelAppointmentTool,
  getPatientProfileTool,
  getMedicalHistoryTool,
  getVisitSummaryTool,
  getPrescriptionsTool,
  getLabStatusTool,
  getLabReportTool,
  getLabTestsTool,
  requestDoctorReviewTool,
  searchHospitalFaqTool,
  createSupportTicketTool,
  getSupportTicketTool,
  listMySupportTicketsTool,
  listAuthorizedPatientsTool,
  createFollowupRequestTool,
  requestStaffAssistanceTool,
  transferToAgentTool,
];
