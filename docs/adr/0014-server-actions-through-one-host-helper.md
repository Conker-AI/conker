# ADR-0014 - Server actions run through one private host helper with a fixed operation list

**Status:** Accepted - 2026-10-29

## Context

Every action should be reachable from the UI, an AI tool and the CLI. Restarting a service,
taking or checking a backup, a restore drill, an update or a certificate renewal are CLI-only
today, because each needs host power no container should hold: Docker (root-equivalent), the
install's files, git, the backup disk.

[ADR-0011](0011-one-control-plane-and-verified-setup.md) keeps these on the host bootstrap plane
and allows a browser to reach one only through "a named, schema-bounded operation with one-time
authority" that returns a redacted receipt. [ADR-0005](0005-toolgate-is-the-only-action-path.md)
lets Pi read SystemGate directly only because SystemGate has no write path, and forbids ToolGate
credentials for host operations.

`scripts/provider_control.py` already is such a bridge for provider keys: a Linux systemd user
service in the docker group, a 0600 Unix socket in a 0700 folder that only the gateway mounts,
fixed `conker` arguments, no command output returned.

## Decision

**The provider-control service grows into the host helper. Server actions are a fixed table of
named operations in `scripts/host_ops.py`, served on the same socket.**

- **A fixed allowlist, typed arguments, never a shell.** Each operation names its arguments and
  their patterns; anything else is refused before the host is touched. An operation runs the
  `conker` command contract with a fixed argv. The first operations:

  | Operation | Kind | Arguments | Runs |
  |---|---|---|---|
  | `services.status` | read | none | `docker ps` and `docker inspect` of the `conker` project, a few fields kept |
  | `backup.list` | read | none | the saved setup backup folder (`conker setup protection`) and its snapshot names |
  | `backup.verify` | action | `snapshot`: a snapshot folder name | `conker verify-backup FOLDER/NAME` |
  | `services.restart` | action | `service`: a running Compose service of this install | `conker restart SERVICE` |
  | `backup.run` | action | none | `conker setup run protection` (back up, verify, keep the saved number) |

  The next ones follow the server-actions design (start and stop, model download, drills,
  recovery, updates, certificates). An operation never takes a secret; secrets keep their
  write-only provider routes.
- **Reads answer at once.** Actions return a receipt marked working and run in the background,
  so a backup that stops the gateway, or a restart of the gateway itself, does not lose its
  result: the client reads it back by id.
- **The client makes the id.** A retry with the same id returns the same receipt and never runs
  the action again; the same id with other arguments is refused.
- **One action at a time.** An operating-system file lock in the helper's folder serialises the
  helper and `conker ops run`. The kernel drops it when its holder dies, and the command's own
  process holds it too, so the lock lasts as long as the work. Every action also refuses while the
  CLI's own guards exist: the backup lock (`.conker-backup.lock`) and a held recovery
  (`.conker-recovery.json`), which stop `conker restart`, `start` and `backup` as well.
- **Receipts in an append-only journal** (`state/host-ops/journal.jsonl` on the Ubuntu layout,
  `.conker/host-ops/` in the repository layout), outside every Docker volume and every container
  mount. A receipt holds the operation, its arguments, their digest, the source (UI or CLI), start
  and end times, the outcome (`working`, `done`, `failed`, `unknown`) and a plain-word reason from
  the operation table. Never a secret, never command output. A torn or damaged line is counted and
  skipped, never trusted.
- **Unknown, never retried.** An action whose runner is gone (the helper restarted, the CLI was
  interrupted, a time limit stopped it) is recorded as `unknown` with a check step: the read that
  shows what happened (`services.status`, `backup.list`, or verifying the same snapshot again).
  Nothing retries it; the owner checks and decides. A backup has no time limit, because stopping
  it mid-capture would leave Conker's writers stopped.
- **The CLI stays the bootstrap plane.** Every operation is a plain `conker` command first.
  `conker ops` reads and writes the journal directly, so it works with the helper down, and
  `conker ops run OPERATION NAME=VALUE` runs the same table under the same lock with a receipt.
- **Reach stays as it is.** The socket, its folder and its systemd unit are unchanged: 0600, 0700,
  mounted only into the gateway. Pi has no route to it. The gateway's own route (next) asks for the
  password, bound to the exact operation, for every host action.

## Alternatives rejected

- **A host-runner container with the Docker socket** (the shape of ADR-0013's sandbox runner).
  It puts host root inside a container, which ADR-0011 rules out, and it cannot survive or carry
  out the stack restarts and updates it would run, since it is part of the stack.
- **ToolGate tools.** AI keys already reach ToolGate, and ADR-0005 forbids ToolGate credentials
  for host operations. The AI may propose a server action; only the owner's verified request runs
  one.
- **Running commands in the gateway.** The gateway faces the browser; giving it Docker would make
  a stolen session, or a gateway bug, host root.
- **A generic command or Compose endpoint.** Any argument shape that reaches a shell or Compose
  flags is a terminal by another name (ADR-0012 covers the owner terminal).

## Consequences

- New operations widen the helper's surface, not its privilege; each one is a reviewed table row
  with tests for its arguments, its refusals and its unknown outcome.
- The helper reads the backup folder from the setup policy through `conker setup protection`, so
  backup reads need the gateway and Pi running. The UI only reaches the helper through the
  gateway, so this costs nothing there; on the host, `conker backup --destination DIR` still works
  without them.
- Plain CLI commands (`conker restart`, `conker backup`) take only their existing guards, not the
  helper's lock: a `conker restart` typed during a helper action is not refused. `conker ops run`
  is the CLI path that queues with the UI.
- Backups go to a second disk in the server until an off-machine target exists. `backup.list`
  reports whether the folder is on a different disk from the install (`separateDisk`); a second
  disk survives the system disk failing, not the computer dying, and the Backups screen says so.
  The off-machine copy is a later operation and target, not part of this table yet.
