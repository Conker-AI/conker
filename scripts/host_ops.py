"""Host operations: the fixed allowlist the private host helper runs for the gateway (ADR-0014).

Each operation has typed arguments and runs the conker command contract with a fixed argv, never
a shell. Reads answer at once and leave no receipt. Actions run one at a time under the journal's
lock, refuse while the CLI's backup lock or recovery hold exists, and leave a receipt in the
journal. An action cut off before it finished becomes "unknown" with a check step; nothing here
retries it. `conker ops` uses this same module in-process, so the CLI works with the helper down.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

from scripts.host_ops_journal import OP_ID, Journal, OperationLock, finished, started
from scripts.host_ops_reads import (
    SERVICE,
    SNAPSHOT,
    backups,
    containers,
    holds,
    read_command,
)
from scripts.setup import SetupError, check_protection_policy
from scripts.update_check import offer_arguments, offered
from scripts.update_core import update_running

CUT_OFF = (
    "This was cut off before it finished, so it may or may not have happened. "
    "Check before trying again."
)
NO_START = "The command could not start on the server."
RELEASE = re.compile(r"[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}")


@dataclass(frozen=True)
class Operation:
    name: str
    read: bool
    arguments: dict[str, re.Pattern]
    # The read-only operation that shows what an action with an unknown outcome did.
    check: str | None = None
    timeout: int | None = None  # seconds; None: never stopped by the helper
    failure: str = ""


OPERATIONS = {
    item.name: item
    for item in (
        Operation("services.status", True, {}),
        Operation("backup.list", True, {}),
        Operation(
            "backup.verify",
            False,
            {"snapshot": SNAPSHOT},
            check="backup.verify",
            timeout=2 * 3600,
            failure="This backup did not pass its check. Do not rely on it; take a new backup.",
        ),
        Operation(
            "services.restart",
            False,
            {"service": SERVICE},
            check="services.status",
            timeout=15 * 60,
            failure="The service did not restart. Check its status and logs, then try again.",
        ),
        # Stopping a backup mid-capture would leave Conker's writers stopped, so it has no limit.
        Operation(
            "backup.run",
            False,
            {},
            check="backup.list",
            failure=(
                "The backup did not finish. Check that the backup disk is mounted "
                "and has space, then try again."
            ),
        ),
        # Replaces the running release (scripts/update_ubuntu.py): staged, snapshotted, verified,
        # rolled back on failure. Stopping it midway is worse than waiting, so it has no limit.
        Operation(
            "update.run",
            False,
            {"version": RELEASE},
            check="services.status",
            failure=(
                "The update did not finish. The Inbox says whether Conker went back to the "
                "version it had."
            ),
        ),
    )
}


class HostOpsError(ValueError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code = status, code


def invalid(message: str) -> HostOpsError:
    return HostOpsError(422, "invalid_host_operation", message)


def refused(message: str) -> HostOpsError:
    return HostOpsError(409, "host_operation_refused", message)


def busy(message: str) -> HostOpsError:
    return HostOpsError(409, "host_busy", message)


def unavailable(message: str) -> HostOpsError:
    return HostOpsError(503, "host_unavailable", message)


def operation_named(value: object, *, read: bool) -> Operation:
    operation = OPERATIONS.get(value) if isinstance(value, str) else None
    if operation is None or operation.read != read:
        raise invalid(f"This server {'read' if read else 'action'} is not allowed.")
    return operation


def typed_arguments(operation: Operation, value: object) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) != set(operation.arguments):
        raise invalid("Supply exactly this operation's arguments.")
    for key, pattern in operation.arguments.items():
        if not isinstance(value[key], str) or not pattern.fullmatch(value[key]):
            raise invalid(f"Supply a valid {key} name.")
    return {key: value[key] for key in sorted(value)}


def arguments_digest(operation: str, arguments: dict[str, str]) -> str:
    payload = json.dumps(
        {"operation": operation, "arguments": arguments},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def run_command(argv, *, cwd, env, timeout, keep_fd) -> int:
    """Run one fixed argv and keep no output. The child holds the lock too, so the lock lasts
    as long as the work, even if the helper dies first."""
    options = {}
    if os.name == "posix":
        options = {"start_new_session": True, "pass_fds": (keep_fd,)}
    process = subprocess.Popen(
        argv,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        **options,
    )
    try:
        return process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait()
        raise


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def thread_spawn(work) -> None:
    threading.Thread(target=work, daemon=True).start()


class HostOps:
    def __init__(
        self,
        root: Path,
        source: Path,
        layout: str,
        *,
        runner=run_command,
        reader=read_command,
        policy=None,
        now=utc_now,
        spawn=thread_spawn,
    ):
        if layout not in {"ubuntu", "repository"}:
            raise ValueError("Unknown installation layout.")
        self.root, self.source, self.layout = root.resolve(), source.resolve(), layout
        state = self.root / ("state" if layout == "ubuntu" else ".conker")
        directory = state / "host-ops"
        if directory.is_symlink():
            raise ValueError("The host operations folder must be a real folder.")
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name == "posix":
            directory.chmod(0o700)
        self.journal = Journal(directory)
        self.lock_path = directory / "operation.lock"
        self.runner, self.reader, self.now, self.spawn = runner, reader, now, spawn
        self.policy = policy or self._saved_policy

    def read(self, value: object) -> dict:
        if not isinstance(value, dict) or set(value) != {"operation", "arguments"}:
            raise invalid("Supply only the operation and its arguments.")
        operation = operation_named(value["operation"], read=True)
        typed_arguments(operation, value["arguments"])
        if operation.name == "services.status":
            result = {"services": self._containers(), **holds(self.root)}
        else:
            result = backups(self.root, self.policy())
        return {"operation": operation.name, "result": result}

    def start(self, value: object, *, source: str = "ui", wait: bool = False) -> dict:
        if not isinstance(value, dict) or set(value) != {
            "id",
            "operation",
            "arguments",
        }:
            raise invalid("Supply only id, operation and arguments.")
        identity = value["id"]
        if not isinstance(identity, str) or not OP_ID.fullmatch(identity):
            raise invalid("Use an id of 16 to 128 letters, digits or _.:-")
        operation = operation_named(value["operation"], read=False)
        arguments = typed_arguments(operation, value["arguments"])
        digest = arguments_digest(operation.name, arguments)
        # The client makes the id, so a retry returns the same action, never a second run.
        if (existing := self._existing(identity, digest)) is not None:
            return existing
        lock = OperationLock(self.lock_path)
        if not lock.acquire():
            if (existing := self._existing(identity, digest)) is not None:
                return existing
            raise busy("Another server action is running. Wait for it to finish.")
        try:
            receipts, _ = self.journal.receipts()
            if identity in receipts:
                lock.release()
                return cast(dict, self._existing(identity, digest))
            self._settle(receipts)
            self._require_no_hold()
            argv = self._command(operation, arguments)
            self.journal.append(
                started(identity, operation.name, arguments, digest, source, self.now())
            )
        except BaseException:
            lock.release()
            raise

        def work():
            self._finish(lock, operation, identity, argv)

        if wait:
            work()
        else:
            try:
                self.spawn(work)
            except BaseException:
                self.journal.append(finished(identity, "failed", NO_START, self.now()))
                lock.release()
                raise
        return cast(dict, self.receipt(identity))

    def _existing(self, identity: str, digest: str) -> dict | None:
        receipt = self.journal.receipts()[0].get(identity)
        if receipt is None:
            return None
        if receipt["argumentsDigest"] != digest:
            raise HostOpsError(
                409,
                "operation_id_conflict",
                "This id was already used for a different action.",
            )
        return self._public(receipt)

    def _require_no_hold(self) -> None:
        state = holds(self.root)
        if state["recoveryHeld"]:
            raise busy("A recovery is held. Finish or abort it with conker recovery-status first.")
        if state["backupLock"]:
            raise busy(
                "A backup is running or was cut off. Check the backup folder before trying again."
            )

    def _command(self, operation: Operation, arguments: dict[str, str]) -> list[str]:
        if operation.name == "services.restart":
            names = {row["service"] for row in self._containers() if not row["oneShot"]}
            if arguments["service"] not in names:
                raise refused("This installation has no service with that name.")
            # `conker restart pi` also restarts the services sharing Pi's network namespace.
            return self._conker("restart", arguments["service"])
        if operation.name == "update.run":
            # Only a release the daily check offered, by the commits its tags (Conker's and each
            # module's) named when first offered (the updater refuses one not newer than running).
            offer = offered(self.root / "state" / "update", arguments["version"])
            if offer is None:
                raise refused("Conker installs only a release its daily check offered.")
            return self._conker("update", "--to", arguments["version"], *offer_arguments(offer))
        destination = self._destination()
        if operation.name == "backup.run":
            return self._conker("setup", "run", "protection")
        snapshot = destination / arguments["snapshot"]
        if snapshot.is_symlink() or not snapshot.is_dir():
            raise refused("That backup is not in the backup folder.")
        return self._conker("verify-backup", str(snapshot))

    def _destination(self) -> Path:
        policy = self.policy()
        if policy is None:
            raise refused("No backup folder is saved yet. Choose one in setup first.")
        destination = Path(str(policy["destination"]))
        if destination.is_symlink() or not destination.is_dir():
            raise refused("The backup folder is not there. Check that the disk is mounted.")
        return destination

    def _finish(self, lock, operation: Operation, identity: str, argv: list[str]):
        outcome, reason = "unknown", CUT_OFF
        try:
            outcome, reason = self._execute(operation, argv, lock)
        finally:
            try:
                self.journal.append(finished(identity, outcome, reason, self.now()))
            finally:
                lock.release()

    def _execute(self, operation: Operation, argv: list[str], lock) -> tuple:
        try:
            code = self.runner(
                argv,
                cwd=self.root,
                env=self._environment(),
                timeout=operation.timeout,
                keep_fd=lock.fd,
            )
        except subprocess.TimeoutExpired:
            minutes = (operation.timeout or 0) // 60
            reason = f"This took longer than {minutes} minutes and was stopped."
            return "unknown", reason + " Check before trying again."
        except OSError:
            return "failed", NO_START
        return ("done", None) if code == 0 else ("failed", operation.failure)

    def settle(self) -> int:
        """Mark actions cut off by a crash or restart as unknown. Never runs them again."""
        receipts, _ = self.journal.receipts()
        if not any(row["outcome"] == "working" for row in receipts.values()):
            return 0
        lock = OperationLock(self.lock_path)
        if not lock.acquire():
            return 0  # still running somewhere
        try:
            return self._settle(self.journal.receipts()[0])
        finally:
            lock.release()

    def _settle(self, receipts: dict[str, dict]) -> int:
        stale = [key for key, row in receipts.items() if row["outcome"] == "working"]
        for identity in stale:
            self.journal.append(finished(identity, "unknown", CUT_OFF, self.now()))
        return len(stale)

    def receipts(self, limit: int = 50) -> dict:
        self.settle()
        receipts, damaged = self.journal.receipts()
        rows = [self._public(row) for row in reversed(receipts.values())]
        return {
            "schemaVersion": 1,
            "operations": rows[:limit],
            "damagedRecords": damaged,
        }

    def receipt(self, identity: str) -> dict | None:
        self.settle()
        row = self.journal.receipts()[0].get(identity)
        return self._public(row) if row else None

    @staticmethod
    def _public(row: dict) -> dict:
        operation = OPERATIONS.get(row["operation"])
        check = None
        if row["outcome"] == "unknown" and operation and operation.check:
            same = operation.check == operation.name
            check = {
                "operation": operation.check,
                "arguments": dict(row["arguments"]) if same else {},
            }
        return {**row, "check": check}

    def _containers(self) -> list[dict]:
        try:
            return containers(lambda argv, limit: self._read(argv, limit=limit))
        except (
            OSError,
            subprocess.SubprocessError,
            UnicodeError,
            ValueError,
            TypeError,
            AttributeError,
        ):
            raise unavailable("Docker did not answer.") from None

    def _saved_policy(self) -> dict | None:
        """The backup folder saved in setup (Pi), read as `conker setup protection` prints it."""
        try:
            raw = self._read(self._conker("setup", "protection"), limit=16384, timeout=60)
            value = json.loads(raw)
            if isinstance(value, dict) and value.get("destination") is None:
                return None
            return check_protection_policy(value)
        except (
            OSError,
            subprocess.SubprocessError,
            UnicodeError,
            ValueError,
            SetupError,
        ):
            raise unavailable("The saved backup folder could not be read.") from None

    def _conker(self, *arguments: str) -> list[str]:
        return ["bash", str(self.source / "conker"), *arguments]

    def _environment(self) -> dict[str, str]:
        return {
            **os.environ,
            "CONKER_LAYOUT": self.layout,
            "CONKER_DEPLOY_DIR": str(self.root),
            "NO_COLOR": "1",
        }

    def _read(self, argv: list[str], *, limit: int, timeout: int = 30) -> bytes:
        return self.reader(
            argv, cwd=self.root, env=self._environment(), timeout=timeout, limit=limit
        )


FIRST_CHECK = 10 * 60  # after the helper starts, so a fresh boot settles first
CHECK_EVERY = 24 * 3600
CHECK_TIMEOUT = 10 * 60


def check_for_updates(host: HostOps, runner=subprocess.run) -> bool:
    """One `conker update --check --report`: the newest release and any finished update go to
    the Inbox. Skipped while a server action runs or a `conker update` from a shell holds
    update.lock: an update moves the sources the check reads the running version from, and a
    release reported as running mid-update is no longer offered. Keeps no output; a failure is tried again at the next check. Only the Ubuntu layout: the
    repository layout cannot update to a release (`conker update --to` is refused there)."""
    if host.layout != "ubuntu":
        return False
    try:
        if update_running(host.root / "state" / "update"):
            return False
        lock = OperationLock(host.lock_path)
        if not lock.acquire():
            return False
        lock.release()
        runner(
            host._conker("update", "--check", "--report"),
            cwd=host.root,
            env=host._environment(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=CHECK_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return True


DOCKER_WAIT = 10 * 60  # after a reboot this user unit may start before Docker does
DOCKER_POLL = 10


def _docker_answers(runner, sleep) -> bool:
    deadline = time.monotonic() + DOCKER_WAIT
    while True:
        try:  # a socket-activated Docker can hang `docker info` until dockerd is up
            quiet = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL}
            answer = runner(["docker", "info"], **quiet, stderr=subprocess.DEVNULL, timeout=30)
            if answer.returncode == 0:
                return True
        except (OSError, subprocess.SubprocessError):
            pass  # not up yet (or no CLI yet): asked again until the wait runs out
        if time.monotonic() >= deadline:
            return False
        sleep(DOCKER_POLL)


def recover_interrupted_update(host: HostOps, runner=subprocess.run, sleep=time.sleep) -> bool:
    """At helper start (and before each daily check): `conker update --recover` when an update was
    cut off part way (a reboot, a killed helper), so Conker is not left between two versions. Runs
    only when the update store shows one in flight and is not held, once Docker answers (a
    rollback without Docker could not be proven and would hold), and only under the action lock,
    so no action starts meanwhile; an update still running keeps that lock (it inherits it) or its
    update.lock, and then nothing is done. No time limit: a rollback rebuilds and restarts."""
    store = host.root / "state" / "update"
    if host.layout != "ubuntu" or not (store / "active.json").exists():
        return False
    if (store / "HOLD.json").exists():
        return False  # the owner restores the snapshot; nothing here may touch it
    try:
        if not _docker_answers(runner, sleep):
            return False  # tried again before the next daily check
        lock = OperationLock(host.lock_path)
        if not lock.acquire():
            return False
        try:
            done = runner(
                host._conker("update", "--recover"),
                cwd=host.root,
                env=host._environment(),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
        finally:
            lock.release()
    except (OSError, subprocess.SubprocessError) as error:
        print(f"conker update --recover did not run: {error}", file=sys.stderr)
        return False
    if done.returncode != 0:  # the helper's log (journalctl --user); tried again tomorrow
        why = (done.stderr or "").strip()[-500:] or f"exit {done.returncode}"
        print(f"conker update --recover did not finish: {why}", file=sys.stderr)
    return done.returncode == 0


def watch_for_updates(
    host: HostOps, *, sleep=None, check=check_for_updates, recover=recover_interrupted_update
) -> None:
    """At start, recover a cut-off update; then the daily update check, each after another try at
    recovery, for the helper's lifetime (scripts/provider_control.py)."""
    pause = sleep or time.sleep
    with contextlib.suppress(Exception):
        recover(host)
    pause(FIRST_CHECK)
    while True:
        with contextlib.suppress(Exception):  # the watch outlives any one try; next try tomorrow
            recover(host)
        with contextlib.suppress(Exception):
            check(host)
        pause(CHECK_EVERY)


def route(host: HostOps | None, method: str, path: str, body: object) -> tuple:
    """The helper socket's /host routes. Messages are fixed plain words, never input or output."""
    try:
        if host is None:
            raise unavailable("Server actions are unavailable on this helper.")
        if method == "GET" and path == "/host/ops":
            return 200, host.receipts()
        if method == "GET" and path.startswith("/host/ops/"):
            identity = path.removeprefix("/host/ops/")
            receipt = host.receipt(identity) if OP_ID.fullmatch(identity) else None
            if receipt is None:
                return 404, {"error": "unknown_operation_id"}
            return 200, receipt
        if method == "POST" and path == "/host/ops":
            return 200, host.start(body)
        if method == "POST" and path == "/host/read":
            return 200, host.read(body)
        return 404, {"error": "unsupported_operation"}
    except HostOpsError as error:
        return error.status, {"error": error.code, "message": str(error)}
    except OSError:
        return 503, {
            "error": "host_unavailable",
            "message": "The host helper could not reach its journal.",
        }
