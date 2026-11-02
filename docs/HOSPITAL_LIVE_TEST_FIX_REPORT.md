# Hospital live-agent reliability verification

## Evidence and confirmed defects

Investigation used source inspection and persisted PostgreSQL executions/tool results. The IDE attachment path supplied for the latest transcript was unavailable on disk; the reported examples were independently located in the database instead.

### Ticket identifier ambiguity

Both reported values belong to the same saved ticket:

| Database field | Value |
| --- | --- |
| `SupportTicket.id` | `71760544-deb1-44ab-843a-6125b7140d26` |
| `SupportTicket.ticketNumber` | `TICK-aa2d566f-08ef-4e2a-ab89-b7207fa63a6d` |
| Owner / role | `admin@hospital.com` / ADMIN |
| Status / priority | OPEN / MEDIUM |
| Appointment | SQL NULL |
| Created | `2026-10-26T11:48:33.652Z` |
| Creation execution | `c1850e4c-f260-4274-b292-c64fb4bdc8e6` |

The prefixed value was a real ticket number, rather than an invented database ID. The defect was allowing generated prose to label it as an ID and then appending a separate UUID receipt. The tool's human-readable message contained the ticket number, and the old response constructor preserved arbitrary model prose whenever it also appended the real receipt.

Creation confirmations now replace model prose with a server-rendered receipt from successful tool results. Before displaying it, the runner reads the actual authorized ticket and checks status/priority against the receipt. The final creation message shows only the exact database ticket ID, status, priority and appointment association. Failed creation stops the run. A generated ticket identifier without supporting ticket tool evidence produces an explicit error instead of a successful response. Tokens and stored chat use the same final authoritative text.

### Missing ticket reads

Added `get_support_ticket` and `list_my_support_tickets` to Care Coordinator only. They validate arguments, read PostgreSQL, and return real status, priority, category and creation date. The shared access predicate permits the creator and, for staff, an explicit `assignedTo` user-ID assignment. ADMIN alone is not a ticket-wide read grant. Unauthorized/nonexistent IDs return the same forbidden scope error to avoid exposing ticket existence.

List/detail APIs and the dashboard metric use the same access scope. The existing ticket table now describes owned or explicitly assigned requests.

Ticket status/list intents are read-only capabilities enforced in ToolExecutor, in addition to filtering the model's advertised tools. They allow ticket reads and handoff, not ticket creation or other mutations. Such requests bypass appointment-ticket creation/pending workflow logic. No successful read tool means no verified status/identifier response. Successful ticket reads are rendered from structured backend results.

The existing ticket `9cc30a19-a0ee-4282-b335-7091cff99ec0` was also queried: owner `admin@hospital.com`, OPEN/MEDIUM, appointment NULL, created `2026-10-26T11:36:36.749Z`. Both supplied IDs were read successfully through the newly registered tool as their real authenticated owner. Returned IDs matched their database rows, and total ticket count stayed unchanged during each read. Neither existing ticket was modified.

### Fabricated doctor identifier

Execution `0de239d5-5511-465f-94d7-8684b41c8cf2` attempted availability using `d9f8e7c6-b5a4-3210-9876-543210fedcba`, which had no doctor row. It subsequently called `get_doctors` and succeeded using actual doctor profile `8e1fd503-4424-4653-82f0-e2f720119785`. UUID syntax validation alone had not established database provenance.

The scheduling runner now supplies a fresh authoritative directory before relevant availability/booking inference. Availability arguments are bound to a uniquely verified doctor: a uniquely named doctor in the user's request takes precedence, otherwise the exact directory name or verified profile ID must match. Unverified/ambiguous selections stop before executing a slot query. Successful doctor searches refresh the request-local directory; old conversation IDs are not automatically trusted. Logged slot arguments use the canonical selected name, not a fabricated model ID.

`get_available_slots` additionally resolves the exact doctor name/profile against PostgreSQL before computing actual availability. A User ID, missing selection or conflicting name/profile pair is rejected. The ID-only API remains compatible for callers supplying a real doctor profile ID. No arbitrary doctor substitution was introduced.

### Role identity and clinical access

The reported failed scheduling execution belonged to ADMIN with neither a linked doctor nor patient profile. User text describing the caller as a doctor does not alter the signed server session. Existing middleware resolves role and profiles from the database using the verified session subject. ADMIN clinical denial was correct behavior, not a permission defect.

Clinical access remains: patients only their own profile; doctors their verified care relationships (qualifying appointments or visits); ADMIN/receptionists no implicit clinical record access. Existing session switching clears query/chat state and the role indicator uses the server-authenticated identity. Handoffs retain that identity.

### Assigned-patient discovery

There was a suitable existing relationship predicate in `security.ts`, also used by the patient API, but no model-facing discovery tool. Added `list_authorized_patients` for DOCTOR role and Records/Lab agents, reusing that predicate instead of duplicating authorization rules. It returns only authorized patient IDs/names, supports name search, and never trusts a supplied patient ID as permission. Subsequent clinical/lab handlers still authorize every read independently.

## Files changed

- `packages/agents/src/tickets.ts`: shared ticket scope/read, authoritative receipt text and read-only intent capabilities.
- `packages/agents/src/agents/AgentRunner.ts`: authoritative ticket output, verified doctor argument binding, read-only tool permissions and failure propagation.
- `packages/agents/src/agents/appointmentSupport.ts`: exclude ticket lookup from mutation/pending selection workflows.
- `packages/agents/src/tools/implementations.ts`: ticket read/discovery tools, doctor-name search and authoritative availability resolution.
- `packages/agents/src/tools/ToolRegistry.ts`, `ToolExecutor.ts`: request tool capability enforcement alongside existing role/agent checks.
- `packages/agents/src/agents/definitions.ts`: appropriate tool allowlists and instructions for verified identifiers/clinical selection.
- `packages/agents/src/index.ts`: ticket helper exports.
- `backend/src/routes/supportTickets.ts`, `dashboard.ts`: consistent owner/assigned-staff ticket visibility.
- `frontend/src/pages/SupportTicketsPage.tsx`: scope description matches actual permissions; layout unchanged.
- `frontend/src/components/ChatActivity.tsx`: plain-language labels for the new ticket reads and assigned-patient discovery.
- `backend/src/tests/support-ticket.test.ts`: real receipt/lookup, staff assignment, forbidden mutation, clinical discovery, lab authorization and doctor resolution regressions.
- `tests/ui/support-ticket.spec.ts`: actual ticket status lookup from chat, no duplicate insert and retained dashboard visibility.

No schema migration, database reseed, new integration or frontend redesign was required. Cleanup in automated tests affects newly created synthetic fixtures only.

## Executed validation

Final executed results:

| Command/check | Actual result |
| --- | --- |
| `npm run build` | PASS; workspace TypeScript checks and Vite production build |
| `npm run lint` | PASS |
| `npm test` | PASS; **76 tests across five Vitest files**, actual PostgreSQL and real Ollama; 59.72 seconds |
| `npm run test:ui` | PASS; **10 Chromium workflows**, 1.5 minutes |
| Both supplied IDs through `get_support_ticket` | PASS; exact persisted IDs/status/priority and unchanged ticket count |
| Final agent workspace build/lint after receipt text formatting | PASS |
| Final frontend workspace build/lint after new activity labels | PASS |

The browser run includes ticket status lookup after creation without a duplicate insert, dashboard visibility after refresh, all four agents, role switching, handoff/history, appointment-selection persistence and failed-tool status. Regression tests were not replaced with hardcoded results or mocked successful tool responses.

| Requested behavior | Executable coverage |
| --- | --- |
| One authoritative ticket ID / PostgreSQL match | Real creation followed by Prisma row read; final UUID list equals only the saved ticket ID and excludes its separate ticket number |
| Authorized/unauthorized ticket read | Own record succeeds, unrelated patient/unassigned doctor denied, explicitly assigned doctor succeeds, invalid ID and wrong agent rejected |
| Lookup cannot create | Request-scoped ToolExecutor denies creation, real chat lookup leaves total ticket count unchanged |
| Valid doctor resolution / no failed invalid-ID call | Exact name resolves actual Doctor.id, account ID rejected, real-model named availability has successful calls only |
| ADMIN/doctor/patient clinical boundaries | Existing regression suite plus new assigned-patient discovery and authorized/unassigned lab checks |
| Session identity and handoffs | Existing backend handoff/clinical tests and browser identity switching/doctor personal-profile checks |
| Existing functionality | Existing support idempotency, booking/rescheduling/cancellation, chat history, clear-chat and four-agent workflows |

## Remaining limitations

- A unique verified doctor selection is required; ambiguous or unverified selections fail clearly rather than choosing an arbitrary doctor.
- Ticket list uses 25-row pages; clinician discovery returns up to 50 authorized patients with search. Patient-selection UI was not redesigned; selection remains conversational using authorized tool results.
- Ticket-wide staff access and ADMIN clinical grants were not invented. Explicit existing ticket assignment is the only additional staff ticket read scope.
- Historical chat messages containing ambiguous identifiers remain available for review; newly generated confirmations are authoritative.
- Authentication is the existing signed demo-session flow. Account switching/server identity refresh was exercised; a separate password-login/logout workflow is not present and was not claimed as tested.
- The existing non-failing Vite bundle-size warning and previously documented historical scheduling overlaps are outside this change.
