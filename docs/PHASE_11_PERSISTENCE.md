# Phase 11: Complete Database Persistence Implementation & Verification Report

## Overview
Phase 11 verifies that all operational hospital entities, clinical records, user accounts, and agent telemetry survive page refresh, user logout/login cycles, and complete backend server/container restarts without data loss or reset.

---

## 1. Persistence Architecture

### 1.1 True PostgreSQL Storage (Zero LocalStorage Relying)
- All business entities are stored in a dedicated PostgreSQL 16 container (`postgres-health` running on port 5433).
- Frontend clients (`frontend/src/api/client.ts`) store only the session JWT token in `localStorage`.
- All dashboard views, appointment calendars, patient medical charts, doctor rosters, and support tickets are fetched dynamically from Fastify REST APIs querying PostgreSQL via Prisma ORM.

### 1.2 Entity Coverage Verification

| Entity Model | Persistence Mechanism | Verified Durability |
|---|---|---|
| **Admin Accounts** | `User` table (`role: 'ADMIN'`) | Survives restart; bcrypt hashed; forced password change preserved |
| **Doctor Profiles** | `Doctor` table + `User` relation | Survives restart; licenses, fees, and active status intact |
| **Patient Accounts** | `Patient` table + `User` relation | Survives restart; unique MRNs preserved |
| **Doctor-Patient Assignments** | `DoctorPatientAssignment` | Active relationships survive restart and enforce clinical scoping |
| **Doctor Schedules** | `DoctorSchedule` | Shift definitions and slot durations persist |
| **Patient Symptoms & Inquiries** | `PatientSymptomRequest` | Triage scores and symptom logs survive session cycles |
| **AI Recommendations** | `AIRecommendation` | Recommended doctors, confidence scores, and statuses survive |
| **Appointments** | `Appointment` | Unique constraints and slot occupancies survive restart |
| **Medical History** | `MedicalHistory` | Diagnoses, allergies, surgeries persist across sessions |
| **Prescriptions** | `Prescription` | Medications, dosages, frequencies persist |
| **Lab Reports** | `LabReport` | Clinical values and reference ranges persist |
| **Support Tickets** | `SupportTicket` | Subject, priority, and resolution states persist |
| **AI Agent Conversations** | `AgentExecution` & `AgentStep` | Step-by-step logs, durations, and tool outputs persist |
| **Audit Logs** | `AuditLog` | Security events, logins, and mutations persist immutably |

---

## 2. Startup Guardrails (No Database Reset on Boot)
- Backend Fastify application startup (`backend/src/server.ts` and `backend/src/index.ts`) does **not** run destructive migrations or reset tables on launch.
- Database schema changes are controlled via Prisma migrations and `prisma db push`.
- Database seeding (`prisma/seed.ts`) is designed to be fully idempotent using `upsert` and existence checks, preventing accidental truncation or duplicate insertion during testing or deployment.

---

## 3. Database Layer Integrity Constraints
- Partial unique indexes in PostgreSQL (`prisma/appointment-integrity.sql`):
  - `appointments_active_doctor_start_unique`: Blocks concurrent or duplicate active appointments for the same doctor at the same start time.
  - `appointments_active_patient_start_unique`: Blocks concurrent or duplicate active appointments for the same patient at the same start time.
  - Check constraint `positive_duration`: Ensures `durationMinutes > 0`.
