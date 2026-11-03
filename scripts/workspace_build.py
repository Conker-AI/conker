"""Build away from served assets and retain the last verified dashboard on failure."""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from pathlib import Path


def manifest(directory):
    result = {}
    for path in directory.rglob("*"):
        if path.is_file():
            with path.open("rb") as stream:
                result[str(path.relative_to(directory))] = hashlib.file_digest(stream, "sha256").hexdigest()
    return result


def publish(root, stage, destination, checkpoint, *, before_swap=None):
    """The caller has stopped Gateway; no half-built tree becomes its startup input."""
    root = root.resolve()
    for path in (stage, destination, checkpoint):
        if not path.resolve().is_relative_to(root):
            raise ValueError("Dashboard build paths must remain inside this workspace.")
    expected = manifest(stage)
    if "index.html" not in expected:
        raise RuntimeError("Dashboard build did not produce index.html; previous assets retained.")
    previous = checkpoint / "previous"
    ready = checkpoint / "ready"
    # A Windows watcher may hold the stage directory open. Prepare a separate
    # complete tree before touching dist; an interrupted copy cannot be served.
    shutil.copytree(stage, ready)
    if manifest(ready) != expected:
        raise RuntimeError("Prepared assets differ from the verified build; previous assets retained.")
    if before_swap is not None:
        before_swap()
    had_previous = destination.exists()
    if had_previous:
        destination.rename(previous)
    try:
        ready.rename(destination)
    except BaseException:
        if had_previous:
            previous.rename(destination)
        raise
    return previous if had_previous else None


def build_dashboard(root: Path, state: Path, run, require_stopped):
    require_stopped()
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node = shutil.which("node")
    if not npm or not node:
        raise SystemExit("Node.js/npm is required to build the dashboard.")
    dashboard = root / "dashboard"
    if not (dashboard / "node_modules").exists():
        run(npm, "ci", "--no-audit", "--no-fund", cwd=dashboard)
    builds = state / "builds"
    builds.mkdir(parents=True, exist_ok=True)
    checkpoint = Path(tempfile.mkdtemp(prefix="dashboard-", dir=builds))
    stage = checkpoint / "staged"
    run(npm, "run", "design:check", cwd=dashboard)
    run(node, dashboard / "node_modules/typescript/bin/tsc", "-b", cwd=dashboard)
    run(node, dashboard / "node_modules/vite/bin/vite.js", "build", "--configLoader", "runner",
        "--outDir", stage, "--emptyOutDir", cwd=dashboard)
    run(node, dashboard / "scripts/check-production-bundle.cjs", stage / "assets", cwd=dashboard)
    # Another owner command may have started Gateway while compilation ran.
    previous = publish(root, stage, dashboard / "dist", checkpoint, before_swap=require_stopped)
    print("Dashboard built and verified. Start Gateway to serve the new assets.")
    if previous:
        print(f"Previous assets retained at {previous}")
