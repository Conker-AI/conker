"""ChatGPT subscription auth, isolated from the browser and Pi's tool runtime.

The official Codex app-server owns OAuth and refresh. Only its account/catalogue
methods are used: no threads, turns, commands, MCP, or Codex agent execution.
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import threading
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

CODEX_VERSION = "0.160.1"
DEVICE_URL = "https://auth.openai.com/codex/device"
RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses"
MODEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$")
IDENTITY = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
METHODS = {
    "initialize",
    "account/read",
    "account/login/start",
    "account/login/cancel",
    "account/logout",
    "model/list",
}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


class ChatGPTError(ValueError):
    pass


class CodexAccounts:
    """Small bounded stdio RPC client. Provider errors and tokens never escape."""

    def __init__(self, executable: Path, home: Path):
        self.executable, self.home = executable, home
        self.process = None
        self.calls = threading.RLock()
        self.condition = threading.Condition()
        self.responses = {}
        self.notifications = []
        self.sequence = 0

    def start(self):
        if self.process and self.process.poll() is None:
            return
        if self.home.is_symlink():
            raise ChatGPTError("runtime_unavailable")
        self.home.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.home.chmod(0o700)
        environment = {
            "HOME": str(Path.home()),
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "CODEX_HOME": str(self.home),
            "NO_COLOR": "1",
        }
        try:
            version = (
                subprocess.run(
                    [str(self.executable), "--version"],
                    env=environment,
                    capture_output=True,
                    timeout=10,
                    check=True,
                )
                .stdout.decode()
                .strip()
            )
            if version != f"codex-cli {CODEX_VERSION}":
                raise ChatGPTError("runtime_version_mismatch")
            self.responses.clear()
            self.notifications.clear()
            self.process = subprocess.Popen(
                [
                    str(self.executable),
                    "app-server",
                    "-c",
                    'cli_auth_credentials_store="file"',
                ],
                env=environment,
                cwd=self.home,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
                umask=0o077,
            )
            threading.Thread(
                target=self._read, args=(self.process,), daemon=True
            ).start()
            self.call(
                "initialize", {"clientInfo": {"name": "conker", "version": "1.0.0"}}
            )
            self.process.stdin.write(b'{"method":"initialized"}\n')
            self.process.stdin.flush()
        except (OSError, subprocess.SubprocessError):
            self.close()
            raise ChatGPTError("runtime_unavailable") from None

    def _read(self, process):
        try:
            while True:
                line = process.stdout.readline(1024 * 1024 + 1)
                if not line or len(line) > 1024 * 1024:
                    break
                value = json.loads(line)
                if not isinstance(value, dict):
                    break
                with self.condition:
                    if "id" in value:
                        self.responses[value["id"]] = value
                    elif value.get("method") == "account/login/completed":
                        self.notifications.append(value.get("params", {}))
                        self.notifications = self.notifications[-8:]
                    self.condition.notify_all()
        except (ValueError, OSError):
            pass
        finally:
            if process.poll() is None:
                process.terminate()
            with self.condition:
                self.condition.notify_all()

    def call(self, method, params=None):
        if method not in METHODS:
            raise ChatGPTError("unsupported_operation")
        with self.calls:
            if method != "initialize":
                self.start()
            self.sequence += 1
            identity = self.sequence
            try:
                self.process.stdin.write(
                    json.dumps(
                        {"id": identity, "method": method, "params": params or {}}
                    ).encode()
                    + b"\n"
                )
                self.process.stdin.flush()
                deadline = time.monotonic() + 30
                with self.condition:
                    while identity not in self.responses:
                        if (
                            self.process.poll() is not None
                            or time.monotonic() >= deadline
                        ):
                            self.close()
                            raise ChatGPTError("runtime_unavailable")
                        self.condition.wait(min(1, deadline - time.monotonic()))
                    value = self.responses.pop(identity)
                if "error" in value or not isinstance(value.get("result"), dict):
                    raise ChatGPTError("provider_operation_failed")
                return value["result"]
            except (OSError, AttributeError):
                self.close()
                raise ChatGPTError("runtime_unavailable") from None

    def close(self):
        if self.process:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid, signal.SIGKILL)
                self.process.wait(timeout=3)
            self.process = None


class ChatGPTControl:
    def __init__(self, state: Path, executable: Path | None, *, rpc=None):
        self.home = state / "chatgpt-auth"
        self.rpc = rpc or (
            CodexAccounts(executable, self.home)
            if executable and executable.is_file()
            else None
        )
        self.lock = threading.RLock()
        self.login_id = None
        self.login_deadline = 0
        self.login_state = "idle"
        self.connection_id = None
        self.models = []
        self.catalogue_complete = False

    def status(self):
        with self.lock:
            account, problem = None, None
            if self.rpc:
                try:
                    account = self.rpc.call(
                        "account/read", {"refreshToken": False}
                    ).get("account")
                    if account and account.get("type") != "chatgpt":
                        account = None
                    if self.login_id:
                        for event in self.rpc.notifications:
                            if event.get("loginId") == self.login_id:
                                self.login_state = (
                                    "complete" if event.get("success") else "failed"
                                )
                                self.login_id = None
                                break
                        if self.login_id and time.monotonic() >= self.login_deadline:
                            self.rpc.call(
                                "account/login/cancel", {"loginId": self.login_id}
                            )
                            self.login_id, self.login_state = None, "expired"
                    if account:
                        self.connection_id = (
                            self.connection_id or "connection_" + uuid.uuid4().hex
                        )
                    else:
                        self.connection_id = None
                        self.models, self.catalogue_complete = [], False
                except ChatGPTError as error:
                    problem = str(error)
            return {
                "available": self.rpc is not None
                and problem not in {"runtime_unavailable", "runtime_version_mismatch"},
                "connected": account is not None,
                "connectionId": self.connection_id,
                "plan": str(account.get("planType", "unknown"))[:80]
                if account
                else None,
                "loginId": self.login_id,
                "loginState": self.login_state,
                "problem": problem,
                "models": self.models,
                "catalogueComplete": self.catalogue_complete,
                "credentialsIncluded": False,
            }

    def apply(self, value):
        with self.lock:
            if not isinstance(value, dict):
                raise ChatGPTError("invalid_request")
            current = self.status()
            operation = value.get("operation")
            if not current["available"]:
                raise ChatGPTError("runtime_unavailable")
            if operation == "login" and set(value) == {"operation"}:
                if current["connected"] or self.login_id:
                    raise ChatGPTError("connection_changed")
                result = self.rpc.call(
                    "account/login/start", {"type": "chatgptDeviceCode"}
                )
                identity, code = result.get("loginId"), result.get("userCode")
                if (
                    result.get("verificationUrl") != DEVICE_URL
                    or not isinstance(identity, str)
                    or not IDENTITY.fullmatch(identity)
                    or not isinstance(code, str)
                    or not re.fullmatch(r"[A-Z0-9-]{4,32}", code)
                ):
                    self.rpc.close()
                    raise ChatGPTError("invalid_login_response")
                self.login_id, self.login_state = identity, "pending"
                self.login_deadline = time.monotonic() + 15 * 60
                # The code is returned once, only by the exact owner-authorized write.
                return {
                    **self.status(),
                    "deviceCode": {"verificationUrl": DEVICE_URL, "userCode": code},
                }
            if (
                operation == "cancel"
                and set(value) == {"operation", "loginId"}
                and self.login_id
                and value["loginId"] == self.login_id
            ):
                self.rpc.call("account/login/cancel", {"loginId": self.login_id})
                self.login_id, self.login_state = None, "canceled"
            elif (
                operation == "logout"
                and set(value) == {"operation", "connectionId"}
                and self.connection_id
                and value["connectionId"] == self.connection_id
            ):
                if self.login_id:
                    self.rpc.call("account/login/cancel", {"loginId": self.login_id})
                    self.login_id = None
                self.rpc.call("account/logout")
                self.connection_id, self.models, self.catalogue_complete = (
                    None,
                    [],
                    False,
                )
                self.login_state = "idle"
            elif (
                operation == "models"
                and set(value) == {"operation"}
                and current["connected"]
            ):
                result = self.rpc.call(
                    "model/list", {"limit": 100, "includeHidden": False}
                )
                rows = result.get("data", [])
                self.models = [
                    {
                        "id": row["model"],
                        "name": str(row.get("displayName", row["model"]))[:160],
                    }
                    for row in rows[:100]
                    if isinstance(row, dict)
                    and isinstance(row.get("model"), str)
                    and MODEL.fullmatch(row["model"])
                    and not row.get("hidden")
                ]
                self.catalogue_complete = not result.get("nextCursor")
            else:
                raise ChatGPTError("connection_changed")
            return self.status()

    def credentials(self):
        with self.lock:
            if not self.status()["connected"]:
                raise ChatGPTError("not_connected")
            # Codex serializes single-use refresh tokens. Never refresh them ourselves.
            result = self.rpc.call("account/read", {"refreshToken": True})
            if (result.get("account") or {}).get("type") != "chatgpt":
                raise ChatGPTError("not_connected")
            path = self.home / "auth.json"
            if path.is_symlink() or path.stat().st_size > 65536:
                raise ChatGPTError("auth_unavailable")
            path.chmod(0o600)
            tokens = json.loads(path.read_text())["tokens"]
            token, account = tokens["access_token"], tokens["account_id"]
            if (
                not isinstance(token, str)
                or not re.fullmatch(r"[A-Za-z0-9_.-]{20,16000}", token)
                or not isinstance(account, str)
                or not IDENTITY.fullmatch(account)
            ):
                raise ChatGPTError("auth_unavailable")
            return token, account


def responses_payload(value):
    if (
        not isinstance(value, dict)
        or set(value) != {"model", "messages", "timeout"}
        or not isinstance(value["model"], str)
        or not MODEL.fullmatch(value["model"])
        or type(value["timeout"]) not in {float, int}
        or not 1 <= value["timeout"] <= 180
    ):
        raise ChatGPTError("invalid_request")
    messages = value["messages"]
    if not isinstance(messages, list) or not 1 <= len(messages) <= 200:
        raise ChatGPTError("invalid_request")
    instructions, inputs = [], []
    characters = 0
    for message in messages:
        if (
            not isinstance(message, dict)
            or set(message) != {"role", "content"}
            or message["role"] not in {"system", "user", "assistant"}
            or not isinstance(message["content"], str)
        ):
            raise ChatGPTError("invalid_request")
        characters += len(message["content"])
        if characters > 2_000_000:
            raise ChatGPTError("invalid_request")
        if message["role"] == "system":
            instructions.append(message["content"])
        else:
            inputs.append(
                {
                    "role": message["role"],
                    "content": [
                        {
                            "type": "output_text"
                            if message["role"] == "assistant"
                            else "input_text",
                            "text": message["content"],
                        }
                    ],
                }
            )
    if not inputs:
        raise ChatGPTError("invalid_request")
    return {
        "model": value["model"],
        "instructions": "\n\n".join(instructions),
        "input": inputs,
        "store": False,
        "stream": True,
    }


def inference_events(control, value, *, opener=None):
    payload = responses_payload(value)
    try:
        token, account = control.credentials()
        request = Request(
            RESPONSES_URL,
            json.dumps(payload).encode(),
            headers={
                "Authorization": "Bearer " + token,
                "ChatGPT-Account-Id": account,
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
                "originator": "conker",
                "User-Agent": "Conker/1.0",
            },
        )
        opener = opener or build_opener(ProxyHandler({}), NoRedirect())
        deadline = time.monotonic() + value["timeout"]
        with opener.open(request, timeout=min(value["timeout"], 30)) as response:
            if (
                response.geturl() != RESPONSES_URL
                or response.headers.get_content_type() != "text/event-stream"
            ):
                raise ChatGPTError("invalid_provider_response")
            size, received, emitted = 0, 0, False
            while True:
                line = response.readline(2_000_001)
                received += len(line)
                if (
                    not line
                    or time.monotonic() > deadline
                    or len(line) > 2_000_000
                    or received > 16_000_000
                ):
                    raise ChatGPTError("incomplete_response")
                if not line.startswith(b"data:"):
                    continue
                data = line[5:].strip()
                if data == b"[DONE]":
                    raise ChatGPTError("incomplete_response")
                event = json.loads(data)
                if not isinstance(event, dict):
                    raise ChatGPTError("invalid_provider_response")
                kind = event.get("type")
                if kind == "response.output_text.delta":
                    delta = event.get("delta")
                    if not isinstance(delta, str):
                        raise ChatGPTError("invalid_provider_response")
                    size += len(delta)
                    if size > 200_000:
                        raise ChatGPTError("response_too_large")
                    emitted = True
                    yield {"type": "text", "delta": delta}
                elif kind == "response.completed":
                    result = event.get("response", {})
                    if result.get("status") != "completed" or not emitted:
                        raise ChatGPTError("incomplete_response")
                    usage = result.get("usage") or {}
                    count = lambda value: (
                        value
                        if type(value) is int and 0 <= value <= 1_000_000_000
                        else None
                    )
                    yield {
                        "type": "done",
                        "model": payload["model"],
                        "inputTokens": count(usage.get("input_tokens")),
                        "outputTokens": count(usage.get("output_tokens")),
                        "cachedTokens": count(
                            (usage.get("input_tokens_details") or {}).get(
                                "cached_tokens"
                            )
                        ),
                    }
                    return
                elif kind in {"error", "response.failed", "response.incomplete"}:
                    raise ChatGPTError("provider_request_failed")
                # Reasoning and provider/tool payloads never cross the private bridge.
    except HTTPError as error:
        raise ChatGPTError(
            "sign_in_required"
            if error.code in {401, 403}
            else "usage_limit"
            if error.code == 429
            else "provider_request_failed"
        ) from None
    except (OSError, ValueError, KeyError, TypeError) as error:
        if isinstance(error, ChatGPTError):
            raise
        raise ChatGPTError("provider_unavailable") from None
