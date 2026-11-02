import { FastifyInstance } from 'fastify';
import { hospitalTimezone, tomorrowDate } from '@hospital/agents';
import { prisma } from '../db.js';
import { AIProvider } from '@hospital/ai-provider';

export async function healthRoutes(fastify: FastifyInstance, aiProvider: AIProvider) {
  fastify.get('/api/health', async (req, reply) => {
    let dbConnected: boolean;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const aiHealth = await aiProvider.healthCheck();

    const overallHealthy = dbConnected;

    return {
      status: overallHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      hospitalTimezone: hospitalTimezone(),
      hospitalTomorrow: tomorrowDate(new Date()),
      services: {
        backend: { status: 'up', uptime: process.uptime() },
        database: { status: dbConnected ? 'connected' : 'disconnected' },
        ollama: {
          status: aiHealth.serverRunning ? (aiHealth.modelAvailable ? (aiHealth.ok ? 'ready' : 'blocked') : 'model_missing') : 'unreachable',
          serverRunning: aiHealth.serverRunning,
          activeModel: aiHealth.selectedModel,
          requestedModel: aiHealth.requestedModel,
          modelAvailable: aiHealth.modelAvailable,
          installedModels: aiHealth.models,
          error: aiHealth.error,
        },
      },
    };
  });
}
