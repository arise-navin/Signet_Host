# Patient UUID authorization

## Root cause and scope

A patient UUID identifies a record; it is never an authorization credential. The reported statement was incorrect. Inspection found no affirmative instruction granting permission from a UUID in the current source: the shared runner already said that a supplied UUID grants no permission. However, the Appointment Agent lacked both an explicit patient-selection authorization procedure and access to the existing authorized patient lookup. This left name selection and authorization explanations to model interpretation. The final booking handler checked authorization before entering its transaction, rather than rechecking inside the mutation transaction.

The application and existing scheduling policy remain in place. No Signet integration or new permission grants were introduced.

## Files changed

- `packages/agents/src/agents/definitions.ts`: Appointment Agent can use `list_authorized_patients`; instructions require authorized name lookup, server session identity, successful preflight checks, denial on 403, and actual booking receipts. Patient IDs, permission results and tool outputs must not be invented.
- `packages/agents/src/agents/AgentRunner.ts`: shared session instructions explicitly distinguish identifiers from credentials and require successful backend checks before claiming verified access. Existing server-generated booking receipts continue to replace model prose after successful booking.
- `packages/agents/src/tools/implementations.ts`: expose the existing restricted patient-name lookup to the Appointment Agent; clarify tool descriptions; repeat patient relationship and scheduling authorization inside the booking transaction before replay or insertion.
- `backend/src/tests/booking-context.test.ts`: real PostgreSQL coverage for name lookup, unauthorized existing and random UUIDs, no inserts after denial, and a chat ADMIN impersonation attempt. Existing authorized booking, real receipt, replay and availability tests remain.

## Trusted identity and database checks

`backend/src/middleware/auth.ts` verifies the signed session and reads the user, role, doctor and patient profiles from PostgreSQL using the verified subject. Chat role claims and tool parameters cannot replace this context. `backend/src/routes/chat.ts` passes this server identity into the runner; `ToolExecutor` validates arguments and enforces role and agent tool permissions.

The existing schema represents a doctor-patient care relationship through qualifying appointments or visits, rather than a separate assignment table. `security.ts` queries `patient.findFirst` with the selected patient ID and `careRelationshipFilter(session.doctorId)`: an appointment with status SCHEDULED, CONFIRMED, RESCHEDULED or COMPLETED, or a patient visit with that doctor. The authorized name lookup applies that same predicate plus a case-insensitive name search and returns only patient ID and name. Missing relationships and nonexistent UUIDs receive the same 403 without clinical data.

Both `validate_appointment_booking` and `book_appointment` independently invoke `resolveBookingPatient` and `authorizeAppointment`. The final handler additionally repeats these checks inside its PostgreSQL transaction, including before an idempotent receipt is returned. Doctor scheduling remains restricted to the session doctor's schedule; staff department grants and patient self-booking remain unchanged. Existing slot validation, participant locks, duplicate prevention, audit records and actual database appointment receipts remain active.

## Executed validation

- Initial focused PostgreSQL run: `npm run test --workspace=backend -- src/tests/booking-context.test.ts`: 5 tests passed before the additional chat impersonation assertion was added.
- `npm run build`: passed across all workspaces; Vite emitted its existing large-chunk advisory.
- `npm run lint`: passed, including a second run after the chat assertion was added.
- `npm run build --workspace=backend`: passed after the final test changes.
- Full backend suite: `npm test` passed, 81 tests across 6 files (64.25 seconds), including the final chat impersonation assertion. Output: `patient-uuid-tests.log`.

The chat endpoint uses SSE: once streaming starts, the HTTP envelope is 200; authorization failures carry statusCode 403 in tool/error events. Direct backend authorization errors retain statusCode 403. The tests distinguish this transport behavior from permission grants.

Regression evidence from the executed suite:

| Scenario | Result |
|---|---|
| Assigned doctor and assigned patient within scheduling policy | Passed preflight and booking |
| Unassigned existing patient / valid UUID assigned to another doctor | Both preflight and direct mutation returned 403 |
| Random UUID | Both preflight and direct mutation returned 403 without record data |
| Authorized name search | Returned the assigned patient's exact database ID and name; unassigned name returned an empty list |
| Chat falsely claiming ADMIN | Authenticated execution remained owned by the doctor; no successful booking or insertion |
| Failed authorization | Appointment count unchanged |
| Successful authorized booking | Receipt ID matched the persisted PostgreSQL appointment; replay created no duplicate |
| Availability and existing workflows | Full backend suite passed |

This verifies the backend boundary and the exercised live model conversation. Prompt instructions do not establish a universal guarantee about every future model utterance; authorization remains enforced by PostgreSQL-backed code regardless of model wording.
