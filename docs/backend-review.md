# Backend review checkpoint — September 21, 2026

Frontend fixtures are accepted, including the later steering and managed-process
capability corrections. Backend modules remain independent. No final browser
wiring, deployment, GitHub push or paid-service call was performed in this phase.

The independent backend implementation/verification phase is complete for owner
review. This does not claim deployment or end-to-end browser acceptance. After the
owner enabled Docker, the existing isolated Docker/PostgreSQL restore drill passed.
It verifies the supported held restoration path, including readable restored data,
revoked approvals and isolation during interruption. Coordinated production
promotion is not implemented. Do not remove recovery holds to resume production.

## Requirement evidence

The current source and its tests were inspected against P2–P16 in completion-plan.md.
Paths in the table are relative to the named service repository. Historical audit
notes in backend-completion.md/backend-remaining.md include superseded gaps; this
table describes the current checkpoint rather than those intermediate states.

| Package | Current independent implementation and evidence |
| --- | --- |
| P0–P1 frontend foundations | frontend-acceptance.md records fixture journeys, screenshots, themes/layouts and build. Latest narrow correction `82ac0a51` preserves accepted design and makes unmanaged processes inspect-only. |
| P2 tasks/activity | Pi tasks/activity/submissions; task lifecycle, parent links, events and atomic run association covered by task/submission suites. |
| P3 agents | Pi agents/session settings/memory authority; versioning, archive, frozen selections and actual model selection covered by agent/model-role suites. |
| P4 teams/templates | Pi collaboration/team execution/team memory; published versions, handoffs, narrowed authority, budgets and restart without redispatch covered by corresponding suites. |
| P5 projects | Pi projects/project sources/project context; scoped links/search, archive, source privacy and forgetting covered by project suites. |
| P6 context | Pi context controls/retrieval/summaries/turn context; actual prompt exclusions, exact pins, helper privacy, reviewed summaries and original history covered by context suites. |
| P7 providers/roles | Pi model roles/providers/direct providers/evaluations; manual selection, eligibility, bounded fallback, attempt records and saved evaluations covered by role/provider suites. Real account/model quality is not established by mock transport. |
| P8 artifacts | Pi artifacts/artifacts API/downloads; immutable versions, source/task provenance, edits, restores and inert exports covered by artifact suites. HTML isolation is frontend-owned. Automatic media generation is not this accepted API. |
| P9 conversations | Pi drafts, submissions, queue/worker, message forks, retries, cancellation, steering/search; durable boundaries and no duplicate effects covered by corresponding suites. |
| P10 tools/jobs | ToolGate publications/nested execution/spending; Pi jobs/execution/worker/allowances; pinned versions, deterministic scheduling, overlap, recurring allocation and lost replies covered by tool/job suites. Source editor remains JSON; no arbitrary-code sandbox claim. |
| P11 files/research | Pi attachment passages/citations/PDF/image adapters/research/downloads; bounded Web/Deep plans, search/fetch provenance, text-layer PDF, still images and DOCX/XLSX covered by focused suites. OCR/video unsupported; citation identity does not prove factual accuracy. |
| P12 memory | MemoryGate memory/runtime/evidence/corrections/conversation ingestion; Pi scoped clients/proposals. Revision, namespace, revocation, filtered ingestion and reviewed corrections covered by memory suites. |
| P13 calls | Pi calls/speech/audio decoder/character/reference voice; typed and speech turn contracts, interruption, text fallback, replay, frozen reference and validated STT timestamps covered by call/speech suites. Real voice quality/latency, physical devices and browser transport remain unverified. No retained call audio or generated-word timing claim. |
| P14 system | ToolGate inventory, allowlisted service/container lifecycle, directory inspection and reviewed port replacement; Pi authenticated transport and terminal. Synthetic Docker checks plus real Linux PTY/filesystem checks. Unknown intermediate mutations remain held, never silently replayed; automatic rollback/cleanup is not an accepted frontend operation. |
| P15 auth/recovery | Gateway fresh verification/revocation; durable journals; offline snapshots/deletion replay/index cleanup/receipt reconciliation. Joint test preserves retained history, rejects restored authority and avoids duplicate effects. Live Docker/PostgreSQL held restore/interruption drill passes; production promotion remains unsupported. |
| P16 continuity | Pi source-linked summaries, durable polling, shown/read acknowledgements, privacy, quiet hours/urgency and atomic budget reservations. Corresponding suites cover delivery and policy. No autonomous dispatcher is activated by setting budgets; external push is unconfigured. |
| P17 deployment | Outside this phase; owner review precedes wiring and server deployment. |

## Verification performed

- Pi `da52384`: full suite **1,039 passed, 8 skipped** on Windows.
- ToolGate `558d3e3`: full suite **640 passed, 8 skipped** on Windows.
- MemoryGate `e2c0ddd`: full API suite **106 passed, 7 skipped** with temporary SQLite.
- Linux follow-up: **27 filesystem checks** and **1 real gateway/PTY check** pass
  under WSL. This covers the platform-specific cases skipped by Windows; these
  numbers overlap the broad filesystem suite and must not be added as unique tests.
- Companion offline recovery previously **33 passed on Linux**; new joint actual-
  module reconciliation test **1 passed** against temporary SQLite and embedded Qdrant.
- Live Docker Linux engine 29.5.3: existing opt-in Docker/PostgreSQL restore and
  interruption drill **1 passed in 58.25 seconds**. It uses pinned fixture images,
  temporary stores and network-isolated helpers. Restored data was queried, stale
  approvals rejected and interrupted restore isolation inspected. No named drill
  or recovery containers remained afterward; no global Docker cleanup was run.
- Frontend managed-target correction: runtime suite, scoped ESLint, production build,
  desktop and 390×844 browser checks passed. Known dependency deprecations and Zod
  annotation warnings are non-failing.

Live-service module-contract skips remain unverified. These results do not prove
production operation, remote PostgreSQL/Qdrant, paid providers, physical audio devices,
or final end-to-end browser integration. Re-run only the relevant checks when those
environments become available; no broad-suite repetition is needed without changes.

## Owner review and next phase

Stop here for owner review as requested. Review the accepted fixture frontend and
independent backend contracts/limits, then separately authorize final transport
wiring and server deployment. Configured-service health, real provider/voice quality
and one real end-to-end owner task belong to that later environment acceptance.
Unrestricted recovery automation, autonomous research dispatch and GPU/video
perception were not added. All implementation checkpoints are local Git commits.
