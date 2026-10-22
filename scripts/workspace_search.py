"""Memory search by meaning in the local workspace: the embeddings service and a Qdrant index.

Opt-in, like memory corrections: run `python scripts/workspace.py meaning-search` while MemoryGate
is stopped. It installs the pinned embeddings source, records two more services (a Qdrant
container and the embeddings process) and points MemoryGate at them. The embedding model must
already be in Ollama. It is the model and width the server uses, so vectors mean the same thing.
"""

from __future__ import annotations

import copy
import json
import secrets
import urllib.request

from workspace import CONFIG, PORTS, ROOT, STATE, owned_process, prepare_source
from workspace_memory import write_config

MODEL, DIMENSION = (
    "qwen3-embedding:0.6b",
    1024,
)  # a matched pair; the service refuses a mismatch
OLLAMA = "http://127.0.0.1:11434"


def installed_models(origin: str = OLLAMA) -> set[str]:
    """Model names Ollama has; it must be running, as for answers."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(origin + "/api/tags", timeout=10) as response:
        return {item["name"] for item in json.load(response).get("models", [])}


def pinned(name: str) -> str:
    """One line of versions.env, the release's pinned third-party images."""
    for line in (ROOT / "versions.env").read_text(encoding="utf-8").splitlines():
        key, _, value = line.partition("=")
        if key.strip() == name and value.strip():
            return value.strip()
    raise ValueError(f"versions.env has no {name}.")


def prepare(config: dict, key: str, python: str, image: str) -> tuple[dict, bool]:
    """The configuration with meaning search; an existing setup is kept as it is."""
    if config.get("meaning_search"):
        return config, False
    prepared = copy.deepcopy(config)
    instance = config["postgres_container"].replace(
        "conker-workspace-", "conker-workspace-qdrant-", 1
    )
    prepared["ports"] = {
        **config.get("ports", {}),
        "embeddings": PORTS["embeddings"],
        "qdrant": PORTS["qdrant"],
    }
    prepared["environments"]["embeddings"] = {
        "EMBEDDINGS_ADMIN_KEY": key,
        "EMBEDDINGS_OLLAMA_URL": OLLAMA,
        "EMBEDDINGS_MODEL": MODEL,
        "EMBEDDINGS_DIMENSION": str(DIMENSION),
    }
    prepared["environments"]["memorygate"].update(
        QDRANT_URL=f"http://127.0.0.1:{PORTS['qdrant']}",
        EMBEDDINGS_URL=f"http://127.0.0.1:{PORTS['embeddings']}",
        EMBEDDINGS_KEY=key,
    )
    prepared["repositories"] = {
        **config["repositories"],
        "embeddings": str(STATE / "sources" / "embeddings"),
    }
    prepared["python_by_service"] = {
        **config.get("python_by_service", {}),
        "embeddings": python,
    }
    prepared.update(qdrant_container=instance, qdrant_volume=instance)
    prepared["meaning_search"] = {
        "model": MODEL,
        "dimension": DIMENSION,
        "qdrant_image": image,
    }
    return prepared, True


def enable(config: dict) -> None:
    if any(
        owned_process(config, service)
        for service in ("memorygate", "embeddings", "qdrant")
        if service == "memorygate" or config.get("meaning_search")
    ):
        raise SystemExit(
            "Stop the workspace before turning on meaning search: python scripts/workspace.py down"
        )
    try:
        if MODEL not in installed_models():
            raise SystemExit(
                f"Ollama does not have the embedding model yet. Run: ollama pull {MODEL}"
            )
    except OSError:
        raise SystemExit(
            "Start Ollama first; meaning search uses it for embeddings."
        ) from None
    try:
        original = CONFIG.read_bytes()
        if json.loads(original) != config:
            raise ValueError(
                "Workspace configuration changed; reload before turning on meaning search."
            )
        revision = json.loads((ROOT / "scripts/workspace-sources.json").read_text())[
            "embeddings"
        ]
        python = prepare_source("embeddings", revision)
        (STATE / "embeddings").mkdir(exist_ok=True)
        prepared, changed = prepare(
            config, secrets.token_urlsafe(36), python, pinned("QDRANT_IMAGE")
        )
        if changed:
            write_config(CONFIG, prepared, original)
    except (ValueError, TypeError, KeyError, OSError) as exc:
        raise SystemExit(str(exc)) from None
    print(
        f"Meaning search configured with {MODEL}; the key stays in the workspace configuration. "
        "Start with: python scripts/workspace.py up"
    )
