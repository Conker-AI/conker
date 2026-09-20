# Conker completion plan and acceptance ledger

Owner-authorized September 20, 2026. Baseline checkpoint: `df3aad220f01da5387ca63c5c4f5fdf112363086` on `feat/dashboard`. Work and commits stay local unless publication is requested. This is the active execution ledger; `roadmap.md` retains the historical checkpoint narrative and `workspace-control-plan.md` retains the broader vision.

## Outcome

An owner can give the Companion an objective, inspect and steer the resulting task, see real execution and outputs, continue after a disconnect, and deliberately retain useful evidence-backed memory. The same interface configures independent services through Pi. Every shipped operation states whether it is live, preview, unavailable or degraded. A working editor is not proof of a working executor.

The owner approved engineering decisions and iterative implementation, including missing backend pieces after frontend completion. Earlier fixture-only limits remain the truth of existing code, not a permanent ban on the integration phase. Service access, credentials and deployment target are never inferred from browser access or a populated configuration form.

## Working loop

1. Inspect source and rendered behavior; record a concrete gap with its owner and acceptance test.
2. Choose the smallest coherent increment that removes a dependency or completes an owner journey. Prefer reusing tested services over building a second system.
3. Assign independent work to bounded agents with explicit file ownership. Integrate dependent edits sequentially. The main agent owns cross-service interfaces and verification.
4. Implement the behavior, degradation path and discoverable UI together. Keep drafts and history intact. Never replace a functioning control with a static placeholder.
5. Run relevant boundary tests, affected lint/type checks, and build. Inspect desktop/mobile screenshots and keyboard interactions when visible UI changes. Exercise failures and recovery, not only the happy path.
6. Record complaints by severity: correctness/data loss/security/accessibility blockers; material usability defects; taste-only choices. Fix the first two before closing the increment. Keep taste-only questions in the final section without blocking other work.
7. Commit one coherent verified feature with its tests and documentation. Record commit and evidence here. Do not squash these checkpoints automatically.
8. Reassess the affected journey. Repeat for a remaining material defect or next unfinished acceptance item. Do not reopen accepted styling merely to produce more edits.

An implementation pass ends when its stated acceptance checks pass. The overall goal ends only when the launch acceptance sequence below works and there are no known material blockers. External blockers are reported explicitly; unavailable hardware/services do not count as completed features. GPU-heavy character/video work stays on the later roadmap.

## Architecture and decisions fixed for this work

- Browser → ConkerClient → Pi. The browser does not acquire direct privileged connections to gates.
- Pi owns conversations, tasks/runs, agent coordination, model routing and scheduling. ToolGate owns effects, tool definitions/versions, credentials and approvals. MemoryGate owns derived, evidence-backed memory; Pi retains transcripts and evidence references. SystemGate supplies bounded system operations.
- A task is an outcome; a run is one attempt; an event records something that happened; a job binds a trigger to a target. These share IDs/links rather than duplicating histories.
- Conker tasks represent AI work. The separate productivity application remains the owner of personal to-dos/calendar; integrations link records.
- Agents contains Agents / Teams / Templates. Activity contains Tasks / Runs / Events. Existing Journal links redirect to Events, preserving source links.
- Tools remains one library with connector and workflow implementation types. A workflow can be called as one tool. Scheduling does not wake a planner to rediscover an already defined procedure.
- Projects group chats/tasks/files/instructions/scoped context. They do not silently merge memory scopes or grants.
- Context instructions are separate from compressible history. Keep-exact pins cannot be silently dropped. Summaries preserve source references and earlier transcripts. Reconcile the current fork-on-context-limit contract explicitly before introducing alternate compaction behavior.
- Answer, routing, context selection and summarization are configurable roles with provider adapters. Jev is an optional candidate for typed decisions; it is not hardcoded and does not generate summaries. Test quality and failure behavior before defaulting to automatic routing.
- Canvas is a versioned artifact workspace shared with chat/calls. Trusted renderers handle common types; generated applications use an isolated host bridge. Display capability and media generation capability are distinct.
- Preserve semantic theme fidelity, custom themes/radius, full-width composition, padded companion artwork and shell/layout switching. Depth comes from meaningful card/muted/background roles, hierarchy and useful interaction feedback; no new route palettes.
- Credential leak detection and prompt wrappers supplement confinement and server-side policy. Never echo a matched secret in an error. Tests do not prove arbitrary code incapable of exfiltration.

## Ordered work packages

States: **verified** = acceptance evidence exists; **preview** = local/fixture behavior; **partial** = some real pieces, journey incomplete; **missing** = no implemented journey; **audit** = source inspection pending. Initial statuses are source findings, not deployment health claims.

| ID | Package / owner | Initial state | Required acceptance evidence |
| --- | --- | --- | --- |
| P0 | Checkpoint + plan / Conker | verified | Baseline recoverable by Git; this plan committed; scope and evidence tracked. |
| P1 | Workspace depth and direct manipulation / dashboard | partial | Tools readable at normal scale; contextual inspector; upstream-output selection; desktop/mobile/light/dark screenshots; no shell regression. Apply successful shared roles to representative other surfaces. |
| P2 | Tasks, Runs, Events / Pi + Activity | missing | Create/track objective, completion criteria, status transitions, attempted execution trace and outputs; filter active/history; parent-child links; old Journal routes preserved; explicit preview/live distinction. |
| P3 | Agent lifecycle / Pi + Agents | partial | Create/edit/archive specialist; meaningful model/instruction/tool/memory settings; new chat uses selected agent; referenced agents cannot disappear from history. Companion remains singular. |
| P4 | Teams and Templates / Pi + Agents | missing | Versioned template instantiate/override; team roles and handoffs/context/budgets; no implicit grant union; run snapshots unaffected by later definition edits. |
| P5 | Projects / Pi + dashboard | missing | Group/link conversations/tasks/files/instructions; scoped search/context; archive and restore without orphaning work; no duplicate productivity lists. |
| P6 | Context control / Pi + conversation inspector | missing | Effective instruction scopes visible; pin exact/allow-summary/retrieve/exclude; budget/conflict feedback; summary inspect/edit/restore; sources and original history retained; privacy applies to helper models. |
| P7 | Model roles and routing / Pi + Settings | partial | Provider-agnostic role configuration, manual lock, eligible-model filtering, visible actual model and fallback, timeout/unavailability tests; saved evaluation cases for compression and routing. |
| P8 | Artifact library and shared canvas / Pi + dashboard | partial | Versioned documents/code/charts/diagrams/images linked to tasks; selection and updates round-trip; exports; isolated interactive HTML preview; no privileged preview access; lightweight media support. |
| P9 | Conversation completeness / Pi + Chats | preview | Durable drafts/branches, retry-model, context inspection, queue versus steer versus cancel, honest activity, global search and source deep links, upload/processing errors, usable output previews. |
| P10 | Tools and Jobs integration / ToolGate + Pi | preview | Published pinned target calls, job target/version inputs, deterministic schedule with timezone/overlap policy, receipts, bounded nested execution and dependencies. UI Source remains JSON until a real code sandbox exists. |
| P11 | File/research/deliverable tools / ToolGate + canvas | partial | Multiple uploads, metadata and processing feedback, citations to actual passages, inspectable research plan, editable/downloadable document/spreadsheet output. Unsupported formats explicit. |
| P12 | Memory operations / MemoryGate + Pi | preview | CRUD and scoped retrieval from UI; inspect evidence; distinguish stated/inferred; proposed preference correction; privacy/retention; no copying all transcripts into memory. |
| P13 | Calls and presentation / Pi + call services | partial | English STT/TTS turn loop, interruption, mute/output selection, typing alternative, captions, device failure recovery; calls linked to sessions; recording retention explicit. Browser-only recognition remains labeled. |
| P14 | System operations / SystemGate through ToolGate/Pi | preview | Real health with age; process/port/container inspection; bounded terminal/files actions with effect review, authentication and failure feedback; no dangerous unauthenticated transport. |
| P15 | Persistence/authentication/recovery / all service owners | partial | Durable state, append-only evidence, idle lock and privileged reauthentication, grant checks/replay rejection, restart/disconnect recovery, retry without duplicated effects, backup/restore exercise. Must precede live effects. |
| P16 | Proactivity and daily continuity / Pi + Companion | partial | While-away summary links to real work; quiet hours/urgency/autonomy preferences; failed dependency notice; notifications on meaningful results, not polling noise. |
| P17 | Deployment and owner acceptance / Conker installer | audit | Confirm target, supported resources and access; install pinned services; health/smoke/restart/backup checks; one real end-to-end owner task with receipts; document exact unavailable integrations. |

Packages are not a waterfall: P2/P3 domain work can proceed independently of P1 refinement; P6/P7 share context contracts; P8 consumes P2/P5 identities. P15 policy/persistence requirements are designed before any live integrations even if their UI arrives later. Gate security blockers outrank feature expansion. UI work may use explicitly named fixtures while backend contracts are unavailable.

## Completion details that must not get lost

- Chat: provider/model controls, supported effort, manual lock, branching/reply/edit, search, sources, incognito memory/harness controls, keyboard shortcuts, voice transcription and attachments, clear cancel behavior.
- Context: global/agent/project/session scope with visible effective precedence, pinned instructions, corrections, token budget and reserved output space, editable summaries, compaction evaluations and reversible source references.
- Models: capability/privacy/budget eligibility, replaceable routing/selection/summarizer providers, timeout fallback, actual chosen model/cost where metered; advanced side-by-side comparison comes after core reliability.
- Work: completion criteria, progress and blockers, parent-child runs, bounded retries, checkpoint/recovery where supported, safely reopen/revise, artifact provenance, version-aware receipts and change previews.
- Tools: connected inputs, code/graph distinction, variables/conditions/bounded loops, nested tool version pins, credential references, schema validation, effect preview, preview tests vs actual execution, cancellation and uncertain-outcome reconciliation.
- Canvas: present/update/inspect/focus protocol; native charts/tables/math/diagrams/docs/code/media; interaction events; version history; preservation of owner edits; isolated custom apps, click-to-load heavy content, no invented datasets.
- Continuity: project-scoped context, global search, output library, imports/exports, persistent drafts, backup/restore, connection health and cross-device task continuity. Cross-device live call handoff requires an explicit supported transport.
- Character: owner-authored prompts/appearance/voice, Focus/Character separation, vocabulary/pronunciation settings. No hardcoded personality presets substituting for owner-authored settings.
- Proactivity: while-away briefing, goals vs schedules, quiet hours/urgency/budgets, actionable notifications, proposed preference changes. No silent permissions granted by a conversational preference.
- Security: fresh verification for privileged owner actions, one-use approval binding, scoped unattended grants, private preview assets, server-enforced policies, secret-free logs, no automatic public exposure.

## Launch acceptance sequence

1. Start authenticated services on the confirmed target; open dashboard and verify real connection states. Offline provider/gate errors offer recovery and do not masquerade as successful fixtures.
2. Create an agent/project; write persistent instructions and pin a constraint. Reload and verify saved state.
3. Ask Companion to create an artifact. Track it as a task with completion criteria, inspect its run and actual tool events, steer it, and receive a versioned result in the original session/canvas.
4. Trigger a consequential action; confirm exact effect once. Replayed/expired approval fails. A disconnected browser cannot cause a duplicate action on reconnect.
5. Create and publish a bounded workflow; call it directly and through a scheduled job with pinned version/inputs. Inspect successful, failed and blocked runs.
6. Inspect context and correct a proposed memory with evidence. Incognito and helper-model privacy restrictions hold through routing and summarization.
7. Use English call input/output and captions; switch to typing, interrupt speech and recover a device error. Unsupported media features remain explicitly unavailable.
8. Restart services, restore a backup in a safe test target, reconnect from a second device, and verify history/results/task state and idle-lock behavior.

## Commit/evidence ledger

| Date | Increment | Commit | Evidence |
| --- | --- | --- | --- |
| 2026-09-20 | Preserve pre-goal state | df3aad22 | Clean working tree at baseline; prior Tools build/tests/screenshots recorded in tools-workspace.md. |
| 2026-09-20 | Master plan | 9b051274 | Ordered packages, engineering defaults and launch acceptance recorded. |
| 2026-09-20 | Backend integration audit | 6d920906 | Source-verified transport gaps and memory-policy contradiction; no deployment claim. |
| 2026-09-20 | Tools readability and value selection | 6164f6f8 | Branch-safe searchable sources; readable selected step; desktop light/dark and mobile inspected; focused tests/build/lint. |
| 2026-09-20 | Agent lifecycle preview | 5725c75d | Create/edit, route-retained drafts, archive/restore, reference-protected deletion; model/tool/memory configuration; archived-agent selectors and call/job guards. Desktop light/dark, mobile editor and validation inspected. Agent/call/job/chat-continuity/navigation checks and build passed. |
| 2026-09-20 | Route feedback isolation | 50a6e654 | Errors from one screen no longer follow navigation to an unrelated screen. |
| 2026-09-20 | Task and Activity domain | b460f99d | Revision-safe task lifecycle, owner-reviewed completion, shared Activity projection and source references; focused tests. |
| 2026-09-20 | Context policy foundation | e9f8dc98 | Separate instruction scopes, exact pins, explicit include/exclude/summary/retrieve policy, estimates and conflicts; no fabricated summarization. |
| 2026-09-20 | Activity workspace | 3581e803 | Create/edit/review task dialogs, route-retained drafts, searchable references, Tasks/Runs/Events, Journal redirect, precise job/message source links. Task/agent/tool/navigation/job tests, lint and build passed. Browser: creation through completion, invalid-completion guard, desktop light/dark, 390px mobile, preserved Journal actor filter and focused job receipt. |

| 2026-09-20 | Conversation context controls | this increment | Session instructions, exact pins, per-message inclusion policies, budget conflicts and original response snapshots. Browser checked invalid reserve, exclusion preserving transcript, desktop/light and narrow/dark editor, nested Escape, overflow recovery without duplicate message or lost unsent draft. Context and 15 workspace checks pass. Retrieval/summarization/provider-token counts remain explicitly unwired. |

## Questions and external dependencies

Engineering defaults: keep current theme and compact shell; use Projects as grouping, Activity for work, native renderers first; no cosmetic brand redesign; English launch; keep optional heavy GPU features deferred. Do not require another preference interview for these decisions.

Taste-only questions to gather at a natural checkpoint: how often proactive briefings should appear; preferred voice and character behavior; automatic-canvas aggressiveness (default helpful automatic visuals with a Text-only override).

Required before deployment: exact server target, approved deployment path, working access and provider credentials entered through the intended secure setup. Use existing documented configuration only after verifying it belongs to this install; never print secrets. These dependencies do not block local implementation.

## Current next action

P2 Activity is functional in preview with protected task evidence and precise source links. Finish P6 context UI/recovery verification, then integrate P4 Teams/Templates and P7 helper-model configuration. P3 specialist CRUD and P1 Tools readability are verified preview increments. Server persistence, real task execution and helper-model dispatch remain integration work; fixture changes still reset on reload.
