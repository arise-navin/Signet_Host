import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { availableDoctorSlots, hospitalTimezone, formatHospitalTime } from '@hospital/agents';
import { prisma } from '../db.js';

export async function doctorRoutes(fastify: FastifyInstance) {
  fastify.get('/api/doctors', async (req, reply) => {
    const { department, search } = (req.query as any) || {};

    const where: any = {};
    if (department) {
      where.department = {
        name: { contains: department, mode: 'insensitive' },
      };
    }
    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { specialization: { contains: search, mode: 'insensitive' } },
      ];
    }

    const doctors = await prisma.doctor.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        department: true,
        availabilities: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return doctors.map((d) => ({
      id: d.id,
      name: d.user.name,
      email: d.user.email,
      department: d.department.name,
      departmentCode: d.department.code,
      specialization: d.specialization,
      licenseNumber: d.licenseNumber,
      consultationFee: Number(d.consultationFee),
      schedules: d.availabilities.map((a) => ({
        dayOfWeek: a.dayOfWeek,
        dayName: dayNames[a.dayOfWeek],
        startTime: a.startTime,
        endTime: a.endTime,
        slotMinutes: a.slotMinutes,
      })),
    }));
  });

  // Doctor detail and specific slot check
  fastify.get('/api/doctors/:id/slots', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { date } = (req.query as any) || {};

    if (!date) {
      return reply.status(400).send({ error: 'date query parameter is required (YYYY-MM-DD)' });
    }

    z.string().uuid().parse(id);
    const slots = await availableDoctorSlots(id, z.string().parse(date), undefined, prisma);
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { id }, include: { user: true, department: true } });
    return {
      doctorId: doctor.id, doctorName: doctor.user.name, department: doctor.department.name,
      date, slots, availableCount: slots.length, timezone: hospitalTimezone(),
      localSlots: slots.map((slot: string) => ({ startTime: slot, localTime: formatHospitalTime(new Date(slot)) })),
    };
  });
}
