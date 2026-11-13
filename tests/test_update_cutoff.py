"""What an update that stopped before its swap leaves behind is cleared: its staged release, and,
after a cut during its own snapshot, the writers that snapshot stopped and the backup lock it left,
never beside a backup that may still run."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from scripts import update_cutoff, update_ubuntu
from scripts.update_core import UpdateError, UpdateStore
from scripts.update_ubuntu import UbuntuTransport
from tests.test_update_recover import boot  # noqa: F401  (fixture)
from tests.test_update_ubuntu import Host, deployment, update  # noqa: F401  (fixture)

STAMP = "staging-20261113-223123"


def cut_off(root: Path, phase: str, staging: Path) -> UpdateStore:
    store = UpdateStore(root / "state" / "update")
    store.save_active(
        {
            "schema": 1,
            "transaction_id": "b" * 32,
            "started_at": 1,
            "phase": phase,
            "target": "0.2.0",
            "prior": {"revision": "0.1.0"},
            "candidate": {"revision": "0.2.0", "staging": str(staging)},
        }
    )
    return store


def staged(root: Path, name: str = STAMP) -> Path:
    page = root / name / "companion" / "dashboard" / "dist" / "index.html"
    page.parent.mkdir(parents=True)
    page.write_text("<!doctype html>", encoding="utf-8")
    return root / name


def recover(root: Path, host: Host) -> str:
    def transport(at, target):
        return UbuntuTransport(at, target, run=host.run, fetch=host.fetch, home=root.parent)

    return update_ubuntu.recover(root, transport_for=transport)


def statuses(store: UpdateStore) -> list[str]:
    folder = store.directory / "receipts"
    return [json.loads(path.read_text(encoding="utf-8"))["status"] for path in folder.glob("*")]


def started(host: Host) -> bool:
    return any(call[-3:] == ["up", "-d", "--remove-orphans"] for call in host.calls)


# --- the staged release (cu-F4) ----------------------------------------------------------------


def test_a_failed_snapshot_leaves_no_staged_release(deployment):
    host = Host(deployment, {"0.2.0": True}, snapshot=False)
    with pytest.raises(UpdateError, match="stopped before apply"):
        update(deployment, host)[1].run()
    assert not list(deployment.glob("staging-*"))


@pytest.mark.parametrize("phase", ["candidate_validated", "candidate_ready"])
def test_recovering_a_cut_before_the_swap_removes_only_its_own_staged_release(
    deployment, boot, phase
):
    mine, other = staged(deployment), staged(deployment, "staging-20261101-000000")
    store = cut_off(deployment, phase, mine)

    assert recover(deployment, Host(deployment, {})).endswith("Nothing changed.")

    assert not mine.exists() and other.is_dir()  # another update's folder is not this one's
    assert statuses(store) == ["abandoned_before_apply"] and store.load_active() is None


@pytest.mark.parametrize("where", ["outside", "misnamed"])
def test_a_recorded_staging_folder_outside_the_deployment_is_never_removed(
    deployment, boot, tmp_path, where
):
    folder = staged(tmp_path / "elsewhere") if where == "outside" else staged(deployment, "data")
    cut_off(deployment, "candidate_ready", folder)

    recover(deployment, Host(deployment, {}))

    assert (folder / "companion" / "dashboard" / "dist" / "index.html").is_file()


def test_a_staging_link_is_never_followed(deployment, boot, tmp_path):
    target = staged(tmp_path / "elsewhere")
    link = deployment / STAMP
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError:
        pytest.skip("this system cannot make a folder link")
    cut_off(deployment, "candidate_ready", link)

    recover(deployment, Host(deployment, {}))

    assert link.is_symlink() and (target / "companion").is_dir()


# --- a cut during the update's own snapshot (cu-F1) --------------------------------------------


def backup_lock(root: Path, *, stale: bool) -> Path:
    """The lock `conker backup` holds (a pid); a stale one was written before this boot."""
    lock = root / update_cutoff.BACKUP_LOCK
    lock.write_text(str(os.getpid()), encoding="ascii")
    if stale:
        os.utime(lock, (500, 500))  # before btime 1000 (the boot fixture)
    return lock


def test_a_cut_during_the_snapshot_starts_conker_again_and_drops_the_lock_it_left(deployment, boot):
    lock, folder = backup_lock(deployment, stale=True), staged(deployment)
    store, host = cut_off(deployment, "protecting", folder), Host(deployment, {})

    message = recover(deployment, host)

    assert message == "The update to 0.2.0 was cut off during its snapshot. Conker runs as before."
    assert started(host) and not lock.exists() and not folder.exists()
    assert statuses(store) == ["abandoned_before_apply"] and store.load_active() is None
    assert host.running() == "0.1.0"  # nothing moved


def test_a_cut_during_the_snapshot_with_no_lock_left_still_starts_the_writers(deployment, boot):
    store, host = cut_off(deployment, "protecting", staged(deployment)), Host(deployment, {})

    recover(deployment, host)

    assert started(host) and statuses(store) == ["abandoned_before_apply"]


@pytest.mark.parametrize("hold", ["backup", "recovery"])
def test_a_backup_that_may_still_run_or_a_held_recovery_is_left_alone(deployment, boot, hold):
    if hold == "backup":
        lock = backup_lock(deployment, stale=False)  # this process holds it: alive
    else:
        lock = deployment / update_cutoff.RECOVERY_HOLD
        lock.write_text("{}", encoding="utf-8")
    store, host = cut_off(deployment, "protecting", staged(deployment)), Host(deployment, {})

    with pytest.raises(UpdateError, match="nothing was changed"):
        recover(deployment, host)

    assert host.calls == [] and lock.exists()
    assert (store.load_active() or {}).get("phase") == "protecting" and statuses(store) == []
    assert not (store.directory / "update.lock").exists()


def test_the_lock_is_kept_when_starting_conker_again_fails(deployment, boot):
    lock = backup_lock(deployment, stale=True)
    store, host = cut_off(deployment, "protecting", staged(deployment)), Host(deployment, {})
    plain = host.run

    def no_docker(argv, **kwargs):
        return 1 if argv[:2] == ["docker", "compose"] else plain(argv, **kwargs)

    host.run = no_docker
    with pytest.raises(UpdateError, match="starting Conker again failed"):
        recover(deployment, host)

    assert lock.exists() and (store.load_active() or {}).get("phase") == "protecting"
