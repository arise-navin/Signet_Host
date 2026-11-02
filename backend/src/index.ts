import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { ZodError } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { prisma } from './db.js';
import { authMiddleware } from './middleware/auth.js';
import { AIProvider, GroqProvider, OllamaProvider } from '@hospital/ai-provider';
import {
  AgentRegistry,
  AgentRouter,
  AgentRunner,
  ToolExecutor,
  ToolRegistry,
} from '@hospital/agents';

import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { patientRoutes } from './routes/patients.js';
import { doctorRoutes } from './routes/doctors.js';
import { appointmentRoutes } from './routes/appointments.js';
import { chatRoutes } from './routes/chat.js';
import { supportTicketRoutes } from './routes/supportTickets.js';
import { agentActivityRoutes } from './routes/agentActivity.js';
import { settingsRoutes } from './routes/settings.js';
import { testLabRoutes } from './routes/testLab.js';
import { adminRoutes } from './routes/admin.js';
import { doctorDashboardRoutes } from './routes/doctorDashboard.js';
import { patientDashboardRoutes } from './routes/patientDashboard.js';
import { recommendationRoutes } from './routes/recommendations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

export function createAIProvider(): AIProvider {
  const providerType = (process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'ollama')).toLowerCase();

  if (providerType === 'groq' || process.env.GROQ_API_KEY) {
    return new GroqProvider({
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      requestedModel: process.env.GROQ_REQUESTED_MODEL || 'openai/gpt-oss-120b',
    });
  }

  return new OllamaProvider({
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'beam:cloud',
    requestedModel: process.env.OLLAMA_REQUESTED_MODEL || 'beam:cloude',
  });
}

export async function createServer() {
  const server = fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // Enable CORS for frontend
  await server.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',') : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  await server.register(jwt, { secret });
  server.setErrorHandler((error, req, reply) => {
    req.log.error({ err: error, requestId: req.id }, 'Request failed');
    const status = error instanceof ZodError ? 400 : error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    reply.status(status).send({ error: error instanceof Error ? error.message : String(error) });
  });

  // Pre-handler auth context resolution
  server.addHook('preHandler', authMiddleware);

  // Initialize modular AI Provider and Agent Architecture
  const aiProvider = createAIProvider();

  const toolRegistry = ToolRegistry.getInstance();
  const toolExecutor = new ToolExecutor(toolRegistry);
  const agentRegistry = AgentRegistry.getInstance();
  const agentRouter = new AgentRouter();
  const agentRunner = new AgentRunner(aiProvider, toolRegistry, toolExecutor, agentRegistry);

  // Register all routes
  await healthRoutes(server, aiProvider);
  await authRoutes(server);
  await dashboardRoutes(server);
  await patientRoutes(server);
  await doctorRoutes(server);
  await appointmentRoutes(server);
  await chatRoutes(server, agentRunner, agentRouter);
  await supportTicketRoutes(server);
  await agentActivityRoutes(server);
  await settingsRoutes(server, aiProvider);
  await testLabRoutes(server, toolExecutor);
  await adminRoutes(server);
  await doctorDashboardRoutes(server);
  await patientDashboardRoutes(server);
  await recommendationRoutes(server, aiProvider);

  return { server, aiProvider, toolExecutor, agentRunner };
}

async function start() {
  try {
    const { server } = await createServer();
    const address = await server.listen({ port: PORT, host: HOST });
    console.log(`Hospital AI Multi-Agent API listening at ${address}`);
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  start();
}
