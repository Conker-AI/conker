# Conker: Feature-First Workspace Workflow

Owner-approved direction, 2026-10-05: a new interface using SiYuan's structure
and Asri's finish, not a recoloring of Conker's incumbent layouts.
The existing sidebar and clean empty-chat canvas are the two explicit visual anchors.
Everything else is replaceable. Product behavior is not.

## Crucial Product Truth

Conker is an owner's personal AI workspace. The first useful outcome is to resume
work, find a source, or make an informed decision. It is not to admire a dashboard
or increase time spent in the app. Technically curious users need inspectable
behavior, but should not have to decode implementation details to do ordinary work.
This is an assumed use scene, not a claim of completed user research.

`capabilities.json`, source adapters, and their tests are the feature inventory.
The development preview uses a fake gateway and is not proof of live execution.

| Feature family | Preserve | New presentation family |
| --- | --- | --- |
| Conversations, recovery, session privacy, calls, voice | Drafts, stream/cancel/reconcile state, scroll, actual provenance, explicit device consent | Reading canvas and unified composer; empty chat remains unchanged |
| Tasks/activity, proposals, owner approvals | Completion criteria, source links, scope, expiry, uncertain outcomes, no automatic execution | Work queue, then focused review document |
| Projects/context | Revision conflicts, instructions, live references, source-owned privacy | Record library and working document with context |
| Agents, companion editing, teams | Published roles, portraits, draft/import/export/history, collaboration boundaries | Record library and chapter-based configuration |
| Tools, workflow authoring | Inventory, draft/source/configure, validation/publication, immutable receipts | Record library and specialized editor |
| Artifacts | Sanitized preview, source, versions, export, tombstones | Record library and document modes |
| Jobs | Pinned target/version, schedules, run history, pause/resume, explicit run confirmation | Record library and schedule document |
| Memory exploration/forgetting | Real relationships, Map/Tree/List, inspection, provenance, privacy invalidation | Unframed canvas with contextual inspector; structured alternative |
| Models, provider secrets, search | Distinct model roles, credential references only, honest search coverage and opt-in AI stages | Section-indexed settings document |
| Setup/status/evidence | Server-owned progress, current evidence, verification/recovery, optional choices | Current task with checklist; truthful sidebar progress |
| Authentication/session administration | Auth lifecycle, owner-channel proof, revocation, protected data | Existing authenticated boundary; no cosmetic safety claims |
| System, owner files, host inventory | Redacted observations, root restrictions, actual timestamps, read-only distinction | Operational document, table, and specialized file browser |
| Host lifecycle, local downloads, backup/recovery, updates, TLS, admin recovery | CLI-owned controls and verified receipts | Remain operator CLI capabilities; no invented browser controls |
| Owner terminal | Deferred production capability | Preserve explicit preview/unavailable boundary; do not promote it as active |

Cross-cutting invariants: keyboard access, responsive layouts, custom theme pairs,
reduced motion, source authorization, loading/error/empty states, cancellation,
draft ownership, return paths, and mutation eligibility. Search opens records;
it never executes tools or grants permission. Approval records permission, not execution.

## Workflow Before Styling

1. **Inventory.** Trace each route to its source, capabilities, mutations, and tests.
   Record what is real, preview-only, unavailable, or deferred. Do not use current
   card placement as a product requirement.
2. **Task.** Name the primary user outcome and why it matters. Classify controls
   as navigation, local tools, content, or contextual inspection. Rank by frequency
   and consequence, not by visual habit.
3. **State.** Map initial/loading/working/waiting/blocked/error/unknown/recovery/
   cancelled/completed states. Preserve drafts and source authority across transitions.
4. **Topology.** Assign a screen family. Libraries find records; documents edit or
   review one thing; queues prioritize attention; canvases expose relationships.
   Do not give each route an unrelated visual solution.
5. **Reference translation.** Study the reference's structure, not just its colors.
   Build from native React/Radix controls and Conker's semantic themes; do not install
   SiYuan-specific CSS or copy its implementation. References are
   [SiYuan](https://github.com/siyuan-note/siyuan) and
   [Asri](https://github.com/mustakshif/Asri).
6. **Shared implementation.** Establish the frame, section index, record anatomy,
   surfaces, command hierarchy, modes, and overlay behavior before composing routes.
   Change shared owners rather than appending per-screen overrides.
7. **Validation.** Exercise real task paths and source-owned state, inspect desktop
   and mobile together, check themes/focus/overflow, run guards and behavioral checks,
   then document the built system. A screenshot alone cannot certify safety.

## Questions For Every Component

- What outcome does this advance, and what currently competes with it?
- Is it navigation, a command, content, status, or evidence? Is it in that location?
- Is the same information or search entry repeated elsewhere?
- Does grouping make the next action apparent without extra instructional copy?
- Does a surface mean a working plane, selection, or elevation, rather than decoration?
- Is the frequent action easy to reach, and is the consequential action deliberate?
- What happens when this is empty, stale, denied, interrupted, long, or unavailable?
- Can the user defer, return, undo where supported, and recover without losing work?
- Is this a shared problem with a shared solution, or a genuinely specialized tool?

These questions are hypotheses to test, not a universal formula for attention.
Use progress only for actual incomplete work. No fake urgency, guilt, compulsory
engagement, invented statistics, or guarantees that model output is safe.

## Direction Contract

**THESIS:** A personal working environment, not a dashboard of cards. Documents
have an index and body; libraries have records; decisions have focused review.

**OWN-WORLD:** System typography, neutral semantic theme pairs, softly separated
working planes, sparse dividers, compact command chrome, deliberate selection.
Depth belongs to floating overlays and the composer, not the main shell.

**STORY:** Find the relevant work, inspect it in its own context, then choose an
explicit action. Navigation and status do not masquerade as authority.

**FIRST VIEWPORT:** Existing sidebar at left; one 56px command row and slim scoped
search; a section index on long documents beside the content plane. Record libraries
use shared name/context/metadata columns. Mobile removes the persistent index and
uses a contents disclosure; it does not shrink the desktop layout.

**FORM:** Owner-pinned SiYuan + Asri, replacing the incumbent world. Prior concept
seed `7cdf9281` remains subordinate to that explicit choice. Implementation is
code-led and uses the references as grammar, not a pixel-copy promise.

**SIGNATURE:** Section navigation moves to and focuses the actual section without
resetting form state. Motion is brief and reduced-motion aware; no entrance parade.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Delivery Boundaries

Checkpoint before implementation: `checkpoint/conker-before-new-workspace-2026-10-05`,
commit `43a028fa0e8ff7d756178bd7d51133b2f1b001dd`, verified against GitHub.
No force push, implicit dependency upgrades, production deployment, new permission,
or fabricated backend capability. Exact built values belong in `dashboard/DESIGN.md`;
that file must describe the new implementation, not constrain it to the discarded UI.
