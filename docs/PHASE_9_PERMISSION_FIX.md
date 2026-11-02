# Phase 9: Read-Only Scheduling Permission Fix Implementation Report

## Overview
Phase 9 resolves the scheduling authorization verification issue where the Appointment Agent could resolve doctor and patient identities (such as Jack Adams and Dr. Sarah Mitchell), but failed pre-flight scheduling validation with:
`Permission Check Result: NOT VERIFIED`
because an authoritative read-only permission check tool was not available to the agent.

---

## 1. Problem Root Cause
- In the initial implementation, booking validation was tightly coupled to the destructive `book_appointment` mutation tool.
- When an agent attempted to check whether a doctor could book an appointment for a patient with a target physician, it had no idempotent way to query authorization without attempting an actual write mutation.
- As a consequence, preflight permission queries failed or reported `NOT VERIFIED`.

---

## 2. Solution: `validate_appointment_booking` Tool

### 2.1 Tool Registration & Schema
Registered in `packages/agents/src/tools/AppointmentTools.ts` and enabled in `packages/agents/src/agents/AgentRegistry.ts`:
```ts
export const validateAppointmentBookingTool: ToolDefinition = {
  name: 'validate_appointment_booking',
  description: 'Authoritative read-only check of whether the current user is permitted to book an appointment for the specified patient and doctor. Performs no database mutations.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient UUID' },
      doctorId: { type: 'string', description: 'Target Doctor UUID' },
      startTime: { type: 'string', description: 'Proposed appointment start time (ISO 8601)' },
    },
    required: ['patientId', 'doctorId'],
  },
};
```

### 2.2 Server-Side Authorization Logic
The tool evaluates the following policy criteria strictly in read-only mode:
1. **Authenticated User Role**:
   - `ADMIN`: Fully authorized across all patients and doctors.
   - `DOCTOR`: Permitted if the doctor has an active `DoctorPatientAssignment` with the patient, or is booking into their own schedule.
   - `PATIENT`: Permitted only if `patientId` matches their own patient profile.
   - `RECEPTIONIST`: Permitted for hospital-wide scheduling workflows.
2. **Doctor Active Status**: Verifies that the target doctor is active (`isActive: true`).
3. **Availability & Collision Check**: If `startTime` is provided, checks if the target doctor is on shift and that no active appointment occupies that slot.
4. **Idempotence**: Performs zero database inserts, updates, or deletes.

---

## 3. Verification & Regression Testing

Verified in `backend/src/tests/read-only-validation.test.ts` and `backend/src/tests/booking-context.test.ts`:
- **Authorized Scenario**: Dr. Marcus Vance checking for assigned patient Jack Adams returns `{ allowed: true, reason: 'Authorized doctor-patient care relationship.' }`.
- **Unauthorized Scenario**: Requesting for an unassigned patient or cross-doctor unauthorized booking returns `{ allowed: false, reason: 'Doctor is not assigned to this patient.' }`.
- **Zero Side Effects**: Confirmed that running `validate_appointment_booking` leaves the `Appointment` table unchanged.
