# Phase 3: Login Page & Role-Based Authentication Implementation Report

## Overview
Phase 3 establishes an enterprise-grade, secure, multi-role authentication architecture for Hospital AI Lab, providing distinct landing and login workflows for Patients, Doctors, and Administrators, with strict server-side validation and local development bootstrap support.

---

## 1. Authentication Architecture

### 1.1 Server-Side Role Enforcement
- **Roles Enforced**: `ADMIN`, `DOCTOR`, `PATIENT` (along with `RECEPTIONIST`).
- **Token Format**: Bearer JWT tokens signed with secure server secret (`JWT_SECRET`), carrying `{ userId, username, role, mustChangePassword }`.
- **Zero Frontend Trust**: Role claims sent in payloads are strictly checked against the database `User.role` relation. No client can escalate privilege or access unauthorized dashboards.
- **Header Propagation**: Frontend Axios API client automatically attaches `Authorization: Bearer <token>` to all protected endpoints.

### 1.2 Rate Limiting & Audit Logging
- Implemented in `backend/src/routes/auth.ts`:
  - 10 login attempts per IP per 5 minutes using an in-memory sliding window cache.
  - Returns `429 Too Many Requests` on breach with standard `Retry-After: 300` header.
  - Every login attempt (successful or failed), registration, and password change writes an immutable audit record to `prisma.auditLog` with `action`, `resource`, `ipAddress`, and `userAgent`.

### 1.3 Local Development Admin Bootstrap
- **Bootstrap Username**: `admin`
- **Initial Password**: `1812` (hashed via `bcryptjs` with salt rounds = 10 in `prisma/seed.ts`).
- **Forced Password Reset**: Marked with `mustChangePassword: true` in the database.
- **Workflow**:
  - Upon first login with `1812`, server returns `{ token, mustChangePassword: true }`.
  - Frontend detects `mustChangePassword` and displays an inline reset dialog requiring a new password (min 8 characters).
  - Calling `/api/auth/change-password` updates `passwordHash` and clears `mustChangePassword: false`.
- **Production Guardrails**:
  - The bootstrap credential `1812` is strictly guarded for local development.
  - Passwords are never returned in API responses, console outputs, or frontend source code.

---

## 2. API Endpoints Implemented

| Method | Endpoint | Authorization | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticates username/email + password, checks role match, returns JWT token & user profile |
| `POST` | `/api/auth/register` | Public | Self-registration for new patients; generates unique MRN, hashes password, returns JWT |
| `POST` | `/api/auth/change-password` | Bearer Token | Updates user password, verifies current password, clears `mustChangePassword` |
| `POST` | `/api/auth/logout` | Bearer Token | Invalidates session and writes audit log entry |
| `GET` | `/api/auth/me` | Bearer Token | Returns current authenticated user profile, role, and permissions |

---

## 3. Frontend Implementation

### 3.1 Public Portal Routes
- **Homepage (`/`)**: Modern hospital landing portal with cards for Patient Login, Doctor Login, Admin Login, Patient Registration, and dev bootstrap notice.
- **Login Page (`/login`)**: Tabbed portal supporting Patient, Doctor, and Admin logins with role-specific color accents and inline password reset handler.
- **Patient Registration (`/register`)**: Full self-service registration form collecting Full Name, Email, Phone, DOB, Gender, Emergency Contact, and Medical History.

### 3.2 Role-Based Redirects
Upon successful login:
- `ADMIN` $\rightarrow$ `/admin/dashboard`
- `DOCTOR` $\rightarrow$ `/doctor/dashboard`
- `PATIENT` $\rightarrow$ `/patient/dashboard`

---

## 4. Verification & Testing

Backend test suite `backend/src/tests/auth-phase3.test.ts` verified 10/10 test cases:
1. `POST /api/auth/login` authenticates initial bootstrap admin (`admin` / `1812`) and flags `mustChangePassword: true`.
2. `POST /api/auth/login` rejects invalid password with `401 Unauthorized`.
3. `POST /api/auth/login` rejects role mismatch with `403 Forbidden`.
4. `POST /api/auth/register` creates a new patient with unique MRN, hashes password, and creates linked `Patient` profile.
5. `POST /api/auth/register` prevents duplicate email registrations with `409 Conflict`.
6. `POST /api/auth/change-password` rejects weak new passwords with `400 Bad Request`.
7. `POST /api/auth/change-password` updates password and sets `mustChangePassword: false`.
8. `POST /api/auth/login` verifies subsequent logins with new password.
9. `POST /api/auth/logout` records audit log and completes cleanly.
10. `GET /api/admin/overview` rejects unauthenticated requests with `401 Unauthorized`.
