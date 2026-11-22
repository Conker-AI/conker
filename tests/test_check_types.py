"""scripts/check_types.py: the per-file baseline that may only shrink, and a pyright that fails."""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

from scripts import check_types


@pytest.fixture()
def folder(tmp_path, monkeypatch) -> Path:
    monkeypatch.chdir(tmp_path)
    return tmp_path


def pyright_says(monkeypatch, stdout: str, stderr: str = "") -> None:
    monkeypatch.setattr(
        check_types.subprocess,
        "run",
        lambda *a, **k: subprocess.CompletedProcess(a, 1, stdout=stdout, stderr=stderr),
    )


def with_errors(monkeypatch, counts: dict[str, int]) -> None:
    monkeypatch.setattr(check_types, "current_errors", lambda: Counter(counts))
    monkeypatch.setattr(sys, "argv", ["check_types.py"])


def test_only_errors_are_counted_per_file(folder, monkeypatch):
    items = [
        {"file": str(folder / "a.py"), "severity": "error"},
        {"file": str(folder / "a.py"), "severity": "error"},
        {"file": str(folder / "sub" / "b.py"), "severity": "error"},
        {"file": str(folder / "a.py"), "severity": "warning"},
        {"file": str(folder / "c.py"), "severity": "information"},
    ]
    pyright_says(monkeypatch, json.dumps({"generalDiagnostics": items}))
    assert check_types.current_errors() == {"a.py": 2, "sub/b.py": 1}


def test_a_report_with_no_diagnostics_is_zero_errors(folder, monkeypatch):
    pyright_says(monkeypatch, "{}")
    assert check_types.current_errors() == {}


def test_output_that_is_not_json_stops_the_check_with_exit_2(folder, monkeypatch, capsys):
    pyright_says(monkeypatch, "Traceback: pyright is not installed", "boom")
    with pytest.raises(SystemExit) as stopped:
        check_types.current_errors()
    assert stopped.value.code == 2
    out = capsys.readouterr().out
    assert "pyright is not installed" in out and "pyright did not produce a JSON report." in out


def test_a_missing_baseline_means_every_error_is_new(folder, monkeypatch, capsys):
    with_errors(monkeypatch, {"a.py": 1})
    assert check_types.main() == 1
    assert "a.py: 1 type errors, baseline 0" in capsys.readouterr().out


def test_no_errors_and_no_baseline_passes(folder, monkeypatch, capsys):
    with_errors(monkeypatch, {})
    assert check_types.main() == 0
    assert capsys.readouterr().out == "types ok (0 baselined errors in 0 files)\n"


def test_errors_within_the_baseline_pass(folder, monkeypatch, capsys):
    (folder / "type-baseline.txt").write_text("# note\n\na.py 2  # old\nb.py 1\n", encoding="utf-8")
    with_errors(monkeypatch, {"a.py": 2, "b.py": 1})
    assert check_types.main() == 0
    assert capsys.readouterr().out == "types ok (3 baselined errors in 2 files)\n"


def test_an_error_beyond_the_baseline_is_refused_and_names_the_file(folder, monkeypatch, capsys):
    (folder / "type-baseline.txt").write_text("a.py 1\n", encoding="utf-8")
    with_errors(monkeypatch, {"a.py": 2, "new.py": 1})
    assert check_types.main() == 1
    out = capsys.readouterr().out
    assert "a.py: 2 type errors, baseline 1. Fix the new ones (python -m pyright a.py)." in out
    assert "new.py: 1 type errors, baseline 0" in out


def test_a_baseline_that_is_too_generous_must_be_lowered_or_deleted(folder, monkeypatch, capsys):
    (folder / "type-baseline.txt").write_text("a.py 3\nb.py 2\n", encoding="utf-8")
    with_errors(monkeypatch, {"a.py": 1})
    assert check_types.main() == 1
    out = capsys.readouterr().out
    assert "a.py: down to 1 type errors; lower it to 1 in type-baseline.txt." in out
    assert "b.py: down to 0 type errors; delete its line in type-baseline.txt." in out


@pytest.mark.parametrize("line", ["a.py", "a.py many", "a.py -1", "7"])
def test_a_malformed_baseline_line_stops_the_check(folder, monkeypatch, capsys, line):
    (folder / "type-baseline.txt").write_text(line + "\n", encoding="utf-8")
    with_errors(monkeypatch, {})
    with pytest.raises(SystemExit) as stopped:
        check_types.main()
    assert stopped.value.code == 1
    assert "malformed entry" in capsys.readouterr().out


def test_write_records_the_counts_sorted_with_the_header(folder, monkeypatch, capsys):
    with_errors(monkeypatch, {"b.py": 1, "a.py": 2})
    monkeypatch.setattr(sys, "argv", ["check_types.py", "--write"])
    assert check_types.main() == 0
    assert capsys.readouterr().out == "wrote type-baseline.txt: 3 errors in 2 files\n"
    text = (folder / "type-baseline.txt").read_text(encoding="utf-8")
    assert text == check_types.HEADER + "a.py 2\nb.py 1\n"
    assert check_types.baseline() == {"a.py": 2, "b.py": 1}
