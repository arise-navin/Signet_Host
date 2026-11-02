import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { hospitalDate, hospitalTimezone, localTimeToUtc } from '@hospital/agents';
import { AGENT_METADATA_LIST } from '@hospital/shared';

export async function adminRoutes(fastify: FastifyInstance) {
  // Middleware helper to ensure ADMIN role
  const requireAdmin = (req: any, reply: any) => {
    if (!req.authUser || req.authUser.role !== 'ADMIN') {
      reply.status(403).send({ error: 'Administrative privileges are required for this resource.' });
      return false;
    }
    return true;
  };

  // 1. Comprehensive Admin Overview Metrics
  fastify.get('/api/admin/overview', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const todayStart = localTimeToUtc(hospitalDate(new Date()), '00:00', hospitalTimezone());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const [
      totalDoctors,
      activeDoctors,
      totalPatients,
      totalAppointments,
      todayAppointments,
      upcomingAppointments,
      completedAppointments,
      cancelledAppointments,
      openTickets,
      totalTickets,
      agentExecutionsCount,
      agentSuccessCount,
      agentFailureCount,
      recentExecutions,
      recentRecommendations,
      departments,
    ] = await Promise.all([
      prisma.doctor.count(),
      prisma.doctor.count({ where: { isActive: true } }),
      prisma.patient.count(),
      prisma.appointment.count(),
      prisma.appointment.count({
        where: { startTime: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.appointment.count({
        where: {
          startTime: { gt: todayEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      }),
      prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      prisma.appointment.count({ where: { status: 'CANCELLED' } }),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.supportTicket.count(),
      prisma.agentExecution.count(),
      prisma.agentExecution.count({ where: { status: 'SUCCESS' } }),
      prisma.agentExecution.count({ where: { status: { not: 'SUCCESS' } } }),
      prisma.agentExecution.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { agent: true, toolExecutions: true },
      }),
      prisma.aIRecommendation.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          symptomRequest: { include: { user: { select: { name: true } } } },
          selectedDoctor: { include: { user: { select: { name: true } } } },
        },
      }),
      prisma.department.findMany({
        include: { _count: { select: { doctors: true } } },
      }),
    ]);

    return {
      metrics: {
        totalDoctors,
        activeDoctors,
        inactiveDoctors: totalDoctors - activeDoctors,
        totalPatients,
        totalAppointments,
        todayAppointments,
        upcomingAppointments,
        completedAppointments,
        cancelledAppointments,
        openTickets,
        totalTickets,
        agentSuccessRate: agentExecutionsCount > 0 ? ((agentSuccessCount / agentExecutionsCount) * 100).toFixed(1) + '%' : '100%',
        agentExecutionsCount,
        agentFailureCount,
      },
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        doctorCount: d._count.doctors,
      })),
      recentActivity: recentExecutions.map((e) => ({
        id: e.id,
        agentId: e.agentId,
        agentName: e.agent.name,
        userName: e.userId,
        prompt: e.userPrompt,
        status: e.status,
        durationMs: e.durationMs,
        toolCount: e.toolExecutions.length,
        createdAt: e.createdAt.toISOString(),
      })),
      recentRecommendations: recentRecommendations.map((r) => ({
        id: r.id,
        patientName: r.symptomRequest.user.name,
        symptom: r.symptomRequest.description,
        specialty: r.recommendedSpecialty,
        selectedDoctor: r.selectedDoctor?.user.name || 'Not selected',
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  // 2. Doctor Management: List all doctors for admin
  fastify.get('/api/admin/doctors', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const doctors = await prisma.doctor.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        department: true,
        availabilities: { orderBy: { dayOfWeek: 'asc' } },
        _count: { select: { appointments: true, patientAssignments: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });

    return doctors.map((d) => ({
      id: d.id,
      userId: d.userId,
      name: d.user.name,
      email: d.user.email,
      departmentId: d.departmentId,
      department: d.department.name,
      departmentCode: d.department.code,
      specialization: d.specialization,
      licenseNumber: d.licenseNumber,
      consultationFee: Number(d.consultationFee),
      isActive: d.isActive,
      bio: d.bio,
      appointmentsCount: d._count.appointments,
      assignedPatientsCount: d._count.patientAssignments,
      schedules: d.availabilities.map((a) => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
        slotMinutes: a.slotMinutes,
      })),
    }));
  });

  // 3. Add Doctor
  fastify.post('/api/admin/doctors', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const schema = z.object({
      name: z.string().min(2, 'Name is required'),
      email: z.string().email('Valid email is required'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
      departmentId: z.string().uuid('Valid department ID is required'),
      specialization: z.string().min(2, 'Specialization is required'),
      licenseNumber: z.string().min(3, 'License number is required'),
      consultationFee: z.number().positive().default(150),
      bio: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid doctor details' });
    }

    const data = parsed.data;

    // Check duplicate email or license
    const existingEmail = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) {
      return reply.status(409).send({ error: 'An account with this email address already exists.' });
    }
    const existingLicense = await prisma.doctor.findUnique({ where: { licenseNumber: data.licenseNumber } });
    if (existingLicense) {
      return reply.status(409).send({ error: 'A doctor with this license number already exists.' });
    }

    const doctorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'DOCTOR' } });
    const passwordHash = await bcrypt.hash(data.password, 10);

    const doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          roleId: doctorRole.id,
          mustChangePassword: false,
        },
      });

      const doc = await tx.doctor.create({
        data: {
          userId: user.id,
          departmentId: data.departmentId,
          specialization: data.specialization,
          licenseNumber: data.licenseNumber,
          consultationFee: data.consultationFee,
          bio: data.bio || null,
          isActive: true,
        },
        include: { department: true, user: true },
      });

      // Create standard Monday-Friday 9am-5pm schedule
      for (let day = 1; day <= 5; day++) {
        await tx.doctorAvailability.create({
          data: {
            doctorId: doc.id,
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '17:00',
            slotMinutes: 30,
          },
        });
      }

      return doc;
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: req.authUser!.id,
          action: 'CREATE_DOCTOR',
          resource: 'Doctor',
          resourceId: doctor.id,
          details: JSON.stringify({ name: data.name, licenseNumber: data.licenseNumber }),
          ipAddress: req.ip,
        },
      });
    } catch {}

    return reply.status(201).send({
      message: `Doctor ${doctor.user.name} created successfully.`,
      doctor: {
        id: doctor.id,
        name: doctor.user.name,
        email: doctor.user.email,
        department: doctor.department.name,
        specialization: doctor.specialization,
        licenseNumber: doctor.licenseNumber,
        consultationFee: Number(doctor.consultationFee),
        isActive: doctor.isActive,
      },
    });
  });

  // 4. Edit Doctor Profile
  fastify.put('/api/admin/doctors/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { id } = req.params as { id: string };
    z.string().uuid().parse(id);

    const schema = z.object({
      name: z.string().min(2).optional(),
      specialization: z.string().min(2).optional(),
      departmentId: z.string().uuid().optional(),
      consultationFee: z.number().positive().optional(),
      bio: z.string().optional(),
      isActive: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid payload' });
    }

    const { name, specialization, departmentId, consultationFee, bio, isActive } = parsed.data;

    const doctor = await prisma.doctor.findUnique({ where: { id }, include: { user: true } });
    if (!doctor) return reply.status(404).send({ error: 'Doctor not found.' });

    await prisma.$transaction(async (tx) => {
      if (name && name !== doctor.user.name) {
        await tx.user.update({
          where: { id: doctor.userId },
          data: { name },
        });
      }

      await tx.doctor.update({
        where: { id },
        data: {
          specialization: specialization ?? undefined,
          departmentId: departmentId ?? undefined,
          consultationFee: consultationFee ?? undefined,
          bio: bio !== undefined ? bio : undefined,
          isActive: isActive !== undefined ? isActive : undefined,
        },
      });
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: req.authUser!.id,
          action: 'UPDATE_DOCTOR',
          resource: 'Doctor',
          resourceId: id,
          details: JSON.stringify(parsed.data),
          ipAddress: req.ip,
        },
      });
    } catch {}

    return { message: 'Doctor profile updated successfully.' };
  });

  // 5. Toggle Doctor Active Status
  fastify.patch('/api/admin/doctors/:id/status', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const schema = z.object({ isActive: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'isActive boolean required.' });

    const doctor = await prisma.doctor.update({
      where: { id },
      data: { isActive: parsed.data.isActive },
      include: { user: true },
    });

    return {
      message: `Doctor ${doctor.user.name} is now ${doctor.isActive ? 'Active' : 'Deactivated'}.`,
      isActive: doctor.isActive,
    };
  });

  // 6. Doctor-Patient Assignments: Assign / Reassign patient to doctor
  fastify.post('/api/admin/assignments', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const schema = z.object({
      doctorId: z.string().uuid(),
      patientId: z.string().uuid(),
      notes: z.string().optional(),
      active: z.boolean().default(true),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid assignment data' });
    }

    const { doctorId, patientId, notes, active } = parsed.data;

    const [doctor, patient] = await Promise.all([
      prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } }),
      prisma.patient.findUnique({ where: { id: patientId }, include: { user: true } }),
    ]);

    if (!doctor || !patient) {
      return reply.status(404).send({ error: 'Doctor or Patient record not found.' });
    }

    const assignment = await prisma.doctorPatientAssignment.upsert({
      where: {
        doctorId_patientId: { doctorId, patientId },
      },
      update: {
        active,
        notes: notes ?? undefined,
        assignedBy: req.authUser!.id,
      },
      create: {
        doctorId,
        patientId,
        assignedBy: req.authUser!.id,
        notes: notes || `Care assignment created by administrator.`,
        active,
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: req.authUser!.id,
          action: 'ASSIGN_PATIENT_DOCTOR',
          resource: 'DoctorPatientAssignment',
          resourceId: assignment.id,
          details: JSON.stringify({ doctor: doctor.user.name, patient: patient.user.name, active }),
          ipAddress: req.ip,
        },
      });
    } catch {}

    return {
      message: `Successfully assigned ${patient.user.name} to ${doctor.user.name}.`,
      assignment,
    };
  });

  // 7. List assignments
  fastify.get('/api/admin/assignments', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const assignments = await prisma.doctorPatientAssignment.findMany({
      include: {
        doctor: { include: { user: { select: { name: true, email: true } }, department: true } },
        patient: { include: { user: { select: { name: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return assignments.map((a) => ({
      id: a.id,
      doctorId: a.doctorId,
      doctorName: a.doctor.user.name,
      doctorSpecialization: a.doctor.specialization,
      department: a.doctor.department.name,
      patientId: a.patientId,
      patientName: a.patient.user.name,
      patientMrn: a.patient.mrn,
      active: a.active,
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
    }));
  });

  // 8. AI Agents Management & Monitoring
  fastify.get('/api/admin/ai-agents', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const agents = await prisma.aIAgent.findMany({
      include: {
        _count: { select: { executions: true } },
      },
    });

    const executionStats = await Promise.all(
      agents.map(async (agent) => {
        const [success, failures, recent] = await Promise.all([
          prisma.agentExecution.count({ where: { agentId: agent.id, status: 'SUCCESS' } }),
          prisma.agentExecution.count({ where: { agentId: agent.id, status: { not: 'SUCCESS' } } }),
          prisma.agentExecution.findMany({
            where: { agentId: agent.id },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { toolExecutions: true },
          }),
        ]);

        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          roleDescription: agent.roleDescription,
          allowedTools: JSON.parse(agent.allowedTools || '[]'),
          totalExecutions: agent._count.executions,
          successCount: success,
          failureCount: failures,
          successRate: agent._count.executions > 0 ? ((success / agent._count.executions) * 100).toFixed(1) + '%' : '100%',
          recentExecutions: recent.map((r) => ({
            id: r.id,
            prompt: r.userPrompt,
            status: r.status,
            durationMs: r.durationMs,
            toolsCalled: r.toolExecutions.map((t) => t.toolName),
            createdAt: r.createdAt.toISOString(),
          })),
        };
      })
    );

    return executionStats;
  });

  // 9. Departments listing
  fastify.get('/api/admin/departments', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const depts = await prisma.department.findMany({
      include: { _count: { select: { doctors: true } } },
      orderBy: { name: 'asc' },
    });
    return depts;
  });
}
