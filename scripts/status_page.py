"""Write the generated parts of docs/status.md from capabilities.json and versions.env, or check
that they still match.

Four blocks between `<!-- generated:NAME -->` and `<!-- /generated:NAME -->` are written here:
`families` (how many capability families are active and deferred), `release` (the version or
state versions.env pins for each service), `deferred` (each deferred family, its gap and what
it still needs) and `frozen` (each family kept as built, and why). Everything else on the page is written by hand. Run from the repository root
after changing either file: python scripts/status_page.py [--check]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from release_manifest import parse_env  # noqa: E402

PAGE = ROOT / "docs" / "status.md"
CAPABILITIES = ROOT / "capabilities.json"
MANIFEST = ROOT / "versions.env"
# Each row of the release table: its name, the versions.env key it shows, what the service does.
RELEASE = (
    (
        "Pi and the Gateway",
        "PI_VERSION",
        (
            "Conversations, model roles for every AI job, direct providers (OpenAI, Anthropic, "
            "Gemini, xAI, Mistral, DeepSeek, Groq, OpenRouter), access, Inbox, tool drafting, "
            "imports and exports"
        ),
    ),
    (
        "ToolGate",
        "TOOLGATE_VERSION",
        "Tools, approvals, spending, the agent sandbox, draft checks, owner tool settings",
    ),
    ("MemoryGate", "MEMORYGATE_VERSION", "Memory with sources; its AI through Pi"),
    ("SystemGate", "SYSTEMGATE_VERSION", "Read-only view of the machine"),
    ("Embeddings", "EMBEDDINGS_VERSION", "Text to vectors"),
    ("Agent sandbox", "AGENT_SANDBOX_STATE", "Terminal and Install packages for agents"),
    ("Owner terminal", "OWNER_TERMINAL_STATE", "See Deferred below"),
)
BLOCK = re.compile(
    r"(<!-- generated:(?P<name>[a-z]+) -->\n)(?P<body>.*?)(<!-- /generated:(?P=name) -->)",
    re.DOTALL,
)


class StatusPageError(Exception):
    pass


def families(capabilities: list[dict]) -> str:
    states = [item["state"] for item in capabilities]
    active, deferred = states.count("active"), states.count("deferred")
    return (
        f"The source has **{len(states)} tracked\ncapability families: {active} active and "
        f"{deferred} deferred**. Active means a real\nproduct surface exists; it does not by "
        "itself mean the screen, the CLI and the gateway all reach\nit, or that a server runs it.\n"
    )


def release(pins: dict[str, str]) -> str:
    rows = ["| Service | Version | |", "|---|---|---|"]
    for name, key, what in RELEASE:
        if key not in pins:
            raise StatusPageError(f"versions.env has no {key} for the row {name!r}")
        rows.append(f"| {name} | {pins[key]} | {what} |")
    return "\n".join(rows) + "\n"


def deferred(capabilities: list[dict]) -> str:
    rows = ["| Capability | Why it is deferred | What it still needs |", "| --- | --- | --- |"]
    for item in capabilities:
        if item["state"] != "deferred":
            continue
        gap = item.get("gap") or "No gap recorded in capabilities.json."
        needs = "; ".join(item["deploymentRequirements"]) or "nothing recorded"
        rows.append(f"| {item['name']} | {gap} | {needs} |")
    if len(rows) == 2:
        return "Nothing is deferred.\n"
    return "\n".join(rows) + "\n"


def frozen(capabilities: list[dict]) -> str:
    rows = ["| Capability | Why it is frozen |", "| --- | --- |"]
    rows += [f"| {item['name']} | {item['frozen']} |" for item in capabilities if "frozen" in item]
    if len(rows) == 2:
        return "Nothing is frozen.\n"
    return "\n".join(rows) + "\n"


def render(text: str, capabilities: list[dict], pins: dict[str, str]) -> str:
    bodies = {
        "families": families(capabilities),
        "release": release(pins),
        "deferred": deferred(capabilities),
        "frozen": frozen(capabilities),
    }
    found = [match["name"] for match in BLOCK.finditer(text)]
    if sorted(found) != sorted(bodies):
        raise StatusPageError(
            f"docs/status.md must hold each generated block once: {sorted(bodies)}; found {found}"
        )
    return BLOCK.sub(lambda match: match[1] + bodies[match["name"]] + match[4], text)


def main(argv: list[str]) -> int:
    check = argv == ["--check"]
    if argv and not check:
        print("Use: python scripts/status_page.py [--check]", file=sys.stderr)
        return 2
    text = PAGE.read_text(encoding="utf-8")
    capabilities = json.loads(CAPABILITIES.read_text(encoding="utf-8"))["capabilities"]
    try:
        page = render(text, capabilities, parse_env(MANIFEST))
    except StatusPageError as error:
        print(error, file=sys.stderr)
        return 1
    if page == text:
        print("docs/status.md is up to date.")
        return 0
    if check:
        print(
            "docs/status.md is out of date with capabilities.json or versions.env; "
            "run python scripts/status_page.py",
            file=sys.stderr,
        )
        return 1
    PAGE.write_text(page, encoding="utf-8", newline="\n")
    print("Wrote docs/status.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
