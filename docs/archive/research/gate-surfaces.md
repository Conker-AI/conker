# What the three gates actually expose

Research for [#4](https://github.com/alexeybe1kin/companion/issues/4). Fact-finding only — this
document records what is true in the code. It makes no architectural recommendation.

**Method.** Every claim below was read out of the source of the three public repositories via
`gh api repos/OWNER/REPO/contents/...`, not from any concept doc and not from a running instance.
Claims that depend on runtime behaviour rather than on source text are marked **[inferred]** and say
what the inference rests on. Where the source was ambiguous the entry says so.

**Sources pinned at these commits (`main`, all pushed 2026-08-23):**

| Repo | Commit | Committed |
|---|---|---|
| `alexeybe1kin/memorygate` | `872faf342510bd884646277217c2e69f0829ad60` | 2026-08-23T05:45:54Z |
| `alexeybe1kin/systemgate` | `fc1ba30e3e57f61d6348e5777b42b9c9467ff78a` | 2026-08-23T06:04:35Z |
| `alexeybe1kin/toolgate`   | `1b78230334cac7d44d089a2f439f6d1c4c9f1390` | 2026-08-23T08:59:48Z |

Nothing was executed. No deployment was reachable from this environment, so every "at runtime"
statement is an inference from source plus deployment config.

---

## 0. Where the concept docs and the code disagree

This is the part of the ticket that matters most. Ordered by how much a v1 spec could be hurt by
believing the doc.

| # | `the-idea.md` Part 2 says | The code says | Severity |
|---|---|---|---|
| 1 | MemoryGate embeddings are `sentence-transformers/all-MiniLM-L6-v2`, 384-dim | `sentence-transformers` **is not a dependency**. `services/api/requirements.txt` has no `sentence-transformers`, no `torch`, no `transformers`; the Dockerfile installs only that file. `services/api/app/services/embeddings.py` raises `RuntimeError` when the model name is anything but the literal `hash`, and `main.py`'s startup hook calls it unconditionally. As shipped the API cannot start with its own default config; the only working configuration is `EMBED_MODEL=hash`, which is a SHA-256 pseudo-vector with **no semantic meaning at all**. | **Critical** |
| 2 | ToolGate: "rotatable agent execution keys with explicit `tool:*` / `automation:*` scopes" | True for the HTTP API. **False for the MCP bridge**, which is the path an agent harness actually uses. `toolgate/mcp/toolgate_mcp.py` imports the control plane in-process, hardcodes the actor as `{"id": "local-mcp", "name": "Pi MCP"}`, presents **every active tool** and never calls `control_plane.is_scoped`. There is no execution key in the MCP path and no scope enforcement. | **Critical** |
| 3 | SystemGate has seven endpoints | It has **eight**. `GET /services` exists in `systemgate/main.py` and is covered by a test, but is absent from SystemGate's own README endpoint list and from `the-idea.md`. | Medium |
| 4 | SystemGate has "no write, exec, shell … endpoints" | No *endpoint* mutates, true. But `/logs/errors` and `/packages` run `subprocess.run(["sh", "-lc", ...])` internally. The commands are fixed and take no caller input, so it is not an injection surface — but "no shell" is not literally accurate, and it matters for the container's capability set. | Medium |
| 5 | MemoryGate "separate scoped agent read keys; admin keys hashed PBKDF2-SHA256" | Both true, but incomplete: when **no** admin key exists in the DB *and* none in the environment, `verify_admin_key()` returns `True` unconditionally and `require_key` returns the tier `"disabled"`. The stock `docker-compose.yml` sets no admin key, so a freshly composed MemoryGate is **fully unauthenticated** until the owner sets one in the dashboard. | High |
| 6 | The MemoryGate tree in `the-idea.md` shows a `dashboard/` beside `services/`, and the README lists a dashboard at `localhost:8021` as one of "the default services" | `docker-compose.yml` defines only `postgres`, `qdrant`, `ollama` (profile-gated) and `api`. **There is no dashboard service.** `docker compose up -d --build` never starts it. | Medium |
| 7 | ToolGate: "Vault values are write-only; there is no API to reveal them" | The *API* claim is true — `vault.list_placeholders()` returns names only and no route returns a value. But the vault is a **plaintext `.env` file** (`toolgate/core/vault.py` over `python-dotenv`), bind-mounted into the container read-write. Nothing is encrypted at rest. MemoryGate, by contrast, Fernet-encrypts its OpenAI key. | Medium |
| 8 | ToolGate README lists four restricted executors (`echo`, `http_json`, `memorygate`, `ollama_generate`) | The code implements **ten**: those four plus `local_echo`, `gemini_generate`, `research_search`, `research_bundle`, `research_fetch`, `research_fetch_batch`. A whole Gemini egress path is undocumented in the executor list. | Medium |
| 9 | GitHub reports MemoryGate's primary language as JavaScript, contradicting "FastAPI/PostgreSQL/Qdrant" | **The doc is right and the label is an artefact.** `GET /repos/.../languages` returns JavaScript 261,503 bytes vs Python 256,457 — the bundled React dashboard outweighs the Python by ~5 KB. The service really is FastAPI on `python:3.11-slim`, SQLAlchemy → PostgreSQL 16, `qdrant-client` → Qdrant. Resolved: no discrepancy. | Resolved |
| 10 | "Three services, already built" | Also inherited: naming from the abandoned prototype is still baked into the code. MemoryGate and ToolGate both attach to an **external Docker network literally named `conker_net`**; MemoryGate's bootstrap key is labelled `"AgentGate Pi"`; ToolGate's dashboard server docstring refers to "Emolga"; SystemGate's tests assert on a container named `agentgate-api`. | Low, but pervasive |

---

## 1. SystemGate

`Python 3.12-slim`, FastAPI 0.141.1 + uvicorn, `psutil`, `docker` SDK. 11 files, ~15 KB of Python.
The smallest and most straightforward of the three.

### 1.1 HTTP surface — eight endpoints, not seven

All in `systemgate/main.py`. Every one is `GET`; there is no `POST`/`PUT`/`DELETE` anywhere.

| Endpoint | Auth | Response shape |
|---|---|---|
| `GET /health` | **none** | `{status, service, time}` |
| `GET /vitals` | admin | `{host, platform, cpu_percent, cpu_count, memory{…}, disk{…}, load[3], temps{}}` |
| `GET /services?limit=` | admin | `{results:[{id:"service-NNN", name, status:"listening", kind:"process-listener", listeners:["<scope>:<port>"]}], source, metadata_only:true}` — **undocumented in the README** |
| `GET /containers` | admin | `{results:[{id, name, image, status, created, stats{}}]}`, or `{results:[], error}` on any Docker failure |
| `GET /processes?limit=` | admin | `{results:[{pid, name, username, cpu_percent, memory_percent, cmdline}]}` |
| `GET /logs/errors` | admin | `{text}` — one bounded string |
| `GET /packages` | admin | `{generated_at, pip:{ok,output}, npm:{ok,output}, apt:{ok,output}}`, cached 3600 s |
| `GET /backups` | admin | `{root, latest, results:[{name, path, created_at}]}` |

`limit` is clamped in code: `/services` 1–200 (default 80), `/processes` 1–100 (default 20).
Bounded outputs are real: logs truncated to the **last** 12,000 chars, each `_run_summary` to 2,000,
`cmdline` to 300, process names to 80, backups to 20 rows.

The `listeners` field on `/services` is a deliberately abstracted `"<scope>:<port>"` string where
scope is one of `loopback`, `tailscale` (any `100.x`), `private-lan`, `container-internal`,
`all-interfaces`, `public-or-host` — the raw IP is never returned.

### 1.2 Auth model

Single shared admin key in the `X-SystemGate-Key` header, applied per-route via
`dependencies=[Depends(require_admin)]`. `/health` is deliberately open. Storage is PBKDF2-HMAC-SHA256,
200,000 rounds, 16-byte salt, written once to `data/admin-key.pbkdf2` at 0600 (`auth.py`,
`main.py:_ensure_key_hash`). Verification is `hmac.compare_digest`.

Two properties of `_ensure_key_hash` worth recording:

- It writes the hash **only if the file does not exist**. Changing `SYSTEMGATE_ADMIN_KEY` in `.env`
  after first boot therefore has no effect — there is no rotation path short of deleting the file.
- There is no lockout or rate limit on failed attempts (MemoryGate has one; ToolGate does not either).
  Every authenticated request pays a full 200k-round PBKDF2 and a file read, since nothing is cached.

### 1.3 Deployment posture

`docker-compose.yml` publishes `127.0.0.1:8040:8040` and mounts `/var/run/docker.sock:ro`,
`/proc:/host/proc:ro`, and `${SYSTEMGATE_BACKUP_ROOT:-~/systemgate-backups}:/backups:ro`.

### 1.4 Rough edges

- **`/host/proc` is mounted and never read.** No code path references it and `psutil` is not
  configured with `PROCFS_PATH`. **[inferred]** `/processes` and `/services` therefore report the
  *container's* PID and network namespaces — effectively uvicorn and itself — not the host's, since
  compose sets neither `pid: host` nor `network_mode: host`. `/vitals` is mixed: `/proc/stat` and
  `/proc/meminfo` are not namespaced so CPU and memory are host-wide, but `disk_usage("/")` measures
  the container filesystem.
- **`/logs/errors` and `/packages` invoke binaries the image does not contain.** The Dockerfile is
  `python:3.12-slim` + `requirements.txt` and nothing else — no `journalctl`, no `docker` CLI, no
  `npm`. **[inferred]** `/logs/errors` returns "unavailable" text for both of its commands, `npm
  outdated` fails, and `pip list --outdated` / `apt list --upgradable` describe the SystemGate
  container rather than the host. `/containers` is unaffected because it uses the Docker SDK over
  the socket.
- **`:ro` on `docker.sock` does not make Docker read-only.** A read-only bind mount of a Unix socket
  still permits full bidirectional use of the Docker API. SystemGate's own code only reads, but the
  container holds daemon-level authority. The README's "Read-only host mounts" bullet reads stronger
  than it is.
- `/backups` returns absolute host paths and `/processes` returns full `cmdline` strings, which can
  carry secrets passed as CLI arguments. `/services` was deliberately built to avoid exactly this
  (its test asserts no `pid`, `cmdline`, `env` or `username` leaks) — `/processes` predates that care.

---

## 2. MemoryGate

FastAPI 0.138.2 on `python:3.11-slim`, SQLAlchemy 2 → PostgreSQL 16, `qdrant-client` → Qdrant,
optional Ollama or OpenAI. API on `127.0.0.1:8020`. **Confirmed: the Python/FastAPI description is
accurate; the "JavaScript" repo label is the bundled React dashboard outweighing it by ~5 KB.**

### 2.1 HTTP surface

`services/api/app/main.py` mounts fifteen routers. Two unauthenticated routes exist by design:
`GET /health` and `POST /runtime/listeners/{source_key}` (source secret instead). Everything else is
behind `require_key` (admin) or `require_read_key`.

`main.py` attaches `Depends(require_key)` at include time for every router **except** `runtime_router`
and `skills_context_router`. Those two declare their dependencies per route instead — I checked all
nine of their routes and each carries `require_key`, `require_read_key`, or the listener secret. No
route is accidentally open.

**Agent-facing (read key accepted):**

- `POST /runtime/context` — the bounded context package.
- `POST /runtime/ask` — retrieval + a local-model answer. **Not mentioned in
  `docs/AGENT_INTEGRATION.md`, which states MemoryGate "has two stable runtime calls."** Returns 503
  when Ollama is unavailable.
- `GET /context/skills?tool=` — tool-linked skill text, consumed by ToolGate's MCP bridge.

**Listener ingress:** `POST /runtime/listeners/{source_key}` with `X-MemoryGate-Listener-Key`,
compared by `hmac.compare_digest` against the per-source `ingest_key`, with the same 5-attempt /
300-second lockout as admin auth. This route overrides `source_key` and `agent_id` from server-side
config, so a listener cannot forge either.

**Admin (abbreviated — 60+ routes):** `/auth/*` (key change, rotate, agent-key CRUD), `/evidence/*`
(sources, rotate ingest key, list/create evidence, list analysis), `/lineage/*` (episodes, object
links, `GET /lineage/{object_type}/{object_id}`), `/memory/*` (write, search, conflicts, revisions,
CRUD), `/entity/*` (CRUD, search, merge, link, edges, events, history), `/observation/*` (create,
search, active, confirm, contradict, archive), `/pattern/*` (create, search, active, candidates,
confirm, contradict, promote), `/skills/*`, `/transcripts/*`, `/audit` + `/audit/metrics`,
`/config/{agent_id}`, `/briefing/{agent_id}`, `/runtime/{ingest,jobs,health,jobs/{id}/retry,
evidence/{id}/invalidate}`, and `/system/*` (backups, backup download, AI runtime, memory reset).

Multi-tenancy is by `X-Agent-Id` header (default `"default"`), with a body-level `agent_id`
overriding the header (`core/agent.py:resolve_agent_id`). **This is an ownership scoping key, not an
authentication factor** — an admin key plus any `X-Agent-Id` reaches that agent's data.

### 2.2 Auth model

- **Admin** — `X-MemoryGate-Key`. DB-managed key is PBKDF2-HMAC-SHA256, 200k rounds, salted. An
  env-var key (`MEMORYGATE_ADMIN_KEY`) is compared in **plaintext** via `secrets.compare_digest`, so
  "never plaintext" applies only to the DB path. New keys must pass a complexity check (≥14 chars,
  upper, lower, digit, symbol).
- **Read** — same header, resolved against `agent_access_key` rows scoped by `agent_id`. Keys are
  prefixed `mg_read_`, PBKDF2-hashed. An admin key also satisfies `require_read_key`.
- **Listener** — per-source `X-MemoryGate-Listener-Key`.
- **Lockout** — 5 failures → 300 s, keyed by `f"{purpose}:{client_host}[:{agent}]"` in a
  **process-local dict**, so it resets on restart and does not survive multiple workers.
- **Open by default** — see §0 item 5. `get_auth_state()` returns `auth_enabled: False` and
  `verify_admin_key()` returns `True` when neither key source exists.
- **CORS is `allow_origins=["*"]`** with all methods and headers (`main.py`), with an inline comment
  arguing header auth makes this safe. Combined with the open-by-default state, any page in the
  owner's browser can reach a fresh MemoryGate on `127.0.0.1:8020` — including
  `POST /system/memory-reset`, whose only additional guard is a `current_key` field that
  `verify_admin_key` accepts as valid when no key is set. ToolGate, by contrast, restricts CORS to
  configured dashboard origins.

### 2.3 The bounded context package

Built by `_build_context` in `routes/runtime.py`. Request (`schemas/runtime.py`):

```json
{ "query": "…", "session_context": "", "max_items": 12, "include_evidence": false, "agent_id": null }
```

`max_items` is clamped 1–30. Note that **`session_context` is accepted and never read** — it appears
in the schema and in `AGENT_INTEGRATION.md`'s example, but no code path references it.

Response:

```json
{
  "query": "…", "agent_id": "…",
  "briefing": { "emotional_state", "mood_summary", "active_streaks", "pending_clarifications",
                "active_tasks", "people_relevant", "watch_flags" },
  "memories":  [{ "id","text","summary","type","confidence","score","source_type" }],
  "entities":  [{ "id","name","type","description","summary","attributes" }],
  "episodes":  [{ "id","title","summary","occurred_start" }],
  "evidence":  [{ "id","title","summary","source","occurred_at" }],
  "usage": { "instruction": "Use high-confidence memories and entities first. …" }
}
```

Retrieval is hybrid and defensive: a Qdrant vector search wrapped in a bare `except Exception` that
falls back to a SQL `ILIKE`, then a lexical pass over the 200 most recently updated active memories
adding `+0.3` per matching term, then a sort by score. Entities (≤8), episodes (≤5) and optional
evidence (≤5) are pure `ILIKE` over query terms longer than two characters — **no vector search is
used for them in the context path**, despite the entity and observation Qdrant collections existing.

`briefing` is a separate, genuinely bounded object (`services/briefing.py`): fixed lookback windows
(7/21/30/14 days), an estimated **300-token budget**, and a deterministic trim order that drops
`watch_flags`, then `people_relevant`, then truncates tasks and clarifications. It is the only part
of the package with a size budget — `memories` is capped by count, not by token or character length,
and each memory's `text` is returned in full.

Every `/runtime/context` and `/runtime/ask` call writes a `MemoryAudit` row with result counts, not
content.

### 2.4 Evidence → Analysis → Memory

The layer model in `the-idea.md` is real and matches the code: `evidence_object`, `analysis_object`,
`memory`, `entity`, `episode_object`, `object_link`, `observation`, `pattern`, `memory_revision`,
`memory_conflict`, `processing_job`, `session_transcript`. Ingest writes an immutable
`EvidenceObject`, optionally enqueues a `ProcessingJob`, and a background worker
(`services/processing_worker.py`, 2 s poll) drives classification, signal filtering, entity dedup,
observation lifecycle and pattern promotion. Failures keep their error on the job and can be retried
via `POST /runtime/jobs/{job_id}/retry`; `POST /runtime/evidence/{id}/invalidate` preserves history
and zeroes outgoing support. Lineage is queryable at `GET /lineage/{object_type}/{object_id}`.

### 2.5 `integrations/mcp` and `services/mcp`

`services/mcp/memorygate_mcp.py` is a ~60-line stdio JSON-RPC loop over `urllib`. It exposes exactly
**one** tool:

- `memorygate_context(query: string, include_evidence?: boolean)` → `POST /runtime/context` with
  `max_items` hardcoded to **12**, headers `X-MemoryGate-Key` and `X-Agent-Id`, result returned as
  `content: [{type: "text", text: <json>}]`.

It handles `initialize`, `tools/list`, `tools/call`, and replies `{}` to anything else with an id.
Configuration comes from `MEMORYGATE_URL`, `MEMORYGATE_KEY`, `MEMORYGATE_AGENT_ID`;
`integrations/mcp/memorygate.mcp.json` is a three-line client config pointing at it. There is no
ingest, write, or admin tool — the read-only boundary claim holds. `integrations/agent-skill/SKILL.md`
is a 12-line skill telling an agent to shell out to the CLI instead.

`services/cli/memorygate.py` exposes `context` (read key) and `ingest` (admin key) subcommands.

### 2.6 Rough edges

- **Embeddings — see §0 item 1.** The single most consequential finding. Under `EMBED_MODEL=hash`,
  `_hash_embed_text` derives each of 384 components from `sha256(f"{i}:{text}")`, so two different
  strings produce uncorrelated vectors. Cosine similarity is noise; only byte-identical text matches.
  Semantic retrieval, near-duplicate detection (`find_near_duplicate`), entity dedup and observation
  similarity all silently degrade to exact-match. The lexical fallback in `_build_context` is what
  actually carries retrieval quality.
- **Writes are hard-coupled to Qdrant; reads are not.** `upsert_memory_embedding` in
  `routes/memory.py` (write, patch, conflict-resolve) is called **after** the Postgres commit and is
  **not** wrapped in try/except — a Qdrant or embedding failure returns 500 to the caller with the
  row already committed, leaving the two stores divergent. `delete_memory_embedding` *is* guarded,
  with a comment explaining exactly that reasoning; the write path never got the same treatment.
- **Hardcoded personal ranking terms.** `POST /memory/search` adds `+0.35` if the query contains
  `"humor"` and the memory contains `humor|sarcasm|deadpan|joke`, and another `+0.35` for
  `sidecar|build|architecture|workflow`. Prototype tuning left in a scoring function.
- **`docker compose up` fails from a clean checkout.** `conker_net` (external) must pre-exist, and no
  `.env.example` is provided even though `EMBED_MODEL=hash` is required for the API to boot.
- `dashboard/server.py` binds `0.0.0.0:8021` and is absent from compose entirely.
- `services/api/app/services/qdrant_stub.py` is dead code — a one-function stub nothing imports.
- `@app.on_event("startup")` is deprecated in this FastAPI generation (lifespan is the replacement);
  SystemGate already uses `lifespan`, MemoryGate and ToolGate do not.

---

## 3. ToolGate

FastAPI 0.138.2 on `python:3.11-slim`, **SQLite** (not Postgres, despite the repo's `postgres`
topic tag), `httpx`, `python-dotenv`. `toolgate/api/server.py` is a single **98 KB** module holding
all 54 routes, all executors and the workflow engine. API on `127.0.0.1:8010`, dashboard on
`127.0.0.1:8011`, plus a pinned SearXNG container.

### 3.1 Object model

Confirmed as described. All four live in one SQLite table `v2_objects(kind, id, body, …)` with agent
keys in `v2_agent_keys` and an append-only `v2_events` (`core/control_plane.py`).

- **Service** — `{id, name, description, secret_refs[], health, destination_policy{}, status}`.
- **Tool** — `{id, name, description, service_id, category, inputs[], outputs[], execution{},
  policy{}, authorization, version, status}`. `id` must match `^[a-z0-9][a-z0-9.-]{1,79}$`.
  `authorization ∈ {auto, ai_review, owner_confirmation, blocked}`.
- **Automation** — `{id, name, inputs[], workflow[], policy{}, authorization, schedule, version,
  status}`. Blocks: `tool_call, set, calculation, condition, switch, loop, retry, delay,
  notification, return`. Nesting ≤4, loop ≤20 iterations, retry ≤3 attempts, delay ≤30 s, default
  ≤100 steps. Expressions reference `$args.x`, `$vars.x`, `$last.path`.
- **Request** — `{kind, title, details, actor, payload{}, severity, status, decision}` where
  `kind ∈ {verification, ai_draft, update, …}` and `status ∈ {pending, approved, rejected, dismissed}`.

Objects are addressed by string id in the path: `/v2/tools/{tool_id}`, `/v2/automations/{id}`,
`/v2/requests/{id}`. Scope strings are `tool:<id>`, `automation:<id>`, `tool:*`, `automation:*`, `*`,
and any prefix ending in `*`. `is_scoped()` is unusually permissive — it also accepts a bare
`<tool_id>` with no `tool:` prefix and does prefix matching in several forms.

### 3.2 HTTP surface — 54 routes

Three auth tiers, enforced per route.

| Tier | Header | Routes |
|---|---|---|
| open | — | `GET /health` |
| **admin** | `X-ToolGate-Key` | 43 routes: `/auth/check`, `/vault/secrets` (list/create/update/delete), `/settings/keys/admin/rotate`, `/v2/status`, `/v2/settings` (get/put), `/v2/settings/lockdown`, `/v2/verification-methods` (list/create/delete), `/v2/ai/*` (conversation, proposals, sessions CRUD, messages, submit), `/v2/agent-keys` (list/create/patch scopes/revoke), `/v2/services` (list/create/check), `/v2/tools` (list/get/create/update/delete), `/v2/automations` (list/get/create/update/delete), `/v2/requests` (list), `/v2/admin/requests`, `/v2/requests/{id}/decision`, `/v2/events` |
| **agent** | `X-ToolGate-Execution-Key` | 10 routes: `GET /v2/agent/status`, `GET /v2/agent/tools`, `GET /v2/agent/tools/{id}`, `GET /v2/agent/automations`, `GET /v2/agent/automations/{id}`, `POST /v2/tools/{id}/invoke`, `POST /v2/automations/{id}/run`, `POST /v2/requests`, `GET /v2/agent/requests/{id}`, `GET /v2/agent/events` |
| signature | `X-ToolGate-Signature` + `X-ToolGate-Timestamp` | `POST /v2/verification/callback` |

The agent tier is genuinely narrow: the `/v2/agent/*` list routes filter by `is_scoped`,
`/v2/agent/requests/{id}` returns only requests whose `created_by_agent_key` matches the caller, and
`/v2/agent/events` projects each event down to six non-payload fields.

**Auth mechanics.** The admin key is a `uuid4().hex` auto-generated on first startup and stored
**in plaintext** in `toolgate/.env` (`core/vault.py:ensure_control_keys`); `require_admin` is a
`secrets.compare_digest` against that value, with **no lockout and no rate limit**. Agent keys are
`"tgx_" + secrets.token_urlsafe(32)`, stored as an **unsalted single-round SHA-256** — adequate for
a 256-bit random secret, but inconsistent with the 200k-round PBKDF2 the other two gates use.
CORS is restricted to `TOOLGATE_DASHBOARD_ORIGINS` (default `localhost:8011,127.0.0.1:8011`).

### 3.3 The approval binding — exact contract

`core/control_plane.py`. This is the best-engineered part of the three repos and the doc's
description of it is accurate.

**Mint.** When a tool with `authorization ∈ {owner_confirmation, ai_review}` is invoked without a
prior approval, `invoke_tool` calls `create_verification_request(...)` which builds:

```json
{ "subject_type": "tool", "subject_id": "<id>", "version": 3,
  "args_digest": "<sha256>", "nonce": "<token_urlsafe(24)>",
  "expires_at": "<iso8601>", "consumed_at": null }
```

`args_digest = sha256(json.dumps({subject_type, subject_id, version, args}, sort_keys=True,
separators=(",",":"), ensure_ascii=True))`. Expiry is `default_confirmation_expiry_seconds`
(default 60) **clamped to 15–900 seconds**. The request records `created_by_agent_key`.

**Return to caller.** The invocation does not block. It returns, with HTTP 200:

```json
{ "code": "CONFIRMATION_REQUIRED",
  "message": "This exact action is queued for owner review.",
  "request_id": "<uuid>", "expires_at": "…",
  "next_action": "After approval, retry with --approval-request-id <uuid>" }
```

**Approve.** Either `POST /v2/requests/{id}/decision` (admin) or a signed callback.

**Consume.** The caller retries the *identical* call with `approval_request_id` set.
`consume_verification` opens `BEGIN IMMEDIATE` on SQLite and checks, in order: request exists; kind
is `verification` and status is `approved`; `actor_id` equals the originating `created_by_agent_key`;
`consumed_at` is null; not expired; and `compare_digest(args_digest, recomputed_digest)`. Only then
does it stamp `consumed_at`/`consumed_by` inside the same transaction. **Replays, a different agent
key, changed arguments, a bumped tool version, and expiry all fail closed** with
`APPROVAL_INVALID` / HTTP 409.

**How a caller consumes it, concretely:**

- HTTP — `POST /v2/tools/{id}/invoke` with `{"args": {...}, "approval_request_id": "<uuid>"}`.
- CLI — `toolgate tool <name> --approval-request-id <uuid> …`, and `toolgate request status <id>`.
- MCP — the same `tools/call` with `approval_request_id` added to the arguments object (the bridge
  injects that property into every tool's `inputSchema`), plus a `toolgate_request_status` tool.

**Signed callback.** `HMAC-SHA256(secret, f"{unix_ts}.{canonical_json_body}")` sent as
`X-ToolGate-Signature: sha256=<hex>` with `X-ToolGate-Timestamp`; ±60 s window; the body's `nonce`
must `compare_digest` against the request's binding nonce; **five rejected callbacks in 300 seconds
auto-enable lockdown**. The canonical body is re-serialized from the parsed Pydantic model, so a
signer must reproduce Python's `sort_keys=True, separators=(",",":"), ensure_ascii=True` exactly.

### 3.4 The stdio MCP bridge — exact contract

`toolgate/mcp/toolgate_mcp.py`, server `{"name": "toolgate", "version": "0.3.0"}`, protocol version
echoed from the client (default `2025-06-18`), capabilities `{"tools": {}}`. Handles `initialize`,
`tools/list`, `tools/call`; replies `{}` to any other method carrying an id. One JSON-RPC object per
line on stdout.

**It is an in-process adapter, not an HTTP client.** It inserts the repo root on `sys.path`, imports
`toolgate.core.control_plane` and `toolgate.api.server` directly, and calls
`server.invoke_tool(tool, args, "Pi MCP", approval_request_id=…, actor_id="local-mcp")`. Consequences:

1. **No credential and no scope check.** No execution key is read; `is_scoped` is never called.
   `_visible_tools()` returns *every* tool with `status == "active"`. An MCP-connected agent sees and
   can invoke the entire active catalogue. This is the §0 item 2 discrepancy — and it is the path the
   Companion harness would actually use.
2. **Everything inside `invoke_tool` still applies**: lockdown, deterministic input validation,
   `authorization: blocked`, the approval binding, rate/cooldown limits, restricted executors, output
   schema validation, and audit events. The boundary is not absent — the *identity and scope* layer is.
3. All MCP calls share one actor identity, so the audit trail cannot distinguish agents and the
   binding's originating-agent check is a no-op across MCP callers.
4. It requires local filesystem access to `toolgate.db` and `.env`, so it must run on the same host as
   ToolGate's state. It cannot bridge to a remote ToolGate.
5. **Automations are not exposed** — only `kind == "tool"` objects, plus the synthetic
   `toolgate_request_status`. Automations are reachable exclusively over HTTP.

**Name mapping.** `research.search` → `research_search`: non-`[A-Za-z0-9_-]` characters become `_`,
stripped of leading/trailing `_`, prefixed `tool_` if it does not start with a letter or underscore,
truncated to 64 chars, and on collision suffixed with 8 hex chars of `sha1(tool_id)`. The original id
is appended to the description as `ToolGate id: <id>.` and `_resolve_tool` accepts either form.
`TOOLGATE_MCP_PRESERVE_IDS=1` disables mapping.

**Schema mapping.** Typed ToolGate `inputs` → JSON Schema with `minLength`/`maxLength`/`pattern`,
`minimum`/`maximum`, `enum` from `allowed_values`, array `items`/`minItems`/`maxItems`/`uniqueItems`,
`default`, `additionalProperties: false`, and `required` from `required: true`. Plus the injected
optional `approval_request_id` string.

**Optional skill injection.** With `TOOLGATE_SKILL_INJECTION=1`, the bridge calls MemoryGate's
`GET /context/skills?tool=<id>` (2 s timeout, 300 s cache, truncated to 2048 bytes) and appends the
returned skill text to the MCP tool description. **This means MemoryGate content is injected into
tool descriptions the model reads as instructions** — the one place where MemoryGate's untrusted-data
boundary is crossed into a trusted position. It is off by default.

Results are returned as `{"content": [{"type": "text", "text": "<json>"}]}`; errors as JSON-RPC
`-32000` whose message is a JSON-encoded ToolGate detail object.

### 3.5 Executors and egress

Ten executors (see §0 item 8). `http_json` egress control is genuinely strict: HTTPS only, exact
per-tool `allowed_hosts`, DNS resolution rejected if any resolved address is private/loopback/
link-local/multicast/reserved, redirects denied outright (`follow_redirects=False`, 3xx → 502),
timeout ≤30 s, response ≤1 MiB, secrets injected as headers by vault reference only, and `POST`
permitted only when `authorization == "owner_confirmation"`.

Research tools do not accept URLs — search returns short-lived `rr_…` handles and only
`research_fetch` can resolve them.

### 3.6 Rough edges

- The MCP scope bypass (§0 item 2).
- **`server.py` is one 98 KB file** holding routes, executors, the workflow interpreter, validators
  and the AI planner. `core/research.py` is another 69 KB. There is no route module split.
- Plaintext `.env` vault (§0 item 7), bind-mounted read-write into the container as `./:/app/toolgate`
  — the whole package directory, including the SQLite DB and the admin key.
- `require_admin` has no lockout or rate limit, unlike MemoryGate's admin auth.
- SHA-256-without-salt agent keys vs PBKDF2 elsewhere.
- `toolgate/cli/toolgate` is extensionless and marked executable — on Windows it needs an explicit
  interpreter.
- Two workflow blocks call `time.sleep` on the request thread (`delay`, and `retry`'s backoff),
  blocking a worker for up to 30 s per step.

---

## 4. The three bundled dashboards

| | MemoryGate | ToolGate | SystemGate |
|---|---|---|---|
| Stack | React + Vite + React Router | React + Vite + wouter | **none** |
| Served by | `dashboard/server.py`, uvicorn static SPA, `0.0.0.0:8021` | same pattern, `0.0.0.0:8011` | — |
| In compose? | **No** | Yes (`toolgate-dashboard`) | — |
| Screens | 19 | 13 | — |
| Auth | admin key in `sessionStorage['memorygate_admin_key']`, sent as `X-MemoryGate-Key` | admin key in `sessionStorage['toolgate_admin_key']`, sent as `X-ToolGate-Key` | — |

**MemoryGate screens:** Overview (command center), Pipeline, Runtime, Memory Lab, Windows, Database,
Beliefs, Memories, Skills, Entities (with a graph component), Evidences, Episodes, Observations,
Patterns, Briefing, Transcripts, Dev, Settings. `SettingsScreen.jsx` is 24 KB and `EntitiesScreen.jsx`
is 31 KB — the two heaviest files in the repo.

**ToolGate screens:** Command Center, Activity, AI Builder, Services, Tools, Tool detail, Automations,
Automation detail, Requests, Verification, Security, Settings, Secrets. `CapabilityDetailScreen.jsx`
is 39 KB (the tool/automation editor with roadmap, layer map, block editor and code view);
`ControlPlaneScreens.jsx` bundles nine screens into 29 KB.

**SystemGate has no dashboard at all** — its README explicitly expects "a dashboard such as AgentGate"
to consume it through a server-side proxy. `the-idea.md`'s claim that each of the three services has a
bundled dashboard is two-thirds true.

**Overlap with what a Companion dashboard would need.** Stated as fact, not as a recommendation:
the concept dashboard's list (chats, memory, tools, skills, system info, terminal, safety checks,
agents, flows, runtime, cron jobs, settings, suggestions) overlaps the existing screens directly —
memory ↔ MemoryGate's 19 screens, tools/flows/safety ↔ ToolGate's 13, system info ↔ what SystemGate's
eight endpoints feed. Both existing dashboards are single-tenant admin consoles that hold the **admin**
key in browser `sessionStorage` and call their API from the browser, which is the opposite of the
server-side-proxy posture SystemGate's README recommends.

**Both dashboards are unreachable over Tailscale as configured. [inferred]** Each `api.js` computes
its production base URL as `${window.location.hostname}:<api-port>`, but compose publishes both APIs
on `127.0.0.1` only. Opening the dashboard from a tailnet device therefore serves the SPA (bound
`0.0.0.0`) while every API call targets a port not published on that interface. ToolGate's own
`dashboard/server.py` docstring says the port exists "purely so the owner can open the dashboard from
any device on the tailnet" — that intent and the CORS allowlist (`localhost:8011` only) contradict
each other.

---

## 5. Cross-cutting observations

1. **Three different auth idioms.** SystemGate: PBKDF2, no lockout, no rotation. MemoryGate: PBKDF2 +
   lockout + rotation + a scoped read tier, open when unconfigured. ToolGate: plaintext admin key, no
   lockout, SHA-256 agent keys, scopes, plus an unauthenticated in-process path. Four different
   header names: `X-SystemGate-Key`, `X-MemoryGate-Key`, `X-ToolGate-Key`, `X-ToolGate-Execution-Key`.
2. **Three different storage engines** — PostgreSQL + Qdrant, SQLite, and none.
3. **`conker_net` is a hard coupling.** Both MemoryGate and ToolGate declare it `external`, so both
   compose stacks fail unless it is created first, and it is not created by either repo.
4. **ToolGate depends on MemoryGate, not the reverse.** The `memorygate` executor and the MCP bridge's
   skill injection both call MemoryGate; MemoryGate never calls ToolGate. SystemGate is fully
   standalone and is called by neither.
5. **No inter-service authentication scheme.** ToolGate reaches MemoryGate with a static
   `MEMORYGATE_READ_KEY` from its plaintext `.env`. There is no rotation, no mTLS, no request signing
   between services; `conker_net` membership is the trust boundary.
6. **Docs drift is systematic, not incidental.** In every one of the three repos the README describes
   a slightly smaller and tidier system than the code (seven endpoints vs eight, four executors vs ten,
   two runtime calls vs three, one dependency claim that is not in `requirements.txt`). The pattern is
   consistent enough that no README statement about these gates should be treated as load-bearing
   without a code check.

---

## 6. What could not be determined

- **Whether anything is currently deployed, and with what configuration.** No running instance was
  reachable. In particular the *actual* value of `EMBED_MODEL` on the owner's server is unknown, which
  is the difference between "MemoryGate's API is crash-looping" and "semantic search is silently
  returning noise." **This is the single highest-value thing to check on the box.**
- **Whether `sentence-transformers` was installed into the running image out of band** (a manual
  `pip install`, a locally modified Dockerfile). The repository as published cannot produce it.
- **The runtime behaviour of SystemGate's `/processes`, `/services`, `/logs/errors` and `/packages`
  inside the container.** The reasoning in §1.4 follows from the Dockerfile and compose file, but was
  not observed. One `curl` against a live instance would settle all four.
- **How the `local-mcp` actor is wired in practice** — whether the harness runs the MCP bridge, the
  CLI with a scoped key, or the HTTP API directly. That choice decides whether the scope bypass is
  theoretical or live.
- **Whether `docs/screenshots/*.png` still reflect the current screens.** They were not compared.
- Screen-by-screen behaviour of the two dashboards. Screens were enumerated from the routers and
  file sizes; individual screen logic was not read line by line.
