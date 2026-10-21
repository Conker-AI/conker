"""Recovery test fakes: SQLite stores, a ToolGate store, and a recording Docker engine."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import sqlite3
import subprocess
import sys
import tarfile
from contextlib import closing
from pathlib import Path

from cryptography.fernet import Fernet

# Recovery runs as scripts/recovery.py, so its modules import each other flat.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import recovery
import recovery_data
import recovery_layout


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
        profile: recovery_layout.LayoutProfile = recovery_layout.REPOSITORY_PROFILE,
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
