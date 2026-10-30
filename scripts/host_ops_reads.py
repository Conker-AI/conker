"""The host helper's read-only facts: Compose service state and the backup folder (ADR-0014).

Each read runs a fixed argv and keeps only a few named fields. Docker's inspect output also holds
every container's environment, so nothing from it leaves except what is projected here.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

SERVICE = re.compile(r"[a-z][a-z0-9-]{0,62}")
SNAPSHOT = re.compile(r"snapshot-(\d{8})T(\d{6})Z-[0-9a-f]{8}")
PARTIAL = re.compile(r"\.snapshot-\d{8}T\d{6}Z-[0-9a-f]{8}\.partial")
CONTAINER = re.compile(r"[0-9a-f]{64}")
STARTED_AT = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z")
STATES = {"created", "running", "restarting", "paused", "exited", "removing", "dead"}
HEALTH = {"healthy", "unhealthy", "starting"}
PROJECT = "conker"  # the Compose project name of both layouts
BACKUP_LOCK = ".conker-backup.lock"
RECOVERY_HOLD = ".conker-recovery.json"


def read_command(argv, *, cwd, env, timeout, limit) -> bytes:
    result = subprocess.run(
        argv,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=timeout,
        check=False,
    )
    if result.returncode != 0 or len(result.stdout) > limit:
        raise OSError("read failed")
    return result.stdout


def containers(read) -> list[dict]:
    """One row per Compose service container. `read(argv, limit)` returns its stdout."""
    listing = read(
        [
            "docker",
            "ps",
            "--all",
            "--quiet",
            "--no-trunc",
            "--filter",
            f"label=com.docker.compose.project={PROJECT}",
        ],
        64 * 80,
    )
    ids = listing.decode("ascii").split()
    if len(ids) > 64 or any(not CONTAINER.fullmatch(item) for item in ids):
        raise ValueError("unexpected container list")
    if not ids:
        return []
    data = json.loads(read(["docker", "inspect", "--type", "container", *ids], 8 << 20))
    if not isinstance(data, list):
        raise TypeError("unexpected inspect output")
    rows = []
    for item in data:
        if not isinstance(item, dict):
            continue
        config, state = item.get("Config") or {}, item.get("State") or {}
        labels = config.get("Labels") or {}
        service = labels.get("com.docker.compose.service")
        if labels.get("com.docker.compose.oneoff") == "True" or not (
            isinstance(service, str) and SERVICE.fullmatch(service)
        ):
            continue
        status, since = state.get("Status"), state.get("StartedAt")
        health = (state.get("Health") or {}).get("Status")
        restarts = item.get("RestartCount")
        policy = ((item.get("HostConfig") or {}).get("RestartPolicy") or {}).get("Name")
        running = status == "running" and isinstance(since, str)
        rows.append(
            {
                "service": service,
                "state": status if status in STATES else "unknown",
                "health": health if health in HEALTH else "none",
                "startedAt": since[:19] + "Z"
                if running and STARTED_AT.fullmatch(since)
                else None,
                "restarts": restarts if type(restarts) is int and restarts >= 0 else 0,
                "oneShot": policy in {"no", ""},
            }
        )
    return sorted(rows, key=lambda row: row["service"])


def holds(root: Path) -> dict[str, bool]:
    """The CLI's own guards: these files stop `conker restart`, `start` and `backup` too."""
    return {
        "backupLock": (root / BACKUP_LOCK).exists(),
        "recoveryHeld": (root / RECOVERY_HOLD).exists(),
    }


def backups(root: Path, policy: dict | None) -> dict:
    """The saved backup folder and the verified snapshots in it, newest first."""
    if policy is None:
        return {
            "destination": None,
            "retentionCopies": None,
            "ready": False,
            "separateDisk": None,
            "freeBytes": None,
            "snapshots": [],
            "partialSnapshots": 0,
            **holds(root),
        }
    destination = Path(str(policy["destination"]))
    ready = destination.is_dir() and not destination.is_symlink()
    names = sorted(os.listdir(destination)) if ready else []
    snapshots = [
        {"name": name, "createdAt": created(name)}
        for name in reversed(names)
        if SNAPSHOT.fullmatch(name) and not (destination / name).is_symlink()
    ]
    return {
        "destination": str(destination),
        "retentionCopies": policy["retentionCopies"],
        "ready": ready,
        # A second disk survives the system disk failing, not this computer dying.
        "separateDisk": os.stat(root).st_dev != os.stat(destination).st_dev
        if ready
        else None,
        "freeBytes": shutil.disk_usage(destination).free if ready else None,
        "snapshots": snapshots[:100],
        "partialSnapshots": sum(1 for name in names if PARTIAL.fullmatch(name)),
        **holds(root),
    }


def created(name: str) -> str:
    day, time = SNAPSHOT.fullmatch(name).groups()
    return f"{day[:4]}-{day[4:6]}-{day[6:]}T{time[:2]}:{time[2:4]}:{time[4:]}Z"
