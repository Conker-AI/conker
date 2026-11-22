"""Recovery snapshots: what a backup captures, and when it refuses or stops before Docker.

Split from test_recovery.py, whose `installed` fixture these use."""

from __future__ import annotations

import io
import sqlite3
import sys
from pathlib import Path

import pytest
from test_recovery import installed as installed  # register the shared pytest fixture

from tests.recovery_fakes import database

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import recovery  # noqa: E402
import recovery_data  # noqa: E402
import recovery_layout  # noqa: E402
import recovery_restore  # noqa: E402


def test_wal_resident_messages_survive_snapshot(tmp_path):
    source, target = tmp_path / "source", tmp_path / "target"
    source.mkdir()
    target.mkdir()
    connection = sqlite3.connect(source / "pi.db")
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA wal_autocheckpoint=0")
        connection.execute("CREATE TABLE messages (text TEXT)")
        connection.execute("INSERT INTO messages VALUES ('newest committed message')")
        connection.commit()
        assert (source / "pi.db-wal").stat().st_size > 0
        archive = io.BytesIO()
        recovery_data.snapshot_tree(source, archive)
        archive.seek(0)
        recovery_data.restore_tree(archive, target)
        assert not (target / "pi.db-wal").exists()
        with sqlite3.connect(target / "pi.db") as restored:
            assert restored.execute("SELECT text FROM messages").fetchone() == (
                "newest committed message",
            )
    finally:
        connection.close()


def test_sqlite_snapshot_opens_only_a_private_copy(tmp_path, monkeypatch):
    source, destination = tmp_path / "auth.db", tmp_path / "snapshot.db"
    database(source, "CREATE TABLE owner(value TEXT); INSERT INTO owner VALUES('retained');")
    before = source.read_bytes()
    connect = sqlite3.connect
    opened = []

    def guarded(path, *args, **kwargs):
        assert str(path) != str(source) and str(source) not in str(path)
        opened.append(str(path))
        return connect(path, *args, **kwargs)

    monkeypatch.setattr(recovery_data.sqlite3, "connect", guarded)
    recovery_data.sqlite_backup(source, destination)
    assert source.read_bytes() == before
    assert opened and all(str(source) != path for path in opened)
    with connect(destination) as restored:
        assert restored.execute("SELECT value FROM owner").fetchone() == ("retained",)


def test_authentication_gateway_is_a_coordinated_writer():
    assert "gateway" in recovery_layout.REPOSITORY_PROFILE.writers
    assert "gateway" in recovery_layout.UBUNTU_PROFILE.writers


def test_backup_refuses_legacy_plaintext_provider_credentials(installed):
    root, engine = installed
    (root / ".env").write_text("OPENROUTER_KEY=legacy-plaintext-provider-key\n")

    with pytest.raises(recovery.RecoveryError, match=r"rerun install\.sh"):
        recovery.backup(root, None, engine)

    assert not (root / ".conker-backup.lock").exists()
    assert all(
        container["State"]["Running"]
        for name, container in engine.containers.items()
        if name.startswith("source-")
    )


@pytest.mark.parametrize("damage", ["missing", "changed", "unlisted", "legacy"])
def test_incomplete_or_changed_snapshots_fail_before_docker(installed, tmp_path, damage):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    if damage == "missing":
        (snapshot / "toolgate.tar").unlink()
    elif damage == "changed":
        with (snapshot / "pi.tar").open("ab") as stream:
            stream.write(b"changed")
    elif damage == "unlisted":
        (snapshot / "unexpected-file").write_text("unexpected")
    else:
        (snapshot / "manifest.json").unlink()
    before = len(engine.calls)
    with pytest.raises(recovery.RecoveryError):
        recovery_restore.restore(snapshot, tmp_path / "recovery", engine)
    assert len(engine.calls) == before
    assert not (tmp_path / "recovery").exists()


def test_dump_failure_never_publishes_success_and_restarts_only_previous_writers(
    installed,
):
    root, engine = installed
    engine.containers["source-systemgate"]["State"]["Running"] = False
    engine.fail_dump = True
    with pytest.raises(recovery.RecoveryError, match="pg_dump"):
        recovery.backup(root, None, engine)
    assert not list((engine.tmp / "backup-location").glob("snapshot-*"))
    assert not list((engine.tmp / "backup-location").rglob("manifest.json"))
    assert engine.containers["source-pi"]["State"]["Running"]
    assert not engine.containers["source-systemgate"]["State"]["Running"]
    assert not (root / ".conker-backup.lock").exists()


def test_missing_pi_store_cannot_produce_a_complete_snapshot(installed):
    root, engine = installed
    (engine.volumes["original-pi"] / "pi.db").unlink()
    with pytest.raises(recovery_data.RecoveryError, match=r"pi\.db"):
        recovery.backup(root, None, engine)
    assert not list((engine.tmp / "backup-location").rglob("manifest.json"))


def test_image_declared_volume_is_inventoried_and_restored(installed, tmp_path):
    root, engine = installed
    path = tmp_path / "search-settings"
    path.mkdir()
    (path / "settings.yml").write_text("owner configured sources")
    engine.volumes["search-anonymous"] = path
    engine.containers["source-searxng"]["Mounts"].append(
        {"Type": "volume", "Name": "search-anonymous", "Destination": "/etc/searxng"}
    )
    snapshot = recovery.backup(root, None, engine)
    state = recovery_restore.restore(snapshot, tmp_path / "recovered", engine)
    extra = state["volumes"]["extra-searxng-0"]
    assert (engine.volumes[extra] / "settings.yml").read_text() == "owner configured sources"


@pytest.mark.parametrize("destination", ["/var/run/docker.sock", "/host/root"])
def test_removed_systemgate_authority_fails_backup_closed(installed, destination):
    root, engine = installed
    engine.containers["source-systemgate"]["Mounts"].append(
        {"Type": "bind", "Source": destination, "Destination": destination}
    )

    with pytest.raises(recovery.RecoveryError, match="Unmapped systemgate bind mount"):
        recovery.backup(root, None, engine)


def test_unmapped_memory_database_fails_before_stopping_services(installed):
    root, engine = installed
    engine.containers["source-memorygate"]["Config"]["Env"] = [
        "DATABASE_URL=postgresql://another-server/life"
    ]
    with pytest.raises(recovery.RecoveryError, match="unmapped database"):
        recovery.backup(root, None, engine)
    assert not any(call[0] == "stop" for call in engine.calls)


def test_backup_cannot_restart_writers_from_a_held_install(installed):
    root, engine = installed
    (root / recovery_layout.HOLD_FILE).write_text("{}")
    with pytest.raises(recovery.RecoveryError, match="Recovery is held"):
        recovery.backup(root, None, engine)
    assert not engine.calls
