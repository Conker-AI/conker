"""An update held because its saved state could not be read still reaches the Inbox.

`conker update --recover` holds an update whose state file is unreadable or names no release:
nobody can tell whether its sources moved, so nothing retries (scripts/update_ubuntu.py). Pi's
Inbox lists finished updates from their receipts, and a receipt needs the release it went to. The
state no longer says, so the receipt names the best this host knows: the newest release the daily
check offered above the installed one (the Inbox's Update installs only those), else the installed
release. Its reason says the release is not certain. An unreleased build with no offer has no
release to name: the hold stays and only the helper's log has it.
"""

from __future__ import annotations

import time
import uuid
from pathlib import Path

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts.update_check import VERSION, installed_version, offers, version_key
    from scripts.update_core import UpdateStore
except ModuleNotFoundError:
    from update_check import VERSION, installed_version, offers, version_key
    from update_core import UpdateStore


def likely_release(root: Path, state: object) -> str | None:
    """The release a cut-off update most likely went to, or None when nothing names one."""
    target = state.get("target") if isinstance(state, dict) else None
    if isinstance(target, str) and VERSION.fullmatch(target):
        return target
    installed = installed_version(root / "sources" / "companion")
    newer = [
        version
        for version in offers(root / "state" / "update")
        if installed is None or version_key(version) > version_key(installed)
    ]
    return max(newer, key=version_key) if newer else installed


def hold_unreadable(store: UpdateStore, root: Path, state: object, why: str, tell) -> str:
    """Write the hold and a receipt Pi can show, then tell the Inbox now if Pi answers (the next
    daily check reports it otherwise). Returns the hold's reason."""
    reason = f"an update was cut off and {why}"
    now = int(time.time())
    record = {"transaction_id": uuid.uuid4().hex, "started_at": now}
    store.hold(record, reason)
    release = likely_release(root, state)
    if release is None:
        return reason
    store.receipt(
        {**record, "target": release},
        "rollback_unproven",
        f"{reason}; the release it went to is not certain ({release} is the likeliest)",
    )
    tell(root)
    return reason
