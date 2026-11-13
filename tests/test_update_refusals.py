"""Refusals of the repository-layout updater (scripts/update.py HostTransport): each guard stops
the update with its own reason, before it pulls, swaps or restarts anything."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from scripts.update import HostTransport, UpdateError


def transport(tmp_path: Path, answers=None) -> tuple[HostTransport, list[list[str]]]:
    """A HostTransport whose commands answer from `answers` (first matching prefix wins)."""
    made = object.__new__(HostTransport)
    made.root, made.env_file = tmp_path, tmp_path / ".env"
    made.override_file = tmp_path / "git" / "resolved-images.json"
    calls: list[list[str]] = []

    def run(command, **_options):
        calls.append([str(part) for part in command])
        for prefix, answer in (answers or {}).items():
            if " ".join(calls[-1]).startswith(prefix):
                if isinstance(answer, Exception):
                    raise answer
                return answer
        return ""

    made._run = run
    made._git = lambda *arguments: run(["git", *arguments])
    return made, calls


# --- the candidate ref ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "ref", ["-upload-pack=x", "main..evil", "main@{1}", "a\\b", "a:b", "a~1", "a^", "a?", "a*", "a[", "a b"]
)
def test_an_unsafe_update_ref_is_refused_before_git_runs(tmp_path, monkeypatch, ref):
    monkeypatch.setenv("CONKER_UPDATE_REF", ref)
    made, calls = transport(tmp_path)
    with pytest.raises(UpdateError, match="not a safe Git ref"):
        made.prepare_candidate({"revision": "0" * 40})
    assert calls == []


@pytest.mark.parametrize("upstream", ["main", "/main", "origin/"])
def test_a_branch_without_a_safe_upstream_is_refused(tmp_path, monkeypatch, upstream):
    monkeypatch.delenv("CONKER_UPDATE_REF", raising=False)
    made, calls = transport(tmp_path, {"git rev-parse --abbrev-ref": upstream})
    with pytest.raises(UpdateError, match="no safe upstream"):
        made.prepare_candidate({"revision": "0" * 40})
    assert not any("fetch" in call for call in calls)


def test_a_candidate_that_is_not_ahead_of_the_running_revision_is_refused(tmp_path, monkeypatch):
    monkeypatch.delenv("CONKER_UPDATE_REF", raising=False)
    behind = UpdateError("command failed: git merge-base --is-ancestor")
    made, calls = transport(
        tmp_path,
        {"git rev-parse --abbrev-ref": "origin/main", "git merge-base": behind},
    )
    with pytest.raises(UpdateError, match="merge-base"):
        made.prepare_candidate({"revision": "0" * 40})
    assert not any("worktree" in call for call in calls)  # nothing staged


# --- images --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "image",
    ["ghcr.io/conker-ai/pi:latest", "ghcr.io/someone/pi:0.24.0", "pi@sha256:short", "postgres:16"],
)
def test_an_unpinned_or_mutable_image_is_refused_before_any_pull(tmp_path, image):
    made, calls = transport(tmp_path)
    with pytest.raises(UpdateError, match="unpinned or mutable"):
        made.pull_exact_images({"service_images": {"other": image}})
    assert not any(call[:2] == ["docker", "pull"] for call in calls)


def test_a_pulled_image_resolves_to_its_own_repositorys_digest(tmp_path):
    reference = "ghcr.io/conker-ai/pi:0.24.0"
    digests = ["docker.io/other/pi@sha256:" + "b" * 64, "ghcr.io/conker-ai/pi@sha256:" + "c" * 64]
    made, _calls = transport(tmp_path, {"docker image inspect": json.dumps(digests)})
    assert made.pull_exact_images({"service_images": {"pi": reference}}) == {"pi": digests[1]}


@pytest.mark.parametrize(
    ("digests", "message"),
    [([], "no registry digest"), (["docker.io/other/pi@sha256:" + "b" * 64], "does not match")],
)
def test_a_pulled_image_without_its_digest_is_refused(tmp_path, digests, message):
    made, _calls = transport(tmp_path, {"docker image inspect": json.dumps(digests)})
    with pytest.raises(UpdateError, match=message):
        made.pull_exact_images({"service_images": {"pi": "ghcr.io/conker-ai/pi:0.24.0"}})


# --- applying and rolling back -------------------------------------------------------------------


def test_code_is_not_applied_over_a_change_made_after_preflight(tmp_path):
    made, calls = transport(tmp_path, {"git status": " M conker"})
    with pytest.raises(UpdateError, match="changed after preflight"):
        made.apply_code({"revision": "1" * 40})
    assert not any("merge" in call for call in calls)


@pytest.mark.parametrize(
    ("body", "status"),
    [('{"status": "ok"}', "ok"), ('{"status": "degraded"}', "degraded"), ("not json", None), ("[]", None)],
)
def test_a_health_answer_is_read_or_counted_as_no_answer(body, status):
    assert HostTransport._health_status(body) == status


def git(root: Path, *arguments: str) -> str:
    result = subprocess.run(["git", *arguments], cwd=root, capture_output=True, text=True, check=True)
    return result.stdout.strip()


@pytest.fixture
def repository(tmp_path):
    """A real repository with a prior and a candidate commit; HEAD is on the candidate."""
    git(tmp_path, "init", "-b", "main")
    git(tmp_path, "config", "user.email", "update-test@example.invalid")
    git(tmp_path, "config", "user.name", "Update Test")
    (tmp_path / "release.txt").write_text("prior\n", encoding="utf-8")
    git(tmp_path, "add", "release.txt")
    git(tmp_path, "commit", "-m", "prior")
    prior = git(tmp_path, "rev-parse", "HEAD")
    (tmp_path / "release.txt").write_text("candidate\n", encoding="utf-8")
    git(tmp_path, "commit", "-am", "candidate")
    made = object.__new__(HostTransport)
    made.root = tmp_path
    return made, prior, git(tmp_path, "rev-parse", "HEAD")


def test_a_rollback_refuses_over_files_changed_during_the_update(repository):
    made, prior, candidate = repository
    (made.root / "release.txt").write_text("owner edit\n", encoding="utf-8")
    with pytest.raises(UpdateError, match="refusing destructive rollback"):
        made._restore_code({"revision": prior, "branch": "main"}, {"revision": candidate})
    assert (made.root / "release.txt").read_text(encoding="utf-8") == "owner edit\n"


def test_a_rollback_refuses_an_untracked_file(repository):
    made, prior, candidate = repository
    (made.root / "new.txt").write_text("kept\n", encoding="utf-8")
    with pytest.raises(UpdateError, match="refusing destructive rollback"):
        made._restore_code({"revision": prior, "branch": "main"}, {"revision": candidate})
    assert (made.root / "new.txt").exists()


def test_a_rollback_refuses_a_head_moved_outside_the_update(repository):
    made, prior, candidate = repository
    (made.root / "release.txt").write_text("elsewhere\n", encoding="utf-8")
    git(made.root, "commit", "-am", "someone else")
    with pytest.raises(UpdateError, match="HEAD moved outside"):
        made._restore_code({"revision": prior, "branch": "main"}, {"revision": candidate})


def test_a_rollback_refuses_an_index_moved_outside_the_update(repository):
    made, prior, candidate = repository
    (made.root / "release.txt").write_text("staged\n", encoding="utf-8")
    git(made.root, "add", "release.txt")
    with pytest.raises(UpdateError, match="index moved outside"):
        made._restore_code({"revision": prior, "branch": "main"}, {"revision": candidate})


def test_a_rollback_is_proven_only_on_the_prior_revision_and_services(tmp_path):
    absent = {"exists": False, "running": False, "image_id": None}
    prior = {"revision": "1" * 40, "services": {"pi": absent}}
    made, _calls = transport(tmp_path, {"git rev-parse HEAD": "2" * 40})
    with pytest.raises(UpdateError, match="prior Git revision is not active"):
        made.verify_rollback(prior)

    running = [{"State": {"Running": True}, "Image": "sha256:" + "d" * 64}]
    answers = {
        "git rev-parse HEAD": "1" * 40,
        "docker compose": "container-1",
        "docker inspect": json.dumps(running),
    }
    made, _calls = transport(tmp_path, answers)
    made._compose_command = lambda *arguments, **_: ["docker", "compose", *arguments]
    with pytest.raises(UpdateError, match="not restored"):
        made.verify_rollback(prior)  # pi runs again, though it did not exist before


def test_a_service_with_no_container_is_recorded_as_absent(tmp_path):
    made, _calls = transport(tmp_path, {"docker compose": ""})
    made._compose_command = lambda *arguments, **_: ["docker", "compose", *arguments]
    absent = {"exists": False, "running": False, "image_id": None}
    assert made._service_state(["pi"]) == {"pi": absent}


def test_a_failed_command_names_only_its_first_words(tmp_path):
    made = object.__new__(HostTransport)
    made.root = tmp_path
    with pytest.raises(UpdateError, match=r"^command failed: git rev-parse --verify$"):
        made._run(["git", "rev-parse", "--verify", "secret-value-not-shown"])
