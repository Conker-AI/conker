"""Conker snapshots and explicit, held return-to-service recovery.

Recovery never replaces a live installation. A restored data set remains held
while an operator reviews deletion, effect, credential, and acceptance evidence;
the final receipt proves that exact isolated restore is ready for a separately
authorized promotion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, BinaryIO
from urllib.parse import urlsplit

from recovery_data import RecoveryError, safe_member, validate_archive

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
    ),
    excluded_mounts={
        "gateway": frozenset({"/run/conker-terminal", "/run/conker-providers"}),
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
    },
    optional_services=frozenset({"owner-terminal"}),
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
        "decisions", "ollama", "qdrant", "owner-terminal",
    ),
    excluded_mounts={
        "gateway": frozenset({"/dashboard", "/run/conker-terminal", "/run/conker-providers"}),
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
    },
    optional_services=frozenset({"owner-terminal"}),
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
    else:
        command.extend(["-f", str(root / "compose.json")])
    return command


def provider_state_for_backup(root: Path, profile: LayoutProfile) -> dict[str, Any]:
    state_directory = root / (".conker" if profile.name == "repository" else "state")
    if (state_directory / "provider-control/paid-transition.json").exists():
        raise RecoveryError("Recover the interrupted spending-policy change before backup.")
    if profile.name == "repository":
        environments = [root / ".env"]
        path = root / ".conker" / "provider-secrets" / "state.json"
    else:
        environments = sorted((root / "state").glob("*.env"))
        path = root / "state" / "provider-secrets" / "state.json"
    for environment_path in environments:
        environment = environment_path.read_text(encoding="utf-8")
        for name in ("OPENROUTER_KEY", "PI_OPENAI_KEY", "PI_ANTHROPIC_KEY"):
            match = re.search(rf"(?m)^{name}=(.*)$", environment)
            if match and match.group(1).strip():
                action = (
                    "rerun install.sh to migrate them"
                    if profile.name == "repository"
                    else "migrate them to the provider secret store"
                )
                raise RecoveryError(
                    f"Legacy provider credentials remain in {environment_path.name}; "
                    f"{action} before backup."
                )
    if not path.is_file():
        if profile.name == "ubuntu":
            raise RecoveryError(
                "Ubuntu provider credential metadata is missing; repair the generated "
                "deployment before backup."
            )
        return {"schemaVersion": 1, "providers": {}}
    if path.stat().st_size > 262144:
        raise RecoveryError("Provider credential metadata exceeds 256 KiB.")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RecoveryError("Provider credential metadata is unreadable.") from exc
    if (
        not isinstance(value, dict)
        or set(value) != {"schemaVersion", "providers"}
        or value["schemaVersion"] != 1
        or not isinstance(value["providers"], dict)
        or any(name not in PROVIDER_IDS for name in value["providers"])
        or any(
            not isinstance(record, dict) or set(record) != PROVIDER_STATE_FIELDS
            for record in value["providers"].values()
        )
    ):
        raise RecoveryError("Provider credential metadata has an unsupported shape.")
    if any(record.get("pendingActivation") is not None for record in value["providers"].values()):
        raise RecoveryError("Recover the interrupted provider activation before backup.")
    return value


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


def recovery_fingerprint(state: dict[str, Any]) -> str:
    fields = {
        key: state.get(key)
        for key in (
            "format",
            "recovery_id",
            "project",
            "snapshot",
            "snapshot_manifest_sha256",
            "review_nonce",
            "outbound",
            "applications_started",
            "volumes",
            "containers",
            "invalidated_requests",
            "unfinished_turns",
            "held_memory_jobs",
            "invalidated_browser_sessions",
            "vault_values_verified",
            "memory_provider_key_verified",
        )
    }
    for key in ("source_layout", "database"):
        if key in state:
            fields[key] = state[key]
    return canonical_sha256(fields)


def load_recovery(directory: Path, *, require_complete: bool = True) -> tuple[Path, dict[str, Any]]:
    directory = directory.resolve()
    state_path = directory / HOLD_FILE
    state = read_json_file(state_path, "Recovery hold")
    if state.get("format") != RECOVERY_FORMAT:
        raise RecoveryError("Recovery hold uses an unsupported or legacy workflow format.")
    if require_complete:
        expected = state.get("restore_fingerprint")
        if not isinstance(expected, str) or expected != recovery_fingerprint(state):
            raise RecoveryError("Recovery hold facts are incomplete or changed; keep the hold and investigate.")
    return state_path, state


def receipts_directory(directory: Path) -> Path:
    receipts = directory / RECEIPTS_DIR
    if receipts.exists() and (receipts.is_symlink() or not receipts.is_dir()):
        raise RecoveryError("Recovery receipts path must be a private regular directory.")
    receipts.mkdir(mode=0o700, exist_ok=True)
    return receipts


@contextmanager
def recovery_lock(directory: Path):
    lock = directory / ".conker-recovery.lock"
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RecoveryError(
            "Recovery workflow lock exists; confirm no recovery command is running before removing it."
        ) from exc
    try:
        with os.fdopen(descriptor, "w", encoding="ascii") as stream:
            stream.write(str(os.getpid()))
        yield
    finally:
        lock.unlink(missing_ok=True)


def inventory(directory: Path) -> dict:
    records = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise RecoveryError(
                "Snapshot contains special files; retain the original and investigate."
            )
        if path.is_file() and path != directory / "manifest.json":
            records[path.relative_to(directory).as_posix()] = {
                "size": path.stat().st_size,
                "sha256": sha256(path),
            }
    return records


def snapshot_profile(manifest: dict[str, Any]) -> LayoutProfile:
    layout = manifest.get("layout", "repository")
    if not isinstance(layout, str) or layout not in PROFILES:
        raise RecoveryError("Snapshot layout is unsupported; use an intact version manifest.")
    return PROFILES[layout]


def snapshot_database(
    manifest: dict[str, Any], profile: LayoutProfile
) -> dict[str, str]:
    database = manifest.get("database")
    if database is None and "layout" not in manifest:
        return {
            "service": "postgres",
            "user": REPOSITORY_PROFILE.database_user,
            "name": REPOSITORY_PROFILE.database_name,
        }
    expected = {
        "service": "postgres",
        "user": profile.database_user,
        "name": profile.database_name,
    }
    if database != expected:
        raise RecoveryError(
            "Snapshot database identity disagrees with its layout; use an intact snapshot."
        )
    return expected


def required_snapshot_files(profile: LayoutProfile, stores: set[str]) -> set[str]:
    config = (
        REPOSITORY_CONFIG_REQUIRED
        if profile.name == "repository"
        else UBUNTU_CONFIG_REQUIRED
    )
    return COMMON_REQUIRED | config | {name + ".tar" for name in stores}


def valid_service_inventory(services: set[str], profile: LayoutProfile) -> bool:
    required_shape = services - set(profile.optional_services)
    return required_shape in (
        set(profile.services),
        set(profile.services) - {"gateway"},
    ) and services <= set(profile.services) | set(profile.optional_services)


def verify_snapshot(directory: Path) -> dict:
    if directory.is_symlink():
        raise RecoveryError(
            "Snapshot directory must not be a symlink; use its original location."
        )
    manifest_path = directory / "manifest.json"
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise RecoveryError(
            "Incomplete or legacy backup: manifest.json is missing. Create a new verified backup."
        )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("format") != FORMAT or manifest.get("status") != "complete":
        raise RecoveryError(
            "Unsupported or incomplete snapshot; use a complete conker-snapshot-1 backup."
        )
    profile = snapshot_profile(manifest)
    snapshot_database(manifest, profile)
    files = manifest.get("files", {})
    has_gateway = "gateway" in manifest.get("images", {})
    expected_stores = set(profile.stores)
    if not has_gateway:
        expected_stores.discard("gateway")
    if profile.name == "repository":
        expected_stores.add("memorygate-backups")
        if "layout" in manifest:
            expected_stores.add("memorygate")
    required_files = required_snapshot_files(profile, expected_stores)
    if not required_files <= files.keys() or files != inventory(directory):
        raise RecoveryError(
            "Snapshot files are missing, unexpected, or changed; obtain an intact backup."
        )
    images = manifest.get("images", {})
    if not valid_service_inventory(set(images), profile) or any(
        not isinstance(image, dict)
        or not re.fullmatch(r"sha256:[0-9a-f]{64}", image.get("id", ""))
        for image in images.values()
    ):
        raise RecoveryError(
            "Snapshot image identities are invalid; use an intact version manifest."
        )
    stores = manifest.get("stores", {})
    allowed_stores = set(profile.stores)
    if profile.name == "repository":
        allowed_stores.update({"memorygate", "memorygate-backups"})
    captured_config = json.loads((directory / "config/compose.json").read_text(encoding="utf-8"))
    if captured_config.get("services", {}).keys() != images.keys():
        raise RecoveryError("Captured services and image inventory disagree; obtain an intact snapshot.")
    if not expected_stores <= stores.keys() or any(
        name not in allowed_stores
        and not re.fullmatch(r"extra-[a-z]+-[0-9]+", name)
        for name in stores
    ):
        raise RecoveryError(
            "Invalid storage inventory; use an intact snapshot manifest."
        )
    expected_metadata = {
        name: {"service": name, "destination": destination}
        for name, destination in profile.stores.items()
        if name in expected_stores
    }
    if profile.name == "repository":
        if "memorygate" in stores:
            expected_metadata["memorygate"] = {
                "service": "memorygate",
                "destination": "/data",
            }
        expected_metadata["memorygate-backups"] = {
            "service": "memorygate",
            "destination": "/data/backups",
        }
    if any(stores.get(name) != metadata for name, metadata in expected_metadata.items()):
        raise RecoveryError(
            "Storage service or destination disagrees with the snapshot layout."
        )
    for name, metadata in stores.items():
        if name in expected_metadata:
            continue
        match = re.fullmatch(r"extra-([a-z]+)-[0-9]+", name)
        if (
            not match
            or not isinstance(metadata, dict)
            or set(metadata) != {"service", "destination"}
            or metadata["service"] != match.group(1)
            or metadata["service"] not in images
            or not isinstance(metadata["destination"], str)
            or not metadata["destination"].startswith("/")
        ):
            raise RecoveryError("Additional storage metadata is invalid.")
    if {name + ".tar" for name in stores} != {
        name for name in files if name.endswith(".tar")
    }:
        raise RecoveryError(
            "Storage inventory and archives disagree; obtain an intact snapshot."
        )
    with (directory / "memorygate.dump").open("rb") as dump:
        if dump.read(5) != b"PGDMP":
            raise RecoveryError(
                "PostgreSQL dump is empty or invalid; create a new backup."
            )
    for name in files:
        if name.endswith(".tar"):
            required = {"pi.tar": "pi.db", "toolgate.tar": "toolgate.db", "gateway.tar": "auth.db"}.get(name)
            validate_archive(directory / name, required)
    return manifest


class Docker:
    def run(
        self,
        *args: str,
        output: BinaryIO | None = None,
        input: BinaryIO | None = None,
        check: bool = True,
    ) -> subprocess.CompletedProcess[bytes]:
        try:
            result = subprocess.run(
                ["docker", *args],
                stdin=input,
                stdout=output or subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=3600,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RecoveryError(
                "Docker unavailable or timed out; check Docker access and inspect the recovery hold before retrying."
            ) from exc
        if check and result.returncode:
            # Docker errors can contain substituted configuration and credentials.
            operation = next(
                (
                    arg
                    for arg in args
                    if arg
                    in {
                        "pg_dump",
                        "pg_dumpall",
                        "pg_restore",
                        "psql",
                        "/recovery/recovery_data.py",
                    }
                ),
                args[0],
            )
            reason = ""
            if operation == "/recovery/recovery_data.py":
                operation = "offline data operation"
                safe_prefix = b"Recovery data operation failed: "
                if result.stderr.startswith(safe_prefix):
                    reason = (
                        result.stderr.decode("utf-8", errors="replace").splitlines()[0][
                            :500
                        ]
                        + ". "
                    )
            raise RecoveryError(
                f"Docker {operation} failed (exit {result.returncode}). {reason}"
                "Run docker info to check access; inspect the named source/recovery containers and free disk space before retrying."
            )
        return result

    def json(self, *args: str) -> dict | list:
        return json.loads(self.run(*args).stdout)


def helper(
    docker: Docker,
    image: str,
    operation: str,
    mount: dict,
    *,
    output: BinaryIO | None = None,
    input: BinaryIO | None = None,
    snapshot: Path | None = None,
) -> subprocess.CompletedProcess[bytes]:
    scripts = Path(__file__).resolve().parent
    args = [
        "run",
        "--rm",
        "--pull",
        "never",
        "--network",
        "none",
        "--log-driver",
        "local",
        "--security-opt",
        "no-new-privileges",
        "--mount",
        f"type=bind,src={scripts},dst=/recovery,readonly",
        "--mount",
        f"type={mount['type']},src={mount['source']},dst=/store"
        + (",readonly" if mount.get("readonly") else ""),
    ]
    if input is not None:
        args.append("-i")
    if snapshot:
        args.extend(["--mount", f"type=bind,src={snapshot},dst=/snapshot,readonly"])
    args.extend(
        [
            "--entrypoint",
            "python",
            image,
            "/recovery/recovery_data.py",
            operation,
            "/store",
        ]
    )
    if operation == "verify-vault":
        args.extend(["--runtime", "/snapshot/config/runtime.json"])
    if operation == "snapshot-tree" and mount.get("database"):
        args.extend(["--require-sqlite", mount["database"]])
    return docker.run(*args, output=output, input=input)


def wait_postgres(
    docker: Docker,
    container: str,
    database_user: str = "memorygate",
    database_name: str = "memorygate",
) -> None:
    # The image briefly runs a temporary server during initdb. Readiness alone
    # can succeed just before that server stops underneath pg_restore.
    probe = (
        'test "$(cat /proc/1/comm)" = postgres && pg_isready -U '
        + database_user
        + " -d "
        + database_name
    )
    for _ in range(60):
        if (
            docker.run("exec", container, "sh", "-c", probe, check=False).returncode
            == 0
        ):
            return
        time.sleep(0.5)
    raise RecoveryError(
        f"PostgreSQL did not finish startup. Inspect docker logs {container} before retrying."
    )


def mount_at(container: dict, destination: str) -> dict:
    matches = [
        mount for mount in container["Mounts"] if mount["Destination"] == destination
    ]
    if len(matches) != 1:
        raise RecoveryError(
            f"No unambiguous persistent store at {destination}; review the Compose storage layout."
        )
    mount = matches[0]
    if mount["Type"] not in {"volume", "bind"}:
        raise RecoveryError(
            "Unsupported storage type; add an explicit backup adapter before proceeding."
        )
    return {
        "type": mount["Type"],
        "source": mount.get("Name") if mount["Type"] == "volume" else mount["Source"],
        "readonly": True,
    }


@contextmanager
def operation_lock(root: Path):
    lock = root / ".conker-backup.lock"
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RecoveryError(
            "Backup lock exists. Check that no backup is running before removing .conker-backup.lock."
        ) from exc
    try:
        with os.fdopen(descriptor, "w") as stream:
            stream.write(str(os.getpid()))
        yield
    finally:
        lock.unlink()


def copy_bounded_regular(source: Path, destination: Path, limit: int = 1024 * 1024) -> None:
    if source.is_symlink() or not source.is_file() or source.stat().st_size > limit:
        raise RecoveryError(f"Required configuration file is unsafe or oversized: {source}")
    shutil.copyfile(source, destination)


def capture_configuration(
    root: Path, staging: Path, profile: LayoutProfile
) -> None:
    target = staging / "config"
    if profile.name == "repository":
        for source, name in (
            (root / ".env", "env"),
            (root / "versions.env", "versions.env"),
            (root / "docker-compose.yml", "docker-compose.yml"),
        ):
            copy_bounded_regular(source, target / name)
        return
    copy_bounded_regular(
        root / "sources" / "companion" / "versions.env",
        target / "versions.env",
    )
    copy_bounded_regular(root / "compose.json", target / "source-compose.json")
    copy_bounded_regular(
        root / "state" / "credentials.json", target / "credentials.json"
    )
    environment_files = {
        path.name
        for path in (root / "state").glob("*.env")
        if path.is_file() or path.is_symlink()
    }
    if environment_files != UBUNTU_ENV_FILES:
        raise RecoveryError(
            "Ubuntu environment inventory differs from the release contract; "
            "review it before backup."
        )
    environment_target = target / "env"
    environment_target.mkdir(mode=0o700)
    for name in sorted(UBUNTU_ENV_FILES):
        copy_bounded_regular(root / "state" / name, environment_target / name)


def backup(root: Path, destination: Path | None, docker: Docker) -> Path:
    if (root / HOLD_FILE).exists() or (Path.cwd() / HOLD_FILE).exists():
        raise RecoveryError(
            "Recovery is held; read conker recovery-status DIRECTORY before starting a backup that would restart writers."
        )
    with operation_lock(root):
        return _backup(root, destination, docker)


def _backup(root: Path, destination: Path | None, docker: Docker) -> Path:
    profile = detect_layout(root)
    compose = compose_command(root, profile)
    config = docker.json(*compose, "config", "--format", "json")
    configured_services = set(config.get("services", {}))
    if not valid_service_inventory(configured_services, profile):
        raise RecoveryError(
            f"Unknown {profile.name} Compose services; inventory their authoritative stores before backup."
        )
    containers, runtime, mounts, images = {}, {}, {}, {}
    for service in sorted(config["services"]):
        ids = (
            docker.run(*compose, "ps", "--all", "--quiet", service)
            .stdout.decode()
            .split()
        )
        if len(ids) != 1:
            raise RecoveryError(
                f"Expected one {service} container; restore the installation layout before backup."
            )
        container = docker.json("inspect", ids[0])[0]
        containers[service] = container
        runtime[service] = dict(
            value.split("=", 1)
            for value in container["Config"].get("Env", [])
            if "=" in value
        )
        image = docker.json("image", "inspect", container["Image"])[0]
        images[service] = {
            "id": image["Id"],
            "repo_digests": image.get("RepoDigests", []),
            "reference": container["Config"]["Image"],
            "architecture": image["Architecture"],
            "os": image["Os"],
            "labels": image["Config"].get("Labels") or {},
        }
    repository_expected = {
        ("gateway", "GATEWAY_DB_PATH"): "/auth/auth.db",
        ("pi", "PI_DB_PATH"): "/data/pi.db",
        ("toolgate", "TOOLGATE_DATA_DIR"): "/var/lib/toolgate",
        ("toolgate", "TOOLGATE_ENV_PATH"): "/var/lib/toolgate/.env",
        ("toolgate", "TOOLGATE_VAULT_KEY_FILE"): "/var/lib/toolgate/vault.key",
        ("memorygate", "RUNTIME_SECRET_PATH"): "/data/runtime-fernet.key",
        ("memorygate", "BACKUP_DIR"): "/data/backups",
        ("systemgate", "SYSTEMGATE_DATA_DIR"): "/app/data",
        ("postgres", "POSTGRES_USER"): "memorygate",
        ("postgres", "POSTGRES_DB"): "memorygate",
        ("postgres", "PGDATA"): "/var/lib/postgresql/data",
    }
    ubuntu_expected = {
        ("gateway", "GATEWAY_DB_PATH"): "/auth/auth.db",
        ("pi", "PI_DB_PATH"): "/data/pi.db",
        ("toolgate", "TOOLGATE_DATA_DIR"): "/data",
        ("toolgate", "TOOLGATE_VAULT_KEY_FILE"): "/data/vault.key",
        ("memorygate", "RUNTIME_SECRET_PATH"): "/data/runtime.key",
        ("memorygate", "BACKUP_DIR"): "/data/backups",
        ("systemgate", "SYSTEMGATE_DATA_DIR"): "/data",
        ("postgres", "POSTGRES_USER"): "conker",
        ("postgres", "POSTGRES_DB"): "conker",
        ("postgres", "PGDATA"): "/var/lib/postgresql/data",
    }
    expected = repository_expected if profile.name == "repository" else ubuntu_expected
    for (service, key), value in expected.items():
        if service not in runtime:
            continue
        actual = runtime[service].get(key)
        required = profile.name == "ubuntu" and key != "PGDATA"
        if (required and actual is None) or (actual is not None and actual != value):
            raise RecoveryError(
                f"Custom {key} is not covered; add its recovery mapping before backup."
            )
    database_url = runtime["memorygate"].get("DATABASE_URL")
    if profile.name == "ubuntu" and not database_url:
        raise RecoveryError(
            "MemoryGate database endpoint is missing; repair the generated deployment before backup."
        )
    if database_url:
        parsed = urlsplit(database_url)
        if (
            parsed.hostname != "postgres"
            or parsed.username != profile.database_user
            or parsed.path != "/" + profile.database_name
            or parsed.port not in {None, 5432}
        ):
            raise RecoveryError(
                "MemoryGate uses an unmapped database endpoint; map that authoritative store before backup."
            )
    store_paths = {
        name: path for name, path in profile.stores.items() if name in containers
    }
    if profile.name == "repository" and any(
        mount["Destination"] == "/data"
        for mount in containers["memorygate"]["Mounts"]
    ):
        # Current installs persist MemoryGate's runtime key and local state in
        # /data. Legacy installs had only the nested backup bind and remain
        # restorable through the separately captured runtime-key volume.
        store_paths["memorygate"] = "/data"
    for service, path in store_paths.items():
        mounts[service] = mount_at(containers[service], path)
    mounts["pi"]["database"] = "pi.db"
    mounts["toolgate"]["database"] = "toolgate.db"
    if "gateway" in mounts:
        mounts["gateway"]["database"] = "auth.db"
    stores = {
        name: {"service": name, "destination": path} for name, path in store_paths.items()
    }
    if profile.name == "repository":
        mounts["memorygate-backups"] = mount_at(
            containers["memorygate"], "/data/backups"
        )
        stores["memorygate-backups"] = {
            "service": "memorygate",
            "destination": "/data/backups",
        }
    # Images can declare anonymous volumes absent from Compose (for example
    # search-engine configuration). Inventory them rather than silently omit them.
    for service, container in containers.items():
        known = {
            item["destination"]
            for item in stores.values()
            if item["service"] == service
        }
        for index, mount in enumerate(container["Mounts"]):
            path = mount["Destination"]
            if path in known | profile.excluded_mounts.get(service, frozenset()):
                continue
            if mount["Type"] != "volume":
                raise RecoveryError(
                    f"Unmapped {service} bind mount at {path}; add its recovery mapping before backup."
                )
            name = f"extra-{service}-{index}"
            mounts[name] = mount_at(container, path)
            stores[name] = {"service": service, "destination": path}
    if destination is None:
        if profile.name == "ubuntu":
            raise RecoveryError(
                "Source-built Ubuntu backups require --destination outside the installation."
            )
        source = mounts["memorygate-backups"]
        if source["type"] != "bind":
            raise RecoveryError(
                "Specify --destination for a backup directory outside Docker volumes."
            )
        destination = Path(source["source"]).parent
    destination = destination.resolve()
    for mount in mounts.values():
        if mount["type"] == "bind" and destination.is_relative_to(
            Path(mount["source"]).resolve()
        ):
            raise RecoveryError(
                "Backup destination is inside a source store; choose a separate directory."
            )
    if not containers["postgres"]["State"]["Running"]:
        raise RecoveryError(
            "PostgreSQL is stopped; start it before creating a coordinated logical backup."
        )
    destination.mkdir(parents=True, exist_ok=True)
    name = (
        "snapshot-"
        + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-")
        + uuid.uuid4().hex[:8]
    )
    staging = destination / ("." + name + ".partial")
    staging.mkdir(mode=0o700)
    for folder in ("config", "memorygate"):
        (staging / folder).mkdir(mode=0o700)
    stopped = [
        containers[name]["Id"]
        for name in profile.writers
        if name in containers and containers[name]["State"]["Running"]
    ]
    write_json(
        staging / "source-state.json",
        {"restart_container_ids": stopped, "status": "stopping_writers"},
    )
    try:
        # Stop APIs and workers as well as index/model writers. No container is
        # recreated, so MemoryGate's currently unmounted encryption key survives.
        if stopped:
            print("Stopping writers for a coordinated snapshot...", file=sys.stderr)
            docker.run("stop", "--time", "60", *stopped)
        for container_id in stopped:
            state = docker.json("inspect", container_id)[0]["State"]
            if state["Running"] or state.get("ExitCode") == 137:
                raise RecoveryError(
                    "A writer did not stop cleanly; inspect its unfinished work before retrying backup."
                )
        capture_configuration(root, staging, profile)
        write_json(
            staging / "config/provider-state.json",
            provider_state_for_backup(root, profile),
        )
        write_json(staging / "config/compose.json", config)
        write_json(staging / "config/runtime.json", runtime)
        postgres = containers["postgres"]["Id"]
        extra_databases = docker.run(
            "exec",
            postgres,
            "psql",
            "-U",
            profile.database_user,
            "-d",
            profile.database_name,
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname NOT IN "
            f"('postgres','{profile.database_name}')",
        ).stdout.strip()
        if extra_databases:
            raise RecoveryError(
                "Additional PostgreSQL databases found; back them up explicitly before proceeding."
            )
        with (staging / "postgres-globals.sql").open("wb") as output:
            docker.run(
                "exec",
                postgres,
                "pg_dumpall",
                "-U",
                profile.database_user,
                "--globals-only",
                output=output,
            )
        with (staging / "memorygate.dump").open("wb") as output:
            docker.run(
                "exec",
                postgres,
                "pg_dump",
                "-U",
                profile.database_user,
                "-Fc",
                profile.database_name,
                output=output,
            )
        token = docker.run(
            "exec",
            postgres,
            "psql",
            "-U",
            profile.database_user,
            "-d",
            profile.database_name,
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "SELECT api_key_encrypted FROM ai_runtime_settings WHERE id='singleton'",
        ).stdout
        (staging / "memorygate/runtime-token").write_bytes(token)
        key_copy = docker.run(
            "cp",
            containers["memorygate"]["Id"] + ":/data/" + profile.memory_key_name,
            "-",
            check=False,
        )
        if key_copy.returncode == 0:
            import io

            with tarfile.open(fileobj=io.BytesIO(key_copy.stdout)) as archive:
                members = archive.getmembers()
                if (
                    len(members) != 1
                    or not members[0].isfile()
                    or safe_member(members[0]).name != profile.memory_key_name
                ):
                    raise RecoveryError(
                        "Unexpected runtime-key archive; inspect MemoryGate storage."
                    )
                stream = archive.extractfile(members[0])
                assert stream is not None
                (staging / "memorygate/runtime-fernet.key").write_bytes(stream.read())
        elif token.strip() or b"Could not find" not in key_copy.stderr:
            raise RecoveryError(
                "MemoryGate runtime key could not be captured; retain its original "
                f"container and recover /data/{profile.memory_key_name}."
            )
        helper(
            docker,
            images["toolgate"]["id"],
            "verify-memory-key",
            {"type": "bind", "source": str(staging / "memorygate"), "readonly": True},
        )
        for store, mount in mounts.items():
            print(f"Capturing {store}...", file=sys.stderr)
            with (staging / (store + ".tar")).open("wb") as output:
                helper(
                    docker, images["pi"]["id"], "snapshot-tree", mount, output=output
                )
        helper(
            docker,
            images["toolgate"]["id"],
            "verify-vault",
            mounts["toolgate"],
            snapshot=staging,
        )
        write_json(
            staging / "source-state.json",
            {"restart_container_ids": stopped, "status": "snapshot_captured"},
        )
    finally:
        # Restore only the services that were running. A failed restart is a
        # failed backup command, even when the data files have been captured.
        if stopped:
            docker.run("start", *stopped)
    for path in staging.rglob("*"):
        if path.is_file():
            path.chmod(0o600)
            with path.open("r+b") as stream:
                os.fsync(stream.fileno())
    for path in sorted(
        (path for path in staging.rglob("*") if path.is_dir()), reverse=True
    ):
        sync_directory(path)
    write_json(
        staging / "manifest.json",
        {
            "format": FORMAT,
            "status": "complete",
            "layout": profile.name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "database": {
                "service": "postgres",
                "user": profile.database_user,
                "name": profile.database_name,
            },
            "images": images,
            "stores": stores,
            "files": inventory(staging),
            "deletion_ledger": "unavailable",
            "execution_journal": "not_reconciled",
            "recovery_program_sha256": sha256(Path(__file__)),
            "recovery_data_sha256": sha256(
                Path(__file__).with_name("recovery_data.py")
            ),
        },
    )
    verify_snapshot(staging)
    final = destination / name
    staging.rename(final)
    sync_directory(destination)
    return final


def restore(snapshot: Path, destination: Path, docker: Docker) -> dict:
    if destination.resolve().is_relative_to(snapshot.resolve()):
        raise RecoveryError(
            "Recovery destination is inside the snapshot; choose a separate new directory."
        )
    manifest = verify_snapshot(snapshot)
    profile = snapshot_profile(manifest)
    database = snapshot_database(manifest, profile)
    # No pulls during recovery, and no Compose from the backup is executed.
    for service in ("pi", "toolgate", "postgres"):
        docker.run("image", "inspect", manifest["images"][service]["id"])
    destination.mkdir(parents=True, mode=0o700, exist_ok=False)
    project = "conker-recovery-" + uuid.uuid4().hex[:12]
    state = {
        "format": RECOVERY_FORMAT,
        "recovery_id": uuid.uuid4().hex,
        "project": project,
        "status": "creating",
        "outbound": "disabled",
        "applications_started": False,
        "snapshot": str(snapshot),
        "snapshot_manifest_sha256": sha256(snapshot / "manifest.json"),
        "source_layout": profile.name,
        "database": database,
        "review_nonce": uuid.uuid4().hex,
        "blockers": BLOCKERS,
        "volumes": {},
        "containers": [],
        "invalidated_requests": [],
        "unfinished_turns": [],
    }
    state_path = destination / HOLD_FILE
    write_json(state_path, state)
    images = manifest["images"]
    try:
        shutil.copytree(snapshot / "config", destination / "recovered-config")
        for store in (*manifest["stores"], "memorygate-runtime", "postgres"):
            volume = project + "-" + store
            state["volumes"][store] = volume
            write_json(state_path, state)
            docker.run(
                "volume", "create", "--label", "conker.recovery=" + project, volume
            )
        for store in manifest["stores"]:
            with (snapshot / (store + ".tar")).open("rb") as source:
                helper(
                    docker,
                    images["pi"]["id"],
                    "restore-tree",
                    {"type": "volume", "source": state["volumes"][store]},
                    input=source,
                )
        if "gateway" in manifest["stores"]:
            state.update(json.loads(helper(
                docker, images["pi"]["id"], "hold-gateway",
                {"type": "volume", "source": state["volumes"]["gateway"]},
            ).stdout))
            write_json(state_path, state)
        # Runtime recovery material gets its own volume; never recreate the
        # original container before extracting this currently unmounted key.
        runtime_tar = destination / "memorygate-runtime.tar"
        from recovery_data import snapshot_tree

        with runtime_tar.open("wb") as output:
            snapshot_tree(snapshot / "memorygate", output)
        with runtime_tar.open("rb") as source:
            helper(
                docker,
                images["pi"]["id"],
                "restore-tree",
                {"type": "volume", "source": state["volumes"]["memorygate-runtime"]},
                input=source,
            )
        toolgate_mount = {"type": "volume", "source": state["volumes"]["toolgate"]}
        state.update(
            json.loads(
                helper(
                    docker, images["toolgate"]["id"], "hold-toolgate", toolgate_mount
                ).stdout
            )
        )
        state["unfinished_turns"] = json.loads(
            helper(
                docker,
                images["pi"]["id"],
                "inspect-pi",
                {"type": "volume", "source": state["volumes"]["pi"], "readonly": True},
            ).stdout
        )
        state.update(
            json.loads(
                helper(
                    docker,
                    images["toolgate"]["id"],
                    "verify-vault",
                    {**toolgate_mount, "readonly": True},
                    snapshot=snapshot,
                ).stdout
            )
        )
        state.update(
            json.loads(
                helper(
                    docker,
                    images["toolgate"]["id"],
                    "verify-memory-key",
                    {
                        "type": "volume",
                        "source": state["volumes"]["memorygate-runtime"],
                        "readonly": True,
                    },
                ).stdout
            )
        )
        postgres = project + "-postgres"
        state["containers"].append(postgres)
        write_json(state_path, state)
        credential = destination / "postgres.env"
        credential.write_text(
            "POSTGRES_USER=" + database["user"]
            + "\nPOSTGRES_DB=" + database["name"]
            + "\nPOSTGRES_PASSWORD="
            + uuid.uuid4().hex
            + "\n"
        )
        credential.chmod(0o600)
        docker.run(
            "run",
            "-d",
            "--pull",
            "never",
            "--name",
            postgres,
            "--network",
            "none",
            "--log-driver",
            "local",
            "--restart",
            "no",
            "--label",
            "conker.recovery=" + project,
            "--env-file",
            str(credential),
            "--mount",
            "type=volume,src="
            + state["volumes"]["postgres"]
            + ",dst=/var/lib/postgresql/data",
            images["postgres"]["id"],
        )
        wait_postgres(docker, postgres, database["user"], database["name"])
        with (snapshot / "memorygate.dump").open("rb") as source:
            docker.run(
                "exec",
                "-i",
                postgres,
                "pg_restore",
                "-U",
                database["user"],
                "-d",
                database["name"],
                "--exit-on-error",
                "--single-transaction",
                "--no-owner",
                "--no-privileges",
                input=source,
            )
        # Even pending local analysis could recreate forgotten material. Park it
        # before any future application startup; preserve its previous state.
        jobs = docker.run(
            "exec",
            postgres,
            "psql",
            "-U",
            database["user"],
            "-d",
            database["name"],
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "SELECT COALESCE(json_agg(json_build_object('id',id,'status',status)), '[]'::json) "
            "FROM processing_jobs WHERE status NOT IN ('completed','failed')",
        ).stdout
        state["held_memory_jobs"] = json.loads(jobs)
        docker.run(
            "exec",
            postgres,
            "psql",
            "-U",
            database["user"],
            "-d",
            database["name"],
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "UPDATE processing_jobs SET status='recovery_held' WHERE status NOT IN ('completed','failed')",
        )
        docker.run("stop", postgres)
        state["status"] = "held"
        state["restored_at"] = utc_now().isoformat()
        state["restore_fingerprint"] = recovery_fingerprint(state)
        write_json(state_path, state)
        return state
    except BaseException:
        state["status"] = "interrupted"
        write_json(state_path, state)
        # Every helper has network=none; a process kill cannot briefly expose
        # an application while a cleanup handler tries to put the fence back.
        raise


def _bounded_text(value: Any, field: str, limit: int = 1000) -> str:
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value) > limit
        or any(ord(character) < 32 for character in value)
    ):
        raise RecoveryError(f"Review {field} must be non-empty bounded text without control characters.")
    return value


def validate_review(review: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    expected_keys = {
        "format",
        "recovery_id",
        "review_nonce",
        "snapshot_manifest_sha256",
        "operator",
        "reviewed_at",
        "expires_at",
        "attestations",
    }
    if set(review) != expected_keys:
        raise RecoveryError("Review fields do not match the exact recovery review schema.")
    bindings = {
        "format": REVIEW_FORMAT,
        "recovery_id": state["recovery_id"],
        "review_nonce": state["review_nonce"],
        "snapshot_manifest_sha256": state["snapshot_manifest_sha256"],
    }
    if any(review.get(key) != value for key, value in bindings.items()):
        raise RecoveryError("Review evidence is stale or belongs to a different restore.")
    _bounded_text(review["operator"], "operator", 200)
    reviewed_at = parse_timestamp(review["reviewed_at"], "reviewed_at")
    expires_at = parse_timestamp(review["expires_at"], "expires_at")
    restored_at = parse_timestamp(state["restored_at"], "restore restored_at")
    now = utc_now()
    if reviewed_at < restored_at or reviewed_at > now + timedelta(minutes=5):
        raise RecoveryError("Review timestamp predates this restore or is in the future.")
    if expires_at <= now or expires_at > reviewed_at + timedelta(days=30):
        raise RecoveryError("Review evidence is expired or has an excessive validity window.")
    attestations = review.get("attestations")
    if not isinstance(attestations, dict) or set(attestations) != set(REVIEW_CHECKS):
        raise RecoveryError("Review must contain every required attestation and no unknown checks.")
    for name, required_status in REVIEW_CHECKS.items():
        item = attestations[name]
        if not isinstance(item, dict) or set(item) != {"status", "evidence_sha256"}:
            raise RecoveryError(f"Review attestation {name} has an invalid schema.")
        if item["status"] != required_status:
            raise RecoveryError(f"Review attestation {name} is not {required_status}.")
        if not re.fullmatch(r"[0-9a-f]{64}", item["evidence_sha256"]):
            raise RecoveryError(f"Review attestation {name} requires a lowercase SHA-256 digest.")
    return review


def review_recovery(directory: Path, review_path: Path) -> dict[str, Any]:
    directory = directory.resolve()
    with recovery_lock(directory):
        state_path, state = load_recovery(directory)
        if state["status"] == "service_ready":
            raise RecoveryError("Recovery is already service-ready; its review cannot be replaced.")
        if state["status"] == "aborted":
            raise RecoveryError("Recovery was aborted and cannot be reviewed.")
        if state["status"] not in {"held", "reviewed", "readiness_interrupted"}:
            raise RecoveryError(f"Recovery cannot be reviewed from status {state['status']!r}.")
        review = validate_review(read_json_file(review_path, "Operator review"), state)
        receipt_path = receipts_directory(directory) / "operator-review.json"
        digest = canonical_sha256(review)
        if state.get("review_receipt_sha256"):
            if state["review_receipt_sha256"] != digest:
                raise RecoveryError("A different operator review is already bound to this restore.")
            stored = read_json_file(receipt_path, "Stored operator review")
            if canonical_sha256(stored) != digest:
                raise RecoveryError("Stored operator review was changed; keep the recovery held.")
            return state
        write_json(receipt_path, review)
        state["review_receipt"] = receipt_path.relative_to(directory).as_posix()
        state["review_receipt_sha256"] = digest
        state["status"] = "reviewed"
        state["resolved_restore_blockers"] = list(BLOCKERS)
        state["blockers"] = ["Service readiness proof is pending."]
        write_json(state_path, state)
        return state


def _inspect_isolated_resources(state: dict[str, Any], docker: Docker) -> dict[str, Any]:
    project = state["project"]
    volumes: dict[str, str] = {}
    for store, name in sorted(state["volumes"].items()):
        details = docker.json("volume", "inspect", name)
        if len(details) != 1 or details[0].get("Labels", {}).get("conker.recovery") != project:
            raise RecoveryError(f"Recovery volume for {store} is missing or has an invalid ownership label.")
        volumes[store] = name
    containers: dict[str, str] = {}
    for name in state["containers"]:
        details = docker.json("inspect", name)
        if len(details) != 1:
            raise RecoveryError("Recovery container inventory is ambiguous.")
        container = details[0]
        host = container.get("HostConfig", {})
        labels = container.get("Config", {}).get("Labels") or {}
        if labels.get("conker.recovery") != project:
            raise RecoveryError("Recovery container has an invalid ownership label.")
        if host.get("NetworkMode") != "none" or host.get("PortBindings"):
            raise RecoveryError("Recovery container is no longer isolated; keep the hold.")
        if container.get("State", {}).get("Running"):
            raise RecoveryError("Recovery container must be stopped before readiness proof.")
        containers[name] = container.get("Image", "")
    return {"volumes": volumes, "containers": containers}


def _verify_review_receipt(directory: Path, state: dict[str, Any]) -> dict[str, Any]:
    relative = state.get("review_receipt")
    if relative != f"{RECEIPTS_DIR}/operator-review.json":
        raise RecoveryError("Operator review receipt path is missing or invalid.")
    review = read_json_file(
        receipts_directory(directory) / "operator-review.json", "Stored operator review"
    )
    validate_review(review, state)
    if canonical_sha256(review) != state.get("review_receipt_sha256"):
        raise RecoveryError("Stored operator review was changed; keep the recovery held.")
    return review


def prove_service_ready(directory: Path, docker: Docker) -> dict[str, Any]:
    directory = directory.resolve()
    with recovery_lock(directory):
        state_path, state = load_recovery(directory)
        if state["status"] == "aborted":
            raise RecoveryError("Aborted recovery cannot become service-ready.")
        if state["status"] == "service_ready":
            receipt = read_json_file(
                receipts_directory(directory) / "service-ready.json", "Service-ready receipt"
            )
            if canonical_sha256(receipt) != state.get("service_ready_receipt_sha256"):
                raise RecoveryError("Service-ready receipt was changed; keep the hold and investigate.")
            return state
        if state["status"] not in {"reviewed", "readiness_interrupted"}:
            raise RecoveryError("Recovery requires a valid operator review before readiness proof.")
        state["status"] = "checking_readiness"
        state.pop("last_failure", None)
        write_json(state_path, state)
        postgres = state["containers"][0] if len(state["containers"]) == 1 else None
        try:
            _verify_review_receipt(directory, state)
            snapshot = Path(state["snapshot"])
            manifest = verify_snapshot(snapshot)
            profile = snapshot_profile(manifest)
            database = snapshot_database(manifest, profile)
            if state.get("source_layout", profile.name) != profile.name or state.get(
                "database", database
            ) != database:
                raise RecoveryError("Recovery hold database identity changed after restore.")
            if sha256(snapshot / "manifest.json") != state["snapshot_manifest_sha256"]:
                raise RecoveryError("Snapshot manifest no longer matches this restore.")
            for image in manifest["images"].values():
                docker.run("image", "inspect", image["id"])
            resources = _inspect_isolated_resources(state, docker)
            if (
                postgres is None
                or resources["containers"].get(postgres)
                != manifest["images"]["postgres"]["id"]
            ):
                raise RecoveryError("Recovery PostgreSQL container image identity changed.")
            toolgate_mount = {
                "type": "volume",
                "source": state["volumes"]["toolgate"],
                "readonly": True,
            }
            vault = json.loads(
                helper(
                    docker,
                    manifest["images"]["toolgate"]["id"],
                    "verify-vault",
                    toolgate_mount,
                    snapshot=snapshot,
                ).stdout
            )
            memory = json.loads(
                helper(
                    docker,
                    manifest["images"]["toolgate"]["id"],
                    "verify-memory-key",
                    {
                        "type": "volume",
                        "source": state["volumes"]["memorygate-runtime"],
                        "readonly": True,
                    },
                ).stdout
            )
            turns = json.loads(
                helper(
                    docker,
                    manifest["images"]["pi"]["id"],
                    "inspect-pi",
                    {"type": "volume", "source": state["volumes"]["pi"], "readonly": True},
                ).stdout
            )
            if vault.get("vault_values_verified") != state.get("vault_values_verified"):
                raise RecoveryError("Recovered vault proof changed after restore.")
            if memory.get("memory_provider_key_verified") is not True:
                raise RecoveryError("Recovered MemoryGate key cannot decrypt its provider token.")
            if turns != state.get("unfinished_turns"):
                raise RecoveryError("Recovered Pi unfinished-work evidence changed after restore.")
            docker.run("start", postgres)
            try:
                wait_postgres(
                    docker, postgres, database["user"], database["name"]
                )
                unheld = docker.run(
                    "exec",
                    postgres,
                    "psql",
                    "-U",
                    database["user"],
                    "-d",
                    database["name"],
                    "-At",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-c",
                    "SELECT count(*) FROM processing_jobs WHERE status NOT IN ('completed','failed','recovery_held')",
                ).stdout.strip()
                if unheld != b"0":
                    raise RecoveryError("Recovered MemoryGate jobs are not all held.")
            finally:
                docker.run("stop", postgres)
            receipt = {
                "format": READY_FORMAT,
                "recovery_id": state["recovery_id"],
                "restore_fingerprint": state["restore_fingerprint"],
                "snapshot_manifest_sha256": state["snapshot_manifest_sha256"],
                "review_receipt_sha256": state["review_receipt_sha256"],
                "proved_at": utc_now().isoformat(),
                "resources": resources,
                "applications_started": False,
                "live_install_modified": False,
                "promotion": "requires a separate explicit operator-authorized deployment",
            }
            receipt_path = receipts_directory(directory) / "service-ready.json"
            write_json(receipt_path, receipt)
            state["service_ready_receipt"] = receipt_path.relative_to(directory).as_posix()
            state["service_ready_receipt_sha256"] = canonical_sha256(receipt)
            state["status"] = "service_ready"
            state["blockers"] = []
            write_json(state_path, state)
            return state
        except BaseException as exc:
            state["status"] = "readiness_interrupted" if not isinstance(exc, Exception) else "reviewed"
            state["last_failure"] = (
                str(exc)[:500] if isinstance(exc, RecoveryError) else type(exc).__name__
            )
            state["blockers"] = ["Service readiness proof is pending."]
            write_json(state_path, state)
            raise


def abort_recovery(directory: Path, reason: str, docker: Docker) -> dict[str, Any]:
    directory = directory.resolve()
    reason = _bounded_text(reason, "abort reason", 500)
    with recovery_lock(directory):
        state_path, state = load_recovery(directory)
        if state["status"] == "aborted":
            return state
        if state["status"] in {"creating", "checking_readiness"}:
            raise RecoveryError("Recovery is mid-operation; inspect it before requesting abort.")
        resuming = state["status"] in {"aborting", "abort_interrupted"}
        state["status"] = "aborting"
        state["abort_reason"] = reason
        state.setdefault("removed_containers", [])
        state.setdefault("removed_volumes", [])
        write_json(state_path, state)
        try:
            project = state["project"]
            for name in state["containers"]:
                if name in state["removed_containers"]:
                    continue
                result = docker.run("inspect", name, check=False)
                if result.returncode:
                    if not resuming:
                        raise RecoveryError("Recovery container disappeared before abort began.")
                    state["removed_containers"].append(name)
                    write_json(state_path, state)
                    continue
                details = json.loads(result.stdout)
                labels = details[0].get("Config", {}).get("Labels") or {}
                if labels.get("conker.recovery") != project:
                    raise RecoveryError("Refusing to remove a container without the exact recovery label.")
                docker.run("rm", "-f", name)
                state["removed_containers"].append(name)
                write_json(state_path, state)
            for name in state["volumes"].values():
                if name in state["removed_volumes"]:
                    continue
                result = docker.run("volume", "inspect", name, check=False)
                if result.returncode:
                    if not resuming:
                        raise RecoveryError("Recovery volume disappeared before abort began.")
                    state["removed_volumes"].append(name)
                    write_json(state_path, state)
                    continue
                details = json.loads(result.stdout)
                if details[0].get("Labels", {}).get("conker.recovery") != project:
                    raise RecoveryError("Refusing to remove a volume without the exact recovery label.")
                docker.run("volume", "rm", name)
                state["removed_volumes"].append(name)
                write_json(state_path, state)
            state["status"] = "aborted"
            state["aborted_at"] = utc_now().isoformat()
            state["resources_removed"] = True
            state["blockers"] = ["Recovery was aborted; no promotion is permitted."]
            write_json(state_path, state)
            return state
        except BaseException as exc:
            state["status"] = "abort_interrupted"
            state["last_failure"] = (
                str(exc)[:500] if isinstance(exc, RecoveryError) else type(exc).__name__
            )
            write_json(state_path, state)
            raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    commands = parser.add_subparsers(dest="command", required=True)
    backup_parser = commands.add_parser("backup")
    backup_parser.add_argument("--destination", type=Path)
    restore_parser = commands.add_parser("restore")
    restore_parser.add_argument("snapshot", type=Path)
    restore_parser.add_argument("--into", required=True, type=Path)
    verify_parser = commands.add_parser("verify-backup")
    verify_parser.add_argument("snapshot", type=Path)
    status_parser = commands.add_parser("recovery-status")
    status_parser.add_argument("directory", type=Path)
    status_actions = status_parser.add_mutually_exclusive_group()
    status_actions.add_argument("--review", type=Path, metavar="REVIEW_JSON")
    status_actions.add_argument("--prove-ready", action="store_true")
    status_actions.add_argument("--abort", metavar="REASON")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.command == "backup":
            path = backup(args.root.resolve(), args.destination, Docker())
            print(
                f"Verified snapshot: {path}\nContains credentials and decryption keys. Copy it to an encrypted, separate destination."
            )
        elif args.command == "verify-backup":
            verify_snapshot(args.snapshot.resolve())
            print(
                "Snapshot files verified. This is an integrity check, not a successful restore drill."
            )
        elif args.command == "restore":
            state = restore(args.snapshot.resolve(), args.into.resolve(), Docker())
            print(
                f"Data restored into isolation; recovery is HELD. No applications started.\nReport: {args.into / HOLD_FILE}"
            )
            for reason in state["blockers"]:
                print(reason)
            return 3
        else:
            if args.review:
                state = review_recovery(args.directory, args.review)
                print("Operator review recorded; recovery remains HELD pending readiness proof.")
                return 3
            if args.prove_ready:
                state = prove_service_ready(args.directory, Docker())
                print(
                    "Recovery is SERVICE-READY. The live installation was not modified; "
                    f"receipt: {args.directory / RECEIPTS_DIR / 'service-ready.json'}"
                )
                return 0
            if args.abort:
                state = abort_recovery(args.directory, args.abort, Docker())
                print("Recovery aborted; isolated resources were removed and the hold report was retained.")
                return 3
            state = read_json_file(args.directory / HOLD_FILE, "Recovery hold")
            if state.get("format") == RECOVERY_FORMAT:
                _, state = load_recovery(args.directory, require_complete=False)
            print(json.dumps(state, indent=2))
            return 0 if state.get("status") == "service_ready" else 3
        return 0
    except Exception as exc:  # noqa: BLE001 - sanitize every failure at the CLI boundary
        message = str(exc) if isinstance(exc, RecoveryError) else type(exc).__name__
        print(
            f"Recovery failed: {message}\nNo recovery was promoted. Retain partial files and inspect the hold report before retrying.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
