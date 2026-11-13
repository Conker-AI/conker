"""Hold the README quickstart to what it promises.

Run from the repository root:
  python scripts/check_quickstart.py         every command it names exists (the test suite runs this)
  python scripts/check_quickstart.py --run   run the preview lines as written, in a folder where
                                             `conker` is this checkout, and fail unless the page
                                             answers within five minutes (Linux or macOS)

The first block is the preview, the second the server install, the third day-to-day commands.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIMIT_SECONDS = 300
HEADING = "## Quickstart\n"
BLOCK = re.compile(r"```sh\n(.*?)```", re.S)
OPEN = re.compile(r"Open (http://localhost:(\d+))")
VERB = re.compile(r"^    ([a-z|-]+)\)", re.M)
CONKER = re.compile(r"\./conker ([a-z-]+)")


def quickstart(readme: str) -> str:
    """The README text from the Quickstart heading to the next section."""
    if HEADING not in readme:
        return ""
    rest = readme.split(HEADING, 1)[1]
    return rest.split("\n## ", 1)[0]


def commands(block: str) -> list[str]:
    """A block's command lines, without comments or blank lines."""
    lines = (line.split("  #", 1)[0].strip() for line in block.splitlines())
    return [line for line in lines if line]


def repo_url(installer: str) -> str:
    found = re.search(r'REPO_URL="([^"]+)"', installer)
    return found.group(1) if found else ""


def cli_verbs(launcher: str) -> set[str]:
    return {verb for group in VERB.findall(launcher) for verb in group.split("|")}


def check_preview(lines: list[str], text: str, url: str, scripts: dict) -> list[str]:
    problems = []
    if not lines or lines[0] != f"git clone {url}":
        problems.append(f"The preview must start with: git clone {url}")
    if "cd conker/dashboard" not in lines:
        problems.append("The preview must change into conker/dashboard.")
    for line in lines:
        words = shlex.split(line)
        if words[:2] == ["npm", "run"] and (len(words) < 3 or words[2] not in scripts):
            problems.append(f"dashboard/package.json has no script for: {line}")
    server = lines[-1] if lines else ""
    port = re.search(r"--port (\d+)", server)
    opened = OPEN.search(text)
    if not port or not opened or opened.group(2) != port.group(1):
        problems.append("The address to open must use the port the last preview line serves on.")
    return problems


def check_install(lines: list[str], url: str) -> list[str]:
    expected = [f"git clone {url}", "cd conker", "./install.sh"]
    if lines != expected:
        return ["The server install must be exactly: " + " / ".join(expected)]
    return []


def check_cli(text: str, verbs: set[str]) -> list[str]:
    return [
        f"./conker has no command called {verb}."
        for verb in sorted(set(CONKER.findall(text)))
        if verb not in verbs
    ]


def problems(readme: str, installer: str, launcher: str, scripts: dict) -> list[str]:
    text = quickstart(readme)
    if not text:
        return ["README.md has no '## Quickstart' section."]
    blocks = [commands(block) for block in BLOCK.findall(text)]
    if len(blocks) < 3:
        return ["The Quickstart needs a preview, a server install and day-to-day blocks."]
    url = repo_url(installer)
    found = check_preview(blocks[0], text, url, scripts)
    found += check_install(blocks[1], url)
    found += check_cli(text, cli_verbs(launcher))
    return found


def check() -> list[str]:
    package = json.loads((ROOT / "dashboard" / "package.json").read_text(encoding="utf-8"))
    found = problems(
        (ROOT / "README.md").read_text(encoding="utf-8"),
        (ROOT / "install.sh").read_text(encoding="utf-8"),
        (ROOT / "conker").read_text(encoding="utf-8"),
        package.get("scripts", {}),
    )
    if not (ROOT / "dashboard" / "package-lock.json").is_file():
        found.append("npm ci needs dashboard/package-lock.json.")
    return found


def answers(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status == 200 and 'id="root"' in response.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError):
        return False


def run() -> int:
    if sys.platform == "win32":
        print("--run needs Linux or macOS (it starts the server in its own process group).",
              file=sys.stderr)
        return 2
    text = quickstart((ROOT / "README.md").read_text(encoding="utf-8"))
    lines = commands(BLOCK.findall(text)[0])
    opened = OPEN.search(text)
    assert opened, "checked before running"
    started = time.monotonic()
    deadline = started + LIMIT_SECONDS
    with tempfile.TemporaryDirectory() as home:
        # The clone line is checked above; here `conker` is this checkout, so CI tests the change.
        os.symlink(ROOT, Path(home) / "conker")
        cwd = Path(home)
        for line in lines[1:-1]:
            print(f"$ {line}", flush=True)
            if line.startswith("cd "):
                cwd = cwd / line[3:].strip()
                continue
            subprocess.run(line, shell=True, cwd=cwd, check=True, timeout=deadline - time.monotonic())
        print(f"$ {lines[-1]}", flush=True)
        server = subprocess.Popen(lines[-1], shell=True, cwd=cwd, start_new_session=True)
        try:
            while time.monotonic() < deadline and server.poll() is None:
                if answers(opened.group(1)):
                    print(f"The preview answered at {opened.group(1)} after "
                          f"{time.monotonic() - started:.0f} s.")
                    return 0
                time.sleep(1)
        finally:
            os.killpg(server.pid, signal.SIGTERM)
            server.wait(timeout=30)
    print(f"The preview did not answer at {opened.group(1)} within {LIMIT_SECONDS} s.", file=sys.stderr)
    return 1


def main(argv: list[str]) -> int:
    found = check()
    for problem in found:
        print(problem, file=sys.stderr)
    if found:
        return 1
    if argv == ["--run"]:
        return run()
    if argv:
        print(__doc__, file=sys.stderr)
        return 2
    print("The quickstart names only commands that exist.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
