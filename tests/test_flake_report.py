"""The flake report: what it lists from a pytest JUnit file, and that it never fails a job."""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.flake_report import main

JUNIT = """<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="5">
<testcase classname="tests.test_a" name="test_fast" time="0.01"/>
<testcase classname="tests.test_a" name="test_slow" time="9.50"/>
<testcase classname="tests.test_a" name="test_flaky" time="0.20"><failure message="boom">x</failure></testcase>
<testcase classname="tests.test_a" name="test_flaky" time="0.30"/>
<testcase classname="tests.test_b" name="test_skipped" time="0">
<skipped type="pytest.skip" message="needs docker"/></testcase>
</testsuite></testsuites>
"""


def run(tmp_path: Path, capsys: pytest.CaptureFixture[str], *names: str) -> tuple[int, str]:
    code = main([str(tmp_path / name) for name in names])
    return code, capsys.readouterr().out


def test_report_lists_reruns_skips_and_slowest(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    (tmp_path / "junit.xml").write_text(JUNIT, encoding="utf-8")
    code, out = run(tmp_path, capsys, "junit.xml")
    assert code == 0
    assert "5 results: 3 passed, 1 failed, 0 errors, 1 skipped" in out
    assert "### Reruns (1)" in out
    assert "| `tests.test_a::test_flaky` | failed -> passed |" in out
    assert "- 1 x needs docker: `tests.test_b::test_skipped`" in out
    assert "### Failures (1)" in out
    assert out.index("| 9.50 | `tests.test_a::test_slow` |") < out.index("| 0.30 |")


def test_report_says_so_when_every_test_ran_once(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    (tmp_path / "junit.xml").write_text(
        '<testsuites><testsuite><testcase classname="t" name="a" time="1"/></testsuite></testsuites>',
        encoding="utf-8",
    )
    code, out = run(tmp_path, capsys, "junit.xml")
    assert code == 0
    assert "None: every test ran once." in out
    assert "### Skips (0)" in out


def test_report_appends_to_the_job_summary(tmp_path, capsys, monkeypatch):
    summary = tmp_path / "summary.md"
    summary.write_text("earlier\n", encoding="utf-8")
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    (tmp_path / "junit.xml").write_text(JUNIT, encoding="utf-8")
    _, out = run(tmp_path, capsys, "junit.xml")
    assert summary.read_text(encoding="utf-8") == "earlier\n" + out


def test_missing_or_broken_files_are_reported_and_exit_zero(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    (tmp_path / "broken.xml").write_text("<testsuites>", encoding="utf-8")
    code, out = run(tmp_path, capsys, "missing.xml", "broken.xml")
    assert code == 0
    assert "could not read" in out
    assert "no test results found" in out
