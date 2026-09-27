#!/usr/bin/env python3
"""Validate one host workspace for the isolated owner-terminal sidecar."""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from collections.abc import Callable
from pathlib import Path

SIDECAR_UID = 65532


class TerminalWorkspaceError(ValueError):
    pass


def _has_symlink_component(path: Path) -> bool:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        if current.is_symlink():
            return True
    return False


def _overlaps(left: Path, right: Path) -> bool:
    return left == right or left.is_relative_to(right) or right.is_relative_to(left)


def validate_workspace(
    workspace: Path,
    *,
    installation: Path,
    state: Path,
    recovery: Path,
    credentials: Path,
    backups: Path,
    home: Path,
    workspace_gid: int,
    sidecar_uid: int = SIDECAR_UID,
    access_check: Callable[[os.stat_result, int, int], bool] | None = None,
) -> dict[str, object]:
    if (
        not workspace.is_absolute()
        or ".." in workspace.parts
        or any(character in "\x00\r\n" for character in str(workspace))
        or type(workspace_gid) is not int
        or workspace_gid < 1
        or type(sidecar_uid) is not int
        or sidecar_uid < 1
    ):
        raise TerminalWorkspaceError("terminal workspace selection is invalid")
    if _has_symlink_component(workspace):
        raise TerminalWorkspaceError(
            "terminal workspace must not resolve through a symlink"
        )
    try:
        resolved = workspace.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise TerminalWorkspaceError(
            "terminal workspace must be an existing directory"
        ) from exc
    if not resolved.is_dir():
        raise TerminalWorkspaceError("terminal workspace must be an existing directory")
    if resolved == Path(resolved.anchor):
        raise TerminalWorkspaceError("filesystem root cannot be a terminal workspace")

    protected = {
        "installation": installation,
        "state": state,
        "recovery": recovery,
        "credentials": credentials,
        "backups": backups,
    }
    for label, path in protected.items():
        candidate = path.resolve(strict=False)
        if _overlaps(resolved, candidate):
            raise TerminalWorkspaceError(
                f"terminal workspace overlaps protected {label} data"
            )
    home_path = home.resolve(strict=False)
    if resolved == home_path or home_path.is_relative_to(resolved):
        raise TerminalWorkspaceError(
            "home directory or one of its parents cannot be a terminal workspace"
        )

    details = resolved.stat()
    permissions = stat.S_IMODE(details.st_mode)
    if access_check is None:
        owner_access = details.st_uid == sidecar_uid and permissions & 0o700 == 0o700
        group_access = details.st_gid == workspace_gid and permissions & 0o070 == 0o070
        allowed = owner_access or group_access
    else:
        allowed = access_check(details, sidecar_uid, workspace_gid)
    if not allowed:
        raise TerminalWorkspaceError(
            "terminal sidecar UID/GID does not have read, write and traverse access"
        )
    return {
        "schemaVersion": 1,
        "path": str(resolved),
        "sidecarUid": sidecar_uid,
        "workspaceGid": workspace_gid,
        "device": details.st_dev,
        "inode": details.st_ino,
        "mode": f"{permissions:04o}",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--installation", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--recovery", required=True, type=Path)
    parser.add_argument("--credentials", required=True, type=Path)
    parser.add_argument("--backups", required=True, type=Path)
    parser.add_argument("--home", required=True, type=Path)
    parser.add_argument("--workspace-gid", required=True, type=int)
    arguments = parser.parse_args(argv)
    try:
        result = validate_workspace(
            arguments.workspace,
            installation=arguments.installation,
            state=arguments.state,
            recovery=arguments.recovery,
            credentials=arguments.credentials,
            backups=arguments.backups,
            home=arguments.home,
            workspace_gid=arguments.workspace_gid,
        )
    except TerminalWorkspaceError as exc:
        print(f"Terminal workspace rejected: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    os.umask(0o077)
    raise SystemExit(main())
