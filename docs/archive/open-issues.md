# Open issues

Everything unresolved, in one place, one line each. Fix, tick, repeat.

The design was settled on 2026-09-10 in a two-engineer review. Section A is now decisions rather
than questions; what remains is building them.

---

## Closed

**Philosophy (2026-09-08)** — attention accounting · waste as a judgement · belief revision ·
five safety layers · engine general / domains yours · sovereignty vs confidentiality · being wrong
about you · promised vs not promised.

**Verified rather than assumed** — `@theme inline` was recorded backwards · Radix chosen over a
release-candidate Base UI (ADR-0009) · **all nine containers total 704 MB**, so the service split
is nearly free and stays · the model is 4–5× the entire rest of the stack.

---

## A. Decided

| # | Decision |
|---|---|
| **A1** | **Conker may never modify itself, its gates, or its own permissions.** Anything it builds runs with its own keys, never Conker's. |
| **A2** | **ToolGate's AI layer dies** — `/v2/ai/*`, `planner.py`, `research.py`. Pi becomes the only thing that thinks. No dormant second engine behind a flag. |
| **A3** | **Money and calendar keep a hard owner-approval floor.** No tier and no grant overrides it. |
| **A4** | **SystemGate stays a service, loses the Docker socket.** A fixed collector publishes a sanitised snapshot; it accepts no agent-supplied commands, paths or queries. |
| **A5** | **Proposal lifetime and execution authority are separate records.** A proposal stays reviewable ~7 days; approving it mints a **120-second** single-use execution token. Not one stretched clock. |
| **A6** | **Sensitivity is structured effect metadata on the tool** — external communication, money, deletion, public exposure, credential access — never a score an agent's level can outrank. |
| **A7** | **Three tiers, one chain.** `identity → scope → operation limits → grant → live limits → execute`. **Available** runs under a grant. **Ask AI** is a *pre-queue filter* that declines slop and duplicates so the owner's list stays clean — it can withhold, never widen, never approve. **Ask User** is the owner on the exact action. |
| **A8** | **Creating a tool is always Ask User.** A new tool is a new power, so approving one is modifying permissions — which A1 forbids anything else from doing. Tool existence and agent scope are **two separate approvals**. |
| **A9** | **Embeddings stops being a service.** It is 197 lines wrapping one call — `POST /api/embed` to Ollama. MemoryGate does it directly, recording model and version per vector so re-indexing is knowable. |
| **A10** | **Approval cards render from structured data, never model prose.** Three layers: glance (icon, effect badge, one line from the tool's own template filled with real arguments) · judgement (the arguments that vary, provenance, reversibility, why you are being asked) · full detail behind `⋯` (exact arguments, digest, grant, budget remaining, executor, destination, both clocks, evidence chain). |
| **A11** | **No 3D, avatars or video.** No GPU. Voice stays a later question. Text and browser only. |
| **A12** | **The autonomy dial is dead.** Replaced by standing grants: subject, operation and version, permitted resources and argument bounds, tier, frequency, aggregate budget, expiry, failure behaviour. |

---

## B. Build — security and recovery first

| # | | |
|---|---|---|
| **B1** | **Coordinated backup implemented; Linux drill required before release** | `fix/backup-and-restore` captures ToolGate's volume/key, PostgreSQL, SQLite through its backup API, runtime/configuration material, models/indexes and image-declared volumes. Required-store checks, vault decryption verification and a complete manifest precede success. See [recovery](../reference/recovery.md). |
| **B2** | **Isolated restore implemented; resumption remains blocked** | Fresh volumes, networking disabled, no application startup, pending approvals cancelled, ToolGate locked down, unfinished work held. Exit 3 is an explicit hold. Complete deletion replay needs B3/C2; ambiguous external effects need B6. No automatic promotion or invented reconciliation. Linux/Docker drill must pass before release. |
| **B3** | **Immutable transcripts contradict forgetting** | Pi's triggers `RAISE(ABORT)` on both UPDATE and DELETE, so a message can never be removed — while the philosophy promises forgetting is real. Both cannot be true. Needs a narrow owner-authorised deletion path with a content-free receipt, append-only everywhere else. |
| **B4** | **Browser auth** | One static admin key, held forever, no sessions or revocation. Needs a gateway owning login and server-side sessions: HttpOnly SameSite cookie, CSRF, expiry, logout, revocation. **The owner-approval credential must never be reachable by Pi.** Blocks first-run setup. |
| **B5** | **MCP bridge bypasses everything** | No scope, no identity, whole catalogue. Disable in normal installs; replace with an authenticated bridge on the same scoped path. |
| **B6** | **No durable execution record** | Approval-consumed-once does not cover *the external action succeeded and the receipt was never written*. Needs a stable action ID and a durable dispatch record created **before** dispatch; same ID and arguments returns existing status, different arguments fails. Ambiguous interruption holds as outcome-unknown. Never infer "did not run" from "no receipt". |
| **B7** | **Limits are unenforced by default** | `enforce_usage_limits` works — rate, hourly, cooldown, returning 429 — but every limit defaults to `None`. Tools need finite defaults at registration. Reserve atomically **before** dispatch, across a workflow **and its children**, so budgets cannot be evaded by spawning. Retry does not reset. |
| **B8** | **No provenance on approvals** | Show the owner's originating words beside what Conker wants. Catches the whole injection class by making mismatch visible in a second. Must distinguish owner input from model rationale from external evidence. |
| **B9** | **No spend cap anywhere** | Limits count invocations, never cost. Paid routes stay disabled until a per-job ceiling and cumulative cap are enforceable. Reserve a conservative upper bound before each request; unknown pricing blocks it. Reconcile after. |
| **B10** | **Free ≠ private** | Local-only must be an enforceable setting, and external inference must visibly disclose that data left the machine — per turn. |
| **B11** | **MemoryGate runtime encryption key is unmounted** | `/data/runtime-fernet.key` encrypts provider keys in PostgreSQL but is outside the mounted `/data/backups`. B1 captures it from the original stopped container. Migrate it to persistent storage before recreating that container; adding an empty mount first would hide the surviving key. |

## C. Build — the product

| # | | |
|---|---|---|
| **C1** | **Pi has no MemoryGate integration** | The checkpoint is named "it talks and it remembers". Needs a durable outbox: committed evidence queues under a stable ID, retries cannot duplicate. Retrieval before an applicable turn, tied to that turn. Ingestion failure says *saved, long-term memory pending*; retrieval failure continues while exposing the gap — without depending on the model choosing to mention it. **Not claimed done until it passes end to end in Russian and English.** |
| **C2** | **Memory needs claim semantics** | Claims cite specific evidence and distinguish stated / observed / inferred. Record **when it was true** and **when the system learned it**. Support disputed, superseded, retracted. Derived summaries record their inputs so corrections invalidate them. Postgres checks authorisation and current status before any text leaves; a stale vector must never resurrect deleted content. |
| **C3** | **Interactive latency fails** | 31–103s per turn. Instrument queue wait, model load, prompt processing, first token, generation, tool time. Test `qwen3:4b` with thinking genuinely **disabled** — not hidden — against a small non-reasoning multilingual model. Choose on measurement. |
| **C4** | **Nothing is measured** | Denials, unknown outcomes, approval age and expiry, parse failures, memory lag, retrieval failures, latency, spend reservations, outbound destinations. Starts at B1, not after C6. Do not copy private payloads into a second accidental memory called "logs". |
| **C5** | **No notification path** | An approval nobody sees is an action that silently never happens. Record attempted delivery, actual delivery, and acknowledgement separately. Nothing private on a lock screen. |
| **C6** | **The proactive slice** | Durable schedules and an attention inbox in Pi. Start with server changes, pending approvals, one commitment source. Prepared state on open. |
| **C7** | **Four screens have no backend** | Proposals, Journal, Jobs, half of Memory. Missing backend must be **visibly unavailable**, never a hollow screen. |
| **C8** | **README oversells** | Describes nine screens and a nightly engine that do not exist. Truthful status, broken on the front page. |

## E. Found while verifying

| # | | |
|---|---|---|
| **E1** | **The admission filter is narrow in *both* languages** | Verified after the bilingual fix landed. "I prefer to train before school" now scores 0.30 in English and Russian, so the audit's case is genuinely closed. But "I train judo on Tuesdays" and "My exam is on the fourteenth" score **0.00 in both** — a routine and a deadline, admitted in neither language. Those are exactly the facts a life engine has to keep. Separately, "I do not like early mornings" scores 0.00 in English and 0.30 in Russian, so the asymmetry now runs the other way for negative preferences. This is a coverage problem, not a language problem, and it was invisible while the language bug hid it. |
| **E2** | **MemoryGate's bootstrap reactivates revoked read keys** | Same class as the ToolGate defect fixed in `6da9b4e`: a key the owner revoked comes back on restart. Reproduced by the agent doing the memory work; left separate rather than folded into an unrelated patch. |

| **E3** | **`PI_OPENROUTER_KEY` is spendable directly by a compromised Pi** | Confirmed by live test. The paid-model key lives in Pi's own environment because Pi calls OpenRouter directly for inference, so ToolGate's spend caps do not cover it - inference is not a ToolGate-mediated action. Empty on a fresh install, but the moment the owner sets a paid key, a manipulated Pi could exhaust it in a loop outside any accounting. Needs a spend limit at the point Pi calls the provider. Not a boundary breach: it is the one credential the runtime must hold to work. |
| **E4** | **`conker update` breaks an install made before a new required var** | The auth work added `PI_GATEWAY_KEY` / `PI_GATEWAY_KEY_SHA256` as compose-required. `install.sh` generates them, but `conker update` does not re-run the env repair, so an existing `.env` from before the change fails compose interpolation on the next update. Fix: `conker update` should run the same `keep_or_make` repair the installer does. |

## F. Security & safety audit (2026-09-12) — ALL FIXED

Two independent reviews — one verifying the boundaries hold, one hunting accidental harm — plus a
live container test. **The core boundary held everywhere it matters** (see F0). These are the gaps
found. Worst first.

**F0 — what held, confirmed both live and in source:** a compromised Pi cannot read the vault,
MemoryGate, SystemGate, or the owner-approval channel (401 to all; gateway is network-isolated).
Approval integrity for tools rejects forged/replayed/cross-agent/stale requests. Revocation survives
bootstrap. Execution keys cannot administer ToolGate. Child spending cannot escape its job budget.
The SSRF/tailnet filter holds including rebinding. Password recovery is honest; session revocation
works; no permanent-lockout path found.

| # | Severity | Defect |
|---|---|---|
| **F1** | **Regression, breaks tools now** | I merged ToolGate's durable-execution work (which requires `action_id` before dispatch, `server.py:952`) without the matching Pi change. `pi/toolgate.py:121` sends no `action_id` or `job_id`, so ordinary outbound tool execution and approval resumption are now **rejected**. Both agents warned Pi needed this; I merged one side of the interface. Fix Pi's client to create and send the ID. |
| **F2** | **High — money** | Pi records paid requests as **$0**. `openrouter.py:44` treats missing/null/empty prices as zero; `:40` ignores per-request fees. A paid model with a per-request fee dispatches even with `allow_paid=False`, and a real `usage.cost=0.5` was recorded as `cost_usd=0.0`. Reproduced with fixtures. Money spent despite choosing free, and the accounting hides it. **Fix before wiring any card.** |
| **F3** | **High — approval integrity** | An approved *automation* runs a **changed child tool** without fresh approval. Approval binds the automation's version/args (`server.py:1661`) but execution loads each child's *current* definition (`server.py:1206`) with `approval_granted=True`. Owner approves v1, child edited to v2 in the window, v2 runs. The tool-level fix earlier did not cover automation children. |
| **F4** | **High — correctness** | Concurrent resume overwrites a completed action as `failed` — the refusal handler writes `failed` unconditionally (`loop.py:220`) with no state compare (`store.py:348`); produced `status=failed, acted=1`. And a restart leaves an acted turn as `interrupted` (`store.py:430`), which resume rejects (`loop.py:202`) and the unreplied queue omits — the owner cannot retrieve the missing reply. |
| **F5** | **High — forgetting** | Forgetting after an agent-ID change deletes the **wrong namespace**. The outbox (`memory_store.py:7`) does not keep the original destination identity; delivery uses the *current* agent ID (`memory.py:22`), which MemoryGate includes in record identity. Delete returns a receipt for the new namespace; original content survives; Pi accepts it (`memory.py:42`) and stops trying. Real deletion silently fails. |
| **F6** | **Medium — boundary** | Pi can reach **Qdrant and Ollama unauthenticated** on `conker_net`. Qdrant has no auth (`compose:165`) — a socket from Pi can delete/modify vector collections; Ollama (`compose:195`) can create/delete models with embedded system prompts. Contained: MemoryGate reloads text from Postgres with ownership checks, so forged vectors can't become memory *text* — but retrieval and local-model availability can be damaged and persist. Put Qdrant/Ollama on an internal network Pi does not share, or add auth. |
| **F7** | **Medium — truthful status** | MemoryGate returns `{"status":"ok"}` when listing Qdrant collections succeeds but inspecting one fails — the exception is swallowed (`qdrant_store.py:88`). False green. |
| **F8** | **Medium — availability** | A >16,000-char message loops forever: Pi caps nothing (`api.py:153`), MemoryGate rejects at 16k with 422 (`conversation.py:34`), the worker retries endlessly (`memory.py:141`) advising a credential fix that cannot help. |
| **F9** | **Medium — availability** | A hosted-catalogue outage blocks the healthy local fallback: routing builds the hosted candidate before appending local (`routing.py:94`) and the exception escapes outside the failure handler (`loop.py:103`). Local invocation count was zero during a simulated outage. |
| **F10** | **Medium — money coverage** | Two more uncapped paid paths beyond E3: MemoryGate calls OpenAI directly (`ollama_service.py:31`) outside ToolGate's ledger; and a generic HTTP tool can call a payment API whose transfer amount the inference-cost ledger does not bound. Unresolved reservations also have no owner release path, so they can exhaust the budget indefinitely. |
| **F11** | **Low — injection persistence** | Model-written summaries are promoted into **system messages** (`loop.py:178`, `:139`) — higher trust than they earned. Recalled memory gets an "untrusted evidence" label; summaries do not. |
| **F12** | **Low — maintenance** | MemoryGate pins `cryptography 46.0.1`, before the 48.0.1 wheel fix for CVE-2026-34180 (bundled OpenSSL) and a PKCS#7 oracle. The vault uses Fernet, not PKCS#7; no exploit demonstrated. Bump it. |

## G. Golden-standard hardening (2026-09-12) — G2/G3(partial)/G5 done

Checked against Docker's own compose hardening reference. These are not exploits the audit found;
they are the defence-in-depth the containers are missing. Verified against
https://github.com/docker/docs compose-file security guidance.

| # | Gap | Golden standard |
|---|---|---|
| **G1** | **Every service runs as root** — no `USER` in any Dockerfile, no `user:` in compose. | Run as a non-root UID. A container breakout from a root process is host-root; from an unprivileged one it is not. |
| **G2** | **No memory limits** on any service. | `deploy.resources.limits.memory` per service. **This is also the fix for the host OOM that has killed runs repeatedly** — nothing currently caps what a container takes. Ollama needs the most; the rest measured well under 256M. |
| **G3** | `cap_drop`/`no-new-privileges`/`security_opt` are on only 2 of 9 services (the gateway/ToolGate pair). | `cap_drop: [ALL]`, add back only `NET_BIND_SERVICE` where a low port is bound, `security_opt: [no-new-privileges]` on **every** service. |
| **G4** | No `read_only` root filesystem. | `read_only: true` with `tmpfs` for the few writable paths; data lives in named volumes already. |
| **G5** | No `pids_limit`. | `pids_limit` per service caps fork-bomb blast radius. |

None of these weakens anything in F0; all are additive. G1 and G2 are the two that matter most — G2
because it stops the OOM, G1 because it is the single highest-value container-hardening step.

### Implementation batch: source fixes awaiting review

Branches are stacked within each repository; later branches include earlier units.
No deployment or image publication was performed, and `gates/pi` was not edited.
The original reports above remain the audit record.

| Finding | Repository / branch | Commit | Result |
|---|---|---|---|
| F3 | ToolGate `fix/automation-child-approval` | `e7bd864` | Approval fingerprints every referenced child definition/version, including nested branches; execution uses the checked snapshot. Changed children require fresh approval. |
| F6 | Companion `fix/isolate-qdrant` | `715c15f` | Qdrant leaves `conker_net`; only MemoryGate shares its internal network. |
| F10 | MemoryGate `fix/hosted-spend-refusal` | `1950e24` | Direct hosted inference is refused and audited; cost is an owner-supplied estimate or explicitly unknown. A quote never enables spending. |
| F10 | ToolGate `fix/owner-reservation-release` | `652ce27` | Owner-only local hold release after an explicit no-execution attestation and evidence note; action identity remains non-retryable. Late replies dispute the release, restore accounting and freeze paid work. |
| F7 | MemoryGate `fix/truthful-qdrant-health` | `60de014` | Failed inspection and unknown dimensions return degraded with the collection/reason. |
| F8, MemoryGate side | MemoryGate `fix/permanent-ingestion-limit` | `c9b1c8f` | Oversized conversation ingestion returns 413, `detail.code=CONTENT_TOO_LARGE`, `retryable=false`, `max_content_characters=16000`, without echoing content. Exactly 16,000 remains accepted. |
| F12 | MemoryGate `fix/cryptography-security-update` | `616dcc3` | Pin 50.0.0, covering both advisories; Fernet format compatibility and full service tests pass. |
| F10 follow-up | MemoryGate `fix/hosted-cost-quote-validation` | `0ce53d4` | Supplied metadata cannot overwrite the calculated cost or its estimate label. |

Resolved Compose membership, checked with `docker compose config --format json`
using synthetic credentials (no installed secrets in test output):

| Service | Networks |
|---|---|
| Qdrant | `memory_index` |
| MemoryGate | `conker_net`, `memory_index` |
| Pi | `conker_net` |
| Ollama | `conker_net` |
| Embeddings | `conker_net` |

`memory_index` resolves to `conker_memory_index`, `internal: true`, with no Qdrant
host-port publication. This verifies configuration, not a live network migration.
Ollama management remains reachable because its inference API is intentionally
shared; an inference-only proxy remains separate work. PostgreSQL ownership-based
rehydration of vector hits and the existing owner-control network are unchanged.

Validation: ToolGate **213 passed**, **45 mutations caught**; MemoryGate **57 passed**
on installed cryptography **50.0.0**, **19 mutations caught** (18-case full drill plus
the added quote-override case with its own passing baseline); Companion **37 passed,
19 skipped**, **8 mutations caught**. The Companion skips cover POSIX-only installer
and opt-in integration fixtures. Running-service module-contract tests were excluded
from the gate suites. No paid requests or live stack changes were made. The existing
F0 regression tests remain in these suites/drills.

F12 correction: the bundled-OpenSSL advisory names **48.0.1**, but the PKCS#7 advisory
requires **50.0.0**, so 48.0.1 alone would not cover both.
[OpenSSL wheel advisory](https://github.com/pyca/cryptography/security/advisories/GHSA-537c-gmf6-5ccf),
[PKCS#7 advisory](https://github.com/pyca/cryptography/security/advisories/GHSA-g6cj-pr64-35w5).
The pin upgrade was tested against the already installed 50.0.0; a fresh pip download
was blocked by the session's network restrictions. No Fernet exploit is claimed.

Remaining work: Pi must classify the permanent ingestion error (its F8 half) and
implement its other assigned findings. F10's generic HTTP transfer amounts are
still outside inference-cost accounting. MemoryGate hosted spending stays disabled
until a metered adapter exists. Release is local accounting, not a provider refund;
nonzero manual reconciliation, disputed-release resolution, and an owner UI remain
follow-ups. Owners must stop active workers and verify the provider outcome before
attesting that an action did not execute. Review the ToolGate spending contract for
the endpoint and its evidence requirements.

| **B12** | ~~The pinned Pi image predates the gateway code~~ **FIXED by the 0.4.0 release** | The gateway runs from `ghcr.io/alexeybe1kin/pi` but the `gateway/` module landed on main today and was never published as a new Pi image, so `conker-gateway` restart-loops with `No module named gateway`. Browser auth cannot come up until a new Pi image is tagged and `versions.env` bumped. This is the deployment half of B4. |

## D. Cheap

| # | |
|---|---|
| **D1** | Qdrant → `pgvector`, one less database to run, back up and upgrade |
| **D2** | SearXNG behind a compose profile — 124 MB, only for web search |

---

## The loop

Take the top unticked item, fix it, tick it, add what the fix revealed.
