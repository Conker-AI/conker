from __future__ import annotations

import os
from pathlib import Path

import pytest

from scripts.terminal_workspace import TerminalWorkspaceError, validate_workspace


def layout(tmp_path: Path) -> dict[str, Path]:
    paths = {
        "installation": tmp_path / "install",
        "state": tmp_path / "install" / "state",
        "recovery": tmp_path / "install" / "recovery",
        "credentials": tmp_path / "install" / "state" / "credentials",
        "backups": tmp_path / "off-machine",
        "home": tmp_path / "home",
        "workspace": tmp_path / "home" / "work" / "project",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def validate(paths: dict[str, Path], workspace: Path | None = None):
    selected = workspace or paths["workspace"]
    selected.chmod(0o770)
    return validate_workspace(
        selected,
        installation=paths["installation"],
        state=paths["state"],
        recovery=paths["recovery"],
        credentials=paths["credentials"],
        backups=paths["backups"],
        home=paths["home"],
        workspace_gid=1,
        access_check=lambda _details, _uid, _gid: True,
    )


def test_workspace_preflight_records_stable_identity_without_secret_data(tmp_path):
    paths = layout(tmp_path)

    result = validate(paths)

    assert result == {
        "schemaVersion": 1,
        "path": str(paths["workspace"].resolve()),
        "sidecarUid": 65532,
        "workspaceGid": 1,
        "device": paths["workspace"].stat().st_dev,
        "inode": paths["workspace"].stat().st_ino,
        "mode": f"{paths['workspace'].stat().st_mode & 0o7777:04o}",
    }


@pytest.mark.parametrize(
    "name",
    ["installation", "state", "recovery", "credentials", "backups"],
)
def test_workspace_preflight_rejects_protected_paths_and_their_parents(tmp_path, name):
    paths = layout(tmp_path)

    with pytest.raises(TerminalWorkspaceError, match="overlaps protected"):
        validate(paths, paths[name])
    with pytest.raises(TerminalWorkspaceError, match="overlaps protected"):
        validate(paths, tmp_path)


def test_workspace_preflight_rejects_home_but_allows_a_project_below_it(tmp_path):
    paths = layout(tmp_path)

    assert validate(paths)["path"] == str(paths["workspace"].resolve())
    with pytest.raises(TerminalWorkspaceError, match="home directory"):
        validate(paths, paths["home"])


def test_workspace_preflight_rejects_symlink_components(tmp_path):
    paths = layout(tmp_path)
    link = tmp_path / "linked-work"
    try:
        link.symlink_to(paths["workspace"], target_is_directory=True)
    except OSError:
        pytest.skip("host does not permit symlinks")

    with pytest.raises(TerminalWorkspaceError, match="symlink"):
        validate(paths, link)


def test_workspace_preflight_rejects_control_characters(tmp_path):
    paths = layout(tmp_path)
    invalid = paths["workspace"].with_name("project\nforged")

    with pytest.raises(TerminalWorkspaceError, match="selection is invalid"):
        validate_workspace(
            invalid,
            installation=paths["installation"],
            state=paths["state"],
            recovery=paths["recovery"],
            credentials=paths["credentials"],
            backups=paths["backups"],
            home=paths["home"],
            workspace_gid=1,
        )


def test_workspace_preflight_rejects_unusable_group_permissions(tmp_path):
    if os.name == "nt":
        pytest.skip("Windows does not enforce POSIX workspace ownership")
    paths = layout(tmp_path)
    paths["workspace"].chmod(0o700)

    with pytest.raises(TerminalWorkspaceError, match="read, write and traverse"):
        validate_workspace(
            paths["workspace"],
            installation=paths["installation"],
            state=paths["state"],
            recovery=paths["recovery"],
            credentials=paths["credentials"],
            backups=paths["backups"],
            home=paths["home"],
            workspace_gid=paths["workspace"].stat().st_gid + 1,
        )
