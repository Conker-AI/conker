"""ChatGPT answers through the host's private ChatGPT worker, for the server subscription runtime.

On the server layouts the ChatGPT sign-in lives with the host worker (scripts/provider_control.py,
`conker providers chatgpt`). Pi sends every subscription answer to one runtime, so the Claude plan
runtime passes ChatGPT ones on to that worker's socket unchanged: no second ChatGPT sign-in, and
nothing here reads a token. Without the socket, ChatGPT reports unavailable.
"""

from __future__ import annotations

import http.client
import json
import socket
from contextlib import nullcontext
from pathlib import Path

from chatgpt_provider import ChatGPTError, responses_payload
from plan_limits import unavailable

MAX_LINE = 2_000_001
MAX_STREAM = 16_000_000


class Connection(http.client.HTTPConnection):
    def __init__(self, path: Path, timeout: float):
        super().__init__("conker-chatgpt", timeout=timeout)
        self.socket_path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(str(self.socket_path))


class ChatGPTRelay:
    def __init__(self, path: Path, *, connection=Connection):
        self.path, self.connection = Path(path), connection

    def _read(self, route: str, limit: int = 65536):
        connection = self.connection(self.path, 70)
        try:
            connection.request("GET", route)
            response = connection.getresponse()
            content = response.read(limit + 1)
            if response.status != 200 or len(content) > limit:
                raise ValueError()
            return json.loads(content)
        finally:
            connection.close()

    def status(self) -> dict:
        try:
            value = self._read("/status")
            if set(value) != {"available", "connected"} or any(
                type(value[key]) is not bool for key in value
            ):
                raise ValueError()
            return value
        except (OSError, ValueError, http.client.HTTPException):
            return {"available": False, "connected": False}

    def limits(self) -> dict:
        try:
            value = self._read("/limits")
            if not isinstance(value, dict) or value.get("provider") != "chatgpt":
                raise ValueError()
            return value
        except (OSError, ValueError, http.client.HTTPException):
            return unavailable("chatgpt", "runtime_unavailable")

    def events(self, value: dict, *, cancellation=None):
        """The worker's answer events, as `chatgpt_provider.inference_events` yields them."""
        responses_payload(value)
        body = json.dumps(value).encode()
        connection = self.connection(self.path, min(value["timeout"], 180) + 5)

        def abort():
            # shutdown wakes a read blocked in another thread; the worker then stops too.
            sock = connection.sock
            if sock is not None:
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

        try:
            if cancellation:
                cancellation.check()
            try:
                connection.request(
                    "POST",
                    "/responses",
                    body=body,
                    headers={"Content-Type": "application/json"},
                )
                response = connection.getresponse()
            except (OSError, http.client.HTTPException):
                raise ChatGPTError("runtime_unavailable") from None
            if response.status == 503:
                raise ChatGPTError("busy")
            if response.status != 200:
                raise ChatGPTError("provider_unavailable")
            with cancellation.register(abort) if cancellation else nullcontext():
                received = 0
                while True:
                    if cancellation:
                        cancellation.check()
                    try:
                        line = response.readline(MAX_LINE)
                    except (OSError, http.client.HTTPException):
                        raise ChatGPTError("incomplete_response") from None
                    if cancellation:
                        cancellation.check()
                    received += len(line)
                    if not line:
                        return
                    if len(line) >= MAX_LINE or received > MAX_STREAM:
                        raise ChatGPTError("incomplete_response")
                    event = json.loads(line)
                    if not isinstance(event, dict):
                        raise ChatGPTError("invalid_provider_response")
                    yield event
        finally:
            connection.close()
