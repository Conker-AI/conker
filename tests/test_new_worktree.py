"""scripts/new_worktree.py through its command line, against a throwaway origin and clone."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts import new_worktree


def sh(*args: str, cwd: Path) -> str:
    done = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True)
    return done.stdout.strip()


@pytest.fixture()
def repo(tmp_path, monkeypatch) -> Path:
    """tmp/origin.git, and a clone at tmp/main/conker, so worktrees go to tmp/main/wt."""
    origin = tmp_path / "origin.git"
    sh("init", "-q", "--bare", "-b", "main", str(origin), cwd=tmp_path)
    clone = tmp_path / "main" / "conker"
    clone.parent.mkdir()
    sh("clone", "-q", str(origin), str(clone), cwd=tmp_path)
    sh("config", "user.email", "t@example.test", cwd=clone)
    sh("config", "user.name", "t", cwd=clone)
    (clone / "dashboard").mkdir()
    (clone / "dashboard" / "package.json").write_text("{}", encoding="utf-8")
    sh("add", "-A", cwd=clone)
    sh("commit", "-q", "-m", "first", cwd=clone)
    sh("push", "-q", "origin", "HEAD:main", cwd=clone)
    sh("branch", "--set-upstream-to=origin/main", cwd=clone)
    sh("fetch", "-q", "origin", cwd=clone)
    monkeypatch.setattr(new_worktree, "ROOT", clone)
    monkeypatch.setattr(new_worktree.git, "__kwdefaults__", {"cwd": clone})
    return clone


@pytest.mark.parametrize("name", ["bad name", "../escape", "a/b", "", "a;b", "x\ny", "ключ"])
def test_a_name_that_is_not_a_plain_folder_name_is_refused(repo, name):
    with pytest.raises(SystemExit, match="letters, digits, dot, dash and underscore"):
        new_worktree.main([name, "--no-install"])
    assert not (repo.parent / "wt").exists()


def test_an_existing_folder_is_refused_and_left_alone(repo):
    taken = repo.parent / "wt" / "taken"
    taken.mkdir(parents=True)
    (taken / "keep.txt").write_text("mine", encoding="utf-8")
    with pytest.raises(SystemExit, match="already exists"):
        new_worktree.main(["taken", "--no-install"])
    assert (taken / "keep.txt").read_text(encoding="utf-8") == "mine"


def test_a_failing_git_command_stops_with_its_own_message(repo):
    sh("remote", "remove", "origin", cwd=repo)
    with pytest.raises(SystemExit, match="git fetch -q origin failed"):
        new_worktree.main(["x", "--no-install"])
    assert not (repo.parent / "wt" / "x").exists()


def test_a_branch_that_already_exists_is_refused(repo):
    sh("branch", "taken-branch", cwd=repo)
    with pytest.raises(SystemExit, match="worktree add"):
        new_worktree.main(["fresh", "--branch", "taken-branch", "--no-install"])
    assert not (repo.parent / "wt" / "fresh").exists()


def test_a_worktree_is_made_from_origin_main_on_a_branch_of_the_same_name(repo, capsys):
    assert new_worktree.main(["feat-x", "--no-install"]) == 0
    target = repo.parent / "wt" / "feat-x"
    assert capsys.readouterr().out.strip() == str(target.resolve())
    assert (target / "dashboard" / "package.json").exists()
    assert sh("rev-parse", "--abbrev-ref", "HEAD", cwd=target) == "feat-x"
    assert sh("rev-parse", "HEAD", cwd=target) == sh("rev-parse", "origin/main", cwd=repo)


def test_the_branch_can_be_named_separately(repo):
    assert new_worktree.main(["folder", "--branch", "feat/other", "--no-install"]) == 0
    assert sh("rev-parse", "--abbrev-ref", "HEAD", cwd=repo.parent / "wt" / "folder") == (
        "feat/other"
    )


def test_dependencies_are_installed_in_the_dashboard_folder_unless_skipped(
    repo, monkeypatch, capsys
):
    calls = []
    real = subprocess.run

    def fake(command, **kwargs):
        if command[0] == new_worktree.NPM:
            calls.append((command, kwargs["cwd"]))
            return subprocess.CompletedProcess(command, 0)
        return real(command, **kwargs)

    monkeypatch.setattr(new_worktree.subprocess, "run", fake)
    assert new_worktree.main(["with-deps"]) == 0
    target = repo.parent / "wt" / "with-deps"
    assert calls == [
        (
            [new_worktree.NPM, "ci", "--prefer-offline", "--no-audit", "--no-fund"],
            target.resolve() / "dashboard",
        )
    ]
    capsys.readouterr()
    assert new_worktree.main(["no-deps", "--no-install"]) == 0
    assert len(calls) == 1
