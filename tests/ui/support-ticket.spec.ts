import { expect, Page, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

interface ChatFixture {
  prisma: PrismaClient;
  userId: string;
  appointmentIds: string[];
  otherAppointmentId: string;
}

async function withChatFixture(run: (fixture: ChatFixture) => Promise<void>): Promise<void> {
  const prisma = new PrismaClient();
  const ids: string[] = [];
  const appointments: string[] = [];
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'PATIENT' } });
    const doctor = await prisma.doctor.findFirstOrThrow();
    for (const name of ['Synthetic Support UI', 'Synthetic Unrelated UI']) {
      const user = await prisma.user.create({ data: { name, email: `support-ui-${randomUUID()}@example.test`, passwordHash: 'not-a-login', roleId: role.id, patient: { create: { mrn: `UI-${randomUUID()}`, dateOfBirth: new Date('1990-01-01T00:00:00Z'), gender: 'Other', phone: '555-0100' } } }, include: { patient: true } });
      ids.push(user.id);
      const count = name === 'Synthetic Support UI' ? 2 : 1;
      for (let index = 0; index < count; index++) {
        const startTime = new Date(Date.now() + 30 * 86400000 + index * 3600000);
        const appointment = await prisma.appointment.create({ data: { patientId: user.patient!.id, doctorId: doctor.id, startTime, endTime: new Date(startTime.getTime() + 1800000), reason: 'Synthetic support UI fixture' } });
        appointments.push(appointment.id);
      }
    }
    await run({ prisma, userId: ids[0], appointmentIds: appointments.slice(0, 2), otherAppointmentId: appointments[2] });
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.supportTicket.deleteMany({ where: { createdById: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-input')).toBeEnabled();
}

test('general appointment assistance is confirmed after an empty lookup and survives refresh', async ({ page }) => {
  await withChatFixture(async (fixture) => {
    await fixture.prisma.appointment.deleteMany({ where: { id: { in: fixture.appointmentIds } } });
    await page.addInitScript((userId: string) => localStorage.setItem('hospital_ai_active_user_id', userId), fixture.userId);
    await page.goto('/chat?agent=care-agent');
    await send(page, 'Create a MEDIUM priority support ticket for appointment #1. I have a scheduling conflict and need rescheduling assistance. Do not reschedule automatically.');
    await expect(page.getByTestId('activity-create_support_ticket').last()).toHaveAttribute('data-status', 'AWAITING_INPUT');
    expect(await fixture.prisma.supportTicket.count({ where: { createdById: fixture.userId } })).toBe(0);
    await page.reload();
    await expect(page.getByTestId('activity-create_support_ticket').last()).toHaveAttribute('data-status', 'AWAITING_INPUT');
    await send(page, 'Yes');
    await expect(page.getByTestId('activity-create_support_ticket').last()).toHaveAttribute('data-status', 'SUCCEEDED');
    const ticket = await fixture.prisma.supportTicket.findFirstOrThrow({ where: { createdById: fixture.userId } });
    expect(ticket).toMatchObject({ appointmentId: null, category: 'APPOINTMENT_ASSISTANCE', priority: 'MEDIUM' });
    await expect(page.getByTestId('support-ticket-id').last()).toHaveText(ticket.id);
    await page.reload();
    await expect(page.getByTestId('support-ticket-id').last()).toHaveText(ticket.id);
    await expect(page.getByTestId('message-assistant').last()).not.toContainText(ticket.ticketNumber);
    await send(page, `Show the status of support ticket ${ticket.id}. Do not create anything.`);
    await expect(page.getByTestId('message-assistant').last()).toContainText(ticket.id);
    await expect(page.getByTestId('message-assistant').last()).toContainText('OPEN');
    expect(await fixture.prisma.supportTicket.count({ where: { createdById: fixture.userId } })).toBe(1);
    await page.getByTestId('nav-support-tickets').click();
    const row = page.getByTestId(`support-ticket-${ticket.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('MEDIUM');
    await expect(row).toContainText('OPEN');
    await expect(row).toContainText('None');
    await page.reload();
    await expect(row).toBeVisible();
    await page.getByTestId('nav-dashboard').click();
    await page.getByTestId('metric-support-tickets').click();
    await expect(row).toBeVisible();

  });
});

test('a full-sentence appointment #1 request resolves the normal displayed list after refresh and handoff', async ({ page }) => {
  await withChatFixture(async (fixture) => {
    await page.addInitScript((userId: string) => localStorage.setItem('hospital_ai_active_user_id', userId), fixture.userId);
    await page.goto('/chat?agent=appointment-agent');
    await send(page, 'Show my upcoming appointments.');
    await expect(page.getByTestId('message-assistant').last().locator('table tbody tr')).toHaveCount(2);
    const conversationId = new URL(page.url()).searchParams.get('conversation')!;
    const list = await fixture.prisma.displayedAppointmentList.findFirstOrThrow({ where: { conversationId, publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' } });
    const first = z.array(z.object({ itemNumber: z.number(), appointmentId: z.string() })).parse(list.items)[0];
    const original = await fixture.prisma.appointment.findUniqueOrThrow({ where: { id: first.appointmentId } });
    await page.reload();
    await expect(page.getByTestId('message-assistant').last().locator('table tbody tr')).toHaveCount(2);
    await fixture.prisma.appointment.create({ data: { patientId: original.patientId, doctorId: original.doctorId, startTime: new Date(original.startTime.getTime() - 3600000), endTime: new Date(original.startTime.getTime() - 1800000), reason: 'Synthetic earlier row after list publication' } });
    await page.getByTestId('agent-care-agent').click();
    await send(page, 'Please create a MEDIUM priority support ticket for appointment #1. The issue is a scheduling conflict and I need assistance rescheduling. Do not reschedule it automatically. Create the ticket and give me the ticket ID.');
    await expect(page.getByTestId('activity-create_support_ticket').last()).toHaveAttribute('data-status', 'SUCCEEDED');
    const ticket = await fixture.prisma.supportTicket.findFirstOrThrow({ where: { createdById: fixture.userId } });
    expect(ticket.appointmentId).toBe(first.appointmentId);
    expect(ticket.priority).toBe('MEDIUM');
    expect(ticket.description).toContain('scheduling conflict');
    await expect(page.getByTestId('support-ticket-id').last()).toHaveText(ticket.id);
    expect(await fixture.prisma.appointment.findUnique({ where: { id: original.id } })).toEqual(original);
    const execution = await fixture.prisma.agentExecution.findFirstOrThrow({ where: { conversationId }, orderBy: { createdAt: 'desc' } });
    expect(await fixture.prisma.toolExecution.count({ where: { executionId: execution.id, toolName: 'get_appointments' } })).toBe(0);
  });
});

test('support ticket waits for selection, survives refresh, and displays the real succeeded receipt', async ({ page }) => {
  await withChatFixture(async (fixture) => {
    await page.addInitScript((userId: string) => localStorage.setItem('hospital_ai_active_user_id', userId), fixture.userId);
    await page.goto('/chat?agent=appointment-agent');
    await send(page, 'I need to reschedule my appointment because I have a scheduling conflict. Please create a support ticket for my upcoming appointment. Priority: Medium. If you need an appointment ID, show me my upcoming appointments first.');
    const pending = page.getByTestId('activity-create_support_ticket').last();
    await expect(pending).toHaveAttribute('data-status', 'AWAITING_INPUT');
    await expect(pending).toContainText('Awaiting appointment selection');
    await expect(page.getByTestId('message-assistant').last().locator('table tbody tr')).toHaveCount(2);
    expect(await fixture.prisma.supportTicket.count({ where: { createdById: fixture.userId } })).toBe(0);
    await page.reload();
    await expect(page.getByTestId('activity-create_support_ticket').last()).toHaveAttribute('data-status', 'AWAITING_INPUT');
    await send(page, '2');
    await expect(page.getByTestId('activity-create_support_ticket').last()).toHaveAttribute('data-status', 'SUCCEEDED');
    const ticket = await fixture.prisma.supportTicket.findFirstOrThrow({ where: { createdById: fixture.userId } });
    expect(ticket.appointmentId).toBe(fixture.appointmentIds[1]);
    expect(ticket.priority).toBe('MEDIUM');
    await expect(page.getByTestId('support-ticket-id').last()).toHaveText(ticket.id);
    await expect(page.getByTestId('message-assistant').last()).toContainText(ticket.id);
    await expect(page.getByTestId('message-assistant').last()).toHaveAttribute('data-agent-id', 'care-agent');
    await expect(page.getByTestId('agent-appointment-agent')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByTestId('support-ticket-id').last()).toHaveText(ticket.id);
  });
});

test('unauthorized appointment failure never shows a successful ticket or Done', async ({ page }) => {
  await withChatFixture(async (fixture) => {
    await page.addInitScript((userId: string) => localStorage.setItem('hospital_ai_active_user_id', userId), fixture.userId);
    await page.goto('/chat?agent=appointment-agent');
    await send(page, `Create a support ticket for appointment ${fixture.otherAppointmentId}. Priority: Medium.`);
    const step = page.getByTestId('activity-create_support_ticket').last();
    await expect(step).toHaveAttribute('data-status', 'FAILED');
    await expect(step).toContainText('Failed');
    await expect(step).not.toContainText('Done');
    await expect(step).not.toContainText('Succeeded');
    await expect(page.getByTestId('support-ticket-id')).toHaveCount(0);
    expect(await fixture.prisma.supportTicket.count({ where: { createdById: fixture.userId } })).toBe(0);
    await page.reload();
    await expect(page.getByTestId('activity-create_support_ticket').last()).toHaveAttribute('data-status', 'FAILED');
  });
});

test('Markdown renders bold, code and tables while preserving escapes and blocking unsafe HTML', async ({ page }) => {
  await withChatFixture(async (fixture) => {
    const content = '**Verified formatting**\n\n`C:\\temp\\report`\n\n\\*literal asterisk\\*\n\n| Field | Value |\n| --- | --- |\n| Status | OPEN |\n\n<script>window.markdownUnsafe = true</script>\n<img src="x" onerror="window.markdownUnsafe = true">\n\n[Unsafe](javascript:alert(1))';
    const conversation = await fixture.prisma.conversation.create({ data: { userId: fixture.userId, agentId: 'care-agent', messages: { create: { senderRole: 'assistant', agentId: 'care-agent', content } } } });
    await page.addInitScript((userId: string) => localStorage.setItem('hospital_ai_active_user_id', userId), fixture.userId);
    await page.goto(`/chat?agent=care-agent&conversation=${conversation.id}`);
    const markdown = page.getByTestId('chat-markdown').last();
    await expect(markdown.locator('strong')).toHaveText('Verified formatting');
    await expect(markdown.locator('code')).toHaveText('C:\\temp\\report');
    await expect(markdown.locator('table tbody tr')).toHaveCount(1);
    await expect(markdown).toContainText('*literal asterisk*');
    await expect(markdown.locator('script, img, a[href^="javascript:"]')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.has(window, 'markdownUnsafe'))).toBe(false);
  });
});
