from scripts.beta_release import changelog_with, with_version


def test_the_beta_section_goes_under_unreleased_with_the_titles():
    text = "# Changelog\n\n## Unreleased\n\n## 0.5.0\n\n- old\n"
    out = changelog_with(text, "0.5.1", ["- a (#1)", "- b (#2)"])
    assert "## Unreleased\n\n## 0.5.1\n\nBeta build" in out
    assert out.index("- a (#1)") < out.index("- b (#2)") < out.index("## 0.5.0")


def test_with_version_changes_exactly_one_line():
    assert (
        with_version("A=1\nCONKER_VERSION=0.5.0\n", "CONKER_VERSION", "0.5.1")
        == "A=1\nCONKER_VERSION=0.5.1\n"
    )
