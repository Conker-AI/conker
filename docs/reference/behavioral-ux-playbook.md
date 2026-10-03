# Conker Behavioral UX Playbook

Research and read-only inspection: 2026-10-04. Status: guidance and proposed experiments, not approved UI changes or measured user findings.

## Purpose And Authority

Design for the owner's useful outcomes first, with broader adoption later. Keep technical control and a spacious, premium working environment; mobile must remain approachable. Optimize for doing the right work with understandable consequences, not for keeping the owner inside Conker.

The owner's latest instructions, actual gateway contracts, shared components, and [dashboard design contract](../../dashboard/DESIGN.md) remain implementation authorities. Older reference descriptions may conflict with the active gateway UI. This playbook does not reconcile or rewrite them, replace theme tokens, authorize new features, or add runtime dependencies.

The reusable skill is installed at `C:/Users/The1a/.codex/skills/behavioral-ux/SKILL.md`. Its [evidence register](C:/Users/The1a/.codex/skills/behavioral-ux/references/evidence.md) identifies 17 evidence groups, source access limits, and distinctions between findings, standards, heuristics, and hypotheses. It is local guidance, not model training. See [validation and resource review](behavioral-ux-validation.md) for what was actually checked.

## How To Make A Decision

Write a short decision record before a meaningful change:

| Question | Required answer |
| --- | --- |
| Who, where, why? | User expertise, device, context, desired outcome, and why it matters |
| What is wrong? | Observed friction; separate suspicion from data |
| What should happen? | Primary task, essential information, and supporting actions |
| Why this design? | Relevant evidence or product preference; label transfer as a hypothesis |
| What do we sacrifice? | Discovery, density, steps, context, or capability |
| When is it wrong? | Counterexample and alternate design |
| Can the user control it? | Defer, decline, recover, finish, and leave |
| How will we know? | Task test, benefit metric, and comprehension/control guardrail |

Give each persistent element a task role: orient, find, act, explain state, inspect, or recover. Delight and identity can also be intentional roles. An element without a useful role is a candidate for removal, not automatic clutter. Do not estimate attention percentages from element area or demand that every pixel is interactive.

## Current Observations

Inspected the local preview at `http://127.0.0.1:18160/`: Today, Memory Map, saved chat, and Inbox at desktop widths; Inbox at 390 by 844. Used screenshots, accessibility state, and source reads. Navigated only; did not send messages, approve requests, change preferences, or run tasks. Preview content is not proof of production integrations or capabilities. This was not a usability study or a complete app audit.

| Surface | Observed | Hypothesis to test |
| --- | --- | --- |
| Today | An actions-only band precedes setup; setup also appears above the sidebar profile; a waiting-request surface competes with setup | A contextual priority order may make the next useful action clearer than equal permanent emphasis |
| Memory | Map, scoped search, submit, type filter, refresh, maximize, and page search share the appbar | Search scope and discovery may matter more than merely removing controls |
| Saved chat | Quiet transcript, distinct user/assistant presentation, composer, compact identity/options header | Reading and resumption should drive the layout; do not add decorative dashboard panels |
| Inbox | Recipient/content and permission-only explanation precede decision actions; explicit defer/refusal exists for suggestions | Preserve consequence visibility even if that limits compactness |
| Narrow Inbox | Fields stack, navigation is hidden with an opener, and the decision explanation wraps above both actions | Test comprehension and reachable controls rather than shrinking all typography to save height |

The Today title is present in accessibility state but its actions-only layout suppresses the visible repeated heading. Do not diagnose a duplicated visible h1 from DOM text alone.

## Worked Decisions

### 1. Setup: Six Resolved Of Eight

**Job / why:** Know whether Conker is ready for intended use and resolve actual blockers.

**Grounding:** `summarizeSetup` counts both verified and intentionally skipped steps as resolved. The current prompt hides when setup is complete and identifies the next step. Those semantics must survive any visual change.

**Proposal:** Keep honest resolved counts, distinguish disabled optional capability from verified readiness, and emphasize the actionable blocker and benefit. Use warning treatment for blocked/degraded evidence, not for every optional omission. The progress display is a completion aid hypothesis, not proof of remaining effort. [Goal-proximity source](https://www.columbia.edu/~rk566/Session4/Goal-Gradient_Illusionary_Goal_Progress.pdf).

**Tradeoff / exception:** Prominence can help first-time setup but distract from a pressing decision. An unavailable prerequisite needs an explanation and safe alternative, not stronger motivational copy. Never award fake steps or silently change the denominator.

**States / test:** Cover zero progress, optional-off, blocked, stale status, new requirements, and fully resolved. Ask the owner to identify what is usable and the next required action. Measure correct interpretation and completion; guard against believing disabled means verified.

### 2. Today: Priority Without A Second Dashboard Header

**Job / why:** Resume useful work or handle a real decision, then stop when caught up.

**Proposal:** In a later UI experiment, compare the current actions-only band with those actions consolidated in existing appbar space. Do not add a hero title, description, new counts, or decorative panels. Compare contextual setup prominence against the existing duplicate entry points; keeping a quiet persistent entry can support later return.

**Basis / tradeoff:** This is a local hierarchy hypothesis, not a finding that fewer controls always win. Moving actions may weaken discovery. Preserve direct access to relevant work and any genuine installation warning.

**States / test:** Test first-time setup, a pending decision, no pending work, and partial refresh failure. Ask the owner what matters next and whether the displayed state is current. Success includes recognizing there is nothing to do; do not replace completion with another engagement prompt.

### 3. Desktop Appbar: Technical, Not Crowded

**Job / why:** Orient and find things without surrendering work area.

**Proposal:** Evaluate a slim centered search only if it serves the dominant task. Keep the compact title and functional icon groups; align border insets, control centers, and baselines through one shared owner. Main shell stays flat; no shadow reintroduction or oversized heading.

**Tradeoff / exception:** In Memory, record search and page search have different scopes. A generic centered search can create ambiguity. Decide scope from task evidence before moving it, and do not invent unified search backend behavior.

**States / test:** Compare known-page finding and known-memory finding with expanded/collapsed navigation and long labels. Measure wrong-scope searches, successful retrieval, and lost context. Do not judge only the centered screenshot.

### 4. Mobile Overflow: Hide Rarity, Not The Task

**Job / why:** Complete a focused task on a narrow screen without hunting for basic actions.

**Proposal:** Classify existing actions by actual use and consequence. Send, cancel when relevant, and crucial status remain discoverable; diagnostics and rare export options are candidates for overflow. Name unfamiliar commands inside menus. Whether model selection remains visible depends on the owner's switching behavior. [Disclosure rationale](https://www.nngroup.com/articles/progressive-disclosure/).

**Tradeoff / exception:** A frequent expert action should not gain extra taps simply to reduce icon count. Compact artwork may keep a larger nonoverlapping hit area; tooltips alone do not support touch.

**States / test:** Verify keyboard navigation, open menus, long labels, soft keyboard, busy state, and return from details. Compare task completion and mistaken taps, not just available whitespace. The current narrow Inbox screenshot is grounding, not proof that all mobile routes work.

### 5. Chat: Keep The Conversation The Work

**Job / why:** Understand an answer, inspect evidence when necessary, and continue at the right point.

**Proposal:** Preserve the unified composer, quiet transcript, common column geometry, reading position, and restrained identity. Use actual saved tool/memory evidence for inspectable context; never turn conversational prose into executable action UI. Keep useful actions reachable on touch and keyboard without a permanent wall of controls.

**Tradeoff / exception:** Hiding actions can obscure them; always-visible metadata can overwhelm reading. Compare with long answers and frequent copying rather than a two-message fixture alone. A proposed calendar action in preview prose is not evidence of a working calendar integration.

**States / test:** Test streaming, reading older messages, source inspection, failed/unknown turn, draft preservation, and latest-message navigation. Measure successful resumption and understanding of actual execution state. Do not add motivational banners inside the transcript.

### 6. Memory: Impressive Because It Explains Something

**Job / why:** Discover a relationship, find a known record, or understand why something is remembered.

**Proposal:** Keep Map, Tree, and List as different task tools rather than decree one is universally best. Preserve recorded relationships versus organizational grouping, partial-load status, selectable evidence, and a structured path to records. Selection should expose provenance and actual available controls. Density should follow real data, never fabricated nodes to make it look sophisticated.

**Tradeoff / exception:** Map exploration can be slower for known-item retrieval; a large dataset can overwhelm labels. A sparse real graph is acceptable. Layout position or link brightness must not imply causal certainty or confidence absent from data.

**States / test:** Find the same record and explain its source across modes; test filtered, partial, empty, disconnected, and densely connected data. Measure correct retrieval and mistaken link interpretation. Do not fabricate study results from sample data.

### 7. AI Decisions: Deliberation Is A Feature

**Job / why:** Decide whether an exact action fits the owner's intent and authority.

**Grounding:** Inbox states that allowing records permission only. `GatewayOwnerWorkspace` retains uncertain attempts and checks saved state; a decision does not automatically resume an action.

**Proposal:** Preserve scope, content, expiry, uncertainty, and readable allow/refuse choices. Put technical detail behind disclosure only when it is not required for the decision. Do not make permission look like execution success. [Human-AI guidance](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf).

**Tradeoff / exception:** Some friction protects against an unwanted outcome. A real expiry can be shown neutrally; animated countdown pressure is unnecessary. Never optimize approval conversion independently of comprehension.

**States / test:** Before/after decision, expiry, refusal, unknown result, and saved-state reconciliation. Ask what happened and what happens next. Measure correct scope/state explanations and unintended authorization; never submit real approvals for a visual test.

### 8. Reminders And Completion: Respect The Exit

**Job / why:** Return to a useful routine chosen by the owner, without creating obligations to the product.

**Grounding:** Suggestions already offer Accept, Not now, and Never suggest this. These are meaningful agency controls, not options to hide to improve acceptance.

**Proposal:** Surface the existing reason and exact effect. For later experiments, use stable user-chosen timing, easy deferral, and clear stopping states. Preserve a quiet caught-up state. No daily-use requirement, fake loss framing, or shaming from the companion. [Habit study](https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674).

**Tradeoff / exception:** Fewer reminders can miss opportunities; more can interrupt unrelated work. No amount of visual polish fixes an unwanted routine. Previously declined goals should not be repeatedly reintroduced.

**States / test:** Accepted, deferred, declined permanently, unavailable context, break in routine, and finished. Measure actual usefulness, interruption cost, and perceived control; frequency of return is supporting evidence only.

## Visual Signals To Preserve

- Flat main shell; depth belongs to useful internal working surfaces and genuinely floating overlays.
- Quiet appbar and separators, readable working content, differentiated selected state; no grey slabs merely to indicate a toolbar.
- Shared geometry for equivalent controls; compact glyphs with usable targets and uncut animation bounds.
- Color conveys consistent status/category meanings, not an unsupported promise of trust. Keep text/shape redundancy and test real contrast.
- Surfaces group related objects; avoid nested cards and a card for every section. Breathing room follows relationships.
- Motion explains state, acknowledgement, or identity without competing continuously with reading. Keep non-motion equivalents.
- Premium feel is an owner preference to validate through composition and consistency, not a psychological constant or license for ornamental controls.

## Prioritized Future Experiments

Not implementation authorization. Order reflects consequence and current evidence, not a calculated impact score.

1. **Approval comprehension:** test whether the owner correctly distinguishes permission, execution, and unknown outcome. Preserve safety before polish.
2. **Today priority and action placement:** compare useful-next-step recognition with the current actions band and setup prominence; do not add h1/description.
3. **Memory retrieval and evidence:** compare Map/Tree/List tasks and search scope; retain exploratory beauty without sacrificing truth.
4. **Mobile control discovery:** test common tasks before deciding what belongs in overflow; preserve frequent model switching where needed.
5. **Chat resumption:** test long content, reading position, evidence access, and failure recovery rather than redesigning the quiet fixture.
6. **Setup and reminders over time:** observe whether truthful progress and chosen cues help useful completion; stop interventions that add pressure or irrelevant return.

For owner-only pilots, record tasks, context, order, observed difficulty, and preference. No statistical efficacy claims. For broader-user claims, recruit representative people and separate novices from experienced users. Do not add telemetry or transmit memory/chat content without explicit authorization.

## Unresolved Questions

Which actions are actually frequent for the owner? What makes a returning session useful? Is centered search understood by scope? How does a real large memory graph perform? Do progress cues help rather than distract? These need observation, not another design-law list. No baseline, eye tracking, brain-state inference, or representative participant study was performed. Revisit the evidence register when stronger research or standards could change a decision.
