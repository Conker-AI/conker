"""conker update --to on the Ubuntu layout, with the host's commands and downloads faked: an update
applies, a failed one is rolled back and the Inbox hears it, an unprovable rollback holds, and a
refusal changes nothing."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import update_ubuntu
from scripts.update_core import UpdateCoordinator, UpdateError, UpdateStore
from scripts.update_ubuntu import UbuntuTransport, tell_inbox

PINS = {
    "PI_VERSION": "0.25.0",
    "TOOLGATE_VERSION": "0.16.0",
    "MEMORYGATE_VERSION": "0.9.0",
    "SYSTEMGATE_VERSION": "0.6.0",
    "EMBEDDINGS_VERSION": "0.2.0",
    "NODE_BUILD_IMAGE": "node@sha256:" + "a" * 64,
}


def write_sources(folder: Path, version: str | None) -> None:
    (folder / "dashboard").mkdir(parents=True)
    lines = [f"{key}={value}" for key, value in PINS.items()]
    if version:
        lines.insert(0, f"CONKER_VERSION={version}")
    (folder / "versions.env").write_text("\n".join(lines) + "\n", encoding="utf-8")


class Disk:
    free = 10**12


@pytest.fixture
def deployment(tmp_path, monkeypatch):
    root = tmp_path / "conker-deploy"
    write_sources(root / "sources" / "companion", "0.1.0")
    (root / "state").mkdir()
    (root / "state" / "gateway.env").write_text(
        "GATEWAY_ORIGIN=https://conker.example.test\n", encoding="utf-8"
    )
    compose = {"volumes": {"agent_workspaces": {"driver_opts": {"device": "/srv/workspaces"}}}}
    (root / "compose.json").write_text(json.dumps(compose), encoding="utf-8")
    monkeypatch.setattr(update_ubuntu.shutil, "disk_usage", lambda _path: Disk())
    monkeypatch.setattr(update_ubuntu.time, "sleep", lambda _seconds: None)
    monkeypatch.setenv("CONKER_UPDATE_HEALTH_TIMEOUT", "0")
    monkeypatch.setenv("CONKER_UPDATE_SNAPSHOTS", str(tmp_path / "snapshots"))
    return root


class Host:
    """The commands the updater runs. `answers` decides each version's health check."""

    def __init__(self, root: Path, answers: dict[str, bool], *, snapshot=True, release=None):
        self.root, self.answers, self.snapshot = root, answers, snapshot
        self.release, self.calls, self.fetched = release, [], []

    def running(self) -> str:
        path = self.root / "sources" / "companion" / "versions.env"
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("CONKER_VERSION="):
                return line.split("=", 1)[1]
        return ""

    def run(self, argv, *, cwd, env, timeout):
        self.calls.append(argv)
        if argv[:2] == ["docker", "run"]:
            mount = next(item for item in argv if item.startswith("type=bind,src="))
            dist = Path(mount.split("src=", 1)[1].split(",dst=", 1)[0]) / "dist"
            dist.mkdir()
            (dist / "index.html").write_text("<!doctype html>", encoding="utf-8")
            return 0
        if "backup" in argv:
            if not self.snapshot:
                return 1
            destination = Path(argv[argv.index("--destination") + 1])
            (destination / "snapshot-20261112T090000Z-0a1b2c3d").mkdir()
            return 0
        if argv[-2:] == ["status", "--strict"]:
            assert env["CONKER_LAYOUT"] == "ubuntu" and env["CONKER_DEPLOY_DIR"] == str(self.root)
            return 0 if self.answers.get(self.running(), False) else 1
        if any(item.endswith("prepare.py") for item in argv):
            assert env["CONKER_WORKSPACES_DIR"] == "/srv/workspaces"
            assert argv[-1] == "https://conker.example.test"
        return 0

    def fetch(self, url: str, target: Path) -> None:
        self.fetched.append(url)
        if "/conker/" in url:
            write_sources(target, self.release or url.rsplit("/v", 1)[1])
        else:
            target.mkdir(parents=True)


def update(root: Path, host: Host, version="0.2.0"):
    transport = UbuntuTransport(root, version, run=host.run, fetch=host.fetch, home=root.parent)
    store = UpdateStore(root / "state" / "update")
    return store, UpdateCoordinator(transport, store)


def receipts(root: Path) -> list[dict]:
    folder = root / "state" / "update" / "receipts"
    return [json.loads(path.read_text(encoding="utf-8")) for path in folder.glob("*.json")]


def told(root: Path) -> list[dict]:
    sent = []
    tell_inbox(root, send=lambda _root, _layout, body: sent.append(body))
    return sent


def test_an_update_stages_snapshots_swaps_and_is_reported_applied(deployment):
    host = Host(deployment, {"0.2.0": True})
    assert update(deployment, host)[1].run()["status"] == "applied"
    assert host.running() == "0.2.0"
    assert host.fetched[0].endswith("/conker/tar.gz/refs/tags/v0.2.0")
    assert any(url.endswith("/pi/tar.gz/refs/tags/v0.25.0") for url in host.fetched)
    [old] = (deployment / "recovery").glob("pre-update-*")
    assert "CONKER_VERSION=0.1.0" in (old / "sources/companion/versions.env").read_text()
    order = [" ".join(call) for call in host.calls]
    backup = next(i for i, line in enumerate(order) if " backup " in line)
    build = next(i for i, line in enumerate(order) if "compose" in line and line.endswith("build"))
    assert backup < build  # the snapshot comes before anything running changes
    [receipt] = receipts(deployment)
    assert receipt["target"] == "0.2.0"
    assert receipt["protection"] == {"snapshot": "snapshot-20261112T090000Z-0a1b2c3d"}
    [body] = told(deployment)
    assert body["running"] == "0.2.0"
    outcomes = [(item["outcome"], item["version"]) for item in body["results"]]
    assert outcomes == [("applied", "0.2.0")]
    assert told(deployment)[0]["results"] == []  # each receipt is reported once


def test_a_failed_health_check_rolls_back_and_the_inbox_hears_why(deployment):
    host = Host(deployment, {"0.1.0": True, "0.2.0": False})
    with pytest.raises(UpdateError, match="prior release was restored"):
        update(deployment, host)[1].run()
    assert host.running() == "0.1.0"
    assert len(list((deployment / "recovery").glob("failed-update-*"))) == 1
    [body] = told(deployment)
    [result] = body["results"]
    assert result["outcome"] == "rolled_back" and result["version"] == "0.2.0"
    assert result["reason"] == "candidate failed: Conker 0.2.0 did not answer its health checks"
    assert body["running"] == "0.1.0"


def test_a_rollback_that_cannot_be_proven_holds_and_says_so(deployment):
    host = Host(deployment, {})
    store, coordinator = update(deployment, host)
    with pytest.raises(UpdateError, match="Update held"):
        coordinator.run()
    assert store.hold_path.exists()
    [result] = told(deployment)[0]["results"]
    assert result["outcome"] == "held"
    host.answers["0.1.0"] = True
    with pytest.raises(UpdateError, match="held"):  # nothing runs again until the hold is resolved
        update(deployment, host)[1].run()


@pytest.mark.parametrize("version", ["0.1.0", "0.0.9"])
def test_a_release_that_is_not_newer_changes_nothing(deployment, version):
    host = Host(deployment, {})
    with pytest.raises(UpdateError, match="stopped before apply"):
        update(deployment, host, version)[1].run()
    assert host.fetched == [] and host.calls == [] and host.running() == "0.1.0"
    [result] = told(deployment)[0]["results"]
    assert result["outcome"] == "failed" and "is not newer" in result["reason"]


def test_a_release_that_names_another_version_is_refused_and_unstaged(deployment):
    host = Host(deployment, {}, release="0.3.0")
    with pytest.raises(UpdateError, match="stopped before apply"):
        update(deployment, host)[1].run()
    assert not list(deployment.glob("staging-*")) and host.running() == "0.1.0"


def test_a_failed_snapshot_stops_the_update_before_anything_changes(deployment):
    host = Host(deployment, {"0.2.0": True}, snapshot=False)
    with pytest.raises(UpdateError, match="stopped before apply"):
        update(deployment, host)[1].run()
    assert host.running() == "0.1.0"
    assert not any("compose" in call for call in host.calls)
    [result] = told(deployment)[0]["results"]
    assert result["reason"] == "preflight failed: the snapshot before the update failed"


def test_a_held_recovery_or_backup_refuses_the_update(deployment):
    (deployment / ".conker-backup.lock").write_text("1", encoding="utf-8")
    host = Host(deployment, {})
    with pytest.raises(UpdateError, match="stopped before apply"):
        update(deployment, host)[1].run()
    assert host.fetched == []


def test_an_update_names_an_exact_release():
    with pytest.raises(UpdateError):
        UbuntuTransport(Path("."), "main")
