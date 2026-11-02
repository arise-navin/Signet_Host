import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function patientDashboardRoutes(fastify: FastifyInstance) {
  const requirePatient = (req: any, reply: any) => {
    if (!req.authUser || req.authUser.role !== 'PATIENT' || !req.authUser.patientId) {
      reply.status(403).send({ error: 'Patient profile authorization required.' });
      return false;
    }
    return true;
  };

  // 1. Patient Dashboard Comprehensive Overview
  fastify.get('/api/patient/overview', async (req, reply) => {
    if (!requirePatient(req, reply)) return;
    const patientId = req.authUser!.patientId!;

    const now = new Date();

    const [
      patient,
      upcomingAppointments,
      pastAppointments,
      assignedDoctors,
      prescriptions,
      labReports,
      supportTickets,
      symptomRequests,
    ] = await Promise.all([
      prisma.patient.findUniqueOrThrow({
        where: { id: patientId },
        include: { user: true },
      }),
      prisma.appointment.findMany({
        where: {
          patientId,
          startTime: { gte: now },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
        },
        include: { doctor: { include: { user: true, department: true } } },
        orderBy: { startTime: 'asc' },
        take: 5,
      }),
      prisma.appointment.findMany({
        where: {
          patientId,
          OR: [
            { startTime: { lt: now } },
            { status: { in: ['COMPLETED', 'CANCELLED'] } },
          ],
        },
        include: {
          doctor: { include: { user: true, department: true } },
          visit: true,
        },
        orderBy: { startTime: 'desc' },
        take: 5,
      }),
      prisma.doctorPatientAssignment.findMany({
        where: { patientId, active: true },
        include: {
          doctor: { include: { user: true, department: true } },
        },
      }),
      prisma.prescription.findMany({
        where: { patientId, active: true },
        include: { doctor: { include: { user: true } } },
        orderBy: { startDate: 'desc' },
      }),
      prisma.labReport.findMany({
        where: { patientId },
        include: { labTest: true, reviewedBy: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.supportTicket.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.patientSymptomRequest.findMany({
        where: { patientId },
        include: {
          recommendation: {
            include: { selectedDoctor: { include: { user: true, department: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      profile: {
        id: patient.id,
        name: patient.user.name,
        email: patient.user.email,
        phone: patient.phone,
        mrn: patient.mrn,
        dateOfBirth: patient.dateOfBirth.toISOString().split('T')[0],
        gender: patient.gender,
        bloodGroup: patient.bloodGroup,
        emergencyContact: patient.emergencyContact,
        address: patient.address,
        allergies: patient.allergies,
        chronicConditions: patient.chronicConditions,
      },
      metrics: {
        upcomingAppointmentsCount: upcomingAppointments.length,
        assignedDoctorsCount: assignedDoctors.length,
        activePrescriptionsCount: prescriptions.length,
        labReportsCount: labReports.length,
        openTicketsCount: supportTickets.filter((t) => t.status === 'OPEN').length,
      },
      upcomingAppointments: upcomingAppointments.map((a) => ({
        id: a.id,
        doctorId: a.doctorId,
        doctorName: a.doctor.user.name,
        department: a.doctor.department.name,
        specialization: a.doctor.specialization,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        status: a.status,
        reason: a.reason,
      })),
      pastAppointments: pastAppointments.map((a) => ({
        id: a.id,
        doctorName: a.doctor.user.name,
        department: a.doctor.department.name,
        startTime: a.startTime.toISOString(),
        status: a.status,
        reason: a.reason,
        visitSummary: a.visit?.summary || null,
        diagnosis: a.visit?.diagnosis || null,
      })),
      assignedDoctors: assignedDoctors.map((a) => ({
        doctorId: a.doctorId,
        name: a.doctor.user.name,
        email: a.doctor.user.email,
        department: a.doctor.department.name,
        specialization: a.doctor.specialization,
        consultationFee: Number(a.doctor.consultationFee),
        notes: a.notes,
        assignedSince: a.createdAt.toISOString(),
      })),
      prescriptions: prescriptions.map((p) => ({
        id: p.id,
        medication: p.medication,
        dosage: p.dosage,
        frequency: p.frequency,
        instructions: p.instructions,
        doctorName: p.doctor.user.name,
        startDate: p.startDate.toISOString().split('T')[0],
        endDate: p.endDate?.toISOString().split('T')[0],
        active: p.active,
      })),
      labReports: labReports.map((l) => ({
        id: l.id,
        testCode: l.labTest.code,
        testName: l.labTest.name,
        category: l.labTest.category,
        status: l.status,
        clinicalSummary: l.clinicalSummary,
        resultValues: JSON.parse(l.resultValues || '{}'),
        doctorNotes: l.doctorNotes,
        reviewedBy: l.reviewedBy?.user.name,
        date: l.completedAt?.toISOString() || l.createdAt.toISOString(),
      })),
      supportTickets: supportTickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        category: t.category,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt.toISOString(),
      })),
      symptomRequests: symptomRequests.map((s) => ({
        id: s.id,
        description: s.description,
        urgencyFlag: s.urgencyFlag,
        createdAt: s.createdAt.toISOString(),
        recommendation: s.recommendation
          ? {
              id: s.recommendation.id,
              specialty: s.recommendation.recommendedSpecialty,
              rationale: s.recommendation.aiRationale,
              status: s.recommendation.status,
              selectedDoctor: s.recommendation.selectedDoctor?.user.name,
              appointmentId: s.recommendation.appointmentId,
            }
          : null,
      })),
    };
  });

  // 2. Patient Medical History & Records
  fastify.get('/api/patient/medical-records', async (req, reply) => {
    if (!requirePatient(req, reply)) return;
    const records = await prisma.medicalRecord.findMany({
      where: { patientId: req.authUser!.patientId! },
      include: { doctor: { include: { user: true, department: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      title: r.title,
      recordType: r.recordType,
      content: r.content,
      doctorName: r.doctor?.user.name || 'Attending Physician',
      department: r.doctor?.department.name || 'General Medicine',
      attachments: JSON.parse(r.attachments || '[]'),
      date: r.createdAt.toISOString(),
    }));
  });
}
