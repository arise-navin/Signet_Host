import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { appointmentScope, appointmentScopeWhere, authorizeCarePatient, authorizeClinicalPatient, careRelationshipFilter } from '@hospital/agents';
import { z } from 'zod';
import { prisma } from '../db.js';

export async function patientRoutes(fastify: FastifyInstance) {
  // List patients
  fastify.get('/api/patients', async (req, reply) => {
    const { search, page = '1', limit = '15' } = (req.query as any) || {};
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where: Prisma.PatientWhereInput = {};
    if (search) {
      where.OR = [
        { mrn: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Role scoping:
    // If patient role, only list own profile
    if (req.authUser?.role === 'PATIENT' && req.authUser.patientId) {
      where.id = req.authUser.patientId;
    }

    if (req.authUser!.role === 'DOCTOR') {
      if (!req.authUser!.doctorId) return reply.status(403).send({ error: 'Doctor profile is required.' });
      where.AND = [careRelationshipFilter(req.authUser!.doctorId)];
    }
    const clinical = req.authUser!.role !== 'RECEPTIONIST';
    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { name: true, email: true } },
          _count: {
            select: {
              appointments: true,
              medicalRecords: true,
              labReports: true,
              prescriptions: true,
            },
          },
        },
        orderBy: { mrn: 'asc' },
      }),
      prisma.patient.count({ where }),
    ]);

    return {
      total,
      page: parseInt(page, 10),
      limit: take,
      patients: patients.map((p) => ({
        id: p.id,
        mrn: p.mrn,
        name: p.user.name,
        email: p.user.email,
        gender: p.gender,
        dateOfBirth: p.dateOfBirth.toISOString().split('T')[0],
        bloodGroup: clinical ? p.bloodGroup : null,
        phone: p.phone,
        allergies: clinical ? p.allergies : null,
        chronicConditions: clinical ? p.chronicConditions : null,
        counts: clinical ? p._count : { appointments: p._count.appointments, medicalRecords: 0, labReports: 0, prescriptions: 0 },
      })),
    };
  });

  // Get specific patient details with authorized records
  fastify.get('/api/patients/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const authUser = req.authUser;

    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    z.string().uuid().parse(id);
    await authorizeCarePatient(authUser, id, prisma);
    const canAccessClinicalRecords = authUser.role !== 'RECEPTIONIST';
    if (canAccessClinicalRecords) await authorizeClinicalPatient(authUser, id, prisma);

    const visibleAppointments = appointmentScopeWhere(await appointmentScope(authUser, prisma));
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        appointments: {
          where: visibleAppointments,
          include: {
            doctor: { include: { user: { select: { name: true } }, department: { select: { name: true } } } },
          },
          orderBy: { startTime: 'desc' },
          take: 20,
        },
        prescriptions: {
          where: canAccessClinicalRecords ? {} : { id: '00000000-0000-4000-8000-000000000000' },
          include: {
            doctor: { include: { user: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
        visits: {
          where: canAccessClinicalRecords ? {} : { id: '00000000-0000-4000-8000-000000000000' },
          include: {
            doctor: { include: { user: { select: { name: true } } } },
          },
          orderBy: { visitDate: 'desc' },
        },
      },
    });

    if (!patient) {
      return reply.status(404).send({ error: 'Patient not found' });
    }

    const [medicalRecords, labReports] = canAccessClinicalRecords ? await Promise.all([
      prisma.medicalRecord.findMany({ where: { patientId: id }, include: { doctor: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } }),
      prisma.labReport.findMany({ where: { patientId: id }, include: { labTest: true, reviewedBy: { include: { user: { select: { name: true } } } } }, orderBy: { orderedAt: 'desc' } }),
    ]) : [[], []];

    return {
      id: patient.id,
      mrn: patient.mrn,
      name: patient.user.name,
      email: patient.user.email,
      dateOfBirth: patient.dateOfBirth.toISOString().split('T')[0],
      gender: patient.gender,
      bloodGroup: canAccessClinicalRecords ? patient.bloodGroup : null,
      phone: patient.phone,
      emergencyContact: canAccessClinicalRecords ? patient.emergencyContact : null,
      address: canAccessClinicalRecords ? patient.address : null,
      allergies: canAccessClinicalRecords ? patient.allergies : null,
      chronicConditions: canAccessClinicalRecords ? patient.chronicConditions : null,
      appointments: patient.appointments.map((a) => ({
        id: a.id,
        doctorName: a.doctor.user.name,
        department: a.doctor.department.name,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        status: a.status,
        reason: a.reason,
      })),
      prescriptions: (patient.prescriptions ?? []).map((p) => ({
        id: p.id,
        medication: p.medication,
        dosage: p.dosage,
        frequency: p.frequency,
        instructions: p.instructions,
        prescribedBy: p.doctor.user.name,
        active: p.active,
        startDate: p.startDate.toISOString().split('T')[0],
      })),
      clinicalAccessDenied: !canAccessClinicalRecords,
      clinicalAccessNotice: !canAccessClinicalRecords
        ? 'Notice: Receptionists are not authorized to view clinical diagnostic notes or lab records.'
        : undefined,
      medicalRecords: medicalRecords.map((m) => ({
        id: m.id,
        recordType: m.recordType,
        title: m.title,
        content: m.content,
        doctorName: m.doctor?.user.name || 'Hospital Clinical Staff',
        date: m.createdAt.toISOString().split('T')[0],
      })),
      labReports: labReports.map((l) => ({
        id: l.id,
        testCode: l.labTest.code,
        testName: l.labTest.name,
        category: l.labTest.category,
        status: l.status,
        normalRange: l.labTest.normalRange,
        resultValues: JSON.parse(l.resultValues),
        clinicalSummary: l.clinicalSummary,
        reviewedBy: l.reviewedBy?.user.name,
        orderedAt: l.orderedAt.toISOString().split('T')[0],
      })),
    };
  });
}
