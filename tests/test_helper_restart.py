"""The host helper restarts on its new code once an update changed it, and only when idle: no
server action holds the action lock and no ChatGPT answer streams (scripts/helper_restart.py)."""

from __future__ import annotations

import shutil
import socket
import socketserver
import threading
from pathlib import Path

import pytest

from scripts import helper_restart, provider_control
from scripts.host_ops_journal import OperationLock


def tree(root: Path, code: str = "print('old')\n") -> Path:
    (root / "scripts" / "nested").mkdir(parents=True, exist_ok=True)
    (root / "scripts" / "host_ops.py").write_text(code, encoding="utf-8")
    (root / "scripts" / "nested" / "part.py").write_text("x = 1\n", encoding="utf-8")
    (root / "conker").write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    return root


class Ticks:
    """A sleep that runs a step before each tick and ends the watch after the last one."""

    def __init__(self, *steps):
        self.steps = list(steps)

    def __call__(self, _seconds):
        if not self.steps:
            raise StopIteration
        self.steps.pop(0)()


def watch(source, ticks, idle=lambda: True):
    stops: list[bool] = []
    with pytest.raises(StopIteration):
        helper_restart.watch_own_code(source, idle, lambda: stops.append(True), sleep=ticks)
    return stops


def test_the_fingerprint_follows_code_and_ignores_caches(tmp_path):
    source = tree(tmp_path)
    before = helper_restart.fingerprint(source)
    cache = source / "scripts" / "__pycache__"
    cache.mkdir()
    (cache / "host_ops.cpython-312.py").write_text("cache", encoding="utf-8")
    assert helper_restart.fingerprint(source) == before
    (source / "conker").write_text("#!/usr/bin/env bash\necho new\n", encoding="utf-8")
    assert helper_restart.fingerprint(source) != before


def test_a_tree_mid_swap_has_no_fingerprint(tmp_path):
    source = tree(tmp_path)
    (source / "conker").unlink()
    assert helper_restart.fingerprint(source) is None
    tree(source)
    shutil.rmtree(source / "scripts")
    assert helper_restart.fingerprint(source) is None


def test_unchanged_code_never_restarts(tmp_path):
    source = tree(tmp_path)
    assert watch(source, Ticks(lambda: None, lambda: None)) == []


def test_changed_code_restarts_once_idle(tmp_path):
    source = tree(tmp_path)
    busy = [True, True]

    def idle():
        return not busy.pop(0) if busy else True

    stops: list[bool] = []
    ticks = Ticks(lambda: tree(source, "print('new')\n"), lambda: None, lambda: None, lambda: None)
    helper_restart.watch_own_code(source, idle, lambda: stops.append(True), sleep=ticks)
    assert stops == [True]
    assert len(ticks.steps) == 1  # returned at the third tick, the first idle one


def test_a_source_mid_swap_is_not_a_change(tmp_path):
    source = tree(tmp_path)
    ticks = Ticks(lambda: (source / "conker").unlink(), lambda: None)
    assert watch(source, ticks) == []


def test_a_helper_started_mid_swap_takes_the_first_whole_tree_as_its_own(tmp_path):
    ticks = Ticks(lambda: tree(tmp_path), lambda: None, lambda: None)
    assert watch(tmp_path, ticks) == []


def test_a_failing_idle_check_is_logged_and_the_watch_goes_on(tmp_path, capsys):
    source = tree(tmp_path)
    answers = iter([OSError("no host-ops folder"), True])

    def idle():
        answer = next(answers)
        if isinstance(answer, Exception):
            raise answer
        return answer

    stops: list[bool] = []
    ticks = Ticks(lambda: tree(source, "print('new')\n"), lambda: None)
    helper_restart.watch_own_code(source, idle, lambda: stops.append(True), sleep=ticks)
    assert stops == [True]
    assert "no host-ops folder" in capsys.readouterr().err


def test_idle_holds_the_action_lock_so_no_action_starts(tmp_path):
    lock_path = tmp_path / "operation.lock"
    claim = helper_restart.claim_idle(lock_path, lambda: False)
    assert isinstance(claim, OperationLock)
    assert not OperationLock(lock_path).acquire()  # host_ops answers busy meanwhile
    claim.release()


def test_a_running_action_or_other_work_is_not_idle(tmp_path):
    lock_path = tmp_path / "operation.lock"
    action = OperationLock(lock_path)
    assert action.acquire()
    assert helper_restart.claim_idle(lock_path, lambda: False) is False
    action.release()

    assert helper_restart.claim_idle(lock_path, lambda: True) is False
    after = OperationLock(lock_path)
    assert after.acquire()  # the lock was let go again
    after.release()


def test_a_helper_without_server_actions_is_idle_when_nothing_else_runs():
    assert helper_restart.claim_idle(None, lambda: False) is True
    assert helper_restart.claim_idle(None, lambda: True) is False


class Answers:
    def __init__(self, streaming=0):
        self.streaming, self.paused = streaming, False

    def pause(self):
        self.paused = True
        return self.streaming

    def resume(self):
        self.paused = False


def test_quiet_keeps_the_lock_and_refuses_new_answers(tmp_path):
    answers, held = Answers(), []
    assert helper_restart.quiet(answers, tmp_path / "operation.lock", tmp_path / "update", held)
    assert answers.paused and len(held) == 1
    assert not OperationLock(tmp_path / "operation.lock").acquire()
    held[0].release()


def test_a_streaming_answer_is_not_quiet_and_answers_resume(tmp_path):
    answers, held = Answers(streaming=1), []
    assert not helper_restart.quiet(answers, tmp_path / "operation.lock", tmp_path / "update", held)
    assert not answers.paused and held == []


def test_an_update_from_a_shell_is_not_quiet(tmp_path, monkeypatch):
    updates = tmp_path / "update"
    monkeypatch.setattr(helper_restart, "update_running", lambda directory: directory == updates)
    answers, held = Answers(), []
    assert not helper_restart.quiet(answers, tmp_path / "operation.lock", updates, held)
    assert not answers.paused and held == []
    after = OperationLock(tmp_path / "operation.lock")
    assert after.acquire()  # the action lock was let go again
    after.release()


def test_a_failing_quiet_check_resumes_answers(tmp_path, monkeypatch):
    def broken(_directory):
        raise OSError("unreadable lock")

    monkeypatch.setattr(helper_restart, "update_running", broken)
    answers = Answers()
    with pytest.raises(OSError):
        helper_restart.quiet(answers, None, tmp_path / "update", [])
    assert not answers.paused


@pytest.mark.skipif(not hasattr(socket, "AF_UNIX"), reason="needs Unix sockets")
def test_the_inference_server_counts_requests_while_they_run(tmp_path):
    started, release = threading.Event(), threading.Event()

    class Slow(socketserver.BaseRequestHandler):
        def handle(self):
            started.set()
            release.wait(5)

    path = tmp_path / "inference.sock"
    server = provider_control.ThreadedUnixServer(str(path), Slow)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with socket.socket(socket.AF_UNIX) as client:
            client.connect(str(path))
            assert started.wait(5)
            assert server.active() == 1
            assert server.pause() == 1
            with socket.socket(socket.AF_UNIX) as late:
                late.connect(str(path))  # accepted by the kernel, refused by the server
                late.settimeout(5)
                assert late.recv(1) == b""
            assert server.active() == 1
            release.set()
        for _ in range(250):
            if server.active() == 0:
                break
            threading.Event().wait(0.02)
        assert server.active() == 0
    finally:
        server.shutdown()
        server.server_close()
