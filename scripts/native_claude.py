"""Unmodified Claude Code owns subscription authentication and inference."""

import json
import os
import re
import subprocess
import threading
import time
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
    )
    env = {key: os.environ[key] for key in keep if key in os.environ}
    env.update(CLAUDE_CONFIG_DIR=str(home), NO_COLOR="1")
    return env


class Claude:
    def __init__(self, executable, home):
        self.executable, self.home = Path(executable), Path(home)
        self.home.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.process = None
        self.login_state = "idle"
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
                    self.url = None
                elif time.monotonic() - self.started > 600:
                    self.close()
                    self.login_state = "expired"
            return {
                "available": available,
                "connected": connected,
                "loginState": self.login_state,
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
                threading.Thread(
                    target=self._read_login, args=(self.process,), daemon=True
                ).start()
            elif operation == "cancel" and set(value) == {"operation"}:
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
        self.url = None

    def complete(self, value):
        model = value.get("model", "")
        messages = value.get("messages")
        timeout = value.get("timeout")
        if (
            not isinstance(model, str)
            or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,200}", model)
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
        result = subprocess.run(
            command,
            input=prompt.encode(),
            capture_output=True,
            check=False,
            timeout=timeout,
            **self.options(),
        )
        if result.returncode or len(result.stdout) > 2_000_000:
            raise ValueError("Claude Code did not complete this request.")
        value = json.loads(result.stdout)
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
