# Frontend finish acceptance

Scope: fixture-backed localhost:5173 only. Backend, live gateway and deployment are deferred.

## Finish checklist

- [x] Conversations, composer, context, call controls and Settings: inspect key user paths and repair material frontend defects.
- [x] Agents/Teams/Templates, Projects, Activity and Artifacts: check create/edit/inspect/source paths.
- [x] Tools, Jobs, Memory and System: check editor/control/navigation paths.
- [x] Shared shell: desktop/mobile, theme/layout behavior, no page overflow, useful focus/labels.
- [x] Relevant existing frontend checks and production build pass.
- [x] Changed UI screenshots inspected; remaining limitations categorized as frontend blockers or deferred backend features.
- [x] Verified commits and final frontend milestone reported to owner.

## Evidence and findings

Audit in progress. Previous per-feature evidence remains in completion-plan.md and feature documents; this pass addresses concrete gaps without repeating completed implementation.

### Recovery batch — September 20

- Memory: fixed hash-linked sample records switching to illustrative data after view/filter changes. Chrome verified `/memory#judo` to Database and filtered hash link to Clear filters; 390px Database screenshot inspected, no overflow or console errors.
- Agent editor: unavailable selected memories now have removable checkboxes. In an isolated 390px preview, staged the snapshot produced by a deleted memory reference, removed that reference through the UI, and saved successfully through ConkerClient; the remaining `judo` selection and selected scope were preserved. Screenshot inspected.
- Settings: unfinished connection drafts survive internal route navigation, warn on reload, and inputs lock during saving. Chrome verified endpoint edit -> Chats -> Settings -> Connections retained the draft. Mobile Settings screenshot inspected; no document overflow. Drafts and keys remain in memory only.
- Checks: Memory, Jobs, Tools, Agents, scoped lint, design guard and TypeScript passed for the recovery changes. Existing voice (14 cases), call lifecycle and theme checks passed. Conversation checks will be rerun after the separate in-progress attachment contract settles.

### Remaining frontend work

- Attachment selection/preview/send metadata is verified below; ingestion and external uploads remain deferred.
- Complete final conversation/call and shared-shell rendered checks, then the integrated frontend build.
- Record exact frontend feature coverage and deferred runtime capabilities before claiming the milestone.

### Conversation/call review

- Desktop light and 390px dark chat/call screenshots inspected. Incognito opens the required two-toggle dialog. Call opens directly, with model and privacy controls, separate participant controls, and a typing alternative.
- Browser pause preserved the typed call draft and disabled submission; minimize retained the paused call and focused Expand. No document overflow or console errors in the tested states. No microphone/camera permission was requested for this check.
- Attachment selection and oversize rejection were exercised with browser-generated text/PNG files. Final send/cleanup verification waits for that implementation to settle; operating-system file selection was not verified because the browser connector denied the test file path.

### Explicit feature coverage still to resolve

The original agreed detail list includes web/deep-research next-turn controls and broader canvas renderers. Research configuration and diagram/media reference formats are now implemented and verified below. Remaining coverage must still be reconciled with the agreed screen controls before declaring the milestone. Media generation, actual research execution, provider capability discovery, server persistence and arbitrary-code execution remain backend/integration work. GPU avatars and video emotion processing remain the explicitly deferred future phase.

### Local attachment frontend

- Picker supports multiple files; atomic limits are 5 files, 10 MB each, 25 MB total. Chips expose remove actions and local raster thumbnails. Draft attachment list is bounded so Send remains visible on short screens.
- Attachment-only messages work through ConkerClient metadata; draft/queue/fork/retry behavior retains the attachment identity. No file bytes go to a provider or server. Transcript and assistant preview text explicitly explain this limitation.
- Reference-based cleanup preserves shared fork previews and releases bytes/blob URLs after the last message/draft/queue reference is gone.
- Browser-generated text/PNG fixtures verified desktop light previews, remove, oversized-file rejection preserving existing files, image-only send -> rendered image + truthful preview reply + empty attachment draft. At 390x640, five attachments fit a 128px scroll region and Send remains visible; no horizontal overflow or console errors in inspected states.
- Automated checks: 22 conversation cases; 17 workspace cases including attachment save failure, queue/retry capture, shared fork cleanup; context and continuity checks pass. Stale model-disable test now verifies the intended preserved selection and explicit blocked dispatch rather than expecting silent fallback.
- OS file picker opened but local fixture selection was denied by browser connector permissions. Synthetic browser files prove the input handler and rendering, not OS file selection permission.

Final attachment verification: navigating Chats -> original conversation retained all five selected files and enabled Send. Production `npm run build` and scoped ESLint passed; only the existing non-failing upstream Zod annotation warnings remain.

### Research and native canvas additions — September 20

- Composer Tools now supports Off / Web / Deep research. Per-conversation drafts, queued turns, retries and forks retain the captured choice. A successful send clears the next-turn choice. Fixture output states that search has not run; it does not fabricate sources.
- Browser verified Deep research selection at 390x640, send, recorded mode on both messages, next-turn reset, and desktop result rendering. Screenshots inspected; no overflow or console errors in the research journey. Conversation (23), workspace (18), context and continuity checks passed.
- Artifacts now support bounded node/edge diagrams and HTTPS image/audio/video references through the existing immutable version workflow. Diagram nodes select for details; a list provides a non-canvas alternative. Canvas resizing refits the diagram and keyboard instructions match read-only graph behavior.
- Browser created a diagram, edited JSON, saved version 2 and selected a node. Desktop/mobile screenshots inspected. Media creation/source save verified; before Load there was no media element or host request. An intentionally unavailable HTTPS source displayed recovery; Unload returned to the idle state. Mobile failure screenshot inspected. Successful remote playback was not exercised.
- Artifact lifecycle/integration/renderer/media suites, TypeScript, scoped ESLint and design guard passed. Final production build passed including the diagram resize/accessibility correction; only non-failing upstream Zod annotation warnings remain.
- Actual research execution, uploads/ingestion, media generation, arbitrary applications/3D and provider integration remain deferred. These additions do not call backend services.

### System runtime workspace — September 21

- Processes, Ports and Containers are searchable fixture-backed sections through ConkerClient. Inspectors link related records; start/stop/restart updates process/container/port states coherently. Create/edit/remove container mappings validates whole ports, supported protocols and conflicting/reserved bindings. Host listeners remain read-only.
- Browser verified duplicate mapping rejection, successful mapping creation, linked container inspection, stop confirmation with initial Cancel focus, and both related ports becoming inactive. Mobile dark inspector and 390x640 validation dialog screenshots inspected; dialog stays within 16px gutters and scrolls validation into view. Desktop process table screenshot inspected. No console errors in this journey.
- Runtime domain checks and scoped lint passed; navigation/type/design verification passed. All actions explicitly simulate only; no host services, Docker or sockets were touched. Final build result recorded with commit.
- Remaining explicit canvas gap: isolated interactive HTML preview is frontend work and is being completed; prior blanket arbitrary-app deferral did not satisfy this requirement. A privileged model/tool bridge remains separate backend/integration work.

### Completion gate reconciliation

| Area | Frontend evidence | Still required before frontend sign-off |
| --- | --- | --- |
| Conversations and calls | Recorded desktop/mobile journeys; conversation, workspace, continuity, context, voice and call suites; attachment and research increments | Preserve verified behavior; no further blanket audit |
| Agents, Teams, Templates, Projects and Activity | Lifecycle/source/draft checks and per-feature browser evidence in completion-plan.md | Backend execution is a later phase, not a missing local editor |
| Tools, Jobs and Memory | Prior editor/navigation checks, recovery fixes and graph/database evidence | Preserve existing service boundaries |
| System | be768b48, runtime checks, production build, desktop/mobile conflict/create/stop verification | Real host execution belongs to backend phase |
| Artifacts | Native formats, immutable versions, source privacy, diagram/media checks and browser evidence | Explicit-run isolated interactive HTML preview and its isolation verification |
| Owner preferences | Appearance, layout, connections, model roles and character settings exist | Reconcile reachable proactivity/security preference controls with P15/P16 |
| Final report | Incremental commits and truthful fixture labels | Complete remaining rows, verify integrated result and report frontend milestone before backend changes |

### Final feature additions — September 21

- HTML artifacts: explicit Run/Stop, immutable source/history, inert .html.txt export, nested opaque sandbox frames without a host bridge. Browser verified inline click interaction, stopped initial state, parent DOM/storage/fetch rejection, and outer-CSP blocking of self-frame navigation with no external document request. See artifact-workspace.md for limits; this is not a CPU/memory quota or general secure execution service.
- Proactivity settings now expose quiet hours, IANA time zone, urgency/urgent exceptions and daily suggestions/research/cost limits. Account exposes idle timeout. All are configured-only; no permissions, notification delivery or locking are implied.
- Browser rejected invalid timezone, retained Europe/London draft through Chats and return, saved successfully, and saved five-minute idle preference. Mobile screenshot caught a min-width clipping issue; corrected form/fieldset/select constraints and verified sections fit within the card. Desktop/light Account and mobile/dark Proactivity reviewed. No console errors.
- Artifact and preference suites, navigation, scoped lint, TypeScript and design guard passed. Integrated build passed; the final CSS-only constraint fix is included in the final verification build.

## Frontend milestone — verified September 21

Frontend fixture milestone complete at 11b155f2, following the recorded per-feature evidence above and completion-plan.md. Final integrated build passed with only upstream non-failing Zod annotation warnings; working tree was clean. HTML preview mobile/light screenshot additionally verified readable default text and no horizontal overflow using a staged fixture through ConkerClient; earlier real creation/edit/run/stop journey remains the interaction evidence.

Frontend coverage is local preview behavior, not production readiness. Server persistence, authenticated idle-lock enforcement, notification scheduling, provider research/generation, upload ingestion, model presentation/update delivery, team execution and real system actions remain backend work. Final wiring and deployment stay deferred until owner review. Browser media success playback and physical mic/camera hardware were not exercised in this audit; their stated verification limits remain unchanged.

The owner authorized automatic continuation into existing backend inventories and missing capabilities after this report. The combined goal remains active; frontend completion does not mean the backend or final integration is complete.


### Reopened narrow acceptance item - September 21

Backend contract reconciliation found that P9 explicitly names queue versus steer
versus cancel, but the accepted fixture workspace implements only queue and stop.
The steering interaction is therefore incomplete despite the earlier broad milestone.
Backend support now exists independently in Pi `a0822eb`. Add the matching fixture
control through ConkerClient, preserve drafts/queue/current-run identity, and verify
normal application, in-flight-action refusal, stopped/failed behavior and desktop/
mobile rendering. Keep backend transport disconnected. Complete this item before
expanding backend research modes; do not treat a server endpoint as frontend proof.

### Steering acceptance closed - September 21

The composer now separates Steer (current response), Queue (next message / Enter),
and Stop. Fixture steering preserves run identity and original input, resets old
partial output, saves one steering message, and returns an idempotent receipt.
Uncertain saves retain a stable request ID. Newer typed text, attachments, queued
messages, research choice and next-model choice survive. Active tool/agent actions
and unsupported retry/scenario previews refuse steering explicitly.

Verification: 25 conversation checks and 19 workspace checks pass, including
receipt replay/conflict, partial reset, finished-run refusal, in-flight-action
refusal, failed-save retry, and concurrent draft preservation. Scoped ESLint,
design guard and production build pass (existing upstream Zod comment warnings).
Impeccable detector returned no findings. Inspected 1101x913 desktop and 390x844
mobile screenshots during streaming: Steer, Stop and Queue remain distinct and
inside the composer; model label truncates on mobile. Browser click saved the
instruction and showed Applying steering, then the explicit preview response.
Focus returned to input. Browser log contained one older development HMR store
reset error at 14:49, before this navigation; no new errors during these interactions.
Final backend transport remains disconnected. This closes the narrow reopened
frontend item; backend research and other recorded gaps remain open.

### System process capability reconciliation - September 21

The process fixture now distinguishes inspection from a configured lifecycle target.
Dashboard preview is inspect-only; direct fixture calls to start, stop or restart
it fail without changing records or receipts. Container-backed samples retain
their explicit target identity and supported actions, displayed in the inspector.
Controls respect the per-process action list. This models the existing backend's
separate inventory and allowlisted lifecycle contracts; it adds no PID executor.

The focused runtime suite, scoped ESLint and production build pass (existing
non-failing upstream Zod annotation warnings). Browser inspection verified the
inspect-only explanation without lifecycle buttons at desktop and 390x844, and
restarted the container-backed Memory service with its restart count updating.
The narrow managed-target panel remained scrollable with both actions reachable.
Final transport translation, live authority and deployment remain deferred.
