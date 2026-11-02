import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hospitalDate, hospitalTimezone, localTimeToUtc, careRelationshipFilter } from '@hospital/agents';

export async function doctorDashboardRoutes(fastify: FastifyInstance) {
  const requireDoctor = (req: any, reply: any) => {
    if (!req.authUser || req.authUser.role !== 'DOCTOR' || !req.authUser.doctorId) {
      reply.status(403).send({ error: 'Doctor profile authorization required.' });
      return false;
    }
    return true;
  };

  // 1. Doctor Personal Dashboard Overview
  fastify.get('/api/doctor/overview', async (req, reply) => {
    if (!requireDoctor(req, reply)) return;
    const doctorId = req.authUser!.doctorId!;

    const todayStart = localTimeToUtc(hospitalDate(new Date()), '00:00', hospitalTimezone());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const [
      doctor,
      todayAppointments,
      upcomingAppointments,
      completedCount,
      assignedCount,
      assignedPatients,
      pendingLabReports,
    ] = await Promise.all([
      prisma.doctor.findUniqueOrThrow({
        where: { id: doctorId },
        include: {
          user: true,
          department: true,
          availabilities: { orderBy: { dayOfWeek: 'asc' } },
        },
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          startTime: { gte: todayStart, lte: todayEnd },
        },
        include: { patient: { include: { user: true } } },
        orderBy: { startTime: 'asc' },
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          startTime: { gt: todayEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
        },
        include: { patient: { include: { user: true } } },
        orderBy: { startTime: 'asc' },
        take: 10,
      }),
      prisma.appointment.count({
        where: { doctorId, status: 'COMPLETED' },
      }),
      prisma.doctorPatientAssignment.count({
        where: { doctorId, active: true },
      }),
      prisma.doctorPatientAssignment.findMany({
        where: { doctorId, active: true },
        include: {
          patient: {
            include: {
              user: { select: { name: true, email: true } },
              _count: { select: { appointments: true, medicalRecords: true } },
            },
          },
        },
        take: 15,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.labReport.findMany({
        where: {
          status: { in: ['IN_PROGRESS', 'REVIEW_REQUESTED'] },
          patient: careRelationshipFilter(doctorId),
        },
        include: {
          patient: { include: { user: true } },
          labTest: true,
        },
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      profile: {
        id: doctor.id,
        name: doctor.user.name,
        email: doctor.user.email,
        department: doctor.department.name,
        specialization: doctor.specialization,
        licenseNumber: doctor.licenseNumber,
        consultationFee: Number(doctor.consultationFee),
        bio: doctor.bio,
        isActive: doctor.isActive,
        schedules: doctor.availabilities,
      },
      metrics: {
        todayAppointmentsCount: todayAppointments.length,
        upcomingCount: upcomingAppointments.length,
        completedCount,
        assignedPatientsCount: assignedCount,
        pendingLabReviewsCount: pendingLabReports.length,
      },
      todayAppointments: todayAppointments.map((a) => ({
        id: a.id,
        patientName: a.patient.user.name,
        patientMrn: a.patient.mrn,
        patientPhone: a.patient.phone,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        status: a.status,
        reason: a.reason,
      })),
      upcomingAppointments: upcomingAppointments.map((a) => ({
        id: a.id,
        patientName: a.patient.user.name,
        patientMrn: a.patient.mrn,
        startTime: a.startTime.toISOString(),
        status: a.status,
        reason: a.reason,
      })),
      assignedPatients: assignedPatients.map((a) => ({
        assignmentId: a.id,
        patientId: a.patient.id,
        name: a.patient.user.name,
        email: a.patient.user.email,
        mrn: a.patient.mrn,
        gender: a.patient.gender,
        bloodGroup: a.patient.bloodGroup,
        phone: a.patient.phone,
        allergies: a.patient.allergies,
        chronicConditions: a.patient.chronicConditions,
        appointmentsCount: a.patient._count.appointments,
        recordsCount: a.patient._count.medicalRecords,
        assignedDate: a.createdAt.toISOString(),
      })),
      pendingLabReports: pendingLabReports.map((l) => ({
        id: l.id,
        patientName: l.patient.user.name,
        mrn: l.patient.mrn,
        testName: l.labTest.name,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  });

  // 2. Doctor Assigned Patients (scoped and authorized)
  fastify.get('/api/doctor/patients', async (req, reply) => {
    if (!requireDoctor(req, reply)) return;
    const doctorId = req.authUser!.doctorId!;
    const { search } = (req.query as any) || {};

    const where: any = { doctorId, active: true };
    if (search) {
      where.patient = {
        OR: [
          { mrn: { contains: search, mode: 'insensitive' } },
          { user: { name: { contains: search, mode: 'insensitive' } } },
        ],
      };
    }

    const assignments = await prisma.doctorPatientAssignment.findMany({
      where,
      include: {
        patient: {
          include: {
            user: true,
            _count: { select: { appointments: true, medicalRecords: true, prescriptions: true, labReports: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return assignments.map((a) => ({
      id: a.patient.id,
      mrn: a.patient.mrn,
      name: a.patient.user.name,
      email: a.patient.user.email,
      gender: a.patient.gender,
      bloodGroup: a.patient.bloodGroup,
      phone: a.patient.phone,
      emergencyContact: a.patient.emergencyContact,
      allergies: a.patient.allergies,
      chronicConditions: a.patient.chronicConditions,
      notes: a.notes,
      counts: a.patient._count,
    }));
  });

  // 3. Update Doctor Availability
  fastify.post('/api/doctor/availability', async (req, reply) => {
    if (!requireDoctor(req, reply)) return;
    const doctorId = req.authUser!.doctorId!;

    const schema = z.object({
      schedules: z.array(
        z.object({
          dayOfWeek: z.number().int().min(1).max(7),
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          endTime: z.string().regex(/^\d{2}:\d{2}$/),
          slotMinutes: z.number().int().min(15).max(120).default(30),
        })
      ),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid availability schedule' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.doctorAvailability.deleteMany({ where: { doctorId } });
      for (const s of parsed.data.schedules) {
        await tx.doctorAvailability.create({
          data: {
            doctorId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            slotMinutes: s.slotMinutes,
          },
        });
      }
    });

    return { message: 'Schedule updated successfully.' };
  });
}
