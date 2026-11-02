# Vercel Deployment & Groq Integration Guide

This application has been updated to support **Groq Cloud AI inference** (using `openai/gpt-oss-120b`) instead of local Ollama, making it 100% cloud-ready and deployable directly on **Vercel**.

---

## 1. What was Changed & Configured

1. **Groq AI Provider (`@hospital/ai-provider`)**:
   - Implemented `GroqProvider` powered by `groq-sdk`.
   - Wired model `openai/gpt-oss-120b` with reasoning effort (`medium`), temperature, max completion tokens (`4096`), and streaming token support.
   - Built-in tool calling support mapped for hospital agents.
   - Dynamic provider fallback: If `GROQ_API_KEY` is provided or `AI_PROVIDER=groq`, the app automatically uses Groq.

2. **Vercel Serverless Function API (`/api/index.ts`)**:
   - Configured Fastify to run seamlessly as a Vercel Serverless Function.
   - All backend endpoints (`/api/health`, `/api/chat/stream`, `/api/appointments`, `/api/settings`, etc.) are routed through this single handler.

3. **Vercel Configuration (`vercel.json`)**:
   - Automated build command: `npm run vercel-build`.
   - Output directory: `frontend/dist`.
   - Function execution timeout set to 60s for agent workflows.
   - URL rewrites for SPA client-side routing and `/api/*` endpoints.

4. **Prisma Multi-Platform Engine**:
   - Added binary targets (`rhel-openssl-1.0.x`, `rhel-openssl-3.0.x`, `debian-openssl-1.1.x`, `debian-openssl-3.0.x`) to `prisma/schema.prisma` for Vercel's serverless Linux environments.

---

## 2. Cloud Database Setup (Prerequisite for Vercel)

Since Vercel runs in the cloud, it cannot connect to your local `localhost:5432` PostgreSQL. You need a free cloud PostgreSQL database:

### Recommended: Neon (Free Serverless PostgreSQL)
1. Go to [Neon.tech](https://neon.tech) and create a free account.
2. Create a new project (e.g. `hospital-ai`).
3. Copy your Connection String (`postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`).
4. Apply the database schema and seed data to your cloud database from your computer:
   ```bash
   # Temporarily set your cloud database URL
   $env:DATABASE_URL="your-neon-connection-string"

   # Push schema to create all 19 tables
   npx prisma db push --schema=prisma/schema.prisma

   # Seed synthetic data (patients, doctors, appointments, agents)
   npm run db:seed
   ```

---

## 3. Deploying to Vercel

### Option A: Using the Vercel Web Dashboard (Recommended)

1. Push your project to GitHub / GitLab:
   ```bash
   git add .
   git commit -m "feat: integrate Groq AI provider and configure for Vercel deployment"
   git push origin main
   ```
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your repository.
4. **Build and Output Settings** will automatically be read from `vercel.json`:
   - **Build Command**: `npm run vercel-build`
   - **Output Directory**: `frontend/dist`
5. Under **Environment Variables**, add the following:

| Key | Value | Description |
|---|---|---|
| `AI_PROVIDER` | `groq` | Specifies Groq as the active AI engine |
| `GROQ_API_KEY` | `gsk_your_groq_api_key_here` | Your Groq API Key |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Selected Groq model |
| `GROQ_REQUESTED_MODEL` | `openai/gpt-oss-120b` | Requested model identifier |
| `GROQ_REASONING_EFFORT` | `medium` | Reasoning effort for gpt-oss-120b |
| `DATABASE_URL` | `postgresql://...` | Cloud PostgreSQL connection string (from Neon/Supabase) |
| `JWT_SECRET` | `6406a7942879b4484f66b1823130b7b14fc6ca5878a3c5071c1028f7820eca5dce0ff03a707bbd0aae6b236b` | JWT session token secret |
| `NODE_ENV` | `production` | Production environment flag |
| `DEMO_AUTH_ENABLED` | `true` | Allows role switching between Patient/Doctor/Receptionist/Admin |
| `FRONTEND_ORIGIN` | `*` | CORS origin allowance |
| `HOSPITAL_TIMEZONE` | `Asia/Kolkata` | Wall-clock hospital timezone |

6. Click **Deploy**. Vercel will build and deploy both frontend and backend serverless endpoints!

---

### Option B: Using Vercel CLI

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

---

## 4. Local Testing with Groq

To test the application locally with Groq right now:
```bash
# Concurrently start backend and frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173). The top bar status pill will show **ready** connected to `openai/gpt-oss-120b` on Groq!

