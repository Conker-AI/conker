"""Who owns which local workspace service: process, container and listener ownership checks."""

from __future__ import annotations

import json
import subprocess

from scripts.workspace_core import CONTAINERS, PORTS, ROOT, STATE, run


def port_listening(service):
    """A TCP connection proves a listener exists, not ownership or readiness."""
    import socket

    with socket.socket() as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(("127.0.0.1", PORTS[service])) == 0


def container_state(config, listening, service):
    """Inspect the named container even while its published port is closed."""
    label, container, volume, port, mount = CONTAINERS[service]
    try:
        name = config[container]
        names = run(
            "docker",
            "container",
            "ls",
            "--all",
            "--filter",
            f"name={name}",
            "--format",
            "{{.Names}}",
            capture=True,
            timeout=15,
        )
        if name not in names.splitlines():
            if listening:
                raise SystemExit(f"{label} port is occupied by an unrelated process.")
            return "stopped"
        details = json.loads(run("docker", "inspect", name, capture=True, timeout=15))[0]
        ports = details.get("HostConfig", {}).get("PortBindings", {}).get(port, [])
        volumes = [
            item.get("Name")
            for item in details.get("Mounts", [])
            if item.get("Destination") == mount
        ]
        if not (
            details["Config"].get("Labels", {}).get("conker.local-integration") == "true"
            and ports == [{"HostIp": "127.0.0.1", "HostPort": str(PORTS[service])}]
            and volumes == [config[volume]]
        ):
            raise SystemExit(f"{label} container does not belong to this workspace.")
        running = details["State"]["Running"]
        restarting = details["State"].get("Restarting", False)
        if type(running) is not bool or type(restarting) is not bool:
            raise ValueError("Invalid container state")
        if listening and not (running or restarting):
            raise SystemExit(f"{label} port is not owned by the stopped workspace container.")
        return "listening" if listening else "starting" if running or restarting else "stopped"
    except (KeyError, IndexError, TypeError, ValueError, OSError, subprocess.SubprocessError):
        raise SystemExit(
            f"Could not inspect the workspace {label} container; nothing changed."
        ) from None


PROCESS_INSPECTION = """
import json, psutil, sys
try:
    parent = psutil.Process(int(sys.argv[1]))
    command = parent.cmdline()
    if sys.argv[2] not in command or command[-2:] != ['serve', sys.argv[3]]:
        sys.exit(1)
except psutil.NoSuchProcess:
    print(json.dumps({'running': False, 'listening': False}))
    sys.exit(0)
except (psutil.Error, ValueError):
    sys.exit(1)
try:
    # Windows venv launchers delegate to a child interpreter. Only an exact
    # service command beneath the verified recorded parent may own its port.
    listening = False
    for process in [parent, *parent.children(recursive=True)]:
        try:
            command = process.cmdline()
            if sys.argv[2] not in command or command[-2:] != ['serve', sys.argv[3]]:
                continue
            listening = listening or any(
                connection.status == 'LISTEN' and connection.laddr.port == int(sys.argv[4])
                for connection in process.net_connections(kind='tcp'))
        except psutil.NoSuchProcess:
            continue
    running = parent.is_running() and parent.status() != psutil.STATUS_ZOMBIE
    print(json.dumps({'running': running, 'listening': listening}))
except psutil.NoSuchProcess:
    print(json.dumps({'running': False, 'listening': False}))
except psutil.Error:
    sys.exit(1)
"""


def service_state(config, service):
    """Separate verified process ownership from listener and health evidence."""
    listening = port_listening(service)
    if service in CONTAINERS:
        return container_state(config, listening, service)
    pid_file = STATE / service / "pid"
    if not pid_file.exists():
        if listening:
            raise SystemExit(f"Port {PORTS[service]} is occupied by an unrelated process.")
        return "stopped"
    # Execute identity inspection with the managed environment that supplies psutil.
    try:
        identity = pid_file.read_text().strip()
        if not identity.isascii() or not identity.isdecimal() or not 0 < int(identity) <= 2**32 - 1:
            raise ValueError("Invalid process identity")
        result = json.loads(
            run(
                config["python"],
                "-c",
                PROCESS_INSPECTION,
                identity,
                ROOT / "scripts/local_stack.py",
                service,
                PORTS[service],
                capture=True,
                timeout=15,
            )
        )
        if (
            not isinstance(result, dict)
            or set(result) != {"running", "listening"}
            or any(type(value) is not bool for value in result.values())
        ):
            raise ValueError("Invalid process state")
    except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError):
        raise SystemExit(
            f"Recorded {service} process is not owned by this workspace or could not be inspected; nothing changed."
        ) from None
    if listening and not (result["running"] and result["listening"]):
        raise SystemExit(
            f"Port {PORTS[service]} is not owned by this workspace's {service} process."
        )
    if not result["running"]:
        if result["listening"]:
            raise SystemExit(
                f"Recorded {service} parent exited while a child still owns the port; inspect before retrying."
            )
        return "stopped"
    return "listening" if result["listening"] else "starting"


def owned_process(config, service):
    return service_state(config, service) != "stopped"


def owned_listener(config, service):
    return service_state(config, service) == "listening"
