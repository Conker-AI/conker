"""Every command the installed launcher's help lists has a docs page.

The verbs come from `conker help` itself (the launcher's usage text): each bold command group, and
each verb named right after it (`backup schedule`, `auth setup|reset-password|...`). A group is
documented when a page under docs/reference/ or a numbered guide names `conker GROUP`; a verb when
such a page names it on a `conker GROUP` line or as `` `VERB` ``. A new command without a page fails
here; write its page (or add it to the group's page) rather than an exception.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOLD = re.compile(r"\$\{BOLD\}([a-z][a-z -]*?)\$\{OFF\}([^\n]*)")
VERBS = re.compile(r"\s+([a-z][a-z-]*(?:\|[a-z][a-z-]*)*)(?=\s|$|\[)")


def usage() -> str:
    launcher = (ROOT / "conker").read_text(encoding="utf-8")
    start = launcher.index("cat <<USAGE")
    return launcher[start : launcher.index("\nUSAGE", start)]


def commands(text: str) -> set[tuple[str, str | None]]:
    """(group, None) for each group the help lists, and (group, verb) for each verb after it."""
    found: set[tuple[str, str | None]] = set()
    for match in BOLD.finditer(text):
        group = match.group(1).strip()
        if group == "conker":  # the title line
            continue
        found.add((group, None))
        verbs = VERBS.match(match.group(2))
        if verbs:
            found.update((group, verb) for verb in verbs.group(1).split("|"))
    return found


def pages() -> dict[Path, str]:
    files = [*(ROOT / "docs" / "reference").glob("*.md"), *(ROOT / "docs").glob("[1-5]-*.md")]
    return {path: path.read_text(encoding="utf-8") for path in files}


def documented(group: str, verb: str | None, docs: dict[Path, str]) -> bool:
    named = re.compile(re.escape(f"conker {group}") + r"(?![a-z-])")
    for text in docs.values():
        if not named.search(text):
            continue
        if verb is None or f"`{verb}`" in text:
            return True
        word = re.compile(r"(?<![a-z-])" + re.escape(verb) + r"(?![a-z-])")
        for line in text.splitlines():
            at = named.search(line)
            if at and word.search(line[at.end() :]):
                return True
    return False


def test_every_command_in_the_help_has_a_page():
    docs = pages()
    missing = sorted(
        f"conker {group}" + (f" {verb}" if verb else "")
        for group, verb in commands(usage())
        if not documented(group, verb, docs)
    )
    assert missing == [], f"no docs page names: {missing}"


def test_the_help_is_read_as_commands():
    found = commands(usage())
    for expected in [("backup schedule", None), ("auth", "reset-password"), ("memory", "search")]:
        assert expected in found
    assert len({group for group, _ in found}) >= 30


def test_a_command_without_a_page_is_caught():
    docs = {Path("x.md"): "Run `conker memory search WORDS`."}
    assert documented("memory", "search", docs)
    assert not documented("memory", "forget", docs)
    assert not documented("memory", None, {Path("y.md"): "conker memorygate"})  # a longer word
