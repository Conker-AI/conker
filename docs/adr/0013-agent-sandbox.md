# ADR-0013 - Agents run terminal commands in a fresh locked-down container per command

**Status:** Accepted - 2026-10-26

## Context

Every Conker agent should have a terminal: run a script, inspect a file the owner dropped in,
install a library and use it. [ADR-0005](0005-toolgate-is-the-only-action-path.md) says such an
action goes through ToolGate under the owner's access policy, and Pi itself never gets a shell.
[ADR-0012](0012-owner-terminal-is-an-isolated-sidecar.md) says a shell must never share a process
or container with a credential-bearing service, and lists the sidecar properties that make one
safe: dedicated image, numeric non-root user, no network, no capabilities, no-new-privileges,
read-only root, limits, one workspace mount, no secrets.

An agent's shell is driven by a model that reads outside content, so it is less trusted than the
owner's. It also has a need the owner terminal does not: packages from PyPI and npm, without
giving the shell the internet.

## Decision

**A terminal command is a ToolGate tool call that runs in a new container built from a fixed
specification, removed when the command ends.**

- **Two tools, one policy.** ToolGate's built-in `sandbox.run` (Terminal) and `sandbox.install`
  (Install packages) follow the access layers like any tool (chat > agent > tool default, the
  floor, Handled). Their default is AI decides. A guard in ToolGate refuses commands that would
  break the sandbox itself (deleting the root filesystem or the whole workspace, killing every
  process, shutdown, fork bombs, device writes) before any approval is asked for. The guard is a
  courtesy; the container is the boundary.
- **ToolGate never holds the Docker socket for this.** A separate `sandbox-runner` service does,
  and nothing else in Conker. It has no network. ToolGate reaches it through one Unix socket on a
  volume only the two share, and the runner admits a connection only when the kernel reports
  ToolGate's UID (`SO_PEERCRED`). It accepts one typed request (agent, command or packages,
  working folder, time limit), never a container body, image, mount or flag.
- **One fixed container shape**, in `toolgate/sandbox/spec.py`: the digest-pinned sandbox image
  (Python, Node, git, common libraries, no setuid programs); user 65533; `network_mode: none`;
  every capability dropped; no-new-privileges; not privileged; no devices; a read-only root with a
  small `/tmp`; memory without swap, CPU, process, file-size, open-file and log limits; a time
  limit per command; no environment beyond fixed paths and locale. The only mount is the agent's
  own workspace folder at `/workspace`.
- **The workspace follows identity.** The agent is the one ToolGate authenticated for the call
  (an agent identity or a key bound to one agent, `toolgate#18`); a key acting as itself is the
  companion. No argument names a folder outside it, and each container mounts only its agent's
  subfolder, so agents cannot see each other's files. The owner reaches every workspace in one
  host folder.
- **Packages through a proxy, only during an install.** An install runs `pip` or `npm` in the same
  container shape, still without a network. The runner adds one read-only mount: the socket of
  `package-proxy`, a GET-only pull-through to pypi.org, files.pythonhosted.org and
  registry.npmjs.org on fixed path shapes. It cannot upload, publish, tunnel or reach any other
  host, and it logs every download. Only the install tool gets this mount; the guard and package
  names are checked first (names and versions only: no URLs, paths or options).
- **No process outlives its command.** The container is killed at its time limit and removed
  afterwards; a workspace over its quota is checked every two seconds and the command stopped.

## Why per-command containers

Lightweight was a requirement. A long-running sidecar would hold memory all day, share one UID
and one filesystem view between agents, and need a socket the shell could race (ADR-0012 had to
design around exactly that). A fresh container costs about a third of a second to start and
nothing between commands, gives each agent only its own folder, and makes "no background
process survives" true by construction. Installs reuse the same shape plus one read-only socket,
so the sandbox never has a network interface besides loopback.

## Consequences

- The runner is root-equivalent on the host, because the Docker socket is. Its defence is its
  narrow interface: peer-checked socket, one request shape, a specification no request can change,
  no network, read-only root. Its code lives in ToolGate (`toolgate/sandbox/`) so the client and
  server change together.
- A CI job in ToolGate (`sandbox`) builds the images and asserts every setting against the real
  Docker Engine: network, mounts, user, capabilities, read-only root, each limit, the proxy
  allowlist and per-agent scoping. A setting that drifts fails that job.
- Docker Engine 26 or newer is required (volume subpath mounts). The workspace quota is enforced
  by polling, so one command can overshoot it by what it writes in about two seconds before it is
  stopped; the file-size limit bounds any single file.
- The sandbox image is about 800 MB on disk (Debian, Node 22, Python 3.11, git, numpy, pandas and
  a few more). It costs nothing while no command runs.
- Browser and general internet access are not part of this decision.
