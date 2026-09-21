"""Conker snapshots and offline, held recovery. Requires Python 3.11+ and Docker.

Recovery deliberately has no promotion command. Today's gates cannot establish
complete deletion history or reconcile all external effects (B3/B6).
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
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO
from urllib.parse import urlsplit

from recovery_data import RecoveryError, safe_member, validate_archive

FORMAT = "conker-snapshot-1"
HOLD_FILE = ".conker-recovery.json"
SERVICES = {
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
STORES = {
    "gateway": "/auth",
    "pi": "/data",
    "toolgate": "/var/lib/toolgate",
    "systemgate": "/app/data",
    "qdrant": "/qdrant/storage",
    "ollama": "/root/.ollama",
}
REQUIRED = {
    *(name + ".tar" for name in STORES),
    "memorygate-backups.tar",
    "memorygate.dump",
    "postgres-globals.sql",
    "config/env",
    "config/versions.env",
    "config/docker-compose.yml",
    "config/compose.json",
    "config/runtime.json",
    "memorygate/runtime-token",
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
    (
        "MemoryGate runtime key persistence needs migration before normal deployment: "
        "the current Compose file does not mount /data/runtime-fernet.key."
    ),
]


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


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


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
    files = manifest.get("files", {})
    has_gateway = "gateway" in manifest.get("images", {})
    required_files = REQUIRED if has_gateway else REQUIRED - {"gateway.tar"}
    if not required_files <= files.keys() or files != inventory(directory):
        raise RecoveryError(
            "Snapshot files are missing, unexpected, or changed; obtain an intact backup."
        )
    images = manifest.get("images", {})
    if images.keys() not in (SERVICES, SERVICES - {"gateway"}) or any(
        not re.fullmatch(r"sha256:[0-9a-f]{64}", image.get("id", ""))
        for image in images.values()
    ):
        raise RecoveryError(
            "Snapshot image identities are invalid; use an intact version manifest."
        )
    stores = manifest.get("stores", {})
    expected_stores = STORES.keys() if has_gateway else STORES.keys() - {"gateway"}
    captured_config = json.loads((directory / "config/compose.json").read_text(encoding="utf-8"))
    if captured_config.get("services", {}).keys() != images.keys():
        raise RecoveryError("Captured services and image inventory disagree; obtain an intact snapshot.")
    if not (expected_stores | {"memorygate-backups"}) <= stores.keys() or any(
        name not in STORES
        and name != "memorygate-backups"
        and not re.fullmatch(r"extra-[a-z]+-[0-9]+", name)
        for name in stores
    ):
        raise RecoveryError(
            "Invalid storage inventory; use an intact snapshot manifest."
        )
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


def wait_postgres(docker: Docker, container: str) -> None:
    # The image briefly runs a temporary server during initdb. Readiness alone
    # can succeed just before that server stops underneath pg_restore.
    probe = 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U memorygate -d memorygate'
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


def backup(root: Path, destination: Path | None, docker: Docker) -> Path:
    if (root / HOLD_FILE).exists() or (Path.cwd() / HOLD_FILE).exists():
        raise RecoveryError(
            "Recovery is held; read conker recovery-status DIRECTORY before starting a backup that would restart writers."
        )
    with operation_lock(root):
        return _backup(root, destination, docker)


def _backup(root: Path, destination: Path | None, docker: Docker) -> Path:
    if not (root / ".env").is_file():
        raise RecoveryError(
            "No installation .env found. For disaster recovery, run conker restore SNAPSHOT --into NEW_DIRECTORY."
        )
    compose = [
        "compose",
        "--project-directory",
        str(root),
        "--env-file",
        str(root / "versions.env"),
        "--env-file",
        str(root / ".env"),
        "-f",
        str(root / "docker-compose.yml"),
    ]
    config = docker.json(*compose, "config", "--format", "json")
    if config["services"].keys() not in (SERVICES, SERVICES - {"gateway"}):
        raise RecoveryError(
            "Unknown Compose services; inventory their authoritative stores before backup."
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
    expected = {
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
    for (service, key), value in expected.items():
        if service not in runtime:
            continue
        if runtime[service].get(key, value) != value:
            raise RecoveryError(
                f"Custom {key} is not covered; add its recovery mapping before backup."
            )
    database_url = runtime["memorygate"].get("DATABASE_URL")
    if database_url:
        parsed = urlsplit(database_url)
        if (
            parsed.hostname != "postgres"
            or parsed.path != "/memorygate"
            or parsed.port not in {None, 5432}
        ):
            raise RecoveryError(
                "MemoryGate uses an unmapped database endpoint; map that authoritative store before backup."
            )
    store_paths = {name: path for name, path in STORES.items() if name in containers}
    for service, path in store_paths.items():
        mounts[service] = mount_at(containers[service], path)
    mounts["pi"]["database"] = "pi.db"
    mounts["toolgate"]["database"] = "toolgate.db"
    if "gateway" in mounts:
        mounts["gateway"]["database"] = "auth.db"
    mounts["memorygate-backups"] = mount_at(containers["memorygate"], "/data/backups")
    stores = {
        name: {"service": name, "destination": path} for name, path in store_paths.items()
    }
    stores["memorygate-backups"] = {
        "service": "memorygate",
        "destination": "/data/backups",
    }
    # Images can declare anonymous volumes absent from Compose (for example
    # search-engine configuration). Inventory them rather than silently omit them.
    excluded = {
        "postgres": {"/var/lib/postgresql/data"},
        "systemgate": {"/var/run/docker.sock", "/host/proc", "/host/root", "/backups"},
        "memorygate": {"/data/runtime-fernet.key"},
    }
    for service, container in containers.items():
        known = {
            item["destination"]
            for item in stores.values()
            if item["service"] == service
        }
        for index, mount in enumerate(container["Mounts"]):
            path = mount["Destination"]
            if path in known | excluded.get(service, set()):
                continue
            if mount["Type"] != "volume":
                raise RecoveryError(
                    f"Unmapped {service} bind mount at {path}; add its recovery mapping before backup."
                )
            name = f"extra-{service}-{index}"
            mounts[name] = mount_at(container, path)
            stores[name] = {"service": service, "destination": path}
    if destination is None:
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
        for name in (
            "pi",
            "toolgate",
            "memorygate",
            "embeddings",
            "systemgate",
            "searxng",
            "ollama",
            "qdrant",
        )
        if containers[name]["State"]["Running"]
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
        for source, target in (
            (".env", "env"),
            ("versions.env", "versions.env"),
            ("docker-compose.yml", "docker-compose.yml"),
        ):
            shutil.copyfile(root / source, staging / "config" / target)
        write_json(staging / "config/compose.json", config)
        write_json(staging / "config/runtime.json", runtime)
        postgres = containers["postgres"]["Id"]
        extra_databases = docker.run(
            "exec",
            postgres,
            "psql",
            "-U",
            "memorygate",
            "-d",
            "memorygate",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres','memorygate')",
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
                "memorygate",
                "--globals-only",
                output=output,
            )
        with (staging / "memorygate.dump").open("wb") as output:
            docker.run(
                "exec",
                postgres,
                "pg_dump",
                "-U",
                "memorygate",
                "-Fc",
                "memorygate",
                output=output,
            )
        token = docker.run(
            "exec",
            postgres,
            "psql",
            "-U",
            "memorygate",
            "-d",
            "memorygate",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "SELECT api_key_encrypted FROM ai_runtime_settings WHERE id='singleton'",
        ).stdout
        (staging / "memorygate/runtime-token").write_bytes(token)
        key_copy = docker.run(
            "cp",
            containers["memorygate"]["Id"] + ":/data/runtime-fernet.key",
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
                    or safe_member(members[0]).name != "runtime-fernet.key"
                ):
                    raise RecoveryError(
                        "Unexpected runtime-key archive; inspect MemoryGate storage."
                    )
                stream = archive.extractfile(members[0])
                assert stream is not None
                (staging / "memorygate/runtime-fernet.key").write_bytes(stream.read())
        elif token.strip() or b"Could not find" not in key_copy.stderr:
            raise RecoveryError(
                "MemoryGate runtime key could not be captured; retain its original container and recover /data/runtime-fernet.key."
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
            "created_at": datetime.now(timezone.utc).isoformat(),
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
    # No pulls during recovery, and no Compose from the backup is executed.
    for service in ("pi", "toolgate", "postgres"):
        docker.run("image", "inspect", manifest["images"][service]["id"])
    destination.mkdir(parents=True, mode=0o700, exist_ok=False)
    state = {
        "format": "conker-recovery-1",
        "status": "creating",
        "outbound": "disabled",
        "applications_started": False,
        "snapshot": str(snapshot),
        "blockers": BLOCKERS,
        "volumes": {},
        "containers": [],
        "invalidated_requests": [],
        "unfinished_turns": [],
    }
    state_path = destination / HOLD_FILE
    write_json(state_path, state)
    project = "conker-recovery-" + uuid.uuid4().hex[:12]
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
            "POSTGRES_USER=memorygate\nPOSTGRES_DB=memorygate\nPOSTGRES_PASSWORD="
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
        wait_postgres(docker, postgres)
        with (snapshot / "memorygate.dump").open("rb") as source:
            docker.run(
                "exec",
                "-i",
                postgres,
                "pg_restore",
                "-U",
                "memorygate",
                "-d",
                "memorygate",
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
            "memorygate",
            "-d",
            "memorygate",
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
            "memorygate",
            "-d",
            "memorygate",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "UPDATE processing_jobs SET status='recovery_held' WHERE status NOT IN ('completed','failed')",
        )
        docker.run("stop", postgres)
        state["status"] = "held"
        write_json(state_path, state)
        return state
    except BaseException:
        state["status"] = "interrupted"
        write_json(state_path, state)
        # Every helper has network=none; a process kill cannot briefly expose
        # an application while a cleanup handler tries to put the fence back.
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
            state = json.loads((args.directory / HOLD_FILE).read_text())
            print(json.dumps(state, indent=2))
            return 3
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
