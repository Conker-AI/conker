"""Run the Ubuntu generator (deploy/ubuntu/prepare.py) the way the installer does."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREPARE = ROOT / "deploy" / "ubuntu" / "prepare.py"
# A host test cannot create a folder owned by UID 65533; the validator has its own tests in
# test_agent_sandbox_ubuntu.py.
ACCEPT_FOLDER = """
import runpy, sys
sys.path.insert(0, sys.argv[1])
import scripts.agent_workspaces as workspaces
workspaces.validate_workspaces = lambda folder, **_: folder.resolve()
sys.argv = sys.argv[2:]
runpy.run_path(sys.argv[0], run_name="__main__")
"""


def prepare(
    tmp_path: Path,
    versions: str | None = None,
    *,
    environment: dict[str, str] | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess:
    """Generate a deployment in tmp_path from `versions` (default: the repository's manifest).

    The repository pins the agent sandbox active, so every run gets the workspaces folder and
    Docker group the installer passes."""
    dashboard = tmp_path / "sources" / "companion" / "dashboard" / "dist"
    dashboard.mkdir(parents=True)
    (dashboard / "index.html").write_text("<!doctype html>", encoding="utf-8")
    if versions is None:
        versions = (ROOT / "versions.env").read_text(encoding="utf-8")
    (tmp_path / "sources" / "companion" / "versions.env").write_text(versions, encoding="utf-8")
    workspaces = tmp_path.parent / f"{tmp_path.name}-workspaces"
    workspaces.mkdir(exist_ok=True)
    env = {
        **os.environ,
        "CONKER_WORKSPACES_DIR": str(workspaces),
        "CONKER_DOCKER_GID": "998",
        **(environment or {}),
    }
    return subprocess.run(
        [sys.executable, "-c", ACCEPT_FOLDER, str(ROOT), str(PREPARE), "https://conker.test:8443"],
        cwd=tmp_path,
        check=check,
        capture_output=True,
        text=True,
        env=env,
    )
