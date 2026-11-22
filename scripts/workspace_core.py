"""Shared paths, ports and the command runner of the local workspace (leaf: imports nothing from it)."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".local-run"
CONFIG = STATE / "configuration.json"
ORDER = ("postgres", "memorygate", "toolgate", "pi", "gateway")
PORTS = {
    "memorygate": 18520,
    "toolgate": 18510,
    "pi": 18551,
    "gateway": 18550,
    "decisions": 18560,
    "providers": 18570,
    "postgres": 55542,
    "embeddings": 18530,
    "qdrant": 16333,
}
# Docker-run services: config keys for the container and volume, the published port, the data mount.
CONTAINERS = {
    "postgres": (
        "PostgreSQL",
        "postgres_container",
        "postgres_volume",
        "5432/tcp",
        "/var/lib/postgresql/data",
    ),
    "qdrant": ("Qdrant", "qdrant_container", "qdrant_volume", "6333/tcp", "/qdrant/storage"),
}
ORIGIN = "https://localhost:18550"


def run(*args, cwd=ROOT, capture=False, timeout=None) -> Any:
    result = subprocess.run(
        [str(arg) for arg in args],
        cwd=cwd,
        check=True,
        text=True,
        capture_output=capture,
        timeout=timeout,
    )
    return result.stdout.strip() if capture else None
