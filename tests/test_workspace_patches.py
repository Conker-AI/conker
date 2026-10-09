"""Ordered extensions are replay-safe and never partially overwrite local work."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import workspace_patches as patches


def git(source, *arguments):
    return subprocess.run(
        [
            "git",
            "-c",
            "core.autocrlf=false",
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            *map(str, arguments),
        ],
        cwd=source,
        check=True,
        capture_output=True,
    ).stdout


@pytest.fixture
def bundle(tmp_path, monkeypatch):
    root, source = tmp_path / "launcher", tmp_path / "source"
    files = root / "scripts/patches"
    files.mkdir(parents=True)
    source.mkdir()
    git(source, "init", "-q")
    alpha = "first\n" + "\n".join(f"line-{i}" for i in range(30)) + "\nlast\n"
    (source / "alpha.txt").write_text(alpha)
    (source / "beta.txt").write_text("base\n")
    (source / "unrelated.txt").write_text("original\n")
    git(source, "add", ".")
    git(source, "commit", "-qm", "base")
    base = git(source, "rev-parse", "HEAD").decode().strip()
    (source / "alpha.txt").write_text(alpha.replace("first", "second"))
    (source / "addition.txt").write_text("first extension\n")
    git(source, "add", ".")
    first = files / "first.patch"
    first.write_bytes(git(source, "diff", "--cached", "--binary"))
    git(source, "commit", "-qm", "extension one")
    (source / "alpha.txt").write_text(alpha.replace("first", "third"))
    (source / "beta.txt").write_text("enhanced\n")
    git(source, "add", ".")
    second = files / "second.patch"
    second.write_bytes(git(source, "diff", "--cached", "--binary"))
    git(source, "commit", "-qm", "extension two")
    git(source, "checkout", "-q", "--detach", base)
    (root / "scripts/workspace-sources.json").write_text(json.dumps({"fixture": base}))
    monkeypatch.setattr(patches, "ROOT", root)
    monkeypatch.setattr(patches, "BUNDLES", {"fixture": (first.name, second.name)})
    return source, first, second, alpha


def test_fresh_bundle_and_repeat_preserve_unrelated_and_staged_changes(bundle):
    source, _, _, _ = bundle
    (source / "unrelated.txt").write_text("owner staged work\n")
    git(source, "add", "unrelated.txt")
    index_before = git(source, "diff", "--cached", "--binary")
    (source / "private-untracked.txt").write_text("keep local\n")
    patches.apply_bundle(source, "fixture")
    assert (source / "alpha.txt").read_text().startswith("third\n")
    assert (source / "beta.txt").read_text() == "enhanced\n"
    assert (source / "addition.txt").read_text() == "first extension\n"
    after = git(source, "diff", "--binary")
    patches.apply_bundle(source, "fixture")
    assert git(source, "diff", "--binary") == after
    assert git(source, "diff", "--cached", "--binary") == index_before
    assert (source / "private-untracked.txt").read_text() == "keep local\n"


def test_legacy_prefix_with_nonconflicting_local_change_can_upgrade(bundle):
    source, first, _, _ = bundle
    git(source, "apply", first)
    path = source / "alpha.txt"
    path.write_text(path.read_text().replace("last", "owner tail"))
    patches.apply_bundle(source, "fixture")
    assert path.read_text().startswith("third\n") and path.read_text().endswith(
        "owner tail\n"
    )
    assert (source / "beta.txt").read_text() == "enhanced\n"


def test_late_conflict_does_not_apply_earlier_patch(bundle):
    source, _, _, alpha = bundle
    (source / "beta.txt").write_text("owner divergence\n")
    with pytest.raises(SystemExit, match="nothing was overwritten"):
        patches.apply_bundle(source, "fixture")
    assert (source / "alpha.txt").read_text() == alpha
    assert (source / "beta.txt").read_text() == "owner divergence\n"
    assert not (source / "addition.txt").exists()


def test_incomplete_previous_bundle_is_not_mistaken_for_complete(bundle):
    source, first, second, _ = bundle
    git(source, "apply", first)
    git(source, "apply", second)
    (source / "addition.txt").unlink()
    before = git(source, "diff", "--binary")
    with pytest.raises(SystemExit, match="nothing was overwritten"):
        patches.apply_bundle(source, "fixture")
    assert git(source, "diff", "--binary") == before
    assert not (source / "addition.txt").exists()


def test_missing_patch_and_wrong_revision_leave_source_untouched(bundle):
    source, first, _, alpha = bundle
    first.unlink()
    with pytest.raises(SystemExit, match="source changes were retained"):
        patches.apply_bundle(source, "fixture")
    assert (source / "alpha.txt").read_text() == alpha
    (source / "unrelated.txt").write_text("new revision\n")
    git(source, "add", ".")
    git(source, "commit", "-qm", "owner change")
    with pytest.raises(SystemExit, match="not at the pinned base"):
        patches.apply_bundle(source, "fixture")
