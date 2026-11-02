import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const createdConversationIds: string[] = [];
const createdTicketIds: string[] = [];

async function sendMessage(page: Page, prompt: string): Promise<void> {
  await page.getByTestId('chat-input').fill(prompt);
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-input')).toBeEnabled();
  await expect(page.getByTestId('message-assistant').last()).not.toBeEmpty();
  const id = new URL(page.url()).searchParams.get('conversation');
  expect(id).not.toBeNull();
  if (id) createdConversationIds.push(id);
}

test.afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { action: 'IDEMPOTENCY_RESULT', details: { in: createdTicketIds.map((resultId) => JSON.stringify({ resultId })) } } });
  await prisma.supportTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  await prisma.$disconnect();
});

test('explicit Lab selection hands FAQ to Care and preserves selection and history after refresh', async ({ page }) => {
  await page.goto('/chat?agent=lab-agent');
  await expect(page.getByTestId('agent-lab-agent')).toHaveAttribute('aria-pressed', 'true');
  await sendMessage(page, 'What are the hospital visiting hours?');
  await expect(page.getByTestId('message-assistant').last()).toHaveAttribute('data-agent-id', 'care-agent');
  await expect(page.getByTestId('agent-lab-agent')).toHaveAttribute('aria-pressed', 'true');
  const text = await page.getByTestId('message-assistant').last().textContent();
  await page.reload();
  await expect(page.getByTestId('message-assistant').last()).toHaveText(text!);
  await expect(page.getByTestId('agent-lab-agent')).toHaveAttribute('aria-pressed', 'true');
});

test('all four agents execute real tools using Ollama and PostgreSQL', async ({ page }) => {
  await page.goto('/chat?agent=appointment-agent');
  await sendMessage(page, 'Show my upcoming appointments.');
  await expect(page.getByTestId('message-assistant').last()).toHaveAttribute('data-agent-id', 'appointment-agent');
  await page.getByTestId('chat-new').click();
  await page.getByTestId('agent-records-agent').click();
  await sendMessage(page, 'Show my previous visit summary.');
  await expect(page.getByTestId('message-assistant').last()).toHaveAttribute('data-agent-id', 'records-agent');
  await page.getByTestId('chat-new').click();
  await page.getByTestId('agent-lab-agent').click();
  await sendMessage(page, 'Is my lab report ready?');
  await expect(page.getByTestId('message-assistant').last()).toHaveAttribute('data-agent-id', 'lab-agent');
  await page.getByTestId('chat-new').click();
  await page.getByTestId('agent-care-agent').click();
  await sendMessage(page, 'What are the hospital visiting hours?');
  const ids = [...new Set(createdConversationIds)];
  const executed = await prisma.toolExecution.findMany({ where: { execution: { conversationId: { in: ids } }, success: true }, select: { toolName: true } });
  const names = executed.map((execution) => execution.toolName);
  for (const name of ['search_hospital_faq', 'get_appointments', 'get_visit_summary', 'get_lab_status']) expect(names).toContain(name);
});

test('appointment selection hands support to Care, persists the ticket, and replay creates no duplicate', async ({ page }) => {
  await page.goto('/chat?agent=appointment-agent');
  await sendMessage(page, 'Create a support ticket because I need help with my appointment. Use category Appointments, subject Appointment assistance, description I need staff help with my hospital appointment.');
  await expect(page.getByTestId('activity-create_support_ticket').last()).toHaveAttribute('data-status', 'AWAITING_INPUT');
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/api/chat/stream'));
  await sendMessage(page, '1');
  const request = await requestPromise;
  await expect(page.getByTestId('message-assistant').last()).toHaveAttribute('data-agent-id', 'care-agent');
  await expect(page.getByTestId('agent-appointment-agent')).toHaveAttribute('aria-pressed', 'true');
  const conversationId = new URL(page.url()).searchParams.get('conversation')!;
  const requestId = z.object({ requestId: z.string().uuid() }).parse(request.postDataJSON()).requestId;
  const execution = await prisma.agentExecution.findUniqueOrThrow({ where: { id: requestId, conversationId }, include: { toolExecutions: true } });
  const ticketExecution = execution.toolExecutions.find((tool) => tool.toolName === 'create_support_ticket' && tool.success);
  expect(ticketExecution).toBeDefined();
  const ticketId = z.object({ ticketId: z.string() }).parse(JSON.parse(ticketExecution!.result!)).ticketId;
  createdTicketIds.push(ticketId);
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
  expect(ticket.createdById).toBe(execution.userId);
  const count = await prisma.supportTicket.count({ where: { createdById: execution.userId } });
  const replay = await page.request.post('/api/chat/stream', { data: request.postDataJSON() });
  expect(await replay.text()).toContain('event: done');
  expect(await prisma.supportTicket.count({ where: { createdById: execution.userId } })).toBe(count);
});

test('switching identity clears conversation state and doctor personal appointments require a patient profile', async ({ page }) => {
  await page.goto('/chat?agent=appointment-agent');
  await sendMessage(page, 'Show my appointments.');
  const previousConversation = new URL(page.url()).searchParams.get('conversation');
  await page.getByTestId('user-menu').click();
  await page.getByTestId('demo-user-dr.mitchell@hospital.com').click();
  await expect(page.getByTestId('message-user')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('conversation')).toBeNull();
  await sendMessage(page, 'Show my personal appointments.');
  expect(new URL(page.url()).searchParams.get('conversation')).not.toBe(previousConversation);
  const id = new URL(page.url()).searchParams.get('conversation')!;
  const tools = await prisma.toolExecution.findMany({ where: { execution: { conversationId: id }, toolName: 'get_appointments' } });
  expect(tools.every((tool) => !tool.success)).toBe(true);
  await expect(page.getByTestId('message-assistant').last()).toContainText(/patient profile|personal appointments|patient account/i);
  const owner = await prisma.conversation.findUniqueOrThrow({ where: { id }, include: { user: true } });
  expect(owner.user.email).toBe('dr.mitchell@hospital.com');
});
