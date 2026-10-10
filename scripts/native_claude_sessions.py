"""Bounded owner observations of Claude's own background-session registry.

No prompts, approvals, launches, resumes or copied transcripts. Native session
identity, state and output remain owned by the isolated Claude installation.
"""

import hashlib
import json
import os
import re
import subprocess
import threading
import time
import unicodedata
from contextlib import contextmanager
from pathlib import Path

from native_claude import environment

IDENTITY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}", re.ASCII)
DIGEST = re.compile(r"[0-9a-f]{64}", re.ASCII)
STATES = {"working", "blocked", "done", "failed", "stopped"}
PROCESS_STATUSES = {"busy", "waiting", "idle"}
WAITING = {
    "permission prompt": "permission_prompt",
    "input needed": "input_needed",
    "sandbox request": "sandbox_request",
    "worker request": "worker_request",
    "dialog open": "dialog_open",
}
MAX_INTEGER = 9007199254740991
MAX_STDOUT = 1048576
MAX_STDERR = 8192
MAX_OUTPUT = 65536
MAX_RESULTS = 100
OPERATION_SECONDS = 20
ANSI = re.compile(
    r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-_]"
)


class SessionError(ValueError):
    def __init__(self, code="native_sessions_unavailable", status=503):
        super().__init__(code)
        self.status = status


def session_id(value):
    if not isinstance(value, str) or not IDENTITY.fullmatch(value):
        raise SessionError("invalid_native_session_request", 422)
    return value


def _safe_text(value):
    return "".join(
        character
        for character in value
        if unicodedata.category(character) not in {"Cc", "Cf", "Cs"}
    )


def _json(raw):
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise ValueError()
            result[key] = value
        return result

    def invalid(_value):
        raise ValueError()

    return json.loads(
        raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=invalid
    )


def stop_payload(raw):
    try:
        if not 1 <= len(raw) <= 1024:
            raise ValueError()
        return _json(raw)
    except (ValueError, TypeError, RecursionError, UnicodeError):
        raise SessionError("invalid_native_session_request", 422) from None


class Sessions:
    def __init__(self, executable, home):
        self.executable, self.home = Path(executable), Path(home)
        self.scope = os.path.normcase(str(self.home.resolve()))
        self.lock = threading.Lock()
        self.command_lock = threading.Lock()
        self.closed = threading.Event()
        self.process = None

    def close(self):
        self.closed.set()
        with self.command_lock:
            if self.process is not None and self.process.poll() is None:
                try:
                    self.process.kill()
                except OSError:
                    pass

    @contextmanager
    def _operation(self):
        # A poll cannot start an unbounded queue of native CLI subprocesses.
        if not self.lock.acquire(blocking=False):
            raise SessionError()
        try:
            if (
                self.closed.is_set()
                or not self.executable.is_file()
                or not self.home.is_dir()
            ):
                raise SessionError()
            yield time.monotonic() + OPERATION_SECONDS
        finally:
            self.lock.release()

    def _run(self, arguments, deadline):
        if self.closed.is_set() or time.monotonic() >= deadline:
            raise SessionError()
        process = None
        streams = []
        try:
            with self.command_lock:
                if self.closed.is_set():
                    raise SessionError()
                process = subprocess.Popen(
                    [str(self.executable), *arguments],
                    cwd=self.home,
                    env=environment(self.home),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    **(
                        {"creationflags": subprocess.CREATE_NO_WINDOW}
                        if os.name == "nt"
                        else {}
                    ),
                )
                self.process = process
            streams = [process.stdout, process.stderr]
            for stream in streams:
                # Python 3.12 supports nonblocking pipe descriptors on Windows.
                # No reader thread can be stranded by a supervisor inheriting a pipe.
                os.set_blocking(stream.fileno(), False)
            opened = {0, 1}
            stdout, stderr_bytes = bytearray(), 0
            while opened or process.poll() is None:
                if self.closed.is_set() or time.monotonic() >= deadline:
                    raise SessionError()
                progress = False
                for index in tuple(opened):
                    try:
                        chunk = os.read(streams[index].fileno(), 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        opened.remove(index)
                        continue
                    progress = True
                    if index == 0:
                        if len(stdout) + len(chunk) > MAX_STDOUT:
                            raise SessionError()
                        stdout.extend(chunk)
                    else:
                        stderr_bytes += len(chunk)
                        if stderr_bytes > MAX_STDERR:
                            raise SessionError()
                if not progress:
                    time.sleep(min(0.01, max(0, deadline - time.monotonic())))
            if process.returncode != 0:
                raise SessionError()
            return bytes(stdout)
        except (OSError, ValueError, subprocess.SubprocessError):
            raise SessionError() from None
        finally:
            if process is not None:
                # Only the observation/control command is ours. A native supervisor
                # and its jobs may outlive it; never kill descendants or registry PIDs.
                if process.poll() is None:
                    try:
                        process.kill()
                        process.wait(timeout=2)
                    except (OSError, subprocess.SubprocessError):
                        pass
                for stream in streams:
                    stream.close()
                with self.command_lock:
                    if self.process is process:
                        self.process = None

    def _row(self, value):
        if not isinstance(value, dict):
            raise SessionError()
        if value.get("kind") != "background":
            return None
        identity, native_session = value.get("id"), value.get("sessionId")
        cwd, started = value.get("cwd"), value.get("startedAt")
        if (
            not isinstance(identity, str)
            or not IDENTITY.fullmatch(identity)
            or native_session is not None
            and (
                not isinstance(native_session, str)
                or not IDENTITY.fullmatch(native_session)
            )
            or not isinstance(cwd, str)
            or not 1 <= len(cwd) <= 4096
            or cwd != _safe_text(cwd)
            or type(started) is not int
            or not 0 <= started <= MAX_INTEGER
        ):
            raise SessionError()
        name = value.get("name")
        if name is not None and not isinstance(name, str):
            raise SessionError()
        parts = [
            "claude-background-v1",
            self.scope,
            identity,
            native_session,
            started,
            cwd,
        ]
        digest = hashlib.sha256(
            json.dumps(parts, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        state, status, waiting = (
            value.get("state"),
            value.get("status"),
            value.get("waitingFor"),
        )
        # Missing/new enum values are unknown evidence, never successful completion.
        state = state if isinstance(state, str) and state in STATES else "unknown"
        status = (
            status if isinstance(status, str) and status in PROCESS_STATUSES else None
        )
        waiting = (
            WAITING.get(waiting)
            if isinstance(waiting, str) and status == "waiting"
            else None
        )
        return {
            "id": identity,
            "identity": digest,
            "sessionId": native_session,
            "name": _safe_text(name)[:300] if name is not None else None,
            "cwd": cwd,
            "startedAt": started,
            "state": state,
            "processStatus": status,
            "waitingFor": waiting,
            "canStop": state in {"working", "blocked"},
        }

    def _discover(self, deadline):
        try:
            value = _json(self._run(["agents", "--json", "--all"], deadline))
            if not isinstance(value, list) or len(value) > 4096:
                raise SessionError()
            rows, seen, omitted = [], set(), 0
            for item in value:
                row = self._row(item)
                if row is None:
                    omitted += 1
                    continue
                if row["id"] in seen:
                    raise SessionError()
                seen.add(row["id"])
                rows.append(row)
            return sorted(rows, key=lambda row: (-row["startedAt"], row["id"])), omitted
        except (ValueError, TypeError, RecursionError, UnicodeError):
            raise SessionError() from None

    def _find(self, identity, deadline):
        rows, _omitted = self._discover(deadline)
        for row in rows:
            if row["id"] == identity:
                return row
        raise SessionError("native_session_not_found", 404)

    def list(self):
        with self._operation() as deadline:
            rows, omitted = self._discover(deadline)
            return {
                "schemaVersion": 1,
                "provider": "claude",
                "scope": "background_sessions",
                "results": rows[:MAX_RESULTS],
                "truncated": len(rows) > MAX_RESULTS,
                "omittedCount": omitted,
            }

    def status(self, identity):
        session_id(identity)
        with self._operation() as deadline:
            return {
                "schemaVersion": 1,
                "provider": "claude",
                "result": self._find(identity, deadline),
            }

    def output(self, identity):
        session_id(identity)
        with self._operation() as deadline:
            before = self._find(identity, deadline)
            raw = self._run(["logs", identity], deadline)
            after = self._find(identity, deadline)
            if before["identity"] != after["identity"]:
                raise SessionError("native_session_changed", 409)
            text = ANSI.sub("", raw.decode("utf-8", errors="replace"))
            text = "".join(
                character
                for character in text
                if character in "\t\r\n"
                or unicodedata.category(character) not in {"Cc", "Cf", "Cs"}
            )
            encoded = text.encode("utf-8")
            # Recent output is a bounded tail, never a silently complete transcript.
            text = encoded[-MAX_OUTPUT:].decode("utf-8", errors="ignore")
            return {
                "schemaVersion": 1,
                "provider": "claude",
                "id": identity,
                "identity": before["identity"],
                "text": text,
                "truncated": len(encoded) > MAX_OUTPUT,
                "outputPersisted": False,
            }

    def stop(self, identity, value):
        session_id(identity)
        if (
            not isinstance(value, dict)
            or set(value) != {"expectedIdentity"}
            or not isinstance(value["expectedIdentity"], str)
            or not DIGEST.fullmatch(value["expectedIdentity"])
        ):
            raise SessionError("invalid_native_session_request", 422)
        expected = value["expectedIdentity"]
        with self._operation() as deadline:
            row = self._find(identity, deadline)
            if row["identity"] != expected:
                raise SessionError("native_session_changed", 409)
            if not row["canStop"]:
                raise SessionError("native_session_not_stoppable", 409)
            self._run(["stop", identity], deadline)
            return {
                "schemaVersion": 1,
                "provider": "claude",
                "id": identity,
                "identity": expected,
                "status": "stop_requested",
                "automaticReplay": False,
            }
