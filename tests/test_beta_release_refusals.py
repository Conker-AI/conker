"""`scripts/beta_release.py main()` against a throwaway git repository: what it cuts and what it refuses.

Each case builds its own repository in tmp_path (a tagged main, optional merged pull requests, a
copy of release_notes.py) and points the script's ROOT at it, so the real checkout is never touched.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from scripts import beta_release

REAL_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
VERSIONS = "# pins\nCONKER_VERSION=0.1.0\nCONKER_DASHBOARD_REVISION=old\n"
CHANGELOG = "# Changelog\n\n## Unreleased\n\n## 0.1.0\n\n- first\n"


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", *args],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def commit_file(root: Path, name: str, text: str, message: str) -> None:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    git(root, "add", name)
    git(root, "commit", "-q", "-m", message)


def merge_pull_request(root: Path, number: int, title: str) -> None:
    git(root, "checkout", "-q", "-b", f"pr{number}")
    commit_file(root, f"change{number}.txt", title, f"work for {number}")
    git(root, "checkout", "-q", "main")
    git(
        root,
        "merge",
        "--no-ff",
        "-q",
        f"pr{number}",
        "-m",
        f"Merge pull request #{number} from Conker-AI/pr{number}",
        "-m",
        title,
    )


@pytest.fixture()
def repo(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path))
    for key, value in (
        ("GIT_AUTHOR_NAME", "t"),
        ("GIT_AUTHOR_EMAIL", "t@example.test"),
        ("GIT_COMMITTER_NAME", "t"),
        ("GIT_COMMITTER_EMAIL", "t@example.test"),
    ):
        monkeypatch.setenv(key, value)
    git(root, "init", "-q", "-b", "main")
    commit_file(root, "versions.env", VERSIONS, "start")
    commit_file(root, "CHANGELOG.md", CHANGELOG, "changelog")
    commit_file(root, "dashboard/app.txt", "dash", "dashboard")
    (root / "scripts").mkdir()
    shutil.copy(REAL_SCRIPTS / "release_notes.py", root / "scripts/release_notes.py")
    git(root, "add", "scripts")
    git(root, "commit", "-q", "-m", "notes tool")
    git(root, "tag", "v0.1.0")
    monkeypatch.setattr(beta_release, "ROOT", root)
    return root


def run(*argv: str) -> int:
    return beta_release.main(list(argv))


def test_refuses_when_no_release_tag_exists(repo, capsys):
    git(repo, "tag", "-d", "v0.1.0")
    assert run() == 1
    assert capsys.readouterr().err.strip() == "no vX.Y.Z tag exists yet"


def test_refuses_outside_a_git_repository(tmp_path, monkeypatch, capsys):
    plain = tmp_path / "plain"
    plain.mkdir()
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path))
    monkeypatch.setattr(beta_release, "ROOT", plain)
    assert run() == 1
    assert capsys.readouterr().err.startswith("git tag --list v* failed: ")


def test_ignores_tags_that_are_not_plain_versions(repo, capsys):
    git(repo, "tag", "v9.9.9-rc1")
    merge_pull_request(repo, 7, "Add a thing")
    assert run("--dry-run") == 0
    assert capsys.readouterr().out.startswith("Would cut v0.1.1 from 1 merged pull requests:")


def test_cuts_nothing_when_head_is_already_the_newest_tag(repo, capsys):
    assert run() == 0
    assert capsys.readouterr().out.strip() == "HEAD is already v0.1.0; nothing to cut."


def test_cuts_nothing_when_no_pull_request_merged_since_the_tag(repo, capsys):
    commit_file(repo, "direct.txt", "x", "direct commit")
    assert run() == 0
    assert capsys.readouterr().out.strip() == "No pull request merged since v0.1.0; nothing to cut."


def test_dry_run_lists_the_titles_and_changes_nothing(repo, capsys):
    merge_pull_request(repo, 5, "Add a thing")
    merge_pull_request(repo, 6, "Fix another thing")
    before = git(repo, "rev-parse", "HEAD")
    assert run("--dry-run") == 0
    assert capsys.readouterr().out.strip() == (
        "Would cut v0.1.1 from 2 merged pull requests:\n"
        "- Add a thing (#5)\n- Fix another thing (#6)"
    )
    assert git(repo, "rev-parse", "HEAD") == before
    assert git(repo, "tag", "--list", "v0.1.1") == ""
    assert (repo / "versions.env").read_text(encoding="utf-8") == VERSIONS


def test_cuts_a_local_beta_that_changes_only_versions_and_changelog(repo, capsys):
    merge_pull_request(repo, 5, "Add a thing")
    assert run() == 0
    assert capsys.readouterr().out.strip() == "Cut v0.1.1 (local only)."
    assert git(repo, "log", "-1", "--pretty=%s") == "Beta 0.1.1"
    assert git(repo, "rev-parse", "v0.1.1") == git(repo, "rev-parse", "HEAD")
    changed = git(repo, "diff", "--name-only", "v0.1.0", "v0.1.1").splitlines()
    assert sorted(changed) == ["CHANGELOG.md", "change5.txt", "versions.env"]
    versions = (repo / "versions.env").read_text(encoding="utf-8")
    assert "CONKER_VERSION=0.1.1\n" in versions
    assert f"CONKER_DASHBOARD_REVISION={git(repo, 'rev-parse', 'HEAD:dashboard')}\n" in versions
    log = (repo / "CHANGELOG.md").read_text(encoding="utf-8")
    assert (
        "## 0.1.1\n\nBeta build from main. Changes since the last tag:\n\n- Add a thing (#5)" in log
    )


def test_push_publishes_a_prerelease_with_the_changelog_section(
    repo, tmp_path, monkeypatch, capsys
):
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
    git(repo, "remote", "add", "origin", str(remote))
    merge_pull_request(repo, 5, "Add a thing")
    published = []
    real_run = subprocess.run

    def run_with_fake_gh(command, *args, **kwargs):
        if command[0] == "gh":
            published.append(command)
            return subprocess.CompletedProcess(command, 0)
        return real_run(command, *args, **kwargs)

    monkeypatch.setattr(beta_release.subprocess, "run", run_with_fake_gh)
    assert run("--push") == 0
    assert capsys.readouterr().out.strip() == "Cut v0.1.1 (published)."
    assert git(remote, "tag", "--list", "v0.1.1") == "v0.1.1"
    (command,) = published
    assert command[:4] == ["gh", "release", "create", "v0.1.1"]
    assert "--prerelease" in command
    assert command[command.index("--title") + 1] == "Conker 0.1.1 (beta)"
    assert "- Add a thing (#5)" in command[command.index("--notes") + 1]


def test_push_failure_is_reported_after_the_local_tag_exists(repo, capsys):
    merge_pull_request(repo, 5, "Add a thing")
    assert run("--push") == 1
    assert capsys.readouterr().err.startswith("git push origin v0.1.1 failed: ")
    assert git(repo, "tag", "--list", "v0.1.1") == "v0.1.1"


def test_refuses_a_versions_file_without_exactly_one_version_line(repo, capsys):
    commit_file(repo, "versions.env", "OTHER=1\n", "drop the pin")
    merge_pull_request(repo, 5, "Add a thing")
    assert run() == 1
    assert (
        capsys.readouterr().err.strip() == "CONKER_VERSION must appear exactly once in versions.env"
    )
    assert git(repo, "tag", "--list", "v0.1.1") == ""


def test_refuses_a_changelog_without_an_unreleased_heading(repo, capsys):
    commit_file(repo, "CHANGELOG.md", "# Changelog\n\n## 0.1.0\n\n- first\n", "no marker")
    merge_pull_request(repo, 5, "Add a thing")
    assert run() == 1
    assert capsys.readouterr().err.strip() == "CHANGELOG.md has no ## Unreleased heading"
    assert git(repo, "tag", "--list", "v0.1.1") == ""


def test_refuses_when_the_release_notes_check_fails(repo, capsys):
    git(repo, "rm", "-q", "scripts/release_notes.py")
    git(repo, "commit", "-q", "-m", "drop notes tool")
    merge_pull_request(repo, 5, "Add a thing")
    assert run() == 1
    assert capsys.readouterr().err.startswith("the release notes check failed: ")
    assert git(repo, "tag", "--list", "v0.1.1") == ""
