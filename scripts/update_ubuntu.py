"""conker update --to X.Y.Z on the Ubuntu layout: staged, snapshotted, verified, rolled back.

The Ubuntu layout builds its images from the source exports in `sources/` (deploy/ubuntu/README.md).
An update goes to one exact Conker release, never a branch, on the shared coordinator
(scripts/update_core.py), which saves every phase so an update cut off anywhere is rolled back on
the next run:

1. preflight: the release is newer than the running one, no recovery or backup is held, the disk
   has room;
2. stage: that tag of Conker and the tag of every module its versions.env pins, downloaded into a
   staging folder, and the dashboard built from it in the pinned Node image; nothing running
   changes;
3. protect: a verified snapshot (`conker backup`), before anything running changes;
4. apply code: compose.json is copied to recovery/pre-update-STAMP, the staged sources trade
   places with sources/ in one step (scripts/update_swap.py, so a power cut never leaves sources/
   missing) and the old ones move into that folder;
5. apply services: prepare.py with the installed origin and agent workspaces, build, start, and the
   refreshed launcher;
6. verify: `conker status --strict` until every service answers.

A failure after step 4 puts the old sources and compose.json back, builds and starts them and
proves them answering (rolled back). An update cut off part way (a reboot) gets the same rollback
from `conker update --recover`, which the host helper runs when it starts. When that cannot be proven the coordinator leaves a HOLD and
the snapshot is the way back. The result goes to the Inbox (scripts/update_check.py report).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import NoReturn

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts import update_cutoff, update_held
    from scripts.update_check import VERSION, installed_version, report
    from scripts.update_core import (
        UpdateCoordinator,
        UpdateError,
        UpdateStore,
        _acquire_lock,
        _release_lock,
    )
    from scripts.update_ubuntu_transport import UbuntuTransport
except ModuleNotFoundError:
    import update_cutoff
    import update_held
    from update_check import VERSION, installed_version, report
    from update_core import (
        UpdateCoordinator,
        UpdateError,
        UpdateStore,
        _acquire_lock,
        _release_lock,
    )
    from update_ubuntu_transport import UbuntuTransport


def tell_inbox(root: Path, send=None) -> None:
    """The result reaches the Inbox now if Pi answers, else with the next daily check."""
    source = root / "sources" / "companion"
    found = {"running": installed_version(source), "latest": None}
    try:
        report(root, "ubuntu", found, **({"send": send} if send else {}))
    except Exception as error:  # the update already finished; its receipt stays
        print(
            f"The Inbox will hear about this update with the next check ({error}).",
            file=sys.stderr,
        )


def recover(root: Path, transport_for=None, tell=None) -> str:
    """`conker update --recover`: finish an update that was cut off (a reboot, a killed helper).

    One cut off after its sources moved is rolled back and proven answering, as a failed one is;
    one cut off before is closed as abandoned and its staged release removed; one cut off during its
    own snapshot first gets the writers that snapshot stopped started again (scripts/update_cutoff.py).
    Refused while an update still runs (its update.lock), while a backup runs or a recovery is held
    (a rollback restarts services), and once the update is held (the snapshot is the way back).
    State that cannot be read is held, never guessed at. The
    host helper runs this when it starts and before each daily check.
    """
    store = UpdateStore(root.resolve() / "state" / "update")
    if store.hold_path.exists():  # checked again under the lock, where no update can write one
        raise UpdateError(
            f"Update is held: {store.hold_path}. Restore the snapshot from before it."
        )
    lock = _acquire_lock(store)  # refuses while the update that wrote active.json still runs
    try:
        try:
            state = store.load_active()
        except (OSError, ValueError) as error:
            _hold_unreadable(
                store, root, None, f"its saved state could not be read ({error})", tell
            )
        if not state:
            return "No update was cut off. Nothing to do."
        target = state.get("target") if isinstance(state, dict) else None
        if not isinstance(target, str) or not VERSION.fullmatch(target):
            _hold_unreadable(store, root, state, "its saved state names no release", tell)
        transport = (transport_for or UbuntuTransport)(root, target)
        coordinator = UpdateCoordinator(transport, store)
        moved, snapshotting = state.get("phase") in coordinator.MUTATING_PHASES, False
        if moved:
            transport.require_quiet()
        elif snapshotting := state.get("phase") == "protecting":
            update_cutoff.after_cut_snapshot(root.resolve(), transport.restart_writers)
        coordinator.recover_interrupted()
    finally:
        _release_lock(lock)
    if moved:
        return f"The update to {target} was cut off part way: Conker is back on the version it had."
    if snapshotting:
        return f"The update to {target} was cut off during its snapshot. Conker runs as before."
    return f"The update to {target} was cut off before anything changed. Nothing changed."


def _hold_unreadable(store: UpdateStore, root: Path, state, why: str, tell) -> NoReturn:
    """Nobody can tell whether the sources moved, so nothing retries: the owner restores. The
    Inbox hears of it (scripts/update_held.py)."""
    update_held.hold_unreadable(store, root, state, why, tell or tell_inbox)
    raise UpdateError(
        f"An update was cut off and {why}. Held: restore the snapshot from before it."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="conker update --to", description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--to", dest="version")
    action.add_argument("--recover", action="store_true", help="finish an update that was cut off")
    parser.add_argument("--commit", help="the commit the offered release's tag named (--to only)")
    parser.add_argument("--modules", help="pi=X.Y.Z@SHA,...: each offered module tag's commit")
    args = parser.parse_args(argv)
    if (args.commit or args.modules) and not args.version:
        parser.error("--commit and --modules go with --to")
    if bool(args.commit) != bool(args.modules):
        parser.error("--commit and --modules go together")
    os.umask(0o022)  # public sources stay readable to the containers' user (README)
    status = 1
    try:
        if args.recover:
            print(recover(args.root))
            status = 0
        else:
            transport = UbuntuTransport(
                args.root, args.version, commit=args.commit, modules=args.modules
            )
            store = UpdateStore(transport.root / "state" / "update")
            lock = _acquire_lock(store)
            try:
                transport.require_quiet()  # its own rollback of a cut-off update restarts services
                result = UpdateCoordinator(transport, store).run()
            finally:
                _release_lock(lock)
            print(f"Conker update {result['status']}. Receipt: {result['receipt']}")
            status = 0
    except (OSError, UpdateError, json.JSONDecodeError) as error:
        print(f"Conker update stopped: {error}", file=sys.stderr)
    except Exception as error:  # never skip telling the Inbox what was already written
        print(f"Conker update stopped unexpectedly: {error!r}", file=sys.stderr)
    tell_inbox(args.root.resolve())
    return status


if __name__ == "__main__":
    raise SystemExit(main())
