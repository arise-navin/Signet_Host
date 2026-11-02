# Hospital AI Lab agent bug-fix report

Verification date: 26 October 2026. Scope: the existing Fastify/React/Prisma/Ollama application; its UI layout and four agents are retained. No Signet integration was added.

## Initial reproduction

The attachment directory `744c700a-f6f2-4b91-b00f-ff40d444e471` was empty when inspected. The examples in the request and the existing implementation were used as the reproducible bug report.

Before editing, executable checks confirmed:

- `Create a support ticket because I need help with my appointment.` routed to `appointment-agent`.
- `What are the hospital visiting hours?` routed to `records-agent`, because the router matched the substring `visit`.
- The medical-history tool returned a record to a doctor with no appointment or visit relationship to that patient.
- An invalid `x-demo-user-id` still received HTTP 200 from `/api/auth/me`, because authentication silently selected the first demo patient.

## Confirmed problems and fixes

| Problem / root cause | Implemented behavior |
| --- | --- |
| Broad substring matching and appointment-first priority | Word-boundary intent rules give support/FAQ requests priority. Ambiguous automatic requests use Ollama classification validated with Zod. |
| Selected agent bypassed intent routing, or a handoff changed the selected frontend tab | Explicit selection remains the starting agent. A clearly unsupported domain produces a validated, audited handoff; the selected tab stays unchanged. |
| Patient IDs were accepted as authority for doctors | Shared authorization checks use the authenticated account and a verified appointment/visit care relationship. Cancelled appointments alone do not establish one. |
| Raw user IDs and invalid credentials silently selected a patient | Protected endpoints require a signed, expiring cookie or Bearer session. User IDs, query parameters, and supplied role fields cannot authenticate a request. Account/role/profile information is reloaded from PostgreSQL. |
| Receptionist details included prescriptions and clinical fields; administrators had blanket clinical access | Receptionists and administrators receive scheduling/demographic data only. Clinical tools reject them with 403. Patient clinical access is restricted to self; doctor clinical access requires a care relationship. |
| Other roles could read conversations; append access was unchecked | Every conversation read and append checks ownership. Message bodies are fetched only after that check. |
| Doctor and personal patient appointments were ambiguous | Doctor schedule is the professional default. Explicit personal appointment requests require a linked patient profile. Booking for a patient requires an authorized context. Upcoming queries exclude historical/inactive appointments. |
| REST booking and AI tools had separate implementations | REST mutations now pass through the same ToolExecutor and scheduling logic as agent mutations. |
| Slots checked only identical starts, excluded no rescheduled bookings, and booking did not revalidate availability | Slots check full interval overlap, active/rescheduled bookings, schedule boundaries and leave. Booking and rescheduling revalidate under the same per-doctor PostgreSQL transaction lock. Slot length comes from the stored availability. |
| No representation of doctor leave | A `DoctorUnavailablePeriod` table stores explicit UTC blocked intervals. Slot lookup and booking both respect it. |
| UTC was treated as hospital wall-clock time | `HOSPITAL_TIMEZONE` defaults to `Asia/Kolkata`. UTC instants remain in PostgreSQL; local timestamps are converted at the boundary. API results, chat context, slot buttons and the rescheduling form include hospital time/zone. Invalid, nonexistent, ambiguous and past booking times are rejected. |
| Repeated requests could repeat writes; count-based ticket numbers raced | Chat request IDs deduplicate persisted executions. Booking/ticket receipts use existing AuditLog storage with transaction locks. Ticket content/intent is also deduplicated for five minutes across distinct request IDs. Ticket references use collision-resistant UUIDs. Reusing a booking key for different arguments fails clearly. |
| Tool logs could be silently lost or attributed to the original agent after handoff | Log writes propagate failures. ToolExecution stores the actual acting agent. Structured operational logs include request ID, agent, tool, authorization/status, duration and sanitized result shape/count. Activity APIs show only the signed-in user's executions. |
| Optional/default Zod fields were exposed as incorrect tool parameter types | Tool schema conversion unwraps optional/default/nullable fields before deriving primitive types and enums. |
| Model JSON errors were silently converted into empty arguments | Ollama completions/tool arguments are runtime-validated. Malformed JSON is reported. Transient inference transport/429/5xx errors receive one retry with a structured warning, then a specific error. |
| Refresh and account switching confused conversation state | Conversation and explicit agent are retained in the URL. Switching accounts clears cached state and the conversation URL; in-flight chat is cancelled on unmount. Stale history loads cannot replace a newer selection. |
| Errors from the server could be replaced with a generic end-of-stream message | The frontend retains the specific SSE error and handles a prematurely closed stream explicitly. |

## Files changed

- `packages/agents/src/agents/AgentRouter.ts`, `AgentRunner.ts`: routing, classification, handoffs, identity, history, request deduplication, cancellation and role/time context.
- `packages/agents/src/tools/implementations.ts`, `ToolExecutor.ts`, `ToolRegistry.ts`: enforced permissions, centralized scheduling/mutations, idempotency, validated schemas and structured execution logs.
- `packages/agents/src/security.ts`, `scheduling.ts`, `time.ts`, `idempotency.ts`, `index.ts`: shared authorization, UTC/local conversion, authoritative slot validation and mutation receipts.
- `packages/ai-provider/src/OllamaProvider.ts`, `ollamaResponse.ts`: provider response validation, actionable inference errors, bounded retries and strict stream error handling.
- `packages/shared/src/index.ts`: appointment tool metadata and optional error status codes.
- `backend/src/middleware/auth.ts`, `index.ts`, `routes/auth.ts`: signed demo sessions, no identity fallback, protected endpoints, explicit demo-production restrictions and validation errors.
- `backend/src/routes/chat.ts`, `appointments.ts`, `doctors.ts`, `patients.ts`, `agentActivity.ts`, `dashboard.ts`, `health.ts`, `testLab.ts`: ownership checks, shared tool execution, scoped data, timezone metadata and executable Test Lab corrections.
- `frontend/src/context/AuthContext.tsx`, `api/client.ts`: real session establishment and account/cache state handling.
- `frontend/src/pages/ChatPage.tsx`, `AppointmentsPage.tsx`, `DoctorsPage.tsx`, `components/Layout.tsx`: retained selection/history, clear errors, hospital-time display and stable UI automation IDs. Existing layout is retained.
- `prisma/schema.prisma`: only the blocked-period table and nullable acting-agent log column were added. Both changes were applied to the existing database without resetting or reseeding it.
- `backend/src/tests/integration.test.ts`, `agent-regression.test.ts`, `tests/ui/chat.spec.ts`, `playwright.config.ts`: executable regression and browser tests.
- `.env.example`, `eslint.config.js`, root/backend/provider/agent `package.json` files and `package-lock.json`: configuration, lint/test commands and project-local dependencies. `@fastify/jwt` was updated to the compatible 10.x release after audit identified vulnerabilities in the original JWT dependency.

## Tests and actual results

| Command/check | Actual result |
| --- | --- |
| `npx prisma db push --schema=prisma/schema.prisma` | PASS; PostgreSQL schema synchronized and Prisma Client generated. |
| `npm run build` | PASS; all workspace TypeScript builds and Vite production build. |
| `npm run lint` | PASS; ESLint across backend, shared packages, frontend and browser tests. Legacy `any` contracts are retained; lint does not certify their elimination. |
| `npm test` | PASS; 47 tests across two Vitest files, including the existing 21 tests and 26 regression/integration checks. |
| `npm run test:ui` | PASS; four Chromium workflows using the real backend, PostgreSQL and configured Ollama model. |
| Live `/api/health` | PASS; backend up, PostgreSQL connected, Ollama ready, selected model `beam:cloud`, timezone `Asia/Kolkata`. |
| Real inference booking | PASS; the model checked real availability and booked tomorrow at 10 AM; the persisted UTC instant matched hospital local time. Request replay left exactly one appointment. |
| `npm audit --omit=dev` | NONZERO; six reported dependency packages remain, described below. No critical findings remain in this production audit after the JWT update. |

The requested regression scenarios are executable in `backend/src/tests/agent-regression.test.ts`:

| IDs | Coverage | Result |
| --- | --- | --- |
| TEST-001–005 | Appointment, support, FAQ, records and lab intent routing | PASS |
| TEST-006–007 | Explicit selection and rejected out-of-scope tool | PASS |
| TEST-008–012 | Own records, other-patient denial, unassigned doctor denial, UUID bypass denial and receptionist/admin clinical denial | PASS |
| TEST-013 | Doctor schedule versus personal patient context | PASS |
| TEST-014–016 | Database-backed availability, overlap/rescheduled/leave exclusion, concurrent booking and timezone/date validation | PASS |
| TEST-017–019 | Persisted support ticket, identity-preserving handoff boundary and persisted/owner-scoped history | PASS |
| TEST-020–022 | Real unavailable provider error, injection/session bypass denial and duplicate-write protection | PASS |

Additional checks exercise assigned-doctor access, expired-session rejection and re-login, REST rejection of invalid/past/off-schedule bookings, real Ollama classification, and real model-driven hospital-time booking/replay. The Chromium tests verify actual tool rows for all four agents, support-ticket ownership, selected-agent retention, refresh persistence and account isolation. These results are assertions against real responses and database state, not static PASS values or mocked inference. New disposable regression/browser fixtures are cleaned up.

## Operational behavior and compatibility

- Frontend: `http://localhost:5173`; backend: `http://localhost:3001`; PostgreSQL remains on port 5433.
- `HOSPITAL_TIMEZONE` and `FRONTEND_ORIGIN` are configurable in `.env`. The example contains their default values.
- Protected API clients must use the session cookie or the token returned by demo login. The old raw `x-demo-user-id` authentication mechanism is intentionally rejected. Demo account switching is explicit and disabled in production unless `DEMO_AUTH_ENABLED=true`.
- Administrators retain demographic/scheduling and Test Lab permissions, but have no blanket clinical permission. An assigned clinician account is required for those records.
- HTTP authorization failures return 401/403. After SSE headers have been sent, failures use an `error` event with `statusCode`; the already-open HTTP stream remains 200.
- Request IDs belong to the authenticated account and original prompt/agent. An in-progress or failed execution is not silently rerun. Successful replays return the persisted response.
- The schema change is additive. This repository already uses Prisma schema push rather than a committed migration history; the application was checked against the updated existing database.

## Remaining limitations and unverified dependencies

- The selected, explicitly configured model is `beam:cloud`; it is installed and real inference passed. The originally requested `beam:cloude` is unavailable. No model was silently substituted. The cloud-tagged model requires its upstream service; fully offline model inference was not verified.
- This is still an explicitly selectable synthetic demo login system, not a production identity provider. Production SSO, production deployment, custom origins and remote PostgreSQL were not exercised.
- Hospital timezone behavior was verified for Kolkata and unit/integration edge cases for New York daylight saving transitions. A separate user-specific timezone preference is not implemented; hospital time is the authoritative default.
- Leave intervals can be maintained through Prisma/database tooling. A new leave-management UI or external calendar integration was outside the requested scope.
- The existing runner still obtains a completed Ollama turn before emitting its text through SSE; tool/handoff events are live. End-to-end inference-token streaming was not introduced as part of this bug fix.
- The pre-existing in-app Test Lab intentionally creates synthetic records and can leave its original test fixtures behind. The new regression/browser fixtures have explicit cleanup; historical demo fixtures were not deleted.
- The production dependency audit still reports the inherited Zod 3, Prisma 6/deepmerge configuration chain, and React Router 6 packages. Their major-version migrations were not folded into this agent/authorization fix. This report does not claim a clean dependency audit.
- The unavailable-provider test uses a real unreachable local endpoint. A full Ollama-process kill/restart during an already-running generation and production multi-instance load were not exercised.
