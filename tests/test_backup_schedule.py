"""Backups on a schedule: the timer and service units, turning them on and off without a real
systemctl, and the nightly run going through the host helper's backup.run with its refusals."""

from __future__ import annotations

import inspect
import json
import subprocess
from pathlib import Path

import pytest

from scripts import backup_cli, update, update_core
from scripts.backup_schedule import (
    NO_DESTINATION,
    UPDATE_BUSY,
    UPDATE_MARKERS,
    Schedule,
    ScheduleError,
    journal,
    last_record,
    scheduled_backup,
    unit_names,
    unit_texts,
    update_directory,
)
from scripts.host_ops_journal import OperationLock
from scripts.provider_control_install import quoted
from tests.test_host_ops import Runner, host

ROOT = Path(__file__).resolve().parents[1]


class Systemctl:
    """Records `systemctl --user` calls; a timer counts as enabled once enabled here."""

    def __init__(self, fail: str | None = None):
        self.calls, self.enabled, self.fail = [], set(), fail

    def __call__(self, *arguments):
        self.calls.append(arguments)
        code, out = 0, ""
        if arguments[0] == self.fail:
            code = 1
        elif arguments[:2] == ("enable", "--now"):
            self.enabled.add(arguments[2])
        elif arguments[:2] == ("disable", "--now"):
            self.enabled.discard(arguments[2])
        elif arguments[0] == "is-enabled":
            out = "enabled" if arguments[1] in self.enabled else "disabled"
        elif arguments[0] == "show":
            out = "Fri 2026-11-13 03:47:12 UTC" if arguments[1] in self.enabled else ""
        return subprocess.CompletedProcess(arguments, code, out, "")


def schedule(tmp_path, systemctl=None, platform="linux", linger=lambda: True):
    return Schedule(
        tmp_path / "deploy",
        tmp_path / "source",
        "ubuntu",
        run=systemctl or Systemctl(),
        unit_directory=tmp_path / "units",
        platform=platform,
        which=lambda name: f"/usr/bin/{name}",
        linger=linger,
    )


def test_units_run_the_scheduled_command_nightly_and_catch_up_after_downtime(tmp_path):
    root, source = tmp_path / "deploy", tmp_path / "source dir"
    service, timer = unit_texts("backup", root, source, "ubuntu")
    name = unit_names(root)["backup"]

    assert "Type=oneshot" in service
    assert (
        f'{quoted(str(root))} "--source" {quoted(str(source))} "--layout" "ubuntu" "scheduled" "backup"'
        in service
    )
    assert f"WorkingDirectory={source}\n" in service
    assert '"-m" "scripts.backup_cli"' in service
    assert "TimeoutStartSec" not in service  # a backup is never cut off half way
    assert "OnCalendar=*-*-* 03:30:00\n" in timer
    assert "RandomizedDelaySec=30min\n" in timer
    assert "Persistent=true\n" in timer
    assert f"Unit={name}.service\n" in timer
    assert "WantedBy=timers.target" in timer
    drill_service, drill_timer = unit_texts("drill", root, source, "ubuntu")
    assert '"scheduled" "drill"' in drill_service
    assert "OnCalendar=Sun *-*-* 05:00:00\n" in drill_timer
    assert unit_names(root) == unit_names(root / ".")
    assert unit_names(root) != unit_names(tmp_path / "other")


def test_schedule_on_is_idempotent_and_the_drill_stays_off_unless_asked(tmp_path):
    systemctl = Systemctl()
    plan = schedule(tmp_path, systemctl)
    names = unit_names(tmp_path / "deploy")

    first = plan.on()
    files = sorted(path.name for path in (tmp_path / "units").iterdir())
    second = plan.on()

    assert first == second
    assert first["backup"]["on"] is True and first["drill"]["on"] is False
    assert first["backup"]["next"] == "Fri 2026-11-13 03:47:12 UTC"
    assert files == [f"{names['backup']}.service", f"{names['backup']}.timer"]
    assert systemctl.calls.count(("daemon-reload",)) == 2
    assert ("enable", "--now", f"{names['backup']}.timer") in systemctl.calls

    assert plan.on("weekly")["drill"]["on"] is True
    assert plan.on()["drill"]["on"] is True  # unchanged without --drill
    assert plan.on("off")["drill"]["on"] is False
    assert not (tmp_path / "units" / f"{names['drill']}.timer").exists()
    assert ("disable", "--now", f"{names['drill']}.timer") in systemctl.calls


def test_schedule_off_disables_and_removes_both_timers(tmp_path):
    systemctl = Systemctl()
    plan = schedule(tmp_path, systemctl)
    plan.on("weekly")

    rows = plan.off()

    assert rows["backup"]["on"] is False and rows["drill"]["on"] is False
    assert list((tmp_path / "units").iterdir()) == []
    assert not systemctl.enabled
    calls = len(systemctl.calls)
    plan.off()  # nothing left: no systemctl change at all
    assert [call for call in systemctl.calls[calls:] if call[0] != "is-enabled"] == []


@pytest.mark.parametrize(
    "platform, which",
    [
        ("win32", lambda name: "C:/x"),
        ("darwin", lambda name: "/bin/x"),
        ("linux", lambda name: None),
    ],
)
def test_schedule_refuses_without_a_linux_systemd_user_session(tmp_path, platform, which):
    systemctl = Systemctl()
    plan = Schedule(
        tmp_path / "deploy",
        tmp_path / "source",
        "repository",
        run=systemctl,
        unit_directory=tmp_path / "units",
        platform=platform,
        which=which,
    )
    for call in (plan.on, plan.off):
        with pytest.raises(ScheduleError, match="systemd user session"):
            call()
    assert systemctl.calls == []
    assert not (tmp_path / "units").exists()
    assert plan.timers()["backup"]["on"] is False


def test_a_failing_systemctl_is_an_error_not_a_quiet_success(tmp_path):
    with pytest.raises(ScheduleError, match="enable failed"):
        schedule(tmp_path, Systemctl(fail="enable")).on()


def test_nightly_run_is_the_helpers_backup_run_with_its_receipt(tmp_path):
    (tmp_path / "backups").mkdir()
    runner = Runner(0)
    ops = host(tmp_path, runner=runner)
    log = journal(ops.root, "ubuntu")

    assert scheduled_backup(ops, log) == 0

    argv = runner.calls[0][0]
    assert argv[-3:] == ["setup", "run", "protection"]
    record = last_record(log, "backup")
    assert record["outcome"] == "done" and record["operation"].startswith("schedule-")
    receipt = ops.receipt(record["operation"])
    assert receipt["operation"] == "backup.run" and receipt["outcome"] == "done"


def test_nightly_run_with_no_destination_does_nothing_and_says_so(tmp_path):
    ops = host(tmp_path, policy=lambda: None)
    log = journal(ops.root, "ubuntu")

    assert scheduled_backup(ops, log) == 0

    assert last_record(log, "backup")["outcome"] == "skipped"
    assert last_record(log, "backup")["reason"] == NO_DESTINATION
    assert ops.receipts()["operations"] == []


@pytest.mark.parametrize("hold", ["lock", ".conker-backup.lock", ".conker-recovery.json"])
def test_nightly_run_refuses_at_once_while_something_holds_the_lock(tmp_path, hold):
    (tmp_path / "backups").mkdir()
    ops = host(tmp_path)  # its runner fails the test if any command runs
    log = journal(ops.root, "ubuntu")
    lock = OperationLock(ops.lock_path)
    if hold == "lock":
        assert lock.acquire()
    else:
        (ops.root / hold).write_text("held")
    try:
        assert scheduled_backup(ops, log) == 1
    finally:
        lock.release()

    record = last_record(log, "backup")
    assert record["outcome"] == "refused" and record["reason"]
    assert ops.receipts()["operations"] == []


def test_a_failed_nightly_backup_is_recorded_with_the_helpers_reason(tmp_path):
    (tmp_path / "backups").mkdir()
    ops = host(tmp_path, runner=Runner(1))
    log = journal(ops.root, "ubuntu")

    assert scheduled_backup(ops, log) == 1

    record = last_record(log, "backup")
    assert record["outcome"] == "failed" and "backup disk is mounted" in record["reason"]


def hold_update(checkout: Path, name: str) -> None:
    """What `conker update` leaves in a checkout while it runs, was cut off or is held."""
    subprocess.run(["git", "init", "-q", str(checkout)], check=True, capture_output=True)
    directory = checkout / ".git" / "conker-update"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_text(update_marker(name))


def update_marker(name: str) -> str:
    """A marker as an update writes it: update.lock holds a live process's token (this one's)."""
    return update_core._token() + "\n" if name == "update.lock" else "{}\n"


def test_update_markers_are_the_ones_update_py_writes(tmp_path):
    store = update.UpdateStore(tmp_path)
    assert {store.active_path.name, store.hold_path.name} | {"update.lock"} == set(UPDATE_MARKERS)
    assert '"update.lock"' in inspect.getsource(update._acquire_lock)
    hold_update(tmp_path / "checkout", "HOLD.json")
    assert update_directory(tmp_path / "checkout") == tmp_path / "checkout/.git/conker-update"
    assert update_directory(tmp_path) is None  # not a checkout: nothing to look at


@pytest.mark.parametrize("marker", UPDATE_MARKERS)
@pytest.mark.parametrize("where", ["root", "source"])
def test_nightly_run_refuses_while_an_update_runs_or_is_held(tmp_path, marker, where):
    (tmp_path / "backups").mkdir()
    ops = host(tmp_path)  # its runner fails the test if any command runs
    hold_update(ops.root if where == "root" else ops.source, marker)
    log = journal(ops.root, "ubuntu")

    assert scheduled_backup(ops, log) == 1

    assert last_record(log, "backup")["reason"] == UPDATE_BUSY
    assert ops.receipts()["operations"] == []


@pytest.mark.parametrize("marker", UPDATE_MARKERS)
def test_nightly_run_refuses_while_an_ubuntu_update_runs_or_is_held(tmp_path, marker):
    (tmp_path / "backups").mkdir()
    ops = host(tmp_path)
    store = ops.root / "state" / "update"  # where scripts/update_ubuntu.py keeps its state
    store.mkdir(parents=True)
    (store / marker).write_text(update_marker(marker), encoding="utf-8")
    log = journal(ops.root, "ubuntu")

    assert scheduled_backup(ops, log) == 1

    assert last_record(log, "backup")["reason"] == UPDATE_BUSY
    assert ops.receipts()["operations"] == []


def test_a_stale_update_lock_with_nothing_in_flight_blocks_no_nightly_backup(tmp_path, monkeypatch):
    # An update killed between closing its state and dropping its lock leaves only update.lock;
    # its holder is gone (it names an earlier boot), so the nightly backup runs.
    boot = tmp_path / "boot_id"
    boot.write_text("boot-now\n", encoding="ascii")
    monkeypatch.setattr(update_core, "BOOT_ID", boot)
    (tmp_path / "backups").mkdir()
    ops = host(tmp_path, runner=Runner(0))
    store = ops.root / "state" / "update"
    store.mkdir(parents=True)
    (store / "update.lock").write_text("424242 boot-before\n", encoding="ascii")
    log = journal(ops.root, "ubuntu")

    assert scheduled_backup(ops, log) == 0

    assert (last_record(log, "backup") or {}).get("outcome") == "done"


def test_a_nightly_run_stopped_midway_is_recorded_and_the_stop_goes_on(tmp_path):
    (tmp_path / "backups").mkdir()

    def stopped(*args, **kwargs):
        raise KeyboardInterrupt  # SIGINT from systemd, or SIGTERM through backup_cli

    ops = host(tmp_path, runner=stopped)
    log = journal(ops.root, "ubuntu")

    with pytest.raises(KeyboardInterrupt):
        scheduled_backup(ops, log)

    record = last_record(log, "backup")
    assert record["outcome"] == "failed" and "Stopped before it finished" in record["reason"]
    assert ops.receipt(record["operation"])["outcome"] == "unknown"
    assert OperationLock(ops.lock_path).acquire()


def test_on_refuses_without_lingering_and_writes_nothing(tmp_path):
    systemctl = Systemctl()
    plan = schedule(tmp_path, systemctl, linger=lambda: False)

    with pytest.raises(ScheduleError, match="enable-linger"):
        plan.on("weekly")

    assert systemctl.calls == [] and not (tmp_path / "units").exists()
    assert schedule(tmp_path, Systemctl(), linger=lambda: None).on()["backup"]["on"] is True


def test_stopping_a_unit_interrupts_every_process_in_it_so_cleanup_runs(tmp_path):
    for kind in ("backup", "drill"):
        service, _ = unit_texts(kind, tmp_path / "deploy", tmp_path / "source", "ubuntu")
        assert "KillMode=control-group\n" in service
        assert "KillSignal=SIGINT\n" in service  # Python skips `finally` on a default SIGTERM
        assert "TimeoutStopSec=15min\n" in service


def test_status_names_a_missing_destination_and_the_last_runs(tmp_path):
    ops = host(tmp_path, policy=lambda: None)
    plan = schedule(tmp_path)
    plan.on()
    scheduled_backup(ops, journal(ops.root, "ubuntu"))

    text = backup_cli.describe_status(plan, ops, ops.root, "ubuntu")

    assert "Nightly backup:  on, about 03:30 local time" in text
    assert "Weekly drill:    off" in text
    assert "Backup folder:   no backup destination" in text
    assert "skipped - No backup destination is saved" in text
    assert "Last drill:      none yet" in text


def test_last_record_skips_torn_and_foreign_lines(tmp_path):
    log = journal(tmp_path, "repository")
    log.append({"v": 1, "kind": "backup", "at": "a", "outcome": "done"})
    with log.path.open("ab") as stream:
        stream.write(b'{"torn": \n{"v": 2, "kind": "backup"}\n')

    assert last_record(log, "backup")["at"] == "a"
    assert last_record(log, "drill") is None
    assert json.loads(log.path.read_bytes().splitlines()[0])["kind"] == "backup"


def test_conker_routes_backup_schedule_and_drill_to_the_backup_command(ubuntu_cli):
    wrong = ubuntu_cli("backup", "schedule", "sometimes")
    assert wrong.returncode == 2 and "conker backup schedule" in wrong.stderr
    last = ubuntu_cli("backup", "drill", "--last")
    assert last.returncode == 1, last.stderr
    assert "No restore drill has run yet" in last.stdout
    # The installed layout's own state folder, not the source tree.
    assert (ubuntu_cli.deployment / "state/backup-schedule").is_dir()
    plain = json.loads(ubuntu_cli("backup", "--destination", "x").stdout)
    assert plain[2:] == ["backup", "--destination", "x"]  # still the recovery engine
    assert not ubuntu_cli.docker_log.exists()
