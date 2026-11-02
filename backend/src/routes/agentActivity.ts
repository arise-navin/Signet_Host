import { AGENT_METADATA_LIST } from '@hospital/shared';
import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function agentActivityRoutes(fastify: FastifyInstance) {
  fastify.get('/api/agent-activity', async (req, reply) => {
    const { page = '1', limit = '30', agentId, success } = (req.query as any) || {};
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where: any = { execution: { userId: req.authUser!.id } };
    if (agentId) {
      where.execution = { userId: req.authUser!.id, agentId };
    }
    if (success !== undefined) {
      where.success = success === 'true';
    }

    const [tools, total] = await Promise.all([
      prisma.toolExecution.findMany({
        where,
        skip,
        take,
        include: {
          execution: {
            include: {
              agent: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.toolExecution.count({ where }),
    ]);

    return {
      total,
      page: parseInt(page, 10),
      limit: take,
      activities: tools.map((t) => ({
        id: t.id,
        agentId: t.agentId ?? t.execution.agentId,
        agentName: AGENT_METADATA_LIST.find((agent) => agent.id === (t.agentId ?? t.execution.agentId))?.name ?? t.execution.agent.name,
        toolCalled: t.toolName,
        arguments: JSON.parse(t.arguments || '{}'),
        result: t.result ? JSON.parse(t.result) : null,
        success: t.success,
        error: t.error,
        durationMs: t.durationMs,
        timestamp: t.createdAt.toISOString(),
      })),
    };
  });
}
