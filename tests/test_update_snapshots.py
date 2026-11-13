"""Update snapshots are pruned with the nightly keep rule: the newest KEEP and the one just made stay,
so does the newest that verifies, only snapshots an update made are removed, and a prune that
cannot run removes nothing and never fails the update."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import update_snapshots
from scripts.update_core import UpdateError
from scripts.update_snapshots import after_update_snapshot
from tests.test_update_ubuntu import Host, deployment, update  # noqa: F401  (fixture)

OWNERS = "snapshot-20261031T090000Z-feedbeef"  # made by hand: no update receipt names it
UPDATES_OWN = "snapshot-20261112T090000Z-0a1b2c3d"  # what the fake host's `conker backup` makes


def name(day: int) -> str:
    return f"snapshot-202611{day:02d}T090000Z-0a1b2c{day:02d}"


def make(folder: Path, *days: int) -> None:
    for day in days:
        (folder / name(day)).mkdir(parents=True)


def record(receipts: Path, *days: int) -> None:
    receipts.mkdir(parents=True, exist_ok=True)
    for day in days:
        receipt = {"status": "applied", "protection": {"snapshot": name(day)}}
        (receipts / f"{day:032x}.json").write_text(json.dumps(receipt), encoding="utf-8")


def present(folder: Path) -> list[str]:
    return sorted(path.name for path in folder.iterdir())


def refuse(path: Path) -> None:
    raise update_snapshots.PruneError(f"{path.name} does not verify")


@pytest.fixture
def folders(tmp_path):
    return tmp_path / "snapshots", tmp_path / "receipts"


def test_keeps_the_newest_three_and_removes_only_older_update_snapshots(folders):
    folder, receipts = folders
    make(folder, 1, 2, 3, 4, 5, 6)
    record(receipts, 1, 2, 3, 4, 5)  # day 6 is the update's own
    (folder / OWNERS).mkdir()
    (folder / "notes").mkdir()
    removed = after_update_snapshot(folder, name(6), receipts, environ={}, verify=refuse)
    assert removed == [name(3), name(2), name(1)]
    assert present(folder) == ["notes", OWNERS, name(4), name(5), name(6)]


def test_the_keep_count_follows_the_setting(folders):
    folder, receipts = folders
    make(folder, 1, 2, 3, 4)
    record(receipts, 1, 2, 3)
    environ = {"CONKER_UPDATE_SNAPSHOTS_KEEP": "2"}
    removed = after_update_snapshot(folder, name(4), receipts, environ=environ, verify=refuse)
    assert removed == [name(2), name(1)]
    assert present(folder) == [name(3), name(4)]


def test_never_removes_the_newest_snapshot_that_verifies(folders):
    # The clock went back: the update's own snapshot (day 1) sorts below three newer ones that do
    # not verify, so day 3, the newest that does, is the proven way back and stays.
    folder, receipts = folders
    make(folder, 1, 2, 3, 7, 8, 9)
    record(receipts, 2, 3, 7, 8, 9)
    calls = []

    def verify(path: Path) -> None:
        calls.append(path.name)
        if path.name not in {name(2), name(3)}:
            refuse(path)

    removed = after_update_snapshot(folder, name(1), receipts, environ={}, verify=verify)
    assert removed == [name(2)]
    assert calls == [name(9), name(8), name(7), name(3)]
    assert present(folder) == [name(1), name(3), name(7), name(8), name(9)]


def test_nothing_is_verified_when_nothing_is_past_the_keep_rule(folders):
    folder, receipts = folders
    make(folder, 1, 2, 3)
    record(receipts, 1, 2)
    assert after_update_snapshot(folder, name(3), receipts, environ={}, verify=refuse) == []
    assert present(folder) == [name(1), name(2), name(3)]


@pytest.mark.parametrize("keep", ["1", "65", "three", "-3"])
def test_a_bad_keep_setting_removes_nothing_and_says_why(folders, keep, capsys):
    folder, receipts = folders
    make(folder, 1, 2, 3, 4, 5)
    record(receipts, 1, 2, 3, 4)
    environ = {"CONKER_UPDATE_SNAPSHOTS_KEEP": keep}
    assert after_update_snapshot(folder, name(5), receipts, environ=environ, verify=refuse) == []
    assert len(present(folder)) == 5
    assert "must be a whole number from 2 to 64" in capsys.readouterr().err


def test_an_unreadable_receipt_removes_nothing(folders, capsys):
    folder, receipts = folders
    make(folder, 1, 2, 3, 4, 5)
    record(receipts, 1, 2, 3, 4)
    (receipts / ("f" * 32 + ".json")).write_text("{not json", encoding="utf-8")
    assert after_update_snapshot(folder, name(5), receipts, environ={}, verify=refuse) == []
    assert len(present(folder)) == 5
    assert "were not pruned" in capsys.readouterr().err


def test_a_symlink_named_like_a_snapshot_is_never_followed(folders, tmp_path):
    folder, receipts = folders
    make(folder, 2, 3, 4, 5)
    outside = tmp_path / "elsewhere"
    outside.mkdir()
    (outside / "keep.txt").write_text("x", encoding="utf-8")
    try:
        (folder / name(1)).symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("this system cannot make symlinks")
    record(receipts, 1, 2, 3, 4)
    assert after_update_snapshot(folder, name(5), receipts, environ={}, verify=refuse) == [name(2)]
    assert (outside / "keep.txt").is_file() and (folder / name(1)).is_symlink()


def test_a_failed_removal_does_not_fail_the_update(folders, monkeypatch, capsys):
    folder, receipts = folders
    make(folder, 1, 2, 3, 4, 5)
    record(receipts, 1, 2, 3, 4)

    def broken(path):
        raise PermissionError(f"cannot remove {path}")

    monkeypatch.setattr(update_snapshots.shutil, "rmtree", broken)
    assert after_update_snapshot(folder, name(5), receipts, environ={}, verify=refuse) == []
    assert "were not pruned" in capsys.readouterr().err


def test_an_update_prunes_older_update_snapshots_and_keeps_hand_made_ones(deployment, tmp_path):
    folder = tmp_path / "snapshots"
    make(folder, 1, 2, 3, 4)
    (folder / OWNERS).mkdir()
    record(deployment / "state" / "update" / "receipts", 1, 2, 3, 4)
    host = Host(deployment, {"0.2.0": True})
    assert update(deployment, host)[1].run()["status"] == "applied"
    assert present(folder) == [OWNERS, name(3), name(4), UPDATES_OWN]


def test_a_failed_snapshot_prunes_nothing(deployment, tmp_path):
    folder = tmp_path / "snapshots"
    make(folder, 1, 2, 3, 4)
    record(deployment / "state" / "update" / "receipts", 1, 2, 3, 4)
    with pytest.raises(UpdateError):
        update(deployment, Host(deployment, {"0.2.0": True}, snapshot=False))[1].run()
    assert len(present(folder)) == 4
