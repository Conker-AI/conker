"""The Compose overlays a repository installation runs, by the same rule as ./conker and install.sh.

The release turns an overlay on with one exact line in versions.env. An optional service also needs
the owner's choice, one exact line in .env that install.sh writes (the Claude plan runtime:
`./install.sh --claude-plan`). Both files are read as lines of data; neither is executed.
"""

from __future__ import annotations

from pathlib import Path

# The overlay, the versions.env line that releases it, and the .env line that chooses it (if any).
OVERLAYS = (
    ("docker-compose.terminal.yml", "OWNER_TERMINAL_STATE=active", None),
    ("docker-compose.sandbox.yml", "AGENT_SANDBOX_STATE=active", None),
    ("docker-compose.direct-providers.yml", "DIRECT_PROVIDERS_STATE=active", None),
    (
        "docker-compose.subscriptions.yml",
        "SUBSCRIPTIONS_STATE=active",
        "CONKER_CLAUDE_PLAN=on",
    ),
)


def _lines(path: Path) -> set[str]:
    try:
        return {line.strip() for line in path.read_text(encoding="utf-8").splitlines()}
    except FileNotFoundError:
        return set()


def overlay_files(root: Path, env_file: Path | None = None) -> list[Path]:
    """The overlays to add after root/docker-compose.yml, in order. env_file defaults to root/.env."""
    released = _lines(root / "versions.env")
    chosen = _lines(env_file if env_file is not None else root / ".env")
    return [
        root / name
        for name, release, choice in OVERLAYS
        if release in released and (choice is None or choice in chosen)
    ]
