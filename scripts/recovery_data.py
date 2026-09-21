"""Offline data operations. This file also runs inside existing, pinned gate images.

Never import an application's startup module here: startup can migrate data, mint
keys, or start a worker before recovery has decided whether that is safe.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sqlite3
import sys
import tarfile
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import BinaryIO


class RecoveryError(RuntimeError):
    pass


def sqlite_backup(source: Path, destination: Path) -> None:
    # Opening read-only still reads committed pages in WAL; copying the main
    # file alone loses precisely the newest messages we are trying to protect.
    with (
        closing(
            sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
        ) as src,
        closing(sqlite3.connect(destination)) as dst,
    ):
        src.backup(dst)
        if dst.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise RecoveryError(
                "SQLite integrity check failed; retain the source store."
            )


def safe_member(member: tarfile.TarInfo) -> Path:
    name = member.name
    path = PurePosixPath(name)
    if (
        not name
        or path.is_absolute()
        or ".." in path.parts
        or "\\" in name
        or ":" in name
        or path.as_posix() != name
        or not (member.isfile() or member.isdir())
    ):
        raise RecoveryError("Unsafe archive member; use a verified Conker snapshot.")
    return Path(*path.parts)


def validate_archive(path: Path, required_database: str | None = None) -> None:
    seen: set[str] = set()
    with tarfile.open(path, "r:") as archive:
        for member in archive:
            safe_member(member)
            if member.name in seen:
                raise RecoveryError(
                    "Duplicate archive member; retain the original snapshot."
                )
            seen.add(member.name)
            if member.isfile():
                stream = archive.extractfile(member)
                assert stream is not None
                if (
                    member.name == required_database
                    and stream.read(16) != b"SQLite format 3\x00"
                ):
                    raise RecoveryError(
                        "Required SQLite archive member is invalid; obtain an intact snapshot."
                    )
                while stream.read(1024 * 1024):
                    pass
    if required_database and required_database not in seen:
        raise RecoveryError(
            "Required SQLite store is absent from its archive; obtain an intact snapshot."
        )


def snapshot_tree(
    source: Path, output: BinaryIO, required_database: str | None = None
) -> None:
    files = sorted(source.rglob("*"))
    databases: set[Path] = set()
    for path in files:
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise RecoveryError(
                "Unsupported special file in store; inventory it before backup."
            )
        if path.is_file():
            with path.open("rb") as stream:
                if stream.read(16) == b"SQLite format 3\x00":
                    databases.add(path)
    if required_database and source / required_database not in databases:
        raise RecoveryError(
            f"Required SQLite store {required_database} is missing or invalid; recover the original store before backup."
        )
    sidecars = {
        Path(str(db) + suffix)
        for db in databases
        for suffix in ("-wal", "-shm", "-journal")
    }
    with (
        tempfile.TemporaryDirectory() as scratch,
        tarfile.open(fileobj=output, mode="w|") as archive,
    ):
        for path in files:
            if path in sidecars:
                continue
            member = archive.gettarinfo(str(path), path.relative_to(source).as_posix())
            member.mode &= 0o777
            if path in databases:
                copy = Path(scratch) / "database.sqlite"
                sqlite_backup(path, copy)
                member.size = copy.stat().st_size
                with copy.open("rb") as stream:
                    archive.addfile(member, stream)
                copy.unlink()
            elif path.is_file():
                with path.open("rb") as stream:
                    archive.addfile(member, stream)
            else:
                archive.addfile(member)


def restore_tree(
    source: BinaryIO, destination: Path, *, preserve_owner: bool = False
) -> None:
    if any(destination.iterdir()):
        raise RecoveryError(
            "Recovery volume is not empty; choose a fresh recovery destination."
        )
    seen: set[str] = set()
    directories: list[tuple[Path, tarfile.TarInfo]] = []
    with tarfile.open(fileobj=source, mode="r|*") as archive:
        for member in archive:
            relative = safe_member(member)
            if member.name in seen:
                raise RecoveryError(
                    "Duplicate archive member; abandon this recovery destination."
                )
            seen.add(member.name)
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if member.isdir():
                target.mkdir(exist_ok=True)
                directories.append((target, member))
            else:
                stream = archive.extractfile(member)
                assert stream is not None
                with target.open("xb") as output:
                    while chunk := stream.read(1024 * 1024):
                        output.write(chunk)
                _permissions(target, member, preserve_owner)
    for target, member in reversed(directories):
        _permissions(target, member, preserve_owner)


def _permissions(path: Path, member: tarfile.TarInfo, preserve_owner: bool) -> None:
    if preserve_owner:
        os.chown(path, member.uid, member.gid)
    path.chmod(member.mode & 0o777)


def invalidate_approvals(database: Path) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        revoked_keys = 0
        if "v2_agent_keys" in tables:
            revoked_keys = db.execute(
                "UPDATE v2_agent_keys SET status='revoked' WHERE status!='revoked'"
            ).rowcount
        spending_disabled = "v2_spend_policy" in tables
        if spending_disabled:
            db.execute("UPDATE v2_spend_policy SET enabled=0")
        revoked_allowances = 0
        if "v2_spend_allowances" in tables:
            # Do not manufacture an incomplete schema or silently skip a ledger.
            # Current allowance records are revoked by immutable separate receipts.
            revoked_allowances = db.execute(
                "INSERT INTO v2_spend_allowance_revocations(allowance_id,revoked_at) "
                "SELECT allowance_id,? FROM v2_spend_allowances a WHERE NOT EXISTS "
                "(SELECT 1 FROM v2_spend_allowance_revocations r WHERE r.allowance_id=a.allowance_id)",
                (datetime.now(timezone.utc).timestamp(),),
            ).rowcount
        # Reject an unknown schema rather than quietly invalidating zero tokens.
        rows = db.execute(
            "SELECT id, body FROM v2_objects WHERE kind='request'"
        ).fetchall()
        invalidated = []
        for request_id, body in rows:
            record = json.loads(body)
            if record.get("status") not in {"pending", "approved"}:
                continue
            binding = record.get("payload", {}).get("binding", {})
            if binding.get("consumed_at"):
                continue
            record["status"] = "cancelled"
            record["recovery"] = {"invalidated_at": now, "reason": "restored snapshot"}
            if binding:
                binding["expires_at"] = "1970-01-01T00:00:00+00:00"
                binding["invalidated_at"] = now
            db.execute(
                "UPDATE v2_objects SET body=?, updated_at=? WHERE kind='request' AND id=?",
                (json.dumps(record), now, request_id),
            )
            invalidated.append(request_id)
        row = db.execute(
            "SELECT body FROM v2_objects WHERE kind='settings' AND id='control-plane'"
        ).fetchone()
        settings = json.loads(row[0]) if row else {"id": "control-plane"}
        settings.update(
            lockdown=True,
            reason="Recovery hold: reconciliation is required",
            changed_by="recovery",
        )
        db.execute(
            "INSERT INTO v2_objects(kind,id,body,created_at,updated_at) VALUES(?,?,?,?,?) "
            "ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",
            ("settings", "control-plane", json.dumps(settings), now, now),
        )
    return {"invalidated_requests": invalidated, "lockdown": True,
            "revoked_execution_keys": revoked_keys, "spending_disabled": spending_disabled,
            "revoked_spending_allowances": revoked_allowances}


def invalidate_browser_sessions(database: Path) -> dict:
    # Never start gateway code while restoring: it could initialize missing auth data.
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=rw", uri=True)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        count = db.execute("SELECT count(*) FROM sessions").fetchone()[0]
        db.execute("UPDATE owner SET generation=generation+1")
        db.execute("DELETE FROM sessions")
        db.execute("DELETE FROM login_attempts")
    return {"invalidated_browser_sessions": count}


def unfinished_turns(database: Path) -> list[dict]:
    with closing(
        sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)
    ) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT id,status,acted,approval_request_id FROM turns "
            "WHERE status != 'complete' ORDER BY started_at"
        ).fetchall()
    return [{**dict(row), "recovery_disposition": "held_no_replay"} for row in rows]


def verify_vault(directory: Path, runtime: dict[str, str]) -> int:
    from cryptography.fernet import Fernet
    from dotenv import dotenv_values

    values = dotenv_values(directory / ".env") if (directory / ".env").exists() else {}
    encrypted = [
        value[7:]
        for value in values.values()
        if isinstance(value, str) and value.startswith("enc:v1:")
    ]
    if not encrypted:
        return 0
    secret = runtime.get("TOOLGATE_VAULT_SECRET", "").strip()
    if not secret:
        key_file = directory / "vault.key"
        if not key_file.is_file():
            raise RecoveryError(
                "Vault key missing; recover the original ToolGate key before proceeding."
            )
        secret = key_file.read_text().strip()
    salt = values.get("TOOLGATE_VAULT_SALT") or runtime.get("TOOLGATE_VAULT_SALT", "")
    derived = hashlib.scrypt(
        secret.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1, dklen=32
    )
    fernet = Fernet(base64.urlsafe_b64encode(derived))
    for token in encrypted:
        fernet.decrypt(token.encode())
    return len(encrypted)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "operation",
        choices=[
            "snapshot-tree",
            "restore-tree",
            "hold-toolgate",
            "hold-gateway",
            "inspect-pi",
            "verify-vault",
            "verify-memory-key",
        ],
    )
    parser.add_argument("path", type=Path)
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("--require-sqlite", choices=["pi.db", "toolgate.db", "auth.db"])
    args = parser.parse_args()
    if args.operation == "snapshot-tree":
        snapshot_tree(args.path, sys.stdout.buffer, args.require_sqlite)
    elif args.operation == "restore-tree":
        restore_tree(sys.stdin.buffer, args.path, preserve_owner=True)
    elif args.operation == "hold-toolgate":
        print(json.dumps(invalidate_approvals(args.path / "toolgate.db")))
    elif args.operation == "hold-gateway":
        print(json.dumps(invalidate_browser_sessions(args.path / "auth.db")))
    elif args.operation == "inspect-pi":
        print(json.dumps(unfinished_turns(args.path / "pi.db")))
    elif args.operation == "verify-vault":
        runtime = json.loads(args.runtime.read_text())["toolgate"]
        print(json.dumps({"vault_values_verified": verify_vault(args.path, runtime)}))
    else:
        from cryptography.fernet import Fernet

        token = (args.path / "runtime-token").read_text().strip()
        if token:
            Fernet((args.path / "runtime-fernet.key").read_bytes().strip()).decrypt(
                token.encode()
            )
        print(json.dumps({"memory_provider_key_verified": bool(token)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - sanitize every failure at the CLI boundary
        # Exception messages from crypto/parsers may carry payloads. Only our
        # own errors are safe to show; never print recovered credentials.
        message = str(exc) if isinstance(exc, RecoveryError) else type(exc).__name__
        print(f"Recovery data operation failed: {message}", file=sys.stderr)
        sys.exit(1)
