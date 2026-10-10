# Status

This is the human-readable status of the current source tree. The executable
inventory is [`capabilities.json`](../capabilities.json); the pinned release input
is [`versions.env`](../versions.env); an assembled deployment is proven only by a
completed [release-acceptance](reference/release-acceptance.md) evidence bundle.
Those three artifacts answer different questions and must not be substituted for
one another.

Last source verification: **10 October 2026**. The current tree has **37 tracked
capability families: 36 active and 1 deferred**. Active means at least one real
product surface exists; it does not imply UI/CLI parity or current-server rollout.

## Current source

### Model setup, foreground Stop and service recovery (10 October)

Model setup checks each exact installed local route. Activation probes a staged
selection and commits settings together with its receipt only on success. Failed
or uncertain probes leave routing unchanged, concurrent owner updates win, and
replaying a successful activation returns its receipt without another model call.

Foreground inference now registers an exact cancellable operation, so Stop can
interrupt a silent provider stream. Late answers remain fenced by the durable
stop record. Tool effects retain their reconciliation path; a delayed old Stop
cannot cancel a later explicitly resumed reply, while a newer Stop still can.

The launcher distinguishes process ownership from port readiness. It waits for
owned starting processes instead of duplicating them, verifies shutdown, and
refuses runtime maintenance while those processes remain active. Unreadable
ownership fails closed. Concurrent independent launcher invocations are not
serialized by this change.

Setup and the sidebar share one cancellable, client-scoped status read with
bounded focus refresh. Failed refreshes remain visible even after prior
completion, and retained results are labelled as the last verified progress.
Progress describes saved setup evidence, separately from current model availability.

Validation: 63 model setup/readiness tests and 58 launcher/correction tests pass.
Cancellation, loop, thinking and reply recovery checks cover 81 cases, including
the final 24-case stop-generation regression run. Relevant frontend contracts,
TypeScript, affected lint, design checks and all 406 source-module reachability
checks pass. Desktop/mobile status recovery was visually reviewed in both themes.
The staged production entry is 596,356 bytes, below the unchanged 700,000-byte limit.

Fresh and repeated installation reproduce all 75 reviewed Pi files. The local
rollout retained SQLite checkpoints and the previous assets; Pi and Gateway
passed health checks. A live local-thinking request, with background Think off,
confirmed cancellation in 422 ms after Stop, with no tool action or saved answer.
A separate explicit local-fast request completed one answer call (501 input and
12 output tokens) in 31.2 seconds, with no thinking call. Chat displays that saved
answer and retires the older stopped-turn panels. Both new synthetic inputs were
excluded from memory. These observations confirm the exercised paths; local
generation latency, automatic-router timeout and small-model tool reliability
remain limitations. Model configuration remains at its prior revision.

### Visible turn recovery and owner memory corrections (10 October)

Saved failed, interrupted and stopped replies remain visible after reopening a
chat. Pending approvals and unresolved action outcomes stay visible alongside
their explicit recovery controls. Status checks do not resend a message; reply-only
recovery uses the exact recorded turn. Guidance distinguishes recorded actions
from unconfirmed outcomes and does not display arbitrary provider exceptions.

Local setup now creates a distinct memory correction credential scoped to the
existing companion namespace. Older installations can use `workspace.py
memory-corrections` while Pi and MemoryGate are stopped. It preserves all other
configuration, refuses partial credentials or mismatched scopes/ports, and
reports configuration separately from running readiness.

Claude cancellation now carries the sign-in attempt's identity through UI,
Gateway, bridge and CLI. A delayed request for an old attempt cannot cancel a
replacement. No external authentication was performed to test this behavior.

The model prompt now separates ordinary replies from tool-request JSON and
explains that Conker handles memory delivery. A model-only diagnostic returned
ordinary text for the synthetic Remember request, but a separate tool request
still produced malformed JSON. Strict rejection remains in place; these examples
do not establish reliable tool use by the installed small model.

Validation: 121 tool/prompt/memory regressions, 60 correction setup checks and
59 Claude bridge/CLI/Gateway checks pass. Gateway contracts, saved-outcome and
provider UI checks, TypeScript, affected lint and production build pass
(595,422-byte entry; no fixtures). Desktop and narrow mobile recovery views were
reviewed in both themes. The installer reproduces all 69 reviewed Pi files and
remains unchanged on repeat application.

The local app now runs this milestone with database and private configuration
checkpoints. Live chat displays the saved failure with Details closed. The exact
synthetic memory was previewed and forgotten; its receipt changed to `removed`
in CLI and chat while its original message remained. Semantic-index removal
reported degraded because semantic search is unavailable. Claude status remains
signed out with no pending login identity. A separate greeting using Automatic
hit a router timeout and selected the configured local thinking model for the
answer. An explicit Stop eventually cancelled the turn with no tool action, but
only after about 53 seconds. That observed delay prompted the foreground
cancellation fix above; it is not successful prompt-cancellation acceptance.

### Explicit memory requests and delivery acknowledgements (10 October)

Direct “Remember that…” and “Запомни, что…” statements have a distinct owner
admission path in MemoryGate. The exact statement and its source are retained
without inventing a high signal score. Quoted examples, questions and empty
directives do not force admission; direct negative instructions suppress active
memory admission for that statement. Conversation storage and existing memories
are separate. Historical receipts and deletion tombstones are not reprocessed.

Saved user messages expose a source-bound delivery receipt in chat and through
`conker.py memory-delivery SESSION_ID [--message MESSAGE_ID]`. Positive status
requires a validated MemoryGate acknowledgement, not a model's promise. Pending
checks are bounded and read-only, with explicit retry after uncertainty. Privacy
at the time of the original message governs exclusions. Forgotten records mask
earlier positive receipts, and auth, route and privacy changes fence late reads.
For explicit requests, the talking model receives the already-known delivery
state without waiting for ingestion. Normal delivery progress preserves the
prepared prompt; forgetting invalidates saved acknowledgement context and retries.

Numeric loopback HTTP calls to Ollama, ToolGate and the decision service avoid
repeated CA-bundle loading. HTTPS and other destinations retain default certificate
verification; proxy, redirect and cancellation behavior remains explicit. Synthetic
transport timings improve substantially, but they do not establish faster model
generation or a general response-time guarantee.

Validation: the final memory delivery, audit, forgetting and prompt run passed
119 tests, including 49 new delivery cases. The transport and inference slices
passed 108 relevant tests; CLI and installer checks passed 39. Gateway and memory
UI checks, TypeScript, affected lint and the production build pass (595,095-byte
entry; no fixture chunk). Desktop and 320/390-pixel layouts were reviewed in light
and dark themes. Fresh and repeated installation reproduce 69 reviewed Pi files
and nine MemoryGate files without changes on repeat application.

Local rollout retained SQLite and verified PostgreSQL dump checkpoints; MemoryGate,
Pi and Gateway passed health checks. A synthetic live request returned the exact
`owner_requested` acknowledgement in CLI and chat. Its local model reply failed
after requesting an unavailable tool (nothing executed). Individual forget preview
also revealed missing `PI_MEMORY_CORRECTION_*` configuration. The later owner
correction milestone above repairs that setup and confirms removal of this exact
synthetic record. The failed reply remains a recorded limitation.

### Recorded model calls and recoverable memory forgetting (10 October)

Every new turn records actual provider attempts, including model selection,
fallback, memory ranking and resumed answers. Talking and background thinking
have separate totals. The UI reads these records on demand in Calls & usage;
`conker.py usage TURN_ID` reads the same receipt. Missing provider counters stay
unknown, known subtotals are identified, and older turns disclose incomplete
coverage. Costs are reported values, never estimates. Summed call time can include
overlapping requests and is not the time the user waited for a reply. Duplicate
submission recovery does not create another provider call.
Preparation before turn admission, including context selection and automatic fork
summaries, and independent search/proposal work are outside this receipt's scope.

Memory forgetting now has a durable, content-free request journal. An uncertain
response holds recall until the owner confirms that same request; reload can
recover its exact identity without storing memory text in the browser. Request
identity is bound to the original memory, revision, namespace and service
destination. Deletion invalidates derived recall packages and saved replay
prefixes, including retry copies and older briefings without individual IDs.
An atomic admission check prevents a retry from copying a prefix concurrently
with forgetting. Source conversations remain available until separately forgotten.

The Memory UI uses the shared destructive confirmation, preserves the reviewed
identity after a lost response, and offers explicit recovery from server metadata.
Late reads cannot restore a forgotten record or its deep link. A recovery status
refresh cannot close an active deletion check. These behaviors are tested with
isolated data; live user memories are not used for deletion tests.

Validation: the Gateway and memory checks, TypeScript, affected lint, and
production build pass (594,244-byte Gateway entry; no fixtures). The final
deadline/usage run passed 25 tests, forgetting recall passed 26, and the combined
CLI/installer run passed 35. The installer bundle reproduces all 62 reviewed Pi
files on a fresh pinned checkout and is unchanged by repeat application.
Pi and Gateway were restarted after consistent database checkpoints; both passed
health checks. A live local-model turn recorded one foreground call, 371 input
and 15 output tokens, no thinking call, and unknown cost/cache counters. Older
turns correctly return incomplete coverage. The call took 33 seconds and the turn
44 seconds; local inference and preparation latency remain follow-up work.

### Private drafts, bounded thinking and memory recall (9 October)

New-chat and conversation drafts now save their complete message intent to Pi:
text, model, selected skills, research mode and Think choice, plus the new chat's
agent, title and privacy overrides. Revision checks prevent one tab from silently
overwriting another. The UI shows saved, unconfirmed and conflict states; draft
text is not written to browser storage. Saving does not send a message or admit
memory. Auth changes and forgetting fence late reads and writes. Starting a chat
atomically transfers a draft and records an idempotent receipt; recovery opens
that same chat without sending. Submission consumes only its frozen draft
revision, preserving subsequent edits. The CLI shares these operations through
`draft show/save/clear/start/start-status` and `chat --draft-revision`.

Requested thinking has an absolute elapsed-time limit, capped at 120 seconds and
frozen at admission. This also covers providers that continuously emit chunks and
would never reach a per-read timeout. Expiry closes the owned transport, rejects
late findings and does not restart or fall back. Capacity remains held until the
adapter exits; a legacy adapter without a close operation can still take its
existing I/O timeout to return. Queue waiting has its own bound.

Memory recall retains whole records within a 32 KiB serialized context budget
and records omissions explicitly; the raw response is separately bounded.
Lexical fallback now selects query-relevant candidates before its result limit,
so an older matching memory can survive a large collection. Missing semantic
dependencies still report degraded readiness. Empty recall envelopes become a
short scope-aware prompt notice; substantive records, briefing and citations
remain exact. Durable receipts retain the full retrieval status. Static tool
instructions precede changing memory context for prompt reuse.

Malformed, unknown or unsupported tool-shaped model output now fails explicitly
instead of appearing as an ordinary answer. Explanatory examples remain inert,
and recorded actions are not replayed when only their final answer needs retry.
Ollama readiness matches exact tags; installing a sized variant does not make an
uninstalled bare `latest` route available. Provider transports explicitly refuse
environment proxies and redirects.

The local installation bundle now includes MemoryGate as well as Pi and ToolGate.
Fresh and repeated patch application is verified, and enhancement refuses to
change a running MemoryGate source. Reviewed development checkouts can use
`--memorygate-source`. Production release pins remain unchanged.

Validation: Gateway contracts and the production build pass (591,949-byte entry,
with the existing 700,000-byte guard); 64 CLI/installer tests, 46 thinking and
cancellation tests, and 101 memory/prompt/tool/context regressions pass. Fresh and
repeat Pi bundle checks reproduce all 52 reviewed files. Local Pi and Gateway
health checks passed after the rollout, with consistent database checkpoints
retained privately. Live browser acceptance restored a new draft and Think choice
after reload, sent it once, recovered an existing-chat draft, and resolved a real
two-client revision conflict without sending either competing draft. Desktop and
390-pixel mobile views were inspected. The ordinary local reply completed in
29 seconds and created no thinking job; this single measurement does not establish
a general latency improvement.

### Chat-first companion and explicit thinking (9 October)

The owner selected a new chat-first product direction. The root route opens a
conversation; the daily overview remains at `/overview`. A single sidebar groups
Work and Library around recent chats and Memory. Open views and conversation
context appear on request. Existing approvals, deep links, theme customization,
and mobile focus behavior remain available.

Thinking is an explicit per-message choice in the composer or `chat --think`.
Ordinary follow-up messages preserve that requested analysis; another Think
request replaces it. Findings stay associated with their original message.
Talking takes priority over competing local inference. Cancellation reaches the
active provider connection or native process, fences late results, and retains
capacity until the adapter exits. A preempted thinker gets at most one automatic
continuation. Connection setup can still await its bounded timeout; cancellation
does not promise that a remote provider stopped charging. The lightweight status
route avoids polling full transcripts.

Local model initialization now uses the configured model and verified installed
inventory, preserves existing role choices, and leaves missing models unavailable.
It no longer forces a low routing-confidence threshold. A single eligible talking
model skips the classifier. New role updates reject decision classifiers in text
generation roles and enforce Laya's supported shortlist size. Model choices refresh
after saved changes. CLI recovery exposes the existing submission inspection,
resume, stop, and thinking operations.

Subscription and direct OpenAI, Anthropic, and OpenRouter continuation accept
recorded tool evidence without enabling native tool execution. Regression
coverage verifies a completed action is not replayed
when its final answer fails and is retried. Live subscription entitlement remains
unverified while both native accounts are signed out. These changes target the
local working app; production release pins and Linux acceptance remain separate.

Production build, browser contract checks, provider/runtime regressions, and fresh
and repeated application of the ordered Pi installation bundle pass. Local
providers, Pi, and Gateway were restarted with successful health checks. A live
ordinary message created no thinking job. Its CPU-only Qwen 2.5 3B response took
45 seconds and returned tool-shaped text for a simple greeting request. The
protocol fix above addresses that failure mode; local-model response quality and
latency remain measured follow-up work.

### Reusable skills and external MCP tools (9 October)

The local Conker workspace now imports instruction-only `SKILL.md` files in
Agents → Skills and through `python scripts/conker.py skills`. Each message can
explicitly select up to three skills. Pi freezes their exact revisions and text
at admission; retries retain that selection even if the registry changes. Skill
source replacement checks both identity and revision. Disabled, unknown,
duplicate and No-harness selections are rejected before inference. Imports do
not execute accompanying scripts or grant tools. A reusable code-review skill is
included at `examples/skills/code-review/SKILL.md`.

Tools → MCP servers and `python scripts/conker.py mcp` discover public HTTPS
Streamable HTTP servers, review/import an exact tool schema, enable or disable
tools, and explicitly grant chat access. ToolGate keeps execution behind its
existing owner approvals, immutable definitions and action journal. The client
supports MCP 2026-07-28 and the 2025-03-26, 2025-06-18 and 2025-11-25 protocols,
JSON and POST SSE, schema-drift checks, and uncertain outcomes without automatic
replay. Vault references supply a server Bearer token without exposing it to the
browser. Local stdio, MCP OAuth, sampling and deferred completion remain absent;
schema references, regex and format constraints are rejected explicitly.
Unsupported catalogue entries are listed separately so compatible tools remain
usable. Nullable types, scalar constants and bounded `anyOf`/`oneOf` schemas are
validated without dropping constraints. Complete accepted input schemas reach
the model, and returned credential echoes are withheld.

Live verification imported and selected the code-review skill, completed its
local-model answer, discovered/imported DeepWiki tools through both surfaces,
enabled one exact chat capability, and completed an approved read of the public
Hermes repository documentation. An explicit final-answer retry recovered a
local-model timeout without repeating the recorded tool action. Stale skill
revision updates were rejected with the saved version unchanged. Automated
coverage includes CLI and installation recovery, browser authority, skill
snapshot/replay, mixed MCP catalogues, approvals, schema drift, and uncertain
execution. Dashboard build, lint and affected contract checks pass.

These service changes ship as ordered patches against the pinned local workspace
sources. Fresh `workspace.py install` applies them before dependency installation;
`workspace.py enhance` updates an existing stopped workspace. Explicit reviewed
development checkouts use `--pi-source` and `--toolgate-source`. Release deployment
pins in `versions.env` are unchanged.

### Owner UI rollback (6 October)

The SiYuan/Asri visual pass is reverted to the pre-redesign checkpoint
`c3c8dfdf2c1765350808f54195633b33c1470a7c`. The earlier rollback incorrectly
targeted a commit that already contained that pass. The sidebar, empty-chat
canvas, existing search, and source-owned controls remain. Later pending-input,
explicit Companion memory-scope and confirmation fixes are retained; backend
release pins and persistent installation data are not rolled back.

The state before this correction is recoverable on
`checkpoint/conker-before-correct-ui-rollback-2026-10-06` at
`a6b7877c23c5d201d956d396d95cbc425be53db9`.

Signed-in testing found that expanded More navigation could reduce the recent
lists to zero height in a short window. Its scroll region now reserves space
for those lists and fixed controls. Tool availability copy follows saved
approval rules rather than promising per-run approval for automatic workflows.
System readiness describes core checks rather than claiming every capability
works. Live UI changes require a gateway restart: its dashboard assets are
validated and snapshotted into memory at startup, not read from disk per request.
Activity sources, task-dispatch review and proposal evidence use the transcript
route rather than the Chats collection. Conversation and message identities are
preserved through the shared navigation helper.
Task review closes when dispatch begins so streaming and Stop remain reachable;
a rejected submission reopens the retained review without an automatic retry.

Activity does not show empty results or a zero count until its current source
has loaded successfully. Source/tab changes hide previous rows immediately;
failed reads offer an explicit retry. Chat memory evidence reports the number
of records supplied, including zero, rather than treating retrieval success as
proof of recall. These changes do not widen memory scope or tool grants.

Pi 0.5.2 adds an explicit gateway cookie namespace for trusted instances sharing
a hostname. Browser cookies ignore ports; signing into the isolated QA instance
previously displaced the main instance's cookie. QA now uses its own namespace,
while the main cookie name and credential remain unchanged. This is session
collision prevention, not isolation against an untrusted co-hosted service;
that requires separate hostnames. Both live instances were updated from the
published, revision-verified image without replacing persistent volumes.

Pi 0.5.3 supplies saved Companion instructions to the model, using the immutable
configuration captured at submission just as custom agents do. Older snapshots
without configuration remain unchanged. Live QA confirmed the instructions,
corrected schedule and two memory records reached a new turn. The CPU-only
Qwen 2.5 3B model still scheduled rehearsal at the climbing-class time; context
delivery is not a guarantee of reasoning or recall quality. This remains tracked
in issue 38. The current running image is recorded below.

Message links now position their matching record inside the shared transcript
viewport. Automatic following cannot pull a linked message back under the appbar;
Latest explicitly resumes following. Checks cover delayed history, hidden
workspaces, streaming, manual scrolling and session changes. Cross-chat memory
and workflow execution acceptance still require the owner's specific QA grants;
no access was expanded during these fixes.

Qwen 2.5 7B is installed and selectable on both live instances; the 3B default
and paid-provider restrictions are unchanged. A real QA planning turn took about
two and a half minutes and still described 15:30 as after a 19:00 class, with more
than the requested two bullets. A larger model is not accepted as a reasoning fix.

The existing Laya service was attached to the previous Pi container's network
namespace after the image-only upgrade. Both sidecars were reconnected to their
current Pi container and checked live; unrelated container identities stayed the
same. The private rollout helper now reconnects this existing dependent service
on roll-forward and recovery. Main's existing memory-ranking assignment was not
changed. QA routing answered a short acknowledgment, but refused a follow-up
below the configured confidence threshold; saved-request reconciliation and an
explicit manual answer choice recovered without substituting a model or granting
tools. The dashboard now accepts and names both current-request and recent-exchange
routing receipts, including the known search-ranking role, while still rejecting
malformed evidence and withholding arbitrary provider fields.

Pi 0.5.4 also preserves that recent-exchange scope when sanitizing the saved
receipt; older turn history is not rewritten. Both instances run the published,
revision-verified image, with Laya reconnected during the upgrade. Live QA showed
the recent-exchange label, 380 ms classifier timing and the actual 3B answer route.
Its temporary routing test was restored to manual mode; memory/search ranking
remain disabled in QA. The dashboard's 30 suites, build and lint passed, and Pi
passed 1,399 tests with four platform skips. Complete assembled release acceptance
and owner-authorized cross-chat/workflow drills remain outstanding.

Official Codex CLI 0.160.1 is prepared in a separate private server runtime, not
signed in or exposed as a Conker provider. No desktop credentials were copied.
Owner sign-in and a provider integration that preserves ToolGate authority remain
required; installing the CLI does not establish a usable chat model connection.

### Technical workspace redesign (4 October, development branches)

The dashboard now shares compact workspace chrome, central search entry, quiet
collection filters and consistent editor insets. Today prioritizes waiting
decisions; verified setup progress remains above the sidebar profile. The
pre-redesign checkpoint is `c846bf04ecd715da3c835c38e3d07cbc52f7529a` on
`checkpoint/conker-ui-before-redesign-2026-10-04`.

The structural pass groups recurring UI work into shared collection toolbars,
divided record surfaces, responsive records, form sections, reference topics and
loading/empty states. General/Search Settings and Studio share section geometry;
libraries and Activity share retrieval controls. Appbar actions account for the
available workspace width and disclose secondary commands without clipping.
Memory List uses readable records on mobile, and its inspector puts reading and
relationships before forgetting while retaining the consequence and verification
flow. Source-owned revision, cancellation and draft state remain separate. These
rules and component ownership are recorded in `dashboard/DESIGN.md`. The checkpoint
before this pass is `536d620bd26445bbe470a9dc6afbae978faec0eb` on
`checkpoint/conker-ui-before-structural-pass-2026-10-04`.

Page search now has one appbar entry. It filters the current view, with Search all
Conker in the same control's scope menu carrying that query into authenticated
global results. Collection, table, Inbox and Memory queries no longer add another
text field below the appbar. Mobile uses one focused search popover. Local query,
server-read and privacy ownership are retained; task-specific dialog pickers stay
local. Browser checks confirmed one active field across all six libraries and
representative Inbox/Activity/Memory screens, mobile focus/no overflow, literal
global results, query handoff and local-query retention. The previous milestone
`f6efcb1e539c82495d1389651debaacb6e776f01` remains the rollback point for this change.

The companion dashboard and Pi development branches add authenticated staged
search with verified revisioned settings, source-owned literal projections,
privacy invalidation on every query, actual record links and optional bounded
`search-ranking`. Semantic retrieval currently uses MemoryGate only. Memory exact
text is limited to library previews; other projections are bounded to 200 records
and report partial coverage. All-source semantic indexing/rebuild controls and
complete retained-text adapters remain unfinished. These source changes do not
upgrade pinned releases or deploy a service.

Desktop baseline/revised route captures and representative search, transcript,
graph, editor, inspector and creation-dialog checks were recorded locally. The
structural pass successfully applied the browser viewport override: collection
and representative decision/settings layouts were checked at 390 x 844 without
page overflow, and Studio appbar actions were checked at 1024 x 768. Collapsed
navigation and light/dark collection surfaces were inspected; Memory Tree/List
and an explicit content-field read were exercised. Zoom, reduced-motion and
custom-theme visual acceptance remain unverified. Build, lint, 29 dashboard check
suites and 19 design-guard self-tests passed, including seven shared-workspace
render checks. Existing build warnings about dependency annotations and large
chunks remain. Focused Pi tests from the preceding milestone cover authentication,
privacy, settings persistence, pagination and provider fallback.

### Connected owner workflows

Settings now has write-only OpenRouter, OpenAI API and Anthropic credential
management, separate verify/activate/discard/recover operations, issuer-revocation
attestation, and explicit paid-request policy. A Linux user-service worker shares
the CLI's credential store and fixed host operations; only Gateway mounts its
private socket. Catalogue providers/models can be added, renamed and removed;
active role/default references must be reassigned before removal. Browser session
inspection and password-confirmed revocation are also exposed in Settings.
Providers now has a separate Settings tab and ChatGPT/Codex subscription sign-in,
distinct from API-key providers. Official Codex CLI 0.160.1 manages device-code
authorization and refresh in a private per-installation home. A separate Pi-only
inference socket preserves Conker's tools and owner authority; no Codex agent
runtime is started. Only the exact authenticated login response contains the
one-time code. Catalogue reads and disconnects are explicit verified operations;
connecting never changes answer defaults or background roles. Text streaming and
Stop retain Pi's existing controls; subscription image input is not yet supported.
Real device-code start/cancel was verified on Linux without authorizing an account.
Subscription inference, model entitlement and refresh with a real authorized
account still require the owner's OpenAI consent; unit tests are not that proof.
Connection-read failures now hide stale account identities and discovered models
without erasing managed authorization. Providers pauses status polling during an
owner operation, rejects pre-operation late reads and duplicate clicks, and hides
stale auth commands after failed reads until an explicit refresh succeeds.
Subscription readiness follows that same current read, rather than retaining a
contradictory signed-out status after an outage or successful authorization.

Pi/Gateway 0.5.6 (`777666b004175d1b3650ccc23538e6c68d5aaae5`, image digest
`sha256:71f161fa2a303cf9a74c7813c3e808e27747b70c63eac35a1d0e67cfcf4411ae`)
and dashboard tree `3ac21151f8cf98776b03c5eb5a1a39498919a974` are now on main
and QA, with private rollback snapshots. Private control/inference socket
reachability, health, Laya namespace reconnection, paid API policy off and unchanged
unrelated container identities were verified without resetting data or model choices.
QA browser acceptance exercised owner-verified device sign-in, pending authorization,
reload with no retained device code, exact cancellation, and General/Providers
separation. Desktop and 390px mobile dark/light screens and the owner dialog were
visually checked; theme/viewport changes were restored. No account was authorized.
The recovery patch was checked against an actual stopped QA provider worker:
commands disappeared, readiness reported unavailable, and an explicit refresh
restored coherent signed-out status after restart. Desktop and 390px mobile
captures confirmed the error and recovery layouts. Both instances retain private
rollback snapshots; no pending OpenAI authorization was interrupted.
The Windows Pi suite passed 1430 tests (4 skips); Linux CI passed its container,
authority and audit checks. Conker Linux CI passed 291 tests (5 skips), recovery
drill, dashboard lint/build and all 31 dashboard suites. Optional assembled
live-matrix acceptance remains skipped, not claimed as passing.

Pi/Gateway 0.5.5 and the pinned dashboard tree
`f84dafadfff9345dfe8d93afa083f1eb280d2052` are installed on the main and isolated
QA instances. Private socket reachability, health, Laya reconnection, paid-policy
off and unchanged unrelated container identities were verified. Existing data,
model choices and tool permissions were preserved. QA browser acceptance saved
an inert invalid key, verified its rejection, discarded the stage, cancelled
spending enablement, persisted and removed temporary catalogue entries, and
revoked its own session before signing back in. Desktop and 390px mobile dark/
light dialogs were checked; temporary viewport/theme overrides were restored.
No real provider credential or chargeable model request was used in these drills.

Live testing corrected the Linux systemd working-directory syntax and the UI's
confirmed self-revocation transition. Dashboard lint, build, design guards and
31 check suites pass. Linux CI passed 279 host tests with five platform skips,
the Docker recovery drill and deterministic release-acceptance checks. The
optional assembled live matrix was not run. Pi passed 1,412
tests with 11 skips locally and its release CI passed. Full owner-authorized
cross-chat/workflow acceptance remains outstanding.

This is not total host-CLI parity. Model downloads, speech-server configuration,
backup capture/verification, held restoration, TLS/password bootstrap, pinned
updates and service lifecycle still have host-only paths. The UI must not claim
those actions work through a generic terminal or a cosmetic button.

- Browser authentication, session revocation and operation-bound password checks.
- Conversation sessions, streaming turns, cancellation, resume and reconciliation.
- Tasks, run activity, proactive proposals and owner approval decisions.
- Model catalogue and role configuration, including host-managed provider secrets.
- Memory inspection and owner-reviewed forgetting.
- Tool inventory plus workflow drafting, publication and recorded runs.
- Durable agents, Companion editing, projects, artifacts, jobs and agent teams.
- Durable typed calls plus bounded voice turns with browser-owned PCM capture,
  authenticated transient transport, explicit speech readiness and disposable playback.
- Read-only owner file inventory and host service, port and process observations.
- Shared diagnostics, resumable verified setup status and durable setup evidence.

The connected dashboard uses one gateway shell. Fixture data is restricted to the
explicit preview build; production bundles contain no fixture chunk. Every active
UI capability names a bounded CLI inspection or apply command; the deferred owner
terminal remains outside that parity claim.

The first-run dashboard now presents the verified checks as a three-phase path,
keeps the current operation dominant, distinguishes retained status after a failed
refresh, and hands the owner to a first conversation as soon as security,
Companion and model checks pass. Boundary review remains an authenticated receipt
operation and protection still requires an evidence-producing host command.
Rehearsal is now an ordinary owner mission in the connected UI and CLI: Pi proves
a completed conversation, a revision-bound review of the current memory choice,
and ToolGate's real single-use approval path through its fixed local echo. Only Pi
can finalize that receipt; assembled release evidence cannot be uploaded in its place.

Protection setup now stores one append-only, revision-checked policy shared by UI
and CLI: a normalized mounted off-machine destination and a retention count. Saving
policy is not completion. The repository host verifier requires separate mounted
storage, creates and re-verifies the coordinated snapshot, prunes only older
independently verified snapshots, and records evidence bound to the exact policy.
Changing destination or retention degrades the old receipt. Browser code cannot
submit protection evidence.

Absent optional memory and capability services now have durable, revisioned
`skip` and `include` choices through the same UI and CLI control plane. A memory
skip durably defaults new conversations to no long-term memory, while existing
sessions keep their own setting. A capability skip removes ToolGate capabilities
from model turns without stopping the service or erasing its catalogue. Skips are
shown as off, not verified-enabled, and cannot turn a failed included service green.

A fresh supplied Companion profile is no longer treated as owner-reviewed merely
because it exists. Setup now requires either an edited durable agent revision or
an explicit acceptance of the default through UI or CLI. The previously dormant
Companion harness editor is connected as a dedicated section beside Character
Studio, keeping agent authority separate from appearance and voice.

First-run model selection is now a bounded setup operation rather than a link to
the full settings editor or an operator-only bootstrap script. Pi discovers the
running local model and existing catalogue candidates, reports live readiness,
data location and possible provider cost, and accepts only a current server-issued
candidate and configuration revision. Selection alone no longer marks the model
complete: Pi sends one fixed, bounded prompt through the selected server-owned
adapter and stores an append-only receipt bound to the resulting configuration
revision. The receipt contains model identity and a response digest, never prompt
or response text. The setup UI and `conker setup models` / `conker setup run model
CANDIDATE_ID` share that operation; unknown or unavailable models fail closed,
failed request IDs are not replayed, and advanced role settings survive changes.

### Host CLI

The repository and source-built Ubuntu launchers share one command implementation.
It covers service lifecycle, diagnostics, fixed control-plane inspection, local
model download, hosted-provider credential rotation, authentication and TLS,
verified backup, held recovery, pinned updates, and the executable setup steps.

`conker setup run boundaries`, `protection` and the multi-step `rehearsal` commands
use the same Pi operations as the setup UI. Verified backup, verification, held restore and
recovery status now use strict repository and generated-Ubuntu layout profiles. Ubuntu still
refuses repository-only self-update and single-key recovery rather than guessing at an unsafe
equivalent.
The Ubuntu generator also consumes the validated release manifest directly for PostgreSQL,
Qdrant and Ollama, so a fresh deployment no longer begins from mutable `latest` tags.

### Deferred

| Capability | Why it is deferred |
| --- | --- |
| Owner terminal | The constrained PTY, UI, dedicated candidate image, health probe, workspace preflight, recovery exclusions and guarded repository/Ubuntu deployment shapes exist. Manifest v2 still records the capability as deferred and requires both a registry digest and hashed target-Linux acceptance to activate it; neither promotion input exists yet. |

This capability exposes no production surface in the capability matrix. Its
presence in lower-level code is not a release claim.

## Deployment evidence

The latest completed Ubuntu acceptance is the
[23 September 2026 run](../deploy/ubuntu/acceptance-2026-09-23.md). It proved the
then-connected chat, memory, approval, workflow, authentication, private HTTPS and
cold-backup subset. It does **not** prove the current source tree, current dashboard
revision, setup flow, provider lifecycle, terminal work or new owner workspaces.

The Ubuntu host is online for the 6 October owner rehearsal, with a separate QA
instance. Its live checks do not substitute for complete assembled acceptance.
Promotion of a new release remains pending until
the exact manifest is assembled on a clean Linux host and produces passing install,
image-identity, TLS/auth, setup, conversation, backup/held-restore and teardown
evidence.

Local verification on 27 September:

- Conker root suite: 218 passed, 33 platform skips. The added Windows skip is the
  active terminal workspace UID/GID fixture; the same generator branch passed in a
  disposable local Linux container with a real `65532:65532` workspace.
- Pi suite: 1,364 passed, 11 platform skips.
- Connected dashboard gateway contracts, lint, design-system checks and production
  build passed.
- The authenticated shell now has one typed connected-route registry shared by
  workspace resolution, the sidebar and page search. Browser QA proved that only
  connected destinations are advertised, System navigation reaches the live
  diagnostic workspace, and unknown section values fall back to Overview without
  rendering the disconnected-workspace surface. All 27 dashboard contract suites
  pass, source reachability is 354/354, and the production bundle remains fixture-free.
- Today now leads with the one decision that needs the owner, keeps active work and
  recent conversations in the primary reading path, and gives empty states a useful
  next action. It was inspected at the default desktop viewport and at 390 x 844 and
  320 x 667 with no horizontal overflow or browser-console warnings.
- A new conversation now exposes its answer model before the first message. An
  explicit choice survives session creation and is sent on the initial submission;
  the configured-default option still leaves routing to the server. Browser QA at
  desktop, 390 x 844 and 320 x 667 showed no overflow, and an exercised preview turn
  retained `Qwen 2.5 3B` in the header and recorded `ollama / qwen2.5:3b` in its saved
  turn details with no console warnings.
- A new conversation now also selects an active durable agent before the first
  message. Pi validates and saves that identity atomically with the session while
  preserving the setup-derived memory default; missing or archived agents leave no
  orphan session. Assistant records expose the agent frozen into each turn, and the
  connected transcript, live-writing state and reply composer use that attribution.
  Browser QA exercised a Research partner turn at desktop and inspected the selector
  at 320 x 667 with no horizontal overflow. Open chats also expose a revisioned
  future-turn handoff that preserves the rest of the session settings and historical
  attribution; the UI detector reported no findings.
- A new conversation can add memory-disabled and harness-disabled restrictions before
  the session exists. Pi validates and persists them atomically with the selected agent;
  omitted keys preserve setup defaults, and disabling the harness requires an explicit
  answer model before the first send. Browser QA exercised both restrictions through a
  completed preview turn, then reopened the saved conversation and confirmed both
  authoritative switches remained active. The dialog and three-control utility row were
  inspected at the default desktop viewport and 320 x 667 with no horizontal overflow or
  console warnings; the UI detector reported no findings.
- Setup was rendered and exercised at 1440 x 900 and 390 x 844, including the
  expanded boundary-policy review; no browser-console errors or horizontal
  overflow were observed.
- The connected Companion Harness editor was rendered and exercised at the same
  desktop and mobile sizes, including its direct URL, mobile section focus and
  durable save transition; the preview console remained error-free.
- Guided model activation was rendered at 1440 x 900 and 390 x 844 with local data
  and cost disclosures, then exercised through the live-test transition from 4/8
  model setup to 5/8 boundary review and first-conversation readiness. The preview
  console remained error-free and the UI detector reported no findings.
- The ordinary owner rehearsal was rendered at 1440 x 900 and 390 x 844 and
  exercised end to end: current memory-choice review, fixed local approval request,
  Inbox approval, exact-request resume and Pi-owned finalization to 8/8 completion.
  The preview console remained error-free with no horizontal overflow.
- Protection policy was rendered and exercised at desktop and 390 x 844: the
  destination, retention, off-machine acknowledgement, saved-policy summary and
  exact host handoff remained readable with no console errors or overflow.
- Bounded voice turns now connect browser-owned mono PCM capture to an exact
  authenticated gateway route and Pi's once-only STT/model/TTS chain. Raw input and
  generated output are transient, uncertain audio is never replayed, and the UI
  remains text-ready when speech is unconfigured. Local contracts do not prove a
  speech server, physical microphone, latency, voice quality or Linux deployment.
- First-run capability setup now reports secret-free speech readiness and hands
  configuration to `conker speech configure`. Repository and generated Ubuntu layouts
  mount the optional key read-only, Pi refuses ambiguous key sources, activation
  verifies the recreated runtime and rolls back failed host configuration.
- Capability validator: 35 total, 34 active, 1 deferred.
- Release acceptance v2 now performs the complete headless first-run sequence,
  requires a real conversation and exact fixed approval rehearsal, creates policy-bound
  protection evidence on a separate mounted device, verifies a held restore, and only
  then accepts the final eight-step setup status. Deterministic acceptance contracts pass;
  the powered-off Linux host has not executed this gate yet.
- Every active capability with a connected UI route now names a bounded CLI
  inspection or apply command; owner terminal remains explicitly deferred.
- The owner-terminal adversarial container harness passes locally for normal PTY and
  boundary behavior, escaped-process cleanup, attempted listener replacement and
  supervisor loss without reconnect. Its image is still local and the host is WSL2,
  so this is not the required published-digest target-Ubuntu acceptance.

Both Python suites report one upstream Starlette/httpx deprecation warning. The
dashboard build reports large-chunk warnings. A repository-wide Ruff sweep passes;
the deployment retirement scripts and decision service no longer carry the eleven
previous formatting and lint findings. These local checks are not represented as
passing release acceptance.

## Release blockers

1. Run assembled acceptance for the exact current manifest on Linux and retain its
   evidence bundle.
2. Exercise the new CLI inspection and mutation families against the assembled
   Linux services and retain redacted evidence; local tests prove the route,
   schema and credential boundaries but not the powered-off deployment.
3. Run the source-built Ubuntu policy-bound backup and isolated held-restore drill on the
   powered-on Linux host. Local tests prove its generated service, store, key and database
   contract, but are not Linux/Docker acceptance evidence.
4. Package and accept the owner terminal or keep it deferred from the release;
   exercise the host-configured voice path with an explicit compatible speech service.
5. Reconcile the pinned dashboard revision and component releases only after those
   gates pass.

The immutable `v1` reference remains separate from this working tree and is not
modified by current development.
