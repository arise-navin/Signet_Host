# Hospital AI Lab — Role & Permission Matrix

## Overview
This document specifies the access control policies, security boundaries, and authorization rules implemented in Hospital AI Lab. Role-Based Access Control (RBAC) is strictly enforced on the server side (`backend/src/middleware/auth.ts` and `ToolExecutor.ts`).

---

## 1. System Roles

| Role | Target Portal | Scope & Description |
|---|---|---|
| **`ADMIN`** | `/admin/dashboard` | Hospital operations, staff roster, scheduling configurations, patient assignment, system reports, AI telemetry. Cannot casually access patient clinical charts without audit justification. |
| **`DOCTOR`** | `/doctor/dashboard` | Clinical management of assigned patients, personal schedule timeline, weekly shift configuration, consultation notes, lab review queue. |
| **`PATIENT`** | `/patient/dashboard` | Self-service registration, personal health profile, upcoming appointments, symptom triage, AI doctor recommendations, support tickets. Strictly isolated to own records. |
| **`RECEPTIONIST`** | `/appointments` | Front-desk patient check-in, clinic appointment scheduling, doctor directory search. |

---

## 2. API Endpoint Permission Matrix

| Endpoint | Method | ADMIN | DOCTOR | PATIENT | RECEPTIONIST | Anonymous |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `/api/auth/login` | POST | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/api/auth/register` | POST | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/api/auth/change-password` | POST | ✓ | ✓ | ✓ | ✓ | ✗ |
| `/api/auth/logout` | POST | ✓ | ✓ | ✓ | ✓ | ✗ |
| `/api/admin/overview` | GET | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/doctors` | GET, POST | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/doctors/:id/status`| PATCH | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/patients` | GET | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/assignments` | POST | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/ai-agents` | GET | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/api/doctor/overview` | GET | ✗ | ✓ (Self) | ✗ | ✗ | ✗ |
| `/api/doctor/patients` | GET | ✗ | ✓ (Assigned) | ✗ | ✗ | ✗ |
| `/api/doctor/availability` | GET, POST | ✗ | ✓ (Self) | ✗ | ✗ | ✗ |
| `/api/patient/overview` | GET | ✗ | ✗ | ✓ (Self) | ✗ | ✗ |
| `/api/patient/symptoms/submit` | POST | ✗ | ✗ | ✓ (Self) | ✗ | ✗ |
| `/api/patient/symptoms/:id/book`| POST | ✗ | ✗ | ✓ (Self) | ✗ | ✗ |
| `/api/patient/medical-records`| GET | ✗ | ✗ | ✓ (Self) | ✗ | ✗ |
| `/api/chat/stream` | POST | ✓ | ✓ | ✓ | ✓ | ✗ |

---

## 3. AI Agent Tool Permission Matrix

| Tool Name | ADMIN | DOCTOR | PATIENT | RECEPTIONIST | Scoping Constraint |
|---|:---:|:---:|:---:|:---:|---|
| `get_doctors` | ✓ | ✓ | ✓ | ✓ | Public active physician directory |
| `get_available_slots` | ✓ | ✓ | ✓ | ✓ | Open schedule slots |
| `validate_appointment_booking`| ✓ | ✓ (Assigned) | ✓ (Self) | ✓ | Read-only policy evaluation |
| `book_appointment` | ✓ | ✓ (Assigned) | ✓ (Self) | ✓ | Mutation tool; enforces slot collisions |
| `get_appointment_by_id` | ✓ | ✓ (Assigned) | ✓ (Self) | ✓ | Must own or be doctor of appointment |
| `reschedule_appointment` | ✓ | ✓ (Assigned) | ✓ (Self) | ✓ | Ownership/doctor check |
| `cancel_appointment` | ✓ | ✓ (Assigned) | ✓ (Self) | ✓ | Ownership/doctor check |
| `get_patient_profile` | ✓ (Admin) | ✓ (Assigned) | ✓ (Self) | ✗ | Scoped by `DoctorPatientAssignment` |
| `get_medical_history` | ✗ (Clinical) | ✓ (Assigned) | ✓ (Self) | ✗ | Unassigned doctors rejected |
| `get_consultation_notes` | ✗ (Clinical) | ✓ (Assigned) | ✓ (Self) | ✗ | Unassigned doctors rejected |
| `get_prescriptions` | ✗ (Clinical) | ✓ (Assigned) | ✓ (Self) | ✗ | Unassigned doctors rejected |
| `get_lab_report` | ✗ (Clinical) | ✓ (Assigned) | ✓ (Self) | ✗ | Unassigned doctors rejected |
| `get_lab_status` | ✗ (Clinical) | ✓ (Assigned) | ✓ (Self) | ✗ | Unassigned doctors rejected |
| `summarize_lab_report` | ✗ (Clinical) | ✓ (Assigned) | ✓ (Self) | ✗ | Unassigned doctors rejected |
| `create_support_ticket` | ✓ | ✓ | ✓ | ✓ | Linked to authenticated caller `userId` |
| `get_support_ticket` | ✓ (Staff) | ✓ (Staff) | ✓ (Owner) | ✓ (Staff) | Patients only see own tickets |
| `list_my_support_tickets` | ✓ | ✓ | ✓ | ✓ | Filtered by caller `userId` |
| `get_hospital_faq` | ✓ | ✓ | ✓ | ✓ | General knowledge repository |
| `transfer_to_agent` | ✓ | ✓ | ✓ | ✓ | Inter-agent delegation; self-transfer blocked |

---

## 4. Key Security Rules

1. **Never Trust Frontend Role Claims**: The user's role is retrieved from the database `User.role` associated with the verified JWT `userId`.
2. **Never Return Passwords**: Password hashes are stripped before serialization across all user and doctor endpoints.
3. **Clinical Isolation**: A doctor cannot access the records of a patient who has not been assigned to them.
4. **Patient Self-Data Isolation**: URL alteration (e.g. changing query parameters or path IDs) does not grant access to another patient's records; APIs strictly query by the authenticated session token.
5. **Development Bootstrap Guard**: The bootstrap credential `admin` / `1812` is marked with `mustChangePassword: true`, requiring immediate password update before standard dashboard use.
