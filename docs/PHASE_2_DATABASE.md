# PHASE 2 — DATABASE AND DYNAMIC DATA MODELS

**Date:** 2026-10-27  
**Status:** COMPLETE & VERIFIED  
**Database:** PostgreSQL 16 (Port 5433 via Docker)  
**ORM:** Prisma 6.4.1 / 6.19.3  

---

## 1. Overview & Architecture

Phase 2 upgrades the Hospital AI Lab from partial synthetic/in-memory dependencies to a fully database-driven, enterprise-grade relational model. Every entity, transaction, scheduling constraint, patient symptom request, AI recommendation, audit log, and multi-agent interaction is persisted in PostgreSQL with relational foreign keys, referential integrity, cascading actions, and database-level concurrency protection.

---

## 2. Complete Entity Model (23 Models)

The Prisma schema (`prisma/schema.prisma`) encompasses 23 relational models:

### Identity & Access Management
1. **`Role` (`roles`)**: System roles (`PATIENT`, `DOCTOR`, `RECEPTIONIST`, `ADMIN`).
2. **`User` (`users`)**: Authenticated user accounts with bcrypt hashed passwords (`passwordHash`), `mustChangePassword` flag for secure bootstrapping, phone number, and foreign key to `Role`.
3. **`SchedulingDepartmentAccess` (`scheduling_department_access`)**: Explicit departmental scheduling grants for administrative and front-desk staff.

### Clinical & Profile Entities
4. **`Patient` (`patients`)**: Medical Record Number (`MRN`), DOB, gender, blood group, emergency contacts, address, allergies, chronic conditions, and relations to clinical history.
5. **`Doctor` (`doctors`)**: Unique medical license number, assigned department, medical specialization, consultation fee (`Decimal`), active status, bio, and photo URL.
6. **`DoctorPatientAssignment` (`doctor_patient_assignments`)**: Explicit clinical assignments binding a patient to attending and consulting doctors, recorded with `assignedBy` (Admin ID) and active status flags.
7. **`Department` (`departments`)**: Clinical departments (`Cardiology`, `Neurology`, `Pediatrics`, `Orthopedics`, `Oncology`).
8. **`DoctorAvailability` (`doctor_availability`)**: Day of week (1–7), start time, end time, and slot duration (default 30 min) for recurring doctor schedules.

### Scheduling & Clinical Records
9. **`Appointment` (`appointments`)**: Scheduled, confirmed, completed, cancelled, or rescheduled appointments with doctor, patient, exact start/end times, reason, and notes.
10. **`PatientVisit` (`patient_visits`)**: Historical consultation visits containing recorded vital signs (JSON: BP, pulse, temp, SpO2), clinical summaries, and diagnosis.
11. **`MedicalRecord` (`medical_records`)**: Clinical notes, consult notes, discharge summaries, and attachments.
12. **`Prescription` (`prescriptions`)**: Medication name, dosage, frequency, start/end dates, instructions, and active status flag.
13. **`LabTest` (`lab_tests`)**: Diagnostic test definitions (`CBC-01`, `LIPID-02`, `CMP-03`, `TSH-04`, `HBA1C-05`, `URINE-06`), category, normal ranges, and units.
14. **`LabReport` (`lab_reports`)**: Synthetic diagnostic test results (JSON), reference ranges, status (`ORDERED`, `IN_PROGRESS`, `COMPLETED`, `REVIEW_REQUESTED`, `REVIEWED`), and reviewing doctor notes.

### AI Symptom & Recommendation Workflow
15. **`PatientSymptomRequest` (`patient_symptom_requests`)**: Patient's natural-language symptom descriptions, urgency detection flags, timestamps, and patient/user linkage.
16. **`AIRecommendation` (`ai_recommendations`)**: AI-generated specialty triage (`recommendedSpecialty`), candidate doctor IDs (`recommendedDoctorIds`), clinical rationale, selected doctor, and booked appointment reference.

### Support & Operational Records
17. **`SupportTicket` (`support_tickets`)**: Patient support tickets with category, ticket number, status, priority, description, and resolution tracking.
18. **`Notification` (`notifications`)**: User notification stream for appointment bookings, status changes, and recommendations.
19. **`DisplayedAppointmentList` (`displayed_appointment_lists`)**: Tracked appointment lists displayed in chat context for secure ordinal number resolution (e.g. "appointment #1").
20. **`AuditLog` (`audit_logs`)**: Security and clinical access audit trail tracking user, action, resource, resource ID, IP address, and timestamp.

### Multi-Agent Infrastructure
21. **`AIAgent` (`ai_agents`)**: Definitions and metadata for the 4 specialized agents (`appointment-agent`, `records-agent`, `lab-agent`, `care-agent`).
22. **`Conversation` (`conversations`) & `Message` (`messages`)**: Chat threads and persistent messages, tool call payloads, and metadata.
23. **`AgentExecution` (`agent_executions`) & `ToolExecution` (`tool_executions`)**: Granular traces of agent invocations, tool arguments, authorization decisions, status, and execution duration.

---

## 3. Database-Level Integrity Constraints

To prevent race conditions, double-booking, and invalid appointment intervals, PostgreSQL constraints and partial unique indexes are enforced via `prisma/appointment-integrity.sql`:

```sql
-- Prevents active duplicate bookings for a doctor at the same slot
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_doctor_start_unique
ON appointments ("doctorId", "startTime")
WHERE status IN ('SCHEDULED', 'CONFIRMED', 'RESCHEDULED');

-- Prevents active duplicate bookings for a patient at the same slot across doctors
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_patient_start_unique
ON appointments ("patientId", "startTime")
WHERE status IN ('SCHEDULED', 'CONFIRMED', 'RESCHEDULED');

-- Guarantees positive appointment duration
ALTER TABLE appointments ADD CONSTRAINT appointments_positive_duration CHECK ("endTime" > "startTime");
```

---

## 4. Idempotent Data Seeding & Security

The database seeder (`prisma/seed.ts`) was completely refactored to be safe, idempotent, and security-compliant:

1. **Password Hashing**: Migrated from plain SHA-256 to **bcrypt** with standard salt rounds (`bcryptjs`).
2. **Development Admin Bootstrap**:
   - Seeded with temporary local bootstrap credential `1812` (configurable via `ADMIN_BOOTSTRAP_PASSWORD`).
   - Flagged with `mustChangePassword: true` requiring password reset upon first authentication.
   - Secure bcrypt hash stored in PostgreSQL; raw password never logged or stored.
3. **Upsert Pattern**:
   - Uses Prisma `upsert` across Roles, Departments, Lab Tests, AI Agents, Doctors, and Patients.
   - Prevents destructive `deleteMany()` wiping existing database records during normal runs.
4. **Doctor-Patient Assignments**:
   - Seeds initial active assignments between patients and attending specialists, managed under admin authority.
5. **AI Recommendation Test Data**:
   - Seeds baseline `PatientSymptomRequest` and `AIRecommendation` records to support immediate feature validation.

---

## 5. Verification & Test Results

The database migration and model extensions were validated against the full integration and unit test suite:

- **Command:** `npm test --workspace=backend`
- **Results:**
  - **Test Files:** 7 passed (100%)
  - **Tests:** 88 passed (100%)
  - **Duration:** 68.82s
- **Verified Suites:**
  - `integration.test.ts` (21 tests) — Health, metrics, patient boundaries, RBAC.
  - `appointment-selection.test.ts` (10 tests) — Double booking prevention, doctor/patient slot uniqueness constraints.
  - `appointment-verification.test.ts` (5 tests) — Read-only verification, DB occupancy checking.
  - `booking-context.test.ts` (7 tests) — Concurrency, slot authorization.
  - `agent-regression.test.ts` (26 tests) — AI agent tools, Ollama interaction.
  - `support-ticket.test.ts` (18 tests) — Support tickets, idempotency.
  - `clear-chats.test.ts` (1 test) — Data cascading and user privacy isolation.
