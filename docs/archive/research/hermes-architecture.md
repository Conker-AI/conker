# Hermes Agent: architecture and extension points

Research for [#3](https://github.com/alexeybe1kin/companion/issues/3). Facts only — the
adopt-or-build decision belongs to [#2](https://github.com/alexeybe1kin/companion/issues/2).

**Subject:** [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) — MIT,
Python, "The agent that grows with you".

**Evidence base.** Everything below was read from a shallow clone of `main` at commit
`77adb80d52c70e7ff8186276d977c0fdca320311` (2026-09-03), reporting version `0.21.0`
(`pyproject.toml`), plus the docs that ship inside that same tree under `website/docs/`
(the source of `https://hermes-agent.nousresearch.com/docs/`) and `docs/`. Repository
metadata came from the GitHub API. Where code and shipped docs disagree, code is treated
as authoritative and the disagreement is called out.

Citations are `path:line` into that commit. Anything I could not verify is marked
**UNVERIFIED** or **UNKNOWN**.

---

## 0. Shape of the thing (context for everything below)

| Fact | Value | Source |
|---|---|---|
| Licence | MIT, © 2025 Nous Research | `LICENSE:1` |
| Language / Python | Python, `>=3.11,<3.14` | `pyproject.toml` |
| Python LOC (excl. `website/`) | ~236,500 across ~5,100 files | `find`/`wc` on the clone |
| Largest single files | `cli.py` 22.4k lines, `hermes_state.py` 17.4k, `run_agent.py` 10.2k, `hermes_cli/plugins.py` 7.2k | `wc -l` |
| Core pip deps | 34, **all exact-pinned** (`==X.Y.Z`), deliberately | `pyproject.toml` `[project].dependencies` |
| Optional extras | 44 extras (`anthropic`, `mcp`, `voice`, `honcho`, `all`, …) | `pyproject.toml` `[project.optional-dependencies]` |
| Locked transitive packages | 255 in `uv.lock` | `uv.lock` |
| Stars / forks / open issues | 240,308 / 49,189 / 38,687 | GitHub API, 2026-09-03 |
| Releases | 31, from 2026-03-12 to 2026-08-31 | GitHub API `/releases` |
| Commit rate on `main` | 207 commits on 2026-09-01; 159 on 2026-08-30 | GitHub API `/commits` (paginated) |

Nous also ships a product called the **"Nous Tool Gateway"** (`tools/managed_tool_gateway.py`,
`website/docs/user-guide/features/tool-gateway.md`). It is a *vendor passthrough* for web
search / image gen / TTS / cloud browser billed through a Nous Portal subscription. It is
unrelated to Conker's ToolGate beyond the name; expect the collision in any conversation.

---

## 1. Can the built-in memory be disabled or replaced?

**Yes to both, and they are separate switches.** The built-in stores and the external
provider slot are independent.

### 1.1 The built-in stores

Two files: `MEMORY.md` (2,200 chars) and `USER.md` (1,375 chars), in
`~/.hermes/memories/`, injected into the system prompt as a **frozen snapshot at session
start** and never refreshed mid-session (prefix-cache preservation)
(`website/docs/user-guide/features/memory.md`). Writes go through one `memory` tool with
`add` / `replace` / `remove`; there is no `read`. Over-limit writes return an error rather
than compacting.

Both are config flags, both default `true`:

```yaml
memory:
  memory_enabled: true        # MEMORY.md
  user_profile_enabled: true  # USER.md
  memory_char_limit: 2200
  user_char_limit: 1375
  nudge_interval: 10
```

(`cli-config.yaml.example:895-908`; parsed in `tools/memory_tool.py:1198-1204`.)

Setting both to `false` is a clean shutdown, not a hack:

- `agent_init` never constructs the `MemoryStore` at all
  (`agent/agent_init.py:1918-1940`), so `agent._memory_store` stays `None` and nothing is
  injected into the prompt (`agent/system_prompt.py:928-937`).
- The `memory` tool's `check_fn` returns `False` when both flags are off
  (`tools/memory_tool.py:1207-1213`), so the tool is silently dropped from the schema.
- The memory *guidance* paragraph is only appended when `"memory" in
  agent.valid_tool_names` (`agent/system_prompt.py:530-534`), so the prompt does not tell
  the model to write to a store that no longer exists.

There is also a partial mode: `memory_enabled: false, user_profile_enabled: true` renders
guidance that explicitly forbids `target='memory'` (`agent/prompt_builder.py:261-299`).

### 1.2 The external provider slot

`agent/memory_provider.py` defines a `MemoryProvider` ABC. Eight providers ship bundled
(Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover, Supermemory)
(`website/docs/user-guide/features/memory-providers.md`). Selection is
`memory.provider: <name>` in `config.yaml`; **exactly one can be active**
(`website/docs/developer-guide/memory-provider-plugin.md`, "Single Provider Rule").

Required: `name`, `is_available()` (no network calls), `initialize(session_id, **kwargs)`,
`get_tool_schemas()`, `handle_tool_call()`, `get_config_schema()`, `save_config()`.
Optional hooks (`agent/memory_provider.py:169-400`):

| Hook | When |
|---|---|
| `system_prompt_block()` | system-prompt assembly |
| `prefetch(query, *, session_id)` | before the turn's tool loop — returns a string |
| `queue_prefetch(query, …)` | after a turn, pre-warm |
| `on_turn_start(turn_number, message)` | start of each turn |
| `sync_turn(user, assistant, *, session_id, messages)` | after each completed turn |
| `on_session_end(messages)` / `on_session_switch(...)` | session boundaries |
| `on_pre_compress(messages)` | before context compression |
| `on_delegation(task, result, *, child_session_id)` | when a subagent completes |
| `on_memory_write(action, target, content)` | mirrors built-in memory writes |
| `backup_paths()`, `shutdown()` | housekeeping |

**Discovery order is deliberately reversed** vs. general plugins — bundled > user
(`$HERMES_HOME/plugins/<name>/`) > project (`./.hermes/plugins/<name>/`, needs
`HERMES_ENABLE_PROJECT_PLUGINS=1`) > pip entry point (`hermes_agent.memory_providers`).
Earlier wins, so a dropped-in directory can never shadow a shipped provider and silently
redirect memory (`website/docs/developer-guide/memory-provider-plugin.md`). Discovery only
*enumerates*; nothing is imported until `memory.provider` names it.

**A MemoryGate provider cannot be upstreamed.** `CONTRIBUTING.md:72` — "We are no longer
accepting new memory providers into this repo… publish it as a **standalone plugin repo**".
That is the intended path, not a workaround: user-directory and pip entry-point providers
get everything a bundled one does, including `config_schema.py` and `cli.py`
(`hermes <provider> <subcommand>`).

### 1.3 What breaks when the built-in stores are off

Verified as **not** load-bearing:

- **Skills.** Live in `~/.hermes/skills/` as files, keyed off the `skills` toolset
  (`skills_list` / `skill_view` / `skill_manage`). No dependency on `MEMORY.md`
  (`website/docs/user-guide/features/skills.md`).
- **Cross-session recall.** `session_search` reads `~/.hermes/state.db` FTS5 directly and
  is its own toolset (`session_search`). Docs are explicit: "It makes no LLM calls and
  returns views of actual messages from the DB rather than generating summaries"
  (`website/docs/user-guide/sessions.md:674`). *(The repo `README.md` says "FTS5 session
  search with LLM summarization" — the detailed doc and the tool's own shape contradict
  the README blurb. Treat the README as marketing copy.)*
- **Compression.** `agent/conversation_compression.py` touches `_memory_store` in exactly
  one place (line 267) and `_memory_manager` only for session-switch notification.
  Compression is a transcript-rewrite pass, not a memory consumer.

Consumers of `_memory_store` across the whole tree are narrow: `agent/system_prompt.py`
(×5), `agent/agent_init.py` (×3), `agent/turn_context.py` (×2), and one each in six other
modules. Nothing outside prompt assembly and the tool handler depends on it.

What does degrade: the periodic memory *nudge* (`nudge_interval`, only active when memory
is enabled), and `/refine` (documented as "reviews the conversation to update memory and
skills" — the memory half no-ops). **UNVERIFIED:** I did not trace `/refine` or the
`curator` to confirm they degrade gracefully rather than erroring.

### 1.4 The trap: the external provider's tools are gated on the `memory` toolset

`memory_provider_tools_enabled()` (`agent/memory_manager.py:117-141`) returns `False` if
`memory` is in `disabled_toolsets`, or if `enabled_toolsets` is non-empty and does not
resolve to include `memory`. If the gate fails, the provider's tool schemas are **not**
injected and its `system_prompt_block()` is suppressed too
(`agent/system_prompt.py:939-950`, `agent/memory_manager.py:167-190`) — the provider looks
half-on. Hermes logs this case explicitly because it was previously undiagnosable
(upstream issue #81014).

So the working configuration for "MemoryGate instead of MEMORY.md" is:

```yaml
memory:
  memory_enabled: false
  user_profile_enabled: false
  provider: memorygate
toolsets:
  - memory          # must stay listed, even though the builtin `memory` tool is gone
  - mcp-toolgate    # etc.
```

The `"memory" in enabled_toolsets` branch passes on the toolset *name*, before the tool's
`check_fn` runs, so this combination works. It is load-bearing and non-obvious.

---

## 2. Tool registration, and whether ToolGate can own the whole surface

### 2.1 Registration model

Every tool module calls `registry.register(name, toolset, schema, handler, check_fn,
requires_env, is_async, description, emoji)` at import time
(`website/docs/developer-guide/tools-runtime.md`). `discover_builtin_tools()` AST-scans
`tools/*.py` for top-level `registry.register()` calls and imports only those files. There
are 93 such calls in `tools/`; the shipped reference counts "~86 tools"
(`website/docs/reference/tools-reference.md`) across ~59 toolsets (`toolsets.py`).

Name collisions across toolsets are rejected unless `override=True`, and a *plugin*
overriding a built-in additionally needs
`plugins.entries.<plugin_id>.allow_tool_override: true` in `config.yaml`.

Four tools are **intercepted by the agent loop** before registry dispatch because they need
per-session agent state: `todo`, `memory`, `session_search`, `delegate_task`. Their schemas
are still registered; `dispatch()` returns a stub error if reached directly
(`model_tools.py:1435-1437`).

### 2.2 What a run sees

`model_tools.get_tool_definitions(enabled_toolsets, disabled_toolsets, …)`
(`model_tools.py:323`, computed in `_compute_tool_definitions` at `:417`):

1. If `enabled_toolsets` is not `None`, **only** those toolsets are resolved into the
   candidate set (`model_tools.py:427-453`). If it is `None`, start with everything.
2. `disabled_toolsets` is always subtracted last. Subtracting a `hermes-*` platform bundle
   or a `posture: True` toolset removes only its non-core delta — core tools survive
   (`model_tools.py:461-492`).
3. The candidate set goes to `registry.get_definitions()`, which runs each `check_fn` and
   silently drops failures.
4. `execute_code` and `browser_navigate` schemas are rewritten to reference only tools that
   actually survived.

The **only** forced addition found: a dispatcher-spawned Kanban worker
(`HERMES_KANBAN_TASK` set, not a delegated child) gets `kanban` appended even if the
profile omitted it (`model_tools.py:429-440`). Nothing else is force-added.

Configuration surfaces: `toolsets:` in `config.yaml`, `hermes chat --toolsets a,b`,
`/tools enable|disable` in-session, `hermes tools` (curses UI, per-tool granularity,
persists to `config.yaml`), `custom_toolsets:` for named bundles, and
`AIAgent(enabled_toolsets=[...], disabled_toolsets=[...])` in-process.

### 2.3 Can ToolGate's MCP bridge supply the whole surface?

**Yes, mechanically.** Each MCP server that contributes ≥1 tool gets a runtime toolset
named `mcp-<server>` (`tools/mcp_tool.py:3078, 7716, 7989`), usable anywhere a toolset name
is. Setting `toolsets: [mcp-toolgate]` yields a run whose entire tool surface is ToolGate's.
Verified against the resolution code above, **not** empirically executed.

Details that matter for a ToolGate bridge:

- **Transport.** Both stdio (`command` / `args` / `env`) and HTTP (`url` / `headers`,
  optional OAuth 2.1, mTLS via `client_cert`) are supported. ToolGate's stdio bridge drops
  in directly. Stdio env is filtered — only the configured `env` plus a safe baseline is
  passed, not the parent shell environment.
- **Naming.** The registered/wire name is `mcp__<sanitizedServer>__<sanitizedTool>`
  (`tools/mcp_tool.py:7401-7408`). The MCP user guide says `mcp_<server>_<tool>` — **the
  user guide is wrong**; `website/docs/reference/tools-reference.md` has the correct form.
- **Filtering.** Per-server `tools.include` / `tools.exclude` accept exact names *and*
  fnmatch globs; `include` wins over `exclude`. `tools.resources: false` /
  `tools.prompts: false` drop the utility wrappers. `enabled: false` skips the server
  entirely.
- **Hot reload.** `notifications/tools/list_changed` from the server triggers an automatic
  re-fetch and registry update; `/reload-mcp` is the manual path. A session's tool set is
  otherwise frozen for its lifetime.
- **Recycling.** `idle_timeout_seconds` / `max_lifetime_seconds` tear down and transparently
  restart a stdio server while keeping its tools registered.
- **Result hygiene.** Invisible Unicode TAG characters (U+E0000–U+E007F) are stripped from
  tool results, resource content, and tool descriptions. Vendor `_meta` is passed through;
  protocol-reserved `_meta` keys are dropped.

### 2.4 Tool Search will reshape a large ToolGate catalog

MCP and non-core plugin tools are **deferrable**; `_HERMES_CORE_TOOLS` never defer
(`website/docs/user-guide/features/tool-search.md`). With any deferrable tool present, the
model sees three bridge tools — `tool_search`, `tool_describe`, `tool_call` — plus a
name+description manifest, instead of full schemas. `tool_call` unwraps before dispatch, so
pre-tool-call hooks, guardrails, and approvals all fire against the **real** tool name
(`model_tools.py:1395-1412`).

Turn it off with `tools.tool_search.enabled: off` to force eager schemas.

---

## 3. Where approval/permission gating lives

### 3.1 The built-in gate is command-shaped, not tool-shaped

`tools/approval.py` holds `DANGEROUS_PATTERNS` — regex over **terminal command strings**
(`rm -r`, `mkfs`, `DROP TABLE`, `curl | sh`, `systemctl stop`, docker/podman daemon
redirects, writes to `/etc/`, `~/.ssh/`, `~/.hermes/.env`, …). Modes:
`approvals.mode: smart | manual | off`, with `timeout` (default 300s, fail-closed),
`cron_mode` / `single_query_mode` / `unattended_mode` (each `deny` by default). Choices are
`[o]nce / [s]ession / [a]lways / [d]eny`; `always` persists to `command_allowlist` in
`config.yaml`.

Below all of that sits `UNRECOVERABLE_BLOCKLIST` — a hardline floor that `--yolo`,
`approvals.mode: off`, and "allow always" cannot override — plus user-editable
`approvals.deny` globs, checked *before* yolo.

Separately, `write_file` / `patch` are gated by a path denylist (credential stores, `.env`
files) and the optional `HERMES_WRITE_SAFE_ROOT` sandbox. These **hard-block with no
approval prompt**. Docs are candid that this is defense-in-depth, not a sandbox: the
`terminal` tool runs as the same OS user and can overwrite denied paths via the shell.

**Container backends skip the dangerous-command check entirely** (docker, singularity,
modal, daytona, vercel_sandbox) — the container is treated as the boundary.

### 3.2 The generic hook — this is the integration point

`pre_tool_call` fires **once before every tool execution**, built-in, plugin, and MCP alike
(`model_tools.py:1443-1483`; also `agent/tool_executor.py:647`). Payload: `tool_name`,
`args`, `task_id`, `session_id`, `tool_call_id`, `turn_id`, `api_request_id`,
`middleware_trace`. Return values:

- `{"action": "block", "message": "..."}` — vetoes; the message becomes the tool result.
- `{"action": "approve", "message": "...", "rule_key": "..."}` — escalates to the **same**
  human gate the dangerous-command path uses, on **any** tool
  (`hermes_cli/plugins.py:6799-6839`).
- `{"action": "modify", "args": {...}}` — shallow-merged over the args before dispatch.

Fail-closed properties, verified in code:

- A callback that exceeds `plugins.hook_callback_timeout` (default 30s, max 600) is
  abandoned and the tool is **blocked** (`website/docs/user-guide/features/hooks.md:386`).
- If the approval gate itself raises, the call is blocked
  (`hermes_cli/plugins.py:6830-6833`).
- Denial or timeout at the gate blocks (`hermes_cli/plugins.py:6834-6838`).
- Non-interactive, non-gateway, non-cron contexts fail closed
  (`tools/approval.py:4206-4209`).

Shell hooks give the same power without Python: a `hooks.pre_tool_call` entry in
`config.yaml` runs a command, and exit code 2 or a `{"decision":"block"}` JSON on stdout
blocks the call. `fail_closed: true` is accepted on `pre_tool_call` only.

### 3.3 Does that survive ToolGate's binding model?

ToolGate binds approval to exact object + version + argument digest + nonce, consumed once,
replay fails closed. Findings:

**What lines up.**

- The approval grain is **plugin-controlled**: `rule_key` chooses the `[a]lways` allowlist
  key, and when omitted Hermes derives it from `tool_name` + SHA-256 of the reason
  (`tools/approval.py:4211-4224`). A hook can set `rule_key` to a digest of the exact
  arguments, so a Hermes-side "always" cannot bleed onto a different call shape.
- `ctx.register_approval_transport(name, present_fn)` re-routes **where** a human answers.
  The request object is immutable, carries redacted display text, host presentation class,
  timeout, allowed choices, and an opaque request ID/digest; you must return
  `request.respond(choice)`. Unbound dicts and stale IDs are rejected. Selection is two
  explicit consent steps (`plugins.enabled` + `security.approval.transport`), and
  `transport_fallback: deny` is the default. This is the clean way to put approvals in
  Conker's own UI.
- MCP servers can be declared `trust: untrusted`, in which case **every write-capable tool
  call** (any tool without `readOnlyHint: true`) requires per-call human approval before it
  runs, fail-closed if the approval system errors (`tools/mcp_tool.py:5006-5060`).
  Unrecognised `trust` values are treated as `untrusted`.

**What does not line up.**

1. **`pre_tool_call` sees pre-`modify` arguments.** All hooks receive the same `args`;
   `modify` directives from *any* hook are accumulated and merged **after** the block/approve
   decision is resolved (`hermes_cli/plugins.py:6661-6694`). Tool-request middleware also
   rewrites args before the hook fires (`model_tools.py:1414-1432`). If a ToolGate hook
   computes an argument digest, that digest is only sound if no other hook or middleware
   modifies args on the same call. With a single hook registered this is fine; it is a
   latent hazard, not a live one.
2. **Two approval planes stack, and they are not the same decision.** Hermes's `session` /
   `always` scopes grant reuse by pattern key locally; ToolGate's nonce is consumed
   server-side once. A Hermes-side "always" only suppresses the *local* prompt — it cannot
   satisfy ToolGate. Either Conker restricts the offered scopes to once-only, or the two
   planes drift.
3. **MCP elicitation is consent-only.** Hermes supports `elicitation/create` and routes
   form-mode requests to the approval surface — but on accept it returns
   `ElicitResult(action="accept", content={})` (`tools/mcp_tool.py:2645-2651`). **The
   structured field values a server asked for are never returned.** URL-mode elicitations
   are declined outright. So ToolGate cannot use elicitation to collect a nonce, a
   justification, or any structured input mid-call — only a yes/no.
4. **The transport is explicitly not a policy API.** Docs state there is "intentionally
   **no** plugin approval policy, auto-allow callback, or required `pre_tool_call` policy"
   in the transport interface, and that "Hermes still owns hardline blocks, sudo-stdin
   protection, user deny rules, request binding, allowed scopes, persistence, hooks, and
   final authorization." Conker can *present* and can *veto* (via `pre_tool_call`); it
   cannot *replace* Hermes's authorization layer.
5. **`--yolo` / `/yolo` / `approvals.mode: off` exist as session-level bypasses** of the
   dangerous-command layer. **UNVERIFIED:** I did not trace whether a `pre_tool_call`
   `approve` directive escalating into `request_tool_approval` is also short-circuited by
   YOLO — worth checking before relying on it as a hard gate.

---

## 4. Model routing

Two slot kinds: one **main model**, and **11 auxiliary task slots** (compression, vision,
web extract, approval scoring, title generation, MCP routing, skills search, triage
specifier, kanban decomposer, profile describer, curator). Every aux slot defaults to
`auto` = reuse the main model, with an independent fallback chain
(`website/docs/user-guide/configuring-models.md`).

```yaml
model:
  provider: openrouter
  default: anthropic/claude-opus-4.7
  base_url: ''
  api_mode: chat_completions
auxiliary:
  compression: {provider: openrouter, model: google/gemini-2.5-flash, ...}
fallback_providers:
  - {provider: openrouter, model: anthropic/claude-sonnet-4}
```

Resilience layers, in order: credential pools (rotate keys within one provider) → primary
model fallback (`fallback_providers`, a list, tried in order) → per-aux-task fallback chains.

`provider_routing` (`sort` / `only` / `ignore` / `order` / `require_parameters` /
`data_collection`) is **OpenRouter- and Nous-Portal-only** — it is forwarded as
`extra_body.provider` and has no effect on direct provider connections.

### Per-run vs global

| Scope | Mechanism |
|---|---|
| Per process / per run | `AIAgent(model=..., enabled_toolsets=..., ...)` in-process; `hermes chat --model` / `--toolsets`; `hermes -p <profile>` |
| Per session, live | `/model <provider:model>` on CLI/TUI/gateway; `command.dispatch` over the TUI gateway RPC; a `model` field in the API-server request body |
| Per gateway message | `profile_routes` in `config.yaml` — one gateway process routes inbound messages to different **profiles** by platform / `guild_id` / `chat_id` / `thread_id`, most-specific-wins with weights 8/4/2/0 (`docs/profile-routing.md`). Each profile is a whole separate Hermes home: own config, memory, skills, sessions, `state.db` |
| Per subagent | `delegation.model` / `delegation.provider` / `delegation.base_url` / `delegation.request_overrides` — **global for the session, not per task.** `delegate_task` has no model parameter |
| Per task | Only via the Kanban board's per-task model override |

So: routing **policy** (provider preference, fallback chain) is global config; model
**selection** is per-run and per-session in several ways. The cheapest per-run isolation
primitive is a profile.

Cost note carried by the docs: any mid-conversation model change — `/model`, an automatic
fallback, or a credential-pool rotation onto a different account — invalidates the prompt
cache and re-reads the whole conversation at full input-token price.

### Programmatic control planes

Three, all driving the same `AIAgent` core
(`website/docs/developer-guide/programmatic-integration.md`):

- **ACP** (JSON-RPC/stdio) — for IDEs.
- **TUI gateway JSON-RPC** (stdio or WebSocket) — the richest: `prompt.submit`,
  `session.create/list/branch/compress/interrupt`, `approval.respond`, `clarify.respond`,
  `secret.respond`, `delegation.status`, `subagent.interrupt/steer`, `config.set/get`,
  `command.dispatch`, `model.options`. Streams `message.delta`,
  `tool.start/progress/complete`, `approval.request`, and session lifecycle events.
- **API server** (HTTP + SSE) — OpenAI-compatible `/v1/chat/completions`, `/v1/responses`,
  plus a run API: `POST /v1/runs`, `GET /v1/runs/{id}/events`,
  `POST /v1/runs/{id}/approval`, `/steer`, `/stop`, and `GET /v1/capabilities`.

Direct Python embed is documented (`from run_agent import AIAgent`), but: "Hermes does not
publish a supported wheel or source distribution for `requirements.txt` installs"
(`website/docs/guides/python-library.md`). A `hermes-agent` package **does** exist on PyPI
at version `0.19.0` (repo is at `0.21.0`), authored by Nous Research — present but stale
and, per the docs, unsupported. The supported path is `git clone` + `uv sync`.

---

## 5. Persistence, and what it duplicates

One SQLite database, `~/.hermes/state.db`, WAL mode, schema version **23**
(`hermes_state.py`, documented in `website/docs/developer-guide/session-storage.md`):

| Table | Holds |
|---|---|
| `sessions` | metadata, lineage (`parent_session_id`), token counts, cost/billing, title, workspace (`cwd`, `git_branch`, `git_repo_root`), `profile_name`, gateway routing keys, `archived`/`pinned` |
| `messages` | full history: role, content, `tool_calls` (JSON), `tool_name`, reasoning fields, `api_content` byte-fidelity sidecar, compaction/display columns |
| `messages_fts`, `messages_fts_trigram`, `messages_fts_cjk` | three FTS5 indexes (default, trigram for CJK/substring, CJK tokenizer) |
| `session_model_usage` | per-model/per-task usage attribution |
| `state_meta`, `schema_version` | metadata, migrations |
| `gateway_routing`, `delivery_obligations` | gateway routing and owed-reply outbox |
| `compression_locks` | cross-process compression locking |
| `async_delegations` | background delegation bookkeeping |

Write contention: 1s SQLite timeout, application-level retry with 20–150ms jitter up to 15
attempts, `BEGIN IMMEDIATE`, PASSIVE WAL checkpoint every 50 writes.

Also on disk, outside the DB: `~/.hermes/memories/{MEMORY.md,USER.md}`,
`~/.hermes/skills/`, `~/.hermes/cron/jobs.json`, `~/.hermes/plugins/`,
`~/.hermes/mcp-tokens/`, `~/.hermes/pairing/`, `SOUL.md`, `config.yaml`, `.env`.

### Overlap with MemoryGate

| MemoryGate concept | Hermes equivalent | Notes |
|---|---|---|
| Evidence (immutable raw input) | `messages` rows | Hermes rewrites on compaction and on rewind/truncate; not append-only |
| Analysis (recorded interpretation) | compression summaries, `curator`, `insights`, learning graph | No lineage back to a specific evidence row |
| Memory / Entity / Episode | `MEMORY.md` + `USER.md`, ~3.5 KB total | Flat text with `§` separators. No entities, no episodes, no lineage |
| Semantic retrieval | **none** | `session_search` is FTS5 lexical only — no embeddings anywhere in `tools/` or `agent/`. MemoryGate's MiniLM + Qdrant has no counterpart |
| Bounded context package | `MemoryProvider.prefetch()` return string | Injected into the API copy of the user message, not the stored content (`agent/turn_context.py:1576-1597`) |
| Scoped read keys | **none** at this layer | Hermes has no notion of a scoped memory read credential |

The genuine duplication is **transcript storage + lexical search**, not semantic memory.
`state.db` would remain Hermes's own operational store regardless; the question is whether
its message rows are also written to MemoryGate as evidence.

Relevant to that: the **pre-compress checkpoint contract, API v2**
(`website/docs/developer-guide/memory-provider-plugin.md`). A provider setting
`pre_compress_checkpoint_api_version = 2` and an operator setting
`compression.checkpoint_required: true` makes compaction **fail closed** with
`BLOCKED_MISSING_PREREQUISITE` unless the provider's durable archive committed first. When
armed, the gate also suppresses server-side native compaction
(`compression.codex_responses_native`), forces `compression.micro_compact` off at agent
init, and refuses the `codex_app_server` API mode entirely. v2 providers receive normalised
evidence — user/assistant text only; tool results, system messages, `tool_calls` payloads,
and prior summaries filtered host-side. Checkpoints must be idempotent (key by content
digest and upsert), because a blocked compaction retries with a largely overlapping
transcript. Contract tests: `tests/agent/test_pre_compress_checkpoint_contract.py`.

That is the one place Hermes lets an external store enforce "nothing is lost before the
lossy rewrite" — close to what MemoryGate's evidence layer wants.

---

## 6. Child-run / delegation lifecycle

`delegate_task` spawns child `AIAgent` instances with fresh conversations
(`website/docs/user-guide/features/delegation.md`).

**Working today.**

- Single or batch (`tasks: [...]`); default max 3 concurrent
  (`delegation.max_concurrent_children`, floor 1, no ceiling). Over-limit batches error
  rather than truncate.
- Top-level calls run in the background and return a handle immediately; the result
  re-enters the conversation later. Orchestrator children wait synchronously so they can
  synthesise.
- Children inherit the parent's enabled toolsets and **cannot widen them**; there is no
  model-facing `toolsets` parameter.
- Blocked for children even when the parent has them: `delegate_task` (leaf role),
  `clarify`, `memory`, `send_message`, `cronjob`. Both roles keep `execute_code`.
- Nesting is opt-in: `role="orchestrator"` plus `delegation.max_spawn_depth` raised from
  its default of **1** (flat). `delegation.orchestrator_enabled: false` is a global kill
  switch.
- Default per-child iteration budget 50; **no wall-clock timeout by default**
  (`delegation.child_timeout_seconds: 0`). A progress-based stall monitor interrupts a
  frozen child (450s idle / 1200s in-tool) with a 120s grace, then force-finalises a
  `stalled` completion with structured metadata.
- Failures surface as a one-line reason in the CLI tree, a chat notice on gateway
  platforms, and `status: "failed"` + `error` in the parent's tool result.
- Background completions are persisted to `state.db` before delivery, with a durable claim
  so only one consumer acknowledges.
- Public plugin API: `agent.subagent_lifecycle.SubagentLaunchRequest` /
  `service.launch/status/wait/cancel/result/reconnect`, states `PENDING … UNKNOWN`,
  serialisable handles carrying an opaque capability
  (`website/docs/developer-guide/subagent-lifecycle-api.md`).

**Not working / explicitly out of scope.**

- **No durable execution.** A process restart does not resume a running child; its attempt
  is recorded `unknown` because Hermes cannot prove which side effects happened. After a
  restart `reconnect` returns `RECONNECT_UNAVAILABLE` and never starts a replacement.
- The lifecycle API retains metadata and terminal results **in-process for one hour**.
- No per-task model override on `delegate_task`; `delegation.model` is session-global.
  Per-task overrides exist only on the Kanban board.
- The lifecycle API's fail-closed list rejects per-tool blocks, working-directory
  overrides, and per-launch timeouts outright — "until Hermes can support them without
  weakening isolation".
- **Children run with `skip_memory=True`** (`tools/delegate_tool.py:2135`) — no memory
  provider session at all. The parent's provider gets one `on_delegation(task, result,
  child_session_id)` call (`tools/delegate_tool.py:3740-3755`). MemoryGate would therefore
  see a subagent's work only as a summary at the parent, never as evidence from inside the
  child.

---

## 7. Licence, weight, cadence, forking

**Licence.** MIT (`LICENSE`). **UNVERIFIED:** exact CLA / contribution-licensing terms — I
did not read all 48 KB of `CONTRIBUTING.md`.

**Weight.** 34 exact-pinned core deps, 255 locked packages, ~236k Python LOC. The pinning
policy is explicit and was tightened on 2026-05-12 in response to a supply-chain worm
(`mistralai` on PyPI); the scope rule is "only packages used by EVERY hermes session belong
here", with provider-specific packages pushed into extras and lazy-installed via
`tools/lazy_deps.py`. The repo checkout is ~838 MB (it carries a Docusaurus site, `web/`,
`native/`, `ui-tui/`, `apps/`). On Windows, `git checkout` of `main` **fails on 19 files**
under `website/i18n/zh-Hans/...` with "Filename too long" — irrelevant to runtime, relevant
to any Windows-side working copy.

**Cadence.** 31 releases between 2026-03-12 and 2026-08-31 — roughly weekly, currently
`0.21.0`. Commit rate on `main` measured at **159–207 commits/day**. 38,687 open issues,
49,189 forks.

**Tracking upstream.** Nothing exists to make a fork easy, and the churn rate is the whole
story:

- At ~150–200 commits/day into a 236k-line tree with no stable/LTS branch (the branch list
  is a flat mass of feature branches), a fork diverges immediately and rebasing is
  continuous work.
- The project's own guidance pushes integrations **out** of the tree: memory providers are
  closed to new contributions and must ship as standalone repos or pip entry points
  (`CONTRIBUTING.md:72`); custom tools are "default to plugins"
  (`website/docs/developer-guide/adding-tools.md`).
- Correspondingly, **a MemoryGate/ToolGate integration does not require a fork.** The
  needed surfaces are all out-of-tree: a pip/directory memory provider, a `pre_tool_call`
  plugin hook, an approval transport, `mcp_servers` config, and `toolsets` config. That is
  the supported extension path, and it is the one thing that makes upstream tracking
  tractable — `git pull` on an unmodified checkout, with Conker's code in
  `~/.hermes/plugins/` or a pip package.
- Plugin installs support pinning to a full immutable commit SHA
  (`hermes plugins install owner/repo --ref <40-char-sha>`), with `hermes plugins update`
  refusing to move a pinned plugin — so Conker's own plugin can be version-pinned even if
  Hermes is not.

---

## 8. Concrete integration sketch (mechanism only, not a recommendation)

Assembled from the verified facts above; **it has not been built or run.**

**MemoryGate as memory.** A pip package exposing
`[project.entry-points."hermes_agent.memory_providers"] memorygate = "conker_memorygate:register"`.
`prefetch()` returns MemoryGate's bounded context package as a string; `sync_turn()` posts
evidence on a daemon thread (the contract requires non-blocking); `on_pre_compress()` with
`pre_compress_checkpoint_api_version = 2` archives evidence before any lossy rewrite, with
`compression.checkpoint_required: true` to make that a hard gate. Config:
`memory.provider: memorygate`, `memory.memory_enabled: false`,
`memory.user_profile_enabled: false`, and the `memory` toolset name kept in `toolsets:`.
Scoped read keys go to `.env` via `get_config_schema()` fields marked `secret: True`.

**ToolGate as the tool plane.** `mcp_servers.toolgate` pointing at ToolGate's stdio bridge,
`trust: untrusted` so every write-capable tool is approval-gated by default,
`toolsets: [mcp-toolgate, memory]` to withhold Hermes's ~86 built-ins, and
`tools.tool_search.enabled` chosen deliberately. A general plugin registers a
`pre_tool_call` hook that mints the ToolGate approval binding and returns
`{"action": "approve", "rule_key": "<digest>"}` or `{"action": "block", ...}`, plus
`ctx.register_approval_transport()` to put the prompt in Conker's dashboard with
`security.approval.transport_fallback: deny`.

**Known friction in that sketch:** the elicitation `content={}` limitation (§3.3.3), the
two stacked approval planes (§3.3.2), the pre-`modify` args ordering (§3.3.1), subagents
running `skip_memory=True` (§6), and the fact that Hermes retains final authorization and
its own hardline blocklist regardless (§3.3.4).

---

## 9. Open questions I could not close

- **UNVERIFIED:** whether `--yolo` / `approvals.mode: off` bypasses a `pre_tool_call`
  `approve` escalation, or only the dangerous-command path.
- **UNVERIFIED:** whether `/refine` and the `curator` degrade gracefully or error when the
  built-in memory stores are disabled.
- **UNVERIFIED:** exact CLA / contribution-licensing terms in `CONTRIBUTING.md`.
- **UNVERIFIED:** real behaviour of `toolsets: [mcp-<server>]` as the sole toolset — read
  from the resolution code, never executed.
- **UNKNOWN:** whether the per-turn blocking `prefetch()` call causes noticeable latency
  against a local MemoryGate; no benchmark exists in-tree.
- **UNKNOWN:** whether the `pre_tool_call` payload can be correlated to ToolGate's own
  audit records beyond `session_id` / `turn_id` / `tool_call_id` — those IDs are
  Hermes-local.
