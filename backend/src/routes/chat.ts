import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { AgentRunner, AgentRouter } from '@hospital/agents';
import { AGENT_IDS, AgentId, SSEEvent, sanitizeToolError } from '@hospital/shared';

export async function chatRoutes(fastify: FastifyInstance, runner: AgentRunner, router: AgentRouter) {
  fastify.delete('/api/chat/conversations', async (req, reply) => {
    const authUser = req.authUser;
    if (!authUser) return reply.status(401).send({ error: 'Authentication required.' });
    const running = await prisma.agentExecution.findFirst({
      where: { userId: authUser.id, status: 'RUNNING' }, select: { id: true },
    });
    if (running) return reply.status(409).send({ error: 'A chat response is still running. Stop it or wait for it to finish before clearing your chats.' });
    const deleted = await prisma.conversation.deleteMany({ where: { userId: authUser.id } });
    return { deletedCount: deleted.count, message: 'All your chats have been cleared.' };
  });

  // Get conversations for active user
  fastify.get('/api/chat/conversations', async (req, reply) => {
    const authUser = req.authUser;
    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const conversations = await prisma.conversation.findMany({
      where: { userId: authUser.id },
      include: {
        agent: true,
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title || 'New Consultation',
      agentId: c.agentId,
      agentName: c.agent.name,
      messageCount: c._count.messages,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  });

  // Get conversation messages
  fastify.get('/api/chat/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const authUser = req.authUser;

    z.string().uuid().parse(id);
    const conversation = await prisma.conversation.findUnique({ where: { id }, select: { userId: true } });

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    if (!authUser || conversation.userId !== authUser.id) {
      return reply.status(403).send({ error: 'Forbidden: You can only view your own conversations' });
    }

    const messages = await prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' } });
    return messages.map((m) => ({
      id: m.id,
      senderRole: m.senderRole,
      agentId: m.agentId,
      content: m.content,
      activities: m.activities,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
      createdAt: m.createdAt.toISOString(),
    }));
  });

  // Server-Sent Events (SSE) AI Streaming Endpoint
  fastify.post('/api/chat/stream', async (req, reply) => {
    const parsed = z.object({ prompt: z.string().trim().min(1).max(10000), agentId: z.enum([AGENT_IDS.CARE, AGENT_IDS.APPOINTMENT, AGENT_IDS.RECORDS, AGENT_IDS.LAB]).optional(), conversationId: z.string().uuid().optional(), requestId: z.string().uuid().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const { prompt, agentId: reqAgentId, conversationId, requestId } = parsed.data;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return reply.status(400).send({ error: 'prompt is required' });
    }

    const authUser = req.authUser;
    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized user session' });
    }

    if (conversationId) {
      const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { userId: true } });
      if (!conversation) return reply.status(404).send({ error: 'Conversation not found.' });
      if (conversation.userId !== authUser.id) return reply.status(403).send({ error: 'You can only continue your own conversations.' });
    }
    const initialDecision = router.selectAgent(prompt, reqAgentId);
    const decision = !reqAgentId && initialDecision.confidence < 0.9 ? await runner.classifyIntent(prompt) : initialDecision;
    const targetAgentId = decision.targetAgentId;
    req.log.info({ requestId: req.id, agentId: targetAgentId, reason: decision.reason }, 'Chat agent selected');

    const controller = new AbortController();
    const cancelRun = (): void => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on('close', cancelRun);
    reply.hijack();

    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    let errorSent = false;
    const sendEvent = (event: SSEEvent) => {
      if (reply.raw.destroyed) return;
      if (event.event === 'error') errorSent = true;
      const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
      reply.raw.write(payload);
    };

    try {
      await runner.run(
        {
          agentId: targetAgentId,
          requestId,
          prompt,
          authUser,
          conversationId,
          onEvent: sendEvent,
          signal: controller.signal,
        },
        prisma
      );
    } catch (err: any) {
      if (!errorSent) sendEvent({
        event: 'error',
        data: { message: sanitizeToolError(err.message), statusCode: err.statusCode ?? 502 },
      });
    } finally {
      reply.raw.off('close', cancelRun);
      reply.raw.end();
    }
  });
}
