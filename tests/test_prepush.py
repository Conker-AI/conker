"""scripts/prepush.py: which checks a change triggers, and the exit code when one fails."""

from __future__ import annotations

import pytest

from scripts import prepush


def names(files: list[str], everything: bool = False) -> list[str]:
    return [name for name, _, _ in prepush.plan(files, everything)]


def test_no_changed_files_plan_nothing():
    assert prepush.plan([], False) == []


def test_a_docs_only_change_plans_nothing():
    assert names(["docs/guide.md", "README.md"]) == []


def test_a_script_change_plans_the_python_checks_and_its_related_tests():
    planned = names(["scripts/codemap.py"])
    assert planned[:7] == [
        "ruff",
        "ruff format",
        "types",
        "file sizes",
        "capabilities",
        "status page",
        "code map",
    ]
    assert not any(name.startswith("dashboard") for name in planned)


@pytest.mark.parametrize("name", ["versions.env", "capabilities.json", "tests/test_x.py"])
def test_a_json_env_or_python_file_anywhere_plans_the_python_checks(name):
    assert "ruff" in names([name])


def test_a_dashboard_change_plans_only_the_dashboard_checks():
    assert names(["dashboard/src/app.ts"]) == [
        "dashboard lint",
        "dashboard build",
        "dashboard check",
        "dashboard api types",
    ]


def test_a_new_pi_pin_plans_the_api_types_check():
    assert "dashboard api types" in names(["scripts/workspace-sources.json"])


def test_everything_plans_both_and_runs_the_whole_suite():
    planned = names([], True)
    assert "pytest (all)" in planned
    assert {"ruff", "dashboard lint", "dashboard check"} <= set(planned)


def test_tests_named_after_a_changed_script_are_chosen_and_unrelated_ones_are_not():
    found = prepush.related_tests(["scripts/codemap.py", "scripts/no_such_script_anywhere.py"])
    assert found == ["tests/test_codemap.py"]


def test_a_changed_test_file_that_no_longer_exists_is_not_chosen():
    assert prepush.related_tests(["tests/test_deleted_long_ago.py", "README.md"]) == []


def test_a_script_with_related_tests_adds_one_pytest_job():
    planned = prepush.plan(["scripts/codemap.py"], False)
    command = next(command for name, command, _ in planned if name.startswith("pytest"))
    assert command[-1] == "tests/test_codemap.py"
    assert "-x" in command


def test_a_failed_check_makes_the_run_fail_and_prints_its_output(monkeypatch, capsys):
    monkeypatch.setattr(prepush, "changed_files", lambda base: ["scripts/x.py"])
    monkeypatch.setattr(
        prepush,
        "plan",
        lambda files, everything: [("good", ["a"], prepush.ROOT), ("bad", ["b"], prepush.ROOT)],
    )
    monkeypatch.setattr(
        prepush,
        "run_job",
        lambda job: (job[0], job[0] == "good", 0.1, "the failing output"),
    )
    assert prepush.main([]) == 1
    out = capsys.readouterr().out
    assert "ok" in out and "FAIL" in out and "the failing output" in out
    assert "1/2 passed" in out


def test_when_every_check_passes_the_run_succeeds_and_hides_output(monkeypatch, capsys):
    monkeypatch.setattr(prepush, "changed_files", lambda base: ["scripts/x.py"])
    monkeypatch.setattr(prepush, "plan", lambda files, everything: [("good", ["a"], prepush.ROOT)])
    monkeypatch.setattr(prepush, "run_job", lambda job: (job[0], True, 0.1, "chatter"))
    assert prepush.main(["--base", "main"]) == 0
    out = capsys.readouterr().out
    assert "1/1 passed" in out and "chatter" not in out


def test_nothing_to_check_is_a_pass(monkeypatch, capsys):
    monkeypatch.setattr(prepush, "changed_files", lambda base: ["README.md"])
    assert prepush.main([]) == 0
    assert "Nothing to check" in capsys.readouterr().out


def test_the_base_branch_is_passed_to_git(monkeypatch):
    seen = []
    monkeypatch.setattr(prepush, "changed_files", lambda base: seen.append(base) or [])
    assert prepush.main(["--base", "release/1"]) == 0
    assert seen == ["release/1"]


def test_run_job_reports_a_nonzero_exit_and_the_tail_of_the_output(tmp_path):
    code = "import sys; print('x' * 5000); print('the end', file=sys.stderr); sys.exit(3)"
    name, ok, seconds, output = prepush.run_job(("job", [prepush.PY, "-c", code], tmp_path))
    assert (name, ok) == ("job", False)
    assert seconds >= 0
    assert len(output) == 3000 and output.rstrip().endswith("the end")


def test_changed_files_are_the_branch_diff_plus_uncommitted_work(tmp_path, monkeypatch):
    import subprocess

    def git(*args):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init", "-q", "-b", "main")
    git("config", "user.email", "t@example.test")
    git("config", "user.name", "t")
    (tmp_path / "base.txt").write_text("base", encoding="utf-8")
    git("add", "-A")
    git("commit", "-q", "-m", "base")
    git("checkout", "-q", "-b", "work")
    (tmp_path / "committed.py").write_text("x", encoding="utf-8")
    git("add", "-A")
    git("commit", "-q", "-m", "work")
    (tmp_path / "loose.md").write_text("y", encoding="utf-8")
    monkeypatch.setattr(prepush, "ROOT", tmp_path)
    assert prepush.changed_files("main") == ["committed.py", "loose.md"]
    assert prepush.changed_files("no-such-base") == ["loose.md"]
