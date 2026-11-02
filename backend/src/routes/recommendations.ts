import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { availableDoctorSlots, hospitalTimezone, formatHospitalTime } from '@hospital/agents';
import { AIProvider } from '@hospital/ai-provider';

// Emergency symptom patterns
const EMERGENCY_PATTERNS = [
  /severe.*chest.*pain/i,
  /crushing.*chest/i,
  /radiat(ing|es).*arm.*jaw/i,
  /cannot.*breathe/i,
  /severe.*shortness.*of.*breath/i,
  /sudden.*numbness.*face/i,
  /slurred.*speech/i,
  /coughing.*blood/i,
  /loss.*of.*consciousness/i,
  /uncontrolled.*bleeding/i,
];

// Clinical specialty triage heuristics
const SPECIALTY_KEYWORDS: Record<string, RegExp[]> = {
  Cardiology: [
    /heart/i, /chest.*(pain|discomfort|tight|pressure)/i, /palpitation/i,
    /arrhythmia/i, /angina/i, /blood pressure/i, /hypertension/i, /cardio/i,
  ],
  Neurology: [
    /headache/i, /migraine/i, /seizure/i, /epilepsy/i, /numbness/i,
    /tingling/i, /dizziness/i, /vertigo/i, /memory/i, /stroke/i, /tremor/i, /neuropath/i,
  ],
  Pediatrics: [
    /child/i, /infant/i, /baby/i, /toddler/i, /pediatric/i, /growth/i, /teenager/i,
  ],
  Orthopedics: [
    /bone/i, /joint/i, /knee/i, /hip/i, /shoulder/i, /back.*pain/i,
    /spine/i, /fracture/i, /sprain/i, /arthritis/i, /ortho/i, /cartilage/i,
  ],
  Oncology: [
    /cancer/i, /tumor/i, /lump/i, /oncolog/i, /chemo/i, /radiation therapy/i,
    /biopsy/i, /malignan/i,
  ],
};

function triageSpecialty(text: string): { specialty: string; rationale: string; urgency: boolean } {
  // 1. Check emergency flags
  const isEmergency = EMERGENCY_PATTERNS.some((pattern) => pattern.test(text));

  // 2. Score specialties
  let matchedSpecialty = 'Cardiology'; // Default clinical department
  let highestScore = 0;

  for (const [specialty, patterns] of Object.entries(SPECIALTY_KEYWORDS)) {
    let score = 0;
    for (const pat of patterns) {
      if (pat.test(text)) score += 1;
    }
    if (score > highestScore) {
      highestScore = score;
      matchedSpecialty = specialty;
    }
  }

  const rationale = isEmergency
    ? `EMERGENCY CAUTION: Your description indicates potentially urgent clinical symptoms. Immediate emergency medical attention (dial 911 or visit your nearest emergency room) is strongly advised. For outpatient specialty triage, ${matchedSpecialty} is recommended.`
    : `Based on your described concerns, consultation with a specialist in ${matchedSpecialty} is recommended to conduct a formal clinical evaluation and diagnostic review.`;

  return { specialty: matchedSpecialty, rationale, urgency: isEmergency };
}

export async function recommendationRoutes(fastify: FastifyInstance, aiProvider?: AIProvider) {
  // 1. Patient Submits Health Issue -> AI Analyzes -> Returns Recommended Doctors from DB
  fastify.post('/api/patient/symptoms/submit', async (req, reply) => {
    if (!req.authUser) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const schema = z.object({
      description: z.string().min(5, 'Please provide a descriptive explanation of your health concern.'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid symptom input' });
    }

    const { description } = parsed.data;

    // AI Specialty Triage
    const { specialty, rationale, urgency } = triageSpecialty(description);

    // Retrieve ACTUAL active doctors from database matching this specialty/department
    const department = await prisma.department.findFirst({
      where: { name: { contains: specialty, mode: 'insensitive' } },
    });

    const whereDoc: any = { isActive: true };
    if (department) {
      whereDoc.departmentId = department.id;
    } else {
      whereDoc.specialization = { contains: specialty, mode: 'insensitive' };
    }

    const matchingDoctors = await prisma.doctor.findMany({
      where: whereDoc,
      include: {
        user: { select: { name: true, email: true } },
        department: true,
        availabilities: { orderBy: { dayOfWeek: 'asc' } },
      },
      take: 4,
    });

    // Fallback if no specific specialty doctors active
    let doctorsList = matchingDoctors;
    if (doctorsList.length === 0) {
      doctorsList = await prisma.doctor.findMany({
        where: { isActive: true },
        include: {
          user: { select: { name: true, email: true } },
          department: true,
          availabilities: { orderBy: { dayOfWeek: 'asc' } },
        },
        take: 3,
      });
    }

    const doctorIds = doctorsList.map((d) => d.id);

    // Save PatientSymptomRequest and AIRecommendation to DB
    const symptomRequest = await prisma.$transaction(async (tx) => {
      const s = await tx.patientSymptomRequest.create({
        data: {
          userId: req.authUser!.id,
          patientId: req.authUser!.patientId || null,
          description,
          urgencyFlag: urgency,
        },
      });

      const r = await tx.aIRecommendation.create({
        data: {
          symptomRequestId: s.id,
          recommendedSpecialty: specialty,
          recommendedDoctorIds: doctorIds,
          aiRationale: rationale,
          status: 'PENDING',
        },
      });

      return { symptomRequest: s, recommendation: r };
    });

    return {
      requestId: symptomRequest.symptomRequest.id,
      recommendationId: symptomRequest.recommendation.id,
      recommendedSpecialty: specialty,
      aiRationale: rationale,
      urgencyFlag: urgency,
      disclaimer: 'Notice: This AI recommendation is specialty-routing assistance and does not constitute a definitive medical diagnosis.',
      doctors: doctorsList.map((d) => ({
        id: d.id,
        name: d.user.name,
        department: d.department.name,
        specialization: d.specialization,
        consultationFee: Number(d.consultationFee),
        licenseNumber: d.licenseNumber,
        schedules: d.availabilities.map((a) => ({
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
      })),
    };
  });

  // 2. Select Recommended Doctor
  fastify.post('/api/patient/symptoms/:id/select-doctor', async (req, reply) => {
    if (!req.authUser) return reply.status(401).send({ error: 'Authentication required' });
    const { id } = req.params as { id: string };
    const schema = z.object({ doctorId: z.string().uuid() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'doctorId UUID is required' });

    const doctor = await prisma.doctor.findUnique({
      where: { id: parsed.data.doctorId },
      include: { user: true, department: true },
    });
    if (!doctor) return reply.status(404).send({ error: 'Doctor not found.' });

    const recommendation = await prisma.aIRecommendation.findFirst({
      where: {
        OR: [{ id }, { symptomRequestId: id }],
      },
    });

    if (!recommendation) {
      return reply.status(404).send({ error: 'Recommendation not found.' });
    }

    const updated = await prisma.aIRecommendation.update({
      where: { id: recommendation.id },
      data: {
        selectedDoctorId: doctor.id,
        status: 'DOCTOR_SELECTED',
      },
      include: {
        selectedDoctor: { include: { user: true, department: true } },
      },
    });

    return {
      message: `Selected ${doctor.user.name} (${doctor.specialization}).`,
      recommendation: updated,
    };
  });

  // 3. Book Recommended Appointment (creates exact appointment, links to AI recommendation)
  fastify.post('/api/patient/symptoms/:id/book', async (req, reply) => {
    if (!req.authUser) return reply.status(401).send({ error: 'Authentication required' });
    const { id } = req.params as { id: string };

    const schema = z.object({
      doctorId: z.string().uuid(),
      startTime: z.string().datetime(),
      reason: z.string().min(3),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid booking data' });

    const { doctorId, startTime, reason } = parsed.data;
    const start = new Date(startTime);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    // Determine patient ID
    let patientId = req.authUser.patientId;
    if (!patientId) {
      const patient = await prisma.patient.findUnique({ where: { userId: req.authUser.id } });
      if (!patient) return reply.status(400).send({ error: 'Patient profile not found. Please complete registration.' });
      patientId = patient.id;
    }

    // Verify slot not occupied
    const existingDoctorBooking = await prisma.appointment.findFirst({
      where: {
        doctorId,
        startTime: start,
        status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
      },
    });

    if (existingDoctorBooking) {
      return reply.status(409).send({ error: 'This appointment slot has already been booked. Please choose another time.' });
    }

    const existingPatientBooking = await prisma.appointment.findFirst({
      where: {
        patientId,
        startTime: start,
        status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
      },
    });

    if (existingPatientBooking) {
      return reply.status(409).send({ error: 'You already have an active appointment scheduled at this time.' });
    }

    const recommendation = await prisma.aIRecommendation.findFirst({
      where: { OR: [{ id }, { symptomRequestId: id }] },
    });

    const { appointment, rec } = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.create({
        data: {
          patientId,
          doctorId,
          startTime: start,
          endTime: end,
          status: 'SCHEDULED',
          reason: `AI Recommended Consultation: ${reason}`,
          notes: `Booked via AI Doctor Recommendation workflow (Ref: ${id}).`,
        },
        include: {
          doctor: { include: { user: true, department: true } },
          patient: { include: { user: true } },
        },
      });

      let updatedRec = null;
      if (recommendation) {
        updatedRec = await tx.aIRecommendation.update({
          where: { id: recommendation.id },
          data: {
            selectedDoctorId: doctorId,
            appointmentId: appt.id,
            status: 'BOOKED',
          },
        });
      }

      // Automatically assign patient to doctor if not yet assigned
      await tx.doctorPatientAssignment.upsert({
        where: { doctorId_patientId: { doctorId, patientId } },
        update: { active: true },
        create: {
          doctorId,
          patientId,
          assignedBy: req.authUser!.id,
          notes: 'Care assignment established via AI Doctor Recommendation booking.',
          active: true,
        },
      });

      return { appointment: appt, rec: updatedRec };
    });

    return reply.status(201).send({
      message: 'Appointment successfully booked with recommended specialist!',
      appointment: {
        id: appointment.id,
        doctorName: appointment.doctor.user.name,
        specialization: appointment.doctor.specialization,
        department: appointment.doctor.department.name,
        startTime: appointment.startTime.toISOString(),
        endTime: appointment.endTime.toISOString(),
        status: appointment.status,
      },
      recommendationStatus: rec?.status || 'BOOKED',
    });
  });

  // 4. Recommendation history
  fastify.get('/api/patient/symptoms/history', async (req, reply) => {
    if (!req.authUser) return reply.status(401).send({ error: 'Authentication required' });
    const history = await prisma.patientSymptomRequest.findMany({
      where: { userId: req.authUser.id },
      include: {
        recommendation: {
          include: { selectedDoctor: { include: { user: true, department: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return history.map((h) => ({
      id: h.id,
      description: h.description,
      urgencyFlag: h.urgencyFlag,
      createdAt: h.createdAt.toISOString(),
      recommendation: h.recommendation
        ? {
            id: h.recommendation.id,
            specialty: h.recommendation.recommendedSpecialty,
            rationale: h.recommendation.aiRationale,
            status: h.recommendation.status,
            selectedDoctor: h.recommendation.selectedDoctor?.user.name,
            appointmentId: h.recommendation.appointmentId,
          }
        : null,
    }));
  });
}
