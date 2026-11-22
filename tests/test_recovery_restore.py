"""Recovery restore: what a restore revokes, refuses and keeps isolated.

Split from test_recovery.py, whose `installed` fixture these use."""

from __future__ import annotations

import io
import json
import os
import sqlite3
import sys
import tarfile
from pathlib import Path

import pytest
from cryptography.fernet import InvalidToken
from test_recovery import installed as installed  # register the shared pytest fixture

from tests.recovery_fakes import database, toolgate_store

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import recovery  # noqa: E402
import recovery_data  # noqa: E402
import recovery_layout  # noqa: E402
import recovery_restore  # noqa: E402
import recovery_snapshot  # noqa: E402


def test_restored_execution_keys_and_spending_authority_are_revoked(tmp_path):
    toolgate_store(tmp_path)
    path = tmp_path / "toolgate.db"
    with sqlite3.connect(path) as db:
        db.executescript("""
            CREATE TABLE v2_agent_keys(id TEXT PRIMARY KEY,status TEXT,key_hash TEXT);
            INSERT INTO v2_agent_keys VALUES('active','active','hash1'),('old','revoked','hash2');
            CREATE TABLE v2_spend_policy(id INTEGER PRIMARY KEY,enabled INTEGER);
            INSERT INTO v2_spend_policy VALUES(1,1);
            CREATE TABLE v2_spend_allowances(allowance_id TEXT PRIMARY KEY);
            INSERT INTO v2_spend_allowances VALUES('first'),('second');
            CREATE TABLE v2_spend_allowance_revocations(allowance_id TEXT PRIMARY KEY,revoked_at REAL);
            INSERT INTO v2_spend_allowance_revocations VALUES('first',123);
        """)
    result = recovery_data.invalidate_approvals(path)
    assert result["revoked_execution_keys"] == 1
    assert result["revoked_spending_allowances"] == 1 and result["spending_disabled"]
    with sqlite3.connect(path) as db:
        assert (
            db.execute("SELECT count(*) FROM v2_agent_keys WHERE status='active'").fetchone()[0]
            == 0
        )
        assert db.execute("SELECT enabled FROM v2_spend_policy").fetchone()[0] == 0
        assert (
            db.execute(
                "SELECT revoked_at FROM v2_spend_allowance_revocations WHERE allowance_id='first'"
            ).fetchone()[0]
            == 123
        )
    repeated = recovery_data.invalidate_approvals(path)
    assert repeated["revoked_execution_keys"] == repeated["revoked_spending_allowances"] == 0


def test_unknown_allowance_schema_rolls_back_authority_changes(tmp_path):
    toolgate_store(tmp_path)
    path = tmp_path / "toolgate.db"
    with sqlite3.connect(path) as db:
        db.executescript("""
            CREATE TABLE v2_agent_keys(id TEXT PRIMARY KEY,status TEXT);
            INSERT INTO v2_agent_keys VALUES('key','active');
            CREATE TABLE v2_spend_allowances(allowance_id TEXT PRIMARY KEY);
        """)
    with pytest.raises(sqlite3.OperationalError):
        recovery_data.invalidate_approvals(path)
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT status FROM v2_agent_keys").fetchone()[0] == "active"


def test_interrupted_restore_stays_isolated_and_keeps_recovery_hold(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    engine.calls.clear()
    engine.fail_restore = True
    with pytest.raises(KeyboardInterrupt):
        recovery_restore.restore(snapshot, tmp_path / "recovery", engine)
    state = json.loads((tmp_path / "recovery" / recovery_layout.HOLD_FILE).read_text())
    assert state["status"] == "interrupted"
    assert state["outbound"] == "disabled"
    assert state["applications_started"] is False
    assert state["blockers"]
    for call in engine.calls:
        if call[0] == "run":
            assert call[call.index("--network") + 1] == "none"
            assert call[call.index("--log-driver") + 1] == "local"
            assert "-p" not in call and "--publish" not in call and "--privileged" not in call
        assert call[0] not in {"compose", "start"}
    assert all(name.startswith("conker-recovery-") for name in state["volumes"].values())


@pytest.mark.parametrize(
    "name,kind",
    [
        ("../escape", tarfile.REGTYPE),
        ("/absolute", tarfile.REGTYPE),
        ("C:/escape", tarfile.REGTYPE),
        ("link", tarfile.SYMTYPE),
        ("hardlink", tarfile.LNKTYPE),
        ("device", tarfile.CHRTYPE),
    ],
)
def test_unsafe_archives_never_escape_destination(tmp_path, name, kind):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        member = tarfile.TarInfo(name)
        member.type = kind
        archive.addfile(member)
    buffer.seek(0)
    target = tmp_path / "restore"
    target.mkdir()
    with pytest.raises(recovery_data.RecoveryError):
        recovery_data.restore_tree(buffer, target)
    assert not list(target.iterdir())


def test_wrong_vault_key_fails_instead_of_generating_a_replacement(tmp_path):
    toolgate_store(tmp_path)
    (tmp_path / "vault.key").write_text("wrong-key")
    with pytest.raises(InvalidToken):
        recovery_data.verify_vault(tmp_path, {})
    assert (tmp_path / "vault.key").read_text() == "wrong-key"


def test_unknown_toolgate_schema_fails_closed(tmp_path):
    database(tmp_path / "unknown.db", "CREATE TABLE unrelated(id TEXT)")
    with pytest.raises(sqlite3.OperationalError):
        recovery_data.invalidate_approvals(tmp_path / "unknown.db")


def test_existing_recovery_target_is_not_overwritten(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    destination = tmp_path / "recovery"
    destination.mkdir()
    marker = destination / "keep"
    marker.write_text("original")
    with pytest.raises(FileExistsError):
        recovery_restore.restore(snapshot, destination, engine)
    assert marker.read_text() == "original"


def test_cli_dump_failure_exits_nonzero_without_success_message(installed, monkeypatch, capsys):
    root, engine = installed
    engine.fail_dump = True
    monkeypatch.setattr(recovery, "Docker", lambda: engine)
    monkeypatch.setattr(sys, "argv", ["recovery.py", "--root", str(root), "backup"])
    previous = os.umask(0o077)
    try:
        assert recovery.main() == 1
    finally:
        os.umask(previous)
    output = capsys.readouterr()
    assert "Verified snapshot" not in output.out
    assert "Recovery failed" in output.err


def test_cli_restore_reports_hold_with_nonzero_exit(installed, tmp_path, monkeypatch, capsys):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    monkeypatch.setattr(recovery, "Docker", lambda: engine)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "recovery.py",
            "restore",
            str(snapshot),
            "--into",
            str(tmp_path / "recovered"),
        ],
    )
    previous = os.umask(0o077)
    try:
        assert recovery.main() == 3
    finally:
        os.umask(previous)
    assert "HELD" in capsys.readouterr().out


def test_restore_cannot_change_its_source_snapshot(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    before = recovery_snapshot.inventory(snapshot)
    with pytest.raises(recovery.RecoveryError, match="inside the snapshot"):
        recovery_restore.restore(snapshot, snapshot / "config/recovery", engine)
    assert recovery_snapshot.inventory(snapshot) == before
