"""Backups on a schedule: systemd user timers for the nightly backup and the weekly drill.

`conker backup schedule on|off|status` writes, enables and removes the timers; nothing turns them
on by itself. Each timer starts a oneshot service that runs `scheduled backup` or `scheduled
drill` (scripts/backup_cli.py). The nightly backup is the host helper's own `backup.run`
(ADR-0014): the same fixed command, the same one-at-a-time lock and the same receipt as the UI's
Back up now, so it refuses at once, never waits, while another action, a backup or a held recovery
is in the way, or while an update runs or is held. Every scheduled run, refused or skipped too,
leaves one line in the schedule journal, which `status` reads back.

Stopping a unit (sign-out without lingering, shutdown, `systemctl --user stop`) sends SIGINT to
every process in it, so the backup's own `finally` restarts the services it stopped and removes its
lock, and the drill removes its copy, before systemd's SIGKILL after STOP_TIMEOUT.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

from scripts.host_ops import HostOps, HostOpsError
from scripts.host_ops_journal import Journal
from scripts.provider_control_install import quoted, working_directory
from scripts.update_core import update_running

BACKUP_AT = "*-*-* 03:30:00"  # local time, then up to RANDOM_DELAY later
DRILL_AT = "Sun *-*-* 05:00:00"
RANDOM_DELAY = "30min"
STOP_TIMEOUT = "15min"  # time to restart stopped services or remove a drill copy when stopped
NO_DESTINATION = "No backup destination is saved, so nothing ran. Choose one with conker setup."
UPDATE_BUSY = "An update is running or held. Let it finish, or resolve it, then try again."
NO_LINGER = (
    "Timers would run only while you are signed in, and stop when you sign out. "
    "Turn lingering on first: sudo loginctl enable-linger $USER"
)
# scripts/update.py keeps these in `git rev-parse --git-path conker-update`, the Ubuntu layout's
# scripts/update_ubuntu.py in <deployment>/state/update (a test pins the names).
UPDATE_MARKERS = ("update.lock", "active.json", "HOLD.json")


class ScheduleError(ValueError):
    pass


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def state_directory(root: Path, layout: str) -> Path:
    """The schedule journal and drill folders; outside every Docker volume and every snapshot."""
    directory = root / ("state" if layout == "ubuntu" else ".conker") / "backup-schedule"
    if directory.is_symlink():
        raise ScheduleError("The backup schedule folder must be a real folder.")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name == "posix":
        directory.chmod(0o700)
    return directory


def journal(root: Path, layout: str) -> Journal:
    return Journal(state_directory(root, layout))


def last_record(log: Journal, kind: str) -> dict | None:
    """The newest readable line of one kind; a torn or foreign line is skipped."""
    try:
        lines = log.path.read_bytes().splitlines()
    except FileNotFoundError:
        return None
    for line in reversed(lines):
        try:
            record = json.loads(line)
        except (UnicodeError, ValueError):
            continue
        if isinstance(record, dict) and record.get("v") == 1 and record.get("kind") == kind:
            return record
    return None


def unit_names(root: Path) -> dict[str, str]:
    """One set per installation, named like the provider-control service."""
    tag = hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:12]
    return {kind: f"conker-{kind}-{tag}" for kind in ("backup", "drill")}


def unit_texts(kind: str, root: Path, source: Path, layout: str) -> tuple[str, str]:
    """The oneshot service and its timer. A oneshot has no start timeout, and a backup needs none."""
    name = unit_names(root)[kind]
    arguments = [
        "/usr/bin/python3",
        "-m",
        "scripts.backup_cli",
        "--root",
        str(root),
        "--source",
        str(source),
        "--layout",
        layout,
        "scheduled",
        kind,
    ]
    title = "Conker nightly backup" if kind == "backup" else "Conker weekly restore drill"
    service = (
        f"[Unit]\nDescription={title}\n\n[Service]\nType=oneshot\n"
        f"WorkingDirectory={working_directory(source)}\n"
        f"ExecStart={' '.join(map(quoted, arguments))}\n"
        "UMask=0077\nNoNewPrivileges=true\nNice=10\nIOSchedulingClass=idle\n"
        # Python runs `finally` on SIGINT, not on the default SIGTERM: every process in the unit
        # (the backup itself too) cleans up before the SIGKILL that follows STOP_TIMEOUT.
        f"KillMode=control-group\nKillSignal=SIGINT\nTimeoutStopSec={STOP_TIMEOUT}\n"
    )
    timer = (
        f"[Unit]\nDescription={title}\n\n[Timer]\n"
        f"OnCalendar={BACKUP_AT if kind == 'backup' else DRILL_AT}\n"
        f"RandomizedDelaySec={RANDOM_DELAY}\nPersistent=true\nUnit={name}.service\n\n"
        "[Install]\nWantedBy=timers.target\n"
    )
    return service, timer


def systemctl(*arguments: str) -> subprocess.CompletedProcess:
    environment = {**os.environ}
    if hasattr(os, "getuid"):
        environment.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    return subprocess.run(
        ["systemctl", "--user", *arguments],
        env=environment,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


class Schedule:
    def __init__(
        self,
        root: Path,
        source: Path,
        layout: str,
        *,
        run=systemctl,
        unit_directory: Path | None = None,
        platform: str = sys.platform,
        which=shutil.which,
        linger=None,
    ):
        if layout not in {"ubuntu", "repository"}:
            raise ScheduleError("Unknown installation layout.")
        self.root, self.source, self.layout = root.resolve(), source.resolve(), layout
        self.run, self.platform, self.which = run, platform, which
        self.units = unit_directory or Path.home() / ".config/systemd/user"
        self.names = unit_names(self.root)
        self.read_linger = linger or self._read_linger

    def supported(self) -> bool:
        return self.platform.startswith("linux") and self.which("systemctl") is not None

    def require_systemd(self) -> None:
        if not self.supported():
            raise ScheduleError(
                "Backups on a schedule need Linux with a systemd user session. "
                "Here, run conker setup run protection yourself."
            )

    def _paths(self, kind: str) -> tuple[Path, Path]:
        name = self.names[kind]
        return self.units / f"{name}.service", self.units / f"{name}.timer"

    def _systemctl(self, *arguments: str) -> None:
        if self.run(*arguments).returncode != 0:
            raise ScheduleError(
                f"systemctl --user {arguments[0]} failed. Check that a user session is running."
            )

    def _write(self, kind: str) -> None:
        self.units.mkdir(parents=True, exist_ok=True)
        for path, text in zip(
            self._paths(kind), unit_texts(kind, self.root, self.source, self.layout), strict=False
        ):
            if path.is_symlink():
                raise ScheduleError("Timer and service units must be regular files.")
            path.write_text(text, encoding="utf-8")
            if os.name == "posix":
                path.chmod(0o600)

    def _remove(self, kind: str) -> bool:
        service, timer = self._paths(kind)
        if not (service.exists() or timer.exists()):
            return False
        if timer.exists():
            self.run("disable", "--now", timer.name)
        for path in (timer, service):
            path.unlink(missing_ok=True)
        return True

    def on(self, drill: str | None = None) -> dict:
        """Write and enable the nightly timer; `drill` is "weekly", "off" or None (unchanged)."""
        self.require_systemd()
        if self.lingering() is False:
            raise ScheduleError(NO_LINGER)
        self._write("backup")
        # Rewrite a drill timer that is already on, so both follow the current source.
        if drill == "weekly" or (drill is None and self._paths("drill")[1].exists()):
            self._write("drill")
        elif drill == "off":
            self._remove("drill")
        self._systemctl("daemon-reload")
        self._systemctl("enable", "--now", self._paths("backup")[1].name)
        if drill == "weekly":
            self._systemctl("enable", "--now", self._paths("drill")[1].name)
        return self.timers()

    def off(self) -> dict:
        self.require_systemd()
        removed = [self._remove(kind) for kind in ("backup", "drill")]
        if any(removed):
            self._systemctl("daemon-reload")
        return self.timers()

    def timers(self) -> dict:
        rows = {}
        for kind in ("backup", "drill"):
            timer = self._paths(kind)[1]
            enabled = False
            next_run = None
            if self.supported() and timer.exists():
                enabled = self.run("is-enabled", timer.name).stdout.strip() == "enabled"
                shown = self.run(
                    "show", timer.name, "--property=NextElapseUSecRealtime", "--value"
                ).stdout.strip()
                next_run = shown or None
            rows[kind] = {"unit": timer.name, "on": enabled, "next": next_run}
        return rows

    def lingering(self) -> bool | None:
        """Whether user timers run while nobody is logged in; None when it cannot be read."""
        return self.read_linger() if self.supported() else None

    def _read_linger(self) -> bool | None:
        if self.which("loginctl") is None or not hasattr(os, "getuid"):
            return None
        try:
            result = subprocess.run(
                ["loginctl", "show-user", str(os.getuid()), "--property=Linger", "--value"],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        value = result.stdout.strip()
        return {"yes": True, "no": False}.get(value)


def update_directory(checkout: Path) -> Path | None:
    """Where scripts/update.py keeps its lock and hold for this checkout; None when not a checkout."""
    if not (checkout / ".git").exists():
        return None
    try:
        result = subprocess.run(
            ["git", "-C", str(checkout), "rev-parse", "--git-path", "conker-update"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None  # no git, so no update can run either
    value = result.stdout.strip()
    if result.returncode != 0 or not value:
        return None
    path = Path(value)
    return path if path.is_absolute() else checkout / path


def update_busy(*checkouts: Path) -> bool:
    """An update runs, was cut off or is held in one of these checkouts or deployments. Only a live
    update.lock counts: one its holder left behind (a reboot, a killed process) blocks nothing."""
    for checkout in dict.fromkeys(checkouts):
        for directory in (update_directory(checkout), checkout / "state" / "update"):
            if directory and any(_marked(directory, name) for name in UPDATE_MARKERS):
                return True
    return False


def _marked(directory: Path, name: str) -> bool:
    if name == "update.lock":
        return update_running(directory)
    return (directory / name).exists()


def scheduled_backup(host: HostOps, log: Journal, *, now=utc_now) -> int:
    """One nightly run: the helper's backup.run, or a recorded reason why it did not run."""
    record = {"v": 1, "kind": "backup", "at": now(), "operation": None}
    try:
        policy = host.policy()
    except HostOpsError as error:
        log.append({**record, "outcome": "refused", "reason": str(error)})
        return 1
    if policy is None:
        log.append({**record, "outcome": "skipped", "reason": NO_DESTINATION})
        return 0
    if update_busy(host.root, host.source):
        log.append({**record, "outcome": "refused", "reason": UPDATE_BUSY})
        return 1
    identity = "schedule-" + uuid.uuid4().hex
    body = {"id": identity, "operation": "backup.run", "arguments": {}}
    try:
        receipt = host.start(body, source="cli", wait=True)
    except HostOpsError as error:
        log.append({**record, "outcome": "refused", "reason": str(error)})
        return 1
    except KeyboardInterrupt:
        reason = "Stopped before it finished. Check the backup folder and conker status."
        log.append({**record, "operation": identity, "outcome": "failed", "reason": reason})
        raise
    log.append(
        {
            **record,
            "operation": identity,
            "outcome": receipt["outcome"],
            "reason": receipt["reason"],
        }
    )
    return 0 if receipt["outcome"] == "done" else 1
