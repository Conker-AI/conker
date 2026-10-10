"""Install and operate a private, source-pinned local Conker workspace.

Uses the real Gateway, Pi, ToolGate, MemoryGate and Ollama. Does not import any
existing owner databases, provider credentials or execution grants.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".local-run"
CONFIG = STATE / "configuration.json"
ORDER = ("postgres", "memorygate", "toolgate", "pi", "gateway")
PORTS = {"memorygate": 18520, "toolgate": 18510, "pi": 18551,
         "gateway": 18550, "decisions": 18560, "providers": 18570, "postgres": 55542}
ORIGIN = "https://localhost:18550"


def run(*args, cwd=ROOT, capture=False, timeout=None):
    result = subprocess.run([str(arg) for arg in args], cwd=cwd, check=True,
                            text=True, capture_output=capture, timeout=timeout)
    return result.stdout.strip() if capture else None


def interpreter(directory):
    return directory / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def read_config():
    if not CONFIG.exists():
        raise SystemExit("Run python scripts/workspace.py install first.")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if config.get("workspace_schema") != 1:
        raise SystemExit("This directory already holds a different local stack. It was not changed.")
    return config


def install(model):
    if CONFIG.exists():
        read_config()
        print("Existing workspace retained. Use up, build, status, or down.")
        return
    for executable in ("git", "node", "npm", "docker"):
        if not shutil.which(executable):
            raise SystemExit(f"Install {executable} before continuing.")
    run("docker", "info", "--format", "{{.ServerVersion}}")
    STATE.mkdir(exist_ok=True)
    pins = json.loads((ROOT / "scripts/workspace-sources.json").read_text())
    sources = STATE / "sources"
    sources.mkdir(exist_ok=True)
    pythons = {}
    for name, revision in pins.items():
        source = sources / name
        fresh = not source.exists()
        if fresh:
            run("git", "clone", "--no-checkout", f"https://github.com/Conker-AI/{name}.git", source)
        from workspace_patches import BUNDLES, apply_bundle
        bundled = name in BUNDLES
        at_pin = not fresh and run("git", "rev-parse", "HEAD", cwd=source, capture=True) == revision
        if not (bundled and at_pin):
            if not fresh and run("git", "status", "--porcelain", cwd=source, capture=True):
                raise SystemExit(f"Pinned source {name} has local changes; refusing to replace it.")
            run("git", "checkout", "--detach", revision, cwd=source)
        if run("git", "rev-parse", "HEAD", cwd=source, capture=True) != revision:
            raise SystemExit(f"Source identity check failed for {name}.")
        if bundled:
            apply_bundle(source, name)
        env = STATE / "runtimes" / name
        if not interpreter(env).exists():
            run(sys.executable, "-m", "venv", env)
        requirements = source / {"pi": "requirements.txt", "toolgate": "toolgate/requirements.txt", "memorygate": "services/api/requirements.txt"}[name]
        # uvloop intentionally has no Windows wheel; uvicorn uses its asyncio backend.
        lines = [line for line in requirements.read_text().splitlines() if not (os.name == "nt" and line.startswith("uvloop=="))]
        platform_requirements = STATE / f"{name}-requirements.txt"
        platform_requirements.write_text("\n".join(lines) + "\n")
        run(interpreter(env), "-m", "pip", "install", "--disable-pip-version-check", "-r", platform_requirements, "psutil==7.2.0")
        pythons[name] = str(interpreter(env))
    # Reuse the established scoped-key configuration and service launcher.
    import local_stack
    local_stack.initialize()
    config = json.loads(CONFIG.read_text())
    config.update(workspace_schema=1, ports=PORTS, python=pythons["pi"],
                  python_by_service={**pythons, "gateway": pythons["pi"]},
                  repositories={name: str(sources / name) for name in pins})
    instance = "conker-workspace-" + hashlib.sha256(str(ROOT).encode()).hexdigest()[:10]
    config.update(postgres_container=instance, postgres_volume=instance)
    envs = config["environments"]
    replacements = {"8020": "18520", "8010": "18510", "8051": "18551", "8050": "18550", "8060": "18560", "55432": "55542"}
    for values in envs.values():
        for key, value in values.items():
            for old, new in replacements.items():
                value = value.replace(f":{old}", f":{new}")
            values[key] = value
    envs["pi"]["PI_MODEL"] = model
    envs["pi"]["PI_SCHEDULER_ENABLED"] = "true"
    envs["pi"]["PI_PROPOSALS_ENABLED"] = "true"
    envs["pi"].pop("PI_DECISION_URL", None)
    envs["pi"].pop("PI_DECISION_KEY", None)
    # No learned router is implied: answer via the explicitly configured local model.
    envs.pop("decisions", None)
    CONFIG.write_text(json.dumps(config, indent=2), encoding="utf-8")
    if os.name == "posix":
        CONFIG.chmod(0o600)
    initialize_owner(config)
    build()
    print(f"Installed. Start with: python scripts/workspace.py up\nOpen {ORIGIN}")


def initialize_owner(config):
    script = """
import json, os, secrets, sys
from pathlib import Path
c = json.loads(Path(sys.argv[1]).read_text())
sys.path.insert(0, c['repositories']['pi'])
from gateway.store import AuthStore
store = AuthStore(c['environments']['gateway']['GATEWAY_DB_PATH'])
if not store.configured():
    path = Path(sys.argv[1]).parent / 'gateway/initial-owner-password.txt'
    if path.exists():
        password = path.read_text().strip()
    else:
        password = secrets.token_urlsafe(24)
        with path.open('x') as stream:
            if os.name == 'posix': os.chmod(path, 0o600)
            stream.write(password)
    store.set_password(password, initial=True)
print('Owner login initialized. Password retained only in the private local gateway directory.')
"""
    run(config["python"], "-c", script, CONFIG)


def build():
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise SystemExit("Node.js/npm is required to build the dashboard.")
    if not (ROOT / "dashboard/node_modules").exists():
        run(npm, "ci", "--no-audit", "--no-fund", cwd=ROOT / "dashboard")
    run(npm, "run", "build", cwd=ROOT / "dashboard")


def launch(config, command, service):
    run(config["python"], ROOT / "scripts/local_stack.py", command, service)


def wait_health(service, seconds=50):
    if service == "postgres":
        config = read_config()
        for _ in range(seconds):
            result = subprocess.run(["docker", "exec", config["postgres_container"], "pg_isready", "-U", "conker_local"], capture_output=True, check=False)
            if result.returncode == 0:
                return
            time.sleep(1)
    else:
        import ssl
        context = ssl.create_default_context(cafile=str(STATE / "gateway/tls.crt")) if service == "gateway" else None
        url = ORIGIN + "/health" if service == "gateway" else f"http://127.0.0.1:{PORTS[service]}/health"
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                    urllib.request.HTTPSHandler(context=context), NoRedirect())
        for _ in range(seconds):
            try:
                headers = {"X-Decision-Key": read_config()["environments"]["decisions"]["DECISION_API_KEY"]} if service == "decisions" else {}
                with opener.open(urllib.request.Request(url, headers=headers), timeout=4) as response:
                    if response.status == 200:
                        return
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(1)
    raise SystemExit(f"{service} did not become ready. Inspect .local-run/{service}/service.log. Data and other processes retained.")


def port_listening(service):
    """A TCP connection proves a listener exists, not ownership or readiness."""
    import socket
    with socket.socket() as sock:
        sock.settimeout(.3)
        return sock.connect_ex(("127.0.0.1", PORTS[service])) == 0


def postgres_state(config, listening):
    """Inspect the named container even while its published port is closed."""
    try:
        name = config["postgres_container"]
        names = run("docker", "container", "ls", "--all", "--filter", f"name={name}",
                    "--format", "{{.Names}}", capture=True, timeout=15)
        if name not in names.splitlines():
            if listening:
                raise SystemExit("PostgreSQL port is occupied by an unrelated process.")
            return "stopped"
        details = json.loads(run("docker", "inspect", name, capture=True, timeout=15))[0]
        ports = details.get("HostConfig", {}).get("PortBindings", {}).get("5432/tcp", [])
        volumes = [mount.get("Name") for mount in details.get("Mounts", []) if mount.get("Destination") == "/var/lib/postgresql/data"]
        if not (details["Config"].get("Labels", {}).get("conker.local-integration") == "true"
                and ports == [{"HostIp": "127.0.0.1", "HostPort": str(PORTS["postgres"])}]
                and volumes == [config["postgres_volume"]]):
            raise SystemExit("PostgreSQL container does not belong to this workspace.")
        running = details["State"]["Running"]
        restarting = details["State"].get("Restarting", False)
        if type(running) is not bool or type(restarting) is not bool:
            raise ValueError("Invalid container state")
        if listening and not (running or restarting):
            raise SystemExit("PostgreSQL port is not owned by the stopped workspace container.")
        return "listening" if listening else "starting" if running or restarting else "stopped"
    except (KeyError, IndexError, TypeError, ValueError, OSError, subprocess.SubprocessError):
        raise SystemExit("Could not inspect the workspace PostgreSQL container; nothing changed.") from None


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
    if service == "postgres":
        return postgres_state(config, listening)
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
        result = json.loads(run(config["python"], "-c", PROCESS_INSPECTION, identity,
                                ROOT / "scripts/local_stack.py", service, PORTS[service],
                                capture=True, timeout=15))
        if not isinstance(result, dict) or set(result) != {"running", "listening"} or any(type(value) is not bool for value in result.values()):
            raise ValueError("Invalid process state")
    except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError):
        raise SystemExit(f"Recorded {service} process is not owned by this workspace or could not be inspected; nothing changed.") from None
    if listening and not (result["running"] and result["listening"]):
        raise SystemExit(f"Port {PORTS[service]} is not owned by this workspace's {service} process.")
    if not result["running"]:
        if result["listening"]:
            raise SystemExit(f"Recorded {service} parent exited while a child still owns the port; inspect before retrying.")
        return "stopped"
    return "listening" if result["listening"] else "starting"


def owned_process(config, service):
    return service_state(config, service) != "stopped"


def owned_listener(config, service):
    return service_state(config, service) == "listening"


def main():
    global ORDER
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["install", "enhance", "memory-corrections", "up", "down", "status", "build", "password"])
    parser.add_argument("--pi-source", type=Path, help="Explicit Pi checkout for local development")
    parser.add_argument("--toolgate-source", type=Path, help="Explicit ToolGate checkout for local development")
    parser.add_argument("--memorygate-source", type=Path, help="Explicit MemoryGate checkout for local development")
    parser.add_argument("--model", default="qwen2.5:3b", help="Installed local Ollama answer model; install only")
    args = parser.parse_args()
    if args.command == "install":
        install(args.model)
        return
    if args.command == "build":
        build()
        return
    config = read_config()
    if args.command == "memory-corrections":
        from workspace_setup import configure_memory_corrections
        configure_memory_corrections(config)
        return
    if args.command == "enhance":
        from workspace_setup import enhance
        enhance(config, args.pi_source, args.toolgate_source, args.memorygate_source)
        return
    if config.get("native_providers"):
        ORDER = ("postgres", "memorygate", "toolgate", "decisions", "providers", "pi", "gateway")
    if args.command == "password":
        # Owner-interactive recovery; no password travels in process arguments.
        env = {**os.environ, "PYTHONPATH": config["repositories"]["pi"]}
        subprocess.run([config["python"], "-m", "gateway", "reset-password", "--db", config["environments"]["gateway"]["GATEWAY_DB_PATH"]], env=env, check=True)
    elif args.command == "up":
        if not (ROOT / "dashboard/dist/index.html").is_file():
            raise SystemExit("Build the dashboard first: python scripts/workspace.py build")
        for service in ORDER:
            if not owned_process(config, service):
                launch(config, "start", service)
            # TLS certificate is created by the gateway at startup.
            if service == "gateway":
                for _ in range(20):
                    if (STATE / "gateway/tls.crt").is_file():
                        break
                    time.sleep(.5)
            wait_health(service)
            if not owned_listener(config, service):
                raise SystemExit(f"{service} responded without a verified workspace listener; inspect before continuing.")
            print(f"{service}: responding")
        print(f"Conker is available at {ORIGIN}. Review System for dependency readiness.")
    elif args.command == "down":
        for service in reversed(ORDER):
            if owned_process(config, service):
                launch(config, "stop", service)
                if owned_process(config, service):
                    raise SystemExit(f"{service} did not stop; inspect its process before changing runtimes. Data retained.")
        print("Workspace stopped. All data retained.")
    else:
        for service in ORDER:
            state = service_state(config, service)
            label = {"stopped": "stopped", "starting": "running; port not listening (starting or unhealthy)",
                     "listening": "running; listening (inspect System for health)"}[state]
            print(f"{service}: {label}")
        from workspace_memory import status as memory_correction_status
        print("memory corrections: " + memory_correction_status(config))


if __name__ == "__main__":
    main()
