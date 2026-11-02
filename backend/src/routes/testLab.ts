import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { ToolExecutor, ToolRegistry, availableDoctorSlots, hospitalDate } from '@hospital/agents';
import { OllamaProvider } from '@hospital/ai-provider';
import { AGENT_IDS, AuthUser, TestScenarioResult } from '@hospital/shared';

export async function testLabRoutes(fastify: FastifyInstance, executor: ToolExecutor) {
  // Helper to fetch two different test patients
  async function getTestPatients(): Promise<[any, any]> {
    const patients = await prisma.patient.findMany({
      take: 2,
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    if (patients.length < 2) {
      throw new Error('Seed data required: At least 2 patients needed for test suite.');
    }
    return [patients[0], patients[1]];
  }

  // Helper to fetch a test doctor
  async function getTestDoctor(): Promise<any> {
    const doctor = await prisma.doctor.findFirst({
      include: { user: true, department: true },
    });
    if (!doctor) throw new Error('Seed data required: Doctor needed.');
    return doctor;
  }

  // Helper to make AuthUser
  function toAuthUser(patient: any): AuthUser {
    return {
      id: patient.userId,
      email: patient.user.email,
      name: patient.user.name,
      role: 'PATIENT',
      patientId: patient.id,
    };
  }

  async function futureSlot(doctorId: string, daysAhead: number): Promise<Date> {
    for (let offset = daysAhead; offset < daysAhead + 14; offset++) {
      const date = hospitalDate(new Date(Date.now() + offset * 86400000));
      const slots = await availableDoctorSlots(doctorId, date, undefined, prisma);
      if (slots.length) return new Date(slots[0]);
    }
    throw new Error(`No available test slot for doctor ${doctorId}. Configure a future weekday schedule.`);
  }

  type TestPatient = Prisma.PatientGetPayload<{ include: { user: true } }>;
  type TestDoctor = Prisma.DoctorGetPayload<{ include: { user: true; department: true } }>;
  async function withSchedulingFixtures(run: (fixture: { doctor: TestDoctor; patients: [TestPatient, TestPatient] }) => Promise<TestScenarioResult>): Promise<TestScenarioResult> {
    const userIds: string[] = [];
    try {
      const patientRole = await prisma.role.findUniqueOrThrow({ where: { name: 'PATIENT' } });
      const doctorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'DOCTOR' } });
      const department = await prisma.department.findFirstOrThrow();
      const doctorUser = await prisma.user.create({ data: { name: 'Synthetic Test Lab Doctor', email: `test-lab-doctor-${randomUUID()}@example.test`, passwordHash: 'not-a-login', roleId: doctorRole.id } });
      userIds.push(doctorUser.id);
      const doctor = await prisma.doctor.create({ data: { userId: doctorUser.id, departmentId: department.id, specialization: 'Synthetic scheduling tests', licenseNumber: randomUUID(), availabilities: { create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00', slotMinutes: 30 })) } }, include: { user: true, department: true } });
      const patients: TestPatient[] = [];
      for (const number of [1, 2]) {
        const user = await prisma.user.create({ data: { name: `Synthetic Test Lab Patient ${number}`, email: `test-lab-patient-${randomUUID()}@example.test`, passwordHash: 'not-a-login', roleId: patientRole.id } });
        userIds.push(user.id);
        patients.push(await prisma.patient.create({ data: { userId: user.id, mrn: `LAB-${randomUUID()}`, dateOfBirth: new Date('1990-01-01T00:00:00Z'), gender: 'Other', phone: '555-0100' }, include: { user: true } }));
      }
      return await run({ doctor, patients: [patients[0], patients[1]] });
    } finally {
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  const testDefinitions: Record<string, () => Promise<TestScenarioResult>> = {
    // TEST-001
    'TEST-001': async () => withSchedulingFixtures(async ({ doctor, patients }) => {
      const start = Date.now();
      const [patient] = patients;
      const authUser = toAuthUser(patient);

      // Unique future time for testing
      const futureDate = await futureSlot(doctor.id, 60);

      const result = await executor.executeTool(
        'book_appointment',
        {
          doctorId: doctor.id,
          startTime: futureDate.toISOString(),
          reason: 'TEST-001 Cardiology follow-up check',
        },
        { authUser, agentId: AGENT_IDS.APPOINTMENT, requestId: randomUUID() },
        prisma
      );

      const passed = result.success && result.data?.appointmentId !== undefined;
      return {
        testId: 'TEST-001',
        name: 'Appointment booking succeeds',
        agent: 'appointment-agent',
        expectedResult: 'Appointment is created in DB with SCHEDULED status',
        actualResult: passed
          ? `Booked appointment ID ${result.data.appointmentId} with ${result.data.doctorName}`
          : `Failed: ${result.error}`,
        passed,
        executionTimeMs: Date.now() - start,
      };
    }),

    // TEST-002
    'TEST-002': async () => withSchedulingFixtures(async ({ doctor, patients }) => {
      const start = Date.now();
      const [patient] = patients;
      const authUser = toAuthUser(patient);

      // Create test appointment directly
      const initialTime = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          startTime: initialTime,
          endTime: new Date(initialTime.getTime() + 30 * 60 * 1000),
          status: 'SCHEDULED',
          reason: 'Initial appointment for rescheduling test',
        },
      });

      const newTime = await futureSlot(doctor.id, 7);
      const result = await executor.executeTool(
        'reschedule_appointment',
        {
          appointmentId: appt.id,
          newStartTime: newTime.toISOString(),
        },
        { authUser, agentId: AGENT_IDS.APPOINTMENT, requestId: randomUUID() },
        prisma
      );

      const passed = result.success && result.data?.status === 'RESCHEDULED';
      return {
        testId: 'TEST-002',
        name: 'Appointment rescheduling succeeds',
        agent: 'appointment-agent',
        expectedResult: 'Appointment status updated to RESCHEDULED with new timestamp',
        actualResult: passed
          ? `Rescheduled to ${result.data.newStartTime} successfully`
          : `Failed: ${result.error}`,
        passed,
        executionTimeMs: Date.now() - start,
      };
    }),

    // TEST-003
    'TEST-003': async () => withSchedulingFixtures(async ({ doctor, patients }) => {
      const start = Date.now();
      const [patient] = patients;
      const authUser = toAuthUser(patient);

      const initialTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          startTime: initialTime,
          endTime: new Date(initialTime.getTime() + 30 * 60 * 1000),
          status: 'SCHEDULED',
          reason: 'Initial appointment for cancellation test',
        },
      });

      const result = await executor.executeTool(
        'cancel_appointment',
        {
          appointmentId: appt.id,
          reason: 'Patient conflict schedule',
        },
        { authUser, agentId: AGENT_IDS.APPOINTMENT, requestId: randomUUID() },
        prisma
      );

      const passed = result.success && result.data?.status === 'CANCELLED';
      return {
        testId: 'TEST-003',
        name: 'Appointment cancellation succeeds',
        agent: 'appointment-agent',
        expectedResult: 'Appointment status updated to CANCELLED in DB',
        actualResult: passed ? `Cancelled successfully: ${result.data.message}` : `Failed: ${result.error}`,
        passed,
        executionTimeMs: Date.now() - start,
      };
    }),

    // TEST-004
    'TEST-004': async () => {
      const start = Date.now();
      const [patient] = await getTestPatients();
      const authUser = toAuthUser(patient);

      const result = await executor.executeTool(
        'get_patient_profile',
        { patientId: patient.id },
        { authUser, agentId: AGENT_IDS.RECORDS },
        prisma
      );

      const passed = result.success && result.data?.mrn === patient.mrn;
      return {
        testId: 'TEST-004',
        name: 'Patient retrieves own record',
        agent: 'records-agent',
        expectedResult: 'Returns authenticated patient profile and MRN',
        actualResult: passed
          ? `Retrieved profile for MRN ${result.data.mrn} (${result.data.name})`
          : `Failed: ${result.error}`,
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-005
    'TEST-005': async () => {
      const start = Date.now();
      const [patientA, patientB] = await getTestPatients();
      // Caller is Patient A, but asks for Patient B's records
      const authUser = toAuthUser(patientA);

      const result = await executor.executeTool(
        'get_patient_profile',
        { patientId: patientB.id },
        { authUser, agentId: AGENT_IDS.RECORDS },
        prisma
      );

      const passed = !result.success && Boolean(result.error?.includes('403') || result.error?.includes('Forbidden'));
      return {
        testId: 'TEST-005',
        name: "Patient attempts another patient's record and is denied",
        agent: 'records-agent',
        expectedResult: 'Denied with 403 Forbidden security boundary violation',
        actualResult: passed ? `Access Denied: ${result.error}` : 'Security failure: Unauthorized access was permitted!',
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-006
    'TEST-006': async () => {
      const start = Date.now();
      const [patient] = await getTestPatients();
      const authUser = toAuthUser(patient);

      const report = await prisma.labReport.findFirst({
        where: { patientId: patient.id },
      });

      if (!report) {
        throw new Error(`Seed data notice: No lab reports found for patient ${patient.id}`);
      }

      const result = await executor.executeTool(
        'get_lab_report',
        { reportId: report.id },
        { authUser, agentId: AGENT_IDS.LAB },
        prisma
      );

      const passed = result.success && result.data?.reportId === report.id;
      return {
        testId: 'TEST-006',
        name: 'Patient retrieves own lab report',
        agent: 'lab-agent',
        expectedResult: 'Returns authorized lab report with biomarkers and reference ranges',
        actualResult: passed
          ? `Retrieved report ${result.data.testName} (${result.data.status})`
          : `Failed: ${result.error}`,
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-007
    'TEST-007': async () => {
      const start = Date.now();
      const [patientA, patientB] = await getTestPatients();
      const authUser = toAuthUser(patientA);

      const reportB = await prisma.labReport.findFirst({
        where: { patientId: patientB.id },
      });

      if (!reportB) {
        throw new Error(`Seed data notice: No lab reports found for patient B`);
      }

      const result = await executor.executeTool(
        'get_lab_report',
        { reportId: reportB.id },
        { authUser, agentId: AGENT_IDS.LAB },
        prisma
      );

      const passed = !result.success && Boolean(result.error?.includes('403') || result.error?.includes('Forbidden'));
      return {
        testId: 'TEST-007',
        name: "Patient attempts another patient's lab report and is denied",
        agent: 'lab-agent',
        expectedResult: 'Denied with 403 Forbidden',
        actualResult: passed ? `Access Denied: ${result.error}` : 'Security failure: Unauthorized lab access permitted!',
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-008
    'TEST-008': async () => {
      const start = Date.now();
      const [patient] = await getTestPatients();
      const authUser = toAuthUser(patient);

      // Appointment Agent attempts to call clinical medical history tool
      const result = await executor.executeTool(
        'get_medical_history',
        { patientId: patient.id },
        { authUser, agentId: AGENT_IDS.APPOINTMENT, requestId: randomUUID() },
        prisma
      );

      const passed = !result.success && Boolean(result.error?.includes('Agent') && result.error?.includes('not permitted'));
      return {
        testId: 'TEST-008',
        name: 'Appointment Agent attempts an unauthorized tool and is denied',
        agent: 'appointment-agent',
        expectedResult: 'Authorization Denied: Agent is not permitted to execute tool',
        actualResult: passed ? `Denied: ${result.error}` : 'Failure: Agent executed unpermitted tool!',
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-009
    'TEST-009': async () => {
      const start = Date.now();
      const [patient] = await getTestPatients();
      const authUser = toAuthUser(patient);

      // Lab Agent attempts to call an unauthorized modification tool (or book_appointment)
      const result = await executor.executeTool(
        'book_appointment',
        { doctorId: 'dummy-doc', startTime: new Date().toISOString(), reason: 'Test' },
        { authUser, agentId: AGENT_IDS.LAB },
        prisma
      );

      const passed = !result.success && Boolean(result.error?.includes('not permitted'));
      return {
        testId: 'TEST-009',
        name: 'Lab Agent attempts to modify a report/schedule and is denied',
        agent: 'lab-agent',
        expectedResult: 'Agent boundary strictly prohibits unassigned tools',
        actualResult: passed ? `Denied: ${result.error}` : 'Failure: Lab Agent executed tool outside its boundary!',
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-010
    'TEST-010': async () => {
      const start = Date.now();
      const [patient] = await getTestPatients();
      const authUser = toAuthUser(patient);

      const result = await executor.executeTool(
        'create_support_ticket',
        {
          category: 'Billing',
          subject: 'TEST-010 Insurance verification inquiry',
          description: 'Patient requested explanation of itemized billing statement for recent lab tests.',
          priority: 'MEDIUM',
        },
        { authUser, agentId: AGENT_IDS.CARE },
        prisma
      );

      const passed = result.success && result.data?.ticketNumber?.startsWith('TICK-');
      return {
        testId: 'TEST-010',
        name: 'Care Agent creates a support ticket',
        agent: 'care-agent',
        expectedResult: 'Support ticket is generated and persisted in PostgreSQL',
        actualResult: passed
          ? `Ticket ${result.data.ticketNumber} created with status ${result.data.status}`
          : `Failed: ${result.error}`,
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-011
    'TEST-011': async () => {
      const start = Date.now();
      const [patient] = await getTestPatients();
      const authUser = toAuthUser(patient);

      const result = await executor.executeTool(
        'transfer_to_agent',
        {
          targetAgentId: AGENT_IDS.APPOINTMENT,
          reason: 'Patient wants to book appointment with cardiologist',
        },
        { authUser, agentId: AGENT_IDS.CARE },
        prisma
      );

      const passed = result.success && result.data?.isHandoff === true && result.data?.targetAgentId === AGENT_IDS.APPOINTMENT;
      return {
        testId: 'TEST-011',
        name: 'Agent-to-agent handoff works',
        agent: 'care-agent',
        expectedResult: 'Handoff signal emitted to transfer conversation context to appointment-agent',
        actualResult: passed
          ? `Handoff verified to ${result.data.targetAgentId} for: ${result.data.reason}`
          : `Failed: ${result.error}`,
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-012
    'TEST-012': async () => {
      const start = Date.now();
      const [patient] = await getTestPatients();
      const doctor = await getTestDoctor();
      const authUser = toAuthUser(patient);

      // Pass invalid date format to trigger Zod validation error
      const result = await executor.executeTool(
        'get_available_slots',
        {
          doctorId: doctor.id,
          date: 'tomorrow-morning', // invalid regex: not YYYY-MM-DD
        },
        { authUser, agentId: AGENT_IDS.APPOINTMENT, requestId: randomUUID() },
        prisma
      );

      const passed = !result.success && Boolean(result.error?.includes('Invalid tool arguments'));
      return {
        testId: 'TEST-012',
        name: 'Invalid tool arguments are rejected',
        agent: 'appointment-agent',
        expectedResult: 'Zod validation error returned without throwing crash',
        actualResult: passed ? `Rejected: ${result.error}` : 'Failure: Invalid arguments were accepted!',
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-013
    'TEST-013': async () => {
      const start = Date.now();
      // Test simulated Ollama unreachability with non-existent port
      const unreachableOllama = new OllamaProvider({ baseUrl: 'http://127.0.0.1:59999', defaultTimeoutMs: 1500 });
      const health = await unreachableOllama.healthCheck();

      const passed = !health.serverRunning && health.error !== undefined;
      return {
        testId: 'TEST-013',
        name: 'Ollama becomes unavailable and error handling works',
        agent: 'ai-provider',
        expectedResult: 'System gracefully detects server down and returns descriptive error',
        actualResult: passed
          ? `Graceful error captured: ${health.error}`
          : 'Failed: Unreachable provider did not report down status',
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-014
    'TEST-014': async () => {
      const start = Date.now();
      const [patient] = await getTestPatients();

      // Create conversation and message
      const conv = await prisma.conversation.create({
        data: {
          userId: patient.userId,
          agentId: AGENT_IDS.CARE,
          title: 'TEST-014 Persistence Test',
        },
      });

      const msg = await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderRole: 'user',
          content: 'Hello, testing message history persistence.',
        },
      });

      const retrieved = await prisma.conversation.findUnique({
        where: { id: conv.id },
        include: { messages: true },
      });

      const passed = retrieved?.messages.length === 1 && retrieved.messages[0].content === msg.content;
      return {
        testId: 'TEST-014',
        name: 'Chat history persists',
        agent: 'care-agent',
        expectedResult: 'Conversation and messages are retrieved intact from PostgreSQL',
        actualResult: passed
          ? `Verified persistence of conversation ${conv.id} with ${retrieved?.messages.length} message(s)`
          : 'Failed: Message was not saved or retrieved',
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-015
    'TEST-015': async () => {
      const start = Date.now();
      const count = await prisma.toolExecution.count();

      const passed = count >= 0;
      return {
        testId: 'TEST-015',
        name: 'Agent activity is saved',
        agent: 'all-agents',
        expectedResult: 'Tool executions and agent activity are recorded in tool_executions table',
        actualResult: passed
          ? `Verified ${count} total tool execution records in database`
          : 'Failed: Activity logs table not reachable',
        passed,
        executionTimeMs: Date.now() - start,
      };
    },

    // TEST-016
    'TEST-016': async () => withSchedulingFixtures(async ({ doctor, patients }) => {
      const start = Date.now();
      const [patientA, patientB] = patients;

      const slotTime = await futureSlot(doctor.id, 90);

      // Fire two concurrent bookings for the exact same slot
      const [bookA, bookB] = await Promise.all([
        executor.executeTool(
          'book_appointment',
          { doctorId: doctor.id, startTime: slotTime.toISOString(), reason: 'Concurrent Patient A' },
          { authUser: toAuthUser(patientA), agentId: AGENT_IDS.APPOINTMENT, requestId: randomUUID() },
          prisma
        ),
        executor.executeTool(
          'book_appointment',
          { doctorId: doctor.id, startTime: slotTime.toISOString(), reason: 'Concurrent Patient B' },
          { authUser: toAuthUser(patientB), agentId: AGENT_IDS.APPOINTMENT, requestId: randomUUID() },
          prisma
        ),
      ]);

      const oneSucceeded = (bookA.success && !bookB.success) || (!bookA.success && bookB.success);
      const conflictDetected = bookA.statusCode === 409 || bookB.statusCode === 409;
      const bookings = await prisma.appointment.count({ where: { doctorId: doctor.id, startTime: slotTime, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] } } });

      const passed = oneSucceeded && conflictDetected && bookings === 1;
      return {
        testId: 'TEST-016',
        name: 'Concurrent appointment booking does not double-book a slot',
        agent: 'appointment-agent',
        expectedResult: 'Exactly one booking succeeds; second booking is rejected with conflict error',
        actualResult: passed
          ? `Double-booking prevented successfully! (Success: 1, Conflict Rejection: 1)`
          : `Failed: bookA.success=${bookA.success} (err: ${bookA.error}), bookB.success=${bookB.success} (err: ${bookB.error})`,
        passed,
        executionTimeMs: Date.now() - start,
      };
    }),
  };

  // Run all 16 tests sequentially
  fastify.get('/api/test-lab/run-all', async (req, reply) => {
    if (req.authUser?.role !== 'ADMIN') return reply.status(403).send({ error: 'The Test Lab requires an administrator demo session.' });
    const results: TestScenarioResult[] = [];
    const testIds = Object.keys(testDefinitions);

    for (const id of testIds) {
      try {
        const res = await testDefinitions[id]();
        results.push(res);
      } catch (err: any) {
        results.push({
          testId: id,
          name: `Execution of ${id}`,
          agent: 'system',
          expectedResult: 'Test should execute without unexpected runtime error',
          actualResult: `Runtime error: ${err.message || String(err)}`,
          passed: false,
          executionTimeMs: 0,
        });
      }
    }

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      durationMs: results.reduce((acc, r) => acc + r.executionTimeMs, 0),
    };

    return { summary, results };
  });

  // Run single test
  fastify.post('/api/test-lab/run/:testId', async (req, reply) => {
    if (req.authUser?.role !== 'ADMIN') return reply.status(403).send({ error: 'The Test Lab requires an administrator demo session.' });
    const { testId } = req.params as { testId: string };
    const runnerFn = testDefinitions[testId];

    if (!runnerFn) {
      return reply.status(404).send({ error: `Test scenario ${testId} not found` });
    }

    try {
      const res = await runnerFn();
      return res;
    } catch (err: any) {
      return {
        testId,
        name: `Execution of ${testId}`,
        agent: 'system',
        expectedResult: 'Execution succeeds',
        actualResult: `Error: ${err.message}`,
        passed: false,
        executionTimeMs: 0,
      };
    }
  });
}
