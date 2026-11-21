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
ON_DEMAND_TIMEOUT = 120  # a hung GitHub must not leave "running" for the daily path's 10 minutes


def iso(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    return datetime.fromtimestamp(seconds, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class UpdateCheckGate:
    def __init__(self, *, spawn, runner=None, clock=time.time):
        self.spawn, self.runner, self.clock = spawn, runner, clock
        self._guard = threading.Lock()
        self._running = False
        self._checked_at: float | None = None
        self._ok: bool | None = None
        self._next_after = 0.0

    def _answer(self, state: str, reason: str | None = None) -> dict:
        with self._guard:
            now = self.clock()
            if reason is None and self._ok is False and state in {"fresh", "running", "started"}:
                reason = "failed"
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

    def _finish(self, ok: bool) -> None:
        with self._guard:
            now = self.clock()
            self._checked_at, self._ok = now, ok
            self._next_after = now + (SUCCESS_GAP if ok else FAILURE_GAP)
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

    def _run(self, host: HostOps, runner, timeout: int) -> bool:
        """One `conker update --check --report`; no output is kept. True when it ended 0."""
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
        return getattr(done, "returncode", 0) == 0

    def daily(self, host: HostOps, runner, timeout: int) -> bool:
        """The daily check: not throttled, but it shares the single flight and leaves the stamp.
        False when it did not run (another check is running, an action or an update holds its
        lock, the repository layout) or could not run; True once the command ran, whatever it
        found."""
        if host.layout != "ubuntu" or not self._claim():
            return False
        ran = False
        try:
            if update_running(host.root / "state" / "update"):
                return False
            lock = OperationLock(host.lock_path)
            if not lock.acquire():
                return False
            lock.release()
            ran = True
            self._finish(self._run(host, runner, timeout))
        except (OSError, subprocess.SubprocessError):
            if ran:
                self._finish(False)
            return False
        finally:
            if not ran:
                self._unclaim()
        return True

    def request(self, host: HostOps, *, wait: bool = False) -> dict:
        """The `update.check` read: start one check in the background unless one is running, the
        last one was recent, or an update or another action holds its lock. `wait` (the CLI,
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
        except OSError:
            return self._answer("skipped", "failed")
        if not self._claim():  # another request won the race for the flight
            lock.release()
            return self._answer("running")

        def work() -> None:
            ok = False
            try:
                ok = self._run(host, self.runner or subprocess.run, ON_DEMAND_TIMEOUT)
            except (OSError, subprocess.SubprocessError):
                pass  # fixed words in the answer: the child's output is never kept
            finally:
                self._finish(ok)
                lock.release()

        try:
            if wait:
                work()
            else:
                self.spawn(work)
        except BaseException:
            self._unclaim()
            lock.release()
            raise
        return self._answer("started")
