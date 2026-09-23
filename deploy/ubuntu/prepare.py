"""Prepare an isolated, source-built Conker deployment. Never imports laptop data.

Run inside the deployment directory containing sources/{companion,pi,...}.
Secrets are generated once, owner-readable only, and never printed.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
from urllib.parse import urlsplit

os.umask(0o077)
root = Path.cwd()
origin = sys.argv[1]
parsed = urlsplit(origin)
if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
        or parsed.path or parsed.query or parsed.fragment or any(c.isspace() for c in origin)):
    raise SystemExit("Supply an exact HTTPS origin without a trailing slash")
state = root / "state"
state.mkdir(exist_ok=True, mode=0o700)
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
        "PI_TOOLGATE_URL": "http://toolgate:8010", "PI_TOOLGATE_KEY": keys["execution"],
        "PI_MEMORYGATE_URL": "http://memorygate:8020", "PI_MEMORYGATE_INGEST_KEY": keys["ingest"],
        "PI_MEMORYGATE_READ_KEY": keys["read"], "PI_MEMORYGATE_AGENT_ID": "conker_companion",
        "PI_DECISION_URL": "http://127.0.0.1:8060", "PI_DECISION_KEY": keys["decisions"]},
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
    "systemgate": {"SYSTEMGATE_ADMIN_KEY": keys["system"], "SYSTEMGATE_BACKUP_ROOT": "/backups", "SYSTEMGATE_DATA_DIR": "/data"},
    "decisions": {"DECISION_API_KEY": keys["decisions"], "DECISION_CPU_THREADS": "4",
        "DECISION_MODEL_PATH": "/models/hub/models--convaiinnovations--laya/snapshots/1c5edc17a7acd8701df6fc341c0d179f1c62c982",
        "DECISION_MODEL_ID": "laya-english@1c5edc17", "HF_HOME": "/models"},
    "ollama": {"OLLAMA_CONTEXT_LENGTH": "8192", "OLLAMA_NUM_PARALLEL": "1", "OLLAMA_MAX_LOADED_MODELS": "2", "OLLAMA_KEEP_ALIVE": "5m"},
}
for name, values in env.items():
    (state / name).mkdir(exist_ok=True, mode=0o700)
    (state / (name + ".env")).write_text("".join(f"{k}={v}\n" for k, v in values.items()))

services = {}
def service(name, memory, networks, **extra):
    services[name] = {"restart": "unless-stopped", "mem_limit": memory, "pids_limit": 256,
        "security_opt": ["no-new-privileges:true"], "env_file": [f"./state/{name}.env"],
        "networks": networks, "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}, **extra}

service("postgres", "768m", ["index"], image="postgres:16", volumes=["./state/postgres:/var/lib/postgresql/data"],
    healthcheck={"test": ["CMD-SHELL", "pg_isready -U conker"], "interval": "5s", "timeout": "5s", "retries": 20})
service("ollama", "5g", ["inference"], image="ollama/ollama:latest", volumes=["./state/ollama:/root/.ollama"])
services["qdrant"] = {"image": "qdrant/qdrant:latest", "restart": "unless-stopped", "mem_limit": "512m",
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
services["pi"]["volumes"] = ["./state/pi:/data"]
services["pi"]["depends_on"] = ["memorygate", "toolgate", "ollama"]
services["gateway"].update(command=["python", "-m", "gateway", "serve"], ports=["127.0.0.1:18050:8050"],
    volumes=["./state/gateway:/auth", "./sources/companion/dashboard/dist:/dashboard:ro"], depends_on=["pi"])
services["toolgate"]["volumes"] = ["./state/toolgate:/data"]
services["memorygate"].update(volumes=["./state/memorygate:/data"], depends_on={"postgres": {"condition": "service_healthy"}})
services["systemgate"]["volumes"] = ["./recovery:/backups:ro", "./state/systemgate:/data"]
services["decisions"] = {"build": {"context": "./sources/companion/services/decisions", "dockerfile": "Dockerfile"},
    "restart": "unless-stopped", "mem_limit": "3g", "pids_limit": 256, "cap_drop": ["ALL"],
    "security_opt": ["no-new-privileges:true"], "env_file": ["./state/decisions.env"],
    "user": "1000:1000", "network_mode": "service:pi", "depends_on": ["pi"], "volumes": ["./state/decisions:/models"],
    "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}}
manifest = {"name": "conker", "services": services, "networks": {
    "runtime": {}, "owner": {"internal": True}, "index": {"internal": True}, "inference": {}}}
existing = root / "compose.json"
if existing.exists():
    previous = json.loads(existing.read_text())
    for name in ("postgres", "ollama", "qdrant"):
        pinned = previous.get("services", {}).get(name, {}).get("image", "")
        if pinned.startswith("sha256:"):
            manifest["services"][name]["image"] = pinned
existing.write_text(json.dumps(manifest, indent=2))
print("Prepared isolated deployment; no credentials printed. Only 127.0.0.1:18050 is published.")
