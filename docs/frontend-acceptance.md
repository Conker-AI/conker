# Frontend finish acceptance

Scope: fixture-backed localhost:5173 only. Backend, live gateway and deployment are deferred.

## Finish checklist

- [ ] Conversations, composer, context, call controls and Settings: inspect key user paths and repair material frontend defects.
- [ ] Agents/Teams/Templates, Projects, Activity and Artifacts: check create/edit/inspect/source paths.
- [ ] Tools, Jobs, Memory and System: check editor/control/navigation paths.
- [ ] Shared shell: desktop/mobile, theme/layout behavior, no page overflow, useful focus/labels.
- [ ] Relevant existing frontend checks and production build pass.
- [ ] Changed UI screenshots inspected; remaining limitations categorized as frontend blockers or deferred backend features.
- [ ] Verified commits and final frontend milestone reported to owner.

## Evidence and findings

Audit in progress. Previous per-feature evidence remains in completion-plan.md and feature documents; this pass addresses concrete gaps without repeating completed implementation.

### Recovery batch — September 20

- Memory: fixed hash-linked sample records switching to illustrative data after view/filter changes. Chrome verified `/memory#judo` to Database and filtered hash link to Clear filters; 390px Database screenshot inspected, no overflow or console errors.
- Agent editor: unavailable selected memories now have removable checkboxes. In an isolated 390px preview, staged the snapshot produced by a deleted memory reference, removed that reference through the UI, and saved successfully through ConkerClient; the remaining `judo` selection and selected scope were preserved. Screenshot inspected.
- Settings: unfinished connection drafts survive internal route navigation, warn on reload, and inputs lock during saving. Chrome verified endpoint edit -> Chats -> Settings -> Connections retained the draft. Mobile Settings screenshot inspected; no document overflow. Drafts and keys remain in memory only.
- Checks: Memory, Jobs, Tools, Agents, scoped lint, design guard and TypeScript passed for the recovery changes. Existing voice (14 cases), call lifecycle and theme checks passed. Conversation checks will be rerun after the separate in-progress attachment contract settles.

### Remaining frontend work

- Complete attachment selection/preview/send metadata across draft, queue and transcript; no ingestion or external uploads in this phase.
- Complete final conversation/call and shared-shell rendered checks, then the integrated frontend build.
- Record exact frontend feature coverage and deferred runtime capabilities before claiming the milestone.
