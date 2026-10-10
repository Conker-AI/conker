"""Bounded saved-history observations from an isolated, owned Codex app-server.

This observer never loads a thread or observes activity in other processes. The
native history listing may maintain its own index; Conker keeps no transcript.
"""

import base64
import hashlib
import json
import os
import re
import subprocess
import threading
import time
import unicodedata
from collections.abc import Mapping
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import parse_qsl

from chatgpt_provider import CODEX_VERSION
from native_claude_sessions import SessionError, _json

THREAD_ID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", re.ASCII)
CURSOR = re.compile(r"[A-Za-z0-9_-]{1,8192}", re.ASCII)
MAX_INTEGER = 9007199254740991
MAX_STDOUT = 4 * 1024 * 1024
MAX_STDERR = 8192
OPERATION_SECONDS = 20
SOURCE_KINDS = (
    "cli",
    "vscode",
    "exec",
    "appServer",
    "subAgent",
    "subAgentReview",
    "subAgentCompact",
    "subAgentThreadSpawn",
    "subAgentOther",
    "unknown",
)
METHODS = frozenset({"initialize", "thread/list", "thread/read"})


def invalid():
    return SessionError("invalid_native_session_request", 422)


def thread_id(value):
    if not isinstance(value, str) or not THREAD_ID.fullmatch(value):
        raise invalid()
    return value


def list_query(values):
    """Validate both CLI values and the exact HTTP query representations."""
    if not isinstance(values, Mapping) or set(values) - {"limit", "archived", "cursor"}:
        raise invalid()
    limit, archived, cursor = (
        values.get("limit", 25),
        values.get("archived", False),
        values.get("cursor"),
    )
    if isinstance(limit, str) and re.fullmatch(r"[1-9][0-9]?", limit, re.ASCII):
        limit = int(limit)
    if type(limit) is not int or not 1 <= limit <= 50:
        raise invalid()
    if isinstance(archived, str) and archived in {"true", "false"}:
        archived = archived == "true"
    if type(archived) is not bool:
        raise invalid()
    if cursor is not None and (
        not isinstance(cursor, str) or not CURSOR.fullmatch(cursor)
    ):
        raise invalid()
    return {"limit": limit, "archived": archived, "cursor": cursor}


def raw_list_query(raw):
    try:
        if not isinstance(raw, bytes) or len(raw) > 8500:
            raise ValueError()
        pairs = parse_qsl(
            raw.decode("ascii"),
            keep_blank_values=True,
            strict_parsing=True,
            encoding="utf-8",
            errors="strict",
            max_num_fields=3,
        )
        if len({key for key, _ in pairs}) != len(pairs):
            raise ValueError()
        return list_query(dict(pairs))
    except (ValueError, UnicodeError):
        raise invalid() from None


def environment(home):
    keep = (
        "SYSTEMROOT",
        "WINDIR",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "PATH",
        "HOME",
    )
    result = {key: os.environ[key] for key in keep if key in os.environ}
    result.update(CODEX_HOME=str(home), NO_COLOR="1")
    return result


def display(value, limit, *, nullable=False):
    if value is None and nullable:
        return None
    if not isinstance(value, str):
        raise SessionError()
    return "".join(
        character
        for character in value
        if unicodedata.category(character) not in {"Cc", "Cf", "Cs"}
    )[:limit]


def _source(value):
    if isinstance(value, str) and value in {"cli", "vscode", "exec", "appServer"}:
        return value
    if isinstance(value, dict) and set(value) == {"subAgent"}:
        return "subAgent"
    if isinstance(value, dict) and set(value) == {"custom"}:
        return "custom"
    return "unknown"


def _row(value):
    if not isinstance(value, dict) or value.get("turns") != []:
        raise SessionError()
    try:
        identity = thread_id(value.get("id"))
    except SessionError:
        raise SessionError() from None
    if value.get("ephemeral") is not False:
        raise SessionError()
    created, updated = value.get("createdAt"), value.get("updatedAt")
    if any(
        type(item) is not int or not 0 <= item <= MAX_INTEGER
        for item in (created, updated)
    ):
        raise SessionError()
    cwd, provider = value.get("cwd"), value.get("modelProvider")
    if (
        not isinstance(cwd, str)
        or not 1 <= len(cwd) <= 4096
        or cwd != display(cwd, 4096)
        or not isinstance(provider, str)
        or not 1 <= len(provider) <= 200
        or provider != display(provider, 200)
    ):
        raise SessionError()
    preview = display(value.get("preview"), MAX_STDOUT)
    return {
        "id": identity,
        "name": display(value.get("name"), 300, nullable=True),
        "preview": preview[:500],
        "previewTruncated": len(preview) > 500,
        "cwd": cwd,
        "createdAt": created,
        "updatedAt": updated,
        "modelProvider": provider,
        "source": _source(value.get("source")),
    }


class _Command:
    def __init__(self, owner, process, deadline):
        self.owner, self.process, self.deadline = owner, process, deadline
        self.buffer = bytearray()
        self.counts = [0, 0]
        self.opened = {0, 1}
        self.sequence = 0
        for stream in (process.stdin, process.stdout, process.stderr):
            os.set_blocking(stream.fileno(), False)

    def check(self):
        if self.owner.closed.is_set() or time.monotonic() >= self.deadline:
            raise SessionError()

    def pump(self):
        self.check()
        progress = False
        for index in tuple(self.opened):
            stream = (self.process.stdout, self.process.stderr)[index]
            try:
                chunk = os.read(stream.fileno(), 65536)
            except BlockingIOError:
                continue
            if not chunk:
                self.opened.remove(index)
                continue
            progress = True
            self.counts[index] += len(chunk)
            if self.counts[index] > (MAX_STDOUT if index == 0 else MAX_STDERR):
                raise SessionError()
            if index == 0:
                self.buffer.extend(chunk)
        if not progress:
            time.sleep(min(0.01, max(0, self.deadline - time.monotonic())))

    def write(self, value):
        raw = (
            json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            + b"\n"
        )
        while raw:
            self.check()
            try:
                count = os.write(self.process.stdin.fileno(), raw)
            except BlockingIOError:
                self.pump()
                continue
            if count == 0:
                raise SessionError()
            raw = raw[count:]

    def all_output(self):
        while self.opened or self.process.poll() is None:
            self.pump()
        if self.process.returncode != 0:
            raise SessionError()
        return bytes(self.buffer)

    def call(self, method, params):
        if method not in METHODS:
            raise SessionError()
        self.sequence += 1
        self.write({"id": self.sequence, "method": method, "params": params})
        while True:
            self.check()
            if b"\n" not in self.buffer:
                if 0 not in self.opened:
                    raise SessionError()
                self.pump()
                continue
            line, _, remaining = self.buffer.partition(b"\n")
            self.buffer[:] = remaining
            value = _json(line)
            if not isinstance(value, dict):
                raise SessionError()
            if "id" not in value and isinstance(value.get("method"), str):
                # Notifications confer no authority. Never answer a server request.
                continue
            if (
                type(value.get("id")) is not int
                or value["id"] != self.sequence
                or "method" in value
            ):
                raise SessionError()
            if "error" in value:
                error = value["error"]
                if isinstance(error, dict) and error.get("code") == -32600:
                    message = error.get("message")
                    if (
                        method == "thread/read"
                        and message == f"thread not loaded: {params['threadId']}"
                    ):
                        raise SessionError("native_session_not_found", 404)
                    if (
                        method == "thread/list"
                        and params.get("cursor") is not None
                        and isinstance(message, str)
                        and "cursor" in message.lower()
                        and "invalid" in message.lower()
                    ):
                        raise invalid()
                raise SessionError()
            if not isinstance(value.get("result"), dict):
                raise SessionError()
            return value["result"]


class Sessions:
    def __init__(self, executable, home):
        self.executable, self.home = Path(executable), Path(home)
        self.scope = hashlib.sha256(
            os.path.normcase(str(self.home.resolve())).encode("utf-8")
        ).hexdigest()
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
    def _command(self, arguments, deadline):
        process = None
        try:
            with self.command_lock:
                if self.closed.is_set() or time.monotonic() >= deadline:
                    raise SessionError()
                process = subprocess.Popen(
                    [str(self.executable), *arguments],
                    cwd=self.home,
                    env=environment(self.home),
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    **(
                        {"creationflags": subprocess.CREATE_NO_WINDOW}
                        if os.name == "nt"
                        else {}
                    ),
                )
                self.process = process
            yield _Command(self, process, deadline)
        except SessionError:
            raise
        except (
            OSError,
            ValueError,
            TypeError,
            RecursionError,
            subprocess.SubprocessError,
        ):
            raise SessionError() from None
        finally:
            if process is not None:
                # Independent native jobs are not descendants owned by this observer.
                # Never use taskkill /T, process groups, or native registry PIDs.
                if process.poll() is None:
                    try:
                        process.kill()
                        process.wait(timeout=2)
                    except (OSError, subprocess.SubprocessError):
                        pass
                for stream in (process.stdin, process.stdout, process.stderr):
                    stream.close()
                with self.command_lock:
                    if self.process is process:
                        self.process = None

    @contextmanager
    def _observer(self):
        if not self.lock.acquire(blocking=False):
            raise SessionError()
        try:
            if (
                self.closed.is_set()
                or not self.executable.is_file()
                or not self.home.is_dir()
                or self.home.is_symlink()
            ):
                raise SessionError()
            deadline = time.monotonic() + OPERATION_SECONDS
            with self._command(["--version"], deadline) as command:
                if (
                    command.all_output().decode("utf-8").strip()
                    != f"codex-cli {CODEX_VERSION}"
                ):
                    raise SessionError()
            with self._command(
                ["app-server", "--stdio", "-c", 'cli_auth_credentials_store="file"'],
                deadline,
            ) as command:
                command.call(
                    "initialize",
                    {
                        "clientInfo": {
                            "name": "conker_saved_history",
                            "version": "1.0.0",
                        }
                    },
                )
                command.write({"method": "initialized"})
                yield command
        except SessionError:
            raise
        except (ValueError, TypeError, RecursionError, OSError):
            raise SessionError() from None
        finally:
            self.lock.release()

    def _cursor(self, native, query):
        if native is None:
            return None
        if not isinstance(native, str) or not 1 <= len(native.encode("utf-8")) <= 4096:
            raise SessionError()
        value = {
            "v": 1,
            "scope": self.scope,
            "limit": query["limit"],
            "archived": query["archived"],
            "cursor": native,
        }
        raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        result = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
        if not CURSOR.fullmatch(result):
            raise SessionError()
        return result

    def _native_cursor(self, query):
        cursor = query["cursor"]
        if cursor is None:
            return None
        try:
            raw = base64.b64decode(
                cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True
            )
            value = _json(raw)
            if (
                not isinstance(value, dict)
                or set(value) != {"v", "scope", "limit", "archived", "cursor"}
                or type(value["v"]) is not int
                or value["v"] != 1
                or value["scope"] != self.scope
                or type(value["limit"]) is not int
                or value["limit"] != query["limit"]
                or type(value["archived"]) is not bool
                or value["archived"] != query["archived"]
                or self._cursor(value["cursor"], query) != cursor
            ):
                raise ValueError()
            return value["cursor"]
        except (ValueError, TypeError, UnicodeError, RecursionError):
            raise invalid() from None

    @staticmethod
    def _envelope():
        return {
            "schemaVersion": 1,
            "provider": "codex",
            "scope": "saved_threads",
            "runtimeVisibility": "observer_only",
        }

    def list(self, values=None):
        query = list_query({} if values is None else values)
        cursor = self._native_cursor(query)
        with self._observer() as observer:
            params = {
                "limit": query["limit"],
                "archived": query["archived"],
                "sortKey": "updated_at",
                "sortDirection": "desc",
                "sourceKinds": list(SOURCE_KINDS),
            }
            if cursor is not None:
                params["cursor"] = cursor
            result = observer.call("thread/list", params)
            rows = result.get("data")
            if not isinstance(rows, list) or len(rows) > query["limit"]:
                raise SessionError()
            normalized = [_row(value) for value in rows]
            if len({value["id"] for value in normalized}) != len(normalized):
                raise SessionError()
            next_cursor = self._cursor(result.get("nextCursor"), query)
            if next_cursor is not None and next_cursor == query["cursor"]:
                raise SessionError()
            return {
                **self._envelope(),
                "archived": query["archived"],
                "results": normalized,
                "nextCursor": next_cursor,
            }

    def status(self, identity):
        identity = thread_id(identity)
        with self._observer() as observer:
            result = observer.call(
                "thread/read", {"threadId": identity, "includeTurns": False}
            )
            value = _row(result.get("thread"))
            if value["id"] != identity:
                raise SessionError()
            return {**self._envelope(), "session": value}
