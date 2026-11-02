# Support ticket, handoff and chat rendering fix

Verified on 26 October 2026 against the existing PostgreSQL database and configured Ollama `beam:cloud` model. The application and UI layout were retained. No Signet integration was added.

## Confirmed root cause

The exact reported request was present in execution `214813cd-8682-4a56-8955-00764f527833`, conversation `335a164f-4b60-4b86-b838-3d71835cbab5`.

Its persisted execution establishes this sequence:

1. The starting agent was **Care Coordinator**, not Appointment Agent. The deterministic support-priority routing rule was already selecting Care for this text.
2. Care executed `create_support_ticket` successfully **before an appointment had been selected**.
3. PostgreSQL contained the returned ticket `c00839ec-cfaa-43ca-8b4c-3d9ebf99510c`, with status `OPEN` and priority `MEDIUM`. Its patient context was null because the caller was a doctor, and the original ticket schema had no appointment association.
4. Care then transferred to Appointment Agent to identify the appointment. The transfer's `initialMessage` explicitly said that the ticket had already been created and included its reference.
5. The runner rebuilt the target agent's message history from older persisted chat messages and the original prompt. That discarded the current turn's tool results and the transfer context. Appointment Agent saw a ticket-creation request without the preceding success result and produced the misleading refusal.
6. The UI's “Create a support request — Done” came from the real tool result's `success: true`. It represented a committed ticket creation, not a plan or a completed handoff. However, the UI provided no receipt alongside that label, and its plain-text message rendering exposed Markdown syntax instead of formatting it.

Additional contributing problems were the lack of a durable pending multi-intent state, no validated appointment foreign key on support tickets, an overbroad prompt rule suppressing all internal IDs (including required ticket IDs), and failed first-turn chats not retaining their conversation URL after refresh.

The historical ticket and conversation were not retrospectively linked to an arbitrary appointment or rewritten.

## Implemented behavior

### Appointment-related support requests

The orchestrator recognizes appointment support as a dedicated ordered workflow:

1. Use the existing authenticated server context and conversation ownership checks.
2. Record the intended ticket operation as planned.
3. Invoke `get_appointments` as Appointment Agent with the caller's existing role/profile and an upcoming-time filter.
4. When multiple authorized appointments exist, persist the original description, priority, ordered candidate IDs, user ID, original correlation ID and operation ID in the conversation. No ticket tool is executed at this stage.
5. Return a numbered table built from authoritative database results and ask the user to choose. The table does not truncate or expose appointment UUIDs as normal labels.
6. Resolve a numbered/ordinal choice or an explicitly supplied full appointment UUID, and revalidate it against the current authorized upcoming context. Invalid selections fail or remain awaiting clarification; another patient's UUID never grants access.
7. Hand off to Care Coordinator while preserving the selected appointment, original description, priority, conversation, correlation and authenticated account. Only Care can invoke `create_support_ticket`.
8. Validate the appointment and ticket arguments, commit the ticket and idempotency receipts through Prisma, and persist the selected appointment foreign key and its actual patient context.
9. Return the real database ticket ID, status, priority and selected appointment time. A single authorized upcoming appointment is an unambiguous context; zero appointments does not produce an unlinked appointment ticket.

The pending intent survives refresh and does not depend on the model remembering earlier messages. Cancelling a pending request records `Skipped` and creates no ticket. Patient scope and doctor professional/personal context remain enforced by the existing authorization helpers.

### Handoffs, receipts and failures

- Ordinary model-driven handoffs now retain the current turn's assistant tool calls and tool-result messages. They replace the active system prompt without discarding completed work.
- A successful support result is runtime-validated for a real ticket ID, reference, priority and status. The runner appends any missing authoritative ticket ID/status to the final response.
- Ticket operation IDs remain stable across clarification turns; transactional receipts prevent repeated/concurrent submissions from creating duplicate rows. Content/appointment-based deduplication is also retained.
- Owner-scoped `GET /api/support-tickets/:id` retrieves the persisted receipt after refresh. Other users receive 403; unauthenticated callers receive 401.
- Failed messages and their activity states are persisted. SSE errors include conversation context so the frontend retains failure history after refresh; duplicate error events are avoided.
- If ticket commit succeeds and subsequent real Ollama explanation generation fails, the error explicitly includes the already-saved ticket ID/status. The activity remains succeeded for the committed ticket; the inference error is still surfaced.

### Activity and Markdown

- Chat activity has explicit `Planned`, `Running`, `Awaiting user input`, `Succeeded`, `Failed`, and `Skipped` states.
- Pending ticket creation shows `Create support ticket — Awaiting appointment selection`.
- A succeeded ticket shows its actual ticket ID. A failed operation shows a sanitized reason and never “Done”. A handoff has its own activity and cannot stand in for ticket creation.
- Activity state is persisted with messages and included in successful request replays.
- Assistant output uses `react-markdown` with GFM tables, `rehype-sanitize`, HTML skipping and blocked model images. User messages remain plain React text.
- Serialization continues to encode/decode JSON once. No broad backslash stripping or second JSON decoding was added; legitimate code paths and escaped Markdown remain intact. Streaming text passes through the same renderer as stored history.

## Files modified

| Files | Responsibility |
| --- | --- |
| `packages/agents/src/agents/appointmentSupport.ts` | Durable support intent, ordered lookup/selection/handoff workflow and authoritative appointment table/receipt |
| `packages/agents/src/agents/AgentRunner.ts` | Workflow integration, retained handoff history, persisted activity/failures, replay receipts and guaranteed ticket confirmation |
| `packages/agents/src/tools/implementations.ts` | Validated/authorized appointment association, actual patient context, transactional ticket writes and operation idempotency |
| `packages/agents/src/tools/ToolExecutor.ts`, `ToolRegistry.ts`, `packages/agents/src/index.ts` | Runtime ticket-receipt validation, correlated operation context and exports |
| `packages/shared/src/index.ts` | Typed/validated activity contracts, sanitized display errors, ticket receipt validation and SSE metadata |
| `backend/src/routes/chat.ts`, `supportTickets.ts`, `backend/src/index.ts` | Persisted activity responses, contextual SSE errors and owner-scoped ticket retrieval |
| `prisma/schema.prisma` | Nullable ticket appointment relation/index, conversation intent JSON and message activity JSON; additive changes applied without reset/reseed |
| `frontend/src/components/ChatActivity.tsx`, `ChatMarkdown.tsx` | Accurate operation states/receipts and safe Markdown rendering |
| `frontend/src/pages/ChatPage.tsx`, `frontend/src/index.css` | Live/persisted activity display, failure URL retention and scoped Markdown styling within the existing chat layout |
| `frontend/package.json`, `package-lock.json` | Project-local Markdown/GFM/sanitization dependencies |
| `backend/src/tests/support-ticket.test.ts`, `tests/ui/support-ticket.spec.ts` | New real backend/database/inference and browser regression coverage |
| `backend/src/tests/agent-regression.test.ts`, `tests/ui/chat.spec.ts` | Existing tests adjusted for the required clarification stage and distinction between general and appointment-linked tickets |

## Tests executed and actual results

| Check | Actual result |
| --- | --- |
| `npx prisma db push --schema=prisma/schema.prisma` | PASS; additive schema synchronized and Prisma Client generated |
| `npm run build` | PASS; TypeScript across all workspaces and Vite build |
| `npm run lint` | PASS |
| `npm test` | PASS; **59 tests**, four Vitest files, including 11 dedicated support-ticket integration tests |
| `npm run test:ui` | PASS; **8 Chromium workflows**, including all three new support/Markdown workflows |

The dedicated tests use actual PostgreSQL mutations and the configured real Ollama provider. The outage test uses a genuinely unreachable local endpoint, not a mocked success/failure response. New isolated support fixtures use entirely fictional accounts and are cleaned up. Markdown rendering uses synthetic stored message fixtures to test formatting and sanitization behavior.

| Requested regression | Verified evidence | Result |
| --- | --- | --- |
| 1. Support routes to Care | Exact reported prompt routes to Care; explicit starting selection is retained | PASS |
| 2. Appointment lookup | Successful `get_appointments` row attributed to Appointment Agent | PASS |
| 3. Multiple appointments clarify | Two-row authorized table; no ticket created and no creation tool invoked | PASS |
| 4. Pending intent survives | Stored original description/priority/candidates; refresh then selection completes the same operation | PASS |
| 5. Selected appointment validated | Saved ticket FK equals the second chosen appointment | PASS |
| 6. Identity survives handoff | Patient/doctor identity, selected patient context, original correlation and appointment asserted in database/audit rows | PASS |
| 7. Care executes creation | Successful tool row attributed to Care; direct Appointment Agent invocation rejected | PASS |
| 8. Ticket persists | Prisma row and authenticated receipt API read match | PASS |
| 9. Real ID in response | Specific and general tickets include their real ID/status; receipt survives inference outage after commit | PASS |
| 10. Accurate UI status | Pending and succeeded states/actual ticket ID verified before and after refresh; planned/running SSE states asserted | PASS |
| 11. Failure never shows Done | Real missing/unauthorized appointment failures display Failed and no successful receipt, including after refresh | PASS |
| 12. No duplicate tickets | Successful request replay and concurrent same-operation tool submissions retain one ticket ID/row | PASS |
| 13. Unauthorized link denied | Other-patient and unassigned-doctor association attempts return 403 and create no linked ticket | PASS |
| 14. Markdown works safely | Bold, code, table, literal backslashes/escaped asterisks render correctly; script/image/javascript-link execution blocked | PASS |
| 15. Booking/rescheduling retained | Existing executable integration/Test Lab booking, rescheduling and concurrency scenarios still pass; real Ollama hospital-time booking regression also passes | PASS |

## Remaining limitations

- Historical prematurely created tickets remain as historical records. Choosing an appointment for such a ticket requires explicit authorized follow-up; no association was guessed or backfilled.
- Lookup retains the existing tool's maximum of 50 appointments. Clarification supports displayed numbers, simple ordinals and full UUIDs; ambiguous free-form descriptions are not guessed.
- Ticket creation does not itself reschedule an appointment. Changing the time remains a separate authorized scheduling operation.
- The existing runner emits completed-model text through SSE; this change verifies rendering of that stream and live tool/activity events, rather than replacing provider streaming architecture.
- The Vite build reports a non-failing bundle-size warning after adding Markdown support. No warning was hidden and no unrelated bundling redesign was made.
- Real inference was verified with the explicitly configured `beam:cloud` model. Fully offline inference and production multi-instance load were not exercised.
