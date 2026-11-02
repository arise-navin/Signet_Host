import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer } from '../index.js';
import { prisma } from '../db.js';

it('clears only the signed-in user chats and cascades messages/activity while preserving other data', async () => {
  const { server } = await createServer();
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'PATIENT' } });
  const user = await prisma.user.create({ data: { email: `clear-${randomUUID()}@example.test`, name: 'Synthetic Clear Chat Test', passwordHash: 'not-a-login', roleId: role.id } });
  const other = await prisma.user.create({ data: { email: `other-${randomUUID()}@example.test`, name: 'Synthetic Other Chat Test', passwordHash: 'not-a-login', roleId: role.id } });
  try {
    await server.ready();
    const conversation = await prisma.conversation.create({ data: { userId: user.id, agentId: 'care-agent', messages: { create: { senderRole: 'user', content: 'Synthetic chat' } }, executions: { create: { userId: user.id, agentId: 'care-agent', userPrompt: 'Synthetic chat', status: 'RUNNING', durationMs: 0, toolExecutions: { create: { toolName: 'search_hospital_faq', agentId: 'care-agent', arguments: '{}', success: true, durationMs: 0 } } } } }, include: { executions: true } });
    const otherChat = await prisma.conversation.create({ data: { userId: other.id, agentId: 'care-agent' } });
    const headers = { authorization: `Bearer ${server.jwt.sign({ sub: user.id })}` };
    expect((await server.inject({ method: 'DELETE', url: '/api/chat/conversations' })).statusCode).toBe(401);
    expect((await server.inject({ method: 'DELETE', url: '/api/chat/conversations', headers })).statusCode).toBe(409);
    await prisma.agentExecution.update({ where: { id: conversation.executions[0].id }, data: { status: 'SUCCESS' } });
    const appointmentBefore = await prisma.appointment.findFirstOrThrow({ where: { reason: 'Cardiovascular routine examination' } });
    const ticketBefore = await prisma.supportTicket.findFirstOrThrow();
    const response = await server.inject({ method: 'DELETE', url: '/api/chat/conversations', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().deletedCount).toBe(1);
    expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await prisma.agentExecution.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await prisma.toolExecution.count({ where: { executionId: conversation.executions[0].id } })).toBe(0);
    expect(await prisma.conversation.findUnique({ where: { id: otherChat.id } })).not.toBeNull();
    expect(await prisma.appointment.findUnique({ where: { id: appointmentBefore.id } })).toEqual(appointmentBefore);
    expect(await prisma.supportTicket.findUnique({ where: { id: ticketBefore.id } })).toEqual(ticketBefore);
    expect((await server.inject({ method: 'DELETE', url: '/api/chat/conversations', headers })).json().deletedCount).toBe(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await server.close();
    await prisma.$disconnect();
  }
});
