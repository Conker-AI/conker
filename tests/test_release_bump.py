import pytest

from scripts.release_bump import BumpError, bump_changelog, set_env

PINS = {
    f"{k}_VERSION": "1.0.0" for k in ("PI", "TOOLGATE", "MEMORYGATE", "SYSTEMGATE", "EMBEDDINGS")
}


def test_unreleased_entries_move_under_the_version_with_a_pin_table():
    text = "# Changelog\n\n## Unreleased\n\n- a thing (#1)\n\n## 0.1.0\n\n- old\n"
    out = bump_changelog(text, "0.2.0", PINS)
    assert "## Unreleased\n\n## 0.2.0\n\n- a thing (#1)" in out
    assert "| Pi | v1.0.0 |" in out
    assert out.index("## 0.2.0") < out.index("## 0.1.0")


def test_empty_unreleased_or_repeated_version_is_refused():
    with pytest.raises(BumpError):
        bump_changelog("## Unreleased\n\n## 0.1.0\n", "0.2.0", PINS)
    with pytest.raises(BumpError):
        bump_changelog("## Unreleased\n\n- x\n\n## 0.2.0\n", "0.2.0", PINS)


def test_set_env_replaces_one_line():
    assert set_env("A=1\nB=2\n", "B", "3") == "A=1\nB=3\n"
    with pytest.raises(BumpError):
        set_env("A=1\n", "B", "3")
