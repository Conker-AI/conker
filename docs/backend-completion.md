# Backend completion ledger

Frontend fixture milestone: Conker commit `eec445d2`. Backend work follows it; final dashboard wiring, deployment and pushes remain excluded until owner review. Existing services stay independent.

## Inventory and work order

1. **Preserve existing runtime:** Pi already has durable tasks, submissions, run events, transcript provenance and recovery; ToolGate already has exact approval binding, effects and execution receipts; MemoryGate already has CRUD, evidence, ingestion receipts and forgetting tombstones. Do not rebuild these.
2. **Revision integrity:** MemoryGate manual edit/delete revision protection committed `a4828a1`; 34 focused regression tests passed, then five revision-specific tests including competing deletion passed. Content/audit/conflict mutations are atomic. PostgreSQL migration execution on a staging database remains unverified. ToolGate stored version allocation/stale update checks are in progress.
3. **Owner preferences:** Pi `c11a37c`, 45 tests passed. Durable revisioned preferences plus timezone/urgency/budget policy functions. Scheduler admission, reservations and idle enforcement are still outstanding; storing settings is not enforcement.
4. **Agent definitions:** Missing Pi lifecycle/revision/history APIs; implementation in progress. Follow with versioned templates and teams, bounded handoffs, immutable run snapshots and explicit grants.
5. **Projects/artifacts:** Missing durable stores and APIs, source references/privacy checks, immutable artifact versions, restore/export and scoped project context. Reuse session/task IDs.
6. **Context/model roles:** Existing global prompt, MemoryGate package, full history and summary forks remain. Add explicit scoped instructions, exact pins/history policies, token budget feedback and per-turn selection records; configurable routing/summary/selection roles and manual locks with provider eligibility/fallback tests.
7. **Tools/jobs:** Add immutable published definitions and pinned calls, bounded nested execution, deterministic timezone schedules/overlap policy, receipts and independent scheduler verification. Existing spending jobs are budget envelopes, not scheduled triggers.
8. **Conversation/media/research:** Audit durable drafts/branches, retry/queue/steer/cancel, attachments and supported processing, source citations and deliverables against frontend contracts. Capability limitations must be explicit. Calls need session association, interruption/output/device policy and retention; avoid claiming browser STT provides a server voice service.
9. **Memory proposals:** Pi must persist exact owner-review proposals; MemoryGate supplies revision-safe mutations/evidence. Candidate analysis is not an approval record. Reconcile existing auto-ingestion with the approved retention policy before changing behavior.
10. **System operations/security:** SystemGate stays read-only telemetry. Bounded file/terminal/container effects belong through ToolGate, with authorization, reauthentication, receipts and recovery. Reuse current gateway operation verification and existing auth stores.
11. **Completion gate:** Map each P2–P16 requirement in completion-plan.md to real backend behavior and independent evidence; test restart/recovery and backup restore. Stop for owner review before wiring or deployment (P17 deferred).

## Verification limits

Local temporary test databases only. No user database migration, external effects or live secrets used. Current commits are foundations, not a declaration of backend completion. New frontend capability contracts must remain separate from fixture behavior and from browser gateway integration.

## September 21 backend increments

- ToolGate `3297be4`: atomic server-allocated definition versions and optional stale-edit preconditions; 57 focused tests passed. Publication/execution pinning remains in progress.
- Pi `e16295f`: strict agent configuration, immutable history, singular companion protection, archive/restore and owner-only APIs. Definitions do not yet configure session execution or confer grants.
- Pi `295851f`: durable revisioned projects, archive/restore/removal rules, live-source resolution contract, privacy-aware context metadata selection and owner APIs. Unknown source privacy fails closed. Authoritative session privacy/file resolution is still required before live linking; no caller labels used as authority.
- Combined Pi project/agent/preference/store/task tests: 68 passed. Project scoped Ruff checks pass. Teams/templates implementation is next; no claim of full backend completion.

- Pi `c922556`: runtime session instructions/history policies, atomic per-turn policy capture, estimated budget conflicts and offline forgetting cleanup. 54 context/loop/submission/forgetting tests passed; scoped Ruff clean. Reviewed fork transfer, retrieval selection, summary editing, inherited instruction layers and effective input snapshots remain open; configured policies currently block forks rather than losing pins.
- ToolGate `c633a0b`: immutable publication/history catalogue committed, with exact child snapshots and bounded dependency validation; pinned execution/approval identity implementation is in progress.

- Pi `04555ca`: reviewed context fork with exact revision/message boundary, idempotent request receipt, original-message pin references and no duplicate memory ingestion. 56 focused tests passed. This resolves the reviewed-fork transfer gap above; automatic summary forks remain blocked for explicit policies.
- Pi `a08e1dd`: persistent templates/teams, immutable published/prepared definitions, role selections/budget checks, archive/removal safeguards. 72 focused tests passed. Actual team dispatch remains to implement.
- MemoryGate `92d8598`: complete runtime context restricted to selected IDs or receipt-proven conversation scope; broad briefing/entity/episode helpers excluded. 31 focused tests passed. Pi enforcement is being implemented through immutable session settings and privacy snapshots.
- Artifact persistence, session privacy enforcement and published execution are in progress in separate owned modules. Final backend audit remains open.

- Pi `bb8a292`: durable model catalogue/role configuration and provider-independent dispatcher, explicit locks, typed router choices, bounded transport calls and configured fallback. 51 model-role/readiness/audit/routing tests passed. Per-turn model integration in progress; credential provisioning/direct provider adapters remain separate gaps.
- Pi `42a9095`: immutable session/submission/turn selections, future-turn privacy, restart-safe no-memory ingestion eligibility, scoped retrieval verification, specialist instructions/tools, no-harness helper exclusion, artifact/model API hooks. 109 affected tests plus focused integration checks passed. Explicit models fail closed until model role integration; specialist memory requires authorized namespace mapping.
- Pi `23c3c32` and `5fb76b4`: artifact persistence/versioning/export and integrated offline forgetting; artifact/forgetting suites 36 passed. Assistant citation storage is in progress; no derived citation claims from mere retrieval.
- ToolGate `d14f701` and `2a84c4c`: explicit published execution/digest-bound approvals/receipts, then transactional key/scope/lockdown revocation at each dispatch. 94 execution tests and 93 focused authority regression tests passed. Bounded nested published workflows are in progress.

- ToolGate `8b80131`: bounded nested published workflows with isolated arguments/variables/tool snapshots, shared ancestor ceilings, scope intersection and deterministic child receipts. `0c27046`: caller-supplied publication digest precondition rejects mismatches before approval consumption or effects. Final combined targeted suite: 41 passed; working tree clean.
- Pi `adbf880`: actual answer/summary dispatch consumes frozen model-role configuration; explicit agent overrides remain locked and dispatch records requested/actual models. Agent verification: 76 passed; parent combined jobs/model-runtime/submission verification: 39 passed. Direct provider adapters and context-selection integration remain open.
- Pi `c5f10bb`: actual provider citation evidence now persists atomically with replies, carries through artifact versions/export, and is scrubbed by offline forgetting. 97 affected tests and 17 focused citation checks passed. Retrieval alone never creates a citation claim.
- Pi scheduled admission: timezone/DST calculations, frozen run definitions, coalesced missed ticks, skip-overlap policy, stable manual requests and single-use dispatch claims implemented. Ten focused schedule/API/restart tests passed. Timer worker, scoped ToolGate adapter, approval reconciliation and owner budget admission remain open; no automatic work enabled.

## Latest backend checkpoint

- Pi `7658635`, `764d1dd`, `9a2c31b`, `bfc4ea7`: scheduled definitions/admission, scoped pinned execution, receipt reconciliation, saved approval resume and opt-in timer lifecycle. 29 focused tests passed. No worker enabled on owner services. Paid grant provisioning and proactive budget reservations remain open.
- Pi `0887456`: project conversation/task references resolve against current source metadata and historical privacy. Seven project tests passed. File provenance and runtime project content assembly remain open.
- Pi `f54bc35`, `cbf8907`: durable chat/task drafts with optimistic revision checks, atomic exact-revision consumption during submission binding, concurrent-edit preservation and physical forgetting. 45 draft/submission/forgetting tests passed. Attachment drafts remain open.
- Full Pi regression checkpoint at `cbf8907`: `python -m pytest tests -q --disable-warnings --maxfail=5` completed with **439 passed, 7 skipped, 1 warning** in 74.65 seconds. Skipped checks are not completion evidence; external module-contract availability is separate from local behavior. The warning is Starlette's httpx test-client deprecation. No frontend changes or deployment.

Remaining acceptance includes team execution, project/context assembly and summary management, model evaluations/direct adapters, attachments/research outputs, memory proposals/retention, call service behavior, bounded system effects, proactive policies and recovery/backup verification. These are not satisfied by the regression count. Final frontend/backend wiring remains deferred until review.
