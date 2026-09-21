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

Remaining acceptance includes team memory authority and stronger provider-side spending ceilings, direct model-provider adapters, richer attachment/research outputs, additional retention controls, call service behavior, bounded system effects, proactive policies and coordinated recovery. These are not satisfied by the regression count. Final frontend/backend wiring remains deferred until review.

## Subsequent verified increments

These entries supersede the corresponding open items in the historical checkpoints above.

- Pi `148af10`: project instructions/revision are captured with the submitted session settings and applied to the answer. Linking a project does not silently import transcripts, memory scopes or grants. Linked-content context assembly remains open.
- Pi `2a0dbe2`, `156d8f3`: editable/restorable summary versions, including automatic summary history. Original messages and exact pins remain available. Source attribution is session-level, not per-sentence semantic verification.
- Pi `953b2cc`: privacy-aware conversation text search with literal matching, pagination and stable message references. This is not cross-library semantic search.
- Pi `d22bf13`, `a0168d2`: saved revisioned model evaluation cases and actual configured helper dispatch, frozen configuration, bounded output and durable restart/replay receipts. Exact-ID and literal-fact scoring does not establish semantic correctness or promote models automatically.
- Pi `b08cdc9`, `a0168d2`, `35c8347`, `0460fb2`, `ce4fff7`: bounded attachment storage, provenance and physical forgetting; plaintext attachment reservation/binding in actual submissions; untrusted context placement; safe metadata on message reads. PDF/media processing remains explicitly unsupported. Attachment-bearing automatic forks require an explicit fork/reupload.
- Pi `8b9e719`, `9af5022`: context retrieval now has an actual configured helper invocation, frozen candidates and one durable selection per submission. Exclusions, exact pins and no-harness restrictions are enforced; replay, history inspection and startup recovery do not invoke the helper again. Schema/startup hooks are integrated. New helper/test lint passes; 13 focused checks passed after formatting, following the broader regression below.
- Pi `fd27067`: temporary snapshot restoration verifies transcripts, drafts, attachment bytes and submission identities. Interrupted preparations and ambiguous scheduled effects are not rerun. This does not verify recovery from an older snapshot after later external effects or forgetting: cross-service reconciliation, gateway-session invalidation and deletion replay remain open.
- Integrated Pi regression: **512 passed, 7 skipped, 1 warning** in 92.08 seconds. Seven module-contract tests require a live service and remain skipped; no service was deployed or enabled. The warning remains the Starlette/httpx test-client deprecation. Frontend is unchanged.

## Teams and selected project context checkpoint

- Pi `fb5a82a`, integration `8f90c1d`: actual owner-directed team role execution through existing Loop, Tasks and submission receipts. Frozen team/agent/model definitions, isolated role sessions, explicit bounded handoffs, role tool subsets, actual provider-call usage records and restart/replay protection. Context payloads retain provenance; source forgetting reaches the derived sessions. No implicit permission union or automatic natural-language handoff-condition evaluation.
- Team turns/handoffs have strict count limits. Token/cost limits require explicit acknowledgement that they are observed stops: the current call may overshoot, unknown usage blocks later calls, and a response reaching the threshold is conservatively discarded before it can trigger tools. Zero cost allowance blocks execution. Role memory currently requires `none`; specialist namespace authority and hard transport-side spending reservation remain open. These limits are visible in API contracts/docs rather than represented as fully enforced budgets.
- Pi `8f90c1d`: explicit `projectSources` in session settings now feed real model turns. Linked conversation/task message IDs and plaintext file hashes are frozen per submission; privacy/availability are checked on each read. No implicit transcript import from merely selecting a project, no tool payload import, no source-text copy in configuration snapshots. Size violations fail rather than truncate. Project context participates in normal context budgets and grants no authority.
- Source-to-consumer dependencies expand offline forgetting transitively. The preview names all affected sessions, including derived replies. Read-only inspection does not register a dependency. Task sources resolve actual `turn_messages`/`task_runs` associations; later source messages stay outside the frozen selection.
- Full integrated run during this increment: **532 passed, 7 skipped, 1 warning** (99.33 seconds). After the last task-source correction and additional team cases: **47 focused tests passed** across team/project execution, source/instruction resolution and forgetting. New modules/tests pass Ruff; legacy unrelated formatting was not rewritten. No frontend wiring, live network effects or deployment.

## Reviewed memory correction checkpoint

- Pi `cbbc4a6`: exact immutable correction proposals, fetched baseline/revision, stated/inferred basis and owner-message evidence, explicit apply/reject, once-only dispatch claims, conflict handling, interrupted/unknown receipt reconciliation and owner-only APIs. Dedicated correction transport uses neither MemoryGate's admin nor read/ingestion credentials. Unknown outcomes are never retried automatically. Pi's proposal/private-message/forgetting suites: **41 passed**, then **7 proposal checks passed** after final validation refinements; new files pass Ruff.
- MemoryGate `89abf87`: namespace-bound dedicated correction capability, authoritative baseline read, revision-CAS text and exact-summary update, unchanged source type/confidence, audit/history and idempotent receipt in one SQL transaction. Vector indexing state is separately visible. **29 tests passed** across corrections and existing revision behavior, including competing writes, rollback and committed-timeout reconciliation. PostgreSQL-specific live behavior remains unverified; tests use temporary SQLite and a stub index boundary.
- Applied corrections are independently reviewed saved memories. Forgetting the source chat scrubs Pi's proposal/baseline/reason but does not undo the separate approved MemoryGate edit; this retention distinction appears in API results and docs. Existing conversation evidence ingestion was not silently replaced with proposal-only retention. Correction capability remains unconfigured unless explicitly provisioned; no credentials, user databases, frontend transport or deployments were changed.

## Bootstrap authority integrity

- MemoryGate `703a0a8`: verified the earlier simple revocation fix and closed the remaining combined rename/rotation gap. Bootstrap now binds to a permanent key identity; revoked, rotated, renamed or deleted keys cannot silently produce fresh authority on restart. Ambiguous pre-upgrade keys fail closed for owner provisioning review; concurrent seeders retain one identity.
- Verification: **15 authentication/destructive-action checks passed**, followed by **8 bootstrap checks passed** with the final concurrent-seeding case. New/changed model and test lint passes; service undefined-name checks and diff check pass. Existing metadata initialization creates the additive binding table; no live database migration or restart performed. Pi `9976a8e` corrects stale bootstrap guidance. This closes a concrete P15 revocation issue, not the remaining cross-service recovery acceptance.

## Companion continuity input

- Pi `01c3686`: owner-readable unseen work feed from actual task/run events, latest-state projection, source links and attention flags. Read-only inspection never acknowledges work; explicit atomic acknowledgements survive restart. Private/forgotten sources are excluded, pagination is bounded, and later status changes remain unseen independently of older acknowledgements.
- Quiet-hour/proactivity suppression is explicit; manual viewing remains available. No invented urgency, generated briefing or configured outbound delivery is claimed. Scheduled-job outcomes outside the task/run ledger, notification transports, generation and proactive budget reservations remain open.
- **26 continuity/preference checks passed**, followed by **20 continuity/task checks passed**; new files pass Ruff and diff check. No frontend wiring or services enabled.

## Durable call runtime and configurable speech

- Pi `035afd2`: cooperative interruption checks around each actual configured provider attempt, including routing and fallback. An interrupted call cannot be interpreted as a provider failure that permits another model invocation.
- Pi `f708448`: configurable English transcription/synthesis HTTP adapter with validated PCM WAV input/output, bounded duration/size/deadlines, actual optional segment timestamps, static errors and no automatic retries. No default speech host, installed model, hardware capture or live-provider verification. **44 synthetic transport/audio checks passed**; primary implementation references and compatibility limits are in Pi's `docs/speech-adapters.md`.
- Pi `49316ec`, integration `8bd352f`: durable calls linked to separate child conversation sessions; actual Loop turns; referenced source history/pins/summary; inherited privacy; independent input/output preferences; future-request model selection; idempotent STT/model/TTS reservations; pause/end/interruption and restart inspection. Completed text survives synthesis failure. Raw audio is transient, while text remains a normal retained transcript. Parent conversation forgetting reaches call transcripts and fingerprints.
- Guards cover helper/answer attempts, tool dispatch and the final reply transaction. Stop cannot recall an effect already dispatched; completed effects retain truthful acted/no-reply state. Generic conversation settings cannot relax call privacy. Speech configuration remains optional and the owner API reports unavailable capabilities explicitly.
- Verification: **81 existing Loop/submission/privacy/context/forgetting checks passed**, then **83 focused call/speech/model/API checks passed** on the integrated increment. New modules/tests pass Ruff; shared legacy files pass undefined-name checks and diff check. No frontend changes, final transport wiring, live device tests, service activation or deployment.
- P13 is still partial: this is bounded utterance HTTP transport, not low-latency streaming media. Word-aligned playback, acoustic interruption detection, configured character/emotional voice behavior, incoming calls and cross-device handoff remain open. Camera/perception and GPU character rendering remain outside this increment. Calls currently reject oversized context rather than silently forking away from their linked session. These limits must not be represented as complete real-time call acceptance.

## Authored character persistence and presentation

- Pi `fe3b9e9`: per-agent character profiles matching the existing frontend studio, including the singular Companion; revision-CAS saves, immutable history/restore, owner-only import/export and bounded embedded artwork/reference metadata. Imports become reviewed drafts. Archived profiles cannot be edited, and character configuration grants no tools, memory or credentials. Package/media/history bounds are explicit; inert media validation is not proof of codec playback. **16 focused storage/API tests passed.**
- Pi `f96bd16`: actual Loop context consumes frozen owner-authored presentation settings. Focus omits persona lore from new presentation instructions; Character includes personality/style/soul/backstory/relationship/details. Earlier conversation history is preserved, and model compliance is not guaranteed. Session presentation overrides, call defaults/accepted-request mode and per-team-role character snapshots preserve future-only edits. Profiles are frozen before call transcription; media bytes and authored example dialogues stay outside model snapshots.
- Saved turn selections, including profile revision, are inspectable through the owner session-settings API. Voice description/pronunciation/reference/delivery remains persisted configuration; no unsupported Qwen voice-design, cloning, emotional synthesis or motion capability is claimed. These capabilities and low-latency call transport remain open.
- **76 focused character/context/session/call/team/API checks passed** after integration; new/changed scoped lint and shared undefined-name checks pass. Local commits only; frontend and final wiring unchanged.

## Scheduled continuity and runtime inventory

- Pi `24316b4`: scheduled-job outcomes join the same bounded, paginated continuity feed as tasks/runs through an additive append-only ordering index. Transactional triggers record actual status changes, including receipt reconciliation; acknowledgement migration preserves previously seen activity. Jobs retain their real job/run/version identity rather than receiving fictitious conversation links. Historical outcomes are explicitly `state-observed`, not newly completed events. The feed excludes arguments, outputs and raw errors, and does not dispatch work or deliver notifications.
- **54 continuity/job/task/forgetting checks passed**; new/changed scoped Ruff and diff checks pass. Notification transports, generated briefing and proactive spending reservations remain open.
- SystemGate `b4654e2`: authenticated, bounded `/runtime` inventory reuses psutil/Docker collectors. Stable process identity includes creation time with PID-reuse checks; container bindings distinguish configured mapping from observed listening; sections expose timestamps, source scope, truncation and static partial-failure codes. **Six mocked collector/authentication checks passed**, independently rerun by the parent. No live service or machine inventory was accessed.
- P14 remains partial: a fixed telemetry adapter through ToolGate/Pi, managed lifecycle, port remapping and reviewed system effects remain missing. Inventory capabilities explicitly report mutations/files/terminal unavailable; no arbitrary PID restart ownership or Docker reachability is inferred. Docker timeout and row/scan bounds are not a hard wall-time/allocation guarantee for OS collectors. All changes are local; final frontend wiring and deployment remain deferred.

## Scoped SystemGate telemetry adapter

- ToolGate `56370bc`: fixed, operator-configured GET `/runtime` adapter with no caller-controlled destination, path or headers. Bounded streamed response, explicit timeout/deadline limits, strict read-only schema, no redirects/proxies/retries and static errors. Secrets and upstream failure bodies are not returned. **34 synthetic HTTP checks passed.**
- ToolGate `00a408c`: `system.inventory` uses normal scope, owner authorization, publication and durable invocation receipts. Registration creates only a missing definition and preserves owner edits/disabled state; no key/scopes are issued. Known read failures remain failed-read receipts rather than unknown mutations. Generic public HTTP restrictions remain unchanged.
- SystemGate `c441366`: fixed references to omitted processes under result caps and duplicate observations. Parent synthetic contract check confirms actual collector output is accepted by the ToolGate schema. **89 combined adapter/boundary/authority/public-HTTP checks passed**; six SystemGate mocked checks also passed. New/changed scoped lint and diff checks pass.
- Remaining P14 work includes Pi owner-facing inventory projection and reviewed managed effects. No process/container mutation, port remapping, filesystem access, terminal execution, live service activation or final frontend wiring was added.

## Owner inventory receipt checkpoint

- Pi `048c7c4`: authenticated owner inventory requests use the existing scoped ToolGate client. Stable request IDs bind exact limits before dispatch; concurrent/replayed requests do not invoke twice. Saved approvals resume explicitly, interrupted reads reconcile the original receipt, and new samples require new identities. Pi stores request metadata rather than duplicating host observations. Original sample age, partial results, unavailable receipts and missing configuration remain explicit.
- ToolGate `70d6bd5`: reserves `system.inventory` for the fixed read-only executor, enforced at definition validation and dispatch. Repurposing the reserved name into a different executor cannot turn Pi's inventory endpoint into a mutation path. Existing scope, authorization, revocation and receipt policies still apply.
- Verification: **33 Pi inventory/client/gateway checks passed**, including owner authentication, concurrent requests, restart, approval resume, invalid results and configured-client transport. Scoped Ruff, shared undefined-name and diff checks pass. ToolGate's prior **17 boundary/authority checks passed** for the identity guard. Tests use temporary stores and synthetic transports; no host inventory or live service was accessed. Pi and ToolGate changes are committed locally.
- P14 remains incomplete. Source inspection confirms the accepted runtime fixture exposes process/container start/stop/restart and container port-mapping edits; these still need managed execution with reviewed effects. The terminal explicitly requires a separate authenticated shell transport, while SystemGate currently promises read-only telemetry. Do not silently broaden that telemetry credential into shell/write authority. Files and terminal transport, managed lifecycle and port changes remain implementation work, not satisfied by this read endpoint. Frontend wiring and deployment remain deferred.

## Managed container lifecycle checkpoint

- ToolGate `9df95f8`: optional Docker Unix-socket adapter for start/stop/restart of explicitly allowlisted full container IDs. Fixed versioned inspect/action/inspect routes, bounded response projection, config recheck before mutation, no shell, URL, container creation or automatic retries. Separate independent exceptions distinguish known pre-dispatch failures from uncertain post-dispatch outcomes. Docker response configuration/environment fields never appear in the projected receipt.
- ToolGate `23e1b17`: reserved `system.container-control` tool requires scoped access and exact owner confirmation through the existing execution journal. Registration preserves owner changes and issues no authority. Definition/dispatch guards prevent repurposing the reserved identity or dropping required confirmation. Known failures persist; ambiguous effects stay unknown on replay. Published-workflow approval rules continue to apply.
- **67 adapter, boundary, inventory, journal and published-execution tests passed**, including the real adapter through a synthetic Docker transport behind owner approval, changed-action rejection, key revocation, stored-before-dispatch and one-mutation replay behavior. Scoped Ruff/shared undefined-name/diff checks pass. All commits are local; no real daemon, container, socket provisioning, deployment or frontend changes.
- Limits: the configured Unix socket carries substantial daemon authority; the allowlist constrains this executor, not a compromised ToolGate process. Socket-path validation does not identify replacement of the daemon behind that path. The 25-second checked deadline can overrun during a bounded blocking read. A later running state cannot establish whether an uncertain restart happened. Pi owner operations, managed target discovery, process lifecycle, port changes, files and terminal transport remain open; P14 is not complete.

## Owner container-action API

- Pi `a00c42c`: owner-only `/system/actions` create/history/inspect/resume routes delegate exact full container ID and start/stop/restart to ToolGate. Request identity is reserved before transport, conflicting reuse fails, concurrent request/resume dispatch is serialized, and startup recovery marks interrupted requests unknown without replaying effects. Pi grants no approval; resume carries the original ToolGate approval ID. History reads are local and side-effect free.
- Receipt inspection validates exact action/target and projects only bounded before/after state fields. Malformed success remains unknown rather than inventing a failed effect. Failed receipt access preserves known completion. Request metadata is stored in Pi; detailed effect receipts remain ToolGate's responsibility. No Docker socket or new system credential is introduced into Pi.
- **29 focused action/inventory/client checks passed** with temporary SQLite, concurrency, restart, owner authentication, malformed receipts, conflicting arguments, saved approvals and the actual ToolGateClient against synthetic HTTP responses. New scoped Ruff, shared undefined-name and diff checks pass. No real gate/daemon service or container was contacted. Local commit only.
- Limitations: latest history is bounded, not a paginated full audit export; a lost initial approval reply may remain unknown if no execution receipt exists. Generic gateway/frontend transport and operation-bound password verification are still deferred to final wiring. Managed-target discovery, process lifecycle, port remapping, files and terminal remain P14 work. No full backend-completion claim.

## Managed target discovery

- ToolGate `c3f86c0`: scoped `GET /v2/agent/system/targets` returns configured full container IDs and lifecycle actions without contacting Docker or exposing the socket path. Disabled/locked-down/unconfigured states have no usable targets; revoked or unscoped keys are rejected. Configuration is explicitly `observed=false`, not invented live inventory. Existing mutation-time authorization remains authoritative.
- Pi `d5c3a83`: owner-only `/system/targets` reads that catalogue through a bounded, validated transport; no redirects, compressed response, unchecked actions, inferred observation or credential-bearing result. Missing/malformed/inaccessible data is unavailable rather than successful empty inventory. Responses prohibit caching. Final frontend/gateway wiring remains deferred.
- **37 ToolGate target/lifecycle/boundary checks and 20 Pi target/action checks passed**; scoped lint, shared undefined-name and diff checks pass. Temporary stores and synthetic transports only; no daemon or service accessed. Both repositories committed locally.
- Limits: catalogue contains configured IDs only; no health/existence guarantee and no claim that SystemGate observes the same daemon. Transport deadlines are checked between reads and can overrun during the configured blocking read timeout. P14 still requires process controls, reviewed port changes, files and terminal behavior; backend completion remains unproven.

## Managed service controls

- ToolGate `f04c40f`: fixed systemctl adapter for explicitly configured systemd services, with scoped IDs such as `user:worker.service`. Scope is bound into the approved target; current allowlist/scope is rechecked before mutation. Fixed argv, no shell/sudo/prompt, controlled environment and exact before/after state projection. Service aliases resolving to another unit and unavailable units fail before dispatch. Timeout or other post-dispatch errors remain unknown; no automatic retry.
- ToolGate `07063b8`: reserved `system.process-control` registration, validation and dispatch require owner confirmation and reuse scoped authority/publication/journal checks. `/v2/agent/system/services` exposes configured targets without process execution, no-store and explicitly non-observed. Existing owner-disabled definitions are preserved. No arbitrary PID or reconstructed startup command is accepted.
- **90 focused adapter, process/container boundary, target-discovery, journal and publication checks passed**; scoped lint/shared undefined-name/diff checks pass. Actual adapter exercised through approved journal with a simulated subprocess runner; no live systemctl, bus, process or service accessed. Local commits only.
- Limits: service hooks/dependencies can have broader effects, and unit definitions are not frozen by name-based approval. Operator protection of service definitions remains necessary. The subprocess output cap validates after buffering; process creation may exceed timeout. Linux/systemd deployment is unverified. Pi owner service controls, standalone unmanaged-process termination, reviewed port remapping, files and terminal transport remain unfinished; no frontend wiring or full backend-completion claim.

## Pi managed service actions

- Pi `ddbe1cf`: `/system/actions/services` reuses durable action reservation/history/inspection/resume for explicitly scoped service IDs. Existing container identities remain unchanged. Service requests select the distinct ToolGate capability, bind user/system manager scope in approvals, and project exact service state without commands or secrets. `/system/services` exposes the separately validated configured-service catalogue, not inferred live inventory.
- **28 service/action/target checks passed**, including restart with saved approval, changed-scope rejection, invalid receipts, strict names and unchanged container behavior. Scoped Ruff and diff checks pass. Tests use temporary stores and synthetic transport; no host processes, service provisioning or deployment. Local commit only.
- Remaining P14 work includes unmanaged-process termination where authorized, reviewed port changes, files and terminal transport. Service definition/dependency and real Linux transport limitations still apply. Final frontend wiring is deferred, and full backend completion remains unproven.

## Files metadata foundation

- Source inspection confirms the accepted Files screen expands folders, selects entries and copies paths; it has no content reader/editor. ToolGate `30da3a0` implements configured-root metadata discovery and bounded per-directory listings with explicit symlink/other kinds, truncation and static unavailable states. Linux traversal opens directory descriptors with no-follow flags for every component; file contents are never opened. Unsupported platforms do not fall back to path-based traversal.
- ToolGate `c017fd4`: scoped `system.files-list` integration uses ordinary authorization and durable read receipts, protects the reserved executor identity and preserves disabled owner definitions. `/v2/agent/system/file-roots` returns configuration without claiming live directory availability. Pi/frontend transport remains separate work; no scopes or roots were provisioned.
- **46 focused metadata/boundary/inventory/journal tests passed; one native-Linux pytest case skipped on Windows.** A separate native Ubuntu/WSL Python check passed using only temporary synthetic directories: nested listings, symlink metadata, rejection of symlink traversal/root and absolute/parent escapes, plus truncation. No user file contents or configured host root were accessed. Scoped lint/shared undefined-name/diff checks pass.
- Limits: bounded sampled listings have no pagination; unsafe/unrepresentable omitted names report truncation. Descriptor-held directories can be renamed, and privileged mount changes remain an operator trust boundary. OS filesystem calls have no hard stalled-I/O deadline. The test skip is not counted as passed. File-content/editing/terminal capabilities are not claimed by metadata support; P14 remains incomplete.

## Pi directory browsing API

- Pi `f98f41c`: durable directory request identities bind root/path/limit; concurrent replay, stored approval resume and startup uncertainty use the original ToolGate receipt. Strict relative-path and exact-child listing validation, metadata-only projection, timestamps/truncation and original observation age. Pi stores request metadata, not another copy of directory contents.
- Pi `68ee356`: additive Store/startup hooks and owner `/system/files/roots` plus listing create/inspect/resume routes. Bounded scoped root transport validates configured roots without touching local files; unavailable and empty states are distinct. Metadata responses disallow caching. Documentation encoding normalized to UTF-8 during integration.
- **43 directory-request/root/API/inventory checks passed** using temporary SQLite and synthetic HTTP, including the actual ToolGateClient, exact payload/replay, authentication and invalid-path rejection. Scoped lint/shared undefined-name/diff checks pass. Local commits only; no real root configured, file contents accessed, frontend wired or service deployed.
- Remaining limits: sampled listings have no pagination; the root transport rejects replies above 64 KB, including a larger otherwise-valid catalogue, rather than partially displaying success. No content reader/editor or terminal is claimed. P14 and the overall backend remain incomplete.

## Root catalogue boundary correction

- Corrected Pi's overly narrow root-response cap to 512 KiB, accommodating ToolGate's existing 32,768-character configuration bound even when non-BMP Unicode paths are JSON-escaped. The prior 64 KB limitation above is resolved; bounded parsing, strict metadata projection and oversized-response rejection remain intact.
- **11 root/API checks passed**, including a catalogue within ToolGate's actual limits whose escaped response exceeds the old cap. Scoped Ruff and diff checks pass. Synthetic transport only; no filesystem reads or frontend changes. Directory pagination, other system capabilities and the wider backend remain unfinished.
## Current remaining-work index

See [backend-remaining.md](backend-remaining.md) for the source-audited remaining
requirements and work order. The chronological entries below remain evidence,
including their limitations; old "missing" statements can be superseded by later
commits. This index does not mark the backend complete or narrow the agreed scope.

## Reviewed port-change preview foundation

- ToolGate `62c7862`: pure exact create/edit/remove mapping planner preserves
  unrelated mappings, detects conflicts and identifies replacement/downtime.
  Docker's v1.45 create/update contract confirms port publication requires container
  replacement; the preview does not pretend there is an in-place update API.
- ToolGate `01fa4d1`: read-only configured-daemon inspection adapter supplies
  observed allocations and IPv4/IPv6 bindings to that planner. Stopped containers
  require concrete configured bindings. Missing runtime publications and unsupported
  states fail without discarding mappings. Returned data excludes raw container
  configuration and environment. Configuration is rechecked after inspection.
- **70 focused preview/planner/container-control tests passed**, using synthetic
  HTTP only; scoped Ruff and diff checks pass. Local commits only. No Docker
  resources were accessed or changed.
- This is a foundation, not completed port control: replacement specification/data
  preservation, durable step journal/recovery, scoped execution and Pi API remain.
  The response states execution is unimplemented. P14 and the broader backend goal
  remain incomplete; final frontend wiring and deployment remain deferred.

## Private port replacement configuration

- ToolGate `dbc4741`: internal replacement payload preparation retains container
  configuration, runtime/resource settings, bind declarations and network settings;
  anonymous volumes resolve to existing volume names. A private fingerprint detects
  configuration changes. Unsupported external dependencies reject before effects.
- Writable-layer snapshot image ID is required before constructing the eventual
  create request; existing volumes are reused separately and tmpfs reset is explicit.
  Raw environment/configuration stay out of the public preview and object repr.
- **67 specification/preview/planner tests passed**, plus scoped Ruff and diff
  checks. Synthetic documents/HTTP only. Local commit, no Docker resource changes.
- Still incomplete: durable private storage and replacement step journal, actual
  Docker replacement/recovery, network identity handling, scope integration and Pi
  owner API. The preview continues to state execution is unimplemented; these tests
  do not demonstrate a successful real-container migration or overall completion.

## Durable replacement records

- ToolGate `f78d760`: private port-replacement payloads are encrypted with the
  existing vault cipher and bound to their parent execution identity. Ordered step
  claims are committed before dispatch; concurrent/repeated claims cannot authorize
  a duplicate. Existing parent recovery blocks further execution after interruption.
  Public step evidence accepts only structured state and image/container references.
- **44 payload/existing-journal/specification tests passed**, using temporary SQLite
  and real encryption with synthetic keys. Scoped Ruff and diff checks pass; existing
  FastAPI/Starlette deprecation warnings remain. No real vault values or Docker
  resources accessed. Local commit only.
- Internal persistence does not complete port control: executor sequence, exact
  reviewed-source admission, network handling and recovery/API integration remain.
  The complete backend acceptance audit remains open; no final UI wiring/deployment.

## Internal Docker port replacement executor

- ToolGate `0b88ab8`: executes journaled stop/snapshot/retire/rename/disconnect/create/
  optional-start/verify steps from the stored specification. Source configuration
  and state are checked before effects. Original containers/snapshots remain for
  recovery; the original restart policy is disabled and preserved on the replacement.
  Observed ports, mount identities and network identity/aliases are checked.
- **52 executor/private-journal/lifecycle tests passed** with simulated Docker,
  temporary SQLite and synthetic encryption keys. Create/edit/remove, stopped/running
  sources, lost replies at every mutation, revocation and stale/mismatched observations
  are covered. Scoped lint/diff pass. Local commit; no actual containers changed.
- Not yet callable through public APIs: exact reviewed-source admission, retained
  container recovery, replacement target lineage and Pi integration remain. Real
  Docker fidelity/application health are unverified. No backend-completion claim.
