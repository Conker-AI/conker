"""Check the host folder that holds every agent's sandbox workspace (ADR-0013).

The sandbox runner (UID 65533) creates one subfolder per agent in it. The setgid bit gives each
new subfolder the owner's group, which is how the owner reads and edits agents' files on the host.
"""

from __future__ import annotations

import stat
from pathlib import Path

RUNNER_UID = 65533
MODE = 0o2770


class AgentWorkspacesError(ValueError):
    pass


def validate_workspaces(
    folder: Path,
    *,
    installation: Path,
    home: Path,
    owner_gid: int,
    runner_uid: int = RUNNER_UID,
) -> Path:
    """Return the folder's canonical path, or refuse it with the command that fixes it."""
    if (
        not folder.is_absolute()
        or ".." in folder.parts
        or any(character in "\x00\r\n" for character in str(folder))
    ):
        raise AgentWorkspacesError("the folder must be an absolute path")
    current = Path(folder.anchor)
    for part in folder.parts[1:]:
        current /= part
        if current.is_symlink():
            raise AgentWorkspacesError("the folder must not resolve through a symlink")
    if not folder.is_dir():
        raise AgentWorkspacesError("the folder must be an existing directory")
    resolved = folder.resolve(strict=True)
    if resolved == Path(resolved.anchor):
        raise AgentWorkspacesError("the filesystem root cannot hold agent workspaces")
    # Inside the deployment, agents' files would land in a build context, a store or a backup.
    deployment = installation.resolve(strict=False)
    if resolved.is_relative_to(deployment) or deployment.is_relative_to(resolved):
        raise AgentWorkspacesError("the folder overlaps the deployment directory")
    if home.resolve(strict=False).is_relative_to(resolved):
        raise AgentWorkspacesError("the home directory or one of its parents cannot hold agent workspaces")
    details = resolved.stat()
    if (details.st_uid, details.st_gid, stat.S_IMODE(details.st_mode)) != (runner_uid, owner_gid, MODE):
        raise AgentWorkspacesError(
            f"the folder must be owned by {runner_uid}:{owner_gid} with mode 2770; run "
            f"sudo chown {runner_uid}:{owner_gid} '{resolved}' && sudo chmod 2770 '{resolved}'"
        )
    return resolved
