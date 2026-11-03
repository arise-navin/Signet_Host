import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { SignetProvider } from '@hospital/ai-provider';
import { healthRoutes } from '../routes/health.js';

describe('Signet outage health reporting', () => {
  it('keeps backend health available and reports an unreachable gateway explicitly', async () => {
    const server = fastify();
    const provider = new SignetProvider({
      baseUrl: 'https://signet-health-test.invalid/v1',
      deploymentCredential: 'unreachable-gateway-test',
      model: 'test-model',
    });
    await healthRoutes(server, provider);

    try {
      const response = await server.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        services: {
          backend: { status: 'up' },
          ollama: {
            status: 'unreachable',
            serverRunning: false,
            modelAvailable: false,
            activeModel: 'test-model',
            error: expect.stringContaining('GET https://signet-health-test.invalid/healthz failed after 3 attempts'),
          },
        },
      });
    } finally {
      await server.close();
    }
  });
});
