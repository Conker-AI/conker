"""The release page body: one CHANGELOG section, published only when the tag, versions.env and the
CHANGELOG name the same version."""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.release_notes import ReleaseError, main, notes

CHANGELOG = """# Changelog

Intro text.

## Unreleased

- Not out yet.

## 0.2.0

- **Self-update.** Conker updates itself.

## 0.1.0

- First release.
"""


def tree(tmp_path: Path, version: str | None, changelog: str = CHANGELOG) -> Path:
    lines = ["PI_VERSION=0.25.0"] + ([f"CONKER_VERSION={version}"] if version else [])
    (tmp_path / "versions.env").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (tmp_path / "CHANGELOG.md").write_text(changelog, encoding="utf-8")
    return tmp_path


def test_the_body_is_that_versions_section_only(tmp_path):
    assert notes("v0.2.0", tree(tmp_path, "0.2.0")) == "- **Self-update.** Conker updates itself."
    assert notes("v0.1.0", tree(tmp_path, "0.1.0")) == "- First release."


@pytest.mark.parametrize(
    ("tag", "pinned", "message"),
    [
        ("v0.2.0", "0.1.0", "CONKER_VERSION=0.1.0, the tag says 0.2.0"),
        ("v0.2.0", None, "CONKER_VERSION=(unset)"),
        ("v0.3.0", "0.3.0", "no '## 0.3.0' section"),
        ("0.2.0", "0.2.0", "vX.Y.Z"),
        ("v0.2.0-rc.1", "0.2.0", "vX.Y.Z"),
    ],
)
def test_disagreement_publishes_nothing(tmp_path, tag, pinned, message):
    with pytest.raises(ReleaseError, match=message.replace("(", r"\(").replace(")", r"\)")):
        notes(tag, tree(tmp_path, pinned))


def test_an_empty_section_is_refused(tmp_path):
    with pytest.raises(ReleaseError, match="empty"):
        notes("v0.2.0", tree(tmp_path, "0.2.0", "## 0.2.0\n\n## 0.1.0\n- x\n"))


def test_the_command_exits_1_and_says_why(tmp_path, capsys):
    assert main(["v0.2.0", "--root", str(tree(tmp_path, "0.1.0"))]) == 1
    assert "Not publishing v0.2.0" in capsys.readouterr().err


def test_this_repositorys_changelog_has_the_unreleased_heading_the_release_pr_renames():
    text = (Path(__file__).resolve().parents[1] / "CHANGELOG.md").read_text(encoding="utf-8")
    assert "\n## Unreleased\n" in text
