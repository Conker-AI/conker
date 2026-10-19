"""Coordinated backup: provider state, configuration capture and the snapshot itself."""

from __future__ import annotations

import json
import os
import re
import sys
import tarfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from recovery_data import RecoveryError, safe_member
from recovery_docker import Docker, helper, mount_at
from recovery_layout import (
    FORMAT,
    HOLD_FILE,
    PROVIDER_IDS,
    PROVIDER_STATE_FIELDS,
    UBUNTU_ENV_FILES,
    LayoutProfile,
    compose_command,
    copy_bounded_regular,
    detect_layout,
    sha256,
    sync_directory,
    write_json,
)
from recovery_snapshot import (
    inventory,
    operation_lock,
    valid_service_inventory,
    verify_snapshot,
)


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
