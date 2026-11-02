# Support tickets without an appointment association

## Root cause and authorization findings

The appointment-support workflow required a selected appointment before reaching its ticket mutation. When a numbered reference was unavailable and the authorized lookup returned no rows, it saved a selection-only pending state with no general-ticket confirmation path. The ticket tool independently rejected every category containing “appointment” without an appointment ID, even though Prisma and PostgreSQL already allowed a nullable association.

The persisted empty-list response examined during this investigation was execution `0e8d220e-6153-4901-951f-7647fec81811`. Its authenticated caller was ADMIN, with no doctor profile, no patient profile and zero scheduling department grants. An empty authorized list was therefore expected; it does not establish that a doctor was interpreted as a patient. A published empty list cannot resolve item #1. Numbered references still require an unexpired published list in the same conversation and the same current authorization scope.

## Current behavior

- A verified authorized appointment creates an appointment-linked ticket as before.
- An unavailable, expired or ambiguous reference never selects an arbitrary appointment. The response explains the unresolved association, displays authorized choices when available, and offers general appointment assistance.
- An empty authorized lookup offers a general ticket instead of waiting indefinitely for an appointment to exist. No ticket is saved until the user confirms.
- `Yes`, `Confirm`, `Please do` or `Go ahead` resumes an offered general-ticket workflow. An explicit request for a general assistance ticket can proceed directly without an appointment lookup.
- The general ticket uses category `APPOINTMENT_ASSISTANCE`, the retained description and priority, and a null appointment ID. Ownership comes from the authenticated caller. A doctor without a patient profile does not acquire an invented patient identity.
- Explicit unauthorized appointment IDs still fail authorization; they are never silently converted into an unlinked ticket. Other appointment-linked categories still require an appointment ID.
- PostgreSQL conversation JSON retains requested action, category, priority, description, original reference, association status, confirmation, conversation/user identity and current step. The existing operation ID, optimistic workflow transitions and transactional ticket idempotency remain in use across handoffs.
- Care Coordinator performs the real mutation. The response includes the saved ticket ID/status. The workflow never invokes rescheduling.

## Files changed and migrations

- `packages/agents/src/agents/appointmentSupport.ts`: confirmation state, optional-association workflow, explicit general intent and durable state metadata.
- `packages/agents/src/tools/implementations.ts`: permit an absent appointment ID specifically for `APPOINTMENT_ASSISTANCE`; retain association authorization.
- `backend/src/tests/support-ticket.test.ts`: real doctor empty-schedule confirmation/persistence/replay and explicit general-ticket tests.
- `tests/ui/support-ticket.spec.ts`: empty-list offer, refresh, confirmation, real receipt and subsequent refresh.

No migration was needed: `SupportTicket.appointmentId` and its relation are already nullable. No existing appointment records were modified or removed. Test cleanup affects only newly created synthetic fixtures.

## Verification

Actual results are recorded below after execution. Tests use PostgreSQL and real Ollama, rather than mocked successful mutations.

- Build and lint: PASS.
- Backend: 71 tests passed across five files. Coverage includes valid linked tickets, unavailable/expired references, unauthorized associations, MEDIUM priority and description retention, ownership, real ticket persistence/receipt, repeated-request idempotency, no automatic rescheduling, doctor/patient scopes, and existing appointment booking/rescheduling/concurrency workflows.
- Browser: PASS; all 10 Chromium workflows, including the new general-ticket confirmation/refresh workflow and existing chat/support/appointment workflows.
- The new doctor integration test reads the saved Prisma record, verifies null `appointmentId` and `patientId`, the caller's ownership, category, priority, description and OPEN status, then replays the request and verifies exactly one ticket. The browser test reads PostgreSQL and verifies the receipt remains after refresh.

The first test run found a test calling a nonexistent conversation URL (404). It was corrected to the existing `/api/chat/conversations/:id/messages` endpoint; the subsequent 71-test run passed.

The first browser run passed nine workflows but timed out waiting 60 seconds for the normal appointment-list response in one existing workflow. After backend verification completed, the complete browser suite was rerun separately: all ten passed with no timeout/configuration changes. Real-model response latency remains an external dependency.

## Remaining issues

Legacy lists without a verified mapping still require fresh confirmation. Staff department grants remain explicit; this change does not widen scheduling permissions. Previously reported historical appointment overlaps remain outside this fix. The existing non-failing Vite bundle-size warning remains.
