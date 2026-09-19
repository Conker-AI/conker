# Conker chat delivery plan

Written September 19, 2026. Status: **frontend milestone delivered and checked**. See the [acceptance ledger](chat-delivery-progress.md) for commits, browser evidence, test coverage and verification limits. Real service integration and the explicitly deferred projects remain outside this milestone.

This is the bounded delivery plan for the next conversation-UI milestone. It turns the [research catalogue](ai-chat-ui-inventory-2026-09-19.md) into ordered work, not a commitment to build all 160 items. The larger [visual control workspace proposal](workspace-control-plan.md) remains separate.

## Target

Make the existing Conker chat feel complete: rich answers, reliable conversation continuity, understandable execution previews, and restrained character motion. Preserve the compact full-width shell, semantic theme colors, shared components, calls, two-switch Incognito and established feature placement.

Frontend only. All conversation data and simulated execution remain behind `ConkerClient`. Local interactions must work; service-backed capabilities must accurately disclose preview/unavailable status. No live backend, durable worker, microphone recording, publishing, paid model run or deployment is implied by this plan.

## Already complete — preserve rather than rebuild

- Small bottom-center activity/arrow control; jump to latest and manual reading-position preservation.
- `ConversationRun`: working duration, completed/stopped history, expandable public steps and recorded tool evidence.
- Immutable activity snapshots through `ReplyOptions.onActivity`; activity stays with responses, copies into forks, and is cleared on edit/redaction.
- Focus orb, Character thinking artwork with fallback, reduced-motion and hidden-tab handling.
- Existing composer, model catalogue, draft, reply, retry, message actions, call and source/detail surfaces.

Baseline activity commit: `a2d71f5d`. Research tables describe their audit-time baseline; inspect current code before accepting any “Missing” label as a new task.

## Step 0 — establish the acceptance ledger

Owner: coordinator.

1. Read dashboard `AGENTS.md`, `DESIGN.md`, design language and relevant contracts. Check current branch, local changes and serving process; preserve unrelated work.
2. Inspect the running app and map each package below to current code. Mark already-working features as preserve, planned features as add, and deferred features as later.
3. Record the target files, acceptance cases, dependency order and baseline failures. Never weaken a check to hide an existing failure.
4. Create a progress ledger with Pending / Building / Review / Verified / Blocked states and links to commits, tests and screenshots. “Implemented” alone is not Verified.

Exit: one finite scope and test matrix. No new product screens or palette redesign hidden inside implementation.

## Step 1 — settle shared data and behavior

Owner: coordinator, with review from the continuity and rendering agents.

- Extend the existing message types only where needed for source references, attachments/artifacts, retry groups and turn/run identity. Keep current plain-text messages compatible; do not force every answer into a bespoke document format.
- Define source identity separately from generated prose. Missing citation metadata must not create a fabricated URL or publisher.
- Define stable response-family and version IDs, the active context branch, and how fork/edit/redaction affect that branch.
- Define queue entries as a snapshot of text, reply target, agent, privacy scope and selected model/options; editing a draft or later switching models must not silently rewrite an already queued request. Revalidate this snapshot before dispatch; it cannot preserve authority that has since been revoked.
- Retain transport-provided activity and explicit preview provenance. Public summaries, observed actions and character expression remain distinct.
- Keep reload behavior explicit: this milestone uses the app's memory-only fixture lifetime. Do not add browser persistence for private transcripts or media as a convenience.

Exit: agreed TypeScript contracts and behavior examples. Coordinator owns shared contract changes so agents do not independently invent incompatible state.

## Step 2 — render useful answers

Owner: rendering agent. Catalogue coverage: G01–G05, F02–F05, M01–M05, M15.

1. Introduce one shared answer renderer for finished and streaming responses.
2. Support headings, paragraphs, ordered/unordered lists, emphasis, links, quotes and inline code.
3. Add code blocks with language labels, syntax highlighting, Copy feedback, download and collapse/expand. Copy and download preserve original code, not decorated display text.
4. Add readable tables with local horizontal scrolling, Copy as Markdown/CSV, CSV download and an expanded view through an existing shared dialog/workspace pattern.
5. Render inline/display mathematics, with a readable source fallback when a formula is malformed or incomplete.
6. Add citation controls linked to actual supplied source IDs, a compact preview, and the existing source rail. External links and unavailable sources have clear behavior.
7. Preserve message-level copy, edit, fork, rating and read-aloud. Read-aloud uses readable content rather than raw markup or control labels.

Implementation constraints: use maintained rendering libraries after checking their current primary documentation. Disable arbitrary raw HTML execution; validate link protocols; keep generated SVG/HTML/script execution out of this package. Escape CSV correctly and prevent formula execution when exporting untrusted cells. Avoid fetching arbitrary remote images automatically without a defined media policy.

Exit: long code/tables do not widen the page; partial streaming syntax cannot crash or destroy the thread; rendered text, clipboard output and exports agree; keyboard and mobile block actions work.

## Step 3 — queue the next turn safely

Owner: continuity agent; coordinator integrates changes to the shared composer/workspace. Catalogue coverage: D14 and the queue interpretation of D13.

1. While a response runs, let the user explicitly queue another message. Keep Stop available and distinguish Queue from Send.
2. Show a compact ordered queue above the composer with edit, remove and pause/resume controls. Bound its size and provide an understandable limit state.
3. Send one queued turn at a time, in order, after successful completion. A queued turn is not a mid-run instruction and must not be presented as steering the active run.
4. Stop, provider failure or an unresolved approval pauses automatic advancement. Preserve unsent entries and require a clear Resume action.
5. Route changes preserve each conversation's queue. A queue never switches agent, conversation, model or privacy scope silently.
6. Archive/delete/handoff/privacy changes and model disablement have explicit queue rules. Pause for review when the captured context is no longer valid; do not silently retarget or discard queued work.

Exit: no duplicate sends, lost drafts, cross-chat leakage or surprise next turn after Stop. Editing/removing an entry during streaming works, and a failed send retains the entry with a retry path.

## Step 4 — make retries and branches understandable

Owner: continuity agent, after Step 3 state transitions are integrated. Catalogue coverage: E02–E04, E10, K01–K04.

1. Group retries as response versions with Previous / Next and an index. Retain each version's model, activity and stopped/error metadata.
2. Retry with another model preserves earlier output. Retrying an earlier turn uses that turn's context boundary, not later messages.
3. Clearly distinguish viewing an old version from continuing the conversation from it. If later turns exist, an explicit fork creates an alternate continuation; switching the visible version does not silently rewrite history.
4. Editing an earlier submitted message must explain its branch consequence. Preserve downstream history through an explicit fork/version policy instead of making later replies appear to answer edited words they never saw.
5. Keep partial output after Stop. Retrying response text never replays a completed external action.
6. Offer appropriate error states for fixture scenarios: failed request, unavailable model, disconnected service and interruption. Do not claim real reconnect/resume support.

Exit: versions, forks, citations, activity and authors remain correctly associated; selected branch context is deterministic; deletion/redaction cannot expose hidden text through another preview or stale cache.

## Step 5 — extend execution detail using honest fixtures

Owner: execution agent. Catalogue coverage: B02–B06, B08–B15, A07–A09 and plan/source presentation in F07–F09.

1. Extend the existing run disclosure; do not build a second thinking toolbar.
2. Supply deterministic fixture scenarios for search/read, running/completed/failed tool calls, waiting for an Inbox decision, commentary, public reasoning summaries and unavailable summaries.
3. Add named subagent lifecycle, parent/child references and handoff events, with a compact list and contextual inspector. No large graph editor in this milestone.
4. Show step timings, sanitized inputs/results and actionable failure context. Group repetitive steps and bound large logs so long runs remain usable.
5. Add updating plan/checklist previews and changed-file/deliverable receipts only when the fixture supplies an actual referenced result. Download links must resolve to a real local fixture asset; diff counts must match the supplied diff.
6. Reuse Sources/Info and the existing right rail; approvals link to Inbox. Missing evidence gets an unavailable state instead of a fake success.
7. Keep simulation controls in the development/fixture test surface, without littering the everyday composer with demo toggles. Normal chat must not randomly pretend to search, delegate or execute commands.

Exit: every label follows supplied events; a stopped parent has coherent child states; no endlessly running orphan steps; repeated/out-of-order updates cannot duplicate evidence or regress a completed state. The screen clearly distinguishes simulated runs from connected services.

## Step 6 — refine character microinteractions

Owner: execution agent after Step 5; review by coordinator. Catalogue coverage: L01–L06, L08.

1. Map valid activity states onto the existing Character Studio media slots and neutral fallback. Retain the Focus orb.
2. Add restrained transitions between idle, working, waiting and completion; one brief completion transition, then quiet.
3. Preserve complete padded artwork. Do not squeeze detailed full-body art into an unreadable icon or replace the user's portrait.
4. Keep labels legible without animation. Reduced motion, hidden tabs and disabled character motion suppress decorative movement without hiding functional status.
5. Fall back gracefully when media is absent or fails. New emotion art is optional, not a dependency for a working interface.

Exit: no invented emotion inference, random activity labels, perpetual celebration or competing animated indicators. Kimi/Z.ai remain references for a later visual-depth pass; this step preserves the current palette and layout.

## Step 7 — integrate and independently review

Owner: coordinator; a finished agent rotates into independent review of work it did not implement.

Integration happens after every package, not only at the end. Review the actual diff and task flow, resolve shared-file conflicts, run relevant checks, and commit verified increments. Browser control belongs to one agent at a time so tests cannot change each other's route, theme, draft or viewport.

Required scenario matrix:

| Area | Acceptance cases |
| --- | --- |
| Answers | Plain/long text, partial Markdown fences, malformed math, wide tables, code copy, CSV escaping/formula safety, unsafe links, absent citations, empty content |
| Turns | Send, stream, stop before/after first text, failed send, retry/model retry, version switch, fork earlier turn, edit, redact |
| Queue | Multiple entries, edit/remove, full queue, pause/resume, stop/error halts advancement, route-away, two conversations, disabled model, changed agent/privacy |
| Activity | Preparing, writing, tool success/failure, approval wait, subagent lifecycle, unavailable summary, large receipt, late/duplicate events, no fabricated evidence |
| Scroll | At bottom, reading older content, completion while scrolled away, expanding a result, jump-to-latest, source anchor, late rich-content resize |
| Appearance | Desktop, narrow mobile, light/dark, existing nondefault theme/radius, expanded/collapsed sidebar and inset layout; complete portraits |
| Access | Keyboard menus/disclosures/dialogs, focus restoration, screen-reader phase announcements without token/timer spam, reduced motion, usable touch targets |
| Regressions | Companion and ordinary chat, Incognito's two toggles, model selection, existing calls and dictation entry points, source/usage rail, Chats/Inbox navigation |

Validation: `npm run build`, `npm run design:check`, affected-file lint, `npm run check:conversation`, plus relevant existing call/voice/character/theme/navigation checks when those paths are changed. Add focused tests for new state-machine and data-boundary behavior; avoid tests that merely mirror markup. Capture and inspect desktop/mobile screenshots and check the console after a clean load. Update DESIGN.md and the implementation ledger/catalogue from verified behavior, keeping research evidence separate from implementation status.

Use bounded visual passes: inspect the complete implemented package, fix observed defects together, confirm them once. Repeat only for a new change, failure or unresolved concern. Do not turn polish into an unlimited redesign loop.

## Delegation and execution order

Four concurrent slots are available: coordinator plus up to three workers. These are roles, not a requirement to keep idle agents alive.

| Role | Owns | Must coordinate |
| --- | --- | --- |
| Coordinator | Scope, shared contracts, integration, acceptance ledger, commits, final browser review | Shared conversation/composer/workspace and client-boundary edits |
| Rendering agent | Rich response components, block controls, rendering fixtures/tests | Message/source contract; no independent package/lockfile churn |
| Continuity agent | Queue/variant helpers, focused tests, UI components | Composer integration and active-branch rules |
| Execution agent | Run detail components, fixture scenarios, character-state mapping | Run contracts, rail destinations, existing media slots |

Wave 1: coordinator settles Steps 0–1; workers can inspect bounded areas and return proposals without conflicting edits.

Wave 2: Steps 2, 3 and 5 can proceed independently against the agreed contract. Each assignment names its owned files, dependencies, acceptance cases and forbidden scope. Only one owner edits a shared file or dependency lockfile at a time.

Wave 3: continuity proceeds to Step 4; execution proceeds to Step 6. Coordinator integrates completed packages and rotates available workers into independent reviews. The coordinator checks agent claims rather than accepting “done” as proof.

Wave 4: Step 7 closes the goal. Failed checks return to a named owner with a concrete reproduction and expected behavior.

## Completion, blockers and handoff

The goal is reached only when every in-scope package is Verified, required checks pass, screenshots have been inspected, and no known blocking defect remains in the agreed matrix. “Frontend complete” means the stated local interactions and preview scenarios work; it never means an absent backend is connected.

Continue autonomously through implementation, repair, integration and verification once the owner supplies the goal. Do not ask for permission for routine reversible frontend edits already within that goal. Ask only for a genuinely missing decision, unavailable user asset/access, or consequential action outside that scope; continue independent work while it is pending. Respect an explicit stop/pause and platform limits. Do not create a recurring automation or promise work while the session cannot run.

Maintain a short progress record with completed work, current blockers and the next useful action so a later continuation can resume without rebuilding finished work. The final handoff includes commits, reviewed screenshots, checks, and a clear Solid / Preview / Deferred list. Never declare the goal complete just because the time or context budget is low.

## Explicitly deferred

- Building every item in the research catalogue; model-specific modes and real Search/Deep Research services.
- n8n-style workflow canvas, memory/vector graphs, agent-team editors, Docker/port/server controls and owner reauthentication backend.
- A palette/layout redesign, custom 3D character, new emotion-art pack, emotional inference, voice cloning or realtime AI call backend.
- DeepSeek mobile dictation replication until its actual mobile behavior can be inspected; preserve the existing voice UI meanwhile.
- General attachment/upload pipeline, full artifact IDE, arbitrary executable HTML/SVG previews, generated image/video services, durable cross-device history and runs.

These can become later bounded goals, without silently expanding this milestone.

## Suggested goal wording

> Complete the Conker chat frontend milestone in docs/chat-delivery-plan.md, Steps 0–7. Orchestrate subagents, implement and integrate the scoped work, fix discovered regressions, commit incrementally, and continue until its acceptance matrix passes. Preserve the current design system, shell, calls and frontend-only ConkerClient boundary. Keep all unconnected execution clearly marked as Preview. Finish with screenshots, test results and remaining backend dependencies. Do not start the explicitly deferred projects.
