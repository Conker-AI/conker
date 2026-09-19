# Conker: visual control workspaces

Planning proposal, 2026-09-19. Captures the owner's latest direction, develops the interaction model, and records architectural questions before implementation. No capabilities described here become implemented or connected by being listed. This document does not silently replace accepted ADRs or the current dashboard design contract.

## 1. Product intent

The owner wants a personal AI workspace with the control and direct manipulation of a professional editor: create things by hand, connect them, inspect their data, understand live execution, correct memory, and manage the server from one coherent dashboard. The Companion remains the conversational entrance. Workspaces expose the machinery behind it.

The audience is technically curious and comfortable with models, tools, graphs, containers and execution traces. Preserve that depth. Do not introduce obscurity simply to look sophisticated: a knowledgeable owner should immediately find the important controls, and an unfamiliar owner should have explanations and searchable commands.

The supplied references express three distinct needs:

- The large Cognee graph: explore connected knowledge and select individual records. Preserve exploration and scale, but start with a meaningful neighborhood rather than an unreadable tangle.
- The n8n editor: assemble reusable behavior, wire inputs and outputs, test individual steps, and inspect execution beside the canvas.
- The agent hierarchy: understand which agents coordinate, which resources they use, and how work is delegated.

Keep the existing semantic themes, shadcn components, full-width shell, compact controls, purposeful spacing and clear visual priority. New workspaces extend that system; they do not each invent a palette.

## 2. Vocabulary and relationships

| Object | Meaning | Holds |
| --- | --- | --- |
| Tool | A callable capability contract. Its implementation can be short or complex. | Typed inputs/outputs, implementation reference, version, effects, credential references, scopes, limits, tests. |
| Workflow / Flow | An explicit composition of steps with inspectable control and data flow. | Tool calls, transformations, conditions, decision nodes, branches, joins, bounded loops, waits, agent/team steps, error paths, input/output schema. |
| Trigger | An event that starts work. | Manual invocation, time schedule, webhook, watched event, or parent run. |
| Job | A saved trigger-to-target binding. | Target and pinned version, input bindings, time zone, overlap policy, missed-run behavior, limits, grant reference, enabled state. |
| Run | One execution instance; a workflow definition is not a run. | Root/parent IDs, target version, trigger, status, step attempts, input snapshots, outputs, timings, receipts, artifacts, errors. |
| Agent template | A reusable starting configuration. | Role instructions, suggested model routes, tool requirements, memory defaults, optional character package and tests. No secrets or automatic grants. |
| Agent | A configured persistent specialist. The Companion is the primary one. | Identity, role, instructions, model route, tool access, memory scope, grant references, optional authored character/voice. |
| Team | A reusable coordination configuration. | Roles, agent/template version references, leader or dispatch rules, handoff rules, shared/private context, budgets, concurrency, completion and failure conditions. |
| Subagent | A temporary worker created for a run. | Task, limited context and capabilities, parent run, budget, lifecycle. Appears under the run, not automatically in Contacts. |
| Session | The durable conversation context. | Participants, messages, call segments/events, forks, linked runs and source references. Multiple runs may occur within it. |
| Artifact | A produced result. | File/document/media reference, version, provenance, preview, linked producing run. |
| Memory claim | Knowledge about something, distinct from a raw transcript. | Content, sources, relationships, scope, status, time, revisions, confidence or stated provenance. |

A workflow can be published as a tool. “Tool” describes its callable interface; “workflow” describes its inspectable implementation. Do not force two independently editable copies. The tool wrapper points to a published workflow version.

Cron describes when to run. It is one trigger type, not an alternative to workflows. A workflow may be launched by chat, a button, an event, another workflow or a daily job. All produce the same kind of run record.

Teams are reusable staffing/coordination definitions; workflows define procedures. A workflow can contain a team step, and an agent can invoke an eligible published flow. Neither team membership nor connecting a node grants permission.

Template instantiation creates a configured agent with explicit overrides. Updating the template offers a diff and migration; it does not silently rewrite existing agents. Runs pin the definitions they started with.

## 3. One dashboard, explicit backend ownership

All owner-facing editors and inspectors live in Conker, including Tools. Backend ownership never means sending the owner to a separate ToolGate dashboard.

| Layer | Responsibility |
| --- | --- |
| Dashboard | Editing drafts, visual arrangements, navigation, inspection and interaction. Does not execute workflows inside the browser. |
| Owner gateway | Owner login, server-side sessions, reauthentication, scoped administrative requests and owner decisions. Owner authority stays separate from the Pi worker. |
| Pi | Conversations/calls, models, agents/teams, cognitive decisions, scheduling and correlation of overall runs. |
| ToolGate | Capability definitions, versioned workflow action contracts, deterministic action execution, secrets, grants, approvals and action receipts. |
| MemoryGate | Evidence, claims, relations, retention/deletion lineage, retrieval and derived indexes. |
| SystemGate | Observed processes, containers, ports and host health. Never shell execution or Docker mutations. |
| Owner shell service | Explicit owner-only terminal boundary, authenticated through the gateway. Separate from agent tools and SystemGate. |
| Media storage, proposed | Audio/video assets with retention and access controls, referenced by session/source IDs. Exact implementation remains open. |

There must be only one agent coordinator: Pi. A workflow agent/team/Decision step delegates cognitive work to Pi and returns a typed result to the workflow. It does not install another hidden planner in ToolGate. The callback/resume contract, root-run correlation, cancellation and nested budgets need specification before wiring these steps.

ToolGate's current workflow interpreter is a starting point, not proof of durable orchestration. Whether to extend it or adopt a durable worker internally is a separate technical evaluation. An external engine must not acquire an independent route around action policy.

Owner actions enter through the gateway. Agent actions use scoped worker credentials. Structured server mutations can use ToolGate with owner identity; direct owner shell access is a separately authenticated exception already anticipated in the newer dashboard vision.

## 4. Navigation and reusable workspace behavior

Proposed organization, subject to a route inventory before implementation:

| Surface | Primary job |
| --- | --- |
| Companion / Chats | Talk, create requests, call, inspect inline progress and results. |
| Agents | Agents, Templates and Teams; configure specialists and inspect their work. |
| Tools | Define, test and publish capabilities; inspect input schemas, effects and access. |
| Flows | Library, visual editor, tests and versions. Runs link to the shared Activity inspector. |
| Jobs | Configure trigger bindings, schedules, concurrency and history. |
| Activity | All running/queued/waiting/failed/completed work, including delegated agents. |
| Memory | Records, sources, Markdown tree, relationships, similarity map and timeline. |
| System | Overview, processes/ports, Docker, services, Terminal, Files. |
| Inbox | Proposals and exact actions awaiting owner decisions. |
| Settings | Connections, providers/models, privacy, security and shared preferences. |

Use the existing Journal as history within the Activity concept where possible, rather than introducing two competing execution histories. Home summarizes these areas. The separate productivity application remains responsible for personal tasks/calendars.

Complex editors use a dedicated full-width workspace. A collapsible library/tree sits on the left, the main canvas/editor in the center, contextual properties/evidence on the right, and an optional execution/output panel below. Panels are resizable, hideable and recoverable with Reset layout. The same interactions recur across workspaces; the content and topology vary by task.

Common affordances: search-to-add, drag/connect, typed ports, invalid-connection feedback, multiselect, duplicate, group, undo/redo, fit selection, zoom, minimap, keyboard equivalents, saved views and deep links to a selected node or event. At wide zoom show groups and status; zooming in reveals fields and details. Accessible outline/table views accompany graphs. Small screens prioritize inspection and focused edits over a tiny desktop canvas.

The shared appbar owns route sections and context. Large configuration stays on pages, small creation uses existing task dialogs, and inspection uses existing detail patterns. Canvas-selected properties are an editor-specific panel, not a reason to move all creation into drawers.

## 5. Three graph meanings

1. Definition graph: the editable design of a flow or team. Draft, validate, test, publish.
2. Execution graph: the actual branches, calls, workers and retries of one run. Historical events cannot be rewritten. Editing creates a new definition or rerun request.
3. Knowledge graph: explicit relationships among entities, sources and claims. Links have types and provenance.

A vector similarity plot is a fourth view, not a knowledge graph. Its positions are a lossy projection of embeddings, not causal or factual relationships. Clearly identify the embedding model and projection version. Dragging a dot changes display layout; changing text/metadata changes the underlying record and queues relevant index updates. Advanced vector inspection can expose dimensions/export/re-index operations without treating screen coordinates as editable semantic vectors.

Keep edge meaning visible: data, control, delegation, capability access, source citation and semantic similarity must not all look like one unlabeled line. Animate edges only when events indicate activity. Use semantic colors plus icons/text/line styles; do not make color the only carrier of meaning. Respect reduced motion and the owner's limited GPU.

## 6. Workflow and tool constructors

Workflow editor:

- Node library for tools, transforms, conditions, Decision, branches/joins, loops, waits, agent/team work, approvals, subflows and results.
- Inspector with inputs, output schema, mappings, effects, limits, retry/timeout behavior and test cases.
- Sample inputs and pinned fixture outputs for safe local testing; a separate explicit live-test path.
- Per-step inspection and breakpoints before effects; pause takes effect at a safe boundary and cannot retract an already issued external request.
- Schema checks, missing credentials, unreachable branches, unbounded cycles and changed dependencies surfaced before publication.
- Draft versus published version, readable diffs, dependency impact and rollback to a prior definition.
- “Expose as tool” publishes a stable input/output contract around the workflow.

Tool editor:

- Name, purpose, schema, outputs, operation/effect metadata, executor or flow reference, credentials by reference, destination/resource bounds and test fixtures.
- An effect preview before a real invocation; no fake dry-run promise for an executor lacking simulation support.
- Tool publication and granting it to an agent are separate decisions under current rules.
- Custom implementation runs server-side under a defined executor boundary, never as arbitrary privileged code inside the dashboard.

Example: Publish Instagram post takes account, media and caption; validates them; uploads/prepares; publishes; verifies; returns a post reference. An optional caption-writing node is generative. The publishing procedure is fixed. A daily job invokes the pinned flow; chat invokes its tool interface. Both share policy, receipts and inspection.

Reliable operation requires durable step state, bounded retries, timeouts, safe cancellation, idempotency where supported, and reconciliation after ambiguous failures. A timed-out publish may have succeeded; inspect the existing outcome before repeating it. Pin child tools and subflows as well as the root flow. This addresses the changed-child-tool problem documented in open-issues F3; this plan does not claim that defect is fixed.

Schedules need time zone/DST, overlap and missed-run decisions. Only one service owns scheduling. A schedule node visible in the canvas edits the same job binding, not a second scheduler.

## 7. Agents, teams and live work

Agent configuration separates role/model/tools/memory/limits from optional authored personality/appearance/voice. Focus and Character remain independent of authority.

Team canvas shows roles, assigned agents, handoff rules, context sharing, tools and resource dependencies. Default patterns can include sequential handoff, parallel specialists and reviewer/worker, while allowing an owner-authored structure. Show why a connection exists and what crosses it. Per-agent permissions are not combined into an unrestricted team identity.

Activity shows work, not merely agent presence: current task, executing step, last event, queue position, elapsed time, tool calls, resource usage, grants and outputs. A configured agent with no work is idle; many simultaneous runs do not imply multiple persistent agents.

The run inspector shares List, Graph and Timeline views. It supports drill-down from parent to child, and links back to the conversation/job, exact versions and artifacts. Distinguish worker thinking, waiting for a tool, waiting for owner input, stalled and disconnected. A Stop request may remain cancelling while an executor settles; never claim it undid a completed action.

Inline chat cards render this same event model: thinking/progress, plans, tool activity, research/citations, delegated work, approvals, artifacts and recovery. Display supplied reasoning summaries when available; elapsed time and tool evidence remain useful when a provider exposes no reasoning. Do not manufacture hidden reasoning or progress percentages.

## 8. Memory as an editable workspace

One underlying set of records, multiple synchronized views:

- Markdown/tree: browse sources, people, projects, topics and claims; edit authored knowledge and view source backlinks.
- Table: filter/sort/bulk inspect metadata, status, scope and retention.
- Graph: explore typed relationships, selected neighborhoods and evidence chains.
- Similarity map: inspect clusters, nearest neighbors, duplicates and retrieval behavior.
- Timeline: see when events happened, when a fact was learned and when it was corrected.

Markdown can initially be a projection/export of canonical records with stable IDs. Do not quietly create a second database of files. Physical bidirectional folder synchronization is a separate feature with conflict handling, import validation and deletion semantics.

Selecting any record offers content, citations, source-time links, stated/observed/inferred origin, scope, validity dates, correction history and index state. Supported owner actions should include edit, annotate, link/unlink, merge duplicates, split a claim, dispute, retract, forget, change retention and test retrieval.

An owner correction creates a revision or explicit correction layer. It does not silently falsify the recorded source. Deletion remains available: original-evidence discipline is not permission to retain something the owner asked to erase. Invalidate/rebuild affected summaries, relations and embeddings; forgotten material must not reappear from a stale index or later extraction.

Before committing a consequential change, show its affected records and derived data. Afterward, show re-indexing/propagation status. Graph layout edits and saved views are separate from knowledge edits.

## 9. Call/session replay with synchronized lanes

Treat a call as an interactive segment of a session. Text, mic and camera input combine with companion text, audio and optional appearance output. Preserve their independent controls.

Proposed replay view uses time vertically and parallel lanes horizontally. Collapsed lanes keep it readable; a shared playhead synchronizes the transcript, video preview, waveforms and events. Expand a time interval to inspect a turn. Search a phrase and jump to its source moment.

Lanes:

1. Owner text: submitted messages, speech partial/final transcript and word times where measured.
2. Owner audio: recording/waveform if retained, voice activity, interruptions and pauses.
3. Owner video: retained frames/segments, observed gestures or landmarks if enabled.
4. Interpretation: tentative voice/face/context annotations, with provenance and uncertainty.
5. Context delivered: the actual transcript version, observations and memory references included in each model request, with capture versus receipt time.
6. Agent work: model request/first-output intervals, progress or reasoning summaries, tool calls and delegation.
7. Companion output: text chunks, generated speech, measured word boundaries, playback, expression commands and interruption point.

Record capture time, arrival time, processing interval and playback time separately on a shared session clock. Missing, delayed and approximate alignment must remain visible. Later analysis must never masquerade as context the model saw live.

Typing detail is scoped to the active call composer, only when explicitly shared. Do not create a system-wide keylogger. Draft revisions can be represented as bounded timestamped changes rather than storing every key forever. The owner must see whether the model receives live draft text or only sent messages.

Emotion labels are interpretations, not proof of internal feelings. Keep measurable observations, model guesses and owner self-reports distinct; permit correction and “uncertain.” Evaluate patterns as hypotheses with source clips, not diagnoses. Do not infer identity, intent or psychological traits merely because a visualizer can display them.

Replay only plays recorded events. “Rerun from here” is a separate action with a new run identity and fresh policy checks. Changing a memory later does not rewrite historical input snapshots; deletion/redaction policies still apply to those snapshots.

## 10. Call storage and privacy

The owner wants calls discoverable as MemoryGate sources. Recommended interpretation: make them visible and searchable in Memory without duplicating the canonical raw session.

- Pi retains the canonical session/transcript/timeline.
- A controlled media store retains selected audio/video assets.
- MemoryGate holds source references, derived evidence and selected claims, linking to exact session intervals.
- The Memory Sources UI opens the unified replay through the owner gateway.

This extends ADR-0002 without turning a vector index into the session archive. If MemoryGate should literally own raw calls, explicitly replace that ownership decision instead of storing two independent copies.

Proposed retention choices: live only, transcript/events, transcript plus audio, or full recording. Camera use does not imply storage. Recording indicators and remembered owner choices must be clear. Transcript-only may still include sensitive observations, so annotation retention has its own control.

Keep separate questions visible: what is captured now, what is retained, what can enter memory, and what can go to an external provider. No memory prevents memory reads/writes as specified; No harness skips the harness. Neither label silently answers media retention. A private/live-only call should not later be promoted into memory without an explicit owner decision.

Source deletion propagates to retained media, words, annotations, claims and indexes. Define backup deletion/expiry and restore behavior so old backups cannot silently resurrect forgotten material. Storage quotas, retention cleanup and gaps from disabled recording are visible in the source inspector.

## 11. Reauthentication and leaving a device unattended

The requested rule is password verification before committed create/modify/delete operations. Make it compatible with an editor: edit a local draft freely, review a coherent change set, reauthenticate, then commit that exact change set. Do not ask for a password on every drag or typed character. Clarify which ordinary conversational operations fall under this rule before implementation; protected configuration/data mutations definitely do.

Proposed security behavior:

- Manual Lock now and server-enforced idle/absolute expiry; sensitive content is concealed on lock. Background telemetry must not count as owner presence.
- Reauthentication for persistent protected mutations, granting access, publishing flows/tools, privileged execution and revealing/exporting sensitive data.
- Apply fresh owner verification to privileged work initiated from every interactive surface: chat/call requests, Run buttons, live workflow tests and direct tool invocations. An already-authorized agent must not become a bypass for someone using an unattended browser. Bind verification to the reviewed action or explicitly bounded run request; a chat can prepare a proposal before that verification.
- The gateway verifies identity and binds the short-lived proof to the target/version/change set. The browser cannot satisfy this by setting a flag. Changed inputs require a new review.
- Owner identity verification and exact-action approval remain separate facts, even when one dialog handles both.
- Owner-requested password entry is the initial mechanism; a user-verifying passkey could be an optional later alternative.
- Terminal entry gets a separate short-lived owner session. Lock/expiry revokes its transport/input authority. Remote processes already launched may continue; terminate them only through explicit supported controls.
- Reopening a tab or reconnecting a socket must not revive expired privileged authority.

The browser cannot reliably know that the owner walked away or that the OS was locked. Use supported presence signals as hints, with gateway-enforced expiry as the control. Tailscale restricts access, and sudo restricts some operations; neither makes an unlocked owner browser harmless. Non-root access can already alter the owner's files, and Docker privileges can be extensive.

This design follows the distinction between reauthentication and server-side transaction authorization in [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [transaction authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html). It is a proposal, not a claim that Conker implements these controls today.

Unattended automation is a separate actor path: the owner reauthenticates to establish a bounded grant; scheduled runs can then act within it. Requiring the owner password for every automated action would make daily unattended workflows impossible. Preserve the existing owner-approval floors and limits; neither an agent nor a Decision model can widen them.

Interactive versus scheduled/event origin is authenticated runtime metadata, never a flag supplied by a model or an untrusted page. Only genuinely established trigger bindings can use the unattended path.

## 12. Jev: a candidate for bounded decisions

Researched from official sources on 2026-09-19; no Conker benchmark or integration was performed.

TypeSafe's Jev returns predefined choices, scores and probabilities rather than generated prose. This fits an explicit Decision node. [Official introduction](https://docs.typesafe.ai/introduction).

The current catalogue lists `jev-1.13.0`, $0.042 per million input tokens with free output, text-only input, and stronger English performance than other languages. Pin a tested version and separately evaluate Russian/Hebrew. [Model catalogue](https://docs.typesafe.ai/models).

The launch article advertises 70–500 ms end-to-end responses; this is vendor evidence, not measured latency from the owner's server. [Launch article](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

Its typed output guarantee is not a guarantee of a correct judgment. The vendor documents problems including precise arithmetic/dates and adversarial inputs; confidence also requires interpretation. [Known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [confidence guidance](https://docs.typesafe.ai/confidence).

Proposed experiments, not established abilities in our workload:

| Location | Candidate decision |
| --- | --- |
| Flow | Choose among known branches, with an explicit uncertain/fallback path. |
| Pi routing | Choose among already eligible agents, models or published flows. |
| Memory | Suggest labels, candidate duplicates or items needing review. |
| Activity | Prioritize failures or classify a likely recovery category. |
| Companion | Rank permitted notifications for now, later or no interruption. |
| Character delivery | Select a predefined delivery style/intensity within authored limits. |

The Decision inspector should expose question, candidate options, input snapshot, output distribution, chosen branch, threshold/fallback, model version, latency and observed evaluation results. Avoid an opaque “AI decides” node.

Jev does not directly process camera or microphone data. ASR/vision/audio analysis would first produce timestamped textual observations. A generative model still writes the answer; TTS produces audio. Jev cannot replace authentication, authorization, grants, counters, schedules or exact calculations. Model-selected delivery style must not change the factual answer or safety/permission logic.

Start with routing or review in shadow mode, where the suggestion is logged but does not control an action. Compare accuracy, abstention, failure impact, p50/p95 latency and total cost against simpler rules and existing models. Do not add a cloud dependency to every call turn merely because the unit price is attractive. Limit transmitted context and honor the configured privacy/provider policy.

## 13. Small details that make control usable

- Every node/run/artifact/source has a stable link. Opening a source returns to the original selection afterward.
- Clicking a memory cited in chat reveals why it was retrieved and the source interval.
- A “used by” view answers which agents, jobs and flows depend on a tool or memory.
- Version changes show affected jobs and grants before publication; no silent dependency updates.
- Compare two runs side by side, including changed inputs, branches, timing and output.
- Preserve selection/zoom/filter state when switching graph/table/timeline views.
- Saved workspaces restore panel sizes without confusing layout changes with data edits.
- Drafts survive navigation and clearly distinguish local from saved/published state.
- Import/export versions with secrets excluded; validate imported graphs and templates before activation.
- Reduced motion, keyboard operation and useful empty/error states are part of the workspace, not later decoration.
- An explicit stop/pause control distinguishes stopping new dispatches from cancelling active work.
- Large graphs load neighborhoods progressively; timelines fetch time windows. Establish representative data/performance budgets before choosing a renderer.

## 14. Rules requiring reconciliation

These are explicit follow-up documentation changes, not edits silently made by this proposal:

| Older statement | Newer evidence / proposed resolution |
| --- | --- |
| Browser talks only to Pi; owner authority sits on that path. | `browser-auth.md` and the dashboard architecture critique introduce the separate owner gateway. Keep owner credentials out of Pi. |
| No interactive terminal. | `dashboard-vision.md` System access permits an owner-only shell with its own boundary. Specify lease/revocation and mark the exception. |
| Autonomy dial; no standing grants. | `open-issues.md` A7/A12 establish bounded grants. Use those; do not restore the old dial. |
| No avatars/video, voice later. | The owner's newer requirements and current interface establish voice/camera, with live 3D deferred. |
| Raw transcript never enters MemoryGate. | Preserve single canonical ownership while exposing call sources and precise links in Memory; explicitly revisit ADR-0002 if ownership must move. |
| Browser never sees host paths or raw memory. | Owner inspectors/files/terminal require scoped authorized owner data. Distinguish those from agent-visible data and backend secrets. |
| One editor pattern must fit every screen. | Keep shared visual/interaction rules, with explicit workspace variants for graphs, replay and complex editors. |

Sources: `CONTEXT.md`, `docs/architecture.md`, `docs/browser-auth.md`, `docs/dashboard-vision.md`, `docs/open-issues.md`, ADR-0002/0003/0005/0006, `docs/research/dashboard-architecture-critique.md`, `dashboard/DESIGN.md` and `docs/design-language.md`. Several contain historical statements; this plan records conflicts instead of treating file age or a heading as proof of current implementation.

## 15. Work sequence and completion evidence

1. Agree the vocabulary, ownership exceptions, grant/reauthentication rules and recording defaults. Record reconciled ADRs and domain contracts.
2. Define version/run/event/source schemas and a shared workspace interaction model. Build fixture examples for branching, retries, delegation, stale data and failed reauthentication.
3. Build Activity/run inspection and richer chat event cards from one event source.
4. Build the Tool/Flow constructors and Job trigger bindings; prove manual, chat and scheduled invocation reference the same definition.
5. Build agent/template/team editing on those contracts rather than another execution system.
6. Add System control and Memory editing through the appropriate owner paths.
7. Add call replay/source retention, then optional multimodal analysis and evaluated decision models.

This is a dependency order, not permission to remove current working surfaces. Frontend work stays behind ConkerClient fixtures until integration is explicitly undertaken.

Review scenarios before calling the design complete:

- Build and test a publishing flow, expose it as a tool, bind a daily job, inspect the identical version invoked from chat.
- A publish timeout never blindly produces a duplicate; the inspector shows an ambiguous result and recovery options.
- A template change does not silently change an existing agent or in-flight team run.
- Select a memory dot, open its source, correct it, and observe dependent indexes update without rewriting source history.
- Replay a call at a word, inspect the simultaneous inputs, and distinguish what the model saw then from later inference.
- Leave the dashboard open: it locks, privileged sockets lose authority, and reopening cannot bypass reauthentication.
- An unlocked browser cannot bypass verification by asking the Companion, in chat or a call, to perform the same protected action.
- Invalid/expired grants, disconnected providers, missing media, very large graphs and partial data produce explicit recoverable states.

## 16. Decisions intentionally still open

- Durable workflow worker implementation and the exact Pi-to-flow agent-step contract.
- Literal raw-call ownership versus the recommended Memory source-reference model.
- Default call retention, optional live draft sharing, and acceptable media storage budget.
- Which ordinary conversation mutations require the strict password step, and the terminal lease policy.
- Jev access, actual performance, privacy fit and fallback before it enters a critical path.
- Final navigation labels and graph/timeline renderer after representative data and performance requirements are fixed.

These questions do not block the product concept. They must be settled before the corresponding backend behavior is presented as working.
