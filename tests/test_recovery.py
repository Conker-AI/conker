"""Recovery contracts exercised against real SQLite, archives and encryption.

Engine below supplies Docker's transport boundary where no daemon is available.
The opt-in Docker drill additionally exercises that boundary on Linux.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import sqlite3
import subprocess
import sys
import tarfile
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from cryptography.fernet import Fernet, InvalidToken

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import recovery
import recovery_data


def database(path: Path, script: str) -> None:
    with closing(sqlite3.connect(path)) as db, db:
        db.executescript(script)


def toolgate_store(path: Path) -> None:
    path.mkdir(exist_ok=True)
    database(
        path / "toolgate.db",
        """
        CREATE TABLE v2_objects(kind TEXT, id TEXT, body TEXT, created_at TEXT,
                                updated_at TEXT, PRIMARY KEY(kind,id));
    """,
    )
    record = {
        "kind": "verification",
        "status": "approved",
        "payload": {
            "binding": {
                "nonce": "old-nonce",
                "expires_at": "2099-01-01T00:00:00+00:00",
                "consumed_at": None,
            }
        },
    }
    with sqlite3.connect(path / "toolgate.db") as db:
        db.execute(
            "INSERT INTO v2_objects VALUES('request','approval',?,'then','then')",
            (json.dumps(record),),
        )
    secret, salt = "original-install-secret", "ab" * 16
    key = hashlib.scrypt(
        secret.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1, dklen=32
    )
    token = (
        Fernet(base64.urlsafe_b64encode(key))
        .encrypt(b"credential-must-survive")
        .decode()
    )
    (path / "vault.key").write_text(secret)
    (path / ".env").write_text(
        f"TOOLGATE_VAULT_SALT={salt}\nPROVIDER_KEY=enc:v1:{token}\n"
    )


class Engine:
    """A recording transport; all store transformations are the production code."""

    def __init__(
        self,
        tmp: Path,
        profile: recovery.LayoutProfile = recovery.REPOSITORY_PROFILE,
        *,
        bind_stores: bool = False,
    ):
        self.tmp = tmp
        self.profile = profile
        self.services = set(profile.services)
        self.stores = profile.stores
        self.memory_key_name = profile.memory_key_name
        self.calls = []
        self.fail_dump = False
        self.fail_restore = False
        self.containers = {}
        self.volumes = {}
        self.volume_labels = {}
        self.image = "sha256:" + "a" * 64
        for service in self.services:
            container = {
                "Id": "source-" + service,
                "Image": self.image,
                "State": {"Running": True, "ExitCode": 0},
                "Mounts": [],
                "Config": {"Image": "example/" + service + ":1", "Env": []},
            }
            self.containers[container["Id"]] = container
            if service in self.stores:
                volume = "original-" + service
                path = tmp / volume
                path.mkdir()
                self.volumes[volume] = path
                mount = {"Destination": self.stores[service]}
                if bind_stores:
                    mount.update({"Type": "bind", "Source": str(path)})
                else:
                    mount.update({"Type": "volume", "Name": volume})
                container["Mounts"].append(mount)
        if profile.name == "ubuntu":
            runtime = {
                "gateway": {"GATEWAY_DB_PATH": "/auth/auth.db"},
                "pi": {"PI_DB_PATH": "/data/pi.db"},
                "toolgate": {
                    "TOOLGATE_DATA_DIR": "/data",
                    "TOOLGATE_VAULT_KEY_FILE": "/data/vault.key",
                },
                "memorygate": {
                    "RUNTIME_SECRET_PATH": "/data/runtime.key",
                    "BACKUP_DIR": "/data/backups",
                    "DATABASE_URL": "postgresql+psycopg://conker:secret@postgres:5432/conker",
                },
                "systemgate": {"SYSTEMGATE_DATA_DIR": "/data"},
                "postgres": {"POSTGRES_USER": "conker", "POSTGRES_DB": "conker"},
            }
            for service, values in runtime.items():
                self.containers["source-" + service]["Config"]["Env"] = [
                    f"{name}={value}" for name, value in values.items()
                ]
        if profile.name == "repository":
            backups = tmp / "backup-location" / "memorygate"
            backups.mkdir(parents=True)
            self.containers["source-memorygate"]["Mounts"] = [
                {
                    "Destination": "/data/backups",
                    "Type": "bind",
                    "Source": str(backups),
                }
            ]
        toolgate_store(self.volumes["original-toolgate"])
        if "original-gateway" in self.volumes:
            database(self.volumes["original-gateway"] / "auth.db", """
                CREATE TABLE owner(id INTEGER PRIMARY KEY, salt TEXT, verifier TEXT, generation INTEGER);
                INSERT INTO owner VALUES(1,'salt','password-verifier',1);
                CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, id TEXT, csrf TEXT, authenticated INTEGER,
                    generation INTEGER, created REAL, touched REAL, expires REAL);
                INSERT INTO sessions VALUES('old-token','browser','csrf',1,1,1,1,99999999999);
                CREATE TABLE login_attempts(at REAL, source TEXT);
            """)
            (self.volumes["original-gateway"] / "tls.key").write_text("local-tls-private-key")
        database(
            self.volumes["original-pi"] / "pi.db",
            """
            CREATE TABLE turns(id TEXT, status TEXT, acted INTEGER, approval_request_id TEXT, started_at REAL);
            INSERT INTO turns VALUES ('turn-unknown','running',0,NULL,1);
            INSERT INTO turns VALUES ('turn-acted','acted_no_reply',1,'approval',2);
        """,
        )
        (self.volumes["original-ollama"] / "custom-model").write_bytes(
            b"not-redownloadable"
        )
        (self.volumes["original-systemgate"] / "admin-key.pbkdf2").write_text(
            "owner-key-hash"
        )
        self.memory_key = Fernet.generate_key()
        self.memory_token = Fernet(self.memory_key).encrypt(b"memory-provider-secret")
        memorygate = self.volumes.get("original-memorygate", tmp / "original-memorygate")
        if not memorygate.exists():
            memorygate.mkdir()
            self.volumes["original-memorygate"] = memorygate
            self.containers["source-memorygate"]["Mounts"].insert(
                0,
                {
                    "Destination": "/data",
                    "Type": "volume",
                    "Name": "original-memorygate",
                },
            )
        (memorygate / self.memory_key_name).write_bytes(self.memory_key)

    def json(self, *args):
        return json.loads(self.run(*args).stdout)

    def run(self, *args, output=None, input=None, check=True):
        self.calls.append(args)
        data = b""
        returncode = 0
        if args[0] == "compose":
            if "config" in args:
                data = json.dumps(
                    {"services": {service: {} for service in self.services}}
                ).encode()
            else:
                data = ("source-" + args[-1]).encode()
        elif args[0] == "inspect":
            if args[1] not in self.containers:
                returncode = 1
            else:
                data = json.dumps([self.containers[args[1]]]).encode()
        elif args[:2] == ("volume", "inspect"):
            if args[2] not in self.volumes:
                returncode = 1
            else:
                data = json.dumps(
                    [{"Name": args[2], "Labels": self.volume_labels.get(args[2], {})}]
                ).encode()
        elif args[:2] == ("image", "inspect"):
            data = json.dumps(
                [
                    {
                        "Id": self.image,
                        "RepoDigests": [],
                        "Architecture": "amd64",
                        "Os": "linux",
                        "Config": {},
                    }
                ]
            ).encode()
        elif args[0] in {"stop", "start"}:
            for name in args[1:]:
                if name in self.containers:
                    self.containers[name]["State"]["Running"] = args[0] == "start"
        elif args[0] == "cp":
            stream = io.BytesIO()
            with tarfile.open(fileobj=stream, mode="w") as archive:
                item = tarfile.TarInfo(self.memory_key_name)
                item.size = len(self.memory_key)
                archive.addfile(item, io.BytesIO(self.memory_key))
            data = stream.getvalue()
        elif args[:2] == ("volume", "create"):
            volume = args[-1]
            path = self.tmp / volume
            path.mkdir()
            self.volumes[volume] = path
            label = args[args.index("--label") + 1]
            key, value = label.split("=", 1)
            self.volume_labels[volume] = {key: value}
        elif args[:2] == ("volume", "rm"):
            self.volumes.pop(args[2], None)
            self.volume_labels.pop(args[2], None)
        elif args[0] == "exec":
            if "pg_dump" in args:
                if self.fail_dump:
                    raise recovery.RecoveryError("Injected pg_dump failure")
                data = b"PGDMP-real-dump-required-by-docker-drill"
            elif "pg_restore" in args:
                if self.fail_restore:
                    raise KeyboardInterrupt("Interrupted during database restore")
                assert input.read().startswith(b"PGDMP")
            elif "psql" in args:
                if "pg_database" in args[-1]:
                    data = b""
                elif "status NOT IN" in args[-1]:
                    data = b"0\n"
                else:
                    data = (
                        self.memory_token if "api_key_encrypted" in args[-1] else b"[]"
                    )
        elif args[0] == "run" and "--entrypoint" in args:
            mounts = [
                dict(
                    part.split("=", 1) for part in args[i + 1].split(",") if "=" in part
                )
                for i, arg in enumerate(args)
                if arg == "--mount"
            ]
            source = next(mount for mount in mounts if mount["dst"] == "/store")
            path = (
                self.volumes[source["src"]]
                if source["type"] == "volume"
                else Path(source["src"])
            )
            operation = args[args.index("/recovery/recovery_data.py") + 1]
            if operation == "snapshot-tree":
                buffer = io.BytesIO()
                required = (
                    args[args.index("--require-sqlite") + 1]
                    if "--require-sqlite" in args
                    else None
                )
                recovery_data.snapshot_tree(path, buffer, required)
                data = buffer.getvalue()
            elif operation == "restore-tree":
                recovery_data.restore_tree(input, path)
            elif operation == "hold-toolgate":
                data = json.dumps(
                    recovery_data.invalidate_approvals(path / "toolgate.db")
                ).encode()
            elif operation == "hold-gateway":
                data = json.dumps(recovery_data.invalidate_browser_sessions(path / "auth.db")).encode()
            elif operation == "inspect-pi":
                data = json.dumps(
                    recovery_data.unfinished_turns(path / "pi.db")
                ).encode()
            elif operation == "verify-vault":
                data = json.dumps(
                    {"vault_values_verified": recovery_data.verify_vault(path, {})}
                ).encode()
            elif operation == "verify-memory-key":
                token = (path / "runtime-token").read_bytes().strip()
                if token:
                    Fernet((path / "runtime-fernet.key").read_bytes()).decrypt(token)
                data = b'{"memory_provider_key_verified":true}'
        elif args[0] == "run":
            name = args[args.index("--name") + 1]
            label = args[args.index("--label") + 1]
            key, value = label.split("=", 1)
            self.containers[name] = {
                "Id": name,
                "Image": args[-1],
                "State": {"Running": True, "ExitCode": 0},
                "Config": {"Labels": {key: value}},
                "HostConfig": {"NetworkMode": "none", "PortBindings": None},
            }
        elif args[:2] == ("rm", "-f"):
            self.containers.pop(args[2], None)
        elif args[0] != "run":
            raise AssertionError(f"Unimplemented transport operation: {args}")
        if output is not None:
            output.write(data)
        return subprocess.CompletedProcess(args, returncode, data, b"")


@pytest.fixture
def installed(tmp_path):
    root = tmp_path / "install"
    root.mkdir()
    for name in (".env", "versions.env", "docker-compose.yml"):
        (root / name).write_text("test configuration\n")
    return root, Engine(tmp_path)


@pytest.fixture
def ubuntu_installed(tmp_path):
    root = tmp_path / "ubuntu-install"
    state = root / "state"
    source = root / "sources" / "companion"
    provider = state / "provider-secrets"
    provider.mkdir(parents=True)
    source.mkdir(parents=True)
    (root / "compose.json").write_text('{"name":"conker","services":{}}\n')
    (source / "versions.env").write_text("CONKER_RELEASE=test\n")
    (state / "credentials.json").write_text('{"fixture":"secret"}\n')
    (provider / "state.json").write_text(
        '{"schemaVersion":1,"providers":{}}\n'
    )
    for name in recovery.UBUNTU_ENV_FILES:
        (state / name).write_text("FIXTURE_VALUE=test\n")
    engine = Engine(tmp_path, recovery.UBUNTU_PROFILE, bind_stores=True)
    engine.containers["source-gateway"]["Mounts"].append(
        {"Type": "bind", "Source": str(source), "Destination": "/dashboard"}
    )
    for provider_name in ("openrouter", "openai", "anthropic"):
        engine.containers["source-pi"]["Mounts"].append(
            {
                "Type": "bind",
                "Source": str(provider / f"{provider_name}.key"),
                "Destination": f"/run/secrets/provider-{provider_name}",
            }
        )
    engine.containers["source-systemgate"]["Mounts"].extend(
        [
            {"Type": "bind", "Source": str(root / "recovery"), "Destination": "/backups"},
            {"Type": "bind", "Source": "/proc", "Destination": "/host/proc"},
        ]
    )
    (engine.volumes["original-decisions"] / "model.bin").write_bytes(
        b"owner-selected-decision-model"
    )
    return root, engine


def test_ubuntu_snapshot_verifies_and_restores_held(ubuntu_installed, tmp_path):
    root, engine = ubuntu_installed
    destination = tmp_path / "off-machine"

    snapshot = recovery.backup(root, destination, engine)
    manifest = recovery.verify_snapshot(snapshot)
    state = recovery.restore(snapshot, tmp_path / "ubuntu-recovered", engine)

    assert manifest["layout"] == "ubuntu"
    assert manifest["database"] == {
        "service": "postgres",
        "user": "conker",
        "name": "conker",
    }
    assert set(manifest["images"]) == recovery.UBUNTU_SERVICES
    assert set(manifest["stores"]) == set(recovery.UBUNTU_STORES)
    assert "memorygate-backups" not in manifest["stores"]
    assert (snapshot / "config/credentials.json").is_file()
    assert {path.name for path in (snapshot / "config/env").iterdir()} == (
        recovery.UBUNTU_ENV_FILES
    )
    assert state["status"] == "held"
    assert state["source_layout"] == "ubuntu"
    restored_decisions = engine.volumes[state["volumes"]["decisions"]]
    assert (restored_decisions / "model.bin").read_bytes() == (
        b"owner-selected-decision-model"
    )
    assert "POSTGRES_USER=conker" in (
        tmp_path / "ubuntu-recovered" / "postgres.env"
    ).read_text()
    assert any(
        call[0] == "exec" and "pg_dump" in call and "conker" in call
        for call in engine.calls
    )


def test_ubuntu_unknown_bind_fails_before_stopping_writers(ubuntu_installed, tmp_path):
    root, engine = ubuntu_installed
    engine.containers["source-decisions"]["Mounts"].append(
        {"Type": "bind", "Source": str(tmp_path), "Destination": "/unmapped"}
    )

    with pytest.raises(recovery.RecoveryError, match="Unmapped decisions bind mount"):
        recovery.backup(root, tmp_path / "off-machine", engine)

    assert not any(call[0] == "stop" for call in engine.calls)


def test_optional_owner_terminal_has_no_recovery_store_or_archive(
    ubuntu_installed, tmp_path
):
    root, engine = ubuntu_installed
    workspace = tmp_path / "owner-workspace"
    control = tmp_path / "terminal-control"
    workspace.mkdir()
    control.mkdir()
    engine.services.add("owner-terminal")
    engine.containers["source-owner-terminal"] = {
        "Id": "source-owner-terminal",
        "Image": engine.image,
        "State": {"Running": True, "ExitCode": 0},
        "Mounts": [
            {"Type": "bind", "Source": str(control), "Destination": "/run/conker-terminal"},
            {"Type": "bind", "Source": str(workspace), "Destination": "/workspace"},
        ],
        "Config": {
            "Image": "example/owner-terminal:1",
            "Env": ["CONKER_TERMINAL_ISOLATED=1"],
        },
    }
    engine.containers["source-gateway"]["Mounts"].append(
        {"Type": "bind", "Source": str(control), "Destination": "/run/conker-terminal"}
    )

    snapshot = recovery.backup(root, tmp_path / "off-machine", engine)
    manifest = recovery.verify_snapshot(snapshot)
    restored = recovery.restore(snapshot, tmp_path / "held-restore", engine)

    assert "owner-terminal" in manifest["images"]
    assert "owner-terminal" not in manifest["stores"]
    assert not any("terminal" in name for name in manifest["files"] if name.endswith(".tar"))
    assert "owner-terminal" not in restored["volumes"]
    assert any(
        call[0] == "stop" and "source-owner-terminal" in call for call in engine.calls
    )


def test_ubuntu_missing_runtime_contract_fails_before_stopping_writers(
    ubuntu_installed, tmp_path
):
    root, engine = ubuntu_installed
    engine.containers["source-memorygate"]["Config"]["Env"] = [
        value
        for value in engine.containers["source-memorygate"]["Config"]["Env"]
        if not value.startswith("RUNTIME_SECRET_PATH=")
    ]

    with pytest.raises(recovery.RecoveryError, match="RUNTIME_SECRET_PATH"):
        recovery.backup(root, tmp_path / "off-machine", engine)

    assert not any(call[0] == "stop" for call in engine.calls)


def test_new_manifest_database_identity_cannot_drift(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["database"]["name"] = "another_database"
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(recovery.RecoveryError, match="database identity"):
        recovery.verify_snapshot(snapshot)


def test_ubuntu_manifest_store_destination_cannot_drift(ubuntu_installed, tmp_path):
    root, engine = ubuntu_installed
    snapshot = recovery.backup(root, tmp_path / "off-machine", engine)
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["stores"]["decisions"]["destination"] = "/another-model-store"
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(recovery.RecoveryError, match="Storage service or destination"):
        recovery.verify_snapshot(snapshot)


def test_pre_layout_repository_manifest_remains_verifiable(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest.pop("layout")
    manifest.pop("database")
    manifest_path.write_text(json.dumps(manifest))

    assert recovery.verify_snapshot(snapshot)["format"] == recovery.FORMAT


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
    state = recovery.restore(snapshot, tmp_path / "recovered", engine)
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


def operator_review(state, path, **changes):
    now = datetime.now(timezone.utc)
    review = {
        "format": recovery.REVIEW_FORMAT,
        "recovery_id": state["recovery_id"],
        "review_nonce": state["review_nonce"],
        "snapshot_manifest_sha256": state["snapshot_manifest_sha256"],
        "operator": "owner@example.invalid",
        "reviewed_at": now.isoformat(),
        "expires_at": (now + timedelta(days=1)).isoformat(),
        "attestations": {
            name: {"status": status, "evidence_sha256": hashlib.sha256(name.encode()).hexdigest()}
            for name, status in recovery.REVIEW_CHECKS.items()
        },
    }
    review.update(changes)
    path.write_text(json.dumps(review), encoding="utf-8")
    return review


def reviewed_restore(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    destination = tmp_path / "reviewed-recovery"
    state = recovery.restore(snapshot, destination, engine)
    review_path = tmp_path / "operator-review.json"
    operator_review(state, review_path)
    recovery.review_recovery(destination, review_path)
    return destination, engine


def test_reviewed_restore_becomes_service_ready_without_touching_live_install(installed, tmp_path):
    destination, engine = reviewed_restore(installed, tmp_path)

    state = recovery.prove_service_ready(destination, engine)

    assert state["status"] == "service_ready"
    assert state["applications_started"] is False
    assert (destination / recovery.HOLD_FILE).is_file()
    receipt = json.loads(
        (destination / recovery.RECEIPTS_DIR / "service-ready.json").read_text()
    )
    assert receipt["live_install_modified"] is False
    assert receipt["review_receipt_sha256"] == state["review_receipt_sha256"]
    assert all(
        container["State"]["Running"]
        for name, container in engine.containers.items()
        if name.startswith("source-")
    )


def test_review_refuses_missing_or_negative_prerequisites(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    destination = tmp_path / "recovery"
    state = recovery.restore(snapshot, destination, engine)
    review_path = tmp_path / "review.json"
    review = operator_review(state, review_path)
    del review["attestations"]["external_effects"]
    review_path.write_text(json.dumps(review), encoding="utf-8")

    with pytest.raises(recovery.RecoveryError, match="every required attestation"):
        recovery.review_recovery(destination, review_path)

    held = json.loads((destination / recovery.HOLD_FILE).read_text())
    assert held["status"] == "held"
    assert not (destination / recovery.RECEIPTS_DIR).exists()


def test_readiness_interruption_is_resumable_and_success_is_idempotent(
    installed, tmp_path, monkeypatch
):
    destination, engine = reviewed_restore(installed, tmp_path)
    real_helper = recovery.helper
    interrupted = False

    def interrupt_once(*args, **kwargs):
        nonlocal interrupted
        if not interrupted and args[2] == "verify-vault":
            interrupted = True
            raise KeyboardInterrupt("simulated interruption")
        return real_helper(*args, **kwargs)

    monkeypatch.setattr(recovery, "helper", interrupt_once)
    with pytest.raises(KeyboardInterrupt):
        recovery.prove_service_ready(destination, engine)
    state = json.loads((destination / recovery.HOLD_FILE).read_text())
    assert state["status"] == "readiness_interrupted"
    assert (destination / recovery.HOLD_FILE).is_file()

    first = recovery.prove_service_ready(destination, engine)
    calls = len(engine.calls)
    second = recovery.prove_service_ready(destination, engine)
    assert first["service_ready_receipt_sha256"] == second["service_ready_receipt_sha256"]
    assert len(engine.calls) == calls


def test_stale_and_tampered_review_evidence_are_refused(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    destination = tmp_path / "recovery"
    state = recovery.restore(snapshot, destination, engine)
    review_path = tmp_path / "review.json"
    operator_review(state, review_path, review_nonce="another-restore")
    with pytest.raises(recovery.RecoveryError, match="stale"):
        recovery.review_recovery(destination, review_path)

    operator_review(state, review_path)
    recovery.review_recovery(destination, review_path)
    stored = destination / recovery.RECEIPTS_DIR / "operator-review.json"
    review = json.loads(stored.read_text())
    review["operator"] = "changed@example.invalid"
    stored.write_text(json.dumps(review), encoding="utf-8")
    with pytest.raises(recovery.RecoveryError, match="changed"):
        recovery.prove_service_ready(destination, engine)
    assert json.loads((destination / recovery.HOLD_FILE).read_text())["status"] == "reviewed"


def test_readiness_failure_preserves_hold(installed, tmp_path):
    destination, engine = reviewed_restore(installed, tmp_path)
    state = json.loads((destination / recovery.HOLD_FILE).read_text())
    engine.volume_labels[state["volumes"]["pi"]] = {"conker.recovery": "wrong"}

    with pytest.raises(recovery.RecoveryError, match="ownership label"):
        recovery.prove_service_ready(destination, engine)

    failed = json.loads((destination / recovery.HOLD_FILE).read_text())
    assert failed["status"] == "reviewed"
    assert failed["last_failure"]
    assert (destination / recovery.HOLD_FILE).is_file()
    assert not (destination / recovery.RECEIPTS_DIR / "service-ready.json").exists()


def test_abort_removes_only_labeled_recovery_resources_and_is_idempotent(installed, tmp_path):
    destination, engine = reviewed_restore(installed, tmp_path)
    before = json.loads((destination / recovery.HOLD_FILE).read_text())

    first = recovery.abort_recovery(destination, "operator abandoned candidate", engine)
    calls = len(engine.calls)
    second = recovery.abort_recovery(destination, "operator abandoned candidate", engine)

    assert first["status"] == second["status"] == "aborted"
    assert first["resources_removed"] is True
    assert len(engine.calls) == calls
    assert not any(name in engine.volumes for name in before["volumes"].values())
    assert not any(name in engine.containers for name in before["containers"])
    assert all(name.startswith("source-") for name in engine.containers)
    assert (destination / recovery.HOLD_FILE).is_file()


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
        recovery.restore(snapshot, tmp_path / "recovery", engine)
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
        recovery.restore(snapshot, tmp_path / "recovery", engine)
    state = json.loads((tmp_path / "recovery" / recovery.HOLD_FILE).read_text())
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
        recovery.restore(snapshot, destination, engine)
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
    (tmp_path / recovery.HOLD_FILE).write_text("{}")
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
    state = recovery.restore(snapshot, tmp_path / "recovered", engine)
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
    (tmp_path / recovery.HOLD_FILE).write_text("{}")
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
    before = recovery.inventory(snapshot)
    with pytest.raises(recovery.RecoveryError, match="inside the snapshot"):
        recovery.restore(snapshot, snapshot / "config/recovery", engine)
    assert recovery.inventory(snapshot) == before


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
    (root / recovery.HOLD_FILE).write_text("{}")
    with pytest.raises(recovery.RecoveryError, match="Recovery is held"):
        recovery.backup(root, None, engine)
    assert not engine.calls
