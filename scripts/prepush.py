"""Run the CI checks that a change can break, in parallel, before pushing: `python scripts/prepush.py`.

Picks checks from the files that differ from origin/main (the same split as .github/workflows/ci.yml
and dashboard.yml), runs them at the same time and prints one line per check with its time and the
output of any that failed. Exit 1 when any failed. As a git hook: `git config core.hooksPath .githooks`.
`--all` runs every check. The dashboard checks need `npm ci` done once (scripts/new_worktree.py does it).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
NPM = "npm.cmd" if sys.platform == "win32" else "npm"


def changed_files(base: str) -> list[str]:
    out = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...HEAD"], cwd=ROOT, capture_output=True, text=True
    )
    work = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True)
    names = out.stdout.split() + [line[3:] for line in work.stdout.splitlines()]
    return sorted(set(names))


def related_tests(files: list[str]) -> list[str]:
    """Tests named after a changed script (scripts/foo.py -> tests/test_foo*.py), plus changed tests."""
    found: set[str] = {name for name in files if name.startswith("tests/test_") and (ROOT / name).exists()}
    for name in files:
        path = Path(name)
        if path.parts[:1] == ("scripts",) and path.suffix == ".py":
            found.update(p.relative_to(ROOT).as_posix() for p in (ROOT / "tests").glob(f"test_{path.stem}*.py"))
    return sorted(found)


def plan(files: list[str], everything: bool) -> list[tuple[str, list[str], Path]]:
    python = everything or any(name.endswith((".py", ".json", ".env")) or name.startswith("scripts/") for name in files)
    dashboard = everything or any(name.startswith("dashboard/") for name in files)
    jobs: list[tuple[str, list[str], Path]] = []
    if python:
        jobs += [
            ("ruff", [PY, "-m", "ruff", "check", "."], ROOT),
            ("types", [PY, "scripts/check_types.py"], ROOT),
            ("file sizes", [PY, "scripts/check_file_sizes.py"], ROOT),
            ("capabilities", [PY, "scripts/validate_capabilities.py"], ROOT),
            ("status page", [PY, "scripts/status_page.py", "--check"], ROOT),
            ("code map", [PY, "scripts/codemap.py", "--check"], ROOT),
        ]
        tests = related_tests(files)
        if everything:
            jobs.append(("pytest (all)", [PY, "-m", "pytest", "tests/", "-q", "-x"], ROOT))
        elif tests:
            jobs.append((f"pytest ({len(tests)} files)", [PY, "-m", "pytest", "-q", "-x", *tests], ROOT))
    if dashboard:
        web = ROOT / "dashboard"
        jobs += [
            ("dashboard lint", [NPM, "run", "lint"], web),
            ("dashboard build", [NPM, "run", "build"], web),
            ("dashboard check", [NPM, "run", "check"], web),
        ]
    return jobs


def run_job(job: tuple[str, list[str], Path]) -> tuple[str, bool, float, str]:
    name, command, cwd = job
    start = time.monotonic()
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    return name, result.returncode == 0, time.monotonic() - start, (result.stdout + result.stderr)[-3000:]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="origin/main")
    parser.add_argument("--all", action="store_true", help="run every check")
    args = parser.parse_args(argv)
    jobs = plan(changed_files(args.base), args.all)
    if not jobs:
        print("Nothing to check for these files.")
        return 0
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        results = list(pool.map(run_job, jobs))
    failed = 0
    for name, ok, seconds, output in results:
        print(f"{'ok  ' if ok else 'FAIL'} {seconds:6.1f}s  {name}")
        if not ok:
            failed += 1
            print(output.rstrip() + "\n")
    print(f"{len(results) - failed}/{len(results)} passed in {time.monotonic() - started:.0f}s (parallel).")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
