"""Write docs/reference/settings.md from settings-registry.json, or check that it still matches.

Run from the repository root: python scripts/settings_docs.py [--check]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "settings-registry.json"
OUTPUT = ROOT / "docs" / "reference" / "settings.md"
SCOPES = {"global": "Everywhere", "agent": "Per agent", "chat": "Per chat"}
EFFECTS = {
    "live": "applies right away",
    "next-turn": "applies from the next message",
    "restart": "applies after a restart",
    "stored": "saved, not enforced yet",
}


def shown(value) -> str:
    if value is None:
        return "none"
    if isinstance(value, bool):
        return "on" if value else "off"
    if isinstance(value, list):
        return ", ".join(map(str, value)) or "none"
    return f"`{value}`" if value != "" else "empty"


def render() -> str:
    settings = json.loads(REGISTRY.read_text(encoding="utf-8"))["settings"]
    lines = [
        "# Settings",
        "",
        "Generated from `settings-registry.json` by `scripts/settings_docs.py`; do not edit by hand.",
        "Read and change any of them with `conker config get|set|reset ID` (add `--chat CHAT_ID` for",
        "chat settings); `conker config list --search TEXT` finds them. Each setting lives in one",
        "service document, shown as its home.",
    ]
    for scope, heading in SCOPES.items():
        rows = [setting for setting in settings if setting["scope"] == scope]
        if not rows:
            continue
        lines += [
            "",
            f"## {heading}",
            "",
            "| Setting | What it does | Default | Home |",
            "|---|---|---|---|",
        ]
        for setting in rows:
            values = setting.get("options")
            choice = (
                f" Values: {', '.join(map(str, values))}."
                if values and setting["type"] == "select"
                else ""
            )
            bounds = (
                f" {setting['min']} to {setting['max']}."
                if "min" in setting and "max" in setting
                else ""
            )
            home = setting["home"]
            lines.append(
                f"| **{setting['title']}**<br>`{setting['id']}` | {setting['description']}{choice}{bounds} "
                f"({EFFECTS[setting['effect']]}) | {shown(setting['default'])} "
                f"| {home['service']} `{home['path']}` `{home['field']}` |"
            )
    return "\n".join(lines) + "\n"


def main() -> int:
    text = render()
    if "--check" in sys.argv[1:]:
        if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == text:
            return 0
        print(
            f"{OUTPUT.relative_to(ROOT)} differs from the registry; run python scripts/settings_docs.py"
        )
        return 1
    OUTPUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
