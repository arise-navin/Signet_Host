# Support ticket persistence and idempotency verification

Verified against the configured PostgreSQL database using Prisma on 26 October 2026. No existing ticket or appointment was changed by the investigation.

## Actual database evidence

| Field/check | Persisted value/result |
| --- | --- |
| Ticket ID | `9cc30a19-a0ee-4282-b335-7091cff99ec0` |
| Ticket number | `TICK-9ca5a83c-4bdf-480e-995c-6c31b94439ae` |
| Created at / updated at | `2026-10-26T11:36:36.749Z` / same |
| Status | `OPEN` |
| Priority | `MEDIUM` |
| Category | `APPOINTMENT_ASSISTANCE` |
| Subject | `Appointment support request` |
| Appointment / patient association | Both SQL NULL |
| Owner | `admin@hospital.com`, ADMIN, user `0cd85d51-f52f-48e1-bce1-9135b06c4163` |
| Same owner + exact description count | **1 row** |
| `CREATE_SUPPORT_TICKET` audit count for this ID | **1 event** |
| Successful persisted ticket-tool results containing this ID | **2** |

The stored description is:

> I understand that no authorized upcoming appointments were found. Please create a general appointment assistance support ticket without linking any appointment. Priority: MEDIUM. Description: I need help rescheduling due to a scheduling conflict. Do not reschedule anything. Give me the actual ticket ID.

Queries used `supportTicket.findUnique`, `supportTicket.count`, `auditLog.findMany/count`, `toolExecution.findMany` and `agentExecution.findMany`. The matching-description count was scoped to this owner, not just to the globally unique ID. Both tool-result IDs and both final agent responses were compared with the actual row.

## Why the same ID appeared twice

There were two different successful chat executions in conversation `2642cf5f-990d-4559-9621-30f077cc87c0`:

| Execution | Created at | Result |
| --- | --- | --- |
| `affeefd9-6a14-4f63-9727-c1101e1fac8e` | `2026-10-26T11:36:36.718Z` | Ticket tool returned the saved ID |
| `bac08eb3-3368-4094-bcd3-a7dbfc0c11c3` | `2026-10-26T11:36:47.900Z` | Ticket tool returned the same saved ID |

The repeated response came from **transactional content idempotency**, not a model-invented ID, a replay of one cached chat execution, or merely a completed conversation state. Both executions called the real tool. The second call obtained the existing row through `previousMutation` under PostgreSQL advisory transaction locks.

The recomputed content key is `ef97cee0b2d2a2061e3c252429f16657bb1ab3b7bdd025edc5083afe1e6901c6`. Its persisted `IDEMPOTENCY_RESULT` audit details are exactly `{"resultId":"9cc30a19-a0ee-4282-b335-7091cff99ec0"}`. A second operation key was recorded at `11:36:47.924Z`, pointing to that same ticket; there is no second creation event or matching ticket row. Displaying Succeeded twice means both requests completed successfully, not that two inserts occurred.

## Fixes and supported retry semantics

- Identical ordinary support submissions retain the existing five-minute content deduplication. Correlated request/operation keys retain their durable replay protection. Concurrent tool retries are still serialized in PostgreSQL.
- Explicit requests for a **new**, **another**, or **separate** ticket now include the new workflow operation identity in their content key. This prevents the content window from incorrectly suppressing an intentionally separate ticket. Retrying that same chat request ID still returns its saved result and does not create another ticket.
- A changed description naturally represents different content. Identical text without a stable request key or explicit new-ticket intent cannot unambiguously distinguish a retry from an intentional new submission; the existing five-minute deduplication rule remains explicit rather than guessing.
- No migration or changes to the ticket transaction implementation were necessary.

## Dashboard and authorization verification

The existing application had an owner-only receipt endpoint but no Support Tickets list page. The Open Support Tickets card linked to Agent Activity. Added a list page using the existing layout/table styles, a sidebar link, and a correctly linked metric card. Its paginated `GET /api/support-tickets` query filters by authenticated `createdById` before returning rows; department/admin privileges do not expand ticket ownership. The dashboard's open-ticket count now uses the same owner scope.

An authenticated server/API check for the actual owner verified:

- `GET /api/support-tickets/9cc30a19-a0ee-4282-b335-7091cff99ec0`: **HTTP 200**, exact persisted ID, OPEN/MEDIUM/null appointment.
- Paginated list: the ticket appears on page 1; this owner's total is 1.
- Dashboard open-ticket metric: 1.
- The existing receipt route denies another owner; unauthenticated listing is denied.

## Files changed

- `packages/agents/src/agents/appointmentSupport.ts`: distinguish explicit separate-ticket intent when computing workflow idempotency context.
- `packages/shared/src/index.ts`: validated ticket-list response schema.
- `backend/src/routes/supportTickets.ts`: owner-scoped paginated list endpoint.
- `backend/src/routes/dashboard.ts`: owner-scoped open-ticket count.
- `frontend/src/api/client.ts`: runtime-validated list client.
- `frontend/src/pages/SupportTicketsPage.tsx`: ticket list with status, priority, description, association and pagination.
- `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/pages/DashboardPage.tsx`: route and navigation within the existing layout.
- `backend/src/tests/support-ticket.test.ts`: retry, explicitly separate requests, durable replay, owner-only listing, validation and dashboard count assertions.
- `tests/ui/support-ticket.spec.ts`: saved receipt to list navigation, refresh persistence and dashboard card navigation.

## Executed tests

- `npm run build`: PASS; workspace TypeScript and frontend production build. Existing non-failing bundle-size warning remains.
- `npm run lint`: PASS. React checklist applied: owner-scoped query key, stable row keys/test IDs, runtime response validation, explicit loading/error states, table headers and disabled pagination controls; no model-generated HTML.
- `npm test`: **73 tests passed across five Vitest files**, using actual PostgreSQL and real Ollama. This includes ordinary repeated submissions returning one row, two explicitly separate submissions producing separate rows even with identical text, request-ID replay, concurrent correlated tool retries, persisted receipt/ownership and existing booking/security workflows.
- `npm run test:ui`: **10 Chromium workflows passed**. The extended support-ticket workflow checks receipt-to-dashboard navigation, database-matching OPEN/MEDIUM/null association, persistence after refresh and the dashboard metric card link.
- An additional read-only Chromium check signed in as the actual ticket owner, opened `/support-tickets`, located `support-ticket-9cc30a19-a0ee-4282-b335-7091cff99ec0`, checked its persisted description/priority/status/no appointment, and reloaded. The actual ticket remained visible after refresh: **PASS**. This check did not create or modify a ticket.

## Remaining limitations

The owner-only dashboard is intentionally not a staff-wide ticket queue. Ticket assignment/status editing was not added. Stable request IDs are necessary for indefinite retry guarantees; content-only deduplication remains time bounded. Historical scheduling overlaps and other previously reported unrelated issues are unchanged.
