import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { AGENT_IDS } from '@hospital/shared';
import { ToolRegistry, getAppointmentsTool, getDoctorsTool } from '@hospital/agents';

const server = Fastify({ logger: false });
const tools = [getAppointmentsTool, getDoctorsTool];

beforeAll(async () => {
  const definitions = ToolRegistry.getInstance().getOllamaToolDefinitions(AGENT_IDS.APPOINTMENT);
  for (const tool of tools) {
    const definition = definitions.find((candidate) => candidate.function.name === tool.name);
    if (!definition) throw new Error(`Missing model tool definition for ${tool.name}`);
    server.post(`/${tool.name}`, { schema: { body: definition.function.parameters } }, async (request) => {
      tool.schema.parse(request.body);
      return { valid: true };
    });
  }
  await server.ready();
});

afterAll(async () => { await server.close(); });

describe('model tool definitions enforce the same argument contract as runtime validation', () => {
  it.each([
    { tool: 'get_appointments', args: {}, accepted: true },
    { tool: 'get_appointments', args: { scope: 'personal' }, accepted: true },
    { tool: 'get_appointments', args: { scope: 'professional' }, accepted: false },
    { tool: 'get_appointments', args: { scope: '' }, accepted: false },
    { tool: 'get_appointments', args: { patientId: 'not-a-uuid' }, accepted: false },
    { tool: 'get_doctors', args: {}, accepted: true },
    { tool: 'get_doctors', args: { name: '' }, accepted: false },
    { tool: 'get_doctors', args: { name: 'A' }, accepted: false },
    { tool: 'get_doctors', args: { name: 'An' }, accepted: true },
    { tool: 'get_doctors', args: { department: 'Cardiology' }, accepted: true },
  ])('$tool $args', async ({ tool, args, accepted }) => {
    const runtime = tools.find((candidate) => candidate.name === tool);
    if (!runtime) throw new Error(`Missing runtime tool ${tool}`);
    expect(runtime.schema.safeParse(args).success).toBe(accepted);
    const response = await server.inject({ method: 'POST', url: `/${tool}`, payload: args });
    expect(response.statusCode).toBe(accepted ? 200 : 400);
  });
});
