"""The update check on demand (ADR-0014, amended 2026-11-21): one gate for the daily check and
for the dashboard's "check now" read (`update.check`).

The helper socket serves one request at a time, so a request never waits for GitHub: the check
runs in a background thread and the answer says at once what happened. At most one check runs
(single flight, daily or on demand), and a finished check closes the door for a while, because
GitHub's anonymous API allows 60 requests an hour for the whole address. The time is the wall
clock; the stamp lives in memory, so a restarted helper (it restarts itself after every update)
checks again at once, which is wanted: that check closes the old offer in Pi.
"""

from __future__ import annotations

import contextlib
import os
import signal
import subprocess
import threading
import time
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from scripts.host_ops_journal import OperationLock
from scripts.update_core import update_running

if TYPE_CHECKING:
    from scripts.host_ops import HostOps

SUCCESS_GAP = 90  # seconds with no new check after one that worked
FAILURE_GAP = 15 * 60  # and after one that failed (GitHub down, or its hourly limit used up)
REPORT_GAP = 60  # but GitHub answered and only Pi could not be told: try again soon
GITHUB_EXIT, REPORT_EXIT = 1, 3  # `conker update --check` exit codes (scripts/update_check.py)
ON_DEMAND_TIMEOUT = 120  # a hung GitHub must not leave "running" for the daily path's 10 minutes


def iso(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    return datetime.fromtimestamp(seconds, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_in_group(argv, *, timeout, **options) -> subprocess.CompletedProcess:
    """subprocess.run, but a timeout ends the whole process group: `conker` is a shell script that
    starts python, and killing only the shell would leave the check running unseen."""
    options.pop("check", None)
    with subprocess.Popen(argv, **options, start_new_session=os.name == "posix") as process:
        try:
            return subprocess.CompletedProcess(argv, process.wait(timeout=timeout))
        except subprocess.TimeoutExpired:
            if os.name == "posix":
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.wait()
            raise


class UpdateCheckGate:
    def __init__(self, *, spawn, runner=None, clock=time.time):
        self.spawn, self.runner, self.clock = spawn, runner, clock
        self._guard = threading.Lock()
        self._running = False
        self._checked_at: float | None = None
        self._ok: bool | None = None
        self._why: str | None = None  # why the last finished check failed
        self._next_after = 0.0

    def _answer(self, state: str, reason: str | None = None) -> dict:
        with self._guard:
            now = self.clock()
            if reason is None and self._ok is False and state == "fresh":
                reason = self._why  # started and running are not outcomes: no reason
            return {
                "state": state,
                "checkedAt": iso(self._checked_at),
                "ok": self._ok,
                "reason": reason,
                "nextCheckAfter": iso(self._next_after) if self._next_after > now else None,
            }

    def _claim(self) -> bool:
        with self._guard:
            if self._running:
                return False
            self._running = True
            return True

    def _finish(self, code: int | None) -> None:
        """Close the flight. `code` is the check's exit code, None when it could not run."""
        with self._guard:
            now = self.clock()
            ok = code == 0
            self._checked_at, self._ok = now, ok
            if ok:
                self._why, gap = None, SUCCESS_GAP
            elif code == REPORT_EXIT:
                self._why, gap = "failed", REPORT_GAP
            else:
                self._why = "github_unreachable" if code == GITHUB_EXIT else "failed"
                gap = FAILURE_GAP
            self._next_after = now + gap
            self._running = False

    def _unclaim(self) -> None:
        with self._guard:
            self._running = False

    @staticmethod
    def _command(host: HostOps) -> dict:
        return {
            "args": host._conker("update", "--check", "--report"),
            "cwd": host.root,
            "env": host._environment(),
        }

    def _run(self, host: HostOps, runner, timeout: int) -> int:
        """One `conker update --check --report`; no output is kept. Returns its exit code."""
        command = self._command(host)
        done = runner(
            command["args"],
            cwd=command["cwd"],
            env=command["env"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=False,
        )
        return getattr(done, "returncode", 0)

    def daily(self, host: HostOps, runner, timeout: int) -> bool:
        """The daily check: not throttled, but it shares the single flight and leaves the stamp.
        False when it did not run (another check is running, an action or an update holds its
        lock, the repository layout) or could not run; True once the command ran, whatever it
        found."""
        if host.layout != "ubuntu" or not self._claim():
            return False
        code: int | None = None
        ran: bool | None = False
        try:
            if update_running(host.root / "state" / "update"):
                return False
            lock = OperationLock(host.lock_path)
            if not lock.acquire():
                return False
            lock.release()
            ran = True
            code = self._run(host, runner, timeout)
        except (OSError, subprocess.SubprocessError):
            ran = None  # counted as a failed check below, but it did not run
        finally:
            # Whatever happened, the flight ends: a stuck "running" would block every later check.
            if ran is not False:
                self._finish(code)
            else:
                self._unclaim()
        return ran is True

    def request(self, host: HostOps, *, wait: bool = False) -> dict:
        """The `update.check` read: start one check in the background unless one is running, the
        last one was recent, or an update or another action holds its lock (probed, not kept). `wait` (the CLI,
        whose process would end first) runs it here instead."""
        if host.layout != "ubuntu":
            return self._answer("unsupported")
        with self._guard:
            running, quiet = self._running, self._next_after > self.clock()
        if running:
            return self._answer("running")
        if quiet:
            return self._answer("fresh")
        try:
            if update_running(host.root / "state" / "update"):
                return self._answer("skipped", "update_running")
            lock = OperationLock(host.lock_path)
            if not lock.acquire():
                return self._answer("skipped", "host_busy")
            lock.release()  # only a probe: the check is a read, and must not make an action busy
        except OSError:
            return self._answer("skipped", "failed")
        if not self._claim():  # another request won the race for the flight
            return self._answer("running")

        def work() -> None:
            code: int | None = None
            try:
                code = self._run(host, self.runner or run_in_group, ON_DEMAND_TIMEOUT)
            except (OSError, subprocess.SubprocessError):
                pass  # fixed words in the answer: the child's output is never kept
            finally:
                self._finish(code)

        try:
            if wait:
                work()
            else:
                self.spawn(work)
        except BaseException:
            self._unclaim()
            raise
        return self._answer("started")
