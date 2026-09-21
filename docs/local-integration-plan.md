# Local integration acceptance

Owner authorization: September 21, 2026. Run and verify the existing pieces together
on this Windows machine before any later Ubuntu deployment. Preserve independent
services, existing privacy/approval boundaries, and the accepted dashboard design.

## Current acceptance status (22 September)

The chronological notes below retain earlier checkpoints; this table supersedes
statements that browser access, routing, memory ranking or startup docs are pending.

| Requirement | Current evidence |
| --- | --- |
| Local pinned Laya installation and measurement | Pinned SDK/checkpoint and Windows lock in services/decisions; CPU benchmark 6/8 routing cases, 315 ms warm median, about 2 GB RSS |
| Replaceable bounded decision transport | Pi DecisionProvider and authenticated /v1/choose service; focused tests cover invalid choices, budgets, timeouts, fallbacks and privacy |
| Live automatic/manual model selection | Browser turn trn_32afa79bf4264ea1 routed through Laya to Qwen; manual override verified while Laya was stopped |
| Real memory ingestion/retrieval/ranking | Two user requirements admitted to PostgreSQL and recalled in a different session; check_local_memory_turn.py verifies source fields, citations and answer context |
| Live UI/status | Accepted shell with authenticated conversations, model settings, memory graph/database and Inbox; ranked/fallback/degraded receipts inspected in Chrome |
| Privacy/permissions | Private turn trn_78e5f65542e84dce admitted no messages; operation-bound password checks; expired tool approvals refused; narrowly scoped echo approval/execution verified then grant removed |
| Failure behavior | Real stopped-Laya test: automatic routing failed, manual Qwen succeeded with both memory records and visible fallback |
| Persistence/startup | Local isolated persistent state and source launcher; Pi/gateway/Laya restarts preserve conversations/configuration; docs/local-windows-startup.md |
| Remaining integration limits | Many accepted frontend features remain preview-only; live chat is narrower than the complete fixture UI. No vector embeddings, multimodal ingestion, production-quality local answer model, or Ubuntu deployment |

The Laya/routing/memory journeys now have real end-to-end evidence. This does not
claim that every dashboard screen or previously planned feature is connected.

## Sequence

1. Inventory existing runtime/gateway/frontend contracts and local resources.
2. Install a pinned Laya SDK in an isolated environment; measure CPU inference on
   this machine with public synthetic inputs before using owner context.
3. Add a replaceable typed decision transport. Use Laya for bounded decisions,
   never generated answers or permission grants. Keep explicit timeout/fallback
   behavior and do not silently truncate oversized context.
4. Integrate memory relevance and model selection with existing scoped retrieval
   and model roles. Preserve manual selections and no-harness/no-memory settings.
5. Start local services with persistent, isolated development state and secret
   configuration outside Git. Use the authenticated gateway for browser access.
6. Connect the relevant UI controls and display actual status/decision evidence.
   Never label fixture output as live or hide an unavailable dependency.
7. Exercise real browser-to-backend journeys, negative privacy/failure cases,
   restart persistence, focused tests and the dashboard build. Record measured
   outcomes, screenshots and remaining limitations.

## Acceptance evidence

- Pinned SDK/checkpoint, installed CPU environment and dependency lock are in
  `services/decisions`. Measured warm median 315 ms, about 2 GB RSS, 6/8 correct
  routing smoke cases. Three memory cases: two ranked, one retained baseline at
  the 0.2 confidence threshold. Small smoke evidence, not production quality proof.
- Pi commits `1c5e436` and `e7a771d`: configurable typed provider, routing capability
  descriptions/evaluation envelopes, memory reorder receipts, manual/no-harness
  preservation, timeout/busy/oversize/uncertainty fallback. Latest focused set:
  65 passed. Companion service/bootstrap checks: 5 passed.
- Companion `5b39351e`: authenticated decision service and isolated local launcher.
  PostgreSQL, MemoryGate, ToolGate, Pi and Laya are running on loopback. Ollama was
  started separately with its existing qwen3:4b / qwen2.5:3b installations. No model
  answer has yet been exercised through the browser. Local state is `.local-run`.
- Pending: authenticated browser journeys and screenshots.
- Pending: reproducible start/stop instructions and final limitations.

## Next integration checkpoint

The accepted full dashboard still uses the fixture composition. Shared
`src/lib/api/index.ts` no longer instantiates it: `FixtureWorkspace` explicitly
installs the preview client, allowing the accepted shell to be reused without
initializing sample state.
`GatewayEntry` is already authenticated but renders a separate Conversations /
Activity workspace. Preserve the accepted full shell; do not present this smaller
workspace as completion of the dashboard wiring.

The browser gateway now also has an isolated owner-control credential for model
configuration and scoped memory library/exploration. Catalogue writes require
operation-bound verification. The frontend control adapter validates identities,
scope, pagination and public catalogue fields; draft credentials cannot be sent.
Other backend features exist but remain admin-only. Extend explicit contracts for the required owner
operations with operation-bound verification; do not give browser code admin keys,
replace allowlists with a generic proxy, or relax the gateway's boundaries.

Next: connect model configuration and scoped memory exploration to the accepted
UI, integrate persisted conversations, then run actual browser acceptance. Read
the existing gateway transport/auth/verification and Pi browser contracts first.
Gateway TLS/password setup has not been initialized. No fixture data has been
silently promoted to live, and no accepted frontend markup has been changed yet.

### Verified local increment

- Pi `35fa005`: isolated owner-control API and memory inspection projection.
- MemoryGate `3e0ccf2`: searchable, scoped library with keyset pagination.
- Companion `4cc51e0c`: typed browser control adapter and distinct local owner key.
- Live owner library returned HTTP 200, scope `all`, zero records, text search.
  The chat credential was rejected with HTTP 401 from that same owner endpoint.
- Initial local catalogue persisted at revision 1: Qwen 2.5 3B default, Qwen 3 4B
  available, Laya typed routing available but disabled. No paid provider enabled.
- A real Pi turn using Ollama Qwen 2.5 3B returned `Local integration works.` in
  11.2 seconds, with persisted `complete` status and actual provider/model.
  This was an HTTP backend check, **not** a browser-to-backend acceptance claim.
- Eight owner API tests, six MemoryGate explorer tests, bootstrap configuration
  check, browser control boundary check, import-isolation check and TypeScript
  build pass. Full Vite build passes (third-party Zod annotation warnings only).
- Preview memory screen still renders after transport-composition separation.
  Full-shell authenticated UI wiring and browser journeys remain outstanding.

Local gaps: MemoryGate is on real PostgreSQL but lacks Qdrant/embeddings, so lexical
fallback is explicit. ToolGate has no execution scopes, and search is unconfigured.
Memory reranking remains opt-in/off in the local configuration. Laya is English
only. The initial launcher bootstrap issues (key prefixes, salt format and using
PostgreSQL instead of SQLite startup migrations) were corrected and tested.

Existing repositories were clean at the start. Make narrow local commits after
verified increments. No remote push, Ubuntu deployment, paid inference or automatic
permission expansion is part of this goal.


## September 22: authenticated browser checkpoint

The accepted shell now wraps the live gateway workspace, without importing fixture
records. Memory has Network/Database search, scoped record inspection, on-demand
relationships and paged content; Settings edits the real model catalogue with
fresh verification and optimistic revisions. Provider health and saved routing
receipts are visible. Other unconnected sidebar routes explicitly say so.

Verified in Chrome against HTTPS port 8050:
- Signed in; inspected persisted evidence and its evaluated_by analysis edge.
- Saved catalogue revision 2 through password verification; routing enabled.
- Sent “Please say hi in one brief sentence.” and received “Hi.” from local
  Qwen 2.5 3B. Laya selection took 538 ms; overall answer took about 13.7 seconds.
  Both calls and the 56% decision confidence are visible in the saved turn receipt.
- The first routed request failed because conversation context exceeded the small
  classifier budget. The adapter now uses only the latest user request, explicitly
  labelled in the receipt, and rejects oversized requests instead of truncating.
  Context-dependent follow-ups still need a general router or manual selection.
- Gateway restart preserved authentication, saved messages and catalogue revision.
- Desktop memory and phone Settings were inspected. Phone Memory revealed toolbar
  overlap and label collisions; these were fixed and rechecked at 390 × 844.
- Build, focused ESLint, gateway fixture-isolation/control/workspace/verification
  checks and 23 Pi decision/owner/model-role tests passed. Screenshots were viewed
  inline; no screenshot files were saved.

This is an integration checkpoint, not a claim that every accepted frontend feature
is wired. Conversation rendering is still the narrower live runtime view; full
chat controls, other sidebar workspaces, vector search and multimodal ingestion
remain separate gaps. Memory reranking remains opt-in/off. ToolGate is running
without execution scopes; no arbitrary script access was silently granted.


### Live privacy and explicit model selection

- Appbar Incognito opens the two-switch dialog. It reads persisted session settings
  through a narrowly allowlisted owner endpoint and saves with revision checks and
  operation-bound password verification. Existing agent/project selections survive.
- Composer lists enabled models eligible for the answer role. An explicit choice
  is submitted as model_id and bypasses automatic routing. With harness disabled,
  the composer requires that choice before sending.
- Actual Chrome test: set both privacy switches, selected Qwen 2.5 3B, sent a private
  test request, received `Private mode works.`. Turn `trn_ebc076cf0e79486a` has both
  immutable privacy flags true, only an answer-model attempt, and both persisted
  messages have allow_ingest=0 with no memory-outbox entries. This verifies the
  real path, in addition to the focused privacy tests.
- Reload retains Incognito; manual model selections remain workspace-local.
  No errors appeared in the inspected browser console. Mobile dialog was visually
  checked. Build, gateway contract/verification checks, focused ESLint and 18 Pi
  owner/session-privacy/decision tests passed.


### Memory relevance activation and status correction

Local PI_MEMORY_RERANK_ENABLED is now true (the fresh-install default remains off).
The persisted context pipeline was exercised with synthetic retrieved records and
real HTTP Laya inference, in a temporary Pi SQLite database. The first call fell
back; a subsequent warm call ranked sport/work/food with 0.9369 relative decision
confidence. Every original record and source field survived unchanged. This is not
an end-to-end MemoryGate retrieval quality test. Reproduction script and sanitized
report: services/decisions/check_memory_pipeline.py and memory-pipeline-local.json.
The fallback's exact cause was not established; a direct warm HTTP check returned
200 with 473.66 ms inference, so the bounded timeout remains relevant on this CPU.

Fixed a status bug: a saved settings revision no longer automatically makes
lexical/degraded retrieval healthy. Explicit scoped retrieval can remain healthy
without vector search; unavailable semantic search still reports degraded. Ten
memory tests pass. Live turn records now show memory status, supplied record count,
search mode, and relevance-ranking outcome without exposing the raw context
package. Browser checked both degraded and privacy-disabled receipts; build,
focused lint and runtime adapter checks pass.


### Owner inbox connection

The existing GatewayOwnerWorkspace and its tested decision/recovery client are now
mounted at /inbox in the live shell. Its retained notes and uncertain decisions
participate in the same authentication reset boundary as chat and activity.
Chrome loaded the real ToolGate owner channel successfully: zero requests in this
local setup, with no console errors. The phone view was inspected. Owner-client,
fixture-isolation, focused lint and build checks pass. This verifies the list path;
a real action approval/continuation round trip is still outstanding because this
isolated execution credential currently has no tool scopes.

### Live tool approval and continuation — 22 September

Added live chat links to the exact Inbox request and an explicitly verified resume
operation. Reply-only recovery uses the existing resume endpoint. Unsafe turn IDs,
mismatched response IDs and forgotten approval projection have contract checks.
Resume errors survive the subsequent history refresh.

The isolated ToolGate registry has one owner-confirmed local_echo tool,
conker.integration-echo, and the Pi bootstrap credential has only that tool scope.
Approval expiry was changed from 60 to 300 seconds for new local requests after
manual review exceeded the original window. No expired approval was extended.

Chrome on the real HTTPS gateway verified request
06cd366b-181e-4903-b44c-ee6461ebcc9f: password-confirmed Inbox approval, then
password-confirmed continuation of trn_b6c7478e06e747f8. ToolGate recorded exactly
one completed action, pi_b7d4766dde384ca2a745bb725fd96a48. Pi saved its digest and
length (25) result, acted=1 and complete. Incognito memory remained disabled with
zero pending ingestion. Two earlier expired approvals were refused without action.

Model quality remains a limitation: Qwen 2.5 initially shortened the tool ID,
then used it correctly after correction. Its final post-tool sentence repeated an
older private-test answer instead of describing the saved result. Execution is
verified; narration quality is NOT accepted yet. Do not describe this as a fully
successful assistant answer. Phone screenshot checked; browser console had no
warnings/errors. Runtime/workspace checks and production build passed (upstream
Zod annotation warnings remain).

### Post-action narration correction

Pi 107519d separates resumed narration from tool selection: no tool catalogue is
advertised to a stage that cannot dispatch tools, and its recorded system context
explicitly asks for the latest request's saved result. The instruction is included
in the context snapshot rather than added after capture. Action, reply-recovery
and research regression tests: 38 passed.

Repeated the full browser path after restarting Pi. Turn trn_78e5f65542e84dce,
approval cb26a26a-88e3-48fe-9063-0145513f9fe6 and action
pi_1e9ddef7adfd4a068d84d9c26bee3cb7 completed. The browser displayed a reply citing
the actual saved digest 771e9489a6f2042dec2609f19bfd471b5c69521a23050431e787cd1d4ae6b97d
and result length 22. No additional action was requested during narration. Memory
admitted zero records and filtered all three messages for this private turn.
This corrects the demonstrated stale-answer case, not a general model-quality
guarantee. Local Qwen remains a small CPU acceptance model.

### Real cross-conversation memory acceptance

Browser-created source session ses_b932f8f7a77a4ffa contains two labelled restatements
of existing owner requirements (launch languages and local-before-Ubuntu testing).
Both user messages were admitted through Pi's outbox into real MemoryGate PostgreSQL;
assistant output was not admitted. A separate browser-created session
ses_9806c103f2814279 recalled them in turn trn_32afa79bf4264ea1. Laya ranked both
real retrieved memories (relative confidence 0.2355), preserved their source fields
and citations, and routed the answer to local Qwen (442.01 ms routing decision).
The answer correctly identified English first, Russian/Hebrew later and Windows
before deployment. The memory receipt in Chrome shows two lexical records,
ranked by laya-english@1c5edc17, while retaining degraded search status. A phone
screenshot was inspected; the browser console had no warnings/errors.

scripts/check_local_memory_turn.py verifies that exact persisted turn against the
live source records and recorded answer context. This is real ingestion/retrieval,
not the earlier synthetic retrieval pipeline check. It does not establish broad
ranking accuracy, vector retrieval, or multimodal storage. Embeddings remain
unconfigured and two admitted records await indexing.

The temporary echo execution scope was removed after approval testing. The small
Qwen model unnecessarily attempted that tool during acknowledgement requests;
that quality limitation remains, even though the boundary rejected oversized
arguments and no extra action was approved. Tool availability should be deliberately
scoped for real tasks; the acceptance tool is no longer advertised.

### Actual decision-service outage acceptance

Stopped only the owned local Laya service. Automatic-routing turn
trn_cf77138ea2584860 failed with no eligible-model substitution; the browser's
saved-submission reconciliation revealed the terminal failure and released sending.
With Laya still stopped, an explicitly selected Qwen turn
trn_d6ef97790d414df9 completed, retained both real memory records and displayed the
fallback relevance receipt. The answer still used the saved requirements. The
read-only memory verifier accepts --expected-ranking fallback for this turn.
Restarted Laya; authenticated /health returned ready, pinned model ID, busy=false.

Usability gap observed: a failed turn's record gives its status but little recovery
guidance after reconciliation. The underlying refusal remains safe and visible;
this is not evidence of polished failure UX.

### Failed-turn recovery guidance

The live turn record now maps the known model-route failure to actionable guidance:
review model availability in Settings or explicitly choose an available model in
the composer. Other failed turns retain generic review guidance, with an additional
action-outcome warning when an action exists. Arbitrary provider errors are not
rendered. The Review models link reaches the real settings page. Checked the saved
outage turn at 390x844 and 1440x1000; the guidance wraps within the existing layout.
Focused ESLint, design checks, TypeScript and Vite build pass (upstream Zod annotation
warnings only). The gateway was restarted to serve the new build.

### Shared live message controls

Live user/assistant messages now offer copy-text and authenticated local message
links, with timestamps beneath the content. Extracted the existing preview's
MessageActionButton unchanged for both paths, avoiding fixture-store imports.
Forgotten/unsupported content disables both controls. Copy failures give manual
selection guidance; successful links explicitly announce that sign-in is required.
Desktop and phone live screenshots and the light preview message toolbar were
inspected. Clipboard writes reported success; clipboard read-back was denied by
browser permission and was not bypassed. Opening the generated route shape for an
observed message selected/highlighted the correct record. Focused lint, import
isolation (112 live dependency modules), design checks and production build pass.
