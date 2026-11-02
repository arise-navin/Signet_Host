import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FastifyInstance } from 'fastify';
import { AGENT_IDS, AuthUser } from '@hospital/shared';
import { appointmentHistoryContent, appointmentReference, appointmentScope, appointmentSupportIntentSchema, getAppointmentsTool, hospitalDate, hospitalTimezone, localTimeToUtc, rememberAppointmentList, resolveAppointmentReference, selectedAppointment, ToolExecutor } from '@hospital/agents';
import { createServer } from '../index.js';
import { prisma } from '../db.js';

const fullSelection = 'Please create a MEDIUM priority support ticket for appointment #1. The issue is a scheduling conflict and I need assistance rescheduling. Do not reschedule it automatically. Create the ticket and give me the ticket ID.';
let server: FastifyInstance;
let patient: AuthUser;
let other: AuthUser;
let doctor: AuthUser;
let admin: AuthUser;
let receptionist: AuthUser;
let missingPatient: AuthUser;
let secondDoctorId: string;
let departmentId: string;
let otherDepartmentId: string;
let date: string;
const users: string[] = [];
const appointments: string[] = [];
const executor = new ToolExecutor();

function headers(user: AuthUser): { authorization: string } { return { authorization: `Bearer ${server.jwt.sign({ sub: user.id })}` }; }
function completed(body: string): { conversationId: string; response: string } {
  const event = body.split('\n\n').find((block) => block.startsWith('event: done\n'));
  if (!event) throw new Error(`Chat failed: ${body}`);
  return z.object({ conversationId: z.string().uuid(), response: z.string() }).parse(JSON.parse(event.slice(event.indexOf('data: ') + 6)));
}
async function chat(user: AuthUser, prompt: string, conversationId: string | undefined, requestId: string): Promise<string> {
  const response = await server.inject({ method: 'POST', url: '/api/chat/stream', headers: headers(user), payload: { prompt, conversationId, requestId, agentId: AGENT_IDS.APPOINTMENT } });
  expect(response.statusCode).toBe(200);
  return response.body;
}
async function savedList(user: AuthUser, ids: string[]): Promise<{ conversationId: string; listId: string }> {
  const conversation = await prisma.conversation.create({ data: { userId: user.id, agentId: AGENT_IDS.APPOINTMENT } });
  const choices = await Promise.all(ids.map((id) => selectedAppointment(id, user, prisma)));
  const listId = await rememberAppointmentList(conversation.id, user, await appointmentScope(user, prisma), choices, prisma);
  await prisma.displayedAppointmentList.update({ where: { id: listId }, data: { publishedAt: new Date() } });
  return { conversationId: conversation.id, listId };
}

beforeAll(async () => {
  server = (await createServer()).server;
  await server.ready();
  const departments = await prisma.department.findMany({ take: 2, orderBy: { id: 'asc' } });
  departmentId = departments[0].id;
  otherDepartmentId = departments[1].id;
  for (const [role, name] of [['PATIENT', 'Selection patient'], ['PATIENT', 'Other selection patient'], ['DOCTOR', 'Selection doctor'], ['DOCTOR', 'Other selection doctor'], ['ADMIN', 'Scoped selection admin'], ['RECEPTIONIST', 'Scoped selection receptionist'], ['PATIENT', 'Missing profile selection user']] as const) {
    const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    const user = await prisma.user.create({ data: { name: `Synthetic ${name}`, email: `selection-${randomUUID()}@example.test`, passwordHash: 'not-a-login', roleId: roleRow.id } });
    users.push(user.id);
    const auth: AuthUser = { id: user.id, name: user.name, email: user.email, role };
    if (role === 'PATIENT' && name !== 'Missing profile selection user') {
      const profile = await prisma.patient.create({ data: { userId: user.id, mrn: `SEL-${randomUUID()}`, dateOfBirth: new Date('1990-01-01T00:00:00Z'), gender: 'Other', phone: '555-0100' } });
      auth.patientId = profile.id;
      if (name === 'Selection patient') patient = auth; else other = auth;
    } else if (role === 'DOCTOR') {
      const profile = await prisma.doctor.create({ data: { userId: user.id, departmentId: name === 'Selection doctor' ? departmentId : otherDepartmentId, specialization: 'Synthetic selection tests', licenseNumber: randomUUID(), availabilities: { create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: name === 'Selection doctor' ? '09:00' : '09:15', endTime: name === 'Selection doctor' ? '17:00' : '17:15', slotMinutes: 30 })) } } });
      auth.doctorId = profile.id;
      if (name === 'Selection doctor') doctor = auth; else secondDoctorId = profile.id;
    } else if (role === 'ADMIN') admin = auth;
    else if (role === 'RECEPTIONIST') receptionist = auth;
    else missingPatient = auth;
  }
  date = hospitalDate(new Date(Date.now() + 45 * 86400000));
  for (const time of ['10:00', '11:00']) {
    const startTime = localTimeToUtc(date, time, hospitalTimezone());
    appointments.push((await prisma.appointment.create({ data: { patientId: patient.patientId!, doctorId: doctor.doctorId!, startTime, endTime: new Date(startTime.getTime() + 1800000), reason: 'Synthetic selection fixture' } })).id);
  }
  const startTime = localTimeToUtc(date, '12:15', hospitalTimezone());
  appointments.push((await prisma.appointment.create({ data: { patientId: other.patientId!, doctorId: secondDoctorId, startTime, endTime: new Date(startTime.getTime() + 1800000), reason: 'Synthetic unrelated selection fixture' } })).id);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
  await prisma.supportTicket.deleteMany({ where: { createdById: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await server.close();
  await prisma.$disconnect();
});

describe('Appointment references and scheduling authorization', () => {
  it('recognizes appointment #1 inside the complete reported sentence and rejects ambiguous numbers', () => {
    expect(appointmentReference(fullSelection)).toEqual({ kind: 'NUMBER', itemNumber: 1 });
    expect(appointmentReference('Please select appointment #1 or appointment #2.')).toEqual({ kind: 'AMBIGUOUS' });
  });

  it('resolves a prior normal appointment list before lookup, preserves its number after rows change, and creates one ticket without rescheduling', async () => {
    const first = completed(await chat(patient, 'Show my upcoming appointments.', undefined, randomUUID()));
    const list = await prisma.displayedAppointmentList.findFirstOrThrow({ where: { conversationId: first.conversationId, publishedAt: { not: null } }, orderBy: { createdAt: 'desc' } });
    const displayedMessage = await prisma.message.findFirstOrThrow({ where: { conversationId: first.conversationId, senderRole: 'assistant' } });
    expect(displayedMessage.content).toContain(patient.name);
    expect(appointmentHistoryContent(displayedMessage)).not.toContain(patient.name);
    expect(list.userId).toBe(patient.id);
    expect(z.array(z.object({ itemNumber: z.number(), appointmentId: z.string() })).parse(list.items)[0].appointmentId).toBe(appointments[0]);
    const earlier = localTimeToUtc(date, '09:00', hospitalTimezone());
    await prisma.appointment.create({ data: { patientId: patient.patientId!, doctorId: doctor.doctorId!, startTime: earlier, endTime: new Date(earlier.getTime() + 1800000), reason: 'Synthetic newly added earlier appointment' } });
    const original = await prisma.appointment.findUniqueOrThrow({ where: { id: appointments[0] } });
    const requestId = randomUUID();
    const response = completed(await chat(patient, fullSelection, first.conversationId, requestId));
    const state = appointmentSupportIntentSchema.parse((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).ticketIntent);
    expect(state.displayedListId).toBe(list.id);
    expect(state.appointmentId).toBe(appointments[0]);
    expect(state.conversationId).toBe(first.conversationId);
    expect(state.requestedAction).toBe('CREATE_SUPPORT_TICKET');
    expect(state.currentStep).toBe('COMPLETED');
    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: state.ticketId! } });
    expect(ticket.appointmentId).toBe(appointments[0]);
    expect(ticket.priority).toBe('MEDIUM');
    expect(ticket.description).toContain('scheduling conflict');
    expect(response.response).toContain(ticket.id);
    expect(await prisma.toolExecution.count({ where: { executionId: requestId, toolName: 'get_appointments' } })).toBe(0);
    expect(await prisma.appointment.findUnique({ where: { id: appointments[0] } })).toEqual(original);
    expect(completed(await chat(patient, fullSelection, first.conversationId, requestId)).response).toBe(response.response);
    expect(await prisma.supportTicket.count({ where: { id: ticket.id } })).toBe(1);
    const handoff = await prisma.auditLog.findFirstOrThrow({ where: { action: 'AGENT_HANDOFF', resourceId: requestId } });
    expect(handoff.userId).toBe(patient.id);
    expect(handoff.details).toContain(appointments[0]);
  }, 120000);

  it('unpublished, expired and ambiguous earlier lists cannot be used as a reference', async () => {
    const snapshot = await savedList(patient, appointments.slice(0, 2));
    const scope = await appointmentScope(patient, prisma);
    await prisma.displayedAppointmentList.update({ where: { id: snapshot.listId }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await resolveAppointmentReference('appointment #1', snapshot.conversationId, patient, scope, prisma)).kind).toBe('UNAVAILABLE');
    const second = await rememberAppointmentList(snapshot.conversationId, patient, scope, await Promise.all([appointments[1], appointments[0]].map((id) => selectedAppointment(id, patient, prisma))), prisma);
    expect((await resolveAppointmentReference('#1', snapshot.conversationId, patient, scope, prisma)).kind).toBe('UNAVAILABLE');
    await prisma.displayedAppointmentList.update({ where: { id: second }, data: { publishedAt: new Date() } });
    expect((await resolveAppointmentReference('appointment #1 from the previous list', snapshot.conversationId, patient, scope, prisma)).kind).toBe('UNAVAILABLE');
    expect((await prisma.displayedAppointmentList.findUniqueOrThrow({ where: { id: snapshot.listId } })).items).toEqual([
      { itemNumber: 1, appointmentId: appointments[0] }, { itemNumber: 2, appointmentId: appointments[1] },
    ]);
  });

  it('an unavailable old number requires fresh confirmation even when only one upcoming appointment exists', async () => {
    const snapshot = await savedList(other, [appointments[2]]);
    await prisma.displayedAppointmentList.update({ where: { id: snapshot.listId }, data: { expiresAt: new Date(Date.now() - 1) } });
    const response = await chat(other, fullSelection, snapshot.conversationId, randomUUID());
    expect(completed(response).response).toContain('Please confirm');
    expect(response).toContain('AWAITING_INPUT');
    expect(await prisma.supportTicket.count({ where: { createdById: other.id } })).toBe(0);
  }, 120000);

  it('patients see only their own rows in the tool and REST endpoint, including forged patient filters', async () => {
    const rows = await getAppointmentsTool.execute({}, { authUser: patient, agentId: AGENT_IDS.APPOINTMENT }, prisma);
    expect(rows.every((row: { patientId: string }) => row.patientId === patient.patientId)).toBe(true);
    expect((await server.inject({ method: 'GET', url: `/api/appointments?patientId=${other.patientId}`, headers: headers(patient) })).statusCode).toBe(403);
    await expect(getAppointmentsTool.execute({ patientId: other.patientId }, { authUser: patient, agentId: AGENT_IDS.APPOINTMENT }, prisma)).rejects.toThrow('403');
    expect((await server.inject({ method: 'GET', url: '/api/appointments', headers: headers(missingPatient) })).statusCode).toBe(403);
  });

  it('doctors cannot list outside their assigned schedule or link another practice appointment to a ticket', async () => {
    const response = await server.inject({ method: 'GET', url: `/api/appointments?doctorId=${secondDoctorId}`, headers: headers(doctor) });
    const rows = z.object({ appointments: z.array(z.object({ doctorId: z.string() })) }).parse(response.json()).appointments;
    expect(rows.every((row) => row.doctorId === doctor.doctorId)).toBe(true);
    const result = await executor.executeTool('create_support_ticket', { appointmentId: appointments[2], category: 'Appointments', subject: 'Unauthorized scope', description: 'Attempt to link another practice appointment.', priority: 'MEDIUM' }, { authUser: doctor, agentId: AGENT_IDS.CARE }, prisma, randomUUID());
    expect(result.statusCode).toBe(403);
  });

  it('admin and receptionist appointment access is denied by default and restricted to explicit department grants', async () => {
    for (const user of [admin, receptionist]) {
      expect(await getAppointmentsTool.execute({}, { authUser: user, agentId: AGENT_IDS.APPOINTMENT }, prisma)).toEqual([]);
      await prisma.schedulingDepartmentAccess.create({ data: { userId: user.id, departmentId } });
      const response = await server.inject({ method: 'GET', url: `/api/appointments?patientId=${patient.patientId}`, headers: headers(user) });
      const rows = z.object({ appointments: z.array(z.object({ doctorId: z.string() })) }).parse(response.json()).appointments;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.doctorId === doctor.doctorId)).toBe(true);
      const result = await executor.executeTool('create_support_ticket', { appointmentId: appointments[2], category: 'Appointments', subject: 'Wrong department', description: 'Appointment outside the granted department.', priority: 'MEDIUM' }, { authUser: user, agentId: AGENT_IDS.CARE }, prisma, randomUUID());
      expect(result.statusCode).toBe(403);
    }
  });

  it('revoked department scope and another user or conversation cannot reuse a displayed mapping', async () => {
    const snapshot = await savedList(admin, [appointments[0]]);
    await prisma.schedulingDepartmentAccess.delete({ where: { userId_departmentId: { userId: admin.id, departmentId } } });
    expect((await resolveAppointmentReference('appointment #1', snapshot.conversationId, admin, await appointmentScope(admin, prisma), prisma)).kind).toBe('UNAVAILABLE');
    expect((await resolveAppointmentReference('appointment #1', snapshot.conversationId, other, await appointmentScope(other, prisma), prisma)).kind).toBe('UNAVAILABLE');
    const different = await prisma.conversation.create({ data: { userId: patient.id, agentId: AGENT_IDS.APPOINTMENT } });
    expect((await resolveAppointmentReference('appointment #1', different.id, patient, await appointmentScope(patient, prisma), prisma)).kind).toBe('UNAVAILABLE');
  });

  it('concurrent overlapping bookings for one patient across different doctors cannot both succeed', async () => {
    const bookingDate = hospitalDate(new Date(Date.now() + 46 * 86400000));
    const results = await Promise.all([
      { doctorId: doctor.doctorId!, startTime: localTimeToUtc(bookingDate, '09:00', hospitalTimezone()).toISOString() },
      { doctorId: secondDoctorId, startTime: localTimeToUtc(bookingDate, '09:15', hospitalTimezone()).toISOString() },
    ].map((args) => executor.executeTool('book_appointment', { ...args, reason: 'Synthetic patient concurrency test' }, { authUser: patient, agentId: AGENT_IDS.APPOINTMENT, requestId: randomUUID() }, prisma, randomUUID())));
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success)?.statusCode).toBe(409);
  });

  it('database indexes reject direct exact doctor-slot and patient-slot duplicates', async () => {
    const original = await prisma.appointment.findUniqueOrThrow({ where: { id: appointments[0] } });
    await expect(prisma.appointment.create({ data: { patientId: other.patientId!, doctorId: original.doctorId, startTime: original.startTime, endTime: original.endTime, reason: 'Synthetic direct doctor duplicate' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.appointment.create({ data: { patientId: patient.patientId!, doctorId: secondDoctorId, startTime: original.startTime, endTime: original.endTime, reason: 'Synthetic direct patient duplicate' } })).rejects.toMatchObject({ code: 'P2002' });
  });
});
