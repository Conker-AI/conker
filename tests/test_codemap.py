"""scripts/codemap.py through its command line: what it writes, and when --check refuses."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts import codemap


def make_repo(tmp_path: Path, files: dict[str, str | bytes]) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    for rel, content in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8", newline="\n")
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    return root


def run(root: Path, *extra: str) -> int:
    return codemap.main(["--root", str(root), "--all", "--out", "map.md", *extra])


def test_every_file_gets_one_line_and_a_file_without_a_summary_is_flagged(tmp_path, capsys):
    root = make_repo(
        tmp_path,
        {
            "app/a.py": '"""Does a.\n\nMore detail."""\nimport b\n',
            "app/b.py": "x = 1\n",
            "app/c.sh": "#!/bin/sh\n# Starts c\necho c\n",
            "app/d.ts": "/* Draws d */\nexport {}\n",
            "app/e.js": "const e = 1\n",
            "tests/test_a.py": '"""skipped"""\n',
            "README.md": "# not code\n",
        },
    )
    assert run(root) == 0
    assert "Wrote" in capsys.readouterr().out
    lines = (root / "map.md").read_text(encoding="utf-8").splitlines()
    assert "app/a.py - Does a. [uses: b]" in lines
    assert "app/b.py - (no docstring)" in lines
    assert "app/c.sh - Starts c" in lines
    assert "app/d.ts - Draws d" in lines
    assert "app/e.js - (no docstring)" in lines
    assert not any("tests/" in line or "README" in line for line in lines)
    assert "5 entries; 2 files without a docstring." in lines


def test_a_python_file_that_does_not_parse_or_decode_is_flagged_not_fatal(tmp_path):
    root = make_repo(
        tmp_path,
        {"a.py": "def broken(:\n", "b.py": b"\xff\xfe\x00bad", "c.sh": b"# \xff\xfe\n"},
    )
    assert run(root) == 0
    text = (root / "map.md").read_text(encoding="utf-8")
    for name in ("a.py", "b.py", "c.sh"):
        assert f"{name} - (no docstring)" in text


def test_a_long_summary_is_cut_to_the_line_limit(tmp_path):
    root = make_repo(tmp_path, {"long.py": f'"""{"word " * 100}"""\n', "s.sh": f"# {'x' * 300}\n"})
    assert run(root) == 0
    lines = (root / "map.md").read_text(encoding="utf-8").splitlines()
    for line in (next(x for x in lines if x.startswith(name)) for name in ("long.py", "s.sh")):
        assert len(line) == codemap.LIMIT and line.endswith("...")


def test_check_succeeds_on_a_fresh_map_and_refuses_a_stale_or_missing_one(tmp_path, capsys):
    root = make_repo(tmp_path, {"a.py": '"""A."""\n'})
    assert run(root, "--check") == 1
    assert "map.md is out of date" in capsys.readouterr().err
    assert run(root) == 0
    capsys.readouterr()
    assert run(root, "--check") == 0
    assert "up to date" in capsys.readouterr().out
    (root / "a.py").write_text('"""A changed."""\n', encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    assert run(root, "--check") == 1
    assert "out of date" in capsys.readouterr().err


def test_check_never_writes_the_map(tmp_path):
    root = make_repo(tmp_path, {"a.py": '"""A."""\n'})
    assert run(root, "--check") == 1
    assert not (root / "map.md").exists()


def test_a_folder_that_is_not_a_git_repository_is_refused(tmp_path):
    with pytest.raises(subprocess.CalledProcessError):
        run(tmp_path)


def test_the_default_map_lists_scripts_and_services_per_file_and_dashboard_per_folder(tmp_path):
    root = make_repo(
        tmp_path,
        {
            "scripts/a.py": '"""Script a."""\n',
            "services/s/b.py": '"""Service b."""\n',
            "other/c.py": '"""Not listed."""\n',
            "dashboard/src/lib/x.ts": "// x\n",
            "dashboard/src/lib/y.ts": "// y\n",
        },
    )
    assert codemap.main(["--root", str(root)]) == 0
    text = (root / codemap.DEFAULT_OUT).read_text(encoding="utf-8")
    assert "scripts/a.py - Script a." in text
    assert "services/s/b.py - Service b." in text
    assert "other/c.py" not in text
    assert "dashboard/src/lib/ - 2 files: x, y" in text
