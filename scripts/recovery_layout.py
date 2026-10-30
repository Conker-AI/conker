"""Recovery layouts (repository, Ubuntu), formats and the small file helpers every recovery step uses."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from compose_overlays import overlay_files
from recovery_data import RecoveryError

FORMAT = "conker-snapshot-1"


HOLD_FILE = ".conker-recovery.json"


RECOVERY_FORMAT = "conker-recovery-2"


REVIEW_FORMAT = "conker-recovery-review-1"


READY_FORMAT = "conker-recovery-service-ready-1"


RECEIPTS_DIR = "recovery-receipts"


REPOSITORY_SERVICES = {
    "gateway",
    "pi",
    "toolgate",
    "memorygate",
    "systemgate",
    "embeddings",
    "postgres",
    "qdrant",
    "ollama",
    "searxng",
}


REPOSITORY_STORES = {
    "gateway": "/auth",
    "pi": "/data",
    "toolgate": "/var/lib/toolgate",
    "systemgate": "/app/data",
    "qdrant": "/qdrant/storage",
    "ollama": "/root/.ollama",
}


UBUNTU_SERVICES = {
    "gateway",
    "pi",
    "toolgate",
    "memorygate",
    "systemgate",
    "embeddings",
    "postgres",
    "qdrant",
    "ollama",
    "decisions",
    "searxng",
}


UBUNTU_STORES = {
    "gateway": "/auth",
    "pi": "/data",
    "toolgate": "/data",
    "memorygate": "/data",
    "systemgate": "/data",
    "qdrant": "/qdrant/storage",
    "ollama": "/root/.ollama",
    "decisions": "/models",
}


COMMON_REQUIRED = {
    "memorygate.dump",
    "postgres-globals.sql",
    "config/compose.json",
    "config/provider-state.json",
    "config/runtime.json",
    "memorygate/runtime-token",
}


REPOSITORY_CONFIG_REQUIRED = {
    "config/env",
    "config/versions.env",
    "config/docker-compose.yml",
}


UBUNTU_ENV_FILES = {
    "decisions.env",
    "embeddings.env",
    "gateway.env",
    "memorygate.env",
    "ollama.env",
    "pi.env",
    "postgres.env",
    "systemgate.env",
    "toolgate.env",
}


# Written only by deployments prepared since the Claude plan runtime arrived; older snapshots lack it.
UBUNTU_OPTIONAL_ENV_FILES = {"subscriptions.env"}


UBUNTU_CONFIG_REQUIRED = {
    "config/source-compose.json",
    "config/versions.env",
    "config/credentials.json",
    *("config/env/" + name for name in UBUNTU_ENV_FILES),
}


@dataclass(frozen=True)
class LayoutProfile:
    name: str
    services: frozenset[str]
    stores: dict[str, str]
    database_user: str
    database_name: str
    memory_key_name: str
    writers: tuple[str, ...]
    excluded_mounts: dict[str, frozenset[str]]
    optional_services: frozenset[str] = frozenset()


REPOSITORY_PROFILE = LayoutProfile(
    name="repository",
    services=frozenset(REPOSITORY_SERVICES),
    stores=REPOSITORY_STORES,
    database_user="memorygate",
    database_name="memorygate",
    memory_key_name="runtime-fernet.key",
    writers=(
        "gateway", "pi", "toolgate", "memorygate", "embeddings", "systemgate",
        "searxng", "ollama", "qdrant", "owner-terminal",
        "sandbox-runner", "package-proxy", "subscriptions", "data-owner",
    ),
    excluded_mounts={
        "gateway": frozenset({"/run/conker-terminal", "/run/conker-providers"}),
        # The Claude plan sign-in (docker-compose.subscriptions.yml), as on Ubuntu: not in snapshots.
        "subscriptions": frozenset({"/state", "/run/conker-chatgpt"}),
        "owner-terminal": frozenset({"/run/conker-terminal", "/workspace"}),
        "pi": frozenset({
            "/run/secrets/provider-openrouter",
            "/run/secrets/provider-openai",
            "/run/secrets/provider-anthropic",
            "/run/secrets/speech",
            "/run/conker-chatgpt",
        }),
        "postgres": frozenset({"/var/lib/postgresql/data"}),
        "systemgate": frozenset({"/host/proc", "/backups"}),
        "toolgate": frozenset({"/run/conker-sandbox"}),
        "sandbox-runner": frozenset({"/var/run/docker.sock", "/run/conker-sandbox", "/workspaces"}),
        "package-proxy": frozenset({"/run/conker-proxy"}),
    },
    optional_services=frozenset(
        {"owner-terminal", "sandbox-runner", "package-proxy", "subscriptions", "data-owner"}
    ),
)


UBUNTU_PROFILE = LayoutProfile(
    name="ubuntu",
    services=frozenset(UBUNTU_SERVICES),
    stores=UBUNTU_STORES,
    database_user="conker",
    database_name="conker",
    memory_key_name="runtime.key",
    writers=(
        "gateway", "pi", "toolgate", "memorygate", "embeddings", "systemgate",
        "decisions", "subscriptions", "ollama", "qdrant", "owner-terminal",
        "sandbox-runner", "package-proxy",
    ),
    excluded_mounts={
        "gateway": frozenset({"/dashboard", "/run/conker-terminal", "/run/conker-providers"}),
        # The Claude plan sign-in, like ChatGPT's, is not in snapshots: sign in again after a
        # restore onto another host.
        "subscriptions": frozenset({"/state", "/run/conker-chatgpt"}),
        "owner-terminal": frozenset({"/run/conker-terminal", "/workspace"}),
        "pi": frozenset({
            "/run/secrets/provider-openrouter",
            "/run/secrets/provider-openai",
            "/run/secrets/provider-anthropic",
            "/run/secrets/speech",
            "/run/conker-chatgpt",
        }),
        "postgres": frozenset({"/var/lib/postgresql/data"}),
        "systemgate": frozenset({"/host/proc", "/backups"}),
        "toolgate": frozenset({"/run/conker-sandbox"}),
        "sandbox-runner": frozenset({"/var/run/docker.sock", "/run/conker-sandbox", "/workspaces"}),
        "package-proxy": frozenset({"/run/conker-proxy"}),
    },
    optional_services=frozenset(
        {"owner-terminal", "sandbox-runner", "package-proxy", "subscriptions"}
    ),
)


PROFILES = {profile.name: profile for profile in (REPOSITORY_PROFILE, UBUNTU_PROFILE)}


# Backward-compatible names used by old snapshots and external recovery tests.
SERVICES = REPOSITORY_SERVICES


STORES = REPOSITORY_STORES


REQUIRED = COMMON_REQUIRED | REPOSITORY_CONFIG_REQUIRED | {
    *(name + ".tar" for name in REPOSITORY_STORES),
    "memorygate-backups.tar",
}


BLOCKERS = [
    (
        "Deletion replay blocked: no complete durable deletion ledger exists (B3/C2). "
        "An old snapshot cannot establish deletions made after it was taken."
    ),
    (
        "External-effect reconciliation blocked: restored journals are not reconciled with newer receipts. "
        "Review external systems before resolving uncertain actions; never replay them automatically."
    ),
]


REVIEW_CHECKS = {
    "deletion_replay": "complete",
    "external_effects": "reconciled",
    "credentials": "reprovisioned",
    "functional_acceptance": "passed",
}


PROVIDER_STATE_FIELDS = {
    "activeRevision",
    "activeAt",
    "stagedRevision",
    "stagedAt",
    "verificationStatus",
    "verificationBasis",
    "verifiedAt",
    "pendingActivation",
    "revokedRevisions",
}


PROVIDER_IDS = {"openrouter", "openai", "anthropic"}


def write_json(path: Path, value: dict | list) -> None:
    temporary = path.with_name(path.name + ".writing")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    temporary.replace(path)
    sync_directory(path.parent)


def sync_directory(path: Path) -> None:
    if os.name == "posix":
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def detect_layout(root: Path) -> LayoutProfile:
    repository = all(
        (root / name).is_file()
        for name in (".env", "versions.env", "docker-compose.yml")
    )
    ubuntu = all(
        path.is_file()
        for path in (
            root / "compose.json",
            root / "state" / "credentials.json",
            root / "sources" / "companion" / "versions.env",
        )
    )
    if repository == ubuntu:
        raise RecoveryError(
            "Installation layout is missing or ambiguous; expected exactly one supported "
            "repository or source-built Ubuntu contract."
        )
    return REPOSITORY_PROFILE if repository else UBUNTU_PROFILE


def compose_command(root: Path, profile: LayoutProfile) -> list[str]:
    command = ["compose", "--project-directory", str(root)]
    if profile.name == "repository":
        command.extend(
            [
                "--env-file", str(root / "versions.env"),
                "--env-file", str(root / ".env"),
                "-f", str(root / "docker-compose.yml"),
            ]
        )
        # The overlays the launcher runs, so their services are inventoried and stopped too.
        for overlay in overlay_files(root):
            command.extend(["-f", str(overlay)])
    else:
        command.extend(["-f", str(root / "compose.json")])
    return command


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or len(value) > 64:
        raise RecoveryError(f"Review {field} must be a bounded ISO-8601 timestamp.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RecoveryError(f"Review {field} is not a valid ISO-8601 timestamp.") from exc
    if parsed.tzinfo is None:
        raise RecoveryError(f"Review {field} must include a timezone.")
    return parsed.astimezone(timezone.utc)


def read_json_file(path: Path, label: str) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise RecoveryError(f"{label} must be a regular file, not a symlink.")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RecoveryError(f"{label} is not readable JSON.") from exc
    if not isinstance(value, dict):
        raise RecoveryError(f"{label} must contain a JSON object.")
    return value


def copy_bounded_regular(source: Path, destination: Path, limit: int = 1024 * 1024) -> None:
    if source.is_symlink() or not source.is_file() or source.stat().st_size > limit:
        raise RecoveryError(f"Required configuration file is unsafe or oversized: {source}")
    shutil.copyfile(source, destination)


def _bounded_text(value: Any, field: str, limit: int = 1000) -> str:
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value) > limit
        or any(ord(character) < 32 for character in value)
    ):
        raise RecoveryError(f"Review {field} must be non-empty bounded text without control characters.")
    return value
