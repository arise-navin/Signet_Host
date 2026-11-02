# Read-only appointment verification

The creation confirmation guard matched `book`, `schedule`, or `create` anywhere in the prompt, including negative instructions such as “do not book.” It then rejected the appointment ID rendered from a successful lookup because no creation tool had run. The earlier exact-ID shortcut also excluded these negative instructions, required complete records, and conflated missing records with authorization denial.

Read-only exact-ID requests now use a deterministic authorized lookup path. They cannot execute appointment mutations, do not require a booking receipt, and render only fields returned for the matching ID. Missing fields and unavailable duplicate evidence are marked NOT VERIFIED. Missing rows return NOT FOUND; unauthorized rows return an authorization failure without record details. Availability includes the backend slot status and returned available times. The existing authorized exact-ID tool counts additional active overlapping appointments for the same patient and doctor after authorization; this count does not claim to detect unrelated bookings elsewhere.

Files changed:

- `packages/agents/src/appointmentVerification.ts`: read-only intent recognition, matching-record validation and verified-field rendering.
- `packages/agents/src/agents/AgentRunner.ts`: separate read-only workflow, tool restriction and availability rendering; creation confirmation remains required for creation requests.
- `packages/agents/src/tools/implementations.ts`: distinguish absent rows from denied access and query duplicate active bookings after authorization.
- `backend/src/tests/appointment-verification.test.ts`: five regressions covering the supplied record, missing and denied records, incomplete/mismatched data and prior conversation context.
- `backend/src/tests/booking-context.test.ts`: retain unrelated-record denial coverage and verify a read-only lookup after a real booking in the same conversation.
- This report.

Actual validation on 2026-10-27:

- `npm run test --workspace=backend -- src/tests/appointment-verification.test.ts src/tests/booking-context.test.ts`: 12 tests passed across two files (21.31 seconds).
- `npm run lint`: passed.
- `npx tsc --project packages/agents/tsconfig.json --noEmit`: passed.
- `npx tsc --project backend/tsconfig.json --noEmit`: passed.
- Local PostgreSQL record `954770a2-5466-497d-9af9-83681f747286`: authorized lookup succeeded, status SCHEDULED, slot OCCUPIED, zero additional active overlapping bookings for the same patient and doctor. Response values were checked against the stored patient, doctor, reason and start time. Its read-only requests executed only `get_appointment_by_id` and `get_available_slots`.

Integration tests use real PostgreSQL and the existing server; incomplete-data tests exercise the renderer directly without mocked services. The supplied appointment remains unchanged. No application build, authorization grant changes, Signet integration or git commit was performed.
