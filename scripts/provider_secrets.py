#!/usr/bin/env python3
"""Host-only provider credential staging, verification, activation and recovery."""

from __future__ import annotations

import argparse
import contextlib
import http.client
import json
import os
import re
import secrets
import ssl
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

SCHEMA = 1
MAX_SECRET_BYTES = 4096
MAX_RESPONSE_BYTES = 65536
MAX_STATE_BYTES = 262144
MAX_VERIFICATION_AGE = timedelta(minutes=15)
MAX_CLOCK_SKEW = timedelta(minutes=5)
REVISION = re.compile(r"credential_[0-9a-f]{32}")
BASIS = re.compile(r"[A-Za-z0-9_]{1,64}")
VERIFICATION_STATUSES = {"unverified", "verified", "rejected", "unavailable"}


class ProviderSecretError(RuntimeError):
    pass


@dataclass(frozen=True)
class Provider:
    identity: str
    host: str
    path: str
    header: str
    prefix: str


PROVIDERS = {
    item.identity: item
    for item in (
        Provider(
            "openrouter",
            "openrouter.ai",
            "/api/v1/auth/key",
            "Authorization",
            "Bearer ",
        ),
        Provider(
            "openai", "api.openai.com", "/v1/models?limit=1", "Authorization", "Bearer "
        ),
        Provider(
            "anthropic", "api.anthropic.com", "/v1/models?limit=1", "x-api-key", ""
        ),
    )
}


def now() -> str:
    return datetime.now(UTC).isoformat()


def _record() -> dict:
    return {
        "activeRevision": None,
        "activeAt": None,
        "stagedRevision": None,
        "stagedAt": None,
        "verificationStatus": None,
        "verificationBasis": None,
        "verifiedAt": None,
        "pendingActivation": None,
        "revokedRevisions": [],
    }


class SecretStore:
    def __init__(self, directory: Path):
        self.directory = directory.resolve()
        self.state_path = self.directory / "state.json"
        self.lock_path = self.directory / ".lock"

    def initialize(self) -> None:
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._chmod(self.directory, 0o700)
        if self.state_path.is_symlink() or (
            self.state_path.exists() and not self.state_path.is_file()
        ):
            raise ProviderSecretError(
                "Provider credential state must be a regular file."
            )
        if not self.state_path.exists():
            self._save({"schemaVersion": SCHEMA, "providers": {}})
        for provider in PROVIDERS:
            path = self.active_path(provider)
            if path.is_symlink() or (path.exists() and not path.is_file()):
                raise ProviderSecretError(
                    "Provider credential files must be regular files."
                )
            if not path.exists():
                self._write(path, b"")

    @staticmethod
    def _chmod(path: Path, mode: int) -> None:
        try:
            path.chmod(mode)
        except OSError:
            if os.name != "nt":
                raise

    def _write(self, path: Path, value: bytes) -> None:
        temporary = path.with_name(f".{path.name}.{secrets.token_hex(8)}.tmp")
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                output.write(value)
                output.flush()
                os.fsync(output.fileno())
            self._chmod(temporary, 0o600)
            os.replace(temporary, path)
            self._chmod(path, 0o600)
        finally:
            temporary.unlink(missing_ok=True)

    @contextlib.contextmanager
    def locked(self):
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(self.lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        self._chmod(self.lock_path, 0o600)
        lock = os.fdopen(descriptor, "r+b", closefd=True)
        acquired = False
        try:
            if os.name == "nt":
                import msvcrt

                if not lock.read(1):
                    lock.write(b"0")
                    lock.flush()
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
            yield
        except OSError as exc:
            if not acquired:
                raise ProviderSecretError(
                    "Another provider credential operation is active."
                ) from exc
            raise
        finally:
            if acquired:
                if os.name == "nt":
                    import msvcrt

                    lock.seek(0)
                    msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            lock.close()

    def _load(self) -> dict:
        try:
            if self.state_path.is_symlink() or not self.state_path.is_file():
                raise OSError("not a regular file")
            with self.state_path.open("rb") as source:
                encoded = source.read(MAX_STATE_BYTES + 1)
            if len(encoded) > MAX_STATE_BYTES:
                raise ValueError("state is too large")
            value = json.loads(encoded.decode("utf-8"))
        except (OSError, UnicodeDecodeError, ValueError) as exc:
            raise ProviderSecretError(
                "Provider credential state is unreadable."
            ) from exc
        if not isinstance(value, dict) or set(value) != {"schemaVersion", "providers"}:
            raise ProviderSecretError(
                "Provider credential state has an unsupported shape."
            )
        if value["schemaVersion"] != SCHEMA or not isinstance(value["providers"], dict):
            raise ProviderSecretError(
                "Provider credential state has an unsupported version."
            )
        if any(name not in PROVIDERS for name in value["providers"]):
            raise ProviderSecretError(
                "Provider credential state names an unsupported provider."
            )
        return value

    def _save(self, value: dict) -> None:
        encoded = (
            json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
        ).encode()
        self._write(self.state_path, encoded)

    def active_path(self, provider: str) -> Path:
        return self.directory / f"{provider}.key"

    def staged_path(self, provider: str) -> Path:
        return self.directory / f"{provider}.staged"

    def previous_path(self, provider: str) -> Path:
        return self.directory / f"{provider}.previous"

    def _read_secret(self, path: Path, *, allow_empty: bool = False) -> bytes:
        if path.is_symlink() or not path.is_file():
            raise ProviderSecretError(
                "Provider credential file is missing or not regular."
            )
        with path.open("rb") as source:
            value = source.read(MAX_SECRET_BYTES + 1)
        if not value and allow_empty:
            return value
        self._validate_secret(value)
        return value

    def _provider(self, state: dict, provider: str) -> dict:
        if provider not in PROVIDERS:
            raise ProviderSecretError("Choose openrouter, openai or anthropic.")
        saved = state["providers"].setdefault(provider, _record())
        if set(saved) != set(_record()):
            raise ProviderSecretError(
                "Provider credential record has an unsupported shape."
            )
        self._validate_record(saved)
        return saved

    @staticmethod
    def _validate_revision(value: object, *, optional: bool = True) -> None:
        if value is None and optional:
            return
        if not isinstance(value, str) or not REVISION.fullmatch(value):
            raise ProviderSecretError(
                "Provider credential state has an invalid revision."
            )

    @staticmethod
    def _validate_timestamp(value: object, *, optional: bool = True) -> None:
        if value is None and optional:
            return
        if not isinstance(value, str) or len(value) > 64:
            raise ProviderSecretError(
                "Provider credential state has an invalid timestamp."
            )
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as exc:
            raise ProviderSecretError(
                "Provider credential state has an invalid timestamp."
            ) from exc
        if parsed.tzinfo is None:
            raise ProviderSecretError(
                "Provider credential state has an invalid timestamp."
            )

    @classmethod
    def _validate_record(cls, record: dict) -> None:
        active, staged = record["activeRevision"], record["stagedRevision"]
        cls._validate_revision(active)
        cls._validate_revision(staged)
        cls._validate_timestamp(record["activeAt"])
        cls._validate_timestamp(record["stagedAt"])
        cls._validate_timestamp(record["verifiedAt"])
        if bool(active) != bool(record["activeAt"]):
            raise ProviderSecretError(
                "Provider credential active metadata is inconsistent."
            )
        if bool(staged) != bool(record["stagedAt"]):
            raise ProviderSecretError(
                "Provider credential staged metadata is inconsistent."
            )

        status, basis = record["verificationStatus"], record["verificationBasis"]
        if status is not None and status not in VERIFICATION_STATUSES:
            raise ProviderSecretError(
                "Provider credential verification state is invalid."
            )
        if basis is not None and (
            not isinstance(basis, str) or not 1 <= len(basis) <= 128
        ):
            raise ProviderSecretError(
                "Provider credential verification basis is invalid."
            )
        if staged is None:
            if (
                status is not None
                or basis is not None
                or record["verifiedAt"] is not None
            ):
                raise ProviderSecretError(
                    "Provider credential verification metadata is stale."
                )
        elif status is None:
            raise ProviderSecretError(
                "Provider credential verification metadata is missing."
            )
        elif status == "unverified":
            if basis is not None or record["verifiedAt"] is not None:
                raise ProviderSecretError(
                    "Provider credential verification metadata is invalid."
                )
        elif basis is None or record["verifiedAt"] is None:
            raise ProviderSecretError(
                "Provider credential verification metadata is missing."
            )

        pending = record["pendingActivation"]
        if pending is not None:
            if not isinstance(pending, dict) or set(pending) != {
                "revision",
                "previousRevision",
                "preparedAt",
            }:
                raise ProviderSecretError(
                    "Provider credential activation state is invalid."
                )
            cls._validate_revision(pending["revision"], optional=False)
            cls._validate_revision(pending["previousRevision"])
            cls._validate_timestamp(pending["preparedAt"], optional=False)
            if (
                pending["revision"] != staged
                or pending["previousRevision"] != active
                or status != "verified"
            ):
                raise ProviderSecretError(
                    "Provider credential activation state is inconsistent."
                )

        revoked = record["revokedRevisions"]
        if (
            not isinstance(revoked, list)
            or len(revoked) > 100
            or len(revoked) != len(set(revoked))
        ):
            raise ProviderSecretError(
                "Provider credential revocation state is invalid."
            )
        for revision in revoked:
            cls._validate_revision(revision, optional=False)
        if active in revoked or staged in revoked:
            raise ProviderSecretError("A live provider credential is marked revoked.")

    def status(self) -> dict:
        self.initialize()
        state = self._load()
        return {
            "schemaVersion": SCHEMA,
            "storage": "host-files",
            "secretsIncluded": False,
            "providers": [
                self._view(name, self._provider(state, name)) for name in PROVIDERS
            ],
        }

    def _view(self, provider: str, record: dict) -> dict:
        verification_stale = False
        if record["verificationStatus"] == "verified" and record["verifiedAt"]:
            verified_at = datetime.fromisoformat(record["verifiedAt"])
            age = datetime.now(UTC) - verified_at
            verification_stale = age > MAX_VERIFICATION_AGE or age < -MAX_CLOCK_SKEW
        return {
            "id": provider,
            "configured": bool(record["activeRevision"]),
            "activeRevision": record["activeRevision"],
            "activeAt": record["activeAt"],
            "stagedRevision": record["stagedRevision"],
            "stagedAt": record["stagedAt"],
            "verificationStatus": record["verificationStatus"],
            "verificationBasis": record["verificationBasis"],
            "verifiedAt": record["verifiedAt"],
            "verificationStale": verification_stale,
            "activationPending": record["pendingActivation"] is not None,
            "revokedRevisions": list(record["revokedRevisions"]),
            "secretIncluded": False,
        }

    def stage(self, provider: str, secret: bytes) -> dict:
        self.initialize()
        text = self._validate_secret(secret)
        secret = text.encode("ascii")
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            if record["pendingActivation"] is not None:
                raise ProviderSecretError(
                    "Resolve the pending activation before staging another key."
                )
            revision = "credential_" + secrets.token_hex(16)
            self._write(self.staged_path(provider), secret)
            record.update(
                {
                    "stagedRevision": revision,
                    "stagedAt": now(),
                    "verificationStatus": "unverified",
                    "verificationBasis": None,
                    "verifiedAt": None,
                }
            )
            self._save(state)
            return self._view(provider, record)

    @staticmethod
    def _validate_secret(secret: bytes) -> str:
        if not 8 <= len(secret) <= MAX_SECRET_BYTES:
            raise ProviderSecretError("Credential input must contain 8 to 4096 bytes.")
        try:
            text = secret.decode("ascii")
        except UnicodeDecodeError as exc:
            raise ProviderSecretError("Credential input must be ASCII.") from exc
        if any(
            character.isspace() or ord(character) < 33 or ord(character) > 126
            for character in text
        ):
            raise ProviderSecretError(
                "Credential input must be one printable token without spaces."
            )
        return text

    def import_active(self, provider: str, secret: bytes) -> dict:
        """One-way migration from legacy environment configuration; never replace active state."""
        self.initialize()
        text = self._validate_secret(secret)
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            if record["pendingActivation"] is not None:
                raise ProviderSecretError(
                    "Resolve the pending activation before legacy migration."
                )
            active = self.active_path(provider)
            if record["activeRevision"]:
                return self._view(provider, record)
            if not self._read_secret(active, allow_empty=True):
                self._write(active, text.encode("ascii"))
            record["activeRevision"] = "credential_" + secrets.token_hex(16)
            record["activeAt"] = now()
            self._save(state)
            return self._view(provider, record)

    def verify(
        self, provider: str, verifier: Callable[[Provider, bytes], tuple[str, str]]
    ) -> dict:
        self.initialize()
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            if not record["stagedRevision"] or not self.staged_path(provider).is_file():
                raise ProviderSecretError("Stage a credential before verification.")
            secret = self._read_secret(self.staged_path(provider))
            status, basis = verifier(PROVIDERS[provider], secret)
            if status not in {"verified", "rejected", "unavailable"}:
                raise ProviderSecretError(
                    "Credential verifier returned an unsupported status."
                )
            if not isinstance(basis, str) or not BASIS.fullmatch(basis):
                raise ProviderSecretError(
                    "Credential verifier returned an unsupported basis."
                )
            record["verificationStatus"] = status
            record["verificationBasis"] = basis
            record["verifiedAt"] = now()
            self._save(state)
            return self._view(provider, record)

    def prepare_activation(self, provider: str, revision: str) -> dict:
        self.initialize()
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            if record["pendingActivation"] is not None:
                raise ProviderSecretError("An activation is already pending recovery.")
            if (
                record["stagedRevision"] != revision
                or record["verificationStatus"] != "verified"
            ):
                raise ProviderSecretError(
                    "Activate the exact verified staged revision."
                )
            verified_at = datetime.fromisoformat(record["verifiedAt"])
            age = datetime.now(UTC) - verified_at
            if age > MAX_VERIFICATION_AGE or age < -MAX_CLOCK_SKEW:
                raise ProviderSecretError(
                    "Verify the staged credential again before activation."
                )
            staged = self.staged_path(provider)
            staged_secret = self._read_secret(staged)
            active, previous = self.active_path(provider), self.previous_path(provider)
            active_secret = self._read_secret(active, allow_empty=True)
            if active_secret:
                self._write(previous, active_secret)
            else:
                previous.unlink(missing_ok=True)
            self._write(active, staged_secret)
            record["pendingActivation"] = {
                "revision": revision,
                "previousRevision": record["activeRevision"],
                "preparedAt": now(),
            }
            self._save(state)
            return self._view(provider, record)

    def commit_activation(self, provider: str, revision: str) -> dict:
        self.initialize()
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            pending = record["pendingActivation"]
            if not isinstance(pending, dict) or pending.get("revision") != revision:
                raise ProviderSecretError("No matching activation is pending.")
            record["activeRevision"] = revision
            record["activeAt"] = now()
            record["stagedRevision"] = None
            record["stagedAt"] = None
            record["verificationStatus"] = None
            record["verificationBasis"] = None
            record["verifiedAt"] = None
            record["pendingActivation"] = None
            self.staged_path(provider).unlink(missing_ok=True)
            self.previous_path(provider).unlink(missing_ok=True)
            self._save(state)
            return self._view(provider, record)

    def rollback_activation(self, provider: str, revision: str) -> dict:
        self.initialize()
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            pending = record["pendingActivation"]
            if not isinstance(pending, dict) or pending.get("revision") != revision:
                raise ProviderSecretError("No matching activation is pending.")
            previous = self.previous_path(provider)
            if pending.get("previousRevision"):
                self._write(self.active_path(provider), self._read_secret(previous))
            else:
                self._write(self.active_path(provider), b"")
            record["pendingActivation"] = None
            previous.unlink(missing_ok=True)
            self._save(state)
            return self._view(provider, record)

    def record_revoked(self, provider: str, revision: str) -> dict:
        self.initialize()
        if not REVISION.fullmatch(revision):
            raise ProviderSecretError("Use an exact credential revision from status.")
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            if revision in {record["activeRevision"], record["stagedRevision"]}:
                raise ProviderSecretError(
                    "A locally active or staged credential cannot be marked revoked."
                )
            if revision not in record["revokedRevisions"]:
                record["revokedRevisions"].append(revision)
                record["revokedRevisions"] = record["revokedRevisions"][-100:]
            self._save(state)
            return self._view(provider, record)


def verify_provider(provider: Provider, secret: bytes) -> tuple[str, str]:
    headers = {
        provider.header: provider.prefix + secret.decode("ascii"),
        "Accept": "application/json",
    }
    if provider.identity == "anthropic":
        headers["anthropic-version"] = "2023-06-01"
    connection = http.client.HTTPSConnection(
        provider.host, 443, timeout=10, context=ssl.create_default_context()
    )
    try:
        connection.request("GET", provider.path, headers=headers)
        response = connection.getresponse()
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            return "unavailable", "response_too_large"
        if 200 <= response.status < 300:
            return "verified", "provider_credential_check"
        if response.status in {401, 403}:
            return "rejected", "provider_rejected"
        return "unavailable", f"provider_http_{response.status}"
    except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
        return "unavailable", type(exc).__name__
    finally:
        connection.close()


def _secret_from_stdin() -> bytes:
    value = sys.stdin.buffer.read(MAX_SECRET_BYTES + 2)
    if value.endswith(b"\n"):
        value = value[:-1]
    if value.endswith(b"\r"):
        value = value[:-1]
    if len(value) > MAX_SECRET_BYTES:
        raise ProviderSecretError("Credential input exceeds 4096 bytes.")
    return value


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--directory", type=Path, required=True)
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("initialize")
    commands.add_parser("status")
    for name in (
        "stage",
        "import-active",
        "verify",
        "prepare",
        "commit",
        "rollback",
        "record-revoked",
    ):
        command = commands.add_parser(name)
        command.add_argument("provider", choices=sorted(PROVIDERS))
        if name in {"prepare", "commit", "rollback", "record-revoked"}:
            command.add_argument("revision")
    return result


def main(argv: list[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    store = SecretStore(arguments.directory)
    try:
        if arguments.command == "initialize":
            store.initialize()
            value = store.status()
        elif arguments.command == "status":
            value = store.status()
        elif arguments.command == "stage":
            value = store.stage(arguments.provider, _secret_from_stdin())
        elif arguments.command == "import-active":
            value = store.import_active(arguments.provider, _secret_from_stdin())
        elif arguments.command == "verify":
            value = store.verify(arguments.provider, verify_provider)
        elif arguments.command == "prepare":
            value = store.prepare_activation(arguments.provider, arguments.revision)
        elif arguments.command == "commit":
            value = store.commit_activation(arguments.provider, arguments.revision)
        elif arguments.command == "rollback":
            value = store.rollback_activation(arguments.provider, arguments.revision)
        else:
            value = store.record_revoked(arguments.provider, arguments.revision)
    except ProviderSecretError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(json.dumps(value, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
