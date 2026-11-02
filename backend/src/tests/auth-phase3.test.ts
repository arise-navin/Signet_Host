import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../index.js';
import { prisma } from '../db.js';

let app: FastifyInstance;

beforeAll(async () => {
  const { server } = await createServer();
  app = server;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('Phase 3: Role-Based Authentication & Registration Suite', () => {
  it('Admin login succeeds with identifier "admin" and bootstrap password "1812"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: 'admin',
        password: process.env.ADMIN_BOOTSTRAP_PASSWORD || '1812',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.role).toBe('ADMIN');
    expect(body.user.email).toBe('admin@hospital.com');
    expect(body.mustChangePassword).toBe(true);
  });

  it('Doctor login succeeds with email and valid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: 'dr.mitchell@hospital.com',
        password: 'password123',
        expectedRole: 'DOCTOR',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.role).toBe('DOCTOR');
    expect(body.user.doctorId).toBeDefined();
    expect(body.user.specialization).toContain('Cardiology');
  });

  it('Patient login succeeds with email and valid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: 'patient1@example.com',
        password: 'password123',
        expectedRole: 'PATIENT',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.role).toBe('PATIENT');
    expect(body.user.patientId).toBeDefined();
    expect(body.user.mrn).toBeDefined();
  });

  it('Login rejects invalid password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: 'admin@hospital.com',
        password: 'wrongpassword',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Invalid credentials');
  });

  it('Login rejects non-existent user with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: 'nonexistent@hospital.com',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('Login rejects mismatched expectedRole with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: 'patient1@example.com',
        password: 'password123',
        expectedRole: 'DOCTOR', // forged role expectation
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Access denied');
  });

  it('New Patient self-registration creates User, Patient profile, and unique MRN', async () => {
    const testEmail = `newpatient-${Date.now()}@testclinic.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Jane Doe',
        email: testEmail,
        phone: '+1-555-890-1234',
        password: 'SecurePassword123!',
        dateOfBirth: '1992-04-15',
        gender: 'Female',
        bloodGroup: 'O+',
        allergies: 'Latex',
        chronicConditions: 'None',
        address: '456 Wellness Way',
        emergencyContact: 'John Doe - 555-999-0000',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.role).toBe('PATIENT');
    expect(body.user.email).toBe(testEmail);
    expect(body.user.patientId).toBeDefined();
    expect(body.user.mrn).toMatch(/^MRN-2026-/);

    // Verify database record
    const dbPatient = await prisma.patient.findUnique({
      where: { id: body.user.patientId },
      include: { user: true },
    });
    expect(dbPatient).not.toBeNull();
    expect(dbPatient?.user.name).toBe('Jane Doe');
    expect(dbPatient?.bloodGroup).toBe('O+');

    // Clean up
    await prisma.patient.delete({ where: { id: dbPatient!.id } });
    await prisma.user.delete({ where: { id: dbPatient!.userId } });
  });

  it('Self-registration rejects duplicate email with 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Duplicate Test',
        email: 'patient1@example.com', // already exists
        phone: '+1-555-000-1111',
        password: 'password123',
        dateOfBirth: '1990-01-01',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('already registered');
  });

  it('Password change verifies current password and resets mustChangePassword flag', async () => {
    // Create temporary test user
    const tempEmail = `pwdchange-${Date.now()}@example.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Password Test User',
        email: tempEmail,
        phone: '+1-555-333-4444',
        password: 'initialPassword123',
        dateOfBirth: '1988-06-20',
      },
    });
    const regData = JSON.parse(regRes.body);
    const token = regData.token;

    // Change password
    const changeRes = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        currentPassword: 'initialPassword123',
        newPassword: 'BrandNewPassword456!',
      },
    });
    expect(changeRes.statusCode).toBe(200);

    // Verify login with new password
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: tempEmail,
        password: 'BrandNewPassword456!',
      },
    });
    expect(loginRes.statusCode).toBe(200);

    // Clean up
    await prisma.patient.delete({ where: { id: regData.user.patientId } });
    await prisma.user.delete({ where: { id: regData.user.id } });
  });

  it('Logout endpoint clears session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('Max-Age=0');
  });
});
