"""Source-based loopback development services; independent from deployment volumes.

Run with the existing backend-check Python environment. init never replaces state.
Service keys stay in .local-run and are never printed. The owner chooses a browser
password with the existing gateway host CLI, after initialization.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".local-run"
CONFIG = STATE / "configuration.json"
SERVICES = {"providers": 18570, "memorygate": 8020, "toolgate": 8010, "pi": 8051,
            "gateway": 8050, "decisions": 8060, "postgres": 55432, "embeddings": 8030,
            "qdrant": 6333}
if CONFIG.is_file():
    SERVICES.update(json.loads(CONFIG.read_text(encoding="utf-8")).get("ports", {}))


def initialize():
    STATE.mkdir(exist_ok=True, mode=0o700)
    if CONFIG.exists():
        return
    gates = ROOT.parent / "gates"
    keys = {name: secrets.token_urlsafe(36) for name in
            ("pi", "gateway", "pi_owner", "toolgate", "owner", "execution", "memory", "read", "ingest", "decisions", "salt", "callback", "postgres")}
    keys["execution"] = "tgx_" + keys["execution"]
    keys["read"] = "mg_read_" + keys["read"]
    keys["salt"] = secrets.token_hex(16)
    for name in SERVICES:
        (STATE / name).mkdir(exist_ok=True, mode=0o700)
    key_hash = lambda name: hashlib.sha256(keys[name].encode()).hexdigest()
    config = {
        "python": sys.executable,
        "decision_python": str(Path.home() / ".cache/conker-decisions/Scripts/python.exe"),
        "repositories": {name: str(gates / name) for name in ("pi", "toolgate", "memorygate")},
        "environments": {
            "postgres": {"POSTGRES_USER": "conker_local", "POSTGRES_PASSWORD": keys["postgres"],
                         "POSTGRES_DB": "conker_local"},
            "decisions": {"DECISION_API_KEY": keys["decisions"],
                "DECISION_MODEL_PATH": str(Path.home() / ".cache/huggingface/hub/models--convaiinnovations--laya/snapshots/1c5edc17a7acd8701df6fc341c0d179f1c62c982"),
                "DECISION_MODEL_ID": "laya-english@1c5edc17", "DECISION_CPU_THREADS": "4"},
            "memorygate": {"DATABASE_URL": "postgresql+psycopg://conker_local:" + keys["postgres"] + "@127.0.0.1:55432/conker_local",
                "MEMORYGATE_ADMIN_KEY": keys["memory"], "MEMORYGATE_BOOTSTRAP_READ_KEY": keys["read"],
                "MEMORYGATE_BOOTSTRAP_AGENT_ID": "local_companion",
                "MEMORYGATE_CONVERSATION_KEY": keys["ingest"], "MEMORYGATE_CONVERSATION_AGENT_ID": "local_companion",
                "RUNTIME_SECRET_PATH": str(STATE / "memorygate/runtime.key"),
                "BACKUP_DIR": str(STATE / "memorygate/backups"), "OLLAMA_ENABLED": "false",
                "QDRANT_URL": "http://127.0.0.1:6333", "EMBEDDINGS_URL": "http://127.0.0.1:8030",
                "MEMORYGATE_CORS_ORIGINS": "https://localhost:8050"},
            "toolgate": {"TOOLGATE_DATA_DIR": str(STATE / "toolgate"),
                "TOOLGATE_ADMIN_KEY": keys["toolgate"], "TOOLGATE_OWNER_KEY_SHA256": key_hash("owner"),
                "TOOLGATE_VAULT_KEY_FILE": str(STATE / "toolgate/vault.key"),
                "TOOLGATE_VAULT_SALT": keys["salt"], "TOOLGATE_CALLBACK_SECRET": keys["callback"],
                "TOOLGATE_BOOTSTRAP_EXECUTION_KEY": keys["execution"], "TOOLGATE_BOOTSTRAP_SCOPES": "",
                "MEMORYGATE_URL": "http://127.0.0.1:8020", "MEMORYGATE_READ_KEY": keys["read"]},
            "pi": {"PI_ADMIN_KEY": keys["pi"], "PI_GATEWAY_KEY_SHA256": key_hash("gateway"),
                "PI_OWNER_KEY_SHA256": key_hash("pi_owner"),
                "PI_DB_PATH": str(STATE / "pi/pi.db"), "PI_OLLAMA_URL": "http://127.0.0.1:11434",
                "PI_MODEL": "qwen3:4b", "PI_TOOLGATE_URL": "http://127.0.0.1:8010",
                "PI_TOOLGATE_KEY": keys["execution"], "PI_MEMORYGATE_URL": "http://127.0.0.1:8020",
                "PI_MEMORYGATE_INGEST_KEY": keys["ingest"], "PI_MEMORYGATE_READ_KEY": keys["read"],
                "PI_MEMORYGATE_AGENT_ID": "local_companion", "PI_DECISION_URL": "http://127.0.0.1:8060",
                "PI_DECISION_KEY": keys["decisions"]},
            "gateway": {"GATEWAY_ORIGIN": "https://localhost:8050", "GATEWAY_DB_PATH": str(STATE / "gateway/auth.db"),
                "GATEWAY_PI_URL": "http://127.0.0.1:8051", "PI_GATEWAY_KEY": keys["gateway"],
                "GATEWAY_PI_OWNER_KEY": keys["pi_owner"],
                "GATEWAY_TOOLGATE_EXECUTION_KEY": keys["execution"],
                "GATEWAY_TOOLGATE_URL": "http://127.0.0.1:8010", "GATEWAY_TOOLGATE_OWNER_KEY": keys["owner"],
                "GATEWAY_DASHBOARD_DIR": str(ROOT / "dashboard/dist")},
        },
    }
    import import_listener
    from service_keys import ensure
    from workspace_memory import prepare
    ensure(config, "http://127.0.0.1:8051")
    import_listener.ensure(config)
    config, _ = prepare(config)
    # Exclusive creation and owner-only permissions on POSIX. Windows follows
    # the user's profile ACL; this is local development, not a sandbox boundary.
    with CONFIG.open("x", encoding="utf-8") as stream:
        json.dump(config, stream, indent=2)
    if os.name == "posix":
        CONFIG.chmod(0o600)


def write_private(path, text):
    """Write a file holding keys, owner-only on POSIX even when it already existed."""
    with path.open("w", encoding="utf-8") as stream:
        stream.write(text)
    if os.name == "posix":
        path.chmod(0o600)


def listening(port):
    with socket.socket() as connection:
        connection.settimeout(0.25)
        return connection.connect_ex(("127.0.0.1", port)) == 0


def serve(name, config):
    # Avoid accidentally inheriting production credentials or paid opt-ins.
    prefixes = ("PI_", "GATEWAY_", "TOOLGATE_", "MEMORYGATE_", "DECISION_", "OLLAMA_", "EMBEDDINGS_")
    for key in list(os.environ):
        if key.startswith(prefixes):
            del os.environ[key]
    os.environ.update(config["environments"][name])
    if name == "gateway":
        # Existing local configurations reuse Pi's scoped ToolGate caller. No
        # scope is added here: the owner grants workflow access explicitly in UI.
        os.environ.setdefault("GATEWAY_TOOLGATE_EXECUTION_KEY",
            config["environments"]["pi"].get("PI_TOOLGATE_KEY", ""))
    if name in {"pi", "gateway"}:
        path = Path(config["repositories"]["pi"])
    elif name == "memorygate":
        path = Path(config["repositories"][name]) / "services/api"
    elif name in {"toolgate", "embeddings"}:
        path = Path(config["repositories"][name])
    else:
        path = ROOT / "services/decisions"
    sys.path.insert(0, str(path))
    os.chdir(STATE / name)
    import uvicorn
    if name == "gateway":
        from gateway.__main__ import create_certificate
        from gateway.api import Config, create_app
        certificate, key = create_certificate(STATE / "gateway", "localhost")
        terminal_factory = None
        if os.name == "nt" and config.get("native_terminal"):
            from windows_terminal import WindowsTerminal
            terminal_factory = lambda _shell, _label, _identity: WindowsTerminal(ROOT, config)
        uvicorn.run(create_app(Config.environment(), terminal_factory=terminal_factory), host="127.0.0.1", port=SERVICES[name],
                    ssl_certfile=str(certificate), ssl_keyfile=str(key), proxy_headers=False,
                    access_log=False)
    elif name == "providers":
        from workspace_providers import create_app
        app = create_app(config)
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=SERVICES[name], proxy_headers=False, access_log=False,
                                             timeout_graceful_shutdown=5))
        app.state.request_shutdown = lambda: setattr(server, "should_exit", True)
        server.run()
    else:
        module = {"pi": "pi.api.server:app", "memorygate": "app.main:app",
                  "toolgate": "toolgate.api.server:app", "decisions": "server:create_app",
                  "embeddings": "embeddings.main:app"}[name]
        uvicorn.run(module, host="127.0.0.1", port=SERVICES[name], factory=name == "decisions",
                    proxy_headers=False, access_log=False)


def qdrant(command, config):
    """The workspace's Qdrant index: one labelled container, its own volume, loopback only."""
    name, volume = config["qdrant_container"], config["qdrant_volume"]
    existing = subprocess.run(["docker", "container", "inspect", name], capture_output=True, check=False)
    if existing.returncode == 0:
        details = json.loads(existing.stdout)[0]
        if details["Config"].get("Labels", {}).get("conker.local-integration") != "true":
            raise SystemExit("Container name is owned by another setup; refusing to change it.")
        ports = details.get("HostConfig", {}).get("PortBindings", {}).get("6333/tcp", [])
        mounts = [mount.get("Name") for mount in details.get("Mounts", []) if mount.get("Destination") == "/qdrant/storage"]
        if ports != [{"HostIp": "127.0.0.1", "HostPort": str(SERVICES["qdrant"])}] or mounts != [volume]:
            raise SystemExit("Existing Qdrant instance differs from this configuration; nothing changed.")
        subprocess.run(["docker", "stop" if command == "stop" else "start", name], check=True)
    elif command == "start":
        if listening(SERVICES["qdrant"]):
            raise SystemExit("Qdrant development port is already occupied.")
        subprocess.run(["docker", "run", "--detach", "--name", name,
                        "--label", "conker.local-integration=true",
                        "--publish", f"127.0.0.1:{SERVICES['qdrant']}:6333", "--memory", "512m",
                        "--volume", f"{volume}:/qdrant/storage",
                        config["meaning_search"]["qdrant_image"]], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["init", "start", "stop", "serve", "status"])
    parser.add_argument("service", nargs="?", choices=SERVICES)
    args = parser.parse_args()
    # Every file this run, or a service it starts, creates is owner-only (keys, databases, logs).
    os.umask(0o077)
    if args.command == "init":
        initialize()
        print("Local configuration ready; credentials were not printed.")
        return
    if args.command == "status":
        for name, port in SERVICES.items():
            print(f"{name}: port {port} {'listening (health not implied)' if listening(port) else 'closed'}")
        return
    if not args.service:
        parser.error("Select a service.")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    postgres_name = config.get("postgres_container", "conker-local-integration-postgres")
    postgres_volume = config.get("postgres_volume", postgres_name)
    if args.service == "qdrant":
        qdrant(args.command, config)
        return
    if args.command == "stop":
        if args.service == "postgres":
            inspect = subprocess.run(["docker", "inspect", postgres_name], capture_output=True, check=True)
            if json.loads(inspect.stdout)[0]["Config"].get("Labels", {}).get("conker.local-integration") != "true":
                raise SystemExit("Container ownership did not match.")
            subprocess.run(["docker", "stop", postgres_name], check=True)
            return
        import psutil
        identity = int((STATE / args.service / "pid").read_text())
        try:
            process = psutil.Process(identity)
            command = process.cmdline()
            if str(Path(__file__).resolve()) not in command or command[-2:] != ["serve", args.service]:
                raise SystemExit("Process identity no longer matches; nothing stopped.")
            if args.service == "providers":
                from provider_lifecycle import stop
                stop(process, config, SERVICES[args.service], Path(__file__).resolve())
                print("Stopped local providers; native background sessions retained.")
                return
            children = process.children(recursive=True)
            for child in reversed(children):
                child.terminate()
            process.terminate()
            psutil.wait_procs([process, *children], timeout=10)
            print(f"Stopped local {args.service}; data retained.")
        except psutil.NoSuchProcess:
            print("Local process already stopped.")
        return
    if args.service == "postgres":
        if args.command != "start":
            parser.error("Use start postgres; PostgreSQL runs in Docker.")
        env_path = STATE / "postgres/environment"
        write_private(env_path, "".join(f"{key}={value}\n" for key, value in config["environments"]["postgres"].items()))
        existing = subprocess.run(["docker", "container", "inspect", postgres_name],
                                  capture_output=True, check=False)
        if existing.returncode == 0:
            details = json.loads(existing.stdout)[0]
            if details["Config"].get("Labels", {}).get("conker.local-integration") != "true":
                raise SystemExit("Container name is owned by another setup; refusing to change it.")
            configured_port = details.get("HostConfig", {}).get("PortBindings", {}).get("5432/tcp", [])
            mounts = [mount.get("Name") for mount in details.get("Mounts", []) if mount.get("Destination") == "/var/lib/postgresql/data"]
            if configured_port != [{"HostIp": "127.0.0.1", "HostPort": str(SERVICES["postgres"])}] or mounts != [postgres_volume]:
                raise SystemExit("Existing PostgreSQL instance differs from this configuration; nothing changed.")
            subprocess.run(["docker", "start", postgres_name], check=True)
        else:
            if listening(SERVICES["postgres"]):
                raise SystemExit("PostgreSQL development port is already occupied.")
            subprocess.run(["docker", "run", "--detach", "--name", postgres_name,
                            "--label", "conker.local-integration=true", "--env-file", str(env_path),
                            "--publish", f"127.0.0.1:{SERVICES['postgres']}:5432", "--memory", "512m",
                            "--volume", f"{postgres_volume}:/var/lib/postgresql/data",
                            "postgres:16"], check=True)
        return
    if args.command == "serve":
        serve(args.service, config)
    else:
        if listening(SERVICES[args.service]):
            raise SystemExit("Port already in use; no existing process was replaced.")
        executable = config.get("python_by_service", {}).get(args.service) or (config["decision_python"] if args.service == "decisions" else config["python"])
        with (STATE / args.service / "service.log").open("ab") as log:
            process = subprocess.Popen([executable, str(Path(__file__).resolve()), "serve", args.service],
                stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                start_new_session=os.name != "nt")
        (STATE / args.service / "pid").write_text(str(process.pid))
        print(f"Started {args.service} process {process.pid}; check health before use.")


if __name__ == "__main__":
    main()
