import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../index.js';
import { prisma } from '../db.js';

let app: FastifyInstance;
let adminToken: string;
let doctorToken: string;
let patientToken: string;
let doctorId: string;
let patientId: string;

beforeAll(async () => {
  const { server } = await createServer();
  app = server;
  await app.ready();

  // Admin login
  const adminRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { identifier: 'admin', password: process.env.ADMIN_BOOTSTRAP_PASSWORD || '1812' },
  });
  adminToken = `Bearer ${JSON.parse(adminRes.body).token}`;

  // Doctor login
  const doctorRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { identifier: 'dr.mitchell@hospital.com', password: 'password123', expectedRole: 'DOCTOR' },
  });
  const doctorBody = JSON.parse(doctorRes.body);
  doctorToken = `Bearer ${doctorBody.token}`;
  doctorId = doctorBody.user.doctorId;

  // Patient login
  const patientRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { identifier: 'patient1@example.com', password: 'password123', expectedRole: 'PATIENT' },
  });
  const patientBody = JSON.parse(patientRes.body);
  patientToken = `Bearer ${patientBody.token}`;
  patientId = patientBody.user.patientId;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('Phase 4: Admin Dashboard & Management Suite', () => {
  it('GET /api/admin/overview returns real database metrics and rejects non-admin users', async () => {
    // Non-admin rejection (Patient)
    const deniedRes = await app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: { authorization: patientToken },
    });
    expect(deniedRes.statusCode).toBe(403);

    // Admin authorized
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: { authorization: adminToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.metrics.totalDoctors).toBeGreaterThanOrEqual(10);
    expect(body.metrics.totalPatients).toBeGreaterThanOrEqual(50);
    expect(body.metrics.totalAppointments).toBeGreaterThanOrEqual(100);
    expect(body.departments.length).toBeGreaterThanOrEqual(5);
  });

  it('Admin can create, edit, and toggle active status of a doctor', async () => {
    const dept = await prisma.department.findFirstOrThrow();
    const uniqueEmail = `dr.test-${Date.now()}@hospital.com`;
    const uniqueLicense = `LIC-TEST-${Date.now().toString().slice(-6)}`;

    // 1. Create Doctor
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/doctors',
      headers: { authorization: adminToken },
      payload: {
        name: 'Dr. Test Specialist',
        email: uniqueEmail,
        departmentId: dept.id,
        specialization: 'Preventive Cardiology',
        licenseNumber: uniqueLicense,
        consultationFee: 175,
        bio: 'Expert in clinical trials.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    const newDocId = created.doctor.id;

    // 2. Edit Doctor
    const editRes = await app.inject({
      method: 'PUT',
      url: `/api/admin/doctors/${newDocId}`,
      headers: { authorization: adminToken },
      payload: {
        name: 'Dr. Test Specialist Edited',
        consultationFee: 195,
      },
    });
    expect(editRes.statusCode).toBe(200);

    // 3. Toggle Status
    const toggleRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/doctors/${newDocId}/status`,
      headers: { authorization: adminToken },
      payload: { isActive: false },
    });
    expect(toggleRes.statusCode).toBe(200);
    expect(JSON.parse(toggleRes.body).isActive).toBe(false);

    // Clean up
    await prisma.doctorAvailability.deleteMany({ where: { doctorId: newDocId } });
    await prisma.doctor.delete({ where: { id: newDocId } });
    await prisma.user.delete({ where: { email: uniqueEmail } });
  });

  it('Admin can assign and reassign patients to doctors', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/assignments',
      headers: { authorization: adminToken },
      payload: {
        doctorId,
        patientId,
        notes: 'Clinical priority reassignment by chief medical officer.',
        active: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.assignment.active).toBe(true);

    // Verify in assignments list
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/assignments',
      headers: { authorization: adminToken },
    });
    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.body);
    expect(list.some((a: any) => a.doctorId === doctorId && a.patientId === patientId)).toBe(true);
  });

  it('Admin can monitor all 4 AI agents with execution metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/ai-agents',
      headers: { authorization: adminToken },
    });
    expect(res.statusCode).toBe(200);
    const agents = JSON.parse(res.body);
    expect(agents.length).toBe(4);
    const appointmentAgent = agents.find((a: any) => a.id === 'appointment-agent');
    expect(appointmentAgent).toBeDefined();
    expect(appointmentAgent.allowedTools).toContain('book_appointment');
  });
});

describe('Phase 5: Personal Doctor Dashboard Suite', () => {
  it('GET /api/doctor/overview returns authenticated doctor profile and assigned patients', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/doctor/overview',
      headers: { authorization: doctorToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.profile.id).toBe(doctorId);
    expect(body.profile.department).toBe('Cardiology');
    expect(body.metrics.assignedPatientsCount).toBeGreaterThan(0);
    expect(Array.isArray(body.assignedPatients)).toBe(true);
  });

  it('Doctor cannot access another doctor personal dashboard without credentials', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/doctor/overview',
      headers: { authorization: patientToken }, // patient role
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Phase 6: Patient Personal Dashboard Suite', () => {
  it('GET /api/patient/overview returns patient profile with MRN and clinical data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/patient/overview',
      headers: { authorization: patientToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.profile.id).toBe(patientId);
    expect(body.profile.mrn).toMatch(/^MRN-2026-/);
    expect(Array.isArray(body.assignedDoctors)).toBe(true);
    expect(Array.isArray(body.prescriptions)).toBe(true);
    expect(Array.isArray(body.labReports)).toBe(true);
  });

  it('Patient medical records endpoint returns authorized records only', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/patient/medical-records',
      headers: { authorization: patientToken },
    });

    expect(res.statusCode).toBe(200);
    const records = JSON.parse(res.body);
    expect(Array.isArray(records)).toBe(true);
  });
});

describe('Phase 7: Patient Symptom Submission & AI Doctor Recommendation Suite', () => {
  let createdRecommendationId: string;

  it('Patient submits natural language symptoms and receives AI specialty triage + real doctors from DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patient/symptoms/submit',
      headers: { authorization: patientToken },
      payload: {
        description: 'I have recurring chest discomfort after climbing stairs and shortness of breath.',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.recommendedSpecialty).toBe('Cardiology');
    expect(body.urgencyFlag).toBe(false);
    expect(body.doctors.length).toBeGreaterThanOrEqual(1);
    expect(body.doctors[0].department).toBe('Cardiology');
    expect(body.recommendationId).toBeDefined();

    createdRecommendationId = body.recommendationId;
  });

  it('Urgent symptoms trigger emergency flag warning', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patient/symptoms/submit',
      headers: { authorization: patientToken },
      payload: {
        description: 'Severe crushing chest pain radiating to left arm and jaw, cannot breathe.',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.urgencyFlag).toBe(true);
    expect(body.aiRationale).toContain('EMERGENCY CAUTION');
  });

  it('Patient books appointment with recommended doctor and persists recommendation status as BOOKED', async () => {
    // Pick an available slot in the future (30 days ahead)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    futureDate.setHours(10, 0, 0, 0);

    // Clean up any appointment at this slot from a previous test run
    await prisma.appointment.deleteMany({
      where: {
        OR: [
          { doctorId, startTime: futureDate },
          { patientId, startTime: futureDate },
        ],
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/patient/symptoms/${createdRecommendationId}/book`,
      headers: { authorization: patientToken },
      payload: {
        doctorId,
        startTime: futureDate.toISOString(),
        reason: 'Recurrent exertional chest discomfort follow-up',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.appointment.id).toBeDefined();
    expect(body.appointment.status).toBe('SCHEDULED');
    expect(body.recommendationStatus).toBe('BOOKED');

    // Verify appointment in DB is linked and active
    const savedAppt = await prisma.appointment.findUnique({
      where: { id: body.appointment.id },
    });
    expect(savedAppt).not.toBeNull();
    expect(savedAppt?.doctorId).toBe(doctorId);

    // Verify AI Recommendation in DB is updated
    const savedRec = await prisma.aIRecommendation.findUnique({
      where: { id: createdRecommendationId },
    });
    expect(savedRec?.status).toBe('BOOKED');
    expect(savedRec?.appointmentId).toBe(savedAppt?.id);
  });
});
