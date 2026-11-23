"""Checks every `npm run NAME` in a tracked markdown file is a script in dashboard/package.json.

Docs drift: a script is renamed or removed and the README keeps telling people to run it
(`check:navigation` stayed in three docs with no such script; the navigation check runs in
`check:gateway`).
CHANGELOG.md is history and names what existed at the time, so it is skipped.
"""

import json
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
NPM_RUN = re.compile(r"npm run ([A-Za-z0-9:_-]+)")
SKIPPED = {"CHANGELOG.md"}


def test_docs_name_real_npm_scripts() -> None:
    scripts = json.loads((REPO / "dashboard/package.json").read_text(encoding="utf-8"))["scripts"]
    names = subprocess.run(
        ["git", "ls-files", "*.md"], cwd=REPO, capture_output=True, text=True, check=True
    ).stdout.splitlines()
    missing = []
    for name in names:
        if name in SKIPPED:
            continue
        text = (REPO / name).read_text(encoding="utf-8")
        for number, line in enumerate(text.splitlines(), 1):
            for script in NPM_RUN.findall(line):
                if script not in scripts:
                    missing.append(
                        f"{name}:{number}: `npm run {script}` is not in dashboard/package.json"
                    )
    assert not missing, "\n".join(missing)
