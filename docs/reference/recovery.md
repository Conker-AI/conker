# Backup and recovery

Browser authentication (B4) adds `gateway_data` to the captured authoritative
stores: its `auth.db`, TLS certificate and private key are included. SQLite uses
the backup API, including committed WAL content. Restore deletes all captured
browser sessions and advances the password generation before any application
can run. The password verifier survives. A pre-B4 snapshot remains restorable
under hold, but cannot supply browser credentials it never captured. See
[browser authentication](browser-auth.md) for password and TLS recovery.

`conker backup` requires Python 3.11+ on the host and access to the local Docker daemon.
It does not install dependencies, pull images, or invoke model/provider APIs.
It detects exactly one supported installation layout: the repository Compose contract or the
generated source-built Ubuntu contract. Ambiguous layouts and changed service inventories fail
before writers stop.

```sh
./conker backup
./conker backup --destination /mnt/backup-device/conker
./conker verify-backup /mnt/backup-device/conker/snapshot-...
./conker restore /mnt/backup-device/conker/snapshot-... --into /srv/conker-recovery-20260910
./conker recovery-status /srv/conker-recovery-20260910
./conker recovery-status /srv/conker-recovery-20260910 --review /secure/review.json
./conker recovery-status /srv/conker-recovery-20260910 --prove-ready
./conker setup configure protection --destination /mnt/backup-device/conker --retention 7
./conker setup protection   # the saved policy, as the setup UI shows it
./conker setup run protection
```

The setup policy is durable, revisioned and shared by UI and CLI. It holds a
normalized absolute host path, an explicit mounted-off-machine destination type and
the number of verified snapshots to keep. Saving the policy does not claim that a
backup exists. The execution
command requires its destination to be an existing mount on a different device,
runs the same coordinated backup implementation, verifies the completed snapshot,
and prunes only older snapshots that also pass verification. Its bounded receipt
is tied to the current policy; changing destination or retention degrades earlier
evidence, and the receipt expires after 90 days. A failed or partial backup never
reaches the receipt endpoint. This is
not a restore drill; assembled backup/restore rehearsal evidence is recorded
separately.

Restore does not need an installed `.env`. Its destination must not exist. The existing
installation and its volumes are not overwritten or stopped by restore.

## Backups on a schedule

```sh
./conker backup schedule on                  # nightly backup through the saved policy
./conker backup schedule on --drill weekly   # and a restore drill every Sunday
./conker backup schedule on --drill off      # keep the nightly backup, stop the drill
./conker backup schedule off                 # remove both timers
./conker backup schedule status
```

Linux with a systemd user session only; elsewhere the command refuses and changes nothing. `on`
writes a oneshot service and a timer per installation under `~/.config/systemd/user/`
(`conker-backup-<id>` nightly at 03:30 local time, `conker-drill-<id>` Sundays at 05:00, each up
to 30 minutes later at random, `Persistent=true` so a run missed while the server was off happens
at the next boot) and enables them; repeating it is harmless. Nothing turns the schedule on by
itself: not the installer, not `prepare.py`, not an update. User timers run while nobody is signed
in only with lingering on, so `on` refuses until it is (`sudo loginctl enable-linger $USER`).
Stopping a unit (shutdown, `systemctl --user stop`) sends SIGINT to every process in it, which
lets the backup restart the services it stopped and remove its lock, and the drill remove its
copy, within 15 minutes before systemd kills what is left (at shutdown the user manager's own
stop limit can be shorter; a drill cut off there is swept by the next one).

The nightly run is the host helper's `backup.run` ([ADR-0014](../adr/0014-server-actions-through-one-host-helper.md)):
the same `conker setup run protection` (back up, verify, keep the saved number of verified
snapshots), the same one-at-a-time lock and the same receipt in the helper's journal, under an id
starting `schedule-`. It never waits: while another server action runs, a backup holds
`.conker-backup.lock`, a recovery is held or `conker update` runs or is held (its lock, active
state or `HOLD.json` in `git rev-parse --git-path conker-update`), it is refused. With no backup
destination saved it does nothing. Every run, refused and skipped ones included, leaves a line in
`state/backup-schedule/journal.jsonl` (`.conker/backup-schedule/` in the repository layout) with
its time, outcome and a plain reason; `status` shows the last one.

## Restore drill

```sh
./conker backup drill                        # the newest snapshot in the saved folder
./conker backup drill /mnt/backup-device/conker/snapshot-...
./conker backup drill --last                 # the last drill's receipt
```

The drill is `restore` into a fresh folder under the installation's state
(`state/backup-schedule/drill-*`), never the live install and never a volume of the live stack.
Restore's own checks run (snapshot hashes, store archives, PostgreSQL restore, vault values and
the MemoryGate key decrypt, approvals cancelled and jobs held); the drill then checks that the
copy stayed isolated (`--network none`, no ports, stopped), removes every container and volume
labelled with that copy's `conker.recovery` project and the folder, in a `finally` path that
runs when the restore fails and when the drill is interrupted (Ctrl-C, SIGTERM, SIGHUP or the
unit being stopped), and checks that the live stack's containers and volumes are the same as
before. No application starts and nothing gets a network. Only SIGKILL or power loss skips that
path: the receipt then stays `running`, and the next drill first removes the `drill-*` folder
and the copy its hold file names, and counts them in `swept`.

It holds the host helper's lock while it runs and refuses at once when another server action, a
backup, a held recovery or an update is in the way, or when free space in the drill folder or
Docker's data folder is under twice the snapshot's size. Each attempt leaves a receipt in the same
journal: id, start and end, duration, snapshot name, outcome (`running` while it runs, then
`passed`, `failed`, `refused` or `skipped`), the checks that passed, anything left behind, stale
copies swept and a plain reason. Never a credential, a restored value or command output. A passed drill proves this snapshot restores on this machine today; it is not
the operator review a return to service needs.

## What is saved

- A custom-format PostgreSQL dump of the managed MemoryGate database (`memorygate` in the
  repository layout and `conker` in the source-built Ubuntu layout), including credentials and audit tables
  omitted from MemoryGate's knowledge-export endpoint. Cluster globals are retained separately.
- Complete Pi and ToolGate stores. SQLite files are copied through `Connection.backup`, including
  committed WAL pages, and checked with `PRAGMA integrity_check`. WAL/SHM sidecars are not archived.
- ToolGate's vault `.env`, generated `vault.key`, and effective container configuration. The
  effective vault salt may be in the vault file or the environment; both are captured. Encrypted
  values must decrypt before backup succeeds. No replacement key is generated by recovery.
- MemoryGate's durable `/data` volume, including the layout's runtime key
  (`/data/runtime-fernet.key` or `/data/runtime.key`), plus independent
  verification of its configured encrypted provider token. A configured encrypted token with
  no readable key fails backup.
- SystemGate data, Qdrant storage, all Ollama data (including custom/local models), existing
  MemoryGate exports, and additional image-declared Docker volumes. Nothing assumes a model
  or index can simply be downloaded or rebuilt later.
- Source-built Ubuntu snapshots also capture the decision-model store and all generated
  `state/*.env` files, `state/credentials.json`, source and resolved Compose manifests, and the
  reviewed source release versions. Repository snapshots retain their original `.env`,
  `versions.env`, and Compose source contract.
- The installation `.env`, `versions.env`, original and resolved Compose configuration, effective
  container environments, exact local image IDs, registry digests where available, platform,
  image labels, and hashes of the recovery programs.
- Secret-free hosted-provider revision metadata as `config/provider-state.json`. OpenRouter,
  OpenAI and Anthropic key files are deliberately omitted, and backup refuses legacy plaintext
  provider keys in `.env`.

The read-only dashboard source, provider-key mounts, host `/proc` telemetry mount and backup
observation mount are not application stores and are excluded. Provider key files must be
deliberately reprovisioned during recovery. SystemGate receives neither the Docker socket nor the host root;
encountering either during backup is treated as an unknown bind mount and fails closed. Other
unknown bind mounts, changed database/key paths, additional services, or additional PostgreSQL
databases fail closed rather than being omitted.
This is the managed single-database installation contract, not a backup of arbitrary host data.

The snapshot does **not** contain Docker image binaries. Recovery requires the recorded image
IDs for Pi, ToolGate and PostgreSQL to be installed on the recovery machine; it never pulls them.
The remaining image identities are retained for eventual deployment. Keep a separate `docker image
save` archive of those images for offline disaster recovery, or obtain the recorded registry
digests before recovery. No backed-up Compose file, shell `.env`, or SQL globals script is
executed by restore. Run recovery only on a trusted snapshot: hashes detect damage, not an
attacker who rewrites both payload and manifest.

## When success is reported

The command records the originally running containers, stops writers without recreating them,
and leaves PostgreSQL running only for logical export. Files go into a private `.partial`
directory. On ordinary failure, the original running containers are restarted; services that
were already stopped remain stopped. A forced writer termination or a failed restart fails
the command. Once every capture succeeds, files are flushed, hashed and verified, and the
directory is renamed to `snapshot-...`. Only then is a verified-snapshot message printed.

The command returns **1** on failure. A directory containing only configuration is never a
successful snapshot. Old backups without a manifest are rejected, even if they contain a Pi
database: they cannot establish vault recoverability or SQLite consistency.

Snapshots and recovery reports use private directories and files (0700/0600 on POSIX). They
contain live credentials and decryption keys and are **not archive-encrypted**. Copy them to
an encrypted destination on a separate device. Tests use disposable credentials; do not upload
a real snapshot as a CI artifact or bug report.

An uncatchable interruption can leave the source stopped, a `.partial` directory, and
`.conker-backup.lock`. Inspect that directory's `source-state.json`, confirm the backup process
is gone, and restart only its listed container IDs. After checking service health, remove that
specific stale lock and create a new backup. Do not promote a partial directory manually.

## What restore does, and what it does not claim

Restore validates the entire snapshot before allocating anything. It writes a persistent hold
report before creating uniquely named recovery volumes. Every helper and the temporary
PostgreSQL container uses `--network none` and local Docker logging (never an inherited remote
logging driver); there are no published ports, host socket/telemetry
mounts, or application entrypoints. A crash cannot expose restored services while cleanup runs.

The recovered configuration stays under `recovered-config/` as data. SQLite stores retain their
history, but unconsumed pending/approved requests are cancelled and ToolGate lockdown is set.
Consumed approvals are not rewritten as new approvals. Pi's incomplete turns are listed with
their original status and `acted` flag; they are held without replay or an invented outcome.
MemoryGate jobs are parked as `recovery_held`, with original statuses retained in the report.

ToolGate execution keys are also revoked, paid dispatch policy is disabled, and
every restored recurring spending allowance receives a revocation receipt. An
existing revocation is preserved. This avoids reviving authority from before a
newer revocation; clearing lockdown alone cannot restore those credentials.
Reconfiguration of runtime authority belongs to the later reviewed resumption
step. An incomplete spending schema fails recovery rather than skipping revocation.
Provider revisions in the snapshot are evidence for reconciliation only. Because their key
files are not archived, a recovered candidate cannot use them; the credentials attestation must
cover issuer-side revocation or retention and deliberate reprovisioning of each hosted provider.

PostgreSQL restores transactionally into a new, offline instance, using a new temporary database
credential. It restores objects under the database identity recorded for the detected layout;
cluster globals and custom
ownership/grants are retained for later review, not automatically executed. It is stopped after
verification. Following an interruption it may remain running, still with no network or ports.
The hold report lists persistent container and volume names for inspection and deliberate cleanup;
short-lived data helpers use `--rm`.

**Restore returns 3: data recovered, resumption held.** It does not return a working companion.
The hold is now the durable state machine for return to service:

1. `held` means restore completed but none of the operator prerequisites have been accepted.
2. `reviewed` means a current, restore-bound review receipt covers deletion replay,
   external-effect reconciliation, credential reprovisioning, and functional acceptance.
3. `service_ready` means the snapshot and review were rechecked and every isolated image,
   volume, stopped container, vault, runtime key, unfinished Pi turn, and held MemoryGate job
   still matches the restore. This writes `recovery-receipts/service-ready.json`.

The hold file remains present in all three states. `service_ready` is evidence for a separate,
explicit deployment decision; it does not remove the hold, start applications, copy recovered
configuration into an install, or overwrite a live directory. This makes rollback simple: no
live state changed. To abandon the candidate and remove only its exactly named, recovery-labelled
containers and volumes, run:

```sh
./conker recovery-status /srv/conker-recovery-20260910 --abort "reason recorded in the hold"
```

Legacy `conker-recovery-1` reports remain readable with `recovery-status`, but they have no
restore nonce or fingerprint and cannot enter this workflow. Create a fresh isolated restore from
the verified snapshot rather than editing or upgrading an old hold in place.

Abort is idempotent after completion and retains the hold report and receipts. A cleanup failure
leaves `abort_interrupted`; inspect the named resource and its `conker.recovery` label before
retrying. The command refuses to delete a resource whose ownership label does not exactly match.

### Operator review receipt

Read `.conker-recovery.json` and copy its `recovery_id`, `review_nonce`, and
`snapshot_manifest_sha256` into a private JSON file. The schema is exact; unknown or missing
fields, expired timestamps, evidence from before this restore, and non-SHA-256 evidence references
are rejected:

```json
{
  "format": "conker-recovery-review-1",
  "recovery_id": "<from hold>",
  "review_nonce": "<from hold>",
  "snapshot_manifest_sha256": "<from hold>",
  "operator": "owner identity",
  "reviewed_at": "2026-09-26T12:00:00+00:00",
  "expires_at": "2026-09-27T12:00:00+00:00",
  "attestations": {
    "deletion_replay": {"status": "complete", "evidence_sha256": "<64 lowercase hex>"},
    "external_effects": {"status": "reconciled", "evidence_sha256": "<64 lowercase hex>"},
    "credentials": {"status": "reprovisioned", "evidence_sha256": "<64 lowercase hex>"},
    "functional_acceptance": {"status": "passed", "evidence_sha256": "<64 lowercase hex>"}
  }
}
```

Each digest identifies an operator-retained evidence artifact. The deletion artifact must show
replay against the recovered stores; the external-effect artifact must resolve every uncertain
dispatch without automatic replay; the credential artifact must record replacement or explicit
retention of each recovered authority; and functional acceptance must come from an isolated drill
of the exact recovered candidate. The review is copied into the recovery directory and hashed.
A second, different review is refused. Review validity is at most 30 days and must still be current
when readiness is proved.

Readiness proof starts only the isolated PostgreSQL container long enough to verify that all
unfinished MemoryGate jobs remain held, then stops it in a `finally` path. It does not run Compose
or a shell, does not source `.env`, and does not execute the snapshot's Compose, SQL globals, or
configuration. An interruption records `readiness_interrupted`; rerunning `--prove-ready` resumes
the checks. Any failed or tampered proof returns to `reviewed`, records a bounded failure reason,
keeps the hold, and writes no service-ready receipt. Repeating a successful proof is a read-only,
idempotent receipt check.

The review remains necessary because the utility cannot infer these facts from an old snapshot:

- No complete durable deletion ledger exists. Some delete paths retain deleted text in audit,
  others have no tombstone, and an old backup cannot know about later deletions. Existing source
  evidence must be preserved and a complete replay contract implemented under B3/C2 before
  restored data can be exposed. An empty or unavailable ledger is not proof of no deletions.
- Current ToolGate has a durable pre-dispatch journal, but this recovery utility does not
  reconcile restored rows with newer receipts or effects. Older snapshots may predate the journal.
  A missing receipt cannot prove an action did not happen. External systems and newer records
  must be checked; old work is never
  automatically re-executed. Later credential revocations also require review before resumption.
- Installations created before the persistent MemoryGate `/data` volume may still hold their
  runtime encryption key only in the old container layer. Take and verify a snapshot before
  replacing that container; the recovery artifact retains the one-file compatibility path.

`conker start`, `restart`, `update`, model downloads, and `install.sh` refuse to run from a
directory carrying the recovery hold. This is an operator guard, not protection against a
Docker administrator intentionally creating a new, unrestricted deployment. Removing the marker
does not reconcile data and is not a supported recovery procedure.

## Validation

```sh
python3 -m pip install -r requirements-dev.txt
python3 -m pytest tests/test_recovery.py -q
CONKER_RECOVERY_DOCKER=1 python3 -m pytest tests/test_recovery_docker.py -q
```

The offline suite exercises both repository and generated-Ubuntu snapshot contracts, real SQLite
WAL snapshots, archive validation, vault decryption,
failure exits, required-store omissions, token invalidation, review refusal, stale and tampered
evidence, resumable readiness, idempotency, scoped abort, and hold-preserving failures. If a sibling
ToolGate checkout exists, it also tests rejection using ToolGate's own approval consumer; CI
checks out ToolGate 0.2.2 explicitly for that compatibility test.

The separate Docker drill pulls pinned fixture images before recovery, runs real PostgreSQL
dump/restore and gate-image helpers, verifies records and credentials, takes the restored candidate
through review and service-ready proof, tests an actual approval consumer, inspects the network
mode after an injected interruption, and runs `conker backup drill`'s code end to end against
the fixture stack (passed, nothing left, the stack's containers unchanged). Fixtures have unique
names; cleanup uses their recorded IDs, never a global Docker prune. It runs in a dedicated CI
job and must pass on Linux before this recovery path is released. Skipping it locally is not
evidence that Docker recovery works.
