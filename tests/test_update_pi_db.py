"""A rollback across a release that added a Pi migration: the rolled-back Pi refuses the migrated
database, so the snapshot's copy is put back (the migrated one kept beside it), and only when the
two ledgers prove that; anything else holds and leaves pi.db alone."""

from __future__ import annotations

import io
import sqlite3
import tarfile
from contextlib import closing
from pathlib import Path

import pytest

from scripts.update_core import UpdateError
from scripts.update_pi_db import DatabaseError, from_snapshot, ledger, migrated_since, put_back
from tests.test_update_ubuntu import Host, deployment, receipts, update  # noqa: F401  (fixture)


def database(path: Path, ids: list[str] | None, note: str) -> Path:
    """A Pi database whose ledger holds `ids` (None: from before the ledger) and one note."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS notes (text TEXT)")
        db.execute("DELETE FROM notes")
        db.execute("INSERT INTO notes VALUES (?)", (note,))
        if ids is not None:
            db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY)")
            db.executemany(
                "INSERT OR IGNORE INTO schema_migrations VALUES (?)", [(i,) for i in ids]
            )
    return path


def note(path: Path) -> str:
    with closing(sqlite3.connect(path)) as db:
        return db.execute("SELECT text FROM notes").fetchone()[0]


def snapshot_of(database_path: Path, snapshot: Path, name="pi.db") -> Path:
    snapshot.mkdir(parents=True)
    with tarfile.open(snapshot / "pi.tar", "w") as archive:
        archive.add(database_path, arcname=name)
    return snapshot


def test_a_database_from_before_the_ledger_has_an_empty_one(tmp_path):
    assert ledger(database(tmp_path / "pi.db", None, "old")) == set()
    assert ledger(database(tmp_path / "new.db", ["0001", "0006"], "new")) == {"0001", "0006"}


def test_only_migrations_the_snapshot_lacks_count(tmp_path):
    saved = database(tmp_path / "saved.db", ["0001"], "old")
    assert migrated_since(database(tmp_path / "a.db", ["0001", "0006"], "x"), saved) == {"0006"}
    assert migrated_since(database(tmp_path / "b.db", ["0001"], "x"), saved) == set()
    assert migrated_since(tmp_path / "missing.db", saved) == set()


def test_the_snapshot_copy_is_read_from_its_archive(tmp_path):
    snapshot = snapshot_of(database(tmp_path / "src.db", ["0001"], "old"), tmp_path / "snap")
    (tmp_path / "scratch").mkdir()
    assert note(from_snapshot(snapshot, tmp_path / "scratch")) == "old"


@pytest.mark.parametrize("problem", ["no archive", "no member", "not a database"])
def test_a_snapshot_without_a_readable_pi_database_is_refused(tmp_path, problem):
    snapshot, scratch = tmp_path / "snap", tmp_path / "scratch"
    scratch.mkdir()
    if problem == "no member":
        snapshot_of(database(tmp_path / "src.db", ["0001"], "x"), snapshot, name="other.db")
    elif problem == "not a database":
        snapshot.mkdir()
        with tarfile.open(snapshot / "pi.tar", "w") as archive:
            info = tarfile.TarInfo("pi.db")
            info.size = 5
            archive.addfile(info, io.BytesIO(b"hello"))
    else:
        snapshot.mkdir()
    with pytest.raises(DatabaseError):
        from_snapshot(snapshot, scratch)


def test_the_saved_database_goes_in_and_the_migrated_one_is_kept(tmp_path):
    live = database(tmp_path / "pi" / "pi.db", ["0001", "0006"], "written by the newer Pi")
    (tmp_path / "pi" / "pi.db-wal").write_bytes(b"its log")
    saved = database(tmp_path / "saved.db", ["0001"], "from before the update")
    kept = put_back(live, saved, "from-update-X")
    assert sorted(path.name for path in (tmp_path / "pi").iterdir()) == [
        "pi.db", "pi.db.from-update-X", "pi.db.from-update-X-wal",
    ]  # fmt: skip
    assert (tmp_path / "pi" / "pi.db.from-update-X-wal").read_bytes() == b"its log"
    assert note(live) == "from before the update" and ledger(live) == {"0001"}
    (tmp_path / "pi" / "pi.db.from-update-X-wal").unlink()  # not a real log: sqlite would object
    assert note(kept) == "written by the newer Pi"


# --- the whole rollback: a release whose Pi migrated the database, then failed its checks ------


class MigratingHost(Host):
    """The new release's Pi adds migration 0006 and fails; the old Pi answers only on a database
    whose ledger it knows (unless it fails for another reason). Each snapshot holds the live pi.db,
    as `conker backup` does."""

    def __init__(self, root, *, old_pi_fails=False, new_pi_migrates=True):
        super().__init__(root, {})
        self.old_pi_fails, self.new_pi_migrates = old_pi_fails, new_pi_migrates
        self.live = root / "state" / "pi" / "pi.db"

    def run(self, argv, *, cwd, env, timeout):
        if "backup" in argv:
            code = super().run(argv, cwd=cwd, env=env, timeout=timeout)
            destination = Path(argv[argv.index("--destination") + 1])
            [made] = destination.glob("snapshot-*")
            with tarfile.open(made / "pi.tar", "w") as archive:
                archive.add(self.live, arcname="pi.db")
            return code
        if argv[-2:] == ["status", "--strict"]:
            self.calls.append(argv)
            if self.running() == "0.2.0":
                if self.new_pi_migrates:
                    database(self.live, ["0006"], "written by 0.2.0")
                return 1
            return 1 if self.old_pi_fails or "0006" in ledger(self.live) else 0
        return super().run(argv, cwd=cwd, env=env, timeout=timeout)


def test_a_rollback_across_a_migration_puts_pis_database_back(deployment):
    host = MigratingHost(deployment)
    database(host.live, ["0001"], "from before the update")
    with pytest.raises(UpdateError, match="prior release was restored"):
        update(deployment, host)[1].run()
    assert host.running() == "0.1.0" and ledger(host.live) == {"0001"}
    assert note(host.live) == "from before the update"
    [kept] = host.live.parent.glob("pi.db.from-update-*")
    assert "0006" in ledger(kept)  # nothing the newer Pi wrote is deleted
    lines = [" ".join(call) for call in host.calls]
    stop = next(i for i, line in enumerate(lines) if line.endswith("stop pi"))
    assert any(line.endswith("up -d") for line in lines[stop:])
    [receipt] = receipts(deployment)
    assert receipt["status"] == "rolled_back"


def test_a_pi_failing_for_another_reason_holds_and_its_database_stays(deployment):
    host = MigratingHost(deployment, old_pi_fails=True, new_pi_migrates=False)
    database(host.live, ["0001"], "from before the update")
    original = host.live.read_bytes()
    store, coordinator = update(deployment, host)
    with pytest.raises(UpdateError, match="Update held"):
        coordinator.run()
    assert store.hold_path.exists() and host.live.read_bytes() == original
    assert not list(host.live.parent.glob("pi.db.from-update-*"))
    assert not any(call[-2:] == ["stop", "pi"] for call in host.calls)


def test_a_restored_database_the_old_pi_still_refuses_holds(deployment):
    host = MigratingHost(deployment, old_pi_fails=True)
    database(host.live, ["0001"], "from before the update")
    store, coordinator = update(deployment, host)
    with pytest.raises(UpdateError, match="Update held"):
        coordinator.run()
    assert store.hold_path.exists()
    assert ledger(host.live) == {"0001"}  # put back, and the migrated one kept, then held
    assert list(host.live.parent.glob("pi.db.from-update-*"))


@pytest.mark.parametrize("name", [None, "", "../../etc", "snapshot-x"])
def test_no_snapshot_of_its_own_means_no_database_is_touched(deployment, name):
    transport = update(deployment, MigratingHost(deployment))[1].transport
    assert not transport._pi_database_back({"snapshot": name})


def test_the_snapshot_is_found_where_it_was_made_not_where_snapshots_go_now(
    deployment, monkeypatch, tmp_path
):
    # A shell update ran with CONKER_UPDATE_SNAPSHOTS set; the rollback (the helper's recover)
    # runs without it. The folder recorded with the snapshot is the one looked in.
    class Moving(MigratingHost):
        def run(self, argv, *, cwd, env, timeout):
            code = super().run(argv, cwd=cwd, env=env, timeout=timeout)
            if "backup" in argv:
                monkeypatch.setenv("CONKER_UPDATE_SNAPSHOTS", str(tmp_path / "elsewhere"))
            return code

    host = Moving(deployment)
    database(host.live, ["0001"], "from before the update")
    with pytest.raises(UpdateError, match="prior release was restored"):
        update(deployment, host)[1].run()
    assert ledger(host.live) == {"0001"} and note(host.live) == "from before the update"
    [receipt] = receipts(deployment)
    assert receipt["status"] == "rolled_back"
    assert receipt["protection"]["folder"] == str(tmp_path / "snapshots")
