"""A rollback across a release that added a Pi migration (Pi's docs/migrations.md).

A Pi refuses a database whose migration ledger (`schema_migrations`) holds an id it does not know:
a newer Pi wrote it, so the Store does not open and the rolled-back Pi never answers. Putting the
old code back is then not enough. The proof is in the two ledgers: an id in the live pi.db that the
pre-update snapshot's pi.db lacks was written by the release being rolled back. Only then is the
snapshot's pi.db put in place (one rename, Pi stopped); the migrated database stays beside it as
pi.db.from-update-STAMP with its sidecars, so nothing the newer Pi wrote is deleted. Anything else
that keeps Pi from answering is not guessed at: the update holds.

The Ubuntu layout runs Pi as the owner's UID 1000 (deploy/ubuntu/README.md), so the host helper
reads and replaces state/pi itself.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import tarfile
from contextlib import closing
from pathlib import Path

DATABASE = "pi.db"
SIDECARS = ("-wal", "-shm", "-journal")


class DatabaseError(Exception):
    """The snapshot's copy of Pi's database cannot be read."""


def ledger(database: Path) -> set[str]:
    """The migration ids a Pi database recorded: empty for a database from before the ledger."""
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        if ("schema_migrations",) not in tables:
            return set()
        return {str(row[0]) for row in db.execute("SELECT id FROM schema_migrations")}


def from_snapshot(snapshot: Path, scratch: Path) -> Path:
    """Pi's database as the snapshot holds it (snapshot/pi.tar, member pi.db), copied to scratch."""
    try:
        with tarfile.open(snapshot / "pi.tar", "r:") as archive:
            member = archive.getmember(DATABASE)
            stream = archive.extractfile(member) if member.isfile() else None
            if stream is None:
                raise DatabaseError("the snapshot holds no Pi database")
            target = scratch / DATABASE
            with target.open("wb") as copy:
                shutil.copyfileobj(stream, copy)
    except (OSError, KeyError, tarfile.TarError):
        raise DatabaseError("the snapshot's Pi database could not be read") from None
    with target.open("rb") as copy:
        if copy.read(16) != b"SQLite format 3\x00":
            raise DatabaseError("the snapshot's Pi database is not a database")
    return target


def migrated_since(live: Path, saved: Path) -> set[str]:
    """The migrations the live database holds that the saved one lacks."""
    if not live.is_file():
        return set()
    return ledger(live) - ledger(saved)


def put_back(live: Path, saved: Path, keep_as: str) -> Path:
    """The saved database in place of the live one (Pi stopped). The live one is kept, under
    pi.db.<keep_as> with its sidecars; at no instant is there no pi.db."""
    kept = live.with_name(f"{live.name}.{keep_as}")
    incoming = live.with_name(f"{live.name}.restoring")
    shutil.copyfile(saved, incoming)
    with incoming.open("rb+") as stream:
        os.fsync(stream.fileno())
    os.link(live, kept)  # the migrated database stays, under its new name, before pi.db changes
    for suffix in SIDECARS:  # a sidecar belongs to the migrated database, not to the saved one
        side = live.with_name(live.name + suffix)
        if side.exists():
            os.replace(side, kept.with_name(kept.name + suffix))
    os.replace(incoming, live)
    return kept
