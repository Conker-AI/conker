# Changelog

Conker's own releases. Each module keeps its own changelog in its own
repository; this one records the product — the installer, the compose, and
which module versions a release pins.

## Unreleased

- **The Claude plan on the server.** The source-built Ubuntu layout now runs a Claude plan
  runtime, the `subscriptions` service: the official Claude Code CLI (2.1.310, checked by SHA-512)
  behind the private bridge, sharing Pi's network namespace, with the sign-in in its own folder
  that snapshots leave out. Sign in once with `conker providers claude login` in the server's
  terminal, then pick Claude models in Settings > Models. ChatGPT answers pass through it to the
  host ChatGPT worker as before. The repository install has no such runtime yet (it runs only
  published images); connect Claude there with an Anthropic API key, which answers only after
  `conker providers spending on`. How each layout connects Claude is in docs/4-running.md.

- **MemoryGate and ToolGate ask Pi for model text with their own keys.** `install.sh`,
  `deploy/ubuntu/prepare.py` and the Windows workspace generate `MEMORYGATE_PI_SERVICE_KEY` and
  `TOOLGATE_PI_SERVICE_KEY` (with `MEMORYGATE_PI_URL` / `TOOLGATE_PI_URL`, Pi at `http://pi:8050`)
  and give Pi only their hashes, `PI_SERVICE_KEYS_SHA256`. Existing installs get them the next
  time `./install.sh` or `prepare.py` runs (the workspace on its next `up`); no other key changes.

- **`conker tool draft "..."`** files a tool request in Pi, waits while Pi drafts it in the
  background and prints its steps and issues, or why it failed (`--no-wait` to return at once).
  The draft waits in the Inbox. Works in both installed layouts and the development CLI.

- **Local models stay loaded for a day** after their last use instead of five minutes
  (`OLLAMA_KEEP_ALIVE=24h`), so the first answer after a pause does not wait for a reload. Change
  it with `CONKER_OLLAMA_KEEP_ALIVE` (in `.env`, or when running `prepare.py`).

- **Conker remembers across chats.** What it learned in one chat can come up in any other, the
  same in every chat. Turn it off in Settings, Memory, Remember across chats (`memory.across_chats`),
  which replaces the unused "Recall in new chats". Before, a chat stopped recalling other chats once
  any of its settings was saved. Pins Pi 0.12.0.

- Pins Pi 0.11.1: two more small-model mistakes get one retry (request JSON that does not
  parse, and a tool's arguments without the tool request), so scheduling and tool drafts from chat
  work more often on a local model and raw JSON no longer reaches you as an answer.
  Settings and plan usage are listed with their screens in `capabilities.json`.

- Pins ToolGate 0.9.1: the Terminal takes a working folder of `/` as the workspace and a null time
  limit as the default, the arguments small local models send.

- **`conker config` on an installed server.** `./conker config list|get|set|reset` now works on a
  Docker install (repository and Ubuntu layouts), not only in development: the same registry and
  checks, and every read or write reaches Pi inside its own container, so no key leaves it.
  Settings kept in each browser (theme, text size, motion) say so instead of changing.

- **Settings, rebuilt around topics.** Every setting (401, in 31 topics such as Appearance, Inbox,
  Models, Memory, Access and Server) now comes from one registry, one file per topic in
  `dashboard/src/settings/registry/`, and every one uses the same row: title, one sentence, its
  control, Reset when changed, and Saving / Saved. Search, "Show advanced" and "Changed only" work
  across all topics; on a phone the topic list comes first. Rows for features still being built say
  "Not used yet": your choice is saved for them. New: accent color (Neutral, Blue, Indigo, Purple,
  Magenta), text size and animations. `conker config` and `docs/reference/settings.md` read the
  same registry, which replaces `settings-registry.json`. Settings with no other home live in Pi's
  new owner settings document; quiet hours, proactivity and budgets now show in Settings and ask
  for your password when saved. Pins Pi 0.11.0.

- **A separate, stronger reviewer.** The check before Conker acts without asking you has its own
  model in Settings, Models (Checking actions), so it can be stronger than the model that answers,
  for example Jev; `conker models --role reviewer --model ID` does the same. When the AI decides,
  anything that reaches a real person or can't be undone now always asks you. Every Inbox item
  also uses the same answer row (ideas: Accept / Not now; AI-job notes: Open chat / Got it).
  Pins Pi 0.10.0.

- **One Inbox card, and your answer continues the work.** Every decision shows its answers in one
  row: the tool's own yes and no (Send it / Don't send, Publish / Not yet, ...) and Change, which
  sends your words to Conker instead. Do it runs the exact action at once; you no longer open the
  chat to continue it, and a no frees that chat. Conker can ask you questions (`conker.ask`) with
  options it writes; your answer goes to that chat as your next message. Pick each tool's buttons
  in Settings, Access or with `conker tool-card`; answer from the CLI with `conker apply asks`.
  Pins Pi 0.9.0 and ToolGate 0.9.0.

- Pins ToolGate 0.8.1: the Terminal tells models never to wrap a whole command in quotes.

- **Requests wait until you see them.** An Inbox request no longer runs out after minutes: it
  shows "Waiting for you" with its age and stays until you answer. Once you allow it, the exact
  action has 15 minutes to run. Pins ToolGate 0.8.0.

- **Pins Pi 0.8.0 and ToolGate 0.7.0:** the owner tool switch end to end, owner confirmations
  that wait 15 minutes, the Terminal accepting `/workspace` and telling the model how to quote,
  and a sandbox runner that reports out-of-memory kills reliably.

- **A fresh `./install.sh` now starts on Linux.** Found by installing the release for real: keys
  were sometimes shorter than the gateway accepts (now always 32 characters, and a short one
  from an older install is replaced); Pi could not read your provider key files (Pi and the
  gateway now run as your user, like the source-built layout, and a one-time step hands their
  data over); and the local model never loaded (Ollama now uses an 8192-token context,
  `CONKER_MODEL_CONTEXT` to raise it).

- The source-built Ubuntu layout now runs SearXNG (the pinned image, as `toolgate-searxng`), so
  web search works there too; before, ToolGate reported it missing and general search had no
  local engine.

- **Tools Conker can use:** Settings, Access lists every tool with a switch; off means Conker
  cannot see or call it at all (asks for your password). Same from the CLI:
  `python scripts/conker.py tool-access ID`. A new install starts with Conker's built-in tools
  on (web search and reading, Terminal, Install packages); before this, a fresh install's Conker
  could use no tool and nothing in Conker could change that.

- **Agents have a terminal:** the Terminal and Install packages tools are on. Each command runs
  in a fresh locked-down container that sees only that agent's own workspace folder and has no
  network; installs come from PyPI and npm through a download-only proxy. Default access: AI
  decides. Pins Pi 0.7.0, ToolGate 0.6.0 (with its `toolgate-sandbox` image by digest) and
  MemoryGate 0.6.0, which also carry the access and change-request entries below.

- **Access by your settings:** Conker no longer waits for you on what your own settings already
  answer. The most specific setting wins: this chat's access switch (the shield in the composer:
  Agent's settings, Ask me, AI decides, Full access), the agent's setting per tool (agent page,
  Access per tool), then the tool's own. Tools you mark **Always ask me** (Settings, Access), and
  system controls, always ask; after a chat reads outside content it is one step stricter. When
  you typed the request yourself, an action that matches your words goes ahead. Settings, Access
  has the switch that lets Conker decide by your settings at all. Inbox, **Handled** lists what
  ran without asking you and who decided. Memories and cron jobs Conker makes now happen at once.

- **Plan usage ring:** next to the model in the composer, a small ring shows how much of the
  selected model's Claude or ChatGPT plan window is used; tap it for every window, its percent
  and when it resets. Local and API-key models show none.

- **Conker asks, you verify:** in chat (or from an AI job) Conker can ask for a cron job, a
  new tool or a memory. Each request lands in the Inbox showing exactly what would be made;
  **Create job**, **Save as draft** or **Remember** makes it real (asks for your password),
  **Decline** makes nothing. A tool request is saved as a draft in Tools for you to check
  and publish. Same from the CLI: `conker inspect change-requests`, `conker apply requests`.
  You can do the same by hand: **Add memory** (the plus on the Memory screen, or
  `conker apply memory` with `"operation": "remember"`), a new cron job, a tool draft in Tools.
- **Pi 0.6.1:** pin it for the drafting model role above, a 10-minute wait for the workflow
  builder, and the owner's read of plan usage, which fills Home's **Plan allowance** tile
  (Claude and ChatGPT percent used per window and when each resets). Pi is now licensed
  AGPL-3.0-only. `conker update` moves a server to it with its staged, health-checked rollback.
- **A model for drafting:** `conker models --role drafting --model ID` gives the workflow
  builder its own model (Pi's new `drafting` role) while chat keeps its own;
  `--role ROLE --off` switches a role off. The dashboard now keeps model roles it does not
  list when it saves, so a role set from the command line is never switched off by the page.
- **Clean images:** the weekly security check scans every image `versions.env` pins with
  Trivy. Its first run moved ToolGate and MemoryGate to 0.5.1 (their images no longer carry
  the base image's setuptools and wheel) and the third-party pins to PostgreSQL 16.15,
  Qdrant 1.19.2, Ollama 0.40.6 and SearXNG 2026.10.19, which clear most of what it found.
- **Module release:** pin Pi 0.6.0, ToolGate 0.5.0, MemoryGate 0.5.0, SystemGate 0.4.0 and
  Embeddings 0.1.4, which carry everything the connected workspace has used since the
  0.5.6 pins (see each module's changelog). `conker update` moves a server to them with
  its staged, health-checked rollback.
- **Workflow offers from chat:** when you ask the companion for something recurring, Pi
  puts an offer in the Inbox; `conker workflow accept wfo_...` drafts from that message as
  `from-chat` does, and `workflow dismiss wfo_...` declines it. Needs Pi with offers
  (pi#52).
- **Weekly security check:** `.github/workflows/security.yml` audits the dashboard's npm
  packages and the decisions sidecar's pins against the public advisory databases each
  Monday and whenever they change. Each module repository runs the same check on what it
  ships.
- **Guided first run:** `conker setup` walks a new installation through Pi's verified
  setup steps one plain question at a time: browser password, companion, answer model,
  memory, tools and their limits, backups and the short test run. It runs the same
  `conker setup run STEP` commands scripts use, lets Pi decide whether each step took,
  approves only the test run's own harmless request, and continues where it stopped.
  The installer offers it at the end of an interactive install.
- **Live-journey patch release:** pin Pi 0.5.1 and MemoryGate 0.4.1, and bind the
  dashboard build to its exact tree. Cancelled requests are annotated in replayable
  model context; Companion can explicitly opt into admitted cross-chat memory
  without widening other agents or private-chat scope. Repair pending-message
  rendering and operation confirmations without changing the restored visual UI.

- **Host-only provider credentials:** installer reruns migrate OpenRouter, OpenAI and
  Anthropic keys out of `.env` into owner-only files. `conker providers` now stages hidden
  input, assigns opaque revisions, performs fixed-endpoint verification with a 15-minute
  freshness bound, activates by recreating and health-checking Pi, rolls back interrupted
  transitions, and records operator-confirmed issuer revocation. Pi receives read-only key
  files and exposes only configured identities. Backups omit keys, retain bounded metadata
  and keep restore under credential review; browser key entry remains intentionally absent.
- **Durable typed calls:** the chat header now reconnects or starts a focused call
  conversation through strict owner routes. Text turns use retained request identities,
  bounded transcripts, explicit uncertain-result recovery, pause, interrupt and end
  controls. The browser contract carries no audio or device authority; live voice remains
  deferred until media transport and deployment acceptance exist.
- **Read-only owner files:** connected System file browsing now uses explicit
  operator-configured ToolGate roots, durable Pi listing requests, strict owner DTOs,
  and exact browser routes. It exposes relative names and kinds only: no contents,
  editing, uploads, deletes, recursive crawl, shell access, or hidden redispatch.
- **Read-only host inventory:** connected System process, port and container views
  now use durable, explicit ToolGate samples and strict redacted owner DTOs. The
  browser receives no raw PID, command line, user, container image/ID, host address,
  terminal, file, secret or mutation authority; every refresh creates a new request.
- **Connected team definitions:** owners can create, edit, archive, restore and inspect
  immutable revisions of canonical Pi team configurations. Roles narrow saved agents;
  no preparation, team execution, credential, grant, or implicit handoff authority is
  exposed through the browser.

- **Chat completion milestone:** shared Markdown/code/table/math/citation rendering,
  editable paused queues with captured model/privacy, response versions and explicit
  earlier-turn forks. Added inspectable tool/agent/plan/receipt fixtures, bounded
  evidence and character activity fallbacks. All execution remains frontend Preview;
  transcripts and queues remain memory-only. See `docs/chat-delivery-progress.md`.

- **Product dashboard preview:** the active `dashboard/` app now includes Home,
  Companion and Chats, Inbox, character and call interfaces, Memory, Journal,
  Agents, Tools, Jobs, System and Settings. Data remains behind the fixture
  `ConkerClient`; backend integration is not implied by these screens.
- **Conversation activity:** retained response activity, elapsed duration and
  inspectable steps, with scroll-aware working/jump-to-latest feedback.
- **Repository documentation:** product overview, local screenshots, current
  route/setup guide, module map, contribution guide and source-audited integration
  limits. Added a proposal for cross-repository planning without coupling modules.

- **Design system foundation:** React/TypeScript/Vite package with Tailwind v4 OKLCH
  semantic pairs, registry-sourced Radix primitives, shared eight-state status with evidence
  validation and aging, theme controls, fixtures and browser/mutation tests. This
  earlier package is separate from the active product dashboard above.

- **Backup and held recovery (B1/B2):** replace live SQLite file copying and false-success
  backups with coordinated snapshots, required-store checks, vault-key verification, file hashes,
  and exact image identities. Capture ToolGate's complete volume and MemoryGate's otherwise
  unmounted runtime key, plus index/model and image-declared volumes.
- **`restore`, `verify-backup`, `recovery-status`:** recovery uses fresh volumes and no networking
  or application startup. Old pending approvals are cancelled, ToolGate is locked down, and
  unfinished work is held. Exit 3 means **held**, not usable. Deletion replay and complete
  external-effect reconciliation remain blocked by B3/C2 and B6; no promotion command is shipped.
- Add offline behavioral tests and a separate Linux/Docker recovery drill. Gate code and B7/B8
  are unchanged. See `docs/recovery.md` for the validation boundary and recovery procedure.

Installer implementation (deployment readiness still requires the checks in
[`docs/current-state.md`](https://github.com/Conker-AI/conker/blob/5e71ee97a09bb2d5a7fcef73c8bf8bff87229d29/docs/archive/current-state.md)):

- **`./install.sh`** — checks the machine, asks three questions in plain
  language, generates every secret, writes `.env` at `0600`, pulls pinned
  images, starts them, reports honestly which came up, and prints one URL.
  Re-running repairs rather than duplicates: existing keys are kept, because
  regenerating them would lock the owner out of their own vault and database.
- **`./conker`** — `status`, `tailscale`, `backup`, `logs`, `model`,
  `start`/`stop`/`restart`, `update`, `key`. Each named as the thing you want
  rather than the mechanism: `conker status` asks every service what it thinks
  of itself, because a running container that cannot reach its database is not
  a working service.
- **Every image pinned**, ours by version tag and third-party by digest. Never
  `latest` — a moving tag is a supply chain attack that needs no attacker.
- **Every port binds to `127.0.0.1`**, asserted in a test. There is no
  direct public inbound bind; outbound downloads, providers and tools are separate.
  `conker tailscale` supports private connectivity, while remote gateway access
  still needs the HTTPS setup described in `docs/browser-auth.md`.
- **One Ollama, shared** by Pi and Embeddings. The gates' own compose files each
  ran their own, which stores every model twice for no benefit.

Found by running it, rather than by reasoning about it:

- **ToolGate shipped a developer's `.env` and database inside its image.** Fixed
  upstream in ToolGate 0.2.2; see the security note below.
- **MemoryGate crash-looped** because its read key needs an `mg_read_` prefix.
  ToolGate demands `tgx_`. Both shapes are now applied where the key is made,
  since getting it wrong fails minutes later at container start rather than at
  the point of the mistake.
- **ToolGate had no persistent data volume** — its tools, secrets and audit
  trail would have vanished on the first `docker compose down`.
- **A pre-existing `conker_net` broke the install.** Compose refuses to adopt a
  network it did not create, and reports it as an "incorrect label" error that
  says nothing about what to do. An empty one is now cleared; one still in use
  names what is on it and what to run.
- **A port conflict was reported as a 500 from an internal Docker forwarding
  API.** True, and no use to anyone. Now it names the port and the two ways
  out. The preflight check cannot always catch it — under Docker Desktop the
  port is bound on the host, which a check inside the VM cannot see.

### Security

**`ghcr.io/alexeybe1kin/toolgate:v0.2.0` and `v0.2.1` contain real
credentials** — ToolGate's admin key and vault salt, MemoryGate's read key, a
GitHub token and a Tavily key — plus a working `toolgate.db`. `COPY toolgate
./toolgate` swept the package directory, and ToolGate keeps its data inside it.

Git history was never affected; the packages were never public. Both versions
are being deleted from the registry and the credentials rotated. Fixed in
ToolGate 0.2.2, and every module now builds its image in CI and searches it,
because the ignore file that prevents this is exactly the kind that silently
stops matching when a path moves.

### Pinned in this release

| Module | Version |
|---|---|
| Pi | v0.3.0 |
| ToolGate | v0.2.2 |
| MemoryGate | v0.2.0 |
| SystemGate | v0.2.2 |
| Embeddings | v0.1.2 |
