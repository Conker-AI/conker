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
