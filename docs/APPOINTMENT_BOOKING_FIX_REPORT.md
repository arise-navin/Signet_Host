# Appointment booking scope, doctor context and failure retrieval

## Confirmed database evidence and root causes

The reported failed booking is execution `e9ef2eff-cea9-4b4b-82b9-6345512ce7ec`, conversation `fc1c11b9-e03b-4495-8b44-9117c7381bbe`.

- Authenticated user: **Dr. Marcus Vance**, database role **DOCTOR**.
- Marcus's doctor profile: `f1dee1b2-485c-486d-a699-e3efcaf8b11c`.
- Requested doctor, Sarah Mitchell: `8e1fd503-4424-4653-82f0-e2f720119785`.
- Jack Adams's patient profile: `335873cd-f846-4f83-95a9-22794559aa66`.
- The existing care-relationship query confirms Jack is assigned to Marcus.
- Requested local time: **27 October 2026, 10:00 Asia/Kolkata**, stored/queried UTC equivalent **2026-10-27T04:30:00.000Z**.
- A read-only preflight executed against the actual authenticated doctor's context returned **403**, `This appointment is outside your assigned scheduling scope.`
- Matching patient/doctor/start appointment count before and after that verification: **0 / 0**. Sarah's actual database-derived availability still includes the requested start time. Existing appointments were not changed.

The resolution failure `b180492f-98e0-465c-9b77-05b7d4b21162` belongs to that **same conversation**, not a new conversation. The previous implementation rebuilt an empty in-memory doctor directory each request and populated it only for particular prompt keywords. It had no durable verified selection. A follow-up could contain a valid historical doctor reference while the new request's directory was empty.

Failed booking retrieval had no dedicated tool or outcome reference. The normal appointment-list instruction could therefore return the authenticated doctor's unrelated existing schedule instead of the failed attempt. A failed attempt has no appointment ID.

## Scheduling policy preserved

The existing backend policy is retained:

| Caller | Permitted booking context |
| --- | --- |
| Patient | Own linked patient profile; a valid target doctor's available slot |
| Doctor acting professionally | A patient with a verified care relationship, on that doctor's own schedule |
| Doctor acting as a patient | Requires the existing linked personal patient profile; the own-patient exception remains unchanged |
| Receptionist / admin | Explicit department scheduling grants must include the target doctor's department |

An assigned patient relationship does **not** grant a doctor cross-doctor scheduling permission. Consequently Marcus cannot book Jack onto Sarah's schedule under the current policy. Public doctor availability is readable but does not confer booking authority. No broad admin or cross-doctor grant was introduced.

## Implemented behavior

1. Doctor names are resolved against the fresh PostgreSQL-backed directory. An explicit target such as “with Dr. Sarah Mitchell” takes precedence over incidental clinician names. Missing or ambiguous selections fail clearly; arbitrary IDs are never substituted.
2. A verified selection is persisted as an owner/conversation-scoped `VERIFIED_DOCTOR_SELECTION` audit record. Subsequent requests reload and revalidate its profile/name. A same-doctor reference in a new conversation asks for the name rather than inheriting another conversation's selection. Handoffs do not change its owner or permissions.
3. When the selected doctor and requested ISO date or “tomorrow” are clear, an explicit availability request queries current slots before generation. Old availability text is not reused as current evidence.
4. The orchestrator executes read-only `validate_appointment_booking` before invoking the booking mutation. It validates patient authorization, target scheduling scope, time/timezone, trimmed visit reason, doctor availability and patient overlap. A failure stops before `book_appointment`, returning the actual error prefixed with “No appointment was created.”
5. The final booking handler independently retains authorization and the same argument validation. Its transaction still performs participant locks, authoritative slot/patient-overlap checks and idempotency before insertion. Preflight success never replaces these final checks.
6. Booking tool failure terminates generation; successful booking confirmations use the actual tool appointment ID/status/time. Model prose cannot substitute a different successful booking result.
7. `get_booking_attempt` reads the exact most recent booking outcome from server execution logs in the authenticated conversation. Failed attempts return the actual failure and explicitly state there is no created appointment/ID. Successful attempts retrieve and reauthorize the specific database row. Missing conversation history asks for details or the original conversation.
8. Booking-recall intents advertise and authorize only the outcome-read tool and handoff. They cannot substitute `get_appointments` or perform a new mutation. The final reply uses that tool's authoritative response.

## Files changed

- `packages/agents/src/bookingContext.ts`: verified doctor resolution, durable owner/conversation selection and booking-recall intent.
- `packages/agents/src/agents/AgentRunner.ts`: context revalidation, fresh availability reads, mandatory preflight, failure stop and authoritative booking/outcome rendering.
- `packages/agents/src/tools/implementations.ts`: shared booking argument schema, preflight and exact-outcome tools; existing final-handler safeguards preserved.
- `packages/agents/src/agents/AgentRouter.ts`, `definitions.ts`: recall routing, restricted tools and precise instructions.
- `packages/agents/src/index.ts`: context exports.
- `frontend/src/components/ChatActivity.tsx`: understandable preflight/outcome labels, without layout changes.
- `backend/src/tests/booking-context.test.ts`: actual database and real Ollama booking-context regressions.

No Prisma migration or reseed was needed. Verified selection uses the existing audit store; execution logs already persist rejected/successful booking outcomes. Tests create and clean only isolated synthetic fixtures. No existing appointment was deleted or rescheduled.

## Actual test results

Final verification results are recorded after execution. One initial run passed 78 tests and failed the new fresh-availability assertion: the model reused the prior same-date result without a new lookup. Fresh authoritative availability querying was added to fix the behavior; the test was retained rather than weakened.

| Requested regression | Evidence exercised |
| --- | --- |
| Authorized own-doctor booking | Actual assigned clinician/patient fixtures; preflight and final insert; saved doctor/patient/time/status checked |
| Unauthorized cross-doctor booking | Actual preflight 403 and independently invoked final-handler 403 |
| Doctor name resolution | Real-model named availability with actual Doctor.id in results |
| Context retention | PostgreSQL selection reload, subsequent same-doctor turn and isolated new conversation |
| Failure explanation | Real-model retrieval of the recorded failed preflight; exact error, no appointment ID, zero unrelated list-tool calls |
| No mutation after 403 | Appointment counts unchanged after preflight and direct final-handler rejection |
| Slot remains available | Authoritative slot computation still includes rejected target time |
| No duplicate appointments | Correlated booking replay returns the same actual ID; same-slot count equals one |
| Exact successful retrieval | Real-model booking recall returns the specifically inserted appointment ID and actual status |

## Remaining limitations

- Cross-doctor scheduling remains intentionally forbidden for this clinician context. A permitted patient/receptionist/admin session must satisfy its own existing scope; this fix does not grant that scope.
- Doctor selection is scoped to one authenticated conversation. A new conversation does not inherit it.
- Availability prefetch recognizes explicit ISO dates and “tomorrow”; other natural-language dates continue through the existing model/tool date validation path.
- The audit store retains selection history. It is not a new permission grant, and every use rechecks the current database profile and booking scope.
- The existing non-failing frontend bundle-size warning and previously documented historical appointment overlaps remain outside this change.
