"""scripts/check_skips.py through its command line, in a throwaway repository."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts import check_skips


@pytest.fixture()
def repo(tmp_path, monkeypatch) -> Path:
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    monkeypatch.chdir(tmp_path)
    return tmp_path


def put(repo: Path, rel: str, text: str | bytes) -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(text, bytes):
        path.write_bytes(text)
    else:
        path.write_text(text, encoding="utf-8", newline="\n")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)


def run(capsys, *argv: str) -> tuple[int, str]:
    code = check_skips.main(list(argv))
    return code, capsys.readouterr().out


def test_a_repository_without_skips_passes(repo, capsys):
    put(repo, "tests/test_a.py", "def test_a():\n    assert True\n")
    assert run(capsys) == (0, "skips ok (0 baselined markers in 0 files)\n")


@pytest.mark.parametrize(
    "marker",
    [
        '@pytest.mark.skip(reason="needs a GPU")',
        '@pytest.mark.skipif(True, reason="not on this OS")',
        '@pytest.mark.xfail(reason="known", strict=True)',
    ],
)
def test_a_marker_with_a_reason_passes_when_the_baseline_allows_it(repo, capsys, marker):
    put(repo, "tests/test_a.py", f"import pytest\n\n{marker}\ndef test_a():\n    pass\n")
    put(repo, "skip-baseline.txt", "tests/test_a.py 1\n")
    assert run(capsys) == (0, "skips ok (1 baselined markers in 1 files)\n")


@pytest.mark.parametrize(
    "line,complaint",
    [
        ("@pytest.mark.skip", "mark.skip has no reason= text"),
        ('@pytest.mark.skip(reason="")', "has no reason= text"),
        ('@pytest.mark.skip(reason="   ")', "has no reason= text"),
        ("@pytest.mark.skipif(True)", "has no reason= text"),
        ('@pytest.mark.xfail(reason="known")', "xfail needs an explicit strict="),
        ("@pytest.mark.xfail", "has no reason= text"),
    ],
)
def test_a_mark_without_a_reason_or_a_strict_xfail_is_refused(repo, capsys, line, complaint):
    put(repo, "tests/test_a.py", f"import pytest\n\n{line}\ndef test_a():\n    pass\n")
    put(repo, "skip-baseline.txt", "tests/test_a.py 1\n")
    code, out = run(capsys)
    assert code == 1
    assert "tests/test_a.py:3:" in out and complaint in out


@pytest.mark.parametrize(
    "body,name",
    [
        ("pytest.skip()", "pytest.skip"),
        ('pytest.skip("")', "pytest.skip"),
        ("pytest.xfail()", "pytest.xfail"),
        ('pytest.importorskip("yaml")', "pytest.importorskip"),
        ("self.skipTest()", "self.skipTest"),
    ],
)
def test_a_skip_call_without_a_reason_is_refused(repo, capsys, body, name):
    put(repo, "tests/test_a.py", f"import pytest\n\n\ndef test_a(self):\n    {body}\n")
    put(repo, "skip-baseline.txt", "tests/test_a.py 1\n")
    code, out = run(capsys)
    assert code == 1
    assert f"tests/test_a.py:5: {name}" in out and "no reason" in out


@pytest.mark.parametrize(
    "body",
    [
        'pytest.skip("why")',
        'pytest.skip(reason="why")',
        'pytest.xfail("why")',
        'pytest.importorskip("yaml", reason="optional")',
        'self.skipTest("why")',
    ],
)
def test_a_skip_call_with_a_reason_is_accepted(repo, capsys, body):
    put(repo, "tests/test_a.py", f"import pytest\n\n\ndef test_a(self):\n    {body}\n")
    put(repo, "skip-baseline.txt", "tests/test_a.py 1\n")
    assert run(capsys)[0] == 0


@pytest.mark.parametrize(
    "decorator,ok",
    [
        ('unittest.skip("why")', True),
        ("unittest.skip()", False),
        ('unittest.skipIf(True, "why")', True),
        ("unittest.skipIf(True)", False),
        ('unittest.skipUnless(True, reason="why")', True),
        ("unittest.skipUnless(True)", False),
    ],
)
def test_unittest_skips_need_a_reason_too(repo, capsys, decorator, ok):
    put(repo, "tests/test_a.py", f"import unittest\n\n@{decorator}\ndef test_a():\n    pass\n")
    put(repo, "skip-baseline.txt", "tests/test_a.py 1\n")
    assert (run(capsys)[0] == 0) is ok


def test_a_new_marker_beyond_the_baseline_is_refused(repo, capsys):
    put(repo, "tests/test_a.py", 'import pytest\n\npytest.skip("a")\npytest.skip("b")\n')
    put(repo, "skip-baseline.txt", "tests/test_a.py 1\n")
    code, out = run(capsys)
    assert code == 1
    assert "tests/test_a.py: 2 skip/xfail markers, baseline 1" in out


def test_a_file_missing_from_the_baseline_has_a_ceiling_of_zero(repo, capsys):
    put(repo, "tests/test_a.py", 'import pytest\n\npytest.skip("a")\n')
    code, out = run(capsys)
    assert code == 1 and "baseline 0" in out


def test_a_baseline_that_is_too_generous_must_be_lowered(repo, capsys):
    put(repo, "tests/test_a.py", 'import pytest\n\npytest.skip("a")\n')
    put(repo, "tests/test_b.py", "def test_b():\n    pass\n")
    put(repo, "skip-baseline.txt", "# comment\n\ntests/test_a.py 3\ntests/test_b.py 1\n")
    code, out = run(capsys)
    assert code == 1
    assert "tests/test_a.py: down to 1 markers; lower it to 1" in out
    assert "tests/test_b.py: down to 0 markers; delete its line" in out


@pytest.mark.parametrize("line", ["tests/test_a.py", "tests/test_a.py many", "5", "tests/a.py -1"])
def test_a_malformed_baseline_line_stops_the_check(repo, capsys, line):
    put(repo, "tests/test_a.py", "def test_a():\n    pass\n")
    put(repo, "skip-baseline.txt", line + "\n")
    with pytest.raises(SystemExit) as stopped:
        check_skips.main([])
    assert stopped.value.code == 1
    assert "malformed entry" in capsys.readouterr().out


def test_a_file_that_cannot_be_parsed_is_reported(repo, capsys):
    put(repo, "tests/test_a.py", "def broken(:\n")
    put(repo, "tests/test_b.py", b"\xff\xfe\x00")
    code, out = run(capsys)
    assert code == 1
    assert "tests/test_a.py: cannot be parsed (SyntaxError)" in out
    assert "tests/test_b.py: cannot be parsed" in out


def test_only_test_files_are_read_and_ignored_folders_are_skipped(repo, capsys):
    skip = 'import pytest\n\npytest.skip("x")\n'
    put(repo, "src/app.py", skip)
    put(repo, "node_modules/tests/test_x.py", skip)
    put(repo, ".venv/test_y.py", skip)
    put(repo, "pkg/widget_test.py", skip)
    put(repo, "conftest.py", skip)
    put(repo, "tests/helper.py", skip)
    put(repo, "tests/notes.txt", skip)
    put(repo, "skip-baseline.txt", "conftest.py 1\npkg/widget_test.py 1\ntests/helper.py 1\n")
    assert run(capsys) == (0, "skips ok (3 baselined markers in 3 files)\n")


def test_write_records_the_current_counts_and_the_check_then_passes(repo, capsys):
    put(repo, "tests/test_a.py", 'import pytest\n\npytest.skip("a")\npytest.skip("b")\n')
    assert run(capsys, "--write") == (0, "wrote skip-baseline.txt: 2 markers in 1 files\n")
    text = (repo / "skip-baseline.txt").read_text(encoding="utf-8")
    assert text.endswith("tests/test_a.py 2\n") and text.startswith("# Test skip/xfail")
    assert run(capsys)[0] == 0


def test_write_still_exits_1_when_a_marker_has_no_reason(repo, capsys):
    put(repo, "tests/test_a.py", "import pytest\n\npytest.skip()\n")
    code, out = run(capsys, "--write")
    assert code == 1
    assert out == "wrote skip-baseline.txt: 1 markers in 1 files\n"


def test_outside_a_git_checkout_every_python_file_is_looked_at(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_a.py").write_text("import pytest\n\npytest.skip()\n")
    code, out = run(capsys)
    assert code == 1 and "tests/test_a.py:3" in out
