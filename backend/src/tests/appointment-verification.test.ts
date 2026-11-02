import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthUser, ToolExecutionResult } from '@hospital/shared';
import { appointmentVerificationText, readOnlyAppointmentId } from '../../../packages/agents/src/appointmentVerification.js';
import { createServer } from '../index.js';
import { prisma } from '../db.js';

const appointmentId = '954770a2-5466-497d-9af9-83681f747286';
let app: FastifyInstance;
let owner: AuthUser;
const conversations: string[] = [];

function result(data: object | null): ToolExecutionResult {
  return { toolName: 'get_appointment_by_id', callId: randomUUID(), success: true, data, durationMs: 0 };
}

async function verify(user: AuthUser, id: string, conversationId: string | undefined): Promise<string> {
  const requestId = randomUUID();
  const response = await app.inject({ method: 'POST', url: '/api/chat/stream', headers: { authorization: `Bearer ${app.jwt.sign({ sub: user.id })}` }, payload: {
    agentId: 'appointment-agent', requestId, conversationId,
    prompt: `Verify existing appointment ID ${id}. Show details, availability and duplicates. Do not book, reschedule or cancel.`,
  } });
  const block = response.body.split('\n\n').find((entry) => entry.startsWith('event: done\n'));
  if (!block) throw new Error(`Verification did not complete: ${response.body}`);
  const done = z.object({ response: z.string(), conversationId: z.string().uuid() }).parse(JSON.parse(block.slice(block.indexOf('data: ') + 6)));
  conversations.push(done.conversationId);
  const execution = await prisma.agentExecution.findUniqueOrThrow({ where: { id: requestId } });
  const message = await prisma.message.findFirstOrThrow({ where: { conversationId: done.conversationId, senderRole: 'assistant', content: done.response }, orderBy: { createdAt: 'desc' } });
  const calls = z.array(z.object({ toolName: z.string() })).parse(JSON.parse(message.toolCalls!));
  expect(calls.every((call) => ['get_appointment_by_id', 'get_available_slots'].includes(call.toolName))).toBe(true);
  expect(execution.status).toBe('SUCCESS');
  return done.response;
}

beforeAll(async () => {
  app = (await createServer()).server;
  await app.ready();
  const record = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { patient: { include: { user: true } } } });
  owner = { id: record.patient.user.id, name: record.patient.user.name, email: record.patient.user.email, role: 'PATIENT', patientId: record.patientId };
});

afterAll(async () => {
  await prisma.conversation.deleteMany({ where: { id: { in: conversations } } });
  await app.close();
  await prisma.$disconnect();
});

describe('Read-only appointment verification', () => {
  it('verifies the supplied actual appointment and database occupancy without mutations', async () => {
    const record = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { patient: { include: { user: true } }, doctor: { include: { user: true } } } });
    const output = await verify(owner, appointmentId, undefined);
    for (const value of [record.id, record.status, record.patient.user.name, record.doctor.user.name, record.startTime.toISOString(), record.reason!]) expect(output).toContain(value);
    const occupied = await prisma.appointment.count({ where: { doctorId: record.doctorId, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] }, startTime: { lte: record.startTime }, endTime: { gt: record.startTime } } });
    expect(output).toContain(occupied ? 'OCCUPIED' : 'UNAVAILABLE');
    expect(output).toContain('Duplicate active bookings:** 0');
  });

  it('reports NOT FOUND when execution succeeds without a record', async () => {
    expect(await verify(owner, randomUUID(), undefined)).toContain('NOT FOUND');
    expect(appointmentVerificationText(appointmentId, result(null))).toContain('NOT FOUND');
  });

  it('denies unauthorized lookup without record details', async () => {
    const other = await prisma.user.findFirstOrThrow({ where: { patient: { id: { not: owner.patientId } } }, include: { patient: true } });
    const output = await verify({ id: other.id, name: other.name, email: other.email, role: 'PATIENT', patientId: other.patient!.id }, appointmentId, undefined);
    expect(output).toContain('Authorization failure');
    expect(output).not.toContain(appointmentId);
    expect(output).not.toContain(owner.name);
  });

  it('renders only supplied fields and rejects mismatching records', () => {
    const output = appointmentVerificationText(appointmentId, result({ appointmentId, status: 'SCHEDULED' }));
    expect(output).toContain('Status:** SCHEDULED');
    for (const field of ['Patient', 'Doctor', 'Time', 'Visit reason', 'Duplicate active bookings']) expect(output).toContain(`${field}:** NOT VERIFIED`);
    expect(appointmentVerificationText(appointmentId, result({ appointmentId: randomUUID(), patientName: 'Private' }))).not.toContain('Private');
  });

  it('verifies after a previous booking without replaying its mutation', async () => {
    const conversation = await prisma.conversation.create({ data: { userId: owner.id, agentId: 'appointment-agent', messages: { create: { senderRole: 'user', content: 'Book an appointment for me.' } } } });
    conversations.push(conversation.id);
    expect(await verify(owner, appointmentId, conversation.id)).toContain(appointmentId);
    expect(readOnlyAppointmentId(`Verify appointment ${appointmentId}. Do not book, reschedule or cancel.`)).toBe(appointmentId);
    expect(readOnlyAppointmentId(`Cancel appointment ${appointmentId}`)).toBeUndefined();
  });
});
