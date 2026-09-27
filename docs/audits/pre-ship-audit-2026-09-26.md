# Pre-ship audit, 26 September 2026

## Decision

**No-go for an external release.** No P0 exploit or certain data-loss defect was
confirmed, and the backend safety boundaries have substantial focused test coverage.
The assembled product does not yet have release evidence: current source, pinned
images, the two installers, the browser UI and the documented server are different
product versions.

This was a read-only audit of Conker plus Pi, ToolGate, MemoryGate, SystemGate and
Embeddings. Five independent reviews covered security, frontend architecture,
backend correctness, release/SRE and test strategy. Findings below were reconciled
against repository history, current GitHub issues and local test runs.

## P1 release blockers

### 1. The released stack is not the reviewed stack

`versions.env` pins Pi 0.4.0, ToolGate 0.3.0, MemoryGate 0.3.0, SystemGate 0.2.3
and Embeddings 0.1.2. Their current checkouts are respectively 137, 49, 13, 5 and
3 commits ahead of those releases. Pi 0.4.0 predates much of the gateway/dashboard
contract now expected by Conker; MemoryGate 0.3.0 predates corrections.

Evidence: `versions.env:18-22`, `docker-compose.yml:33-57`.

Fix: treat one immutable compatibility manifest as the release unit. Build and sign
all images, pin application images by digest, boot exactly those digests in CI, then
run an HTTPS owner journey before promoting the manifest.

### 2. Two installers produce different security and runtime contracts

The root `install.sh`/Compose path presents itself as the normal installation but
does not provision the current owner-channel key pairs or package the current
dashboard. The Ubuntu generator has newer key wiring but builds mutable source and
uses mutable third-party tags. This explains why a locally working auth/UI path can
reappear as a broken path elsewhere.

Evidence: `docker-compose.yml:42-93`, `install.sh:339`,
`deploy/ubuntu/prepare.py:38-117`,
`gates/toolgate/toolgate/core/owner_channel.py:26`.

Fix: designate one installer. Generate it from the compatibility manifest and one
key-provisioning library. The obsolete path must either be removed or fail closed
with a precise migration command.

### 3. Connected and fixture modes are two different applications

Fixture mode uses `app-sidebar.tsx` plus the central navigation registry. Connected
mode hard-codes another menu and route switchboard. In connected mode `/`, projects,
artifacts, agents, jobs, companion settings and chat detail routes fall into a
"not connected" screen. This duplication is the architectural cause of repeated
visual and navigation regressions.

Evidence: `dashboard/src/components/app-sidebar.tsx:35`,
`dashboard/src/config/navigation.ts:7`,
`dashboard/src/components/gateway/chat-sidebar.tsx:17`,
`dashboard/src/components/gateway/workspace.tsx:43-64`.

Fix: one shell, router, navigation registry and responsive layout. Runtime mode may
select adapters and capability flags; it must not select a second application.

### 4. The wrong-password experience recreates the reported auth failure

The login form clears the password before authentication succeeds, the auth store
switches the whole boundary to `checking`, the form disappears, and a rejected login
uses a generic HTTP denial. A correct server refusal therefore feels like a broken
product and gives the owner no useful recovery path.

Evidence: `dashboard/src/components/auth/gateway-boundary.tsx:30,68`,
`dashboard/src/lib/gateway/auth-store.ts:40`,
`dashboard/src/lib/gateway/transport.ts:14`.

Fix: keep the anonymous form mounted while pending, classify invalid credentials as
a login error, retain/select the entered password after refusal, and show instance
identity when multiple local gateways can exist.

### 5. MemoryGate can strand jobs and split PostgreSQL from Qdrant

The worker commits `processing` before doing work, but selects only `pending` jobs
and has no startup lease recovery. A crash can strand a job forever. The runtime
pipeline also writes Qdrant before committing the corresponding PostgreSQL memory;
a failed database commit can leave an orphan vector.

Evidence:
`gates/memorygate/services/api/app/services/processing_worker.py:21-50`,
`gates/memorygate/services/api/app/services/runtime_pipeline.py:38-118`.

Fix: claim work with expiring leases and recover expired claims. Commit the memory
and a vector-outbox row atomically; let an idempotent worker update Qdrant afterward.

### 6. ToolGate usage limits race under concurrency

Usage counts are read before the dispatch transaction and the event is written only
after execution. Concurrent requests can all observe the final available slot and
execute. The same gap affects cooldowns.

Evidence: `gates/toolgate/toolgate/api/server.py:1123-1291`.

Fix: reserve capacity in the same transaction that creates the durable dispatch
record. Count reservations and in-progress executions. Add barrier-based tests.

### 7. SystemGate has host-root-equivalent authority

The legacy Compose paths mount `/var/run/docker.sock` into SystemGate. `:ro` applies
to the socket file, not to Docker API methods. A compromised SystemGate can ask the
daemon to create a privileged container or mount the host.

Evidence: `docker-compose.yml:258-260`,
`gates/systemgate/docker-compose.yml:27`,
`gates/systemgate/systemgate/main.py:180`.

Fix: remove the socket. Use a minimal host collector or strictly allowlisted socket
proxy that exposes bounded, sanitized read operations only.

### 8. MemoryGate's credential-encryption key is not persistent

MemoryGate defaults to `/data/runtime-fernet.key`, while standard Compose persists
only `/data/backups`. Container recreation can generate a new key and make stored
provider credentials unreadable.

Evidence: `gates/memorygate/services/api/app/core/config.py:39`,
`docker-compose.yml:134-163`, `scripts/recovery.py:72`.

Fix: persist a dedicated key path, migrate existing keys without masking the old
container file, verify decryptability before update, and test container recreation.

### 9. Credential-bearing HTTP clients trust ambient proxies

Pi and ToolGate create HTTPX calls without `trust_env=False`. HTTPX honors ambient
`HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY`; inherited proxy settings can receive
service keys, prompts, memories and provider traffic.

Evidence: `gates/pi/pi/memory.py:20`, `memory_corrections.py:19`,
`toolgate.py:117`, `openrouter.py:107`, `direct_providers.py:73`, and
`gates/toolgate/toolgate/api/server.py:980`.

Fix: construct bounded long-lived clients centrally with `trust_env=False`, redirects
disabled, fixed destinations, response-size limits and explicit timeouts. Test every
credential-bearing client with malicious proxy variables.

### 10. Recovery stops before the product is recovered

Restore intentionally produces a held data set. There is no supported reconciliation
and promotion path back to a running installation. Backups are unscheduled, have no
verified off-machine copy, and have not completed a restore-to-service drill.

Evidence: `scripts/recovery.py:3`, `docs/reference/recovery.md:107`,
`docs/status.md:38`.

Fix: define RPO/RTO and implement an operator-reviewed state machine for isolated
restore, deletion replay, external-effect reconciliation, credential reprovisioning,
promotion and functional acceptance.

### 11. Updates have no transactional rollback

`conker update` pulls source and images and recreates services without a mandatory
snapshot, compatibility preflight or rollback. Pi and MemoryGate run startup schema
changes, including destructive operations.

Evidence: `conker:191`, `gates/pi/pi/store.py:297`,
`gates/memorygate/services/api/app/core/migrations.py:312`.

Fix: use versioned forward migrations, pre-update verified snapshots, staged health
checks and automatic rollback to the previous manifest when readiness fails.

### 12. CI never proves the assembled product

No job boots the exact pinned image matrix and drives the production browser through
login, chat, streaming, stop, approval, reload and expiry. The cross-repository
recovery test silently skips when siblings are absent, which is normal CI. It also
uses a ToolGate 0.2.2 fixture while deployment pins 0.3.0.

Evidence: `.github/workflows/ci.yml:27-55`,
`.github/workflows/dashboard.yml:28`,
`tests/test_recovery_reconciliation.py:16-20`.

Fix: add a no-skip release-candidate workflow that checks out exact revisions,
starts every released image, waits on all health contracts, and runs a real browser
journey plus recovery and restart cases.

## P2 engineering risks

- `submitTurn` remains a non-idempotent legacy chat mutation without `request_id`:
  `dashboard/src/lib/gateway/runtime.ts:267` and `transport.ts:59`.
- Sidebar and workspace independently fetch and own the same live session list:
  `chat-sidebar.tsx:35-48`, `runtime-workspace.tsx:70`.
- Connected workspaces are eagerly bundled; add route-level lazy loading and a
  bundle budget: `gateway/workspace.tsx:2`.
- No root error boundary, route focus or route announcement exists:
  `dashboard/src/App.tsx:37`, `components/layouts/base-layout.tsx:36`.
- Custom dashboard checks execute transpiled modules through `new Function`; they
  verify much domain logic but not rendering, focus, browser security or lifecycle:
  `dashboard/scripts/check-gateway-auth.cjs:6`, `run-checks.mjs:5`.
- Pi's paid inference path has opt-in but no durable monetary ceiling:
  `gates/pi/pi/api.py:155`, `openrouter.py:155`.
- TLS reuse checks certificate validity but not SAN coverage, key/cert match,
  symlinks, ownership or existing key permissions: `gates/pi/gateway/__main__.py:27-67`.
- MemoryGate API-key verification can be used for CPU denial of service through
  repeated PBKDF2 and attacker-controlled limiter scopes:
  `auth_settings_service.py:18-49,191`, `core/auth.py:33`.
- SystemGate exposes process command lines and raw container logs, which can contain
  credentials: `gates/systemgate/systemgate/main.py:288-299`.
- Embeddings accepts bounded item count but unbounded text/request bytes and health
  accepts a different model tag with the same base name:
  `gates/embeddings/embeddings/main.py:61-81`.
- Qdrant collection readiness is permanently cached and can become false after
  storage replacement: `memorygate/.../qdrant_store.py:25,84-86`.
- Test drills leave repository-local, sometimes unreadable state in `.test-gates`
  and `.pytest_cache`: `scripts/auth_mutation_drill.py:75,146`.

## Repository and release governance

- GitHub `main` branches and release tags need required review/status checks.
- Tag-triggered publishing must prove CI passed for that exact commit.
- Pin third-party Actions and Dockerfile base images by commit/digest.
- Add container, Python dependency, secret and license scanning, SBOM generation,
  image signing and deployment-time attestation verification.
- Decide who owns the compatibility manifest and the release-candidate result.

## Decisions the owner must make

1. Is `v1` a visual checkpoint or a supported product release? Today it cannot be
   both without a compatible backend manifest.
2. Which installer is authoritative: root Compose or `deploy/ubuntu`?
3. Which fixture-only surfaces are real product scope: Projects, Artifacts, Agents,
   Jobs, Journal and Home?
4. Should `/` open chat, Home, or a capability-aware dashboard?
5. Is Windows a supported development environment? The current test harness is not
   portable through a Windows-to-WSL path boundary.
6. What are the supported browsers/viewports and the latency, concurrency, RPO and
   RTO targets that define "ready"?
7. Is SystemGate's Docker daemon authority accepted? Recommendation: no.
8. Are any callers still allowed to submit a turn without a durable request ID?
9. Who owns the existing `ghcr.io/alexeybe1kin/*` packages after the organization
   moved to `Conker-AI`?

## Ordered remediation program

1. Freeze feature/UI work except the login recovery defect.
2. Choose one installer and one compatibility manifest; remove the other path.
3. Remove Docker-socket authority, persist the MemoryGate key, disable ambient
   proxies, and fix ToolGate's atomic usage reservation.
4. Fix MemoryGate leased jobs and the PostgreSQL/Qdrant outbox boundary.
5. Release compatible signed images and pin their digests.
6. Build the exact release-candidate stack and run owner/browser acceptance.
7. Implement restore-to-service and update rollback drills.
8. Unify the two frontend shells, then resume the planned Kimi UI enhancement.
9. Replace custom checks incrementally with Vitest/Testing Library and add Playwright,
   axe, visual, mobile, performance and concurrency coverage.

## Verification performed

- GitHub CI and Dashboard runs for commit `8a2e7549` both completed successfully.
- `npm ci`: 455 packages audited, zero known vulnerabilities.
- Dashboard lint: passed with two warnings.
- Dashboard custom checks: 26/26 suites passed.
- Design-system self-test: 17/17 passed.
- Dashboard build succeeds from the physical checkout, but fails through the
  `conker/current` junction because Vite emits the resolved `companion` path as a
  relative asset name. The organized junction is therefore not build-transparent.
- Root Python suite on Windows: 35 passed, 21 skipped, 6 failed. Five failures are
  WSL path conversion defects; one is a missing cross-repository Qdrant dependency.
- ToolGate: 699 passed, 1 skipped.
- SystemGate: 36 passed, 8 skipped.
- Embeddings: 8 passed, 1 failed. The failure is test-state/configuration pollution
  around the declared dimension and needs an isolated rerun before classification.
- Pi and MemoryGate full local suites could not collect in the existing Python
  environments because their checked-out virtual environments lack current declared
  dependencies. This is local environment evidence, not a product failure.

## Existing issue alignment

The audit confirms rather than replaces the existing product audit and issues for
browser coverage, homemade dashboard tests, temp-directory isolation, MemoryGate
policy, backups, installer drift and ToolGate decomposition. New release blockers
should be deduplicated against those issues before filing.
