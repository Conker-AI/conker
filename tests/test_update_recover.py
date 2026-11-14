"""An update cut off part way (a reboot, a killed helper) is finished when the host helper starts:
rolled back and proven if its sources had moved, closed as abandoned if not, and never while an
update still runs, a backup runs, a recovery is held or the update is held."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest

from scripts import host_ops, update_core, update_ubuntu
from scripts.host_ops import HostOps
from scripts.host_ops_journal import OperationLock
from scripts.update_core import UpdateCoordinator, UpdateError, UpdateStore

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import recovery_data
import recovery_snapshot
import update_core as bare_core


class Transport:
    root: Path

    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def rollback(self, prior, candidate):
        self.calls.append(("rollback", prior["revision"], candidate["recovery"]))

    def verify_rollback(self, prior, protection):
        self.calls.append(("verify_rollback", prior["revision"]))
        if self.fail:
            raise UpdateError("Conker 0.1.0 did not answer its health checks")

    def require_quiet(self):
        pass


def quiet(root):
    """A transport whose quiet check is the real one (backup lock, held recovery)."""
    transport = Transport()
    transport.root = root
    transport.require_quiet = lambda: update_ubuntu.UbuntuTransport.require_quiet(
        cast(Any, transport)
    )
    return transport


def cut_off(root, phase, target="0.2.0"):
    store = UpdateStore(root / "state" / "update")
    store.save_active(
        {
            "schema": 1,
            "transaction_id": "a" * 32,
            "started_at": 1,
            "phase": phase,
            "target": target,
            "prior": {"revision": "0.1.0"},
            "candidate": {"revision": target, "recovery": str(root / "recovery" / "pre-update")},
        }
    )
    return store


def receipts(store):
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted((store.directory / "receipts").glob("*.json"))
    ]


@pytest.fixture
def boot(monkeypatch, tmp_path):
    """This boot's id and start time (long ago), as /proc gives them on Linux."""
    path, stat = tmp_path / "boot_id", tmp_path / "stat"
    path.write_text("boot-now\n", encoding="ascii")
    stat.write_text("cpu  1 2 3\nbtime 1000\n", encoding="ascii")
    for module in (update_core, bare_core):  # recovery_snapshot imports it from scripts/
        monkeypatch.setattr(module, "BOOT_ID", path)
        monkeypatch.setattr(module, "PROC_STAT", stat)
    return "boot-now"


def live(directory, boot):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "update.lock").write_text(f"{os.getpid()} {boot}\n", encoding="ascii")


# --- the update lock ---------------------------------------------------------------------------


def test_a_lock_from_an_earlier_boot_is_stale_even_if_its_pid_runs_again(tmp_path, boot):
    store = UpdateStore(tmp_path / "update")
    store.directory.mkdir()
    (store.directory / "update.lock").write_text(f"{os.getpid()} boot-before\n", encoding="ascii")

    lock = update_core._acquire_lock(store)

    assert lock.read_text(encoding="ascii") == f"{os.getpid()} {boot}\n"


def test_a_lock_of_this_boot_whose_process_runs_is_refused(tmp_path, boot):
    store = UpdateStore(tmp_path / "update")
    live(store.directory, boot)

    with pytest.raises(UpdateError, match="another update may be active"):
        update_core._acquire_lock(store)


def test_a_pid_only_lock_written_this_boot_still_counts(tmp_path, boot):
    store = UpdateStore(tmp_path / "update")
    store.directory.mkdir()
    (store.directory / "update.lock").write_text(f"{os.getpid()}\n", encoding="ascii")

    with pytest.raises(UpdateError, match="another update may be active"):
        update_core._acquire_lock(store)


def test_a_pid_only_lock_from_before_this_boot_is_stale(tmp_path, boot):
    store = UpdateStore(tmp_path / "update")
    store.directory.mkdir()
    lock = store.directory / "update.lock"
    lock.write_text(f"{os.getpid()}\n", encoding="ascii")  # an older release's lock
    os.utime(lock, (500, 500))  # written before btime 1000: its pid may be someone else's now

    assert update_core._acquire_lock(store).read_text(encoding="ascii") == f"{os.getpid()} {boot}\n"


def test_a_process_drops_only_its_own_lock(tmp_path, boot):
    store = UpdateStore(tmp_path / "update")
    lock = update_core._acquire_lock(store)
    lock.write_text("1 boot-now\n", encoding="ascii")  # another update's lock by now

    update_core._release_lock(lock)
    assert lock.read_text(encoding="ascii") == "1 boot-now\n"

    lock.write_text(f"{os.getpid()} {boot}\n", encoding="ascii")
    update_core._release_lock(lock)
    assert not lock.exists()


def test_update_running_sees_only_a_live_lock(tmp_path, boot):
    directory = tmp_path / "update"
    directory.mkdir()
    assert not update_core.update_running(directory)
    (directory / "update.lock").write_text(f"{os.getpid()} boot-before\n", encoding="ascii")
    assert not update_core.update_running(directory)
    live(directory, boot)
    assert update_core.update_running(directory)


def test_an_updates_own_snapshot_runs_under_its_lock(tmp_path, boot, monkeypatch):
    store = UpdateStore(tmp_path / "state" / "update")
    lock = bare_core._acquire_lock(store)

    monkeypatch.setenv("CONKER_UPDATE_LOCK", "1 boot-now")  # some other update's token
    with (
        pytest.raises(recovery_data.RecoveryError, match="An update is running"),
        recovery_snapshot.operation_lock(tmp_path),
    ):
        pytest.fail("the backup ran")

    monkeypatch.setenv("CONKER_UPDATE_LOCK", bare_core._token())
    with recovery_snapshot.operation_lock(tmp_path):
        assert (tmp_path / ".conker-backup.lock").exists()
    assert lock.exists()  # still the update's


@pytest.mark.skipif(update_core.fcntl is None, reason="the guard needs flock (Linux)")
def test_an_empty_lock_under_the_guard_is_a_writer_that_died(tmp_path, boot):
    directory = tmp_path / "update"
    directory.mkdir()
    (directory / "update.lock").write_text("", encoding="ascii")
    assert not update_core.update_running(directory)


def test_a_backup_refuses_while_an_update_runs(tmp_path, boot):
    live(tmp_path / "state" / "update", boot)

    with (
        pytest.raises(recovery_data.RecoveryError, match="An update is running"),
        recovery_snapshot.operation_lock(tmp_path),
    ):
        pytest.fail("the backup ran")
    assert not (tmp_path / ".conker-backup.lock").exists()


# --- conker update --recover -------------------------------------------------------------------


def test_nothing_cut_off_changes_nothing(tmp_path, boot):
    message = update_ubuntu.recover(tmp_path, transport_for=lambda *_: pytest.fail("no transport"))
    assert message == "No update was cut off. Nothing to do."
    assert not (tmp_path / "state" / "update" / "update.lock").exists()


@pytest.mark.parametrize("phase", ["applying_code", "code_applied", "applying", "verifying"])
def test_an_update_cut_off_after_its_sources_moved_is_rolled_back(tmp_path, boot, phase):
    store, transport = cut_off(tmp_path, phase), Transport()

    message = update_ubuntu.recover(tmp_path, transport_for=lambda root, target: transport)

    assert message.startswith("The update to 0.2.0 was cut off part way")
    assert [call[0] for call in transport.calls] == ["rollback", "verify_rollback"]
    assert [item["status"] for item in receipts(store)] == ["rolled_back"]
    assert store.load_active() is None
    assert not (store.directory / "update.lock").exists()


@pytest.mark.parametrize("phase", ["recorded", "candidate_validated", "candidate_ready"])
def test_an_update_cut_off_before_anything_changed_is_closed(tmp_path, boot, phase):
    # A cut during the update's own snapshot ("protecting"): tests/test_update_cutoff.py.
    store, transport = cut_off(tmp_path, phase), Transport()

    message = update_ubuntu.recover(tmp_path, transport_for=lambda root, target: transport)

    assert message.endswith("Nothing changed.")
    assert transport.calls == []
    assert [item["status"] for item in receipts(store)] == ["abandoned_before_apply"]
    assert store.load_active() is None


def test_a_rollback_that_cannot_be_proven_is_held(tmp_path, boot):
    store, transport = cut_off(tmp_path, "applying"), Transport(fail=True)

    with pytest.raises(UpdateError, match="Update held"):
        update_ubuntu.recover(tmp_path, transport_for=lambda root, target: transport)

    assert store.hold_path.exists()
    assert [item["status"] for item in receipts(store)] == ["rollback_unproven"]
    assert not (store.directory / "update.lock").exists()


def test_a_held_update_is_left_for_the_owner(tmp_path, boot):
    store = cut_off(tmp_path, "applying")
    store.hold({"transaction_id": "a" * 32}, "rollback could not be proven")

    with pytest.raises(UpdateError, match="held"):
        update_ubuntu.recover(tmp_path, transport_for=lambda *_: pytest.fail("no transport"))

    assert store.load_active() is not None


def test_a_hold_written_meanwhile_is_seen_under_the_lock(tmp_path, boot):
    store, transport = cut_off(tmp_path, "rolling_back"), Transport()
    store.hold({"transaction_id": "a" * 32}, "rollback could not be proven")

    with pytest.raises(UpdateError, match="held"):
        UpdateCoordinator(transport, store).recover_interrupted()
    assert transport.calls == []


@pytest.mark.parametrize("marker", [".conker-backup.lock", ".conker-recovery.json"])
def test_no_rollback_beside_a_backup_or_a_held_recovery(tmp_path, boot, marker):
    store = cut_off(tmp_path, "applying")
    (tmp_path / marker).write_text("{}", encoding="utf-8")
    transport = quiet(tmp_path)

    with pytest.raises(UpdateError, match="nothing was changed"):
        update_ubuntu.recover(tmp_path, transport_for=lambda root, target: transport)

    assert transport.calls == []
    active = store.load_active()
    assert active is not None and active["phase"] == "applying"
    assert receipts(store) == []
    assert not (store.directory / "update.lock").exists()


def test_closing_an_update_that_changed_nothing_may_run_beside_a_backup(tmp_path, boot):
    store = cut_off(tmp_path, "candidate_ready")
    (tmp_path / ".conker-backup.lock").write_text("1", encoding="ascii")

    update_ubuntu.recover(tmp_path, transport_for=lambda root, target: quiet(root))

    assert [item["status"] for item in receipts(store)] == ["abandoned_before_apply"]


@pytest.mark.parametrize("saved", ["{not json", '{"phase": "applying"}', "[1]"])
def test_state_that_cannot_be_read_is_held_not_guessed(tmp_path, boot, saved):
    store = UpdateStore(tmp_path / "state" / "update")
    store.directory.mkdir(parents=True)
    store.active_path.write_text(saved, encoding="utf-8")

    with pytest.raises(UpdateError, match="restore the snapshot"):
        update_ubuntu.recover(tmp_path, transport_for=lambda *_: pytest.fail("no transport"))

    assert store.hold_path.exists()
    assert not (store.directory / "update.lock").exists()


def test_an_update_that_still_runs_is_not_touched(tmp_path, boot):
    store = cut_off(tmp_path, "applying")
    live(store.directory, boot)

    with pytest.raises(UpdateError, match="another update may be active"):
        update_ubuntu.recover(tmp_path, transport_for=lambda *_: pytest.fail("no transport"))

    active = store.load_active()
    assert active is not None and active["phase"] == "applying"
    assert receipts(store) == []
    assert (store.directory / "update.lock").exists()  # never another update's lock


def test_the_command_reports_the_recovery_to_the_inbox(tmp_path, boot, monkeypatch, capsys):
    cut_off(tmp_path, "applying")
    told = []
    monkeypatch.setattr(update_ubuntu, "UbuntuTransport", lambda root, target: Transport())
    monkeypatch.setattr(update_ubuntu, "tell_inbox", told.append)

    assert update_ubuntu.main(["--root", str(tmp_path), "--recover"]) == 0

    assert "back on the version it had" in capsys.readouterr().out
    assert told == [tmp_path.resolve()]


def test_an_unexpected_failure_still_tells_the_inbox(tmp_path, boot, monkeypatch):
    told = []

    def broken(_root):
        raise KeyError("phase")

    monkeypatch.setattr(update_ubuntu, "recover", broken)
    monkeypatch.setattr(update_ubuntu, "tell_inbox", told.append)

    assert update_ubuntu.main(["--root", str(tmp_path), "--recover"]) == 1
    assert told == [tmp_path.resolve()]


def test_an_update_waits_for_a_backup_before_its_own_recovery(tmp_path, boot, monkeypatch):
    store = cut_off(tmp_path, "applying")
    (tmp_path / ".conker-backup.lock").write_text("1", encoding="ascii")
    transport = quiet(tmp_path)
    monkeypatch.setattr(update_ubuntu, "UbuntuTransport", lambda root, target: transport)
    monkeypatch.setattr(update_ubuntu, "tell_inbox", lambda _root: None)

    assert update_ubuntu.main(["--root", str(tmp_path), "--to", "0.3.0"]) == 1

    assert transport.calls == []
    active = store.load_active()
    assert active is not None and active["phase"] == "applying"
    assert not (store.directory / "update.lock").exists()


def test_to_and_recover_are_one_or_the_other(tmp_path):
    with pytest.raises(SystemExit):
        update_ubuntu.main(["--root", str(tmp_path), "--to", "0.2.0", "--recover"])


# --- the host helper ---------------------------------------------------------------------------


def helper(tmp_path, layout="ubuntu"):
    return HostOps(
        tmp_path / "deploy",
        tmp_path / "source",
        layout,
        runner=lambda *_a, **_k: pytest.fail("no host command may run"),
        reader=lambda *_a, **_k: pytest.fail("no host read"),
        policy=lambda: None,
    )


class Host:
    """The helper's commands: `docker info` answers after `down` tries (hanging when `hang`);
    `conker update --recover` exits with `exit`."""

    def __init__(self, down=0, hang=False, exit=0):
        self.calls, self.down, self.hang, self.exit = [], down, hang, exit

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        if argv == ["docker", "info"]:
            self.down -= 1
            if self.down >= 0 and self.hang:
                raise subprocess.TimeoutExpired(argv, kwargs["timeout"])
            return subprocess.CompletedProcess(argv, 1 if self.down >= 0 else 0)
        return subprocess.CompletedProcess(argv, self.exit, stderr="Conker update stopped: no")


def test_the_helper_recovers_a_cut_off_update_once_docker_answers(tmp_path, boot):
    ops, run, pauses = helper(tmp_path), Host(down=2), []
    cut_off(ops.root, "applying")

    assert host_ops.recover_interrupted_update(ops, runner=run, sleep=pauses.append)

    assert [argv for argv, _ in run.calls] == [["docker", "info"]] * 3 + [
        ["bash", str(ops.source / "conker"), "update", "--recover"]
    ]
    assert pauses == [host_ops.DOCKER_POLL] * 2
    assert "timeout" not in run.calls[-1][1]  # a rollback rebuilds; no limit
    assert OperationLock(ops.lock_path).acquire()  # released afterwards


def test_a_hanging_docker_info_is_asked_again(tmp_path, boot):
    ops, run = helper(tmp_path), Host(down=1, hang=True)
    cut_off(ops.root, "applying")

    assert host_ops.recover_interrupted_update(ops, runner=run, sleep=lambda _s: None)
    assert [argv[0] for argv, _ in run.calls] == ["docker", "docker", "bash"]


def test_a_recovery_that_fails_is_logged_and_not_counted(tmp_path, boot, capsys):
    ops, run = helper(tmp_path), Host(exit=1)
    cut_off(ops.root, "applying")

    assert not host_ops.recover_interrupted_update(ops, runner=run, sleep=lambda _s: None)
    assert "did not finish: Conker update stopped: no" in capsys.readouterr().err
    assert OperationLock(ops.lock_path).acquire()


def test_without_docker_the_helper_waits_for_the_next_try(tmp_path, boot, monkeypatch):
    ops, run = helper(tmp_path), Host(down=10**6)
    cut_off(ops.root, "applying")
    monkeypatch.setattr(host_ops, "DOCKER_WAIT", 0)

    assert not host_ops.recover_interrupted_update(ops, runner=run, sleep=lambda _s: None)

    assert [argv for argv, _ in run.calls] == [["docker", "info"]]
    assert (ops.root / "state" / "update" / "active.json").exists()


@pytest.mark.parametrize("why", ["nothing", "held", "repository", "busy"])
def test_the_helper_leaves_it_alone(tmp_path, boot, why):
    ops, run = helper(tmp_path, "repository" if why == "repository" else "ubuntu"), Host()
    if why != "nothing":
        store = cut_off(ops.root, "applying")
        if why == "held":
            store.hold({"transaction_id": "a" * 32}, "rollback could not be proven")
    holder = OperationLock(ops.lock_path)
    if why == "busy":  # an action (that very update) still holds the helper's lock
        ops.lock_path.parent.mkdir(parents=True, exist_ok=True)
        assert holder.acquire()
    try:
        assert not host_ops.recover_interrupted_update(ops, runner=run, sleep=lambda _s: None)
    finally:
        holder.release()
    assert all(argv == ["docker", "info"] for argv, _ in run.calls)


def test_the_watch_recovers_first_then_before_each_daily_check(tmp_path):
    order, pauses = [], []

    class Stop(Exception):
        pass

    def sleep(seconds):
        order.append(seconds)
        pauses.append(seconds)
        if len(pauses) == 2:
            raise Stop

    with pytest.raises(Stop):
        host_ops.watch_for_updates(
            helper(tmp_path),
            sleep=sleep,
            check=lambda _host: order.append("check"),
            recover=lambda _host: order.append("recover"),
        )
    assert order == ["recover", host_ops.FIRST_CHECK, "recover", "check", host_ops.CHECK_EVERY]


def test_a_failed_recovery_never_skips_the_daily_check(tmp_path):
    checks = []

    class Stop(Exception):
        pass

    def broken(_host):
        raise RuntimeError("recover")

    def sleep(seconds):
        if seconds == host_ops.CHECK_EVERY:
            raise Stop

    with pytest.raises(Stop):
        host_ops.watch_for_updates(
            helper(tmp_path), sleep=sleep, check=checks.append, recover=broken
        )
    assert len(checks) == 1
