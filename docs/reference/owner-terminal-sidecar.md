# Owner-terminal sidecar deployment contract

This document is the normative static deployment contract for ADR-0012. It describes
the only admissible deployment shape; it does not activate the owner terminal. The
capability remains deferred, and no Linux deployment acceptance is claimed.

## Machine-readable contract

Tests parse the JSON between the markers. Changes require an ADR amendment and
corresponding deployment and Linux acceptance evidence.

<!-- BEGIN OWNER_TERMINAL_CONTRACT -->
```json
{
  "schemaVersion": 4,
  "capability": "owner-terminal",
  "state": "deferred",
  "service": "owner-terminal",
  "image": {
    "dedicated": true,
    "digestPinned": true,
    "fixedEntrypoint": true
  },
  "identity": {
    "explicitNumericUidGid": true,
    "requireNonRoot": true,
    "uidDistinctFromGateway": true,
    "controlGidSharedWithGateway": true
  },
  "transport": {
    "kind": "unix-socket",
    "path": "/run/conker-terminal/control.sock",
    "networkMode": "none",
    "credential": "none",
    "peerAuthentication": "SO_PEERCRED-exact-gateway-uid",
    "singleLongLivedConnection": true,
    "unlinkSocketAfterAccept": true,
    "reconnectRequiresSidecarRecreation": true,
    "ptyCreationBeforeConnection": false
  },
  "mounts": [
    {
      "purpose": "control-socket",
      "source": "terminal_control",
      "target": "/run/conker-terminal",
      "mode": "rw",
      "backedUp": false
    },
    {
      "purpose": "workspace",
      "source": "${CONKER_TERMINAL_WORKSPACE:?select one approved workspace}",
      "target": "/workspace",
      "mode": "rw",
      "backedUp": false
    }
  ],
  "hardening": {
    "capDrop": ["ALL"],
    "noNewPrivileges": true,
    "readOnlyRootFilesystem": true,
    "init": true,
    "boundedMemoryCpuPids": true,
    "boundedStopTime": true
  },
  "lifecycle": {
    "maximumActiveLeases": 1,
    "terminalUidDedicatedToSidecar": true,
    "closeProcessGroupFirst": true,
    "sweepSameUidProcessesAfterClose": true,
    "sameUidSweepExcludes": ["pid-1", "supervisor"],
    "cleanupFailure": "unready-recreate-sidecar"
  },
  "workspacePreflight": {
    "validator": "scripts/terminal_workspace.py",
    "sidecarUid": 65532,
    "requiresValidatedGroupRwx": true,
    "recordsDeviceAndInode": true,
    "rejectsSymlinkComponents": true,
    "rejectsFilesystemRoot": true,
    "rejectsHomeDirectory": true,
    "rejectsProtectedPathOverlap": true
  },
  "forbidden": [
    "env_file",
    "compose-secrets",
    "gateway-auth-volume",
    "provider-secret-files",
    "pi-or-toolgate-credentials",
    "docker-socket",
    "owner-network",
    "runtime-network",
    "host-namespaces",
    "devices",
    "privileged"
  ],
  "readiness": {
    "localSupervisorProbe": true,
    "kind": "fresh-ephemeral-heartbeat",
    "path": "/run/conker-terminal/health.json",
    "spawnsShell": false,
    "readsWorkspace": false
  },
  "persistence": {
    "leases": false,
    "commands": false,
    "output": false,
    "shellHistory": false
  },
  "recovery": {
    "serviceOptionalForLegacySnapshots": true,
    "stopBeforeCapture": true,
    "recordImageIdentity": true,
    "archiveControlVolume": false,
    "archiveWorkspace": false,
    "restoreTerminalVolume": false,
    "restoreLeases": false
  },
  "linuxAcceptance": "required-not-complete"
}
```
<!-- END OWNER_TERMINAL_CONTRACT -->

## Accepted Compose shape

When activated, every release layout must express the machine-readable contract
above. The service must not
inherit the shared service anchor because that anchor attaches `conker_net`. It must
declare `network_mode: none` directly. The only gateway change is a mount of
`terminal_control` and the fixed socket path; the gateway receives no workspace
mount. The sidecar receives neither an `env_file` nor any Compose `secrets` entry.
Only one terminal lease may be active globally. On close, the sidecar terminates the
PTY process group and then sweeps every remaining process under its dedicated UID,
excluding PID 1 and the supervisor. A failed sweep makes readiness fail permanently
until Docker recreates the sidecar. No other service may share that UID as an
authority boundary.

The Ubuntu generator and repository `docker-compose.terminal.yml` overlay emit the
following shape only when the reviewed release manifest marks the capability active,
carries a published image digest and names a hashed target-Linux acceptance bundle.
The current release manifest remains deferred, so no live service is generated today.
The repository launcher and assembled release gate select the overlay from that
manifest state; an operator cannot activate it with a Compose profile alone.

```yaml
owner-terminal:
  image: <release-owned-image>@sha256:<accepted-digest>
  restart: unless-stopped
  command:
    - serve
    - --socket
    - /run/conker-terminal/control.sock
    - --health
    - /run/conker-terminal/health.json
    - --shell
    - /bin/bash
    - --workspace
    - /workspace
    - --gateway-uid
    - "<explicit-gateway-uid>"
  user: "65532:65532"
  network_mode: none
  read_only: true
  init: true
  cap_drop: [ALL]
  security_opt: [no-new-privileges:true]
  pids_limit: 64
  mem_limit: 256m
  cpus: 1.0
  stop_grace_period: 10s
  environment:
    CONKER_TERMINAL_ISOLATED: "1"
  volumes:
    - terminal_control:/run/conker-terminal
    - ${CONKER_TERMINAL_WORKSPACE:?select one approved workspace}:/workspace:rw
  tmpfs:
    - /tmp:rw,noexec,nosuid,nodev,size=32m
  healthcheck:
    test: ["CMD", "conker-terminal", "health", "--health", "/run/conker-terminal/health.json"]
    interval: 10s
    timeout: 2s
    retries: 3
```

The generated service is incomplete until the release manifest supplies exact image
identity, the host preflight validates the workspace and UID/GID, and Linux acceptance
records the result. Adding a profile does not make an unaccepted service safe.

The sidecar UID is `65532` in the candidate image. The gateway keeps a distinct UID
and receives the sidecar's control GID only for the ephemeral socket mount. Directory
mode `0770`, socket mode `0660` and `SO_PEERCRED` UID validation are all required;
shared group access alone is not admission.

The source-built Ubuntu Gateway runs as UID `1000`; the currently published repository
Pi image retains its root Gateway process and is therefore admitted as UID `0`. Both
values are explicit sidecar arguments, distinct from `65532`, and covered by resolved
Compose checks. Moving the repository Gateway to a non-root image is a separate image
and auth-volume migration, not an implicit change to this transport contract.

The supervisor refreshes `health.json` atomically on the ephemeral control volume.
The health command requires the exact schema, a ready state, a recent monotonic
timestamp and a live supervisor PID. It does not connect to the unlinked control
socket, inspect `/workspace` or create a PTY. Channel loss exits the supervisor and
removes the heartbeat.

## Ownership and lifecycle

The gateway authenticates the browser and authorizes each route. It sends only an
opaque lease subject to the sidecar. The sidecar owns PTY/process lifecycle and its
bounded in-memory replay ledger. It admits one active lease globally so its
post-close UID sweep cannot destroy an unrelated terminal. Neither side trusts the browser to select a path,
shell executable, UID, deadline or resource limit.

The socket is only a bootstrap rendezvous. Before any PTY exists, the sidecar checks
the connecting process with `SO_PEERCRED` against the configured gateway UID, accepts
one long-lived connection and unlinks the path. Path access by itself grants no
authority. If that connection closes, the sidecar closes every lease, becomes
unready and must be recreated. The gateway does not reconnect to the same sidecar or
replay lease creation. This prevents a PTY child from replacing the listener after
killing or racing the supervisor. The sidecar UID must differ from the gateway UID.

There is exactly one workspace bind. The host bootstrap plane resolves it without
following a final symlink, verifies it is a directory, and rejects the Conker source,
deployment state, backups, credentials, filesystem root and home directory. The
sidecar's configured UID/GID must already have the intended access; deployment does
not broaden host permissions.

`scripts/terminal_workspace.py` is the host-side preflight. It rejects symlinks in
any path component, records the canonical path plus device and inode, and requires
group read/write/traverse access for the selected nonzero workspace GID. A project
below the home directory is allowed; selecting the home directory or one of its
parents is not. Activation must rerun this validation and compare identity before
mounting the path.

The control volume is ephemeral transport, not application data. Backup excludes it
and all terminal state. Workspace backup remains the workspace owner's separate
policy. Restore and sidecar recreation start with no leases.

## Promotion gate

Do not mark `owner-terminal` active until all ADR-0012 acceptance items pass on the
target Ubuntu host. At promotion, the capability matrix
must link the exact image, manifests, protocol tests, browser behavior and Linux
acceptance record. Acceptance must include an attempted listener race and supervisor
replacement from inside the PTY. Until then, the reviewed manifest stays deferred;
static checks prove that deferred production environments omit every
`GATEWAY_TERMINAL_*` setting and generate no `owner-terminal` service. The guarded
active branch is contract code, not evidence that promotion has occurred.

The dashboard now has a strict typed client and xterm workspace for these routes. It
discovers the current browser lease, never persists terminal content, pauses input
after uncertain delivery, and requires an explicit resume without replay. The local
preview uses a synthetic responder and executes no host commands. This browser work
is contract evidence only; it does not promote the capability without the Linux
deployment evidence above.
