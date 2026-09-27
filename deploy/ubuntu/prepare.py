"""Prepare an isolated, source-built Conker deployment. Never imports laptop data.

Run inside the deployment directory containing sources/{companion,pi,...}.
Secrets are generated once, owner-readable only, and never printed.
"""
import hashlib
import json
import os
import secrets
import sys
from pathlib import Path
from urllib.parse import urlsplit

os.umask(0o077)
root = Path.cwd()
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.provider_secrets import ProviderSecretError, SecretStore
from scripts.release_manifest import ManifestError, load_release_manifest
from scripts.terminal_workspace import TerminalWorkspaceError, validate_workspace

origin = sys.argv[1]
parsed = urlsplit(origin)
if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
        or parsed.path or parsed.query or parsed.fragment or any(c.isspace() for c in origin)):
    raise SystemExit("Supply an exact HTTPS origin without a trailing slash")
state = root / "state"
state.mkdir(exist_ok=True, mode=0o700)
dashboard = root / "sources" / "companion" / "dashboard" / "dist" / "index.html"
if not dashboard.is_file():
    raise SystemExit(
        "Missing verified dashboard build at sources/companion/dashboard/dist/index.html"
    )
try:
    release = load_release_manifest(
        root / "sources" / "companion" / "versions.env",
        verify_checkout=False,
    )
except (OSError, UnicodeError, ManifestError) as exc:
    raise SystemExit(f"Invalid reviewed release manifest: {exc}") from exc
images = release["third_party_images"]
terminal = release["capabilities"]["owner-terminal"]
terminal_workspace = None
terminal_workspace_label = None
if terminal["state"] == "active":
    selected = os.environ.get("CONKER_TERMINAL_WORKSPACE", "")
    terminal_workspace_label = os.environ.get("CONKER_TERMINAL_WORKSPACE_LABEL", "")
    if not selected:
        raise SystemExit(
            "Active owner-terminal requires CONKER_TERMINAL_WORKSPACE"
        )
    if not terminal_workspace_label:
        terminal_workspace_label = Path(selected).name
    if (
        not 1 <= len(terminal_workspace_label) <= 120
        or any(character in "\x00\r\n" for character in terminal_workspace_label)
    ):
        raise SystemExit("CONKER_TERMINAL_WORKSPACE_LABEL is invalid")
    try:
        terminal_workspace = validate_workspace(
            Path(selected),
            installation=root,
            state=state,
            recovery=root / "recovery",
            credentials=state,
            backups=root / "recovery",
            home=Path.home(),
            workspace_gid=65532,
        )
    except TerminalWorkspaceError as exc:
        raise SystemExit(f"Terminal workspace rejected: {exc}") from exc
keyfile = state / "credentials.json"
if keyfile.exists():
    keys = json.loads(keyfile.read_text())
else:
    keys = {name: secrets.token_urlsafe(36) for name in (
        "pi", "gateway", "pi_owner", "toolgate", "owner", "execution", "memory",
        "read", "ingest", "decisions", "salt", "callback", "postgres", "embeddings", "system")}
    keys["execution"] = "tgx_" + keys["execution"]
    keys["read"] = "mg_read_" + keys["read"]
    keys["salt"] = secrets.token_hex(16)
    keyfile.write_text(json.dumps(keys))
    keyfile.chmod(0o600)
digest = lambda name: hashlib.sha256(keys[name].encode()).hexdigest()

def preserved_pi_setting(name):
    value = os.environ.get(name)
    existing = state / "pi.env"
    if value is None and existing.is_file():
        prefix = name + "="
        value = next(
            (line[len(prefix):] for line in existing.read_text().splitlines() if line.startswith(prefix)),
            "",
        )
    value = value or ""
    if any(character in value for character in "\x00\r\n"):
        raise SystemExit(f"{name} must be one line")
    return value

env = {
    "postgres": {"POSTGRES_USER": "conker", "POSTGRES_DB": "conker", "POSTGRES_PASSWORD": keys["postgres"]},
    "gateway": {"GATEWAY_ORIGIN": origin, "GATEWAY_DB_PATH": "/auth/auth.db",
        "GATEWAY_PI_URL": "http://pi:8050", "PI_GATEWAY_KEY": keys["gateway"],
        "GATEWAY_PI_OWNER_KEY": keys["pi_owner"], "GATEWAY_DASHBOARD_DIR": "/dashboard",
        "GATEWAY_TOOLGATE_URL": "http://toolgate:8010", "GATEWAY_TOOLGATE_OWNER_KEY": keys["owner"],
        "GATEWAY_TOOLGATE_EXECUTION_KEY": keys["execution"]},
    "pi": {"PI_ADMIN_KEY": keys["pi"], "PI_GATEWAY_KEY_SHA256": digest("gateway"),
        "PI_OWNER_KEY_SHA256": digest("pi_owner"), "PI_DB_PATH": "/data/pi.db",
        "PI_MODEL": "qwen2.5:3b", "PI_OLLAMA_URL": "http://ollama:11434",
        "PI_OPENROUTER_KEY_FILE": "/run/secrets/provider-openrouter",
        "PI_OPENAI_KEY_FILE": "/run/secrets/provider-openai",
        "PI_ANTHROPIC_KEY_FILE": "/run/secrets/provider-anthropic",
        "PI_SPEECH_KEY_FILE": "/run/secrets/speech",
        "PI_TOOLGATE_URL": "http://toolgate:8010", "PI_TOOLGATE_KEY": keys["execution"],
        "PI_MEMORYGATE_URL": "http://memorygate:8020", "PI_MEMORYGATE_INGEST_KEY": keys["ingest"],
        "PI_MEMORYGATE_READ_KEY": keys["read"], "PI_MEMORYGATE_AGENT_ID": "conker_companion",
        "PI_DECISION_URL": "http://127.0.0.1:8060", "PI_DECISION_KEY": keys["decisions"],
        # Both workers idle until the owner acts: ideas need a Proposals model chosen in
        # Settings, and the scheduler runs only jobs the owner created.
        "PI_PROPOSALS_ENABLED": "true", "PI_SCHEDULER_ENABLED": "true"},
    "toolgate": {"TOOLGATE_DATA_DIR": "/data", "TOOLGATE_ADMIN_KEY": keys["toolgate"],
        "TOOLGATE_OWNER_KEY_SHA256": digest("owner"), "TOOLGATE_VAULT_KEY_FILE": "/data/vault.key",
        "TOOLGATE_VAULT_SALT": keys["salt"], "TOOLGATE_CALLBACK_SECRET": keys["callback"],
        "TOOLGATE_BOOTSTRAP_EXECUTION_KEY": keys["execution"], "TOOLGATE_BOOTSTRAP_SCOPES": "",
        "MEMORYGATE_URL": "http://memorygate:8020", "MEMORYGATE_READ_KEY": keys["read"]},
    "memorygate": {"DATABASE_URL": "postgresql+psycopg://conker:" + keys["postgres"] + "@postgres:5432/conker",
        "MEMORYGATE_ADMIN_KEY": keys["memory"], "MEMORYGATE_BOOTSTRAP_READ_KEY": keys["read"],
        "MEMORYGATE_BOOTSTRAP_AGENT_ID": "conker_companion", "MEMORYGATE_CONVERSATION_KEY": keys["ingest"],
        "MEMORYGATE_CONVERSATION_AGENT_ID": "conker_companion", "RUNTIME_SECRET_PATH": "/data/runtime.key",
        "BACKUP_DIR": "/data/backups", "OLLAMA_ENABLED": "false", "QDRANT_URL": "http://qdrant:6333",
        "EMBEDDINGS_URL": "http://embeddings:8030", "EMBEDDINGS_KEY": keys["embeddings"],
        "MEMORYGATE_CORS_ORIGINS": origin},
    "embeddings": {"EMBEDDINGS_ADMIN_KEY": keys["embeddings"], "EMBEDDINGS_OLLAMA_URL": "http://ollama:11434",
        "EMBEDDINGS_MODEL": "qwen3-embedding:0.6b", "EMBEDDINGS_DIMENSION": "1024"},
    "systemgate": {"SYSTEMGATE_ADMIN_KEY": keys["system"], "SYSTEMGATE_BACKUP_ROOT": "/backups",
        "SYSTEMGATE_DATA_DIR": "/data", "SYSTEMGATE_PROCFS_PATH": "/host/proc", "SYSTEMGATE_DISK_PATH": "/"},
    "decisions": {"DECISION_API_KEY": keys["decisions"], "DECISION_CPU_THREADS": "4",
        "DECISION_MODEL_PATH": "/models/hub/models--convaiinnovations--laya/snapshots/1c5edc17a7acd8701df6fc341c0d179f1c62c982",
        "DECISION_MODEL_ID": "laya-english@1c5edc17", "HF_HOME": "/models"},
    "ollama": {"OLLAMA_CONTEXT_LENGTH": "8192", "OLLAMA_NUM_PARALLEL": "1", "OLLAMA_MAX_LOADED_MODELS": "2", "OLLAMA_KEEP_ALIVE": "5m"},
}
if terminal_workspace is not None:
    env["gateway"].update({
        "GATEWAY_TERMINAL_SOCKET": "/run/conker-terminal/control.sock",
        "GATEWAY_TERMINAL_WORKSPACE_LABEL": terminal_workspace_label,
    })
provider_store = SecretStore(state / "provider-secrets")
provider_store.initialize()
for provider, name in (
    ("openrouter", "PI_OPENROUTER_KEY"),
    ("openai", "PI_OPENAI_KEY"),
    ("anthropic", "PI_ANTHROPIC_KEY"),
):
    value = preserved_pi_setting(name)
    if value:
        try:
            provider_store.import_active(provider, value.encode("ascii"))
        except (UnicodeEncodeError, ProviderSecretError) as exc:
            raise SystemExit(
                f"{name} contains an invalid legacy provider credential; replace it before preparing"
            ) from exc
paid = preserved_pi_setting("PI_ALLOW_PAID_MODELS")
if paid:
    env["pi"]["PI_ALLOW_PAID_MODELS"] = paid
for name, default in (
    ("PI_SPEECH_URL", ""),
    ("PI_STT_MODEL", ""),
    ("PI_TTS_MODEL", ""),
    ("PI_TTS_VOICE", ""),
    ("PI_SPEECH_CHARACTER_VOICE", "unsupported"),
    ("PI_SPEECH_TIMEOUT_S", "30"),
):
    env["pi"][name] = preserved_pi_setting(name) or default
speech_directory = state / "speech"
speech_directory.mkdir(exist_ok=True, mode=0o700)
speech_key = speech_directory / "speech.key"
if speech_key.is_symlink() or (speech_key.exists() and not speech_key.is_file()):
    raise SystemExit("Speech credential path must be a regular file")
if not speech_key.exists():
    speech_key.write_bytes(b"")
speech_key.chmod(0o600)
for name, values in env.items():
    (state / name).mkdir(exist_ok=True, mode=0o700)
    (state / (name + ".env")).write_text("".join(f"{k}={v}\n" for k, v in values.items()))

services = {}
def service(name, memory, networks, **extra):
    services[name] = {"restart": "unless-stopped", "mem_limit": memory, "pids_limit": 256,
        "security_opt": ["no-new-privileges:true"], "env_file": [f"./state/{name}.env"],
        "networks": networks, "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}, **extra}

service("postgres", "768m", ["index"], image=images["postgres"], volumes=["./state/postgres:/var/lib/postgresql/data"],
    healthcheck={"test": ["CMD-SHELL", "pg_isready -U conker"], "interval": "5s", "timeout": "5s", "retries": 20})
service("ollama", "5g", ["inference"], image=images["ollama"], volumes=["./state/ollama:/root/.ollama"])
services["qdrant"] = {"image": images["qdrant"], "restart": "unless-stopped", "mem_limit": "512m",
    "networks": ["index"], "volumes": ["./state/qdrant:/qdrant/storage"], "security_opt": ["no-new-privileges:true"],
    "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}}
for name, memory, networks, context, dockerfile in [
    ("pi", "768m", ["runtime", "inference"], "pi", "Dockerfile"),
    ("gateway", "512m", ["runtime", "owner"], "pi", "Dockerfile"),
    ("toolgate", "768m", ["runtime", "owner"], "toolgate", "toolgate/Dockerfile"),
    ("memorygate", "1g", ["runtime", "index"], "memorygate/services/api", "Dockerfile"),
    ("embeddings", "256m", ["index", "inference"], "embeddings", "Dockerfile"),
    ("systemgate", "256m", ["runtime"], "systemgate", "Dockerfile"),
]:
    service(name, memory, networks, build={"context": f"./sources/{context}", "dockerfile": dockerfile}, cap_drop=["ALL"], user="1000:1000")
services["pi"]["volumes"] = [
    "./state/pi:/data",
    "./state/provider-secrets/openrouter.key:/run/secrets/provider-openrouter:ro",
    "./state/provider-secrets/openai.key:/run/secrets/provider-openai:ro",
    "./state/provider-secrets/anthropic.key:/run/secrets/provider-anthropic:ro",
    "./state/speech/speech.key:/run/secrets/speech:ro",
]
services["pi"]["depends_on"] = ["memorygate", "toolgate", "ollama"]
services["gateway"].update(command=["python", "-m", "gateway", "serve"], ports=["127.0.0.1:18050:8050"],
    volumes=["./state/gateway:/auth", "./sources/companion/dashboard/dist:/dashboard:ro"], depends_on=["pi"])
if terminal_workspace is not None:
    services["gateway"]["volumes"].append(
        "terminal_control:/run/conker-terminal"
    )
    services["gateway"]["group_add"] = ["65532"]
    services["gateway"]["depends_on"] = {
        "pi": {"condition": "service_started"},
        "owner-terminal": {"condition": "service_healthy"},
    }
    services["owner-terminal"] = {
        "image": terminal["image"],
        "restart": "unless-stopped",
        "command": [
            "serve",
            "--socket", "/run/conker-terminal/control.sock",
            "--health", "/run/conker-terminal/health.json",
            "--shell", "/bin/bash",
            "--workspace", "/workspace",
            "--gateway-uid", "1000",
        ],
        "user": "65532:65532",
        "network_mode": "none",
        "read_only": True,
        "init": True,
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
        "pids_limit": 64,
        "mem_limit": "256m",
        "cpus": 1.0,
        "stop_grace_period": "10s",
        "environment": {"CONKER_TERMINAL_ISOLATED": "1"},
        "volumes": [
            {
                "type": "volume",
                "source": "terminal_control",
                "target": "/run/conker-terminal",
            },
            {
                "type": "bind",
                "source": terminal_workspace["path"],
                "target": "/workspace",
                "read_only": False,
            },
        ],
        "tmpfs": ["/tmp:rw,noexec,nosuid,nodev,size=32m"],
        "healthcheck": {
            "test": [
                "CMD", "conker-terminal", "health", "--health",
                "/run/conker-terminal/health.json",
            ],
            "interval": "10s",
            "timeout": "2s",
            "retries": 3,
        },
        "logging": {
            "driver": "json-file",
            "options": {"max-size": "10m", "max-file": "3"},
        },
    }
    (state / "terminal-workspace.json").write_text(
        json.dumps(terminal_workspace, indent=2) + "\n"
    )
services["toolgate"]["volumes"] = ["./state/toolgate:/data"]
services["memorygate"].update(volumes=["./state/memorygate:/data"], depends_on={"postgres": {"condition": "service_healthy"}})
services["systemgate"].update(uts="host", volumes=[
    "./recovery:/backups:ro", "./state/systemgate:/data", "/proc:/host/proc:ro"])
services["decisions"] = {"build": {"context": "./sources/companion/services/decisions", "dockerfile": "Dockerfile"},
    "restart": "unless-stopped", "mem_limit": "3g", "pids_limit": 256, "cap_drop": ["ALL"],
    "security_opt": ["no-new-privileges:true"], "env_file": ["./state/decisions.env"],
    "user": "1000:1000", "network_mode": "service:pi", "depends_on": ["pi"], "volumes": ["./state/decisions:/models"],
    "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}}
manifest = {"name": "conker", "services": services, "networks": {
    "runtime": {}, "owner": {"internal": True}, "index": {"internal": True}, "inference": {}}}
if terminal_workspace is not None:
    manifest["volumes"] = {"terminal_control": {}}
(root / "compose.json").write_text(json.dumps(manifest, indent=2))
print("Prepared isolated deployment; no credentials printed. Only 127.0.0.1:18050 is published.")
