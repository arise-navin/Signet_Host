# Hospital AI Lab — Deployment & Operational Run Guide

## Overview
This guide provides complete instructions for configuring, bootstrapping, and running Hospital AI Lab in development and production environments.

---

## 1. Prerequisites & Environment Setup

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Docker**: Docker Desktop or Docker Engine (for PostgreSQL)
- **Ollama**: Optional for local AI model inference (`http://localhost:11434`)

### 1.1 Environment Variables
Configure `.env` in the root and in `backend/`:
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/hospital_ai?schema=public"

# Backend Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Authentication & Security
JWT_SECRET=super-secret-jwt-key-hospital-ai-change-in-production
JWT_EXPIRES_IN=8h

# AI Inference
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=beam:cloud

# Initial Bootstrap Credentials (Development Only)
BOOTSTRAP_ADMIN_USER=admin
BOOTSTRAP_ADMIN_PASS=1812
```

---

## 2. Step-by-Step Installation & Startup

### Step 1: Start PostgreSQL Container
```bash
docker-compose up -d
```
*Note*: PostgreSQL is mapped to host port `5433`. Ensure container `postgres-health` is running:
```bash
docker ps
```

### Step 2: Install Node Dependencies
From the repository root:
```bash
npm install
```

### Step 3: Initialize Database Schema & Integrity Constraints
```bash
# Push Prisma schema (23 models)
npx prisma db push

# Apply database partial unique indexes and duration constraints
npm run db:integrity
```

### Step 4: Seed Database with Synthetic Baseline Data
```bash
npm run db:seed
```
*This populates*:
- Bootstrap Admin account (`admin` / `1812` with forced password change)
- 10 Doctors across Cardiology, Neurology, Orthopedics, Pediatrics, Dermatology, General Medicine
- 50 synthetic Patients with unique MRNs
- Baseline Doctor-Patient assignments
- Baseline Doctor weekly schedules and slots

### Step 5: Start the Backend Service
```bash
npm run dev:backend
# Or directly from backend/:
cd backend && npm run dev
```
Backend API will be live at `http://localhost:3001`.

### Step 6: Start the Frontend Application
```bash
npm run dev:frontend
# Or directly from frontend/:
cd frontend && npm run dev
```
Frontend web interface will be live at `http://localhost:5173`.

---

## 3. Initial Development Admin Bootstrap

1. Open `http://localhost:5173/login`.
2. Select the **Admin** tab.
3. Enter bootstrap credentials:
   - **Username**: `admin`
   - **Password**: `1812`
4. The system will detect `mustChangePassword: true` and prompt for an immediate password update.
5. Provide a strong new password (minimum 8 characters) to clear the bootstrap state and unlock the full Admin Dashboard at `/admin/dashboard`.

---

## 4. Operational Verification Commands

```bash
# Run all backend unit & integration tests (109 tests across 9 files)
npm test --workspace=hospital-backend

# Build frontend production bundle with TypeScript check
npm run build --workspace=frontend

# Verify database partial constraints
npm run db:integrity
```
