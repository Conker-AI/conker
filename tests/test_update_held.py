"""An update held because its saved state could not be read reaches the Inbox: the hold leaves a
receipt naming the likeliest release, and Pi is told at once (scripts/update_held.py)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

from scripts import update_core, update_ubuntu
from scripts.update_check import MODULES, pending_results
from scripts.update_core import UpdateError, UpdateStore

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import update_core as bare_core


@pytest.fixture
def boot(monkeypatch, tmp_path):
    """This boot's id and start time, as /proc gives them on Linux (tests/test_update_recover.py)."""
    path, stat = tmp_path / "boot_id", tmp_path / "stat"
    path.write_text("boot-now\n", encoding="ascii")
    stat.write_text("cpu  1 2 3\nbtime 1000\n", encoding="ascii")
    for module in (update_core, bare_core):
        monkeypatch.setattr(module, "BOOT_ID", path)
        monkeypatch.setattr(module, "PROC_STAT", stat)
    return "boot-now"


def installed(root: Path, version: str | None) -> None:
    source = root / "sources" / "companion"
    source.mkdir(parents=True)
    line = f"CONKER_VERSION={version}\n" if version else ""
    (source / "versions.env").write_text(f"PI_VERSION=0.25.0\n{line}", encoding="utf-8")


def offer(root: Path, *versions: str) -> None:
    modules = {name: {"version": "0.1.0", "commit": "c" * 40} for name in MODULES}
    found = {version: {"commit": "d" * 40, "modules": modules} for version in versions}
    directory = root / "state" / "update"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "offer.json").write_text(json.dumps({"offers": found}), encoding="utf-8")


def unreadable(root: Path, saved: str = "{not json") -> UpdateStore:
    store = UpdateStore(root / "state" / "update")
    store.directory.mkdir(parents=True, exist_ok=True)
    store.active_path.write_text(saved, encoding="utf-8")
    return store


def recover(root: Path) -> list[Path]:
    told: list[Path] = []
    with pytest.raises(UpdateError, match="restore the snapshot"):
        update_ubuntu.recover(
            root, transport_for=lambda *_: pytest.fail("no transport"), tell=told.append
        )
    return told


@pytest.mark.parametrize("saved", ["{not json", '{"phase": "applying"}', "[1]"])
def test_a_held_unreadable_update_files_a_held_result_for_the_newest_offer(tmp_path, boot, saved):
    installed(tmp_path, "0.1.0")
    offer(tmp_path, "0.2.0", "0.3.0", "0.0.9")
    store = unreadable(tmp_path, saved)

    assert recover(tmp_path) == [tmp_path]  # the Inbox is told at once

    assert store.hold_path.exists()
    [result] = pending_results(store.directory)  # what the daily check would hand Pi as well
    assert (result["version"], result["outcome"]) == ("0.3.0", "held")
    assert "not certain (0.3.0 is the likeliest)" in result["reason"]
    hold = json.loads(store.hold_path.read_text(encoding="utf-8"))
    assert hold["transaction_id"] == result["id"]


def test_without_a_newer_offer_the_installed_release_is_named(tmp_path, boot):
    installed(tmp_path, "0.4.0")
    offer(tmp_path, "0.3.0")
    store = unreadable(tmp_path)

    recover(tmp_path)

    [result] = pending_results(store.directory)
    assert result["version"] == "0.4.0"


def test_a_state_naming_no_valid_release_falls_back_to_the_installed_one(tmp_path, boot):
    installed(tmp_path, "0.1.0")
    store = unreadable(tmp_path, '{"target": "bad", "phase": "applying"}')

    recover(tmp_path)

    [result] = pending_results(store.directory)
    assert result["version"] == "0.1.0"


def test_an_unreleased_build_with_no_offer_holds_without_a_result(tmp_path, boot):
    installed(tmp_path, None)
    store = unreadable(tmp_path)

    assert recover(tmp_path) == []

    assert store.hold_path.exists()
    assert pending_results(store.directory) == []
    assert not (store.directory / "update.lock").exists()


def test_a_held_update_is_not_reported_twice(tmp_path, boot):
    installed(tmp_path, "0.1.0")
    store = unreadable(tmp_path)
    recover(tmp_path)
    [result] = pending_results(store.directory)

    with pytest.raises(UpdateError, match="Update is held"):
        update_ubuntu.recover(tmp_path, tell=lambda _root: pytest.fail("told again"))

    assert os.listdir(store.directory / "receipts") == [f"{result['id']}.json"]
