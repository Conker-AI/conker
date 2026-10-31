"""Unmodified Claude Code owns subscription authentication and inference."""

import json
import os
import re
import signal
import subprocess
import threading
import time
import uuid
from contextlib import nullcontext
from pathlib import Path
from urllib.parse import urlsplit


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
        # Set by the server's Claude plan runtime: no self-update, telemetry or error reports.
        "DISABLE_AUTOUPDATER",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
    )
    env = {key: os.environ[key] for key in keep if key in os.environ}
    env.update(CLAUDE_CONFIG_DIR=str(home), NO_COLOR="1")
    return env


def stop_inference_process(process):
    """Stop only a child created by this worker, including its subprocesses."""
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            # Never accept a PID from a request. The live Popen handle supplies
            # this worker-owned root; taskkill /T includes native CLI children.
            taskkill = (
                Path(os.environ.get("SYSTEMROOT", "C:/Windows"))
                / "System32/taskkill.exe"
            )
            subprocess.run(
                [str(taskkill), "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
                check=False,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        else:
            os.killpg(process.pid, signal.SIGKILL)
    except (OSError, subprocess.TimeoutExpired):
        pass
    if process.poll() is None:
        process.kill()
    process.wait(timeout=5)


class Claude:
    def __init__(self, executable, home):
        self.executable, self.home = Path(executable), Path(home)
        self.home.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.process = None
        self.login_state = "idle"
        self.login_id = None
        self.url = None
        self.started = 0

    def options(self):
        return dict(
            env=environment(self.home),
            cwd=self.home,
            **(
                {"creationflags": subprocess.CREATE_NO_WINDOW}
                if os.name == "nt"
                else {"start_new_session": True}
            ),
        )

    def status(self):
        with self.lock:
            available = self.executable.is_file()
            connected = False
            if available:
                try:
                    result = subprocess.run(
                        [str(self.executable), "auth", "status", "--json"],
                        capture_output=True,
                        check=False,
                        timeout=10,
                        **self.options(),
                    )
                    connected = json.loads(result.stdout).get("loggedIn") is True
                except (OSError, ValueError, subprocess.SubprocessError):
                    available = False
            if self.process:
                if self.process.poll() is not None:
                    self.login_state = "complete" if connected else "failed"
                    self.process = None
                    self.login_id = None
                    self.url = None
                elif time.monotonic() - self.started > 600:
                    self.close()
                    self.login_state = "expired"
            return {
                "available": available,
                "connected": connected,
                "loginState": self.login_state,
                "loginId": self.login_id,
                "authorizationUrl": self.url,
                "credentialsIncluded": False,
                "runtime": "Claude Code",
                "models": ["sonnet", "opus", "haiku"] if connected else [],
            }

    def apply(self, value):
        with self.lock:
            operation = value.get("operation")
            if operation == "login" and set(value) <= {"operation", "billing"}:
                if self.process and self.process.poll() is None:
                    raise ValueError("A native sign-in is already running.")
                method = {"subscription": "--claudeai", "api": "--console"}.get(
                    value.get("billing", "subscription")
                )
                if not method:
                    raise ValueError("Choose subscription or API billing.")
                self.url = None
                self.process = subprocess.Popen(
                    [str(self.executable), "auth", "login", method],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    **self.options(),
                )
                self.login_state, self.started = "pending", time.monotonic()
                self.login_id = "login_" + uuid.uuid4().hex
                threading.Thread(
                    target=self._read_login, args=(self.process,), daemon=True
                ).start()
            elif (
                operation == "cancel"
                and set(value) == {"operation", "loginId"}
                and self.login_id is not None
                and value["loginId"] == self.login_id
                and self.process is not None
                and self.process.poll() is None
            ):
                self.close()
                self.login_state = "canceled"
            elif operation == "logout" and set(value) == {"operation"}:
                self.close()
                subprocess.run(
                    [str(self.executable), "auth", "logout"],
                    capture_output=True,
                    check=True,
                    timeout=15,
                    **self.options(),
                )
                self.login_state = "idle"
            else:
                raise ValueError("Invalid native authentication operation.")
            return self.status()

    def _read_login(self, process):
        total = 0
        while True:
            line = process.stdout.readline(16384)
            total += len(line)
            if not line or total > 262144:
                return
            for candidate in re.findall(
                r"https://[^\s\x1b]+", line.decode(errors="replace")
            ):
                url = urlsplit(candidate)
                if (
                    url.hostname
                    in {
                        "claude.ai",
                        "claude.com",
                        "console.anthropic.com",
                        "platform.claude.com",
                    }
                    and "oauth" in url.path
                    and len(candidate) < 4096
                ):
                    with self.lock:
                        if self.process is process:
                            self.url = candidate

    def close(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
            self.login_state = "canceled"
        self.login_id = None
        self.url = None

    def complete(self, value, *, cancellation=None):
        model = value.get("model", "")
        messages = value.get("messages")
        timeout = value.get("timeout")
        if (
            not isinstance(model, str)
            # The model goes on argv after --model: a leading "-" would read as an option.
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}", model)
            or type(timeout) not in (int, float)
            or not 1 <= timeout <= 180
            or not isinstance(messages, list)
            or not 1 <= len(messages) <= 400
        ):
            raise ValueError("Invalid native inference request.")
        if any(
            not isinstance(row, dict)
            or set(row) != {"role", "content"}
            or row["role"] not in {"system", "user", "assistant", "tool"}
            or not isinstance(row["content"], str)
            for row in messages
        ):
            raise ValueError("Invalid native messages.")
        prompt = json.dumps({"conversation": messages}, ensure_ascii=False)
        if len(prompt) > 2_000_000:
            raise ValueError("Native request too large.")
        command = [
            str(self.executable),
            "-p",
            "--output-format",
            "json",
            "--model",
            model,
            "--tools",
            "",
            "--strict-mcp-config",
            "--mcp-config",
            '{"mcpServers":{}}',
            "--disable-slash-commands",
            "--no-session-persistence",
            "--setting-sources",
            "",
            "--max-turns",
            "1",
        ]
        if cancellation:
            cancellation.check()
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            **self.options(),
        )
        try:
            with (
                cancellation.register(lambda: stop_inference_process(process))
                if cancellation
                else nullcontext()
            ):
                if cancellation:
                    cancellation.check()
                stdout, _stderr = process.communicate(
                    input=prompt.encode(), timeout=timeout
                )
                if cancellation:
                    cancellation.check()
        finally:
            if process.poll() is None:
                stop_inference_process(process)
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream is not None:
                    stream.close()
        if process.returncode or len(stdout) > 2_000_000:
            raise ValueError("Claude Code did not complete this request.")
        value = json.loads(stdout)
        if value.get("is_error") or not isinstance(value.get("result"), str):
            raise ValueError("Claude Code did not complete this request.")
        usage = value.get("usage") or {}
        actual = list((value.get("modelUsage") or {}).keys())
        return {
            "text": value["result"],
            "model": model,
            "actualModel": actual[0] if len(actual) == 1 else None,
            "inputTokens": usage.get("input_tokens"),
            "outputTokens": usage.get("output_tokens"),
        }
