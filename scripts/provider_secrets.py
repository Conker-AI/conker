#!/usr/bin/env python3
"""Host-only provider credential staging, verification, activation and recovery."""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import secrets
import sys
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

# Run as a script the scripts directory is on the path; imported, it is the scripts package.
try:
    from scripts.provider_records import (
        BASIS,
        PROVIDERS,
        REVISION,
        Provider,
        ProviderSecretError,
        empty_record,
        now,
        released_providers,
        validate_record,
        verify_provider,
    )
except ModuleNotFoundError:
    from provider_records import (
        BASIS,
        PROVIDERS,
        REVISION,
        Provider,
        ProviderSecretError,
        empty_record,
        now,
        released_providers,
        validate_record,
        verify_provider,
    )

SCHEMA = 1
MAX_SECRET_BYTES = 4096
MAX_STATE_BYTES = 262144
MAX_VERIFICATION_AGE = timedelta(minutes=15)
MAX_CLOCK_SKEW = timedelta(minutes=5)


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
            raise ProviderSecretError("Choose a provider: " + ", ".join(PROVIDERS) + ".")
        saved = state["providers"].setdefault(provider, empty_record())
        if set(saved) != set(empty_record()):
            raise ProviderSecretError(
                "Provider credential record has an unsupported shape."
            )
        validate_record(saved)
        return saved

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

    def stage(
        self, provider: str, secret: bytes, *, expected: tuple | None = None
    ) -> dict:
        self.initialize()
        text = self._validate_secret(secret)
        secret = text.encode("ascii")
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            if expected is not None and expected != (
                record["activeRevision"],
                record["stagedRevision"],
            ):
                raise ProviderSecretError(
                    "Provider credentials changed; refresh before continuing."
                )
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
        self,
        provider: str,
        verifier: Callable[[Provider, bytes], tuple[str, str]],
        *,
        revision: str | None = None,
    ) -> dict:
        self.initialize()
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            if record["pendingActivation"] is not None:
                raise ProviderSecretError(
                    "Recover the pending activation before verification."
                )
            if revision is not None and record["stagedRevision"] != revision:
                raise ProviderSecretError(
                    "The staged credential changed; refresh before verification."
                )
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

    def rollback_activation(
        self, provider: str, revision: str, *, hold: bool = False
    ) -> dict:
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
            if not hold:
                record["pendingActivation"] = None
                previous.unlink(missing_ok=True)
            self._save(state)
            return self._view(provider, record)

    def finish_rollback(self, provider: str, revision: str) -> dict:
        self.initialize()
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            pending = record["pendingActivation"]
            if not isinstance(pending, dict) or pending.get("revision") != revision:
                raise ProviderSecretError("No matching activation is pending.")
            previous = self.previous_path(provider)
            expected = (
                self._read_secret(previous) if pending["previousRevision"] else b""
            )
            if (
                self._read_secret(self.active_path(provider), allow_empty=True)
                != expected
            ):
                raise ProviderSecretError(
                    "The previous credential has not been restored."
                )
            record["pendingActivation"] = None
            previous.unlink(missing_ok=True)
            self._save(state)
            return self._view(provider, record)

    def discard(self, provider: str, revision: str) -> dict:
        self.initialize()
        with self.locked():
            state = self._load()
            record = self._provider(state, provider)
            if (
                record["pendingActivation"] is not None
                or record["stagedRevision"] != revision
            ):
                raise ProviderSecretError(
                    "Discard only the exact staged key with no pending activation."
                )
            self.staged_path(provider).unlink(missing_ok=True)
            record.update(
                {
                    "stagedRevision": None,
                    "stagedAt": None,
                    "verificationStatus": None,
                    "verificationBasis": None,
                    "verifiedAt": None,
                }
            )
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
    # --release VERSIONS_ENV lists only the providers that release's Pi reads.
    commands.add_parser("status").add_argument("--release", type=Path)
    for name in (
        "stage",
        "import-active",
        "verify",
        "prepare",
        "commit",
        "rollback",
        "complete-rollback",
        "discard",
        "record-revoked",
    ):
        command = commands.add_parser(name)
        command.add_argument("provider", choices=sorted(PROVIDERS))
        if name in {
            "prepare",
            "commit",
            "rollback",
            "complete-rollback",
            "discard",
            "record-revoked",
        }:
            command.add_argument("revision")
        if name == "rollback":
            command.add_argument("--hold", action="store_true")
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
            if arguments.release is not None:
                released = released_providers(arguments.release)
                value["providers"] = [row for row in value["providers"] if row["id"] in released]
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
            value = store.rollback_activation(
                arguments.provider, arguments.revision, hold=arguments.hold
            )
        elif arguments.command == "complete-rollback":
            value = store.finish_rollback(arguments.provider, arguments.revision)
        elif arguments.command == "discard":
            value = store.discard(arguments.provider, arguments.revision)
        else:
            value = store.record_revoked(arguments.provider, arguments.revision)
    except ProviderSecretError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(json.dumps(value, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
