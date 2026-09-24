# Changelog

Conker's own releases. Each module keeps its own changelog in its own
repository; this one records the product — the installer, the compose, and
which module versions a release pins.

## Unreleased

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
[`docs/current-state.md`](docs/archive/current-state.md)):

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
