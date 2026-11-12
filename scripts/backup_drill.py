"""conker backup drill: restore one backup into a throwaway copy, check it, then remove the copy.

The drill is the existing isolated restore (recovery_restore.restore) into a fresh folder under the
installation's own state: never the live install, never a volume of the live stack. Restore
already proves the records, the vault and the memory key, and holds every action; the drill adds
that the copy stayed isolated, then removes every container and volume carrying the copy's own
`conker.recovery` label and its folder, in a finally path, even when the restore fails midway. It
compares the live stack's containers and volumes before and after. No application starts and
nothing gets a network.

It runs under the host helper's one-at-a-time lock (ADR-0014), so no server action runs beside it,
and refuses at once, never waits, when that lock, the CLI's backup lock or a held recovery is in
the way, or an update runs or is held, or when free disk is under twice the snapshot's size. A
drill killed before its `finally` ran (SIGKILL, power loss) leaves a `drill-*` folder: the next
drill removes it and the copy its hold file names, and counts it in `swept`. Every attempt leaves a
receipt in the schedule journal: times, snapshot name, outcome, the checks that passed and a plain reason.
Never a secret, a path inside the snapshot or command output.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recovery_data import RecoveryError
from recovery_docker import Docker  # noqa: F401 - the engine backup_cli hands the drill
from recovery_layout import HOLD_FILE
from recovery_restore import _inspect_isolated_resources, restore
from recovery_snapshot import verify_snapshot

from scripts.backup_schedule import UPDATE_BUSY, update_busy, utc_now
from scripts.host_ops_journal import OperationLock
from scripts.host_ops_reads import PROJECT, holds

RECOVERY_PROJECT = re.compile(r"conker-recovery-[0-9a-f]{12}")
DRILL_FOLDER = re.compile(r"drill-[0-9a-f]{12}")
CHECKS = (
    "snapshot verified",
    "records restored",
    "credentials open",
    "actions held",
    "isolated",
    "cleaned up",
    "live stack untouched",
)


class DrillRefused(Exception):
    pass


def snapshot_size(snapshot: Path) -> int:
    return sum(
        path.stat().st_size
        for path in snapshot.rglob("*")
        if path.is_file() and not path.is_symlink()
    )


def docker_root() -> Path | None:
    try:
        result = subprocess.run(
            ["docker", "info", "--format", "{{.DockerRootDir}}"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    value = result.stdout.decode("utf-8", "replace").strip()
    return Path(value) if result.returncode == 0 and value.startswith("/") else None


def free_bytes(workspace: Path) -> int:
    """The least free space where the copy lands: the drill folder and Docker's volumes."""
    free = []
    for path in (workspace, docker_root()):
        try:
            if path is not None:
                free.append(shutil.disk_usage(path).free)
        except OSError:
            continue
    return min(free) if free else 0


def gib(size: int) -> str:
    return f"{size / 2**30:.1f} GB"


def labelled(docker, kind: str, label: str) -> list[str]:
    command = ("ps", "--all", "--quiet") if kind == "containers" else ("volume", "ls", "--quiet")
    return sorted(docker.run(*command, "--filter", f"label={label}").stdout.decode().split())


def live_resources(docker, project: str) -> tuple[list[str], list[str]]:
    label = f"com.docker.compose.project={project}"
    return labelled(docker, "containers", label), labelled(docker, "volumes", label)


def remove_copy(docker, project: str) -> bool:
    """Remove what the restore made: only names carrying this copy's exact label."""
    if not RECOVERY_PROJECT.fullmatch(project):
        return False
    label = f"conker.recovery={project}"
    for container in labelled(docker, "containers", label):
        docker.run("rm", "-f", container)
    for volume in labelled(docker, "volumes", label):
        if not volume.startswith(project + "-"):
            return False
        docker.run("volume", "rm", volume)
    return not labelled(docker, "containers", label) and not labelled(docker, "volumes", label)


def clean_up(work: Path, docker) -> str | None:
    """Remove the copy and its folder. Returns None when nothing is left, else what is."""
    project = None
    left = None
    try:
        state = json.loads((work / "restore" / HOLD_FILE).read_text(encoding="utf-8"))
        project = state.get("project")
    except FileNotFoundError:
        pass  # restore stopped before it made anything
    except (OSError, ValueError):
        left = "unknown containers or volumes labelled conker.recovery"
    try:
        if isinstance(project, str) and not remove_copy(docker, project):
            left = f"containers or volumes labelled conker.recovery={project}"
    except (RecoveryError, OSError, ValueError):
        left = f"containers or volumes labelled conker.recovery={project}"
    shutil.rmtree(work, ignore_errors=True)
    if work.exists():
        left = (left + " and " if left else "") + "the drill folder"
    return left


def sweep(workspace: Path, docker, receipt: dict) -> None:
    """Remove what an earlier drill killed before its own clean-up left behind."""
    stale = [
        path
        for path in sorted(workspace.iterdir())
        if DRILL_FOLDER.fullmatch(path.name) and path.is_dir() and not path.is_symlink()
    ]
    for path in stale:
        left = clean_up(path, docker)
        if left is not None:
            receipt["leftovers"] = left
            raise RecoveryError("An earlier drill left a copy that could not be removed.")
        receipt["swept"] += 1


def prove_copy(state: dict, docker, checks: list[str]) -> None:
    if state.get("status") != "held":
        raise RecoveryError("The restore did not finish.")
    checks.append("records restored")
    if state.get("memory_provider_key_verified") is not True or not isinstance(
        state.get("vault_values_verified"), int
    ):
        raise RecoveryError("The restored credentials did not open.")
    checks.append("credentials open")
    if (
        state.get("applications_started") is not False
        or state.get("outbound") != "disabled"
        or not isinstance(state.get("invalidated_requests"), list)
    ):
        raise RecoveryError("The restored copy did not hold its actions.")
    checks.append("actions held")
    _inspect_isolated_resources(state, docker)
    checks.append("isolated")


def exercise(snapshot: Path, workspace: Path, docker, receipt: dict, live_project: str):
    sweep(workspace, docker, receipt)
    before = live_resources(docker, live_project)
    work = workspace / ("drill-" + uuid.uuid4().hex[:12])
    work.mkdir(mode=0o700)
    checks = receipt["checks"]
    try:
        verify_snapshot(snapshot)
        checks.append("snapshot verified")
        prove_copy(restore(snapshot, work / "restore", docker), docker, checks)
    finally:
        receipt["leftovers"] = clean_up(work, docker)
        if receipt["leftovers"] is None:
            checks.append("cleaned up")
    if receipt["leftovers"] is not None:
        raise RecoveryError("The drill could not remove everything it made.")
    if live_resources(docker, live_project) != before:
        raise RecoveryError("The live Conker containers or volumes changed during the drill.")
    checks.append("live stack untouched")


def refuse_when_busy(
    root: Path, snapshot: Path, workspace: Path, free, checkouts: tuple[Path, ...]
) -> None:
    state = holds(root)
    if state["recoveryHeld"]:
        raise DrillRefused("A recovery is held. Finish or abort it with conker recovery-status first.")
    if state["backupLock"]:
        raise DrillRefused("A backup is running or was cut off. Check the backup folder first.")
    if update_busy(root, *checkouts):
        raise DrillRefused(UPDATE_BUSY)
    if snapshot.is_symlink() or not snapshot.is_dir():
        raise DrillRefused("That backup is not there. Check that the backup disk is mounted.")
    need, have = 2 * snapshot_size(snapshot), free(workspace)
    if have < need:
        raise DrillRefused(
            f"Not enough free disk: the drill needs about {gib(need)} and {gib(have)} is free."
        )


def new_receipt(snapshot: str | None, source: str) -> dict:
    return {
        "v": 1,
        "kind": "drill",
        "id": "drill-" + uuid.uuid4().hex[:16],
        "source": source,
        "snapshot": snapshot,
        "startedAt": utc_now(),
        "endedAt": None,
        "durationSeconds": 0,
        "outcome": "failed",
        "checks": [],
        "leftovers": None,
        "swept": 0,
        "reason": None,
    }


def drill(
    root: Path,
    snapshot: Path,
    workspace: Path,
    lock: OperationLock,
    docker,
    *,
    source: str = "cli",
    live_project: str = PROJECT,
    free=free_bytes,
    checkouts: tuple[Path, ...] = (),
    announce=None,
) -> dict:
    """`announce(receipt)` runs once the drill is cleared to start; the same receipt dict then
    fills in, so a caller that sees an interrupt still has its checks and leftovers."""
    receipt = new_receipt(snapshot.name, source)
    start = time.monotonic()
    try:
        if not lock.acquire():
            raise DrillRefused("Another server action is running. Try again after it finishes.")
        try:
            refuse_when_busy(root, snapshot, workspace, free, checkouts)
            if announce is not None:
                announce(receipt)
            exercise(snapshot, workspace, docker, receipt, live_project)
            receipt["outcome"] = "passed"
        finally:
            lock.release()
    except DrillRefused as error:
        receipt.update(outcome="refused", reason=str(error))
    except RecoveryError as error:
        receipt["reason"] = str(error)[:500]
    except Exception as error:  # noqa: BLE001 - a receipt holds the type, never the text
        receipt["reason"] = f"The drill stopped on an unexpected {type(error).__name__}."
    receipt["durationSeconds"] = round(time.monotonic() - start)
    receipt["endedAt"] = utc_now()
    return receipt


def finished(receipt: dict, outcome: str, reason: str) -> dict:
    """A drill that never reached the snapshot: no backup to drill, or none could be found."""
    return {**receipt, "outcome": outcome, "reason": reason, "endedAt": utc_now()}
