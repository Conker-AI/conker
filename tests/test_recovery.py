"""Recovery contracts exercised against real SQLite, archives and encryption.

Engine below supplies Docker's transport boundary where no daemon is available.
The opt-in Docker drill additionally exercises that boundary on Linux.
"""

from __future__ import annotations

import io
import json
import os
import sqlite3
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest
from cryptography.fernet import InvalidToken

from tests.recovery_fakes import Engine, database, toolgate_store

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import recovery
import recovery_data
import recovery_layout
import recovery_restore
import recovery_snapshot


@pytest.fixture
def installed(tmp_path):
    root = tmp_path / "install"
    root.mkdir()
    for name in (".env", "versions.env", "docker-compose.yml"):
        (root / name).write_text("test configuration\n")
    return root, Engine(tmp_path)


def test_new_manifest_database_identity_cannot_drift(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["database"]["name"] = "another_database"
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(recovery.RecoveryError, match="database identity"):
        recovery_snapshot.verify_snapshot(snapshot)


def test_pre_layout_repository_manifest_remains_verifiable(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest.pop("layout")
    manifest.pop("database")
    manifest_path.write_text(json.dumps(manifest))

    assert recovery_snapshot.verify_snapshot(snapshot)["format"] == recovery_layout.FORMAT


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


def test_model_cache_links_are_flattened_without_archive_links(tmp_path):
    source, restored = tmp_path / "source", tmp_path / "restored"
    source.mkdir()
    restored.mkdir()
    (source / "blob").write_bytes(b"model data")
    try:
        (source / "model").symlink_to("blob")
    except OSError:
        pytest.skip("Creating symlinks is unavailable")
    archive = io.BytesIO()
    recovery_data.snapshot_tree(source, archive)
    archive.seek(0)
    with tarfile.open(fileobj=archive) as contents:
        assert all(member.isfile() for member in contents)
    archive.seek(0)
    recovery_data.restore_tree(archive, restored)
    assert (restored / "model").read_bytes() == b"model data"
    assert not (restored / "model").is_symlink()


@pytest.mark.parametrize("target", ["../outside", "missing", "."])
def test_backup_rejects_external_dangling_and_directory_links(tmp_path, target):
    source = tmp_path / "source"
    source.mkdir()
    (tmp_path / "outside").write_bytes(b"private data")
    try:
        (source / "model").symlink_to(target, target_is_directory=target == ".")
    except OSError:
        pytest.skip("Creating symlinks is unavailable")
    with pytest.raises(recovery_data.RecoveryError, match="link"):
        recovery_data.snapshot_tree(source, io.BytesIO())


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
        assert db.execute("SELECT count(*) FROM v2_agent_keys WHERE status='active'").fetchone()[0] == 0
        assert db.execute("SELECT enabled FROM v2_spend_policy").fetchone()[0] == 0
        assert db.execute("SELECT revoked_at FROM v2_spend_allowance_revocations WHERE allowance_id='first'").fetchone()[0] == 123
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


def test_snapshot_restores_vault_models_and_holds_actions(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    state = recovery_restore.restore(snapshot, tmp_path / "recovered", engine)
    assert state["status"] == "held"
    assert state["vault_values_verified"] == 1
    assert state["memory_provider_key_verified"] is True
    assert state["invalidated_requests"] == ["approval"]
    assert state["invalidated_browser_sessions"] == 1
    provider_state = json.loads((snapshot / "config/provider-state.json").read_text())
    assert provider_state == {"schemaVersion": 1, "providers": {}}
    assert not any("provider-secrets" in str(path) for path in snapshot.rglob("*"))
    gateway = engine.volumes[state["volumes"]["gateway"]]
    assert (snapshot / "gateway.tar").is_file()
    assert (gateway / "tls.key").read_text() == "local-tls-private-key"
    with sqlite3.connect(gateway / "auth.db") as db:
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
        assert db.execute("SELECT verifier,generation FROM owner").fetchone() == ("password-verifier", 2)
    with sqlite3.connect(engine.volumes["original-gateway"] / "auth.db") as db:
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 1
    assert {turn["recovery_disposition"] for turn in state["unfinished_turns"]} == {
        "held_no_replay"
    }
    restored_vault = engine.volumes[state["volumes"]["toolgate"]]
    assert recovery_data.verify_vault(restored_vault, {}) == 1
    assert (
        engine.volumes[state["volumes"]["ollama"]] / "custom-model"
    ).read_bytes() == b"not-redownloadable"
    with sqlite3.connect(restored_vault / "toolgate.db") as db:
        request = json.loads(
            db.execute("SELECT body FROM v2_objects WHERE id='approval'").fetchone()[0]
        )
        settings = json.loads(
            db.execute("SELECT body FROM v2_objects WHERE kind='settings'").fetchone()[
                0
            ]
        )
    assert request["status"] == "cancelled"
    assert settings["lockdown"] is True
    # Recovery must not modify the source approval or the source's availability.
    with sqlite3.connect(engine.volumes["original-toolgate"] / "toolgate.db") as db:
        assert (
            json.loads(db.execute("SELECT body FROM v2_objects").fetchone()[0])[
                "status"
            ]
            == "approved"
        )


def test_backup_refuses_legacy_plaintext_provider_credentials(installed):
    root, engine = installed
    (root / ".env").write_text("OPENROUTER_KEY=legacy-plaintext-provider-key\n")

    with pytest.raises(recovery.RecoveryError, match="rerun install.sh"):
        recovery.backup(root, None, engine)

    assert not (root / ".conker-backup.lock").exists()
    assert all(
        container["State"]["Running"]
        for name, container in engine.containers.items()
        if name.startswith("source-")
    )


@pytest.mark.parametrize("damage", ["missing", "changed", "unlisted", "legacy"])
def test_incomplete_or_changed_snapshots_fail_before_docker(
    installed, tmp_path, damage
):
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


def test_interrupted_restore_stays_isolated_and_keeps_recovery_hold(
    installed, tmp_path
):
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
            assert (
                "-p" not in call
                and "--publish" not in call
                and "--privileged" not in call
            )
        assert call[0] not in {"compose", "start"}
    assert all(
        name.startswith("conker-recovery-") for name in state["volumes"].values()
    )


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


def test_current_toolgate_rejects_restored_approval(tmp_path):
    gate = Path(os.environ.get("CONKER_TEST_TOOLGATE", ROOT.parent / "gates/toolgate"))
    if not (gate / "toolgate/core/control_plane.py").exists():
        pytest.skip(
            "set CONKER_TEST_TOOLGATE to run compatibility against the actual gate"
        )
    env = {
        **os.environ,
        "PYTHONPATH": str(gate),
        "PYTHONDONTWRITEBYTECODE": "1",
        "TOOLGATE_DATA_DIR": str(tmp_path),
    }
    create = """
from toolgate.core import control_plane as cp
r = cp.create_verification_request('Run echo','test','agent','tool','echo',{},1,900,'agent-id')
cp.decide_request(r['id'],'approved','owner')
print(r['id'])
"""
    result = subprocess.run(
        [sys.executable, "-c", create],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    request = result.stdout.strip()
    recovery_data.invalidate_approvals(tmp_path / "toolgate.db")
    consume = """
import sys
from toolgate.core import control_plane as cp
allowed, reason = cp.consume_verification(sys.argv[1],'tool','echo',{},1,'agent','agent-id')
assert not allowed, 'restored approval executed'
assert cp.settings()['lockdown'] is True
"""
    subprocess.run(
        [sys.executable, "-c", consume, request],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )


def test_cli_dump_failure_exits_nonzero_without_success_message(
    installed, monkeypatch, capsys
):
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


def test_cli_restore_reports_hold_with_nonzero_exit(
    installed, tmp_path, monkeypatch, capsys
):
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


@pytest.mark.parametrize("command", ["start", "restart", "update", "model"])
def test_shell_commands_cannot_bypass_recovery_hold(tmp_path, command):
    import shutil

    if os.name == "nt":
        pytest.skip("Requires a POSIX Bash path namespace")
    bash = shutil.which("bash")
    if not bash:
        pytest.skip("Bash is required for the CLI guard test")
    (tmp_path / recovery_layout.HOLD_FILE).write_text("{}")
    result = subprocess.run(
        [bash, str(ROOT / "conker"), command],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "Recovery is held" in result.stderr


def test_missing_pi_store_cannot_produce_a_complete_snapshot(installed):
    root, engine = installed
    (engine.volumes["original-pi"] / "pi.db").unlink()
    with pytest.raises(recovery_data.RecoveryError, match="pi.db"):
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
    assert (
        engine.volumes[extra] / "settings.yml"
    ).read_text() == "owner configured sources"


@pytest.mark.parametrize("destination", ["/var/run/docker.sock", "/host/root"])
def test_removed_systemgate_authority_fails_backup_closed(installed, destination):
    root, engine = installed
    engine.containers["source-systemgate"]["Mounts"].append(
        {"Type": "bind", "Source": destination, "Destination": destination}
    )

    with pytest.raises(recovery.RecoveryError, match="Unmapped systemgate bind mount"):
        recovery.backup(root, None, engine)


def test_restored_vault_opens_with_actual_toolgate(tmp_path):
    gate = Path(os.environ.get("CONKER_TEST_TOOLGATE", ROOT.parent / "gates/toolgate"))
    if not (gate / "toolgate/core/vault.py").exists():
        pytest.skip("set CONKER_TEST_TOOLGATE for actual vault compatibility")
    source, restored = tmp_path / "source", tmp_path / "restored"
    source.mkdir()
    restored.mkdir()
    toolgate_store(source)
    archive = io.BytesIO()
    recovery_data.snapshot_tree(source, archive)
    archive.seek(0)
    recovery_data.restore_tree(archive, restored)
    env = {
        **os.environ,
        "PYTHONPATH": str(gate),
        "PYTHONDONTWRITEBYTECODE": "1",
        "TOOLGATE_DATA_DIR": str(restored),
        "TOOLGATE_ENV_PATH": str(restored / ".env"),
        "TOOLGATE_VAULT_KEY_FILE": str(restored / "vault.key"),
        "TOOLGATE_VAULT_SECRET": "",
    }
    code = "from toolgate.core import vault; assert vault.get_key('PROVIDER_KEY') == 'credential-must-survive'"
    subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )


def test_installer_does_not_override_recovery_hold(tmp_path):
    import shutil

    if os.name == "nt":
        pytest.skip("Requires a POSIX Bash path namespace")
    bash = shutil.which("bash")
    if not bash:
        pytest.skip("Bash is required for the installer guard test")
    (tmp_path / recovery_layout.HOLD_FILE).write_text("{}")
    result = subprocess.run(
        [bash, str(ROOT / "install.sh"), "--yes"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "Recovery is held" in result.stderr


def test_restore_cannot_change_its_source_snapshot(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    before = recovery_snapshot.inventory(snapshot)
    with pytest.raises(recovery.RecoveryError, match="inside the snapshot"):
        recovery_restore.restore(snapshot, snapshot / "config/recovery", engine)
    assert recovery_snapshot.inventory(snapshot) == before


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
