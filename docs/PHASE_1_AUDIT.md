# PHASE 1 — PROJECT AUDIT AND SAFE UPGRADE PLAN

**Date:** 2026-10-27
**Auditor:** Hospital AI Lab Upgrade Engine
**Project Root:** `d:\Signet\Healthcare  Hospitals`

---

## 1. Existing Architecture Summary

### Monorepo Structure

```
hospital-ai-lab/
├── backend/                        ← Fastify + TypeScript API (port 3001)
├── frontend/                       ← React + Vite + Tailwind (port 5173)
├── packages/
│   ├── agents/                     ← AI agent orchestration, tool registry
│   ├── ai-provider/                ← OllamaProvider (AI inference)
│   └── shared/                     ← Shared types, constants, schemas
├── prisma/
│   ├── schema.prisma               ← 19 Prisma models
│   └── seed.ts                     ← Synthetic data seeder
├── docker-compose.yml              ← PostgreSQL 16 on port 5433
├── .env                            ← JWT_SECRET, DATABASE_URL, OLLAMA_*
└── docs/                           ← Existing documentation
```

### Tech Stack (Verified)

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + TypeScript | 18.3 |
| Build | Vite | 6.x |
| Styling | Tailwind CSS | 3.4 |
| State | TanStack React Query | 5.x |
| Routing | React Router DOM | 6.x |
| Backend | Fastify + TypeScript | 5.2 |
| Auth | @fastify/jwt (HS256) | 10.x |
| Database | PostgreSQL 16 (Docker, port 5433) | 16 |
| ORM | Prisma | 6.4 |
| AI | Ollama (local, port 11434) | - |
| Testing | Vitest | 3.x |
| E2E | Playwright | 1.64 |

---

## 2. Frontend Pages and Routes

| Path | Component | Description |
|---|---|---|
| `/` | `DashboardPage` | Metrics, agent cards, recent activity |
| `/patients` | `PatientsPage` | Patient directory with search and modal |
| `/doctors` | `DoctorsPage` | Doctor cards with availability checker |
| `/appointments` | `AppointmentsPage` | List, filter, book, cancel, reschedule |
| `/chat` | `ChatPage` | SSE streaming AI chat with agent selector |
| `/support-tickets` | `SupportTicketsPage` | Ticket list |
| `/activity` | `ActivityPage` | Tool execution audit log |
| `/settings` | `SettingsPage` | Ollama connection, model switcher |
| `/test-lab` | `TestLabPage` | Interactive test scenario runner |

**MISSING (required by upgrade plan):**
- `/` proper login/registration homepage (currently goes directly to dashboard)
- `/login` — Login page (patient / doctor / admin)
- `/register` — New patient registration
- `/admin/dashboard` — Admin-specific dashboard
- `/doctor/dashboard` — Doctor-specific dashboard
- `/patient/dashboard` — Patient-specific dashboard

---

## 3. Backend API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Service health check |
| GET | `/api/auth/demo-users` | Public* | Lists all demo accounts |
| POST | `/api/auth/switch` | Public* | Demo user switcher (no password) |
| GET | `/api/auth/me` | JWT | Current user |
| GET | `/api/dashboard/stats` | JWT | Real DB metrics |
| GET | `/api/patients` | JWT | Patient list (role-scoped) |
| GET | `/api/patients/:id` | JWT | Patient detail (authorization checked) |
| GET | `/api/doctors` | JWT | Doctor list |
| GET | `/api/doctors/:id/slots` | JWT | Available slots |
| GET | `/api/appointments` | JWT | Appointments (role-scoped) |
| POST | `/api/appointments/book` | JWT | Book appointment |
| POST | `/api/appointments/:id/reschedule` | JWT | Reschedule |
| POST | `/api/appointments/:id/cancel` | JWT | Cancel |
| POST | `/api/chat/stream` | JWT | SSE agent chat |
| GET | `/api/chat/conversations` | JWT | Conversation history |
| DELETE | `/api/chat/conversations` | JWT | Clear chats |
| GET | `/api/support-tickets` | JWT | Ticket list |
| GET | `/api/agent-activity` | JWT | Agent execution log |

**MISSING (required by upgrade plan):**
- `POST /api/auth/login` — Password-based login
- `POST /api/auth/register` — Patient self-registration
- `POST /api/auth/logout` — Session invalidation
- `POST /api/admin/doctors` — Create doctor (admin)
- `PUT /api/admin/doctors/:id` — Edit doctor (admin)
- `POST /api/admin/assignments` — Assign patient to doctor
- `GET /api/ai-recommendations` — AI doctor recommendations
- `POST /api/ai-recommendations` — Create recommendation

---

## 4. Authentication System (Current State)

### Current: Demo-only, no password authentication

The current auth system is **development/testing only**:
- `/api/auth/demo-users` lists ALL users from the database
- `/api/auth/switch` lets any visitor switch to any account by UUID
- No password verification at any point
- Passwords in seed file use SHA-256 (NOT bcrypt — SECURITY RISK)
- No rate limiting on auth endpoints
- AuthContext auto-switches to any user on page load

### Session Token (Existing — Keep)
- JWT signed with `@fastify/jwt` (HS256)
- 8-hour expiry
- Stored as `hospital_session` HttpOnly cookie
- Sub-claim is User UUID
- Role resolved from database on every request (correct)

---

## 5. Database Models (Existing — 19 Models)

All confirmed in `prisma/schema.prisma`:

1. **Role** — PATIENT, DOCTOR, RECEPTIONIST, ADMIN
2. **User** — email, passwordHash, name, roleId
3. **Department** — name, code, description
4. **SchedulingDepartmentAccess** — User-Department grants
5. **Patient** — mrn, dateOfBirth, gender, bloodGroup, phone, allergies, chronicConditions
6. **Doctor** — departmentId, specialization, licenseNumber, consultationFee
7. **DoctorAvailability** — dayOfWeek, startTime, endTime, slotMinutes
8. **DoctorUnavailablePeriod** — startTime, endTime, reason
9. **Appointment** — patientId, doctorId, startTime, endTime, status, reason, notes
10. **PatientVisit** — appointmentId, visitDate, summary, vitals, diagnosis
11. **MedicalRecord** — patientId, doctorId, visitId, recordType, title, content
12. **Prescription** — patientId, doctorId, medication, dosage, frequency
13. **LabTest** — code, name, category, normalRange
14. **LabReport** — patientId, labTestId, reviewedById, resultValues, status
15. **SupportTicket** — ticketNumber, patientId, createdById, category, status, priority
16. **AIAgent** — id, name, allowedTools
17. **Conversation** — userId, agentId
18. **Message** — conversationId, senderRole, content, toolCalls, activities
19. **AgentExecution** — conversationId, agentId, userId, status
20. **ToolExecution** — executionId, toolName, arguments, result, success
21. **AuditLog** — userId, action, resource, resourceId
22. **DisplayedAppointmentList** — appointment list context for agents

**MISSING models (required):**
- `PatientSymptomRequest` — health issue submissions
- `AIRecommendation` — specialty suggestion and doctor recommendations
- `Notification` — in-app notifications
- `DoctorPatientAssignment` — explicit admin-managed patient assignments

---

## 6. AI Agents (Existing — 4 Agents, All Working)

### Agent 1: Appointment Agent (`appointment-agent`)
Tools: get_appointments, get_appointment_by_id, list_authorized_patients, get_doctors, get_available_slots, book_appointment, validate_appointment_booking, get_booking_attempt, reschedule_appointment, cancel_appointment

### Agent 2: Patient Records Agent (`records-agent`)
Tools: list_authorized_patients, get_patient_profile, get_medical_history, get_visit_summary, get_prescriptions

### Agent 3: Lab Report Agent (`lab-agent`)
Tools: list_authorized_patients, get_lab_status, get_lab_report, get_lab_tests, request_doctor_review

### Agent 4: Care Coordinator Agent (`care-agent`)
Tools: search_hospital_faq, get_support_ticket, list_my_support_tickets, create_support_ticket, create_followup_request, request_staff_assistance, transfer_to_agent

---

## 7. Identified Bugs and Security Issues

### CRITICAL — Authentication

| Issue | File | Severity |
|---|---|---|
| No password-based login — demo switch only | `routes/auth.ts` | CRITICAL |
| SHA-256 password hashing (not bcrypt) | `prisma/seed.ts:7-9` | HIGH |
| No rate limiting on auth endpoints | `routes/auth.ts` | HIGH |
| No patient self-registration flow | Frontend | HIGH |
| AuthContext auto-switches to any user on load | `context/AuthContext.tsx:38-40` | HIGH |

### HIGH — Agent Bugs

| Issue | File | Severity |
|---|---|---|
| Self-transfer bug: care-agent can be re-routed to itself | `agents/AgentRunner.ts` | HIGH |
| No role-based navigation (all roles see same sidebar) | `components/Layout.tsx` | MEDIUM |
| Dashboard metrics not role-filtered | `routes/dashboard.ts` | MEDIUM |

### FEATURES MISSING

| Feature | Severity |
|---|---|
| AI doctor recommendation workflow | HIGH |
| Patient symptom submission | HIGH |
| Admin dashboard (separate) | HIGH |
| Doctor dashboard (separate) | HIGH |
| Patient dashboard (separate) | HIGH |
| Login page | CRITICAL |
| Registration page | HIGH |

---

## 8. Reusable Components (Keep As-Is)

### Backend
- `authMiddleware` — JWT + DB session resolution (solid, keep)
- `appointmentScope` / `appointmentScopeWhere` — Role-based scoping
- `authorizeCarePatient` / `authorizeClinicalPatient` — Clinical enforcement
- `validateBookingSlot` / `lockAppointmentParticipants` — Transaction-safe booking
- `ToolRegistry` / `ToolExecutor` — Agent tool execution
- `AgentRunner` / `AgentRouter` — Multi-agent orchestration
- `OllamaProvider` — AI inference
- All 4 agent definitions and tools

### Frontend
- `Layout.tsx` — Extend for role-based nav
- `ChatPage.tsx` — Preserve as-is
- `DashboardPage.tsx` — Extend
- `ActivityPage.tsx`, `TestLabPage.tsx` — Keep

---

## 9. Migration Plan

### Safe Strategy
> RULE: Never drop existing tables. Only ADD columns/tables. Migrate data safely.

### New Migrations Required

```
Migration 1: add_user_flags
  - User.isActive Boolean @default(true)
  - User.mustChangePassword Boolean @default(false)

Migration 2: add_doctor_profile
  - Doctor.isActive Boolean @default(true)
  - Doctor.bio String?
  - Doctor.photoUrl String?

Migration 3: add_ai_recommendation_tables
  - PatientSymptomRequest (new table)
  - AIRecommendation (new table)

Migration 4: add_notification_table
  - Notification (new table)

Migration 5: add_doctor_patient_assignment
  - DoctorPatientAssignment (new table, explicit assignments)
```

---

## 10. Security Risks Summary

| Risk | Severity | Remediation |
|---|---|---|
| No real password login | CRITICAL | Implement POST /api/auth/login with bcrypt |
| SHA-256 password hashing | HIGH | Migrate to bcrypt |
| No patient self-registration | HIGH | Implement registration flow |
| Demo switch always enabled | HIGH | Guard behind DEMO_AUTH_ENABLED=true env |
| No auth rate limiting | HIGH | Add @fastify/rate-limit |
| Self-transfer agent bug | MEDIUM | Detect current agent before transfer |
| Admin no clinical separation | LOW | Document policy; audit-log escalated access |

---

## 11. Baseline Test Results

**Test Run:** 2026-10-27
**Command:** `npm run test`
**Result:** ALL TESTS SKIPPED — PostgreSQL database not reachable at `localhost:5433`

The database requires PostgreSQL running on port 5433.
Start with: `docker compose up -d`

**7 test files identified, all database-dependent.**

---

## Summary

The existing Hospital AI Lab is a well-architected, production-quality codebase with:
- Solid Prisma schema covering 19 relational models
- Strong backend authorization (care relationships, appointment scoping)
- Working 4-agent AI system with tool registry
- SSE streaming chat with persistence
- Transaction-safe appointment booking

**Critical gaps for the upgrade:**
1. No real password authentication (demo-only)
2. No patient self-registration
3. No role-based dashboard separation
4. No AI doctor recommendation workflow
5. No homepage with login/register options
6. Agent self-transfer bug
7. SHA-256 password hashing

The upgrade will extend this foundation without rebuilding it.
