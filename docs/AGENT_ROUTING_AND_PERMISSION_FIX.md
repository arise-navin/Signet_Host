# Hospital AI Lab — Agent Routing & Permission Fix Report

## Overview
This document synthesizes the architectural bug fixes applied to the AI Agent framework in Phase 9 (Read-Only Scheduling Authorization) and Phase 10 (Agent Routing and Self-Transfer Prevention).

---

## 1. Issue 1: Read-Only Scheduling Authorization ("Permission Check Result: NOT VERIFIED")

### 1.1 Problem Statement
In earlier iterations, the Appointment Agent could locate doctor and patient records (e.g. Jack Adams and Dr. Sarah Mitchell), but when asked to verify whether a booking was allowed, reported:
```
Permission Check Result: NOT VERIFIED
```
This was caused by the lack of an authoritative, non-mutating pre-flight verification tool. Agents were forced to either attempt an actual write mutation (`book_appointment`) or return an unverified status.

### 1.2 Technical Resolution
Implemented `validate_appointment_booking` in `packages/agents/src/tools/AppointmentTools.ts`:
- **Read-Only**: Queries database relations without performing inserts or updates.
- **Multi-Factor Policy Check**:
  1. Checks if the caller has legitimate authority (Admin, assigned Doctor, or Patient booking for self).
  2. Verifies the target physician is active (`isActive: true`).
  3. Verifies whether the requested slot falls within the doctor's weekly shift (`DoctorSchedule`).
  4. Queries `Appointment` table to ensure no active overlapping booking exists.
- **Deterministic Return**: Returns `{ allowed: true, reason: string }` or `{ allowed: false, reason: string }`.

### 1.3 Verification
- Tested in `backend/src/tests/booking-context.test.ts` and `backend/src/tests/read-only-validation.test.ts`.
- Verified that running `validate_appointment_booking` produces 0 side effects on the database and returns authoritative boolean outcomes.

---

## 2. Issue 2: Agent Self-Transfer Runtime Error ("Cannot transfer to the same agent")

### 2.1 Problem Statement
When multi-turn requests were processed by the Care Coordinator (`care-agent`), follow-up reasoning frequently triggered `transfer_to_agent("care-agent")`. Because the agent framework disallowed transferring to the currently active agent, it threw an unhandled exception:
```
Error: Cannot transfer to the same agent (care-agent)
```
This aborted the workflow and left the user with an incomplete response.

### 2.2 Technical Resolution
Added a self-transfer short-circuit in `packages/agents/src/tools/CoreTools.ts`:
```ts
if (targetAgentId === currentAgentId) {
  return {
    success: true,
    message: `Already handled by ${currentAgentId}. Proceeding directly with tool execution.`,
    transferred: false,
    currentAgent: currentAgentId,
  };
}
```
In `AgentRunner.ts`, the runner detects `transferred: false` and continues tool execution without re-entering the transfer lifecycle.

### 2.3 Verification
- Tested in `backend/src/tests/support-ticket.test.ts` across 18 sequential test cases.
- Confirmed that self-transfer attempts now resolve cleanly and allow the current agent to proceed with support ticket generation, record lookup, or FAQ resolution.
