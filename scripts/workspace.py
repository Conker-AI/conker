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

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.workspace_core import (  # noqa: F401
    CONFIG,
    CONTAINERS,
    ORDER,
    ORIGIN,
    PORTS,
    ROOT,
    STATE,
    run,
)
from scripts.workspace_state import (  # noqa: F401
    PROCESS_INSPECTION,
    container_state,
    owned_listener,
    owned_process,
    port_listening,
    service_state,
)


def interpreter(directory):
    return directory / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def read_config():
    if not CONFIG.exists():
        raise SystemExit("Run python scripts/workspace.py install first.")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if config.get("workspace_schema") != 1:
        raise SystemExit(
            "This directory already holds a different local stack. It was not changed."
        )
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
    pythons = {name: prepare_source(name, revision) for name, revision in pins.items()}
    # Reuse the established scoped-key configuration and service launcher.
    from scripts import local_stack

    local_stack.initialize()
    config = json.loads(CONFIG.read_text())
    config.update(
        workspace_schema=1,
        ports=PORTS,
        python=pythons["pi"],
        python_by_service={**pythons, "gateway": pythons["pi"]},
        repositories={name: str(STATE / "sources" / name) for name in pins},
    )
    instance = "conker-workspace-" + hashlib.sha256(str(ROOT).encode()).hexdigest()[:10]
    config.update(postgres_container=instance, postgres_volume=instance)
    envs = config["environments"]
    replacements = {
        "8020": "18520",
        "8010": "18510",
        "8051": "18551",
        "8050": "18550",
        "8060": "18560",
        "55432": "55542",
    }
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


REQUIREMENTS = {
    "pi": "requirements.txt",
    "toolgate": "toolgate/requirements.txt",
    "memorygate": "services/api/requirements.txt",
    "embeddings": "requirements.txt",
}


def prepare_source(name, revision):
    """The pinned checkout of one repository and its own environment; returns its interpreter."""
    sources = STATE / "sources"
    sources.mkdir(parents=True, exist_ok=True)
    source = sources / name
    fresh = not source.exists()
    if fresh:
        run("git", "clone", "--no-checkout", f"https://github.com/Conker-AI/{name}.git", source)
    at_pin = not fresh and run("git", "rev-parse", "HEAD", cwd=source, capture=True) == revision
    if not at_pin:
        if not fresh and run("git", "status", "--porcelain", cwd=source, capture=True):
            raise SystemExit(f"Pinned source {name} has local changes; refusing to replace it.")
        if not fresh:
            run("git", "fetch", "--quiet", "origin", cwd=source)
        run("git", "checkout", "--detach", revision, cwd=source)
    if run("git", "rev-parse", "HEAD", cwd=source, capture=True) != revision:
        raise SystemExit(f"Source identity check failed for {name}.")
    env = STATE / "runtimes" / name
    if not interpreter(env).exists():
        run(sys.executable, "-m", "venv", env)
    requirements = source / REQUIREMENTS[name]
    # uvloop intentionally has no Windows wheel; uvicorn uses its asyncio backend.
    lines = [
        line
        for line in requirements.read_text().splitlines()
        if not (os.name == "nt" and line.startswith("uvloop=="))
    ]
    platform_requirements = STATE / f"{name}-requirements.txt"
    platform_requirements.write_text("\n".join(lines) + "\n")
    run(
        interpreter(env),
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "-r",
        platform_requirements,
        "psutil==7.2.0",
    )
    return str(interpreter(env))


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
    from scripts.devstack.workspace_build import build_dashboard

    def require_stopped():
        if CONFIG.exists() and owned_process(read_config(), "gateway"):
            raise SystemExit(
                "Stop Gateway before rebuilding its assets. The current build was retained."
            )

    build_dashboard(ROOT, STATE, run, require_stopped)


def launch(config, command, service):
    run(config["python"], ROOT / "scripts/local_stack.py", command, service)


def wait_health(service, seconds=50):
    if service == "postgres":
        config = read_config()
        for _ in range(seconds):
            result = subprocess.run(
                [
                    "docker",
                    "exec",
                    config["postgres_container"],
                    "pg_isready",
                    "-U",
                    "conker_local",
                ],
                capture_output=True,
                check=False,
            )
            if result.returncode == 0:
                return
            time.sleep(1)
    else:
        import ssl

        def context():
            return (
                ssl.create_default_context(cafile=str(STATE / "gateway/tls.crt"))
                if service == "gateway"
                else None
            )

        path = "/readyz" if service == "qdrant" else "/health"
        url = (
            ORIGIN + "/health"
            if service == "gateway"
            else f"http://127.0.0.1:{PORTS[service]}{path}"
        )

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        for _ in range(seconds):
            try:
                # The gateway writes its certificate at startup; until then context() raises OSError.
                opener = urllib.request.build_opener(
                    urllib.request.ProxyHandler({}),
                    urllib.request.HTTPSHandler(context=context()),
                    NoRedirect(),
                )
                headers = (
                    {
                        "X-Decision-Key": read_config()["environments"]["decisions"][
                            "DECISION_API_KEY"
                        ]
                    }
                    if service == "decisions"
                    else {}
                )
                with opener.open(
                    urllib.request.Request(url, headers=headers), timeout=4
                ) as response:
                    if response.status == 200:
                        return
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(1)
    raise SystemExit(
        f"{service} did not become ready. Inspect .local-run/{service}/service.log. Data and other processes retained."
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=[
            "install",
            "enhance",
            "memory-corrections",
            "meaning-search",
            "up",
            "down",
            "status",
            "build",
            "password",
        ],
    )
    parser.add_argument("--pi-source", type=Path, help="Explicit Pi checkout for local development")
    parser.add_argument(
        "--toolgate-source", type=Path, help="Explicit ToolGate checkout for local development"
    )
    parser.add_argument(
        "--memorygate-source", type=Path, help="Explicit MemoryGate checkout for local development"
    )
    parser.add_argument(
        "--model", default="qwen2.5:3b", help="Installed local Ollama answer model; install only"
    )
    args = parser.parse_args()
    if args.command == "install":
        install(args.model)
        return
    if args.command == "build":
        build()
        return
    config = read_config()
    if args.command == "memory-corrections":
        from scripts.devstack.workspace_setup import configure_memory_corrections

        configure_memory_corrections(config)
        return
    if args.command == "meaning-search":
        from scripts.devstack.workspace_search import enable

        enable(config)
        return
    if args.command == "enhance":
        from scripts.devstack.workspace_setup import enhance

        enhance(config, args.pi_source, args.toolgate_source, args.memorygate_source)
        return
    # Computed per call, never stored: a second call in one process must not add services twice.
    order = ORDER
    if config.get("native_providers"):
        order = ("postgres", "memorygate", "toolgate", "decisions", "providers", "pi", "gateway")
    if config.get("meaning_search"):
        # MemoryGate needs its index and the embeddings service before it starts.
        order = (order[0], "qdrant", "embeddings", *order[1:])
    if args.command == "password":
        # Owner-interactive recovery; no password travels in process arguments.
        env = {**os.environ, "PYTHONPATH": config["repositories"]["pi"]}
        subprocess.run(
            [
                config["python"],
                "-m",
                "gateway",
                "reset-password",
                "--db",
                config["environments"]["gateway"]["GATEWAY_DB_PATH"],
            ],
            env=env,
            check=True,
        )
    elif args.command == "up":
        if not (ROOT / "dashboard/dist/index.html").is_file():
            raise SystemExit("Build the dashboard first: python scripts/workspace.py build")
        import import_listener

        from scripts.service_keys import ensure

        # A workspace made before MemoryGate and ToolGate asked Pi for model text, or before Pi
        # offered imported chats to memory, gets those keys here; a service already running picks
        # its key up when it next starts.
        changed = ensure(config, f"http://127.0.0.1:{PORTS['pi']}")
        if import_listener.ensure(config) or changed:
            CONFIG.write_text(json.dumps(config, indent=2), encoding="utf-8")
        for service in order:
            if not owned_process(config, service):
                launch(config, "start", service)
            # TLS certificate is created by the gateway at startup.
            if service == "gateway":
                for _ in range(20):
                    if (STATE / "gateway/tls.crt").is_file():
                        break
                    time.sleep(0.5)
            wait_health(service)
            if not owned_listener(config, service):
                raise SystemExit(
                    f"{service} responded without a verified workspace listener; inspect before continuing."
                )
            print(f"{service}: responding")
            if service == "memorygate":
                # MemoryGate creates a listener only through its admin API, so once it answers.
                try:
                    import_listener.setup_workspace(config, PORTS["memorygate"])
                    print("imported chats: can reach memory")
                except (OSError, ValueError, KeyError) as error:
                    print(f"imported chats: cannot reach memory yet ({error})")
        print(f"Conker is available at {ORIGIN}. Review System for dependency readiness.")
    elif args.command == "down":
        for service in reversed(order):
            if owned_process(config, service):
                launch(config, "stop", service)
                if owned_process(config, service):
                    raise SystemExit(
                        f"{service} did not stop; inspect its process before changing runtimes. Data retained."
                    )
        print("Workspace stopped. All data retained.")
    else:
        for service in order:
            state = service_state(config, service)
            label = {
                "stopped": "stopped",
                "starting": "running; port not listening (starting or unhealthy)",
                "listening": "running; listening (inspect System for health)",
            }[state]
            print(f"{service}: {label}")
        from scripts.devstack.workspace_memory import status as memory_correction_status

        print("memory corrections: " + memory_correction_status(config))
        search = config.get("meaning_search")
        print(
            "meaning search: "
            + (
                f"configured ({search['model']})"
                if search
                else "not configured; python scripts/workspace.py meaning-search"
            )
        )


if __name__ == "__main__":
    main()
