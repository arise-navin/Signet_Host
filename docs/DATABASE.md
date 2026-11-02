# Hospital AI Application — Database Documentation

The application uses **PostgreSQL** managed with **Prisma ORM**. All entities use UUID identifiers, proper foreign key relationships, timestamps, and indexes for optimized query performance.

---

## Database Models (19 Models)

| Model Name | Table Name | Description | Seed Count |
|---|---|---|---|
| `Role` | `roles` | System authorization roles (`PATIENT`, `DOCTOR`, `RECEPTIONIST`, `ADMIN`) | 4 |
| `User` | `users` | User credentials, emails, and role links | 62 |
| `Department` | `departments` | Medical clinical departments (Cardiology, Neurology, etc.) | 5 |
| `Doctor` | `doctors` | Physician license, specialty, department, consultation fee | 10 |
| `DoctorAvailability` | `doctor_availabilities` | Weekly recurring doctor schedules and slot durations | 50 |
| `Patient` | `patients` | Patient demographics, MRN, allergies, chronic conditions | 50 |
| `Appointment` | `appointments` | Booked appointments with status and timestamps | 100 |
| `PatientVisit` | `patient_visits` | Historical clinical visits, recorded vitals, and diagnoses | ~50 |
| `MedicalRecord` | `medical_records` | Clinical notes, cardiology consults, discharge summaries | 50 |
| `Prescription` | `prescriptions` | Active patient medications, dosages, and prescribing doctors | 30 |
| `LabTest` | `lab_tests` | Diagnostic lab test catalogue (CBC, Lipid Panel, CMP, etc.) | 6 |
| `LabReport` | `lab_reports` | Diagnostic test results with measured metrics and doctor reviews | 50 |
| `SupportTicket` | `support_tickets` | Patient support, navigation, and staff escalation tickets | 20 |
| `AIAgent` | `ai_agents` | Configuration and tool manifests for 4 AI agents | 4 |
| `Conversation` | `conversations` | Multi-turn chat sessions linked to users and agents | Dynamic |
| `Message` | `messages` | Chat message records with roles and tool call payloads | Dynamic |
| `AgentExecution` | `agent_executions` | Execution tracking for agent invocations with durations | Dynamic |
| `ToolExecution` | `tool_executions` | Audit log of individual tool calls, arguments, and outcomes | Dynamic |
| `AuditLog` | `audit_logs` | Security and compliance audit log for clinical operations | Dynamic |

---

## Detailed Model Specifications

### 1. Patient (`patients`)
- `id` (UUID, PK)
- `userId` (UUID, Unique, FK -> `users.id`)
- `mrn` (String, Unique, Indexed) — Medical Record Number (e.g. `MRN-2026-01001`)
- `dateOfBirth` (DateTime)
- `gender` (String)
- `bloodGroup` (String, nullable)
- `phone` (String)
- `emergencyContact` (String, nullable)
- `address` (String, nullable)
- `allergies` (String, nullable)
- `chronicConditions` (String, nullable)
- `createdAt`, `updatedAt` (DateTime)

### 2. Doctor (`doctors`)
- `id` (UUID, PK)
- `userId` (UUID, Unique, FK -> `users.id`)
- `departmentId` (UUID, FK -> `departments.id`, Indexed)
- `specialization` (String)
- `licenseNumber` (String, Unique)
- `consultationFee` (Decimal(10,2))
- `createdAt`, `updatedAt` (DateTime)

### 3. Appointment (`appointments`)
- `id` (UUID, PK)
- `patientId` (UUID, FK -> `patients.id`, Indexed)
- `doctorId` (UUID, FK -> `doctors.id`, Indexed)
- `startTime` (DateTime, Indexed)
- `endTime` (DateTime)
- `status` (Enum: `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`, Indexed)
- `reason` (String)
- `notes` (String, nullable)

### 4. MedicalRecord (`medical_records`)
- `id` (UUID, PK)
- `patientId` (UUID, FK -> `patients.id`, Indexed)
- `doctorId` (UUID, nullable, FK -> `doctors.id`)
- `visitId` (UUID, nullable, Unique, FK -> `patient_visits.id`)
- `recordType` (String) — e.g. "Clinical Note", "Cardiology Consult"
- `title` (String)
- `content` (Text)
- `attachments` (String JSON, nullable)

### 5. LabReport (`lab_reports`)
- `id` (UUID, PK)
- `patientId` (UUID, FK -> `patients.id`, Indexed)
- `labTestId` (UUID, FK -> `lab_tests.id`, Indexed)
- `reviewedById` (UUID, nullable, FK -> `doctors.id`)
- `status` (Enum: `ORDERED`, `IN_PROGRESS`, `COMPLETED`, `REVIEW_REQUESTED`, `REVIEWED`, Indexed)
- `resultValues` (Text JSON) — Stored key-value biomarker measurements
- `clinicalSummary` (Text, nullable)
- `doctorNotes` (Text, nullable)
- `orderedAt`, `completedAt` (DateTime)

### 6. ToolExecution (`tool_executions`)
- `id` (UUID, PK)
- `executionId` (UUID, FK -> `agent_executions.id`, Indexed)
- `toolName` (String, Indexed)
- `arguments` (Text JSON)
- `result` (Text JSON, nullable)
- `success` (Boolean)
- `error` (Text, nullable)
- `durationMs` (Integer)
- `createdAt` (DateTime)

---

## Role-Based Access Control Boundaries in PostgreSQL

1. **Patient Boundary**:
   - Queries to `medical_records`, `lab_reports`, `prescriptions`, and `patient_visits` require `patientId = authUser.patientId` when `authUser.role === 'PATIENT'`.
2. **Doctor Care Relationship Boundary**:
   - Doctors may only view clinical files for patients who have an active appointment or visit record with that doctor.
3. **Receptionist Boundary**:
   - Front desk staff are permitted to manage scheduling and view appointments, but are blocked from querying clinical text, diagnostic narratives, and laboratory test result values.
