import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FastifyInstance } from 'fastify';
import { ticketLookupTools, AgentRouter, ToolExecutor, appointmentSupportIntentSchema, hospitalDate, hospitalTimezone, localTimeToUtc } from '@hospital/agents';
import { AGENT_IDS, AuthUser, activityFromToolResult, supportTicketListSchema, ticketReceiptSchema } from '@hospital/shared';
import { createServer } from '../index.js';
import { prisma } from '../db.js';

const reportedPrompt = 'I need to reschedule my appointment because I have a scheduling conflict. Please create a support ticket for my upcoming appointment. Priority: Medium. If you need an appointment ID, show me my upcoming appointments first.';
let app: FastifyInstance;
let patient: AuthUser;
let doctor: AuthUser;
let other: AuthUser;
let appointmentIds: string[];
let otherAppointmentId: string;
const userIds: string[] = [];
const executor = new ToolExecutor();

function headers(user: AuthUser): { authorization: string } {
  return { authorization: `Bearer ${app.jwt.sign({ sub: user.id })}` };
}

const doneSchema = z.object({ response: z.string(), agentId: z.string(), conversationId: z.string().uuid() });
function done(body: string): z.infer<typeof doneSchema> {
  const block = body.split('\n\n').find((event) => event.startsWith('event: done\n'));
  if (!block) throw new Error(`Support chat did not complete: ${body}`);
  return doneSchema.parse(JSON.parse(block.slice(block.indexOf('data: ') + 6)));
}

async function chat(user: AuthUser, prompt: string, conversationId: string | undefined, requestId: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/chat/stream', headers: headers(user), payload: { prompt, agentId: AGENT_IDS.APPOINTMENT, conversationId, requestId } });
  expect(response.statusCode).toBe(200);
  return response.body;
}

beforeAll(async () => {
  app = (await createServer()).server;
  await app.ready();
  const patientRole = await prisma.role.findUniqueOrThrow({ where: { name: 'PATIENT' } });
  const doctorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'DOCTOR' } });
  const department = await prisma.department.findFirstOrThrow();
  const physician = await prisma.user.create({ data: { name: 'Synthetic Support Doctor', email: `support-doctor-${randomUUID()}@example.test`, passwordHash: 'not-a-login', roleId: doctorRole.id, doctor: { create: { departmentId: department.id, specialization: 'Synthetic support testing', licenseNumber: randomUUID() } } }, include: { doctor: true } });
  doctor = { id: physician.id, name: physician.name, email: physician.email, role: 'DOCTOR', doctorId: physician.doctor!.id };
  userIds.push(doctor.id);
  for (const name of ['Synthetic Support Patient', 'Synthetic Other Patient']) {
    const user = await prisma.user.create({ data: { name, email: `support-patient-${randomUUID()}@example.test`, passwordHash: 'not-a-login', roleId: patientRole.id, patient: { create: { mrn: `SUP-${randomUUID()}`, dateOfBirth: new Date('1990-01-01T00:00:00Z'), gender: 'Other', phone: '555-0100' } } }, include: { patient: true } });
    const auth: AuthUser = { id: user.id, name, email: user.email, role: 'PATIENT', patientId: user.patient!.id };
    userIds.push(user.id);
    if (name === 'Synthetic Support Patient') patient = auth; else other = auth;
  }
  const date = hospitalDate(new Date(Date.now() + 25 * 86400000));
  appointmentIds = [];
  for (const time of ['10:00', '11:00']) {
    const startTime = localTimeToUtc(date, time, hospitalTimezone());
    const appointment = await prisma.appointment.create({ data: { patientId: patient.patientId!, doctorId: doctor.doctorId!, startTime, endTime: new Date(startTime.getTime() + 1800000), reason: 'Synthetic support selection fixture' } });
    appointmentIds.push(appointment.id);
  }
  const unrelatedDoctor = await prisma.doctor.findFirstOrThrow({ where: { id: { not: doctor.doctorId } } });
  const startTime = localTimeToUtc(date, '12:00', hospitalTimezone());
  otherAppointmentId = (await prisma.appointment.create({ data: { patientId: other.patientId!, doctorId: unrelatedDoctor.id, startTime, endTime: new Date(startTime.getTime() + 1800000), reason: 'Synthetic unauthorized support fixture' } })).id;
});

afterAll(async () => {
  const tickets = await prisma.supportTicket.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { action: 'IDEMPOTENCY_RESULT', details: { in: tickets.map((ticket) => JSON.stringify({ resultId: ticket.id })) } }] } });
  await prisma.supportTicket.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.conversation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
  await prisma.$disconnect();
});

describe('Appointment support ticket workflow', () => {
  it('offers an unlinked ticket when the numbered reference has no appointments, persists confirmation and returns one real receipt', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'DOCTOR' } });
    const department = await prisma.department.findFirstOrThrow();
    const user = await prisma.user.create({ data: { name: 'Synthetic Empty Schedule Doctor', email: `empty-schedule-${randomUUID()}@example.test`, passwordHash: 'not-a-login', roleId: role.id, doctor: { create: { departmentId: department.id, specialization: 'Testing', licenseNumber: randomUUID() } } }, include: { doctor: true } });
    userIds.push(user.id);
    const auth: AuthUser = { id: user.id, name: user.name, email: user.email, role: 'DOCTOR', doctorId: user.doctor!.id };
    const prompt = 'Please create a MEDIUM priority support ticket for appointment #1. The issue is a scheduling conflict and I need assistance rescheduling. Do not reschedule it automatically. Create the ticket and give me the ticket ID.';
    const first = done(await chat(auth, prompt, undefined, randomUUID()));
    expect(first.response).toContain('cannot verify');
    expect(await prisma.supportTicket.count({ where: { createdById: auth.id } })).toBe(0);
    const pending = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).ticketIntent);
    expect(pending.currentStep).toBe('AWAITING_GENERAL_CONFIRMATION');
    expect(pending.generalConfirmed).toBe(false);
    const refresh = await app.inject({ method: 'GET', url: `/api/chat/conversations/${first.conversationId}/messages`, headers: headers(auth) });
    expect(refresh.statusCode).toBe(200);
    const requestId = randomUUID();
    const final = done(await chat(auth, 'Yes', first.conversationId, requestId));
    const state = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).ticketIntent);
    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: state.ticketId! } });
    expect(ticket).toMatchObject({ createdById: auth.id, patientId: null, appointmentId: null, category: 'APPOINTMENT_ASSISTANCE', priority: 'MEDIUM', status: 'OPEN', description: prompt });
    expect(final.response).toContain(ticket.id);
    expect(state.generalConfirmed).toBe(true);
    expect(done(await chat(auth, 'Yes', first.conversationId, requestId)).response).toBe(final.response);
    expect(await prisma.supportTicket.count({ where: { createdById: auth.id } })).toBe(1);
    expect(await prisma.toolExecution.count({ where: { executionId: requestId, toolName: { in: ['get_appointments', 'reschedule_appointment'] } } })).toBe(0);
  }, 120000);

  it('explicit general appointment assistance creates an unlinked ticket without an appointment lookup', async () => {
    const requestId = randomUUID();
    const final = done(await chat(patient, 'Create a general appointment assistance support ticket without an appointment association. MEDIUM priority. Scheduling conflict; I need rescheduling assistance, not automatic rescheduling.', undefined, requestId));
    const state = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: final.conversationId } })).ticketIntent);
    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: state.ticketId! } });
    expect(ticket).toMatchObject({ createdById: patient.id, patientId: patient.patientId, appointmentId: null, category: 'APPOINTMENT_ASSISTANCE', priority: 'MEDIUM' });
    expect(final.response).toContain(ticket.id);
    expect(await prisma.toolExecution.count({ where: { executionId: requestId, toolName: { in: ['get_appointments', 'reschedule_appointment'] } } })).toBe(0);
  }, 120000);

  it('reuses an identical logical submission while allowing explicitly separate tickets and request-key replay', async () => {
    const prompt = `Create a general appointment assistance support ticket. MEDIUM priority. Description: Synthetic idempotency check ${randomUUID()}.`;
    const first = done(await chat(patient, prompt, undefined, randomUUID()));
    const firstState = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).ticketIntent);
    const repeat = done(await chat(patient, prompt, first.conversationId, randomUUID()));
    expect(repeat.response).toContain(firstState.ticketId!);
    expect(await prisma.supportTicket.count({ where: { createdById: patient.id, description: prompt } })).toBe(1);
    const newPrompt = `Create a separate general appointment assistance support ticket. MEDIUM priority. Description: A genuinely separate request ${randomUUID()}.`;
    const second = done(await chat(patient, newPrompt, first.conversationId, randomUUID()));
    const secondState = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).ticketIntent);
    const thirdRequestId = randomUUID();
    const third = done(await chat(patient, newPrompt, first.conversationId, thirdRequestId));
    const thirdState = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).ticketIntent);
    expect(new Set([firstState.ticketId, secondState.ticketId, thirdState.ticketId]).size).toBe(3);
    expect(second.response).toContain(secondState.ticketId!);
    expect(third.response).toContain(thirdState.ticketId!);
    expect(done(await chat(patient, newPrompt, first.conversationId, thirdRequestId)).response).toBe(third.response);
    expect(await prisma.supportTicket.count({ where: { createdById: patient.id, description: newPrompt } })).toBe(2);
  }, 120000);

  it('lists persisted tickets only for their owner with authenticated pagination and matching dashboard count', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/support-tickets' })).statusCode).toBe(401);
    const args = { category: 'General Inquiry', subject: 'Synthetic dashboard visibility', description: `Synthetic persistent dashboard request ${randomUUID()}`, priority: 'MEDIUM' };
    const result = await executor.executeTool('create_support_ticket', args, { authUser: patient, agentId: AGENT_IDS.CARE, requestId: randomUUID() }, prisma, randomUUID());
    expect(result.success).toBe(true);
    const receipt = ticketReceiptSchema.parse(result.data);
    const response = await app.inject({ method: 'GET', url: '/api/support-tickets?limit=100', headers: headers(patient) });
    expect(response.statusCode).toBe(200);
    const list = supportTicketListSchema.parse(response.json());
    expect(list.total).toBe(await prisma.supportTicket.count({ where: { createdById: patient.id } }));
    expect(list.tickets.find((ticket) => ticket.id === receipt.ticketId)).toMatchObject({ status: 'OPEN', priority: 'MEDIUM', appointmentId: null, description: args.description });
    const otherList = supportTicketListSchema.parse((await app.inject({ method: 'GET', url: '/api/support-tickets?limit=100', headers: headers(other) })).json());
    expect(otherList.tickets.some((ticket) => ticket.id === receipt.ticketId)).toBe(false);
    expect((await app.inject({ method: 'GET', url: `/api/support-tickets/${receipt.ticketId}`, headers: headers(other) })).statusCode).toBe(403);
    const stats = (await app.inject({ method: 'GET', url: '/api/dashboard/stats', headers: headers(patient) })).json();
    expect(stats.metrics.activeTickets).toBe(await prisma.supportTicket.count({ where: { createdById: patient.id, status: 'OPEN' } }));
    expect((await app.inject({ method: 'GET', url: '/api/support-tickets?limit=0', headers: headers(patient) })).statusCode).toBe(400);
  });

  it('authoritative creation and owner/staff read tools use saved data without creating lookup tickets', async () => {
    const final = done(await chat(patient, `Create a general support ticket. MEDIUM priority. Description: Synthetic authoritative receipt ${randomUUID()}.`, undefined, randomUUID()));
    const state = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: final.conversationId } })).ticketIntent);
    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: state.ticketId! } });
    expect(final.response).not.toContain(ticket.ticketNumber);
    expect(final.response).not.toContain('TICK-');
    expect(final.response.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)).toEqual([ticket.id]);
    const before = await prisma.supportTicket.count();
    const blocked = await executor.executeTool('create_support_ticket', { category: 'General Inquiry', subject: 'Read-only protection', description: 'No mutation is allowed in a lookup request.', priority: 'MEDIUM' }, { authUser: patient, agentId: AGENT_IDS.CARE, permittedTools: ticketLookupTools }, prisma, randomUUID());
    expect(blocked.statusCode).toBe(403);
    const read = await executor.executeTool('get_support_ticket', { ticketId: ticket.id }, { authUser: patient, agentId: AGENT_IDS.CARE }, prisma, randomUUID());
    expect(read.success).toBe(true);
    expect(read.data).toMatchObject({ id: ticket.id, status: ticket.status, priority: ticket.priority, category: ticket.category, createdAt: ticket.createdAt.toISOString() });
    expect((await executor.executeTool('get_support_ticket', { ticketId: ticket.id }, { authUser: other, agentId: AGENT_IDS.CARE }, prisma, randomUUID())).statusCode).toBe(403);
    expect((await executor.executeTool('get_support_ticket', { ticketId: ticket.id }, { authUser: doctor, agentId: AGENT_IDS.CARE }, prisma, randomUUID())).statusCode).toBe(403);
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { assignedTo: doctor.id } });
    expect((await executor.executeTool('get_support_ticket', { ticketId: ticket.id }, { authUser: doctor, agentId: AGENT_IDS.CARE }, prisma, randomUUID())).success).toBe(true);
    const listed = await executor.executeTool('list_my_support_tickets', {}, { authUser: patient, agentId: AGENT_IDS.CARE }, prisma, randomUUID());
    expect(listed.success).toBe(true);
    expect(supportTicketListSchema.shape.tickets.parse(listed.data).some((row) => row.id === ticket.id)).toBe(true);
    expect((await executor.executeTool('get_support_ticket', { ticketId: 'TICK-not-a-database-id' }, { authUser: patient, agentId: AGENT_IDS.CARE }, prisma, randomUUID())).statusCode).toBe(400);
    expect((await executor.executeTool('get_support_ticket', { ticketId: ticket.id }, { authUser: patient, agentId: AGENT_IDS.LAB }, prisma, randomUUID())).statusCode).toBe(403);
    const lookup = done(await chat(patient, `Show the status of support ticket ${ticket.id}. Do not create a ticket.`, final.conversationId, randomUUID()));
    expect(lookup.response).toContain(ticket.id);
    expect(lookup.response).toContain(ticket.status);
    expect(await prisma.supportTicket.count()).toBe(before);
  }, 120000);

  it('doctor discovery returns only assigned patients and lab authorization remains enforced', async () => {
    const result = await executor.executeTool('list_authorized_patients', {}, { authUser: doctor, agentId: AGENT_IDS.LAB }, prisma, randomUUID());
    expect(result.success).toBe(true);
    const patients = z.array(z.object({ patientId: z.string().uuid(), name: z.string() })).parse(result.data);
    expect(patients.map((row) => row.patientId)).toEqual([patient.patientId]);
    const allowed = await executor.executeTool('get_lab_status', { patientId: patient.patientId }, { authUser: doctor, agentId: AGENT_IDS.LAB }, prisma, randomUUID());
    expect(allowed.success).toBe(true);
    const denied = await executor.executeTool('get_lab_status', { patientId: other.patientId }, { authUser: doctor, agentId: AGENT_IDS.LAB }, prisma, randomUUID());
    expect(denied.statusCode).toBe(403);
    expect((await executor.executeTool('list_authorized_patients', {}, { authUser: patient, agentId: AGENT_IDS.LAB }, prisma, randomUUID())).statusCode).toBe(403);
  });

  it('availability binds the requested name to a real doctor profile and never executes a fabricated ID', async () => {
    const date = hospitalDate(new Date(Date.now() + 26 * 86400000));
    const result = await executor.executeTool('get_available_slots', { doctorName: doctor.name, date }, { authUser: patient, agentId: AGENT_IDS.APPOINTMENT }, prisma, randomUUID());
    expect(result.success).toBe(true);
    expect(result.data.doctorId).toBe(doctor.doctorId);
    expect((await executor.executeTool('get_available_slots', { doctorId: doctor.id, date }, { authUser: patient, agentId: AGENT_IDS.APPOINTMENT }, prisma, randomUUID())).statusCode).toBe(400);
    const requestId = randomUUID();
    done(await chat(patient, `Check available slots for ${doctor.name} on ${date}. Do not book an appointment.`, undefined, requestId));
    const calls = await prisma.toolExecution.findMany({ where: { executionId: requestId, toolName: 'get_available_slots' } });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.success)).toBe(true);
    expect(calls.every((call) => JSON.parse(call.result!).doctorId === doctor.doctorId)).toBe(true);
  }, 120000);

  it('1 routes the primary support intent to Care while respecting the selected starting agent', () => {
    const router = new AgentRouter();
    expect(router.routePrompt(reportedPrompt).targetAgentId).toBe(AGENT_IDS.CARE);
    expect(router.selectAgent(reportedPrompt, AGENT_IDS.APPOINTMENT).targetAgentId).toBe(AGENT_IDS.APPOINTMENT);
  });

  it('2-9 looks up appointments, clarifies, persists pending intent, hands off, and returns the real saved receipt', async () => {
    const originRequestId = randomUUID();
    const before = await prisma.supportTicket.count({ where: { createdById: patient.id } });
    const firstBody = await chat(patient, reportedPrompt, undefined, originRequestId);
    const first = done(firstBody);
    expect(first.agentId).toBe(AGENT_IDS.CARE);
    expect(firstBody).toContain('"status":"PLANNED"');
    expect(firstBody).toContain('"status":"RUNNING"');
    expect(firstBody).toContain('"status":"AWAITING_INPUT"');
    const pending = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).ticketIntent);
    expect(pending.description).toBe(reportedPrompt);
    expect(pending.priority).toBe('MEDIUM');
    expect(pending.candidateIds).toEqual(appointmentIds);
    expect(await prisma.supportTicket.count({ where: { createdById: patient.id } })).toBe(before);
    const lookup = await prisma.toolExecution.findFirstOrThrow({ where: { executionId: originRequestId, toolName: 'get_appointments' } });
    expect(lookup.agentId).toBe(AGENT_IDS.APPOINTMENT);
    expect(lookup.success).toBe(true);
    expect(await prisma.toolExecution.count({ where: { executionId: originRequestId, toolName: 'create_support_ticket' } })).toBe(0);
    const refreshed = await app.inject({ method: 'GET', url: `/api/chat/conversations/${first.conversationId}/messages`, headers: headers(patient) });
    expect(refreshed.statusCode).toBe(200);
    expect(JSON.stringify(refreshed.json())).toContain('AWAITING_INPUT');
    const selectionRequestId = randomUUID();
    const selectedBody = await chat(patient, '2', first.conversationId, selectionRequestId);
    const selected = done(selectedBody);
    const completed = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).ticketIntent);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.originRequestId).toBe(originRequestId);
    expect(completed.appointmentId).toBe(appointmentIds[1]);
    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: completed.ticketId! } });
    expect(ticket.appointmentId).toBe(appointmentIds[1]);
    expect(ticket.patientId).toBe(patient.patientId);
    expect(ticket.createdById).toBe(patient.id);
    expect(ticket.priority).toBe('MEDIUM');
    expect(ticket.status).toBe('OPEN');
    expect(ticket.description).toBe(reportedPrompt);
    expect(selected.response).toContain(ticket.id);
    expect(selected.response).toContain('OPEN');
    expect(selected.response).not.toContain("don't have a tool");
    const creation = await prisma.toolExecution.findFirstOrThrow({ where: { executionId: selectionRequestId, toolName: 'create_support_ticket' } });
    expect(creation.agentId).toBe(AGENT_IDS.CARE);
    expect(creation.success).toBe(true);
    expect(ticketReceiptSchema.parse(JSON.parse(creation.result!)).ticketId).toBe(ticket.id);
    const handoff = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: selectionRequestId, action: 'AGENT_HANDOFF' }, orderBy: { createdAt: 'desc' } });
    expect(handoff.userId).toBe(patient.id);
    expect(handoff.details).toContain(originRequestId);
    expect(handoff.details).toContain(appointmentIds[1]);
    const saved = await app.inject({ method: 'GET', url: `/api/support-tickets/${ticket.id}`, headers: headers(patient) });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().ticketId).toBe(ticket.id);
    expect((await app.inject({ method: 'GET', url: `/api/support-tickets/${ticket.id}`, headers: headers(other) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/support-tickets/${ticket.id}` })).statusCode).toBe(401);
    const replay = await chat(patient, '2', first.conversationId, selectionRequestId);
    expect(done(replay).response).toBe(selected.response);
    expect(await prisma.supportTicket.count({ where: { createdById: patient.id } })).toBe(before + 1);
  }, 120000);

  it('10-11 failed real tool results produce Failed rather than a success step', async () => {
    const result = await executor.executeTool('create_support_ticket', { category: 'Appointments', subject: 'Select appointment first', description: 'No appointment has been selected yet.', priority: 'MEDIUM' }, { authUser: patient, agentId: AGENT_IDS.CARE }, prisma, randomUUID());
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(activityFromToolResult(result).status).toBe('FAILED');
  });

  it('12 repeated correlated submissions create exactly one ticket', async () => {
    const requestId = randomUUID();
    const operationId = randomUUID();
    const args = { category: 'Appointments', appointmentId: appointmentIds[0], subject: 'Synthetic retry support', description: 'Verify concurrent support request retries.', priority: 'MEDIUM' };
    const results = await Promise.all([1, 2].map(() => executor.executeTool('create_support_ticket', args, { authUser: patient, agentId: AGENT_IDS.CARE, requestId, ticketOperationId: operationId }, prisma, randomUUID())));
    const receipts = results.map((result) => ticketReceiptSchema.parse(result.data));
    expect(receipts[0].ticketId).toBe(receipts[1].ticketId);
    expect(await prisma.supportTicket.count({ where: { id: receipts[0].ticketId } })).toBe(1);
  });

  it('13 another patient appointment and unassigned doctor context cannot be linked', async () => {
    for (const user of [patient, doctor]) {
      const result = await executor.executeTool('create_support_ticket', { category: 'Appointments', appointmentId: otherAppointmentId, subject: 'Unauthorized appointment', description: 'This appointment belongs to another patient.', priority: 'MEDIUM' }, { authUser: user, agentId: AGENT_IDS.CARE }, prisma, randomUUID());
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
    }
    expect(await prisma.supportTicket.count({ where: { appointmentId: otherAppointmentId } })).toBe(0);
  });

  it('appointment agents still cannot call the Care mutation directly', async () => {
    const result = await executor.executeTool('create_support_ticket', { category: 'Appointments', appointmentId: appointmentIds[0], subject: 'Unauthorized agent', description: 'Must hand off to Care Coordinator.' }, { authUser: patient, agentId: AGENT_IDS.APPOINTMENT }, prisma, randomUUID());
    expect(result.statusCode).toBe(403);
    expect(result.success).toBe(false);
  });

  it('invalid priority and invalid appointment arguments are rejected before mutation', async () => {
    const before = await prisma.supportTicket.count({ where: { createdById: patient.id } });
    const result = await executor.executeTool('create_support_ticket', { category: 'Appointments', appointmentId: 'not-a-uuid', subject: 'Invalid request', description: 'Invalid priority and appointment.', priority: 'EXTREME' }, { authUser: patient, agentId: AGENT_IDS.CARE }, prisma, randomUUID());
    expect(result.statusCode).toBe(400);
    expect(await prisma.supportTicket.count({ where: { createdById: patient.id } })).toBe(before);
  });

  it('general Care ticket inference also returns the real ticket ID and status', async () => {
    const requestId = randomUUID();
    const response = await app.inject({ method: 'POST', url: '/api/chat/stream', headers: headers(patient), payload: { requestId, agentId: AGENT_IDS.CARE, prompt: 'Create a support ticket now. Category Billing, subject Synthetic billing assistance, description I need a staff explanation of my synthetic hospital bill. Priority MEDIUM.' } });
    const final = done(response.body);
    const tool = await prisma.toolExecution.findFirstOrThrow({ where: { executionId: requestId, toolName: 'create_support_ticket', success: true } });
    const receipt = ticketReceiptSchema.parse(JSON.parse(tool.result!));
    expect(final.response).toContain(receipt.ticketId);
    expect(final.response).toContain(receipt.status);
    expect(await prisma.supportTicket.findUnique({ where: { id: receipt.ticketId } })).not.toBeNull();
  }, 120000);

  it('a real inference outage after commit still reports the saved ticket rather than losing its receipt', async () => {
    const original = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
    const unavailable = (await createServer()).server;
    if (original === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = original;
    try {
      const response = await unavailable.inject({ method: 'POST', url: '/api/chat/stream', headers: headers(other), payload: { requestId: randomUUID(), agentId: AGENT_IDS.APPOINTMENT, prompt: 'Create a support ticket for my upcoming appointment. Priority: Medium.' } });
      const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { createdById: other.id, appointmentId: otherAppointmentId } });
      expect(response.body).toContain('event: error');
      expect(response.body).toContain(ticket.id);
      expect(response.body).toContain('OPEN');
      expect(response.body).toContain('"status":"SUCCEEDED"');
      expect(ticket.status).toBe('OPEN');
    } finally {
      await unavailable.close();
    }
  });

  it('doctor selection preserves doctor identity and associates the patient from the chosen schedule row', async () => {
    const first = done(await chat(doctor, reportedPrompt, undefined, randomUUID()));
    const final = done(await chat(doctor, '1', first.conversationId, randomUUID()));
    const state = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: final.conversationId } })).ticketIntent);
    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: state.ticketId! } });
    expect(ticket.createdById).toBe(doctor.id);
    expect(ticket.patientId).toBe(patient.patientId);
    expect(ticket.appointmentId).toBe(appointmentIds[0]);
  }, 120000);

  it('cancelling clarification records Skipped and creates no ticket', async () => {
    const first = done(await chat(patient, reportedPrompt, undefined, randomUUID()));
    const before = await prisma.supportTicket.count({ where: { createdById: patient.id } });
    const body = await chat(patient, 'cancel this ticket', first.conversationId, randomUUID());
    expect(done(body).conversationId).toBe(first.conversationId);
    expect(body).toContain('"status":"SKIPPED"');
    expect(await prisma.supportTicket.count({ where: { createdById: patient.id } })).toBe(before);
  }, 120000);
});
