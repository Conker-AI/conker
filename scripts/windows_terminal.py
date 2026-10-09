"""Ephemeral Windows ConPTY for the gateway's verified owner-terminal lease."""

import codecs
import contextlib
import os
import shutil
import threading
import time
from pathlib import Path

from pi.owner_terminal import TerminalError


class WindowsTerminal:
    def __init__(self, directory, config, *, lifetime=900, output_limit=1024 * 1024):
        import psutil
        from winpty import PtyProcess

        shell = shutil.which("pwsh.exe") or str(
            Path(os.environ["SYSTEMROOT"])
            / "System32/WindowsPowerShell/v1.0/powershell.exe"
        )
        keep = (
            "SYSTEMROOT",
            "WINDIR",
            "TEMP",
            "TMP",
            "USERPROFILE",
            "LOCALAPPDATA",
            "APPDATA",
            "PATH",
            "PATHEXT",
            "COMSPEC",
        )
        env = {key: os.environ[key] for key in keep if key in os.environ}
        native = config["native_providers"]
        env.update(
            CODEX_HOME=str(Path(native["state"]) / "chatgpt-auth"),
            CLAUDE_CONFIG_DIR=str(Path(native["state"]) / "claude-auth"),
            TERM="xterm-256color",
        )
        env["PATH"] = os.pathsep.join(
            [
                str(Path(native["codex"]).parent),
                str(Path(native["claude"]).parent),
                env.get("PATH", ""),
            ]
        )
        self.lock = threading.RLock()
        self.closed = False
        self.limit, self.buffer, self.offset = output_limit, bytearray(), 0
        self.decoder = codecs.getincrementaldecoder("utf-8")()
        self.deadline = time.monotonic() + lifetime
        bootstrap = "Set-PSReadLineOption -HistorySaveStyle SaveNothing; Write-Host 'Conker owner shell. Run codex or claude. Native permissions apply.'"
        self.process = PtyProcess.spawn(
            [shell, "-NoLogo", "-NoProfile", "-NoExit", "-Command", bootstrap],
            cwd=str(directory),
            env=env,
        )
        self.identity = psutil.Process(self.process.pid)
        self.created = self.identity.create_time()
        self.reader = threading.Thread(target=self._drain, daemon=True)
        self.reader.start()
        self.timer = threading.Timer(lifetime, self.close)
        self.timer.daemon = True
        self.timer.start()

    def _drain(self):
        while not self.closed:
            try:
                chunk = self.process.read(65536).encode("utf-8")
            except (EOFError, OSError):
                return
            with self.lock:
                if self.closed:
                    return
                self.buffer.extend(chunk)
                excess = max(0, len(self.buffer) - self.limit)
                if excess:
                    del self.buffer[:excess]
                    self.offset += excess

    def _active(self):
        if self.closed or time.monotonic() >= self.deadline:
            raise TerminalError("Terminal session expired or closed.")

    def write(self, data):
        if not isinstance(data, bytes) or not 1 <= len(data) <= 8192:
            raise TerminalError("Terminal input must contain 1-8192 bytes.")
        with self.lock:
            self._active()
            try:
                value = self.decoder.decode(data)
                if value:
                    self.process.write(value)
                return len(data)
            except (EOFError, OSError, UnicodeError):
                raise TerminalError(
                    "Terminal input was not confirmed; do not replay it."
                ) from None

    def resize(self, rows, columns):
        if (
            type(rows) is not int
            or type(columns) is not int
            or not 2 <= rows <= 200
            or not 10 <= columns <= 400
        ):
            raise TerminalError("Invalid terminal dimensions.")
        with self.lock:
            self._active()
            self.process.setwinsize(rows, columns)

    def read(self, cursor=0):
        if type(cursor) is not int or cursor < 0:
            raise TerminalError("Invalid output cursor.")
        with self.lock:
            self._active()
            end = self.offset + len(self.buffer)
            if cursor > end:
                raise TerminalError("Output cursor is ahead of this session.")
            alive = self.process.isalive()
            return {
                "data": bytes(self.buffer[max(cursor - self.offset, 0) :]),
                "cursor": end,
                "droppedBytes": max(self.offset - cursor, 0),
                "exitCode": None if alive else self.process.exitstatus or 0,
            }

    def close(self):
        import psutil

        with self.lock:
            if self.closed:
                return
            self.closed = True
            self.timer.cancel()
            # Only descendants of this exact, still-owned process; never a PID-only kill.
            with contextlib.suppress(psutil.Error):
                if self.identity.create_time() == self.created:
                    for child in reversed(self.identity.children(recursive=True)):
                        with contextlib.suppress(psutil.Error):
                            child.kill()
            with contextlib.suppress(OSError, EOFError):
                self.process.close(force=True)
            self.buffer.clear()
