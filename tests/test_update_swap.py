"""The sources swap on the Ubuntu layout: sources/ exists at every instant of an update and of its
rollback, and a rollback finds the sources from before wherever a power cut left them."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

from scripts import update_swap, update_ubuntu
from scripts.update_swap import identity, put_back, swap_in
from tests.test_update_ubuntu import Host, deployment, update  # noqa: F401  (fixture)


def folder(path: Path, name: str) -> Path:
    path.mkdir(parents=True)
    (path / "release").write_text(name, encoding="utf-8")
    return path


def holds(path: Path) -> str:
    return (path / "release").read_text(encoding="utf-8")


def trade(first: Path, second: Path) -> bool:
    """An exchange for systems without renameat2: the same result, not in one step."""
    middle = first.with_name(first.name + ".trading")
    os.replace(first, middle)
    os.replace(second, first)
    os.replace(middle, second)
    return True


@pytest.fixture
def exchanges(monkeypatch):
    if update_swap._renameat2() is None:  # the real exchange runs on Linux (CI)
        monkeypatch.setattr(update_swap, "exchange", trade)


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="renameat2 is Linux's")
def test_the_kernel_trades_two_folders_in_one_step(tmp_path):
    first, second = folder(tmp_path / "a", "old"), folder(tmp_path / "b", "new")
    ids = identity(first), identity(second)
    assert update_swap.exchange(first, second)
    assert (holds(first), holds(second)) == ("new", "old")
    assert (identity(first), identity(second)) == (ids[1], ids[0])


def test_the_staged_release_takes_the_place_of_the_sources(tmp_path, exchanges):
    sources, staging = folder(tmp_path / "sources", "old"), folder(tmp_path / "staging", "new")
    before = identity(sources)
    swap_in(staging, sources, tmp_path / "kept")
    assert holds(sources) == "new" and holds(tmp_path / "kept") == "old"
    assert identity(tmp_path / "kept") == before and not staging.exists()


def test_without_an_exchange_the_swap_says_it_takes_two_renames(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(update_swap, "exchange", lambda *_paths: False)
    sources, staging = folder(tmp_path / "sources", "old"), folder(tmp_path / "staging", "new")
    swap_in(staging, sources, tmp_path / "kept")
    assert holds(sources) == "new" and holds(tmp_path / "kept") == "old"
    assert "two renames" in capsys.readouterr().err


# --- a rollback finds the sources from before wherever a cut left them -------------------------


@pytest.fixture
def places(tmp_path):
    return tmp_path / "recovery" / "sources", tmp_path / "staging"


def test_cut_between_the_exchange_and_the_move_old_sources_in_staging(tmp_path, places, exchanges):
    kept, staging = places
    sources = folder(tmp_path / "sources", "new")
    before = identity(folder(staging, "old"))
    assert put_back(before, [kept, staging], sources, tmp_path / "failed")
    assert holds(sources) == "old" and holds(tmp_path / "failed") == "new"
    assert not staging.exists() and identity(sources) == before


def test_after_the_swap_the_old_sources_come_back_from_recovery(tmp_path, places, exchanges):
    kept, staging = places
    sources = folder(tmp_path / "sources", "new")
    before = identity(folder(kept, "old"))
    assert put_back(before, [kept, staging], sources, tmp_path / "failed")
    assert holds(sources) == "old" and holds(tmp_path / "failed") == "new"


def test_cut_in_a_rollback_after_its_exchange_finishes_it(tmp_path, places, exchanges):
    kept, staging = places
    sources = folder(tmp_path / "sources", "old")
    folder(kept, "new")  # the rollback traded them, then the power went
    assert put_back(identity(sources), [kept, staging], sources, tmp_path / "failed")
    assert holds(sources) == "old" and holds(tmp_path / "failed") == "new" and not kept.exists()


def test_cut_before_the_swap_leaves_the_sources_as_they_were(tmp_path, places, exchanges):
    kept, staging = places
    sources = folder(tmp_path / "sources", "old")
    assert put_back(identity(sources), [kept, staging], sources, tmp_path / "failed")
    assert holds(sources) == "old"


def test_a_cut_in_the_two_renames_brings_the_missing_sources_back(tmp_path, places):
    kept, staging = places
    before = identity(folder(kept, "old"))
    sources = tmp_path / "sources"  # the old gap: moved away, the new one not yet in place
    assert put_back(before, [kept, staging], sources, tmp_path / "failed")
    assert holds(sources) == "old"


def test_a_device_number_changed_by_a_reboot_still_finds_the_sources(tmp_path, places, exchanges):
    # LVM or device-mapper roots can come back with another st_dev; the inode is the same.
    kept, staging = places
    sources = folder(tmp_path / "sources", "new")
    device, inode = identity(folder(kept, "old"))
    assert put_back([device + 1, inode], [kept, staging], sources, tmp_path / "failed")
    assert holds(sources) == "old" and holds(tmp_path / "failed") == "new"


def test_the_failed_release_is_never_taken_for_the_sources_from_before(tmp_path, places):
    kept, staging = places
    sources = folder(tmp_path / "sources", "new")
    folder(kept, "a copy, not the folder itself")
    assert not put_back([0, 0], [kept, staging], sources, tmp_path / "failed")
    assert holds(sources) == "new" and kept.exists()  # nothing moved


# --- the whole update: a power cut inside the swap, then the helper's `conker update --recover` --


class Cut(BaseException):
    """The power going: nothing after it runs, the coordinator's rollback included."""


def test_a_power_cut_inside_the_swap_leaves_sources_and_recover_rolls_back(
    deployment, monkeypatch, exchanges
):
    host = Host(deployment, {"0.1.0": True, "0.2.0": True})

    def cut(staging, sources, kept):
        assert update_swap.exchange(staging, sources)
        raise Cut

    monkeypatch.setattr(update_ubuntu, "swap_in", cut)
    with pytest.raises(Cut):
        update(deployment, host)[1].run()
    assert host.running() == "0.2.0"  # sources/ is there: the helper can start and recover

    def transport(root, target):
        return update_ubuntu.UbuntuTransport(
            root, target, run=host.run, fetch=host.fetch, home=root.parent
        )

    assert "back on the version it had" in update_ubuntu.recover(deployment, transport)
    assert host.running() == "0.1.0"
    [failed] = (deployment / "recovery").glob("failed-update-*")
    assert "CONKER_VERSION=0.2.0" in (failed / "companion" / "versions.env").read_text()
    assert not list(deployment.glob("staging-*"))
