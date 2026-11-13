"""The update as a host action (ADR-0014): `update.run` runs only `conker update --to X.Y.Z`, has no
time limit, and the daily check stays out of the way of a running action."""

from __future__ import annotations

import json
import subprocess

import pytest

from scripts import host_ops, update_core
from scripts.host_ops import HostOps, HostOpsError
from scripts.host_ops_journal import OperationLock


class Runner:
    def __init__(self, result=0):
        self.calls, self.result = [], result

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        return self.result


def host(tmp_path, runner=None) -> HostOps:
    return HostOps(
        tmp_path / "deploy",
        tmp_path / "source",
        "ubuntu",
        runner=runner or (lambda *_a, **_k: pytest.fail("no host command may run")),
        reader=lambda *_a, **_k: pytest.fail("no host read"),
        policy=lambda: None,
    )


def update(version, identity="ui-update-0123456789abcdef"):
    return {"id": identity, "operation": "update.run", "arguments": {"version": version}}


COMMIT = "0123456789abcdef0123456789abcdef01234567"
MODULE = "f" * 40
PINS = {"pi": "0.25.0", "toolgate": "0.16.0", "memorygate": "0.9.0"}
PINS.update(systemgate="0.6.0", embeddings="0.2.0")
MODULES = ",".join(f"{name}={version}@{MODULE}" for name, version in PINS.items())


def pinned(commit=COMMIT, module=MODULE):
    """One offer as the daily check keeps it (scripts/update_check.py release_commits)."""
    return {
        "commit": commit,
        "modules": {name: {"version": v, "commit": module} for name, v in PINS.items()},
    }


def offer(ops: HostOps, offers=None) -> None:
    """What the daily check saved (scripts/update_check.py save_offers)."""
    folder = ops.root / "state" / "update"
    folder.mkdir(parents=True, exist_ok=True)
    value = json.dumps({"offers": {"0.25.0": pinned()} if offers is None else offers})
    (folder / "offer.json").write_text(value, encoding="utf-8")


def test_an_update_runs_the_fixed_argv_with_no_time_limit(tmp_path):
    runner = Runner()
    ops = host(tmp_path, runner)
    offer(ops)
    receipt = ops.start(update("0.25.0"), wait=True)
    argv, kwargs = runner.calls[0]
    assert argv == [
        "bash", str(ops.source / "conker"), "update", "--to", "0.25.0", "--commit", COMMIT,
        "--modules", MODULES,
    ]  # fmt: skip
    assert kwargs["timeout"] is None  # stopping an update midway is worse than waiting
    assert receipt["outcome"] == "done" and receipt["arguments"] == {"version": "0.25.0"}


@pytest.mark.parametrize(
    "saved",
    [
        None,
        {"0.24.0": pinned()},
        {"0.26.0": pinned()},
        {"0.25.0": pinned("main")},
        {"0.25.0": pinned(COMMIT[:39])},
        {"0.25.0": pinned(module="main")},
        {"0.25.0": COMMIT},  # from before module commits were kept
    ],
)
def test_only_an_offered_release_is_installed(tmp_path, saved):
    ops = host(tmp_path)  # its runner fails the test if anything runs
    if saved is not None:
        offer(ops, saved)
    with pytest.raises(HostOpsError) as error:
        ops.start(update("0.25.0"))
    assert "only a release its daily check offered" in str(error.value)
    assert not ops.journal.path.exists()  # refused before it was recorded as started


def test_each_offered_release_installs_by_its_own_commit(tmp_path):
    runner = Runner()
    ops = host(tmp_path, runner)
    offer(ops, {"0.25.0": pinned(), "0.26.0": pinned("e" * 40, "d" * 40)})
    ops.start(update("0.25.0", "ui-update-older-card-000001"), wait=True)
    assert runner.calls[0][0][-6:] == ["--to", "0.25.0", "--commit", COMMIT, "--modules", MODULES]


def test_a_failed_update_says_where_to_look(tmp_path):
    ops = host(tmp_path, Runner(result=1))
    offer(ops)
    receipt = ops.start(update("0.25.0"), wait=True)
    assert receipt["outcome"] == "failed"
    assert "The Inbox says whether Conker went back" in receipt["reason"]


@pytest.mark.parametrize(
    "version", ["v0.25.0", "0.25", "0.25.0-rc.1", "0.25.0 --force", "../0.25.0", "main"]
)
def test_an_update_names_an_exact_release(tmp_path, version):
    ops = host(tmp_path)
    with pytest.raises(HostOpsError) as error:
        ops.start(update(version))
    assert (error.value.status, error.value.code) == (422, "invalid_host_operation")
    assert not ops.journal.path.exists()


def test_an_update_is_refused_while_another_action_runs(tmp_path):
    ops = host(tmp_path)
    holder = OperationLock(ops.lock_path)
    assert holder.acquire()
    try:
        with pytest.raises(HostOpsError) as error:
            ops.start(update("0.25.0"))
        assert error.value.code == "host_busy"
    finally:
        holder.release()


def test_the_daily_check_runs_check_and_report_and_keeps_no_output(tmp_path):
    ops, calls = host(tmp_path), []
    assert host_ops.check_for_updates(ops, runner=lambda argv, **kw: calls.append((argv, kw)))
    argv, kwargs = calls[0]
    assert argv == ["bash", str(ops.source / "conker"), "update", "--check", "--report"]
    assert kwargs["stdout"] is subprocess.DEVNULL and kwargs["stderr"] is subprocess.DEVNULL
    assert kwargs["timeout"] == host_ops.CHECK_TIMEOUT
    assert not ops.journal.path.exists()  # a check is no action and leaves no receipt


def test_the_daily_check_skips_while_an_action_runs(tmp_path):
    ops = host(tmp_path)
    holder = OperationLock(ops.lock_path)
    assert holder.acquire()
    try:
        assert not host_ops.check_for_updates(ops, runner=lambda *_a, **_k: pytest.fail("ran"))
    finally:
        holder.release()


@pytest.mark.parametrize("holder", ["live", "stale"])
def test_the_daily_check_skips_while_a_shell_update_holds_its_lock(tmp_path, monkeypatch, holder):
    # `conker update --to` from a shell takes update.lock, not the action lock. Mid-update the
    # sources already say the new release runs, and a check then would close its offer in Pi.
    boot = tmp_path / "boot_id"
    boot.write_text("boot-now\n", encoding="ascii")
    monkeypatch.setattr(update_core, "BOOT_ID", boot)
    ops, calls = host(tmp_path), []
    store = ops.root / "state" / "update"
    store.mkdir(parents=True)
    token = update_core._token() if holder == "live" else "424242 boot-before"
    (store / "update.lock").write_text(token + "\n", encoding="ascii")

    ran = host_ops.check_for_updates(ops, runner=lambda argv, **_kw: calls.append(argv))

    assert ran is (holder == "stale") and len(calls) == (holder == "stale")


def test_the_daily_check_survives_a_failure(tmp_path):
    def broken(*_args, **_kwargs):
        raise subprocess.TimeoutExpired("conker", 600)

    assert not host_ops.check_for_updates(host(tmp_path), runner=broken)


def test_the_watch_checks_after_a_pause_then_once_a_day(tmp_path):
    pauses, checks = [], []

    class Stop(Exception):
        pass

    def sleep(seconds):
        pauses.append(seconds)
        if len(pauses) == 3:
            raise Stop

    with pytest.raises(Stop):
        host_ops.watch_for_updates(host(tmp_path), sleep=sleep, check=checks.append)
    assert pauses == [host_ops.FIRST_CHECK, host_ops.CHECK_EVERY, host_ops.CHECK_EVERY]
    assert len(checks) == 2


def test_the_daily_check_runs_only_on_the_ubuntu_layout(tmp_path):
    ops = HostOps(
        tmp_path / "deploy",
        tmp_path / "source",
        "repository",
        runner=lambda *_a, **_k: pytest.fail("no host command may run"),
        reader=lambda *_a, **_k: pytest.fail("no host read"),
        policy=lambda: None,
    )
    assert not host_ops.check_for_updates(ops, runner=lambda *_a, **_k: pytest.fail("ran"))


def test_the_daily_check_survives_a_lock_it_cannot_open(tmp_path, monkeypatch):
    def refuse(self):
        raise PermissionError("lock")

    monkeypatch.setattr(OperationLock, "acquire", refuse)
    assert not host_ops.check_for_updates(host(tmp_path), runner=lambda *_a, **_k: pytest.fail())


def test_the_watch_keeps_going_after_a_check_raises(tmp_path):
    pauses = []

    class Stop(Exception):
        pass

    def sleep(seconds):
        pauses.append(seconds)
        if len(pauses) == 3:
            raise Stop

    def broken(_host):
        raise RuntimeError("check")

    with pytest.raises(Stop):
        host_ops.watch_for_updates(host(tmp_path), sleep=sleep, check=broken)
    assert len(pauses) == 3
