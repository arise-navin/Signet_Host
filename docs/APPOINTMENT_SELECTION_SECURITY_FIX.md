# Appointment selection memory and scheduling security

Verified: 26 October 2026. This change fixes the existing application; the frontend layout and AI provider architecture remain unchanged. No Signet integration was added.

## Reproduction and root cause

The exact reported sentence was found in persisted execution `a4671653-8c76-4a4c-8b78-f9fa69767036`, conversation `4dc66ec6-4397-441a-9c54-7e750dd4440e`.

- The authenticated account for this execution was `admin@hospital.com`, role `ADMIN`. It was not a patient or doctor session.
- The old selection parser matched short, whole-message replies such as `1`. It did not recognize `appointment #1` embedded in the complete support request.
- Normal appointment-list responses had no durable number-to-ID mapping. Only an already-pending ticket workflow retained candidate IDs, without a displayed-list identity, permission snapshot or expiry.
- Consequently, the request became a fresh workflow, fetched 50 rows and asked for selection again. The pending state held the new list, rather than resolving the previously displayed list.
- Admin and receptionist appointment queries used an unrestricted role default. No explicit department-grant model existed. The reported admin query therefore included different patients/doctors.

## Authorization findings

Confirmed defects fixed:

1. Default-wide scheduling access for admin/receptionist accounts, without explicit department assignments.
2. REST appointment and dashboard detail filters could become unrestricted when a PATIENT/DOCTOR account lacked its required linked profile.
3. Staff appointment mutations and appointment-linked support tickets lacked department-level authorization.
4. Historical appointment tables could be reused as model context after permissions changed, instead of retrieving currently authorized data.

The reported execution proves broad **admin** disclosure under the old role default. It does not establish that a patient or doctor session saw those same 50 rows. Valid linked patient/doctor tool queries already had basic scoping; these protections are retained and centralized.

Current policy is enforced before records reach Ollama:

| Account/context | Scheduling access |
| --- | --- |
| Patient | Its verified linked patient profile only |
| Doctor professional schedule | Its verified doctor profile only |
| Personal appointments | A verified linked patient profile is required |
| Receptionist | Only explicitly granted doctor departments |
| Admin | Only explicitly granted doctor departments; the role alone grants no appointment rows |
| Missing required patient/doctor profile | HTTP/tool 403; no unrestricted query |

`SchedulingDepartmentAccess` is the explicit staff grant store. Existing staff accounts receive no automatic grants. Authorized database administration/Prisma tooling must assign the intended departments; there is no self-escalation API. Unassigned staff scheduling lists are empty. Clinical-record permissions remain separate and are not widened.

The same scope filtering covers the appointment tool, REST appointment list, dashboard recent appointment details, appointments nested in patient detail, booking/rescheduling/cancellation authorization and support-ticket association. Conversation ownership and authenticated identity are preserved through handoffs.

## Implemented selection and workflow behavior

- `DisplayedAppointmentList` stores conversation ID, authenticated user ID, immutable numbered item-to-appointment mapping, authorization scope, creation time, expiry and publication time.
- Both ordinary appointment chat lists and support-workflow clarification lists use an authoritative server-rendered numbered table. The stored order is exactly the rendered order; model-generated reordering cannot redefine the numbers.
- Lists expire after 15 minutes. A snapshot becomes eligible for references only after its corresponding response has been persisted for display. Failed/unpublished generations cannot silently introduce a new reference list.
- Full sentences containing `appointment #1`, simple numbered replies and simple ordinals resolve against the most recent published relevant list in that same conversation/account **before any new list lookup**.
- A new database row does not renumber an already displayed list. Missing/expired lists, conflicting numbers, changed scope or ambiguous references to an earlier list trigger a fresh authorized list and explicit reconfirmation. Even a refreshed single-item list does not silently consume an unavailable old number.
- The resolved appointment is checked again for access, active status and upcoming time. A supplied UUID is never sufficient authorization.
- PostgreSQL workflow state retains conversation/user, requested action `CREATE_SUPPORT_TICKET`, priority, description/follow-up issue, selected appointment, displayed-list identity, authorization scope, current step and status. Optional fields support pre-fix stored states; all new workflow states populate the new metadata.
- Care Coordinator executes the real authorized ticket mutation and returns its real database ID/status. The scheduling-conflict text and MEDIUM priority are retained. This workflow does not reschedule the appointment.
- Stable workflow operation IDs and existing transactional/request idempotency prevent repeated submissions from creating duplicate tickets.
- Workflow transitions compare the stored JSON state before updating it. Concurrent changes return HTTP 409 instead of silently overwriting another selection; the chosen appointment is persisted before the handoff and mutation.
- Historical appointment tool tables are summarized before being passed back to Ollama, while verified ticket receipts remain available. Historical chat rows themselves were not deleted or rewritten.

## Duplicate-booking investigation and database verification

The initial database audit found:

- **57 Emma Smith appointments:** 27 rescheduling-test fixtures, 27 cancellation-test fixtures, two seeded cardiovascular appointments, and one Test Lab booking fixture.
- **No exact duplicate Emma Smith patient/doctor/start-time groups**, and no exact active doctor/start-time duplicate groups across the database.
- **34 active overlapping interval pairs**. The observed pairs were historical rescheduling-test artifacts. Some timestamps differed by seconds/milliseconds but rendered as the same minute in the UI.

For example, existing rows `42e1de86-a431-449f-aeb9-484845869d09` and `ab666828-3afb-488a-894a-ed53387065ed` start at `2026-11-01T08:24:08.356Z` and `2026-11-01T08:26:31.060Z`. Both are marked `RESCHEDULED` with reason `Initial appointment for rescheduling test`, and their 30-minute intervals overlap.

These historical records were retained for review. No existing appointments were deleted or rescheduled by this fix. The Test Lab's old broad deletion-by-reason code was removed before executing its tests; scheduling scenarios now create isolated fictional doctor/patient fixtures and clean up only those newly created fixture users/resources.

Future protections:

- Booking/rescheduling lock both the doctor and patient in a consistent transaction lock order.
- Existing doctor availability/leave/interval checks remain authoritative; an additional transactional patient-interval check prevents simultaneous overlapping bookings with different doctors.
- PostgreSQL partial unique indexes reject identical active doctor/start and patient/start slots, including direct Prisma inserts.
- PostgreSQL enforces positive appointment duration.
- Conflicting native unique-index errors become HTTP/tool 409 for appointment mutations.

`prisma/appointment-integrity.sql` was applied successfully using `npm run db:integrity`. For a fresh database, apply the normal Prisma schema followed by that command; no database reset or reseed is required. Full interval exclusion at the database layer was not applied over the existing overlapping records: API/tool writes enforce interval rules, while the native indexes additionally enforce exact-slot uniqueness. Legacy cleanup and any full exclusion migration require a separate reviewed data-remediation decision.

## Files changed

- `prisma/schema.prisma`: explicit scheduling grants and durable published appointment-list snapshots.
- `prisma/appointment-integrity.sql`, root `package.json`: reproducible database uniqueness/duration protection and command.
- `packages/agents/src/appointmentAccess.ts`: centralized role/profile/department scope and per-appointment authorization.
- `packages/agents/src/appointmentLists.ts`: reference parsing, exact rendered-order storage, expiry/publication/scope checks and authorized selected-record resolution.
- `packages/agents/src/appointmentHistory.ts`: safe historical appointment context for subsequent model turns.
- `packages/agents/src/agents/appointmentSupport.ts`: resume existing intent from a numbered reference; preserve description/priority and durable workflow metadata.
- `packages/agents/src/agents/AgentRunner.ts`: canonical normal appointment tables, snapshot publication and current-authority history handling.
- `packages/agents/src/tools/implementations.ts`, `ToolExecutor.ts`, `scheduling.ts`, `index.ts`: scoped queries/mutations, participant locks, patient overlap protection, conflict mapping and exports.
- `backend/src/routes/appointments.ts`, `dashboard.ts`, `patients.ts`: scoped detailed appointment responses and fail-closed profile handling.
- `backend/src/routes/testLab.ts`: isolated scheduling fixtures and removal of broad deletion of existing appointment data.
- `backend/vitest.config.ts`: serial integration files because suites share and mutate seeded PostgreSQL patient state. Explicit concurrent booking tests still run simultaneous requests.
- `backend/src/tests/appointment-selection.test.ts`, `agent-regression.test.ts`: new reference/scope/integrity checks and concurrency tests using each patient's real identity.
- `tests/ui/support-ticket.spec.ts`: full-sentence selection after ordinary listing, refresh and added database rows.

## Actual test results

| Command/check | Result |
| --- | --- |
| `npx prisma db push --schema=prisma/schema.prisma` | PASS; additive schema applied and Prisma Client generated |
| `npm run db:integrity` | PASS; native indexes/check installed without deleting historical rows |
| `npm run build` | PASS; all workspace TypeScript/Vite builds |
| `npm run lint` | PASS |
| `npm test` | PASS; **69 tests**, five Vitest files |
| `npm run test:ui` | PASS; **9 Chromium workflows** using real backend/database/Ollama |

The dedicated selection suite has ten tests. Its end-to-end scenario first asks real Ollama for a normal appointment list, inserts a new earlier authorized row, submits the exact full selection sentence, and verifies the original displayed item remains the chosen appointment. The selection execution performs zero `get_appointments` calls, creates the real ticket, retains MEDIUM/conflict description and leaves the appointment unchanged. Other tests exercise stored mappings/expiry/scope directly against PostgreSQL; no mocked successful ticket or booking responses are used.

| Requested regression | Executed evidence | Result |
| --- | --- | --- |
| 1. Prior #1 resolution | Full sentence resolves the existing published snapshot | PASS |
| 2. Handoff preserves reference | Selected ID/user asserted in handoff audit and final ticket FK | PASS |
| 3. No silent renumbering | Earlier row inserted after display; original #1 retained; old snapshot remains unchanged | PASS |
| 4. Patient scope | Tool/REST filters and forged other-patient filter denied | PASS |
| 5. Doctor scope | Other-doctor filter cannot widen the assigned schedule | PASS |
| 6. Unauthorized association | Other-patient, other-practice and other-department ticket links denied | PASS |
| 7–8. Saved ticket/real ID | Prisma row, response ID/status and existing owner-scoped receipt tests | PASS |
| 9. Refresh persistence | Browser reload between normal list and full-sentence selection; existing pending clarification refresh test retained | PASS |
| 10. Idempotency | Successful replay returns the same response/ticket; existing concurrent ticket-operation test retained | PASS |
| 11. No automatic reschedule | Entire selected appointment record compared before and after ticket creation | PASS |
| 12. Booking duplicates | Real concurrent patient overlap across different doctors; direct exact-slot inserts rejected by PostgreSQL; original same-doctor concurrency tests retained | PASS |
| 13. Existing workflows | Existing booking, rescheduling, cancellation, four-agent, chat history, Markdown and clear-chat tests pass | PASS |

## Remaining issues and operational notes

- Historical overlapping test artifacts still require review before any data cleanup. Their presence is not claimed to be repaired.
- Pre-fix chat lists without a verified mapping are not backfilled by guessing IDs from rendered text. They require one fresh authorized list and confirmation.
- Existing admin/receptionist accounts need explicit department grants to see/manage appointments. No grants were silently assigned to existing users.
- Historic chat display records remain intact for review; old appointment table contents are not reused as model authorization/context.
- The existing 50-row tool limit remains. References cover the actual displayed list, not undisplayed rows.
- A full interval-exclusion constraint over all historical rows is a separate remediation step; direct database administrators must still respect interval rules beyond exact-start uniqueness.
- The existing non-failing Vite bundle-size warning remains. No frontend redesign or unrelated dependency migration was performed.
