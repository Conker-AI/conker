# Status

This is the human-readable status of the current source tree. The executable
inventory is [`capabilities.json`](../capabilities.json); the pinned release input
is [`versions.env`](../versions.env); an assembled deployment is proven only by a
completed [release-acceptance](reference/release-acceptance.md) evidence bundle.
Those three artifacts answer different questions and must not be substituted for
one another.

Last source verification: **23 October 2026**, on a Windows workspace (below). The tree has **42 tracked
capability families: 41 active and 1 deferred**. Active means at least one real
product surface exists; it does not imply UI/CLI parity or current-server rollout.

## Current source

### First-run wizard, weekly security check, workflow offers and a module release (22 to 23 October)

**Released:** Pi 0.6.0, ToolGate 0.5.0, MemoryGate 0.5.0, SystemGate 0.4.0 and Embeddings 0.1.4 are
tagged and published. Each publish workflow succeeded, each `ghcr.io/conker-ai/<module>:<version>`
manifest resolves anonymously, and `versions.env` pins them. No server has been updated to them
yet, and no release-acceptance evidence bundle exists for them.

**Verified on a running workspace** (Windows, the pinned sources at those release commits, local
model qwen2.5:3b in Ollama, 23 October):

- All seven services started and answered, and a chat turn answered through Pi.
- "Every morning tell me the weather in Tel Aviv" and "Remind me every Monday to water the plants"
  each put "Draft a workflow from your message?" in the Inbox, and the companion mentioned it.
  The first run made no offer, because it was gated on the companion's own tool grants (none in
  that workspace); offers now depend on the owner having tools. The small model at first promised
  to act every morning itself, and its instruction now says plainly that it cannot.
- `conker workflow accept` reached the builder. On this CPU-only model drafting did not complete:
  before Pi's builder wait was raised it stopped at the 120-second answer limit, and after it one
  call answered in about 2¾ minutes with an unusable draft while another ran past 10 minutes. A
  larger or hosted model is needed for reliable drafts on this machine.

**Built and tested, not yet seen on a server:**

- `conker setup` with no arguments: a guided first run over Pi's setup status, one plain question
  at a time, running the same `conker setup run STEP` commands scripts use. The installer offers it
  at the end of an interactive install. Its tests drive a simulated Pi through the whole run and
  the real launcher against a fake deployment.
- [Workflow offers](reference/workflow-builder.md): Pi makes the offer from a pattern check of the
  owner's own message before the model runs. The companion gets no tool, and accepting drafts
  exactly as `from-chat` does.
- The workflow builder waits up to 10 minutes for the model; chat answers keep their limit.

**Hardening:** A weekly security check in all six repositories audits what each one ships (pip-audit,
npm audit) every Monday and whenever dependencies change. Its first runs found published
advisories, now fixed: Pillow 13.0.0 and pypdf 6.21.2 in Pi, certifi in MemoryGate, and the ToolGate
and MemoryGate dashboards' build dependencies. The optional decisions sidecar's PyTorch and
Transformers advisories are reported without failing the check: it loads one pinned local
checkpoint, which requests cannot change. Upgrading it needs verification with that checkpoint.

### Workflow builder, plan alerts, settings and a local run-through (20 to 22 October)

**Verified on a running workspace** (Windows, `python scripts/workspace.py install` and `up` from
the pinned sources, local model qwen2.5:3b in Ollama, 21 and 22 October):

- All five services started and answered. `check_local_workflow.py` published nested editor
  workflows through the real ToolGate: both branches, a loop, a calculation and a replay passed,
  and its temporary grants were removed.
- A chat turn went through Pi to the local model and back with its memory delivery receipt.
  Memory search by meaning reported itself degraded, because that workspace ran no embeddings
  service; exact-word search worked.
- `conker workflow draft` turned "search the web for a topic and return what you found" into a
  valid editor workflow on the first try in 93 seconds, over the whole tool catalogue (with the
  worked example Pi's instructions gained that day). `publish`
  created version 1 with owner confirmation, and publishing a stale revision was refused.
- `workflow from-chat` turned a chat message into a valid draft in 84 seconds; the Inbox showed
  "Workflow draft ready", publishing cleared it, and the companion's own reply was refused.
- With `python scripts/workspace.py meaning-search` (the embeddings service and a Qdrant index), a
  memory saved as "favourite hiking spot is the Banias waterfall" came back for "suggest a place for
  my weekend outdoor trip" with no word in common and retrieval `ok`.
- `definitions`, `config get`, `limits`, `limits --alerts` and `inbox` answered from the live
  services. That workspace had no subscription runtime, so `limits` reported both plans as not
  configured.

**Built and tested, not yet seen against a live subscription or on the server:**

- [Workflow builder](reference/workflow-builder.md): Pi drafts and saves nothing; ToolGate stores
  and validates; only the owner publishes. A cross-gate test checks Pi's drafts against ToolGate's
  editor rules and publish path.
- Plan usage alerts: Pi reads each subscription runtime's usage every 15 minutes and puts a
  "limit N% used" item in the Inbox at the owner's level (`plans.alert_percent`, default 80), and a
  line when the window resets. Readings are percentages; no model call.
- [Settings](reference/settings.md): `conker config list|get|set|reset` over one registry of 26
  settings, each checked against Pi's own models.
- `conker definitions`: agents, teams, templates, skills, jobs and projects in one list.

**Hardening:** ToolGate refuses to replace a tool or workflow through `POST` without the version it
saw. Every Pi route is tested against missing and wrong-scope keys. A MemoryGate read key cannot
read another agent's memories. The workflow builder's input is bounded and its model text cannot
carry terminal control characters. The dashboard's dependency audit is clean.

### Every chat feature from the terminal (13 to 19 October)

Each chat feature now has a command, listed in [Chat CLI](reference/chat-cli.md): context settings,
rules, summaries, forks and compaction; decisions and open threads; output format, length and
language; chat names; message branches, retries, comparisons, version selection, blind judging,
votes and fact checks; files attached to a chat; model profiles; and `inbox`, which shows what needs
the owner, what was handled and what is coming. Paid actions print their request id first and are
never repeated automatically; compare, judge and fact-check replay safely with the same id. Shared
files are kept on disk without a size limit.

Behind them, Pi's code moved into packages, and every Pi refusal has one shape,
`{"detail": {"code", "message"}}`. The dashboard gained conversation views, composer modes with
Auto proposals, message details and prompt templates; it is the next thing to be redesigned.

### Correct retained memory from CLI and UI (10 October)

Memory's inspector now offers an editor that reads the full authoritative text
and revision before review. Saving requires owner verification of the exact
operation. The local `memory-edit` CLI and container `inspect`/`apply memory`
commands use that same Companion-only service. A correction changes retained
text while preserving its source conversation, provenance, confidence and
permissions. The receipt reports text persistence separately from search
indexing, including delayed indexing after a successful save.

Pi coordinates a durable correction journal with memory forgetting and active
work. It pauses recall during unresolved changes, clears cached recall before
dispatch and again before releasing the hold, and fences delayed context
preparation. Interrupted operations become uncertain after restart and are
never replayed automatically. Status recovery only reads MemoryGate's receipt;
an explicit retry sends the original approved payload. A definitive revision
conflict releases the hold. Forgetting a source chat removes any corresponding
pending correction text and prevents a delayed admission from retaining it.

MemoryGate remains the sole memory writer. Its receipt now exposes the existing
stored payload hash, so Pi checks exact text as well as request, namespace,
target and revision before accepting success. Completed Pi journal entries
retain content-free identity and receipt metadata. The browser keeps an unsent
draft only while its editor is open. When no receipt exists after a lost
response, a new review explicitly preserves the uncertainty, rechecks pending
work and rereads the current memory before asking for another approval.

Backend checkpoint `a684c54` passed 76 new correction tests and 259 affected
compatibility tests. MemoryGate checkpoint `d26fa08` passed 55 correction,
forgetting and conversation-memory tests. Both received independent review.
The packaged bundles matched 114 Pi files and 11 MemoryGate files from fresh
pinned checkouts, with byte-stable repeat application. The host CLI and
capability slice passed 100 tests, including exact Unicode/line-ending
preservation, size bounds and lost-response behavior.

### Discover saved Codex threads from CLI and UI (10 October)

Native sessions now has a Claude Code/Codex provider selector. Codex reads saved
history from Conker's isolated native profile, with separate Unarchived and
Archived views, bounded pages, explicit Load more and Refresh, and search of
loaded metadata. Unnamed threads use a bounded plain-text preview. Selecting a
thread reads its saved details and provides an exact manual resume command.
The CLI offers matching `native-sessions codex list` and `status` reads.

This connection observes saved history, not activity in another Codex process.
The interface says that explicitly and does not infer Running, Idle or Stopped.
It sends no prompt and exposes no Codex launch, Stop or approval operation.
Claude's existing background-session output, verified Stop and recovery remain
in their own provider view. Provider, archive scope, owner, client and selection
changes reject delayed responses and clear the previous inspection.

The host adapter uses Codex 0.160.1's generated protocol contract and a separate
owned app-server process. It permits initialization, `thread/list`, and
`thread/read` with `includeTurns: false`; the account adapter's authority is
unchanged. Listing requests all supported source kinds and lets Codex maintain
its own history index. Cursors bind the profile, archive scope and page size.
The 20-second operation deadline includes initialization; cleanup targets only
the observer. Gateway/CLI allow 30 seconds and browser reads allow 35.

The 72 new host tests and 62 CLI/history compatibility tests passed together;
69 affected existing host tests also passed. Gateway's 84 new tests, seven
private-transport tests and 53 existing native/auth tests passed. Independent
review found no remaining contract or lifecycle issue. Gateway commit `30096e5`
was packaged and matched 108 files from a fresh pinned checkout; applying the
bundle again was byte-stable. The full dashboard Gateway suite passed, including
Codex DTO, cursor, timeout, late-response and component checks.

Rendered desktop dark and mobile light checks covered paging failure/retry,
archive switching, long paths and previews, unavailable/empty states, and detail
dismissal. Testing found and fixed a lost-focus case when switching providers;
the restoration is bound to the current owner, client and provider change and
does not take focus from another dialog. The focused regression suite and
independent review passed after this correction.

Served-browser testing also exposed a mobile toolbar collision between More
workspace actions and Open views. The shared mobile action group now wraps its
inner controls inside the available width. Pointer checks at 320 and 390 pixels,
plus Chats, Inbox and Providers in light/dark themes, verified that controls stay
reachable without horizontal overflow.

Keyboard testing found a second shared-actions defect: wrapping a select root as
a menu item registered a missing focus target. `WorkspaceChoice` now renders a
select inline and radio choices in overflow: desktop submenus and labeled mobile
groups that fit at 320 pixels. Provider selection restores focus only after that
change commits. Selecting the already active provider does not navigate, reset
archive scope or leave a later focus request behind.

The local rollout backed up Pi/Gateway databases and retained the previous
dashboard assets. Live Pi is clean at `30096e5`; Pi, Gateway and the provider
bridge are healthy. The final build verified 172 assets and a 616,794-byte entry
under the unchanged 700,000-byte cap, without a development fixture chunk.
The full Gateway regression suite, final focused checks, TypeScript, affected
lint, design guard (429 sources) and seven workspace primitive checks passed.

Served-browser acceptance used eight synthetic GET responses to check paging,
loaded search, inert previews, exact resume commands, mismatched-detail refusal,
read recovery, archive scope and provider switching. Enter, arrow navigation,
Escape and focus restoration passed with zero uncaught page errors. Desktop and
320/390-pixel menu/detail captures were inspected. The interceptors were removed
and real history checked unchanged. CLI reads took 734 ms; Claude's registry,
model configuration and recorded work counts also remained unchanged. Both
native subscription runtimes remain available and signed out, with no login
pending.

Read-only checks against the installed runtime returned empty unarchived and
archived history in the isolated profile. A separate empty test profile verified
the missing-thread response and observer cleanup. Nonempty history is covered by
synthetic protocol/pipe tests; no real native task, OAuth or inference was started.
See [Native sessions](reference/native-sessions.md) for commands and scope.

### Inspect and control exact native Claude background sessions (10 October)

The enhanced local profile adds **Native sessions** to Work and System, with a
link from Terminal. The CLI provides matching list, status, output and Stop
operations. This view covers Claude background sessions in Conker's isolated
native profile. It is separate from chat history and reports both the 100-row
display limit and omitted non-background entries. Unsupported or malformed
native responses remain unavailable; a new native state is unknown.

Opening output explicitly reads a bounded plain-text snapshot without saving it
in Conker. Native identity is checked before and after the read, and selection
or authentication changes clear the browser copy. Stop uses a fresh exact native
identity check, owner verification and a one-use operation proof. Its receipt
says requested, not stopped. Recovery reads preserve uncertainty without an
automatic Stop replay. Native tools, permissions and approval prompts remain
owned by Claude; attaching is a separate manual operation that can resume work.

Native commands have a shared 20-second operation deadline and bounded pipes.
The CLI and Gateway allow 30 seconds; browser reads allow 35 seconds and Stop
allows 45 seconds after verified dispatch. Provider shutdown now requests a
graceful exit, with a fallback that targets only the exact Conker provider
processes. It does not recursively terminate native supervisors or their jobs.
Observation cleanup similarly stops only its own short-lived CLI process.

The host, CLI, provider, launcher and inference regression run passed 184 tests;
an independent focused run passed 125. Two additional redirected-output tests
verify that native-session JSON preserves Unicode on ASCII/cp1252 Windows
streams; its focused 12-test CLI suite passed. Gateway's 44 new boundary tests
and 33 existing native-auth/verification tests passed.
The reviewed Gateway commit is `08e2ef2`; its portable patch reproduces 105
files from a fresh pinned checkout and remains unchanged on repeat application.
A read-only check against installed Claude 2.1.270 returned an empty isolated
registry in 250 ms. No native task or real Stop was issued for that check.

The full dashboard Gateway suite, focused native lifecycle/component/transport
checks, TypeScript, affected ESLint and design guard (423 sources) passed.
Independent review corrected the attribution of an old Stop receipt after native
identity replacement. Rendered checks caught and fixed lost keyboard focus when
canceling Stop; confirmation cancellation, nested owner-verification cancellation
and explicit recovery now return focus appropriately. Desktop/mobile light/dark,
empty, unavailable, output and uncertainty states were inspected after transitions.

Local rollout backed up Pi/Gateway databases and retained prior assets. Gateway,
Pi and the provider bridge are healthy; live Pi is clean at `08e2ef2`. The build
verified 172 assets and a 608,577-byte entry under the unchanged 700,000-byte cap,
without a development fixture chunk. CLI discovery took 469 ms and matched the
pre-rollout empty registry. Model configuration and recorded work counts remained
unchanged; both native subscription runtimes remain available and signed out.

Served-browser acceptance intercepted one synthetic Stop and one synthetic owner
proof. Output loaded only on request, stayed inert and was discarded on an
identity mismatch. The failed Stop was not repeated; explicit status recovery
showed Stopped while retaining the unconfirmed-outcome notice. A replacement
session did not inherit that receipt. Keyboard focus and 390-pixel layout passed.
Interceptors were removed and the real empty registry restored and checked
unchanged. No real OAuth, inference, native task or Stop was performed.

[Native session documentation](reference/native-sessions.md) describes commands,
recovery and the current scope. Codex discovery was added in the later milestone
above; native task launch, streaming events and native approval integration
remain separate work.

### Keep credential edits bound to current provider evidence (10 October)

API-key settings now serialize status reads and verified mutations. A refresh
cannot overwrite an acknowledged spending-policy change, and actions require
the current status snapshot and exact credential revisions. Retained settings
are labeled as last checked while a read is pending or unavailable. An owner,
client or component-lifetime change clears the private editor and rejects late
results, including replacement back to a previously used client.

Status reads stop waiting after 15 seconds. Credential operations allow 210
seconds from the verified dispatch attempt, accommodating the existing host
180-second and Gateway 190-second limits. Host rollback can still outlast that
browser deadline. A lost response produces an unconfirmed outcome with an
explicit Check status action, never an automatic mutation replay.
Recovery reads retain the uncertainty notice and display the latest recovery
markers; they do not establish that the earlier request was canceled.

Each key-editor opening has its own identity. Closing and reopening the same
provider cannot accept a stale input, close or submit callback from the old form.
Refresh preserves an unchanged editor but clears it if its reviewed record
changes. Keys clear before verification and are not restored when verification
is canceled. Payment-policy recovery, credential recovery and exact-revision
guards remain server enforced; this slice changes no server contract.

The full gateway suite and independent credential, provider-control and dispatch
checks passed. The 13 dispatch groups cover all eight credential operations,
unchanged verified bodies, secret-free confirmation descriptions, validation
before dispatch and no POST replay. Controller and actual-component tests cover
the original stale-read race, double submission, read and write deadlines,
verification cancellation, client/owner A-to-B-to-A, synchronous teardown,
same-provider editor reopening and policy-recovery controls. Independent focus
checks cover the current opener, fallback target, newer dialogs and owner scope.

Rendered browser checks passed for slow status reads, failed writes followed by
explicit recovery, editor cancellation, and owner-verification cancellation from
both Save key and keyboard submission. The key clears and focus returns to the
current action. A temporary focus observer now disconnects immediately after
recovery. Desktop/mobile light/dark screenshots were inspected; the shorter
Check status label preserves readable mobile header spacing. Final TypeScript,
affected ESLint, the design guard (419 sources) and the focused regressions passed.
The production build verified 169 assets and a 604,837-byte entry beneath the
unchanged 700,000-byte cap, with no development fixture chunk. Gateway and Pi
are healthy; Pi remains clean and unchanged at `33254f1`. Native CLI status reads
still report both subscription runtimes available and signed out, with model
configuration and recorded work counts unchanged.

Served-app acceptance intercepted one paid-policy mutation and one synthetic
owner proof. The failed write was not repeated; explicit status recovery showed
the current policy and retained the unconfirmed-outcome notice. A later failed
read disabled actions and labeled retained settings, then keyboard recovery
restored current evidence and focus. Desktop and 390-pixel mobile screenshots
were inspected without overflow. Interceptors were removed, the real Providers
page restored, and real provider status compared unchanged before/after. No real
credential, spending-policy or hosted-inference operation was performed.

### Recover subscription operations without repeating them (10 October)

ChatGPT and Claude Code connection cards now distinguish current status, owner
verification, provider work and an unconfirmed outcome. A failed status read no
longer leaves Connected or Checking on screen. Read-only recovery is available
after a lost operation response; it retains a notice that the earlier request
was unconfirmed and never repeats login, cancellation or logout automatically.

Status reads have a 15-second deadline. Provider operations have 75 seconds after
verification, allowing for the host's existing 70-second Codex control timeout.
The local dispatch callback stays outside the transport and wire payload; waiting
for or canceling password verification never starts that clock or sends the
operation. Session and abort checks run on both sides of the callback.

Each card fences client, owner, login identity and component lifetime changes.
Slow sign-in checks run serially, three seconds after the previous read finishes,
and stop after 20 automatic reads until the owner checks again. Hidden or offline
pages pause them. Same-login device codes and controls stay mounted during checks
and visibility pauses, with last-checked status labels and guarded actions.
Actual failed reads, identity changes and teardown clear private sign-in content.
Keyboard recovery is scoped to the original action and does not move focus out
of another control or an open verification dialog.

Independent review cleared the nine-group dispatch boundary suite and shared
controller/real-card recovery coverage, including owner/client A-to-B-to-A, a
late login response after replacement, exact cancellation identity, bounded
polling, same-login code retention, failed model-catalogue projection and teardown
during synchronous state publication. Provider, authentication and verification
compatibility suites also passed. Native runtimes and server authority are unchanged.

The full gateway regression suite, TypeScript, affected ESLint and the design
guard (415 reachable sources) passed. Actual verification-dialog cancellation
and submission, slow polling with selected code text, keyboard recovery and
failed Claude status recovery passed in the isolated browser. Desktop dark and
mobile light screenshots were inspected. The local production build verified
169 assets with a 604,822-byte gateway entry, beneath the unchanged 700,000-byte
cap, and excluded development fixtures. Gateway restarted healthy; the healthy
Pi checkout remained unchanged at `33254f1`. Read-only CLI status checks returned
both native runtimes available and signed out, with model configuration and
recorded work counts unchanged.

Served-app acceptance intercepted one Claude operation and synthetic owner proof,
held the response through the real dispatch deadline, and observed the uncertain
state about 79 seconds after verification submission. No operation or recovery
read was automatically repeated. Explicit keyboard recovery retained focus and
the unconfirmed-outcome notice; the late operation response could not replace
the recovered pending status. Desktop and 390-pixel mobile screenshots were
inspected without overflow. Interceptors were removed and the real Providers
page restored. No native OAuth operation or hosted inference was performed.

The API-key panel then exposed the same class of lifecycle gaps: an old refresh
could overwrite an acknowledged spending-policy change, unresolved operations
could strand controls, and a mounted client replacement retained unsent keys.
The later credential-recovery slice above addresses these cases.

### Report provider readiness without stale success (10 October)

Providers now distinguishes checking, current and unavailable runtime evidence.
Failed or pending reads remove Ready labels; retained provider/model names are
explicitly last checked. Reads settle within 15 seconds and offer a manual retry.
The retry button retains keyboard focus during a check and rejects duplicate
activation. Authentication, client replacement and teardown discard late results.
The Runtime row uses fresh health evidence independently of each subscription
connection card.

Refreshing readiness preserves unsaved model choices. Model-catalogue reads also
have a deadline and retry; a late read cannot overwrite a newer saved revision.
Retired clients, including returning to the same client object, cannot restore
old catalogues or strand the editor in a saving state. Duplicate saves are fenced
before React renders; uncertain writes are never automatically repeated.

OpenRouter catalogue observations now report inference as unverified. Cached,
empty and paid-only catalogues are not response receipts. An empty catalogue no
longer triggers an unnecessary second request; failures retain provider identity
and payment policy so the unavailable row stays visible. The generic module
health contract projects unverified hosted readiness as unknown, with its existing
degraded aggregation. Explicit Setup activation still performs one bounded test,
records its configuration-bound receipt and replays that receipt without another
dispatch. Paid-model guards and failed-test selection preservation are unchanged.

All 156 affected backend cases passed, including 19 new readiness regressions.
Two older direct-provider loop fixtures failed identically on the unchanged base
because they mocked the previous HTTP transport. A separately reviewed test-only
commit now exercises the real streaming parser, usage recording, cancellation
token and transport cleanup, with guards against escaped network requests. All
25 direct-provider cases pass independently. Ruff and diff checks pass; fresh and
repeated installation reproduce all 103 reviewed Pi files.

The full dashboard gateway suite, focused provider suites, TypeScript, affected
lint, 409-file design guard and production build passed. Independent review and
desktop/dark and mobile/light previews verified keyboard retry and model-draft
preservation. Served-UI browser-only acceptance then confirmed the real 15-second
deadline, four explicit readiness reads, zero model writes, retained keyboard
focus, visible unverified/unavailable hosted rows and no mobile overflow. All
interceptors and the temporary unsaved edit were removed afterward.

The local rollout retained database and previous-asset checkpoints. Pi and
Gateway are healthy; all 169 served assets match the build and the entry is
604,639 bytes under the unchanged 700,000-byte limit. The subsequent test-only
revision changes no running application code. Read-only CLI acceptance confirms
model settings and recorded work counts are unchanged. Live hosted inference has
not been claimed: this installation has no OpenRouter credential and its native
subscriptions remain signed out.

The separate subscription-card recovery defects discovered during this milestone
are resolved by the later recovery milestone above.

### Preserve inherited privacy and reliable Think cancellation (10 October)

Reviewed forks now retain the immutable privacy restrictions of carried messages,
including old summary-only descendants that lost those flags in stored settings.
Effective reads protect legacy children without rewriting their settings or saved
execution evidence. Unsafe frozen submissions, turns and context replay are
refused; fresh turns use the narrowed policy. Queued memory ingestion honors
inherited memory exclusions, while harness-only restrictions and deletion delivery
keep their independent behavior.

Ancestry reads are bounded to 256 sessions in one snapshot and inspect only carried
immutable message flags. An ancestor's own historical messages or later privacy
settings do not narrow an ordinary descendant's future policy. Missing, forgotten,
cyclic or over-limit ancestry is unavailable. All seven child-creation paths reject
an over-limit child atomically, without leaving orphan chats, calls, team records
or fork receipts. Dropping exact pins does not remove the inherited restriction
from a linked summary; an independent new chat has no such inherited context.

Cancel thinking now belongs to one specific analysis. Each cancellation and status
read has a 15-second deadline; an uncertain outcome offers a read-only status check
without repeating the cancellation. A stalled older request cannot disable a newer
Think request, publish its error there, or overwrite newer findings. Authentication,
selection, workspace, forgetting and teardown boundaries discard late responses.
Talking and saved drafts remain independent. Keyboard recovery retains focus on
the resulting status, and Settings now accurately says another Think request
replaces analysis while ordinary talking preserves it.

Validation passed 252 distinct backend cases: 52 new regressions and 200 affected
compatibility tests. Independent review cleared inheritance, recovery, ingestion
and all creation paths. Two stale test assertions were reproduced on the prior
clean revision and corrected for existing memory-delivery metadata and safe
unavailable-tool refusal; product behavior was not changed for those assertions.
Ruff, formatting and diff checks pass. Fresh and repeated installation reproduce
101 reviewed Pi files.

The full dashboard gateway suite passed, followed by focused tests and review for
the final keyboard-focus change. TypeScript, affected lint, the 407-file design
guard and production build pass. Desktop/light and mobile/dark fixture checks
verified the real timeout, draft preservation, available Send and keyboard recovery.
The local rollout retained database and prior-asset checkpoints; Pi and Gateway are
healthy, all 169 served assets match the build, and the entry is 604,627 bytes under
the unchanged 700,000-byte limit. Served-UI browser-only acceptance confirmed one
cancellation followed by one status read, unchanged draft/navigation, retained
focus and no horizontal overflow. No model work or real cancellation was started.
Read-only live search still returns ten permitted exact matches and two metadata
matches, with model and search settings unchanged.

The README and four core guides now describe the connected chat app, current model
roles, drafts, memory receipts, native runtime boundaries and local installation.
They no longer present aspirational guarantees or working Agents/Schedules screens
as disconnected previews. Independent accuracy review and 38 local-link checks
passed. This remains a local milestone, not assembled Linux release acceptance.

### Enforce forgetting at the shared source boundary (10 October)

The shared source-privacy policy now checks the authoritative forgetting ledger
before projecting session settings. An inconsistent legacy status cannot restore
a forgotten origin. This fixes verified retained-origin leaks in global activity,
continuity/notifications and project-source resolution. Existing public, private,
archived and missing-source behavior stays intact; no schema or authority changes
are involved. Tasks and copied artifacts already had their own ledger checks.

All 139 distinct affected cases passed, including 13 new shared-caller regressions.
Independent review reran those 13 cases and cleared the change; lint and formatting
checks passed. Fresh and repeated installation reproduce 94 reviewed Pi files.
The local backend rollout retained database backups, kept all 169 dashboard assets
unchanged and passed Pi/Gateway health checks. Read-only search acceptance still
passes without changing model or search settings.

The separate reviewed-fork inheritance defect identified here is resolved by the
later inherited-privacy milestone above, including legacy execution and ingestion.

### Keep Unicode and long literal search matches visible (10 October)

Search previews now translate case-folded match positions back to the original
text. Expanding characters such as sharp-s, ligatures and dotted-I no longer move
the preview away from its match. A global exact result is retained when the full
message matches even if its bounded preview cannot contain the entire query.
The source proves literal containment with `instr`, avoiding SQLite `LIKE`'s
embedded-null false matches. Privacy, ordering, cursor and response contracts remain
unchanged. Preview limits remain 500 characters for direct search and 400 globally.

All 67 focused search/privacy cases passed, including 19 new regressions; an
independent reviewer reran those 19 cases and cleared the implementation. A measured
ASCII fast path avoids an added character walk: the local 65,006-character sample
took about 0.04 ms per preview versus 3.6 ms without that fast path. This is a helper
microbenchmark, not an end-to-end search latency claim. Lint and formatting pass.

Fresh and repeated installation reproduce 93 reviewed Pi files. Local Pi/Gateway
are healthy after rollout with database backups retained and all 169 dashboard
assets unchanged. Read-only live search still returns the expected permitted
conversation matches; model and search settings remain unchanged. Unicode edge
cases were verified through isolated database and HTTP-route tests rather than
adding synthetic long messages to the owner's history.

### Apply conversation privacy consistently during search (10 October)

Exact-message search now applies the same current settings, legacy setup defaults
and immutable private-origin policy as conversation metadata. The authoritative
forgotten-session ledger excludes inconsistent legacy rows. These checks precede
pagination, so private candidates cannot hide older permitted results. Cursor,
privacy and message reads share one snapshot; SQL returns at most 51 rows and the
per-search policy cache is bounded to 256 entries. APIs and cursor formats remain
compatible.

Global search now clears record results and cursors immediately when forgetting
is discovered. Late settings, result and pagination responses cannot restore them;
known forgotten session identities remain masked in fresh responses, and record
activation rechecks current state. Query and focus survive this refresh. Opaque
derived records rely on a fresh source eligibility check. Auth/workspace identity
changes close search and clear it. Whitespace edits no longer strand a request,
and read deadlines expose explicit retry while keeping page commands available.

Backend verification passed 80 distinct search/settings/forgetting cases, including
10 new privacy cases and an independent rerun of those cases. Installation is
repeatable across all 91 reviewed Pi files. New executable search-lifecycle cases,
existing search checks, the full gateway suite, TypeScript, affected lint and the
405-file design check passed. Independent code review and isolated desktop light/
mobile dark checks passed. Live checks verified ten exact matches and two metadata
matches against permitted source identities without changing model/search settings.
Browser-only stale-result injection verified immediate masking with query/focus
retained. Live keyboard testing caught competing Enter handlers: Retry also selected
the highlighted page. Footer Enter now preserves native button activation while
blocking that competing command. Isolated regression checks require a successful
recovery response, unchanged URL, retained dialog and focused search input; they pass.

The final local build publishes 169 manifest-verified assets with a 604,606-byte
entry, below the unchanged 700,000-byte guard. Pi and Gateway are healthy, with
prior assets and database backups retained. Live mobile keyboard retry confirmed
both successful settings/result responses, unchanged navigation, an open dialog
and restored input focus. No horizontal overflow was present. The browser returned
to desktop dark, and the model/search configuration remained unchanged.

### Find older chat metadata in global search (10 October)

Global search now matches retained conversation titles and summaries before its
200-result allowance. Private and forgotten matches do not consume that allowance;
the forgotten ledger also excludes inconsistent legacy rows. Coverage is partial
only when more than 200 eligible matches exist, not merely because the database
contains more than 200 chats. A single indexed read snapshot streams candidates
without materializing the full history. Existing exact-text search, ranking,
response fields and pagination remain unchanged in this slice.

All 38 focused backend cases passed, including 25 new regressions, alongside
independent review and lint. Fresh and repeated installation reproduce 89 reviewed
Pi files. Frontend search checks, affected lint, TypeScript and the design/build
guards passed. Settings now describes bounded results without incorrectly claiming
all sources search the same recent-record window. Other sources retain their prior
scan limits, and incomplete-coverage and ranking notices remain visible.

Pi and Gateway are healthy after local rollout. All 169 published assets match the
staged manifest; the entry remains 602,046 bytes. Prior assets and database backups
are retained. A live browser metadata query reported searched conversation coverage
and preserved focus. Browser-only partial/unavailable responses retained their
coverage notice. Desktop and mobile settings screenshots were inspected.

The subsequent privacy milestone above aligns exact-message eligibility and clears
open global results when forgetting is discovered.

### Browse and search older chats from the UI and CLI (10 October)

Chats now reads a compact, paged directory instead of filtering the recent 200
records. Search checks full titles and summaries before pagination; each response
contains at most 50 clipped previews and a query-bound cursor. Literal Unicode
matching, deterministic creation order, strict query validation and a 256 KiB
response bound keep reads predictable. The original recent-list API is unchanged.
The CLI exposes the same directory through `sessions --limit`, `--query` and
`--cursor`, with validation before network access and safe read errors.

Loaded pages are explicit snapshots. Load older extends them; Refresh chats starts
a fresh chain. Shared recent discovery offers a new-chat notice without rewriting
loaded pages. Search stays mounted through loading and errors, refresh failures
retain rows, and auth, workspace, privacy, cursor and offline boundaries reject
stale reads. Forgotten entries are masked before publication. Long unbroken
summary previews now wrap within the shared collection row on mobile.

Validation passed 99 distinct backend cases, including 34 new history/listing
cases, and 89 CLI/history/draft cases, including 27 new CLI cases. Fresh and repeated
installation reproduce all 87 reviewed Pi files. TypeScript, affected lint, the
403-file design check, focused directory/discovery/observation/navigation/runtime/
workspace/boundary checks and independent reviews passed.

The local rollout retained database backups and the previous build. Pi and Gateway
are healthy; all 169 published files match the staged manifest, and the 602,046-byte
entry remains below the unchanged 700,000-byte limit. Real CLI reads verified two
nonoverlapping pages and title search without returning full summaries or changing
model settings. Live desktop dark and mobile light checks verified server search,
retained results after browser-only 503 errors, visible recovery and keyboard retry.
Isolated UI checks covered 50-to-100-row paging and long summary wrapping; the live
database contains eight visible chats. Screenshots were inspected.

The subsequent metadata-search milestone above removes the separate global-search
recent-metadata limit. Exact-search privacy alignment remains a distinct slice.

### Discover CLI-created chats across the workspace (10 October)

The sidebar, Chats collection, chat header and open-view titles now share one
authenticated recent-list controller. It reads while visible and online every
15 seconds, with immediate focus/reconnect and local-operation refreshes.
Requests are serialized; a refresh requested during an older read waits for one
fresh successor. Deadlines, bounded backoff and authentication/workspace/privacy
checks reject late results and settle interrupted callers.

Background list updates preserve existing rows, search and keyboard focus.
Failures show the retained list and a keyboard-accessible Try again action.
Forgotten records enter the shared privacy boundary before publication. Absence
from the newest 200 chats never means deletion or closes a tab; open views keep
navigation identities without a separate private title cache. Sidebar approval
checks remain independent of this list loop.

Pi now indexes the existing creation-time list query, eliminating its temporary
sort without changing response shape, ordering or limits. All 34 relevant backend
tests pass, including actual query-plan checks, tied timestamps and repeated
old-database migration. Fresh and repeated installation reproduce 85 reviewed Pi
files. Frontend discovery, observation, navigation, workspace, boundary and draft
checks pass alongside TypeScript, affected lint, the 400-file design check and
independent review.

The local rollout preserved database backups and the previous build; Pi and
Gateway are healthy. All 168 published files match the staged manifest, and the
601,126-byte entry passes the unchanged 700,000-byte limit. One genuine CLI-created
empty synthetic chat appeared in the sidebar and filtered Chats collection
without navigation or manual refresh. Search focus and an unsent draft survived;
the observed browser interval contained only three shared list reads. Browser-only
503 simulations retained rows/search and recovered through keyboard retry on
desktop dark and mobile light. Screenshots were inspected, no mobile overflow was
present, and the original theme and empty QA draft were restored.

The subsequent paged-directory milestone above removes this slice's browsing and
title-filtering limit while retaining shared recent discovery for navigation.

### Keep open chats synchronized with CLI work (10 October)

A persisted, content-free session counter now detects external work even when a
turn starts and finishes between browser reads. Preparation, saved messages,
turns, tool actions, background thinking, response selection and forgetting
advance it in their own transaction. Forked requests also update the original
chat's counter when the destination turn changes. Existing databases gain the
counter without replacing history, and restarting does not reset it.

The visible chat checks this metadata while idle and active, loading saved
history only after a changed counter. It keeps the counter from before the
history read, so concurrent writes cannot be acknowledged without being shown.
Updates preserve the draft and saved uncertainty; they do not send, retry,
resume or navigate to a fork. Hidden/offline views and local sends pause the
observer. Read failures back off and expose a Check now action.

Manual history reads and background observation share invalidation boundaries.
Switching chats, changing authentication, resetting the workspace or forgetting
a source rejects late responses. Initial history still shows loading, while
routine observation leaves the composer usable.

Backend validation covers 128 distinct cases, including 23 new observation tests,
with lint and two independent reviews passing. Two older forgetting assertions
were reproduced as failing without observation enabled, then corrected to verify
the complete memory-delivery metadata already returned by the previous release.
Fresh and repeated installation reproduce all 84 reviewed Pi files.

Frontend parser, controller, hook-lifetime and manual-read executable checks pass,
alongside TypeScript, affected lint, the 397-file design check and existing
runtime/workspace/navigation/boundary/draft checks. Both published builds match
their staged 168-file manifests; the final 598,129-byte entry passes the unchanged
700,000-byte limit. Pi and Gateway are healthy, with prior builds and database
backups retained.

A genuine CLI turn in the selected synthetic QA chat appeared automatically in
the browser. Its unsent draft survived and Send unlocked; the turn completed
without actions or model-configuration changes. During the observed interval the
browser made 14 metadata reads and three full-history reads, with no submission,
resume or cancellation requests. Browser-only 503 simulations verified recovery
through Check now. Desktop dark and mobile light inspection caught and fixed an
offscreen delayed-update notice; it now remains above the history scroller.
Keyboard recovery works, mobile has no horizontal overflow, and the synthetic
draft was cleared after verification. The browser's original theme was restored.

This slice watches the selected conversation. The subsequent shared-discovery
milestone above also finds newly created CLI chats while navigation stays idle.

### Reuse routing decisions and preserve working builds (10 October)

Identical primary Laya routing requests can reuse a successful choice within one
uninterrupted foreground attempt. Exact input, configuration and adapter identity
must match, and current cancellation and eligibility checks still run. Steering,
recovery, later turns, background thinking, failures and helper fallbacks cannot
inherit the result. Receipts identify reuse without adding inference timing or
usage. Synthetic one- and two-tool turns now make one classifier call instead of
two or three. The corresponding usage ledger counts only real calls.

Ollama's reported cached prompt tokens now reach Completion and usage receipts.
Known zero is preserved; absent or malformed values remain unknown. A separate
two-request synthetic diagnostic with a 32-token output cap measured 31.7 seconds
cold (8.0 seconds loading, 21.5 seconds prompt evaluation), then 3.2 seconds on an immediate repeat with
529 of 530 prompt tokens cached. This explains the exercised latency, not broad
performance or quality. No model configuration or model-residency policy changed.

Workspace builds now require Gateway to be stopped, compile into an isolated
checkpoint, and run the existing design, type and production guards there. A
separate copy is verified before moving served assets. The last build is retained
and restored if publication fails. If Windows also blocks restoration, the serving
path is absent and startup refuses it; no partially copied frontend is served.
Independent concurrent launcher invocations remain outside this change's guarantee.

Validation: 124 routing/usage/steering/recovery/thinking tests and 42 cached-usage
and streaming checks pass. Build and launcher coverage includes 37 tests, including
copy failures, blocked publication/restoration, startup during compilation and
the actual Node bundle guard's fixture and 700,000-byte limits. The final build
subset has 14 tests; lint and independent review pass. Routing evidence passed
10 frontend checks plus TypeScript, affected lint, design and desktop/mobile
keyboard/visual review in both themes. Fresh and repeated installation reproduce
all 82 reviewed Pi files.

The local rollout exercised the new workspace build command and verified all
168 published files against its staged output. The 597,608-byte entry passes the
unchanged production limit, and prior assets and SQLite backups remain available.
Pi and Gateway pass health checks. A live Automatic greeting selected local-fast
with one routing and one answer call, no fallback, action or background thinking,
and model configuration still at revision 1. Its answer reports 640 input tokens,
24 output tokens and a known zero cached tokens. The two calls took 47.5 seconds
combined, including a 6.9-second Laya decision. Cold local latency remains a
measured limitation; this is not a broad speed or routing-accuracy claim.

### Routing cancellation, accurate receipts and mobile focus (10 October)

Stop now interrupts the exact connected routing request, including the wait before
response headers and a partial response body. Late results cannot start an answer
or fallback. Connection setup before a socket handle exists still follows its
phase timeout, and disconnecting does not stop Laya's already-running computation.

Configured model choices no longer falsely report escalation. Responses separate
selection evidence from unavailable attempts, expose whether a fallback was used,
and preserve existing saved receipt formats for history, retries and thinking.

The mobile sidebar keeps its opener mounted and returns keyboard focus after
dismissal. Destination actions hand focus to main content. Deferred restoration is
fenced against another dialog, a newer opening, or an unmounted/replaced workspace.

Validation: 32 decision cancellation/provider/role tests, 48 routing receipt checks
and 55 additional routing, legacy loop, usage and foreground cancellation checks
pass. Runtime changes received independent review. Three separate synthetic local
routing measurements took 6.48, 1.32 and 1.29 seconds; they establish neither broad
classification accuracy nor a performance improvement. The decision-service guide
now describes the current bounded input, fallback policies and measured limits.

Frontend navigation/lifecycle checks, workspace primitives, TypeScript, affected
lint, design checks and all 407 source-module reachability checks pass. Chats,
Inbox and search settings were reviewed at desktop/mobile sizes in both themes.
Keyboard checks include returning to the composer and restoring Search after a
sidebar opened above it. The final production entry is 597,608 bytes; the unchanged
700,000-byte guard passes and the build contains no fixture chunk.

Fresh and repeated installation reproduce all 79 reviewed Pi files. The local
runtime and frontend are updated, with SQLite and previous-asset checkpoints;
Pi and Gateway pass health checks. Windows initially blocked the staged directory
move, so the prior frontend was restored before a verified 168-file asset copy.
A live Automatic request cancelled in 422 ms after Stop, with one routing attempt
and no answer, fallback, action or thinking call. A separate manual local-fast
reply confirms accurate selection evidence, no escalation and no fallback; its
one answer call took 34.6 seconds. The saved model configuration remains at
revision 1. Slow local generation remains unresolved.

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
