# Hospital AI Multi-Agent Application

A full-stack, enterprise-grade Hospital AI Multi-Agent application powered by local Ollama models (`beam:cloud`), Fastify, React, PostgreSQL, and Prisma ORM.

The application operates 4 specialized autonomous AI agents that perform verified scheduling, authorized clinical records retrieval, lab report explanation, and patient care coordination within strict role-based access control (RBAC) boundaries.

---

## Key Features

- **Four Autonomous AI Agents**:
  1. **Appointment Agent (`appointment-agent`)**: Interactively searches doctors, checks real-time slot availability, books, reschedules, and cancels appointments.
  2. **Patient Records Agent (`records-agent`)**: Retrieves authorized clinical notes, visit summaries, vitals, and active prescriptions with strict patient boundary isolation.
  3. **Lab Report Agent (`lab-agent`)**: Queries diagnostic test orders, explains biomarker values in plain language, and logs clinician review requests without diagnosing or hallucinating.
  4. **Care Coordinator Agent (`care-agent`)**: Acts as a patient concierge, answers hospital FAQs (hours, parking, cafeteria), creates support tickets, and performs seamless agent-to-agent delegation.
- **Modular AI Provider**:
  - Implements the `AIProvider` interface with a robust `OllamaProvider`.
  - Supports model auto-detection, streaming inference, structured output, cancellation, and fallbacks.
  - Transparently identifies when the requested model (`beam:cloude`) is unavailable and allows selecting an installed model (`beam:cloud`, `deepseek-v4.1-flash:cloud`, `gpt-oss:120b-cloud`) via the Settings UI.
- **Centralized Tool Execution & Governance**:
  - All 18 tools are implemented as Node.js functions with Zod validation.
  - Centralized `ToolExecutor` validates caller permissions and enforces security boundaries before database reads/writes.
  - Ready for future AI governance gateways without rewriting agent logic.
- **Server-Sent Events (SSE) AI Streaming**:
  - Fastify SSE pipeline streams model tokens and emits real-time `tool_call`, `tool_result`, `handoff`, and `done` events.
- **100% Synthetic PostgreSQL Database**:
  - 19 relational models with UUIDs, indexes, and foreign keys.
  - Pre-seeded with 50 synthetic patients, 10 doctors, 5 departments, 100 appointments, 50 medical records, 50 lab reports, 30 prescriptions, 20 support tickets, and 4 AI agents.
- **Interactive Test Lab & Automated Test Suite**:
  - In-app Test Lab page and Vitest integration test suite executing 16 critical test scenarios (`TEST-001` through `TEST-016`).

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide React, React Router 6, TanStack Query |
| **Backend** | Node.js, Fastify, Zod, Server-Sent Events (SSE), Prisma Client |
| **Database** | PostgreSQL 18 (dedicated port 5433 or Docker Compose 5432), Prisma ORM |
| **AI Engine** | Local Ollama Server (`http://localhost:11434`), Model: `beam:cloud` (or configured) |
| **Testing** | Vitest, Fastify inject integration tests, In-app Test Lab |

---

## Quick Start Guide

### Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- PostgreSQL or Docker Compose
- Ollama running locally (`ollama serve`)

### 1. Installation
Clone the repository and install workspace dependencies:
```bash
npm install
```

### 2. Database Setup & Seeding
Start the PostgreSQL database on port 5433, sync the Prisma schema, and seed synthetic data:
```bash
npm run db
```

### 3. Run Development Servers
Launch both the Fastify backend API and Vite frontend server concurrently:
```bash
npm run dev
```
- **Frontend URL**: [http://localhost:5173](http://localhost:5173)
- **Backend API URL**: [http://localhost:3001](http://localhost:3001)
- **Health Check**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

### 4. Run Test Suite
Run the 20 automated integration tests covering TEST-001 through TEST-016:
```bash
npm run test
```

---

## Project Structure

```
hospital-ai-lab/
├── backend/                  # Fastify backend application
│   ├── src/
│   │   ├── middleware/       # Auth & RBAC middleware
│   │   ├── routes/           # REST endpoints & SSE streaming
│   │   ├── tests/            # Vitest integration tests
│   │   ├── db.ts             # Prisma client instance
│   │   └── index.ts          # Fastify server entry
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── api/              # API client methods
│   │   ├── components/       # Layout, sidebar, navigation
│   │   ├── context/          # Auth & demo user session context
│   │   ├── pages/            # 8 application views
│   │   └── main.tsx          # Application mount
│   ├── package.json
│   └── vite.config.ts
├── packages/
│   ├── shared/               # Shared TypeScript types, enums, DTOs
│   ├── ai-provider/          # AIProvider interface & OllamaProvider
│   └── agents/               # Agents, prompts, tool definitions & ToolExecutor
├── prisma/
│   ├── schema.prisma         # 19 relational PostgreSQL models
│   └── seed.ts               # Synthetic hospital data generator
├── scripts/
│   ├── db.js                 # Database startup & seeding orchestrator
│   └── dev.js                # Concurrently starts backend & frontend
├── docs/                     # Architecture, Database, Agents, API, Test Report
├── docker-compose.yml        # PostgreSQL container specification
├── .env.example              # Environment variables template
├── PROGRESS.md               # Phase-by-phase implementation progress
└── README.md
```

---

## Role-Based Access Control (RBAC)

The application includes a demo account switcher in the top navigation header:
- **PATIENT** (e.g. `Emma Smith`, `Liam Johnson`): Can strictly view only their own medical history, lab reports, and appointments. Accessing another patient's records is rejected with `403 Forbidden`.
- **DOCTOR** (e.g. `Dr. Sarah Mitchell`): Can access clinical records for patients with whom they have an assigned care relationship.
- **RECEPTIONIST** (e.g. `Alice Harper`): Can schedule and view appointments, but is denied access to sensitive clinical diagnostic notes and lab reports.
- **ADMIN** (e.g. `System Administrator`): Full administrative visibility across metrics, logs, and settings.

---

## Standalone Test Lab

Navigate to the **Test Lab** page (`/test-lab`) in the web UI or run `npm run test` to execute:
- **TEST-001**: Appointment booking succeeds.
- **TEST-002**: Appointment rescheduling succeeds.
- **TEST-003**: Appointment cancellation succeeds.
- **TEST-004**: Patient retrieves own record.
- **TEST-005**: Patient attempts another patient's record and is denied (`403 Forbidden`).
- **TEST-006**: Patient retrieves own lab report.
- **TEST-007**: Patient attempts another patient's lab report and is denied (`403 Forbidden`).
- **TEST-008**: Appointment Agent attempts an unauthorized tool and is denied.
- **TEST-009**: Lab Agent attempts to modify a report/schedule and is denied.
- **TEST-010**: Care Agent creates a support ticket.
- **TEST-011**: Agent-to-agent handoff works.
- **TEST-012**: Invalid tool arguments are rejected by Zod schema.
- **TEST-013**: Ollama becomes unavailable and error handling works.
- **TEST-014**: Chat history persists across sessions.
- **TEST-015**: Agent activity is saved to audit logs.
- **TEST-016**: Concurrent appointment booking prevents double-booking a slot.

---

## Future Governance Gateway Integration

Signet is not implemented in this version. However, all AI interactions are decoupled behind the `AIProvider` interface, and all tool calls route through `ToolExecutor`. An external governance gateway can be introduced in the future by adding a gateway adapter to the `AIProvider` pipeline without modifying agent prompts, schemas, or tool implementations.
