# Launch integration audit

Source audit: September 20, 2026. This is the backend handoff after the frontend
foundation, not a deployment report or a claim that the launch path works.
Inspection was read-only: no credential contents, database contents, service
startup, migrations, registry checks or model calls were used. The checks below
are acceptance work to run during implementation; they were not run for this audit.

## Source locations and authority

The product checkout is `companion/`. Independently maintained service checkouts
are under the sibling `gates/` directory: `pi/`, `toolgate/`, `memorygate/`,
`systemgate/` and `embeddings/`. Pi is **`../gates/pi` from the repository root**,
not `../pi`. The source links below resolve in that adjacent-checkout layout;
they are inspection references, not portable dependencies of this repository.

Conker owns the required network contracts; service implementations own their
enforcement. The controlling decisions are [ADR-0001](../adr/0001-build-pi-in-house.md),
[ADR-0002](../adr/0002-transcripts-and-evidence.md),
[ADR-0005](../adr/0005-toolgate-is-the-only-action-path.md),
[ADR-0006](../adr/0006-autonomy-is-a-configurable-policy.md) and
[ADR-0007](../adr/0007-three-swap-contracts.md). The [module contract](../reference/module-contract.md)
requires generated OpenAPI, truthful health, boundary tests and secure startup.
The [roadmap](roadmap.md) preserves checkpoint order; its original missing-source
statements do not override current source inspection.

## Implemented contracts and missing connections

| Concern | Verified source contract | Integration limit |
| --- | --- | --- |
| Browser authority | Pi's separate gateway has `/auth/session`, login/logout, session listing/revocation, exact-origin/session/CSRF checks and HTTPS support. `/api/pi/*` forwards only an explicit operation allowlist using a dedicated runtime credential. | The active dashboard needs an authenticated transport adapter. The browser must not receive service keys. |
| Conversations | Pi provides session create/list/detail, turn execution, fork, message lookup, parked approvals, unreplied turns and resume. SQLite transcript history is append-only; forgetting has a separate offline path and stable tombstones. | Frontend identities, forks, retry behavior and supported controls must map to these operations explicitly. |
| Model routing | Pi uses Ollama and OpenRouter adapters, discovers hosted models, records routing reasons and handles provider unavailability. `/models` reports available configuration; turn requests accept routing flags. | A frontend catalogue or model selector does not establish arbitrary model selection in the backend. Local model availability and hosted credentials must be verified. |
| Execution | Pi discovers scoped tools and invokes ToolGate over HTTP. It persists an action ID before dispatch, reconciles receipts and preserves pending/unknown outcomes. `acted_no_reply` allows recovery of the reply without repeating the action. | Neither a successful HTTP request nor a model's prose is proof of execution. UI state must follow stored status and receipts. |
| Owner decisions | Gateway forwards `/api/owner/requests` and decisions to intended ToolGate `/v2/owner/requests` routes with `X-ToolGate-Owner-Key`. | Those ToolGate routes are absent. Its existing `/v2/requests/{id}/decision` requires admin authority and cannot substitute for the owner channel. |
| Activity | Pi stores turn metadata and tool observations; session detail includes each turn's latest action identity/state/job. ToolGate has action receipts and admin/agent event endpoints. | Pi lacks a complete ordered public Activity contract. The latest-action field is not an event log and loses earlier action detail as a projection. |
| Tasks, jobs and agents | Pi action records can carry `job_id`. ToolGate has deterministic automations and spending jobs. MemoryGate has processing jobs. | Pi has no task/job/agent management routes, general scheduler/watermark implementation or unified event endpoint. These different job concepts must not be presented as one existing task service. |
| Memory | Pi has a durable outbox, bounded retrieval captured per turn, delivery notices, retries and deletion suppression. MemoryGate provides evidence, context, ingestion, memory and lineage APIs. | Umbrella Compose does not wire Pi's conversation ingestion configuration. Current admission also differs from approved memory; see below. |

Source references:

- [Pi API](../../../gates/pi/pi/api.py), [browser allowlist](../../../gates/pi/pi/browser_contract.py),
  [gateway API](../../../gates/pi/gateway/api.py) and [generated Pi OpenAPI](../../../gates/pi/docs/pi-openapi.json).
- [Routing](../../../gates/pi/pi/routing.py), [provider adapters](../../../gates/pi/pi/providers.py),
  [ToolGate client](../../../gates/pi/pi/toolgate.py), [action persistence](../../../gates/pi/pi/actions.py)
  and [session/turn projections](../../../gates/pi/pi/store.py).
- [ToolGate API](../../services/decisions/server.py): scoped tool discovery,
  invocation, action receipts, requests, decisions, events, automations and spending.
- [Pi memory contract](../../../gates/pi/docs/memory.md),
  [MemoryGate runtime routes](../../../gates/memorygate/services/api/app/routes/runtime.py)
  and [conversation receiver](../../../gates/memorygate/services/api/app/services/conversation_memory.py).

## Memory policy: contradiction and proposed resolution

ADR-0002 says raw transcripts stay in Pi, derived evidence crosses into MemoryGate,
and a scheduled analysis pass promotes evidence to memory. The inspected pipeline
instead uploads owner message content. MemoryGate retains that content in evidence
and automatically inserts a quoted `Memory` row when a bilingual signal heuristic
scores at least `0.3`. The row has medium confidence and `do_not_generalize=true`;
those constraints do not constitute owner approval. The ingestion transaction
creates evidence, admission analysis, memory and lineage together. Assistant output
and tool results are excluded from this particular owner-statement ingestion path.

This is a material policy mismatch, not merely missing frontend wiring. The
[conversation-memory documentation](../../../gates/memorygate/docs/conversation-memory.md)
describes the behavior honestly, but it does not supersede ADR-0002. Simply enabling
the existing Compose variables would activate automatic admission; it would not
deliver an approved-memory workflow.

Proposed decision for the launch slice, to record before dependent backend changes:

1. Evidence records what happened with a stable source reference. An attributable
   owner statement is a **claim**, not automatically approved durable knowledge.
   Decide explicitly whether bounded source quotations are permitted in evidence;
   if so, amend ADR-0002 with that exception, scope and retention. Do not silently
   describe full copied statements as derived summaries.
2. Analysis produces a memory proposal containing the exact candidate text,
   evidence references, confidence, scope and retention. Pending/rejected proposals
   cannot enter the approved-memory retrieval path.
3. The owner approves the exact proposal version. ToolGate governs authority for
   the promotion action; MemoryGate owns the atomic promotion and lineage state.
   Bind approval to the candidate identity/version and argument digest, consume
   it once, and retain the action receipt. Pi coordinates and presents the result.
4. Existing automatically admitted rows remain visibly distinguishable from
   approved memories. Define migration/review and retrieval treatment explicitly;
   never relabel them as approved or delete them as an incidental integration edit.
5. Rejection, source deletion and later correction must prevent silent resurrection.
   Approved retrieval retains source citations and reports degradation independently
   of whether the model produced a fluent answer.

This document proposes that resolution; **it does not alter existing admission**,
authorize a data migration, or imply that these promotion endpoints already exist.

## Deployment dependencies

[Compose](../../docker-compose.yml) runs a separate gateway and Pi worker using the
same Pi image. The gateway owns its auth/TLS volume and joins a separate owner
control network; Pi has no published port or owner approval credential. Service
ports that are published bind to loopback. Qdrant has a separate internal network.
Loopback access is not an outbound-network policy.

- [Pi's Dockerfile](../../services/decisions/Dockerfile) packages the runtime and gateway,
  not the dashboard. Neither inspected API mounts dashboard assets, and umbrella
  Compose has no frontend service. Same-origin frontend asset serving/proxy
  packaging must be implemented and tested alongside the adapter.
- Pi needs `PI_MEMORYGATE_URL`, `PI_MEMORYGATE_INGEST_KEY`,
  `PI_MEMORYGATE_READ_KEY` and the intended agent identity. MemoryGate needs matching
  `MEMORYGATE_CONVERSATION_KEY` and `MEMORYGATE_CONVERSATION_AGENT_ID`. Provisioning
  and wiring must follow the resolved memory policy rather than enabling automatic
  admission under an approved-memory label.
- ToolGate must implement and provision the owner capability before the gateway's
  owner channel works. Worker and admin credentials are not fallback credentials.
- PostgreSQL, Qdrant, the embedding sidecar and its actual Ollama model/dimension
  pairing determine retrieval readiness. Ollama chat inference needs an installed
  model; hosted routing additionally depends on provider access and policy.
- HTTPS requires a configured owner password and trusted certificate. Remote
  access requires an explicit HTTPS proxy/origin arrangement; Tailscale membership
  alone does not expose a loopback-bound service. See [browser auth](../reference/browser-auth.md).
- [versions.env](../../versions.env) currently pins Pi 0.4.0, ToolGate 0.3.0,
  MemoryGate 0.3.0, SystemGate 0.2.3 and Embeddings 0.1.2. Source presence and pins
  do not prove registry artifacts contain these changes or run together.
- Backup/restore must preserve transcripts, source lineage, gate receipts and
  approval state. Restore remains held until deletion replay and external-action
  reconciliation are complete; see [recovery](../reference/recovery.md).

One stale service-document warning needs correction during that service's next
documentation pass: current MemoryGate source preserves bootstrap key revocation,
scope and rotation, with boundary tests in
[test_bootstrap_revocation.py](../../../gates/memorygate/services/api/tests/test_bootstrap_revocation.py).
[The helper](../../../gates/memorygate/services/api/app/services/auth_settings_service.py)
returns existing authority rather than reactivating it. Older memory documentation
still warns of resurrection. This source fact does not verify the pinned image.

## Minimal authenticated integration sequence

1. Settle the memory decision and one durable task contract. Associate one task
   with its session, turn and actions; define lifecycle transitions, stable IDs,
   versioning and restart behavior. Do not treat the existing optional `job_id`
   field as an implemented task lifecycle.
2. Implement ToolGate's owner capability and negative authorization checks.
   Keep browser authority in the gateway and execution authority in Pi. Regenerate
   service OpenAPI and update boundary documentation where contracts change.
3. Add the minimal Pi task and public Activity projection. Include all actions
   in order, approval requirements, receipt-backed outcomes and chat references;
   redact service credentials and internal data. Start with authenticated polling
   if sufficient; streaming is not required to establish correctness.
4. Package the dashboard at the gateway's exact origin and implement its adapter.
   Prove login, session reload and one real model turn. Unsupported fixture controls
   retain explicit unavailable/preview behavior rather than silently succeeding.
5. Run one bounded ToolGate capability from the task, park it for the owner,
   approve through the owner channel, resume the stored action, and display its
   receipt-backed Activity and resulting chat answer.
6. Implement the decided proposal/promotion contract, then show one sourced memory
   proposal, owner decision, durable approved record and later cited retrieval.
   Test rejection and deletion before calling the path complete.
7. Provision an isolated assembled stack, validate published artifacts/configuration,
   and run the real browser round trip. Only then mark the verified capabilities
   live. Broad cron, agent/team administration and automation editors are separate
   work; none is needed to establish this slice.

## Acceptance checklist

- [ ] Browser login, CSRF/origin rejection, logout, expiry and host password recovery.
- [ ] Worker cannot call the owner decision endpoint; no service secret reaches the
  browser; absent owner configuration fails closed without admin fallback.
- [ ] Task/session/action identities survive reload and process restart; history
  stays append-only and Activity shows every action in stable order.
- [ ] Exact approval replay, changed arguments/version, expiry, revocation and
  concurrent resume cannot dispatch an unauthorized or duplicate action.
- [ ] A lost acknowledgement produces a pending/unknown outcome and reconciliation,
  not blind redispatch. Failure after execution preserves `acted_no_reply`.
- [ ] Activity and chat link to the same observed action receipt; generated prose
  cannot manufacture success or hide a partial failure.
- [ ] Pending/rejected memory proposals are excluded from approved recall; approval
  promotes the exact candidate once and preserves evidence/decision/action lineage.
- [ ] Source deletion suppresses late uploads and retrieval; corrected or rejected
  material is not silently recreated. Existing admitted rows retain honest status.
- [ ] Memory outage, lexical fallback and pending vector work remain visible even
  when conversation succeeds; actual semantic recall is tested separately.
- [ ] Packaged frontend, trusted HTTPS, PostgreSQL, service images and real gate
  round trip work together on the deployment target; source mocks alone do not pass.
- [ ] Restart/restore tests preserve receipts and enforce the recovery hold and
  browser-session invalidation before any return to service.

Reuse Pi's `tests/test_gateway_*.py`, `test_tool_turns.py`,
`test_audit_execution.py` and `test_memory.py`; ToolGate's approval boundary,
integrity and automation approval suites; and MemoryGate's
`integrations/test_pi_memory.py`. Its default drill proves literal fallback;
the opt-in semantic mode requires actual embeddings/indexing. Companion already
has installer/browser-auth/recovery suites and `scripts/auth_mutation_drill.py`.
Add cross-service cases for the new contracts instead of claiming those existing
suites already verify task Activity or approved promotion.
