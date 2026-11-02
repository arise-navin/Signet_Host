# Phase 6: Patient Registration & Personal Dashboard Implementation Report

## Overview
Phase 6 delivers a complete patient experience for Hospital AI Lab, comprising self-service registration (`/register`) with automatic Medical Record Number (MRN) generation and an isolated, personal Patient Dashboard (`/patient/dashboard`) ensuring patients only access their own clinical and appointment records.

---

## 1. Patient Registration Architecture

### 1.1 Self-Registration Workflow
Endpoint: `POST /api/auth/register`
- **Fields Collected**: Full name, email, phone number, password, date of birth, gender, address, emergency contact name/phone, allergies, and blood group.
- **Unique MRN Generation**: The server generates an unambiguous, sequential-random Medical Record Number prefixed with `MRN-` (e.g. `MRN-784920`).
- **Transactional Integrity**: Uses a Prisma interactive transaction:
  1. Checks for duplicate email (`409 Conflict`).
  2. Hashes password using `bcryptjs` (salt rounds = 10).
  3. Inserts `User` record with role `PATIENT`.
  4. Inserts `Patient` record linked to `User.id` with `medicalRecordNumber`.
  5. Returns JWT token and sanitized patient profile.

### 1.2 Strict Patient Isolation
- All patient APIs extract the authenticated patient's ID directly from `req.authUser.userId` $\rightarrow$ `prisma.patient.findUnique({ where: { userId } })`.
- No patient can pass another patient's ID in queries, route parameters, or JSON payloads to view their records. URL tampering is completely ineffective.

---

## 2. Patient Dashboard Features

Endpoint: `GET /api/patient/overview`
Retrieves the authenticated patient's profile and comprehensive records:
1. **MRN & Demographic Banner**: Full Name, MRN badge, Blood Group, Age, and Emergency Contacts.
2. **Upcoming Appointments**: Active scheduled visits with doctor name, specialty, room number, date/time, and status.
3. **Past Appointment History**: Historical visits with doctor consultation notes.
4. **My Assigned Care Team**: Primary and specialist doctors assigned via care coordination.
5. **Active Prescriptions**: Medications, dosage, frequency, and prescribing doctor.
6. **Diagnostic Lab Reports**: Lab tests, dates, normal/abnormal status, and reference ranges.
7. **Support Tickets**: Help desk and scheduling assistance inquiries.

---

## 3. Frontend Implementation

Implemented in `frontend/src/pages/PatientDashboardPage.tsx`:
- **Tabs**:
  1. **Overview**: Summary of next appointment, assigned doctors, and recent health summary.
  2. **My Appointments**: Filterable list of upcoming/past appointments with direct cancellation and booking links.
  3. **Describe Health Issue (AI Triage)**: Direct integration of Phase 7 symptom triage and doctor recommendation engine.
  4. **Medical Records**: Diagnostic lab reports, active prescriptions, and clinical visit notes.
  5. **Support Tickets**: Live list of support inquiries and agent escalations.
