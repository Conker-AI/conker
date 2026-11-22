"""The on-demand update check (ADR-0014): the `update.check` read starts one background check and
answers at once; a throttle, one flight shared with the daily check, and the update and action
locks keep it from hammering GitHub or running mid-update."""

from __future__ import annotations

import http.client
import json
import os
import socketserver
import subprocess
import threading
import time
from types import SimpleNamespace
from typing import cast

import pytest

from scripts import host_ops, host_ops_check, host_ops_cli, update_core
from scripts.host_ops import HostOps, HostOpsError, route
from scripts.host_ops_journal import OperationLock
from scripts.provider_control import ProviderControl, handler

READ = {"operation": "update.check", "arguments": {}}


class Clock:
    def __init__(self):
        self.now = 1_800_000_000.0

    def __call__(self):
        return self.now


class Check:
    """A stand-in for `conker update --check --report`; each call answers the next exit code."""

    def __init__(self, *codes):
        self.codes, self.calls = list(codes) or [0], []

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        code = self.codes.pop(0) if len(self.codes) > 1 else self.codes[0]
        return SimpleNamespace(returncode=code)


def make(tmp_path, runner=None, layout="ubuntu", clock=None):
    queue: list = []
    ops = HostOps(
        tmp_path / "deploy",
        tmp_path / "source",
        layout,
        runner=lambda *_a, **_k: pytest.fail("no host command may run"),
        reader=lambda *_a, **_k: pytest.fail("no host read"),
        policy=lambda: None,
        spawn=queue.append,
        update_runner=runner or Check(),
        clock=clock or Clock(),
    )
    return ops, queue


def hold_update(ops, monkeypatch, tmp_path):
    boot = tmp_path / "boot_id"
    boot.write_text("boot-now\n", encoding="ascii")
    monkeypatch.setattr(update_core, "BOOT_ID", boot)
    store = ops.root / "state" / "update"
    store.mkdir(parents=True, exist_ok=True)
    (store / "update.lock").write_text(update_core._token() + "\n", encoding="ascii")


def result(ops, **kwargs):
    answer = ops.read(READ, **kwargs)
    assert answer["operation"] == "update.check"
    return answer["result"]


def test_a_first_read_starts_a_check_and_answers_before_it_ends(tmp_path):
    check = Check()
    ops, queue = make(tmp_path, check)
    assert result(ops) == {
        "state": "started",
        "checkedAt": None,
        "ok": None,
        "reason": None,
        "nextCheckAfter": None,
    }
    assert check.calls == [] and len(queue) == 1  # nothing ran inline
    assert result(ops)["state"] == "running" and len(queue) == 1  # coalesced, no second spawn
    queue.pop()()
    argv, kwargs = check.calls[0]
    assert argv == ["bash", str(ops.source / "conker"), "update", "--check", "--report"]
    assert kwargs["timeout"] == host_ops_check.ON_DEMAND_TIMEOUT == 120
    assert kwargs["stdout"] is subprocess.DEVNULL and kwargs["stderr"] is subprocess.DEVNULL
    assert not ops.journal.path.exists()  # a check is no action and leaves no receipt


def test_inside_the_window_the_answer_is_fresh_and_nothing_runs(tmp_path):
    clock, check = Clock(), Check()
    ops, queue = make(tmp_path, check, clock=clock)
    result(ops)
    queue.pop()()
    clock.now += host_ops_check.SUCCESS_GAP - 1
    fresh = result(ops)
    assert (fresh["state"], fresh["ok"], fresh["reason"]) == ("fresh", True, None)
    assert fresh["checkedAt"] == host_ops_check.iso(1_800_000_000.0)
    assert fresh["nextCheckAfter"] == host_ops_check.iso(1_800_000_090.0)
    assert queue == [] and len(check.calls) == 1
    clock.now += 1
    assert result(ops)["state"] == "started"
    assert len(queue) == 1


def test_a_failed_check_backs_off_for_fifteen_minutes(tmp_path):
    clock = Clock()
    ops, queue = make(tmp_path, Check(1, 0), clock=clock)
    result(ops)
    queue.pop()()
    clock.now += host_ops_check.SUCCESS_GAP + 1
    failed = result(ops)
    assert (failed["state"], failed["ok"], failed["reason"]) == (
        "fresh",
        False,
        "github_unreachable",
    )
    clock.now += host_ops_check.FAILURE_GAP
    assert result(ops)["state"] == "started"
    queue.pop()()
    assert result(ops)["ok"] is True


def test_a_check_that_cannot_run_counts_as_failed_and_frees_the_flight(tmp_path):
    def broken(*_args, **_kwargs):
        raise subprocess.TimeoutExpired("conker", 120)

    ops, queue = make(tmp_path, broken)
    result(ops)
    queue.pop()()
    after = result(ops)
    assert (after["state"], after["ok"]) == ("fresh", False)
    probe = OperationLock(ops.lock_path)
    assert probe.acquire()  # the action lock was let go
    probe.release()


def test_a_running_update_skips_the_check(tmp_path, monkeypatch):
    ops, queue = make(tmp_path)
    hold_update(ops, monkeypatch, tmp_path)
    skipped = result(ops)
    assert (skipped["state"], skipped["reason"]) == ("skipped", "update_running")
    assert queue == [] and result(ops)["state"] == "skipped"  # no stamp, so asked again


def test_a_running_action_skips_the_check(tmp_path):
    ops, queue = make(tmp_path)
    holder = OperationLock(ops.lock_path)
    assert holder.acquire()
    try:
        skipped = result(ops)
    finally:
        holder.release()
    assert (skipped["state"], skipped["reason"]) == ("skipped", "host_busy")
    assert queue == [] and result(ops)["state"] == "started"


def test_the_check_does_not_hold_the_action_lock(tmp_path):
    ops, queue = make(tmp_path)
    result(ops)  # in flight: an update or backup started now must not be refused as busy
    other = OperationLock(ops.lock_path)
    assert other.acquire()
    other.release()
    queue.pop()()


def test_started_and_running_carry_no_reason_even_after_a_failure(tmp_path):
    clock = Clock()
    ops, queue = make(tmp_path, Check(1, 0), clock=clock)
    result(ops)
    queue.pop()()
    clock.now += host_ops_check.FAILURE_GAP
    started = result(ops)
    assert (started["state"], started["ok"], started["reason"]) == ("started", False, None)
    assert result(ops)["reason"] is None  # running


def test_exit_codes_name_the_failure_and_a_report_failure_retries_soon(tmp_path):
    clock = Clock()
    ops, queue = make(tmp_path, Check(host_ops_check.GITHUB_EXIT), clock=clock)
    result(ops)
    queue.pop()()
    assert result(ops)["reason"] == "github_unreachable"
    clock.now += host_ops_check.REPORT_GAP + 1
    assert result(ops)["state"] == "fresh"  # GitHub failures still wait 15 minutes
    ops, queue = make(tmp_path / "b", Check(host_ops_check.REPORT_EXIT), clock=clock)
    result(ops)
    queue.pop()()
    clock.now += host_ops_check.REPORT_GAP + 1
    assert result(ops)["state"] == "started"  # Pi could not be told: soon again


@pytest.mark.parametrize("daily", [False, True])
def test_an_unexpected_error_never_leaves_the_flight_stuck(tmp_path, daily):
    def broken(*_args, **_kwargs):
        raise ValueError("odd argv")

    ops, queue = make(tmp_path, broken)
    if daily:
        with pytest.raises(ValueError):
            host_ops.check_for_updates(ops, runner=broken)
    else:
        result(ops)
        with pytest.raises(ValueError):
            queue.pop()()
    after = result(ops)
    assert after["state"] == "fresh" and after["ok"] is False  # not "running" for ever
    ops.update_gate._next_after = 0.0
    assert result(ops)["state"] == "started"


def test_a_timeout_kills_the_whole_process_group(tmp_path):
    if os.name != "posix":
        pytest.skip("process groups are POSIX")
    marker = tmp_path / "grandchild.pid"
    script = f"sh -c 'echo $$ > {marker}; sleep 30' & wait"
    with pytest.raises(subprocess.TimeoutExpired):
        host_ops_check.run_in_group(["sh", "-c", script], timeout=1)
    pid = int(marker.read_text())
    for _ in range(50):
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.1)
    pytest.fail("the grandchild outlived the timeout")


def test_the_repository_layout_is_unsupported(tmp_path):
    ops, queue = make(tmp_path, layout="repository")
    answer = result(ops)
    assert answer["state"] == "unsupported" and answer["ok"] is None
    assert queue == []


def test_a_spawn_that_fails_frees_the_flight_and_the_lock(tmp_path):
    ops, _ = make(tmp_path)

    def refuse(_work):
        raise RuntimeError("no threads")

    ops.update_gate.spawn = refuse
    with pytest.raises(RuntimeError):
        result(ops)
    ops.update_gate.spawn = lambda work: work()
    assert result(ops)["state"] == "started"


@pytest.mark.parametrize("arguments", [{"reason": "open"}, {"x": "y"}, [], None, "open"])
def test_the_read_takes_no_arguments(tmp_path, arguments):
    ops, queue = make(tmp_path)
    with pytest.raises(HostOpsError) as error:
        ops.read({"operation": "update.check", "arguments": arguments})
    assert (error.value.status, error.value.code) == (422, "invalid_host_operation")
    assert queue == []


def test_an_unknown_read_never_falls_into_the_backups_branch(tmp_path, monkeypatch):
    ops, _ = make(tmp_path)
    monkeypatch.setitem(host_ops.OPERATIONS, "x.read", host_ops.Operation("x.read", True, {}))
    with pytest.raises(HostOpsError):
        ops.read({"operation": "x.read", "arguments": {}})


def test_update_check_is_a_read_not_an_action(tmp_path):
    ops, _ = make(tmp_path)
    with pytest.raises(HostOpsError):
        ops.start({"id": "ui-check-0123456789abcdef", "operation": "update.check", "arguments": {}})


def test_the_daily_check_joins_the_flight_and_leaves_the_stamp(tmp_path):
    seen: list = []
    ops, queue = make(tmp_path)

    def daily_runner(argv, **kwargs):
        # While the daily check runs, an on-demand read coalesces onto it.
        seen.append(result(ops)["state"])
        return SimpleNamespace(returncode=0)

    assert host_ops.check_for_updates(ops, runner=daily_runner) is True
    assert seen == ["running"] and queue == []
    assert result(ops)["state"] == "fresh"  # the daily check closed the door too


def test_the_daily_check_stays_out_of_an_on_demand_check(tmp_path):
    ops, queue = make(tmp_path)
    result(ops)  # in flight, not run yet
    assert host_ops.check_for_updates(ops, runner=lambda *_a, **_k: pytest.fail("ran")) is False
    queue.pop()()
    # Finished: the daily check is not throttled by the stamp.
    assert host_ops.check_for_updates(ops, runner=lambda *_a, **_k: None) is True


def test_a_failed_daily_check_still_returns_true_and_backs_the_read_off(tmp_path):
    ops, _ = make(tmp_path)
    assert host_ops.check_for_updates(ops, runner=lambda *_a, **_k: SimpleNamespace(returncode=1))
    assert result(ops)["ok"] is False


def test_concurrent_reads_start_exactly_one_check(tmp_path):
    ops, queue = make(tmp_path, Check())
    answers: list = []
    barrier = threading.Barrier(8)

    def ask():
        barrier.wait()
        answers.append(result(ops)["state"])

    threads = [threading.Thread(target=ask) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert answers.count("started") == 1 and len(queue) == 1


def test_a_waited_read_ends_the_check_before_it_answers(tmp_path):
    check = Check()
    ops = HostOps(
        tmp_path / "deploy",
        tmp_path / "source",
        "ubuntu",
        runner=lambda *_a, **_k: pytest.fail("no host command"),
        reader=lambda *_a, **_k: pytest.fail("no host read"),
        policy=lambda: None,
        update_runner=check,
    )
    answer = ops.read(READ, wait=True)  # the path `conker ops run update.check` takes
    assert len(check.calls) == 1
    assert answer["result"]["state"] == "started" and answer["result"]["ok"] is True
    assert answer["result"]["checkedAt"] is not None


def test_conker_ops_run_update_check_waits_and_prints_json(tmp_path, monkeypatch, capsys):
    check = Check()
    monkeypatch.setattr(host_ops_check, "run_in_group", check)
    code = host_ops_cli.main(
        [
            "--root",
            str(tmp_path / "deploy"),
            "--source",
            str(tmp_path / "source"),
            "--layout",
            "ubuntu",
            "run",
            "update.check",
        ]
    )
    printed = json.loads(capsys.readouterr().out)
    assert code == 0 and len(check.calls) == 1
    assert printed["operation"] == "update.check" and printed["result"]["ok"] is True
    assert not (tmp_path / "deploy" / "state" / "host-ops" / "journal.jsonl").exists()


def test_the_route_answers_the_read(tmp_path):
    ops, queue = make(tmp_path)
    status, value = route(ops, "POST", "/host/read", READ)
    assert status == 200 and value["result"]["state"] == "started"
    status, value = route(
        ops, "POST", "/host/read", {"operation": "update.check", "arguments": {"a": "b"}}
    )
    assert status == 422 and value["error"] == "invalid_host_operation"
    assert len(queue) == 1


def test_a_stalled_check_does_not_block_the_helper_socket(tmp_path):
    release, started = threading.Event(), threading.Event()

    def stalled(argv, **kwargs):
        started.set()
        release.wait(30)
        return SimpleNamespace(returncode=0)

    ops = HostOps(
        tmp_path / "deploy",
        tmp_path / "source",
        "ubuntu",
        runner=lambda *_a, **_k: pytest.fail("no host command"),
        reader=lambda *_a, **_k: pytest.fail("no host read"),
        policy=lambda: None,
        update_runner=stalled,  # the real thread spawn: the check runs beside the socket
    )
    control = ProviderControl(tmp_path, tmp_path / "source", "ubuntu")
    # Single threaded like the helper's own Unix socket server.
    server = socketserver.TCPServer(("127.0.0.1", 0), handler(control, None, ops))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()

    def request(method, path, body=None):
        connection = http.client.HTTPConnection(
            *cast("tuple[str, int]", server.server_address), timeout=10
        )
        try:
            headers = {"Content-Type": "application/json"} if body is not None else {}
            payload = json.dumps(body) if body is not None else None
            connection.request(method, path, body=payload, headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    try:
        status, value = request("POST", "/host/read", READ)
        assert status == 200 and value["result"]["state"] == "started"
        assert started.wait(10)  # the check is now stalled in its thread
        assert request("POST", "/host/read", READ)[1]["result"]["state"] == "running"
        assert request("GET", "/host/ops")[0] == 200
        assert request("GET", "/providers")[0] == 200
    finally:
        release.set()
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)
