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

### Conversation/call review

- Desktop light and 390px dark chat/call screenshots inspected. Incognito opens the required two-toggle dialog. Call opens directly, with model and privacy controls, separate participant controls, and a typing alternative.
- Browser pause preserved the typed call draft and disabled submission; minimize retained the paused call and focused Expand. No document overflow or console errors in the tested states. No microphone/camera permission was requested for this check.
- Attachment selection and oversize rejection were exercised with browser-generated text/PNG files. Final send/cleanup verification waits for that implementation to settle; operating-system file selection was not verified because the browser connector denied the test file path.

### Explicit feature coverage still to resolve

The original agreed detail list includes web/deep-research next-turn controls and broader canvas renderers. Current composer has no research configuration; current artifact union supports Markdown/math/code/table/chart only. These are frontend gaps to scope and finish, not proof that a backend is required before any UI can exist. Media generation, actual research execution, provider capability discovery, server persistence and arbitrary-code execution remain backend/integration work. GPU avatars and video emotion processing remain the explicitly deferred future phase.

### Local attachment frontend

- Picker supports multiple files; atomic limits are 5 files, 10 MB each, 25 MB total. Chips expose remove actions and local raster thumbnails. Draft attachment list is bounded so Send remains visible on short screens.
- Attachment-only messages work through ConkerClient metadata; draft/queue/fork/retry behavior retains the attachment identity. No file bytes go to a provider or server. Transcript and assistant preview text explicitly explain this limitation.
- Reference-based cleanup preserves shared fork previews and releases bytes/blob URLs after the last message/draft/queue reference is gone.
- Browser-generated text/PNG fixtures verified desktop light previews, remove, oversized-file rejection preserving existing files, image-only send -> rendered image + truthful preview reply + empty attachment draft. At 390x640, five attachments fit a 128px scroll region and Send remains visible; no horizontal overflow or console errors in inspected states.
- Automated checks: 22 conversation cases; 17 workspace cases including attachment save failure, queue/retry capture, shared fork cleanup; context and continuity checks pass. Stale model-disable test now verifies the intended preserved selection and explicit blocked dispatch rather than expecting silent fallback.
- OS file picker opened but local fixture selection was denied by browser connector permissions. Synthetic browser files prove the input handler and rendering, not OS file selection permission.

Final attachment verification: navigating Chats -> original conversation retained all five selected files and enabled Send. Production `npm run build` and scoped ESLint passed; only the existing non-failing upstream Zod annotation warnings remain.
