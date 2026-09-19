# Chat delivery progress

September 19, 2026. Scope: Steps 0–7 of the [chat delivery plan](chat-delivery-plan.md). Frontend only. Implementation commit: `238aacb7`; subsequent review fixes and documentation follow in this branch.

## Acceptance ledger

| Package | State | Owner | Evidence / next check |
| --- | --- | --- | --- |
| Baseline and shared contracts | Verified | Coordinator | Clean `0c0fcc52` baseline; source IDs, response/context families, queue snapshots and public activity contracts. |
| Rich responses | Verified | Rendering agent | 7 check groups; browser code/CSV copy, math, expanded table and supplied citation/source rail; desktop light and mobile dark screenshots. |
| Queued turns | Verified | Continuity + coordinator | 13 workspace tests; browser enqueue during streaming, pause, edit, resume and partial Stop. |
| Versions and branches | Verified | Continuity + coordinator | 7 continuity groups and 21 conversation checks; browser retry 2/2 → 1/2, continuation fork and earlier edit in its own fork. |
| Execution previews | Verified | Execution agent | 8 activity groups; browser named agents/handoff, tool disclosure, inspector and real bundled-file download event. |
| Character transitions | Verified within limits below | Execution agent | Character/activity tests; Character-mode browser check; source review of motion gates, announcements and failed-playback fallback. |
| Integration and independent review | Verified within limits below | Coordinator + peer reviewers | Build/design guard, changed-file lint, existing regression suites, desktop/mobile screenshots and console inspection. |

## Ownership

Coordinator owns shared contracts, workspace/composer/thread/rail integration, dependencies and browser control. Rendering owns new renderer/helpers/tests. Continuity owns adapter branch semantics, message actions and isolated queue/version helpers/components/tests. Execution owns activity components/helpers/fixtures and character fallback. Shared changes are coordinated before edits.

## Boundaries

- Ordinary preview replies never pretend to execute tools or spawn agents. Rich execution cases require explicit development fixture selection.
- Queues and transcript versions remain in memory. No private transcript/media persistence added.
- Source metadata and public activity summaries are supplied evidence, not invented URLs or hidden reasoning.
- Text retries never replay a selected action scenario. Waiting approvals remain blocking even after a later retry succeeds.

## Validation record

- `npm run build`: passed, including TypeScript and design guard (178 reachable source files).
- `check:rich-answer` 7 groups; `check:chat-continuity` 7; `check:chat-workspace` 13; `check:activity` 8; `check:conversation` 21; design-guard self-tests 16: passed.
- Existing `check:voice`, `check:calls`, `check:character`, `check:theme`, `check:navigation`: passed.
- ESLint on changed TypeScript/TSX files: passed. A broader run still reports 14 errors and 4 warnings in unchanged legacy/template files (purity/effect/refresh rules and table compiler warnings). This milestone does not claim repository-wide lint is green.
- Browser: 1440×900 desktop and 390×844 mobile, light/dark, existing Vercel preset plus temporary radius 1.0, expanded/collapsed sidebar and inset shell. Original radius restored afterward.
- Code copy matched source; CSV copy matched rows; expanded table and citation rail worked; bundled receipt triggered a download. Retry/version/fork and earlier-edit paths verified. Stop preserved partial output. Queue pause/edit/resume worked. ScrollTop stayed 0 through queued dispatch and completion while reading old content; explicit jump restored latest content.
- Incognito opens its two-switch dialog; call opens and ends with camera/microphone off. Existing dictation lifecycle is covered by tests, not a new physical microphone test.
- Console inspection after these flows: no captured warning/error entries.
- Keyboard dialogs/menus and focus were checked. Motion suppression and announcement frequency were inspected in source; no claim of a physical screen-reader session or OS-level reduced-motion/media-policy test.

Independent review fixed queued text edited after a failed reply; authority changing between user-save and dispatch; unintended later reply-target inheritance; retry replay of an action scenario; pending approval bypass via retries; queued dispatch forcing scroll; CSV math duplication; unbounded citation previews; light-theme syntax contrast; and blocked video playback without portrait fallback.

Build notices remain for upstream Zod PURE comments and Vite's conversation chunk size (approximately 684 kB minified / 206 kB gzip). A later performance pass can split expensive renderers further; these notices do not fail the build.

## Reviewed screenshots

These are frontend fixtures, not connected AI services.

| View | Evidence |
| --- | --- |
| Named-agent activity and reference rail | [Desktop dark](images/chat-milestone/activity-desktop-dark.png) |
| Rich response | [Desktop light](images/chat-milestone/rich-desktop-light.png) · [Mobile dark](images/chat-milestone/rich-mobile-dark.png) |
| Expanded table | [Mobile dark](images/chat-milestone/table-mobile-dark.png) |
| Paused, edited queue | [Mobile dark](images/chat-milestone/queue-mobile-dark.png) |
| Existing theme with radius override | [Desktop dark](images/chat-milestone/chat-custom-radius-dark.png) |

## Solid, preview and deferred

Local rich rendering, copy/export, queue editing/validation, version browsing and explicit forks are implemented. Each queue has up to five captured turns; changed authority/context pauses it for review. Versions keep their own evidence/model/partial status. Raw HTML stays inert, remote Markdown images never fetch, links are validated and CSV exports neutralize formulas.

All model/tool/subagent execution remains **Preview**. The development scenario selector requires a development build and `?fixtures=1`; it is absent from ordinary/production chat. Transcripts, queues, versions and forks remain memory-only and reset on reload. No durable worker, provider call, server privacy enforcement, real reconnect, upload pipeline or external action was added.

To inspect examples locally, open `http://localhost:5173/chat/week?fixtures=1`, choose a Development preview scenario, then send a test message. The selection applies only to that next reply. Use the long-response scenario to exercise queuing and scroll preservation. Reload resets fixture history; remove the query parameter to return to ordinary chat.

Backend event transport, durable storage, approvals/permissions enforcement and real model/tool orchestration remain integration work. Workflow canvases, memory graphs, server/Docker controls, new emotion art, inferred emotion, voice cloning and realtime AI services remain deferred. Fixture checks do not establish physical camera/microphone or external speech-service operation.
