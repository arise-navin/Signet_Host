import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

// Simple in-memory rate limiting tracker: IP -> { attempts, lastAttempt }
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 60 * 1000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now > entry.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(ip: string, success: boolean): void {
  const now = Date.now();
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export async function authRoutes(fastify: FastifyInstance) {
  // 1. Password-based login for ADMIN, DOCTOR, PATIENT
  fastify.post('/api/auth/login', async (req, reply) => {
    const ip = req.ip || 'unknown';
    if (isRateLimited(ip)) {
      return reply.status(429).send({ error: 'Too many failed login attempts. Please try again in 1 minute.' });
    }

    const loginSchema = z.object({
      identifier: z.string().min(1, 'Email or username is required'),
      password: z.string().min(1, 'Password is required'),
      expectedRole: z.enum(['ADMIN', 'DOCTOR', 'PATIENT']).optional(),
    });

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid login payload' });
    }

    const { identifier, password, expectedRole } = parsed.data;
    const cleanIdentifier = identifier.trim().toLowerCase();

    // Support username "admin" or email "admin@hospital.com"
    const user = await prisma.user.findFirst({
      where: cleanIdentifier === 'admin'
        ? { email: 'admin@hospital.com' }
        : { email: { equals: cleanIdentifier, mode: 'insensitive' } },
      include: {
        role: true,
        patient: { select: { id: true, mrn: true } },
        doctor: { select: { id: true, specialization: true } },
      },
    });

    if (!user) {
      recordLoginAttempt(ip, false);
      return reply.status(401).send({ error: 'Invalid credentials. Please verify your username/email and password.' });
    }

    if (!user.isActive) {
      return reply.status(403).send({ error: 'This account has been deactivated. Please contact hospital administration.' });
    }

    // Role-based verification: if an expected role was requested, ensure the account actually possesses it
    if (expectedRole && user.role.name !== expectedRole) {
      recordLoginAttempt(ip, false);
      return reply.status(403).send({
        error: `Access denied. This account does not have ${expectedRole} privileges (actual role: ${user.role.name}).`,
      });
    }

    // Secure password verification using bcrypt
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      recordLoginAttempt(ip, false);
      // Audit log failed attempt without sensitive credentials
      try {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_FAILED',
            resource: 'User',
            resourceId: user.id,
            details: JSON.stringify({ reason: 'Invalid password', ip }),
            ipAddress: ip,
          },
        });
      } catch {
        // Continue even if audit fails
      }
      return reply.status(401).send({ error: 'Invalid credentials. Please verify your username/email and password.' });
    }

    recordLoginAttempt(ip, true);

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      patientId: user.patient?.id,
      mrn: user.patient?.mrn,
      doctorId: user.doctor?.id,
      specialization: user.doctor?.specialization,
      mustChangePassword: user.mustChangePassword,
    };

    const token = fastify.jwt.sign({ sub: user.id }, { expiresIn: '8h' });
    reply.header(
      'Set-Cookie',
      `hospital_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
    );

    // Audit log successful login
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_SUCCESS',
          resource: 'User',
          resourceId: user.id,
          details: JSON.stringify({ role: user.role.name, ip }),
          ipAddress: ip,
        },
      });
    } catch {
      // Continue even if audit fails
    }

    return {
      token,
      message: `Welcome back, ${user.name}!`,
      user: authUser,
      mustChangePassword: user.mustChangePassword,
    };
  });

  // 2. Patient Self-Registration
  fastify.post('/api/auth/register', async (req, reply) => {
    const registerSchema = z.object({
      name: z.string().min(2, 'Full name must be at least 2 characters'),
      email: z.string().email('A valid email address is required'),
      phone: z.string().min(7, 'Phone number is required'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
      dateOfBirth: z.string().min(1, 'Date of birth is required'),
      gender: z.string().default('Not Specified'),
      bloodGroup: z.string().optional(),
      allergies: z.string().optional(),
      chronicConditions: z.string().optional(),
      emergencyContact: z.string().optional(),
      address: z.string().optional(),
    });

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid registration form' });
    }

    const data = parsed.data;
    const cleanEmail = data.email.trim().toLowerCase();

    // Check for duplicate email
    const existing = await prisma.user.findFirst({
      where: { email: { equals: cleanEmail, mode: 'insensitive' } },
    });

    if (existing) {
      return reply.status(409).send({ error: 'An account with this email address is already registered.' });
    }

    const patientRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'PATIENT' },
    });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const patientCount = await prisma.patient.count();
    const mrn = `MRN-2026-${String(2000 + patientCount + 1).padStart(5, '0')}`;

    const { user, patient } = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          name: data.name.trim(),
          phone: data.phone.trim(),
          roleId: patientRole.id,
          mustChangePassword: false,
        },
      });

      const p = await tx.patient.create({
        data: {
          userId: u.id,
          mrn,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender,
          bloodGroup: data.bloodGroup || null,
          phone: data.phone.trim(),
          emergencyContact: data.emergencyContact?.trim() || null,
          address: data.address?.trim() || null,
          allergies: data.allergies?.trim() || null,
          chronicConditions: data.chronicConditions?.trim() || null,
        },
      });

      return { user: u, patient: p };
    });

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'PATIENT',
      patientId: patient.id,
      mrn: patient.mrn,
      mustChangePassword: false,
    };

    const token = fastify.jwt.sign({ sub: user.id }, { expiresIn: '8h' });
    reply.header(
      'Set-Cookie',
      `hospital_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
    );

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'REGISTER_PATIENT',
          resource: 'Patient',
          resourceId: patient.id,
          details: JSON.stringify({ mrn: patient.mrn }),
          ipAddress: req.ip,
        },
      });
    } catch {
      // Continue
    }

    return reply.status(201).send({
      token,
      message: 'Registration successful! Your patient account is ready.',
      user: authUser,
    });
  });

  // 3. Forced / Manual Password Change
  fastify.post('/api/auth/change-password', async (req, reply) => {
    if (!req.authUser) {
      return reply.status(401).send({ error: 'Authentication required to update password.' });
    }

    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(6, 'New password must be at least 6 characters'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid request' });
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: req.authUser.id } });
    if (!user) {
      return reply.status(404).send({ error: 'User not found.' });
    }

    const validCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validCurrent) {
      return reply.status(401).send({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_CHANGED',
          resource: 'User',
          resourceId: user.id,
          ipAddress: req.ip,
        },
      });
    } catch {
      // Continue
    }

    return { success: true, message: 'Password has been updated successfully.' };
  });

  // 4. Logout / Session Invalidation
  fastify.post('/api/auth/logout', async (req, reply) => {
    reply.header(
      'Set-Cookie',
      'hospital_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );
    return { success: true, message: 'Logged out successfully.' };
  });

  // 5. Get all demo accounts for user switcher in UI
  fastify.get('/api/auth/demo-users', async (req, reply) => {
    if (process.env.NODE_ENV === 'production' && process.env.DEMO_AUTH_ENABLED !== 'true') {
      return reply.status(403).send({ error: 'Demo accounts are disabled.' });
    }
    const users = await prisma.user.findMany({
      include: {
        role: true,
        patient: { select: { id: true, mrn: true } },
        doctor: { select: { id: true, specialization: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const formatted = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role.name,
      patientId: u.patient?.id,
      mrn: u.patient?.mrn,
      doctorId: u.doctor?.id,
      specialization: u.doctor?.specialization,
      mustChangePassword: u.mustChangePassword,
    }));

    return {
      currentUser: req.authUser ?? formatted.find((user) => user.email === 'patient1@example.com'),
      demoUsers: formatted,
    };
  });

  // 6. Switch or quick-login user (for testing and demo bar)
  fastify.post('/api/auth/switch', async (req, reply) => {
    if (process.env.NODE_ENV === 'production' && process.env.DEMO_AUTH_ENABLED !== 'true') {
      return reply.status(403).send({ error: 'Demo login is disabled.' });
    }
    const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const { userId } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, patient: true, doctor: true },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      patientId: user.patient?.id,
      mrn: user.patient?.mrn,
      doctorId: user.doctor?.id,
      mustChangePassword: user.mustChangePassword,
    };

    const token = fastify.jwt.sign({ sub: user.id }, { expiresIn: '8h' });
    reply.header(
      'Set-Cookie',
      `hospital_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
    );
    return {
      token,
      message: `Switched session to ${user.name} (${user.role.name})`,
      user: authUser,
    };
  });

  // 7. Current authenticated user profile
  fastify.get('/api/auth/me', async (req, reply) => {
    return { user: req.authUser };
  });
}
