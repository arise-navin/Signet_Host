import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { ZodError } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { prisma } from './db.js';
import { authMiddleware } from './middleware/auth.js';
import { AIProvider, GroqProvider, OllamaProvider, SignetProvider } from '@hospital/ai-provider';
import {
  AgentRegistry,
  AgentRouter,
  AgentRunner,
  ToolExecutor,
  ToolRegistry,
} from '@hospital/agents';

import { healthRoutes } from './routes/health.js';
import { maintenanceRoutes } from './routes/maintenance.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { patientRoutes } from './routes/patients.js';
import { doctorRoutes } from './routes/doctors.js';
import { appointmentRoutes } from './routes/appointments.js';
import { chatRoutes } from './routes/chat.js';
import { supportTicketRoutes } from './routes/supportTickets.js';
import { agentActivityRoutes } from './routes/agentActivity.js';
import { settingsRoutes } from './routes/settings.js';
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

  if (providerType === 'signet') {
    return new SignetProvider({
      baseUrl: process.env.SIGNET_GATEWAY_URL || '',
      deploymentCredential: process.env.SIGNET_DEPLOYMENT_CREDENTIAL || '',
      model: process.env.SIGNET_MODEL || 'gpt-oss:120b-cloud',
    });
  }

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

export async function registerAllRoutes(server: FastifyInstance) {
  // Enable CORS for frontend
  await server.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ? (process.env.FRONTEND_ORIGIN === '*' ? true : process.env.FRONTEND_ORIGIN.split(',')) : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const secret = process.env.JWT_SECRET || '6406a7942879b4484f66b1823130b7b14fc6ca5878a3c5071c1028f7820eca5dce0ff03a707bbd0aae6b236b';
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
  await maintenanceRoutes(server);
  await authRoutes(server);
  await dashboardRoutes(server);
  await patientRoutes(server);
  await doctorRoutes(server);
  await appointmentRoutes(server);
  await chatRoutes(server, agentRunner, agentRouter, aiProvider);
  await supportTicketRoutes(server);
  await agentActivityRoutes(server);
  await settingsRoutes(server, aiProvider);
  await adminRoutes(server);
  await doctorDashboardRoutes(server);
  await patientDashboardRoutes(server);
  await recommendationRoutes(server, aiProvider);

  return { server, aiProvider, toolExecutor, agentRunner };
}

export async function createServer() {
  const server = fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  const context = await registerAllRoutes(server);
  return context;
}

let appInstance: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!appInstance) {
    const { server } = await createServer();
    await server.ready();
    appInstance = server;
  }
  return appInstance;
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

// Standalone execution check: only start HTTP listener if directly executed locally and NOT in Vercel/Lambda
const isDirectExecution =
  Boolean(process.argv[1]) &&
  !process.env.VERCEL &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME &&
  (path.resolve(process.argv[1]) === path.resolve(__filename) ||
    process.argv[1].endsWith('index.ts') ||
    process.argv[1].endsWith('index.js'));

if (isDirectExecution) {
  start();
}

// Universal Vercel Serverless Handler:
// Handles both @vercel/fastify plugin registration (req.register) and @vercel/node request listener (req, res)
export default async function handler(req: any, res: any) {
  if (req && typeof req.register === 'function') {
    await registerAllRoutes(req);
    return;
  }

  try {
    const app = await getApp();
    app.server.emit('request', req, res);
  } catch (err: any) {
    console.error('Serverless execution error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
    }
  }
}
