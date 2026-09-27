# ADR-0012 - The owner terminal is an isolated sidecar

**Status:** Accepted architecture; implementation and Linux acceptance deferred - 2026-09-27

## Context

Pi contains an opt-in owner-terminal prototype whose terminal manager runs in the
gateway process. The manager has useful application-level controls: verified
creation, browser-session binding, bounded leases and I/O, revocation cleanup and
no transcript persistence. Those controls do not make the deployment boundary
safe. The release gateway holds browser-auth state and credentials for Pi and
ToolGate. A shell in that container can inspect the container, its process tree and
mounted data with the gateway's operating-system authority even when the child
process receives a scrubbed environment.

The terminal is therefore not a feature that can be enabled by adding two gateway
environment variables. It needs its own least-privilege deployment boundary.

## Decision

The owner terminal will run only in a dedicated `owner-terminal` sidecar. The
browser gateway remains the sole HTTP and owner-authentication endpoint. It verifies
the signed-in session, same-origin CSRF token and one-use password proof before it
asks the sidecar to create a lease.

The gateway and sidecar communicate over a Unix socket in a dedicated control
volume. The sidecar accepts exactly one long-lived gateway connection after checking
its configured, distinct UID with `SO_PEERCRED`, then unlinks the socket path. It
cannot create a PTY before that channel is established and it does not accept a new
connection after channel loss; recovery requires sidecar recreation. A shell can
therefore stop the supervisor only as a denial of service, not replace it and receive
another browser session's control traffic. The gateway treats channel loss as lease
loss and never silently reconnects or recreates a lease.

The sidecar has `network_mode: none`; it is not attached to the runtime, owner,
index or inference networks. The control volume contains only the bootstrap socket
and is not durable state. The gateway mounts that volume but never mounts the
terminal workspace. The sidecar never mounts gateway auth data.

The sidecar deployment must have all of these properties:

- a dedicated, digest-pinned image with a fixed daemon entry point;
- an explicitly configured numeric UID and GID, both nonzero and distinct from the
  gateway UID; the gateway may receive the sidecar's GID only for control-socket
  traversal;
- all Linux capabilities dropped, `no-new-privileges`, a read-only root filesystem,
  an init process, bounded memory, CPU and process count, and bounded stop time;
- exactly one operator-approved host directory mounted read-write at `/workspace`;
- one control-socket volume and no other persistent or host mounts;
- no Docker socket, host namespaces, devices, privileged mode or network;
- no `env_file`, Compose secrets, provider files, owner credentials, browser
  cookies, password proofs, ToolGate keys or Pi keys;
- only non-secret limits, the fixed workspace path and an allowlisted shell path in
  its environment;
- a local health check that proves the supervisor is accepting control messages,
  without spawning a shell or reading the workspace.

The host bootstrap plane validates the workspace's canonical path and access before
deployment. It must reject the Conker installation, state, recovery and credential
directories, filesystem roots, and paths that resolve through a symlink. Shells are
selected from paths installed in the terminal image; arbitrary host executables are
not mounted into it.

## Control protocol

The socket protocol is versioned and schema-bounded. Kernel peer credentials bind
the one accepted connection to the configured gateway UID; pathname access alone is
not authorization. The protocol carries an opaque lease subject, request ID,
dimensions, deadlines and bounded input bytes. It never carries the owner password,
password proof, browser cookie or a reusable service credential.
The sidecar owns PTY creation, a bounded create-request replay ledger, output cursors,
dropped-byte accounting, resize limits, expiry and process cleanup. The gateway owns
the mapping from browser session to opaque lease subject and denies cross-session
access.

Only one lease may be active globally. Closing it first kills the PTY process group,
then sweeps every other process under the sidecar's dedicated UID except PID 1 and
the supervisor. This removes descendants that called `setsid` or otherwise escaped
the original process group. No other workload may share that UID. If any peer still
survives the bounded sweep, readiness and future creation fail until the whole
sidecar is recreated.

Creation is idempotent for one request ID. Close is idempotent. Input is not retried
after an uncertain result; the client must recover current lease state and let the
owner decide. Output remains a bounded byte stream, not a transcript. No command,
output, shell history or request body is persisted or included in backup.

Session revocation and gateway shutdown request immediate closure. The sidecar also
enforces an independent maximum lease lifetime so gateway failure cannot leave an
unbounded shell. If descendant cleanup cannot be proven, the supervisor becomes
unready, rejects new leases and requires sidecar recreation; it does not report a
successful close.

## Deployment state

The normative static shape is in
[the owner-terminal sidecar contract](../reference/owner-terminal-sidecar.md). It is
documentation, not an enabled Compose service. Pi now contains a candidate sidecar
supervisor and gateway client implementing the single UID-bound channel and
sidecar-owned creation ledger, plus a minimal dedicated image, local health command
and Docker protocol drill. They are source-level building blocks, not release
authority. Current release and source-built Ubuntu manifests must continue to omit
the sidecar and every `GATEWAY_TERMINAL_*` setting until a published image digest,
release-manifest integration and target-Linux acceptance suite exist together. A typed
dashboard client and xterm workspace now exercise the browser contract against a
synthetic local preview, but do not constitute deployment acceptance.

The `owner-terminal` capability remains `deferred`. Existing gateway terminal code
is not release authority and must not be configured in production.

## Required acceptance

Activation requires all of the following on the target Linux deployment:

1. Static manifest checks prove the sidecar is non-root, networkless, credentialless
   and limited to the control volume plus exactly one approved workspace.
2. A real PTY check proves job control, resize, bounded cursor output, expiry,
   revocation, escaped-descendant cleanup and the one-active-lease limit under the
   deployed UID/GID.
3. `/proc`, mount, network and environment inspection from the shell proves gateway,
   Pi, ToolGate and provider credentials are inaccessible.
4. A PTY process cannot connect to or replace the control listener. Gateway loss,
   sidecar loss, session revocation and uncertain input are exercised without
   reconnect, shell resurrection, cross-session disclosure or silent input replay.
5. Backup and restore prove that no terminal socket, lease, command or output is
   archived and that restore starts with zero leases.
6. The exact digest-pinned image and generated Ubuntu manifest pass release
   acceptance. Synthetic tests, WSL checks and documentation do not satisfy this
   gate.

## Consequences

The gateway keeps browser authentication but loses PTY and workspace authority. The
sidecar can damage the explicitly mounted workspace with the owner's configured
non-root file permissions; it is not a sandbox against that workspace. It cannot
reach Conker services or secrets unless an operator defeats the deployment contract.

This adds an image, a local protocol and Linux acceptance work. That cost is accepted
because a credential-bearing web gateway is the wrong trust boundary for an
interactive shell.
