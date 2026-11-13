"""The README quickstart names only commands that exist, and the check catches each kind of drift."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("check_quickstart", ROOT / "scripts" / "check_quickstart.py")
assert SPEC and SPEC.loader
quickstart = importlib.util.module_from_spec(SPEC)
sys.modules["check_quickstart"] = quickstart
SPEC.loader.exec_module(quickstart)

URL = "https://github.com/Conker-AI/conker.git"
INSTALLER = f'readonly REPO_URL="{URL}"\n'
LAUNCHER = "case \"$command\" in\n    status)    cmd_status ;;\n    backup|restore) cmd_backup ;;\nesac\n"
SCRIPTS = {"dev": "vite"}


def readme(
    preview: str = "npm run dev -- --host localhost --port 5173 --strictPort",
    opened: str = "5173",
    install: str = "./install.sh",
    daily: str = "./conker status          # is it working",
) -> str:
    return f"""# Conker

## Quickstart

```sh
git clone {URL}
cd conker/dashboard
npm ci
{preview}
```

Open http://localhost:{opened}.

```sh
git clone {URL}
cd conker
{install}
```

```sh
{daily}
./conker backup
```

## Status
"""


def found(text: str) -> list[str]:
    return quickstart.problems(text, INSTALLER, LAUNCHER, SCRIPTS)


def test_this_readme_names_only_commands_that_exist() -> None:
    assert quickstart.check() == []


def test_a_readme_that_matches_passes() -> None:
    assert found(readme()) == []


def test_a_missing_section_is_named() -> None:
    assert found("# Conker\n\n## Get started\n") == ["README.md has no '## Quickstart' section."]


def test_an_npm_script_that_does_not_exist_fails() -> None:
    problems = found(readme(preview="npm run serve -- --port 5173"))
    assert problems == ["dashboard/package.json has no script for: npm run serve -- --port 5173"]


def test_an_address_on_another_port_fails() -> None:
    assert found(readme(opened="3000")) == [
        "The address to open must use the port the last preview line serves on."
    ]


def test_an_unknown_conker_command_fails() -> None:
    assert found(readme(daily="./conker health")) == ["./conker has no command called health."]


def test_a_changed_install_line_fails() -> None:
    assert found(readme(install="./install.sh --yes")) != []


def test_a_clone_from_another_url_fails() -> None:
    other = readme().replace(URL, "https://example.com/fork.git", 1)
    assert found(other) == [f"The preview must start with: git clone {URL}"]


def test_comments_are_not_commands() -> None:
    assert quickstart.commands("./conker status   # what isn't\n\n./conker backup\n") == [
        "./conker status",
        "./conker backup",
    ]
