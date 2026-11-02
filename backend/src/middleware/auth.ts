import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { AuthUser } from '@hospital/shared';

declare module 'fastify' {
  interface FastifyRequest { authUser?: AuthUser; }
}

const sessionSchema = z.object({ sub: z.string().uuid() });
const publicRoutes = new Set([
  '/api/health',
  '/api/auth/demo-users',
  '/api/auth/switch',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
]);

/** Demo login and real auth issues a signed, expiring session; IDs and role claims from requests never grant access. */
export async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const path = req.url.split('?')[0];
  if (req.method === 'OPTIONS') return;
  const origin = req.headers.origin;
  if (origin && origin !== (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')) {
    reply.status(403).send({ error: 'Forbidden request origin.' });
    return;
  }
  // Login and health must remain usable when an old cookie has expired.
  if (publicRoutes.has(path)) return;
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('hospital_session='))?.slice('hospital_session='.length);
  const token = bearer ?? cookie;
  if (!token) {
    if (!publicRoutes.has(path)) reply.status(401).send({ error: 'Authentication required. Sign in to continue.' });
    return;
  }
  let subject: string;
  try {
    subject = sessionSchema.parse(req.server.jwt.verify(token)).sub;
  } catch (error) {
    req.log.warn({ requestId: req.id, reason: error instanceof Error ? error.message : String(error) }, 'Session verification failed');
    reply.status(401).send({ error: 'Invalid or expired session. Sign in again.' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: subject }, include: { role: true, patient: true, doctor: true } });
  if (!user) {
    reply.status(401).send({ error: 'Session account no longer exists.' });
    return;
  }
  req.authUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    patientId: user.patient?.id,
    doctorId: user.doctor?.id,
    mustChangePassword: user.mustChangePassword,
  };
}
