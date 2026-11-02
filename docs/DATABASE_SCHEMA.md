# Hospital AI Lab — Database Schema Reference

## Overview
The platform database is powered by PostgreSQL 16 and managed through Prisma ORM (`prisma/schema.prisma`). It consists of 23 relational models covering identity, clinical records, doctor schedules, patient care relationships, AI recommendations, support tickets, and agent telemetry.

---

## 1. Complete Entity Relationship Matrix (23 Models)

### 1.1 Authentication & User Management
1. **`User`**:
   - `id`: UUID (Primary Key)
   - `username`: String (Unique)
   - `email`: String (Unique)
   - `passwordHash`: String (Bcrypt hashed, salt rounds 10)
   - `roleId`: UUID (Foreign Key $\rightarrow$ `Role`)
   - `mustChangePassword`: Boolean (Flags required password change on first login)
   - `createdAt`, `updatedAt`: DateTime
   - Relations: `role`, `doctor`, `patient`, `auditLogs`, `supportTickets`
2. **`Role`**:
   - `id`: UUID (Primary Key)
   - `name`: String (Unique: `ADMIN`, `DOCTOR`, `PATIENT`, `RECEPTIONIST`)
   - `description`: String?
   - Relations: `users`, `permissions` (`RolePermission`)
3. **`Permission`**:
   - `id`: UUID (Primary Key)
   - `name`: String (Unique, e.g. `appointments:create`, `records:read`)
   - `category`: String
4. **`RolePermission`**:
   - Join table linking `Role` and `Permission`.

### 1.2 Clinical Staff & Department Hierarchy
5. **`Department`**:
   - `id`: UUID (Primary Key)
   - `name`: String (Unique, e.g. `Cardiology`, `Neurology`)
   - `code`: String (Unique)
   - Relations: `doctors`
6. **`Specialty`**:
   - `id`: UUID (Primary Key)
   - `name`: String (Unique)
   - `description`: String?
   - Relations: `doctors`
7. **`Doctor`**:
   - `id`: UUID (Primary Key)
   - `userId`: UUID (Unique, Foreign Key $\rightarrow$ `User`)
   - `departmentId`: UUID (Foreign Key $\rightarrow$ `Department`)
   - `specialtyId`: UUID (Foreign Key $\rightarrow$ `Specialty`)
   - `licenseNumber`: String (Unique)
   - `phone`: String?
   - `roomNumber`: String?
   - `consultationFee`: Decimal
   - `isActive`: Boolean (Default: true)
   - Relations: `schedules`, `appointments`, `prescriptions`, `patientAssignments`, `consultationNotes`
8. **`DoctorSchedule`**:
   - `id`: UUID (Primary Key)
   - `doctorId`: UUID (Foreign Key $\rightarrow$ `Doctor`)
   - `dayOfWeek`: Int (0-6)
   - `startTime`: String (`"09:00"`)
   - `endTime`: String (`"17:00"`)
   - `slotDuration`: Int (Default: 30 minutes)
   - `isActive`: Boolean

### 1.3 Patient Clinical Demographics & Care Relationships
9. **`Patient`**:
   - `id`: UUID (Primary Key)
   - `userId`: UUID (Unique, Foreign Key $\rightarrow$ `User`)
   - `medicalRecordNumber`: String (Unique, e.g. `MRN-100001`)
   - `dateOfBirth`: DateTime
   - `gender`: String
   - `phone`: String?
   - `address`: String?
   - `emergencyContactName`: String?
   - `emergencyContactPhone`: String?
   - `bloodGroup`: String?
   - `allergies`: String[]
   - Relations: `appointments`, `medicalHistory`, `prescriptions`, `labReports`, `doctorAssignments`, `symptomRequests`, `supportTickets`
10. **`DoctorPatientAssignment`**:
    - `id`: UUID (Primary Key)
    - `doctorId`: UUID (Foreign Key $\rightarrow$ `Doctor`)
    - `patientId`: UUID (Foreign Key $\rightarrow$ `Patient`)
    - `status`: String (Default: `"ACTIVE"`)
    - `assignedAt`: DateTime (Default: now)
    - `assignedBy`: String?
    - Unique Constraint: `@@unique([doctorId, patientId])`

### 1.4 Clinical Records & Consultations
11. **`MedicalHistory`**:
    - `id`: UUID (Primary Key)
    - `patientId`: UUID (Foreign Key $\rightarrow$ `Patient`)
    - `condition`: String
    - `diagnosedDate`: DateTime?
    - `status`: String (`ACTIVE`, `RESOLVED`, `CHRONIC`)
    - `notes`: String?
12. **`PatientVisit`**:
    - `id`: UUID (Primary Key)
    - `appointmentId`: UUID (Unique, Foreign Key $\rightarrow$ `Appointment`)
    - `chiefComplaint`: String
    - `vitalSigns`: JSON?
    - `clinicalNotes`: String?
13. **`ConsultationNote`**:
    - `id`: UUID (Primary Key)
    - `visitId`: UUID (Foreign Key $\rightarrow$ `PatientVisit`)
    - `doctorId`: UUID (Foreign Key $\rightarrow$ `Doctor`)
    - `subjective`: String?
    - `objective`: String?
    - `assessment`: String?
    - `plan`: String?
14. **`Prescription`**:
    - `id`: UUID (Primary Key)
    - `patientId`: UUID (Foreign Key $\rightarrow$ `Patient`)
    - `doctorId`: UUID (Foreign Key $\rightarrow$ `Doctor`)
    - `visitId`: UUID? (Foreign Key $\rightarrow$ `PatientVisit`)
    - `medication`: String
    - `dosage`: String
    - `frequency`: String
    - `startDate`: DateTime
    - `endDate`: DateTime?
    - `status`: String (`ACTIVE`, `COMPLETED`, `DISCONTINUED`)
15. **`LabReport`**:
    - `id`: UUID (Primary Key)
    - `patientId`: UUID (Foreign Key $\rightarrow$ `Patient`)
    - `testName`: String
    - `category`: String
    - `testDate`: DateTime
    - `result`: String
    - `unit`: String?
    - `referenceRange`: String?
    - `status`: String (`NORMAL`, `ABNORMAL`, `CRITICAL`, `PENDING`)
    - `notes`: String?

### 1.5 Appointments & Scheduling
16. **`Appointment`**:
    - `id`: UUID (Primary Key)
    - `patientId`: UUID (Foreign Key $\rightarrow$ `Patient`)
    - `doctorId`: UUID (Foreign Key $\rightarrow$ `Doctor`)
    - `startTime`: DateTime
    - `endTime`: DateTime
    - `durationMinutes`: Int (Default: 30)
    - `status`: String (`SCHEDULED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`)
    - `type`: String (`IN_PERSON`, `TELEHEALTH`, `FOLLOW_UP`)
    - `reason`: String?
    - Relations: `visit`, `recommendation`

### 1.6 AI Triage & Doctor Recommendations
17. **`PatientSymptomRequest`**:
    - `id`: UUID (Primary Key)
    - `patientId`: UUID (Foreign Key $\rightarrow$ `Patient`)
    - `rawSymptomText`: String
    - `suggestedSpecialty`: String?
    - `urgencyScore`: Int?
    - `isEmergency`: Boolean (Default: false)
    - `status`: String (`PENDING`, `TRIAGED`, `RESOLVED`, `CANCELLED`)
    - Relations: `recommendations`
18. **`AIRecommendation`**:
    - `id`: UUID (Primary Key)
    - `requestId`: UUID (Foreign Key $\rightarrow$ `PatientSymptomRequest`)
    - `recommendedSpecialty`: String
    - `confidenceScore`: Float
    - `clinicalRationale`: String
    - `recommendedDoctorIds`: String[] (Array of Doctor UUIDs)
    - `selectedDoctorId`: String?
    - `appointmentId`: UUID? (Unique, Foreign Key $\rightarrow$ `Appointment`)
    - `status`: String (`GENERATED`, `VIEWED`, `ACCEPTED`, `BOOKED`, `DISMISSED`)

### 1.7 Support, Audit & Agent Telemetry
19. **`SupportTicket`**:
    - `id`: UUID (Primary Key)
    - `userId`: UUID (Foreign Key $\rightarrow$ `User`)
    - `ticketNumber`: String (Unique)
    - `subject`: String
    - `description`: String
    - `priority`: String (`LOW`, `MEDIUM`, `HIGH`, `URGENT`)
    - `status`: String (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`)
20. **`Notification`**:
    - `id`: UUID (Primary Key)
    - `userId`: UUID (Foreign Key $\rightarrow$ `User`)
    - `title`: String
    - `message`: String
    - `type`: String (`INFO`, `WARNING`, `SUCCESS`, `URGENT`)
    - `isRead`: Boolean (Default: false)
21. **`AgentExecution`**:
    - `id`: UUID (Primary Key)
    - `userId`: String?
    - `agentId`: String
    - `userPrompt`: String
    - `finalResponse`: String?
    - `status`: String (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`)
    - `startedAt`, `completedAt`: DateTime?
    - Relations: `steps` (`AgentStep`)
22. **`AgentStep`**:
    - `id`: UUID (Primary Key)
    - `executionId`: UUID (Foreign Key $\rightarrow$ `AgentExecution`)
    - `stepNumber`: Int
    - `agentId`: String
    - `toolName`: String?
    - `toolInput`: JSON?
    - `toolOutput`: JSON?
    - `authorization`: String?
    - `status`: String
    - `durationMs`: Int?
23. **`AuditLog`**:
    - `id`: UUID (Primary Key)
    - `userId`: UUID? (Foreign Key $\rightarrow$ `User`)
    - `action`: String
    - `resource`: String
    - `resourceId`: String?
    - `ipAddress`: String?
    - `userAgent`: String?
    - `metadata`: JSON?
    - `createdAt`: DateTime

---

## 2. Integrity Indexes & SQL Constraints

Executed in `prisma/appointment-integrity.sql`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_doctor_start_unique
ON "Appointment" ("doctorId", "startTime")
WHERE "status" IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS');

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_patient_start_unique
ON "Appointment" ("patientId", "startTime")
WHERE "status" IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS');

ALTER TABLE "Appointment"
DROP CONSTRAINT IF EXISTS positive_duration;

ALTER TABLE "Appointment"
ADD CONSTRAINT positive_duration CHECK ("durationMinutes" > 0);
```
