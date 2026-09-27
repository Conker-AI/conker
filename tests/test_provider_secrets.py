from __future__ import annotations

import json
import stat
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from scripts.provider_secrets import ProviderSecretError, SecretStore


def test_secret_lifecycle_is_revision_bound_and_projection_is_redacted(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    staged = store.stage("openai", b"synthetic-provider-key")
    revision = staged["stagedRevision"]
    assert staged["verificationStatus"] == "unverified"
    assert "synthetic" not in json.dumps(staged)

    verified = store.verify(
        "openai", lambda provider, secret: ("verified", "synthetic_check")
    )
    assert verified["stagedRevision"] == revision
    assert verified["verificationStatus"] == "verified"
    assert store.staged_path("openai").read_bytes() == b"synthetic-provider-key"

    prepared = store.prepare_activation("openai", revision)
    assert prepared["activationPending"] is True
    assert store.active_path("openai").read_bytes() == b"synthetic-provider-key"
    committed = store.commit_activation("openai", revision)
    assert committed["activeRevision"] == revision
    assert committed["stagedRevision"] is None
    assert committed["activationPending"] is False
    assert not store.staged_path("openai").exists()

    projection = store.status()
    assert projection["secretsIncluded"] is False
    assert "synthetic-provider-key" not in json.dumps(projection)


def test_legacy_import_never_replaces_an_existing_managed_key(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    imported = store.import_active("openrouter", b"first-legacy-key")
    repeated = store.import_active("openrouter", b"stale-env-key")

    assert repeated["activeRevision"] == imported["activeRevision"]
    assert store.active_path("openrouter").read_bytes() == b"first-legacy-key"


def test_failed_activation_restores_exact_previous_key_and_keeps_stage(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    first = store.stage("anthropic", b"first-synthetic-key")
    store.verify("anthropic", lambda provider, secret: ("verified", "synthetic_check"))
    store.prepare_activation("anthropic", first["stagedRevision"])
    store.commit_activation("anthropic", first["stagedRevision"])

    second = store.stage("anthropic", b"replacement-synthetic-key")
    store.verify("anthropic", lambda provider, secret: ("verified", "synthetic_check"))
    store.prepare_activation("anthropic", second["stagedRevision"])
    assert store.active_path("anthropic").read_bytes() == b"replacement-synthetic-key"
    restored = store.rollback_activation("anthropic", second["stagedRevision"])

    assert restored["activeRevision"] == first["stagedRevision"]
    assert restored["stagedRevision"] == second["stagedRevision"]
    assert restored["verificationStatus"] == "verified"
    assert store.active_path("anthropic").read_bytes() == b"first-synthetic-key"
    assert store.staged_path("anthropic").read_bytes() == b"replacement-synthetic-key"


def test_unverified_conflicting_and_pending_mutations_fail_closed(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    staged = store.stage("openrouter", b"synthetic-openrouter-key")
    with pytest.raises(ProviderSecretError, match="verified staged"):
        store.prepare_activation("openrouter", staged["stagedRevision"])
    store.verify("openrouter", lambda provider, secret: ("verified", "synthetic_check"))
    with pytest.raises(ProviderSecretError, match="exact verified"):
        store.prepare_activation("openrouter", "credential_" + "0" * 32)
    store.prepare_activation("openrouter", staged["stagedRevision"])
    with pytest.raises(ProviderSecretError, match="pending activation"):
        store.stage("openrouter", b"another-synthetic-key")
    with pytest.raises(ProviderSecretError, match="already pending"):
        store.prepare_activation("openrouter", staged["stagedRevision"])


def test_stale_verification_cannot_be_activated(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    staged = store.stage("openrouter", b"synthetic-openrouter-key")
    store.verify("openrouter", lambda provider, secret: ("verified", "synthetic_check"))
    state = json.loads(store.state_path.read_text(encoding="utf-8"))
    state["providers"]["openrouter"]["verifiedAt"] = (
        datetime.now(UTC) - timedelta(minutes=16)
    ).isoformat()
    store.state_path.write_text(json.dumps(state), encoding="utf-8")

    status = next(
        item for item in store.status()["providers"] if item["id"] == "openrouter"
    )
    assert status["verificationStale"] is True
    with pytest.raises(ProviderSecretError, match="Verify the staged credential again"):
        store.prepare_activation("openrouter", staged["stagedRevision"])


def test_verification_basis_cannot_reflect_provider_or_secret_text(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    store.stage("openrouter", b"synthetic-openrouter-key")
    with pytest.raises(ProviderSecretError, match="unsupported basis"):
        store.verify(
            "openrouter",
            lambda provider, secret: ("rejected", "synthetic-openrouter-key denied"),
        )
    status = next(
        item for item in store.status()["providers"] if item["id"] == "openrouter"
    )
    assert status["verificationStatus"] == "unverified"


@pytest.mark.parametrize(
    "value",
    [b"short", b"contains space", b"line\nbreak", b"\xff" * 12, b"x" * 4097],
)
def test_invalid_secret_input_never_changes_state(tmp_path: Path, value: bytes):
    store = SecretStore(tmp_path / "providers")
    with pytest.raises(ProviderSecretError):
        store.stage("openai", value)
    assert store.status()["providers"][1]["stagedRevision"] is None


def test_revocation_is_metadata_only_and_refuses_live_revisions(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    staged = store.stage("openai", b"synthetic-provider-key")
    with pytest.raises(ProviderSecretError, match="active or staged"):
        store.record_revoked("openai", staged["stagedRevision"])
    old = "credential_" + "a" * 32
    saved = store.record_revoked("openai", old)
    assert saved["revokedRevisions"] == [old]


def test_posix_secret_files_are_owner_only(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    store.stage("openai", b"synthetic-provider-key")
    if stat.S_IMODE(store.directory.stat().st_mode) != 0o700:
        pytest.skip("host filesystem does not expose POSIX mode bits")
    assert stat.S_IMODE(store.directory.stat().st_mode) == 0o700
    assert stat.S_IMODE(store.state_path.stat().st_mode) == 0o600
    assert stat.S_IMODE(store.staged_path("openai").stat().st_mode) == 0o600


@pytest.mark.parametrize(
    "mutation",
    [
        lambda record: record.update(activeRevision="credential_not-a-revision"),
        lambda record: record.update(
            verificationStatus="verified", verificationBasis="check"
        ),
        lambda record: record.update(revokedRevisions=["credential_" + "A" * 32]),
        lambda record: record.update(
            pendingActivation={"revision": "credential_" + "a" * 32}
        ),
    ],
)
def test_status_fails_closed_on_malformed_saved_records(tmp_path: Path, mutation):
    store = SecretStore(tmp_path / "providers")
    store.initialize()
    state = json.loads(store.state_path.read_text(encoding="utf-8"))
    state["providers"]["openai"] = {
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
    mutation(state["providers"]["openai"])
    store.state_path.write_text(json.dumps(state), encoding="utf-8")

    with pytest.raises(ProviderSecretError):
        store.status()


def test_state_and_secret_symlinks_fail_closed(tmp_path: Path):
    store = SecretStore(tmp_path / "providers")
    store.initialize()
    target = tmp_path / "outside"
    target.write_text("synthetic-provider-key", encoding="ascii")
    staged = store.stage("openai", b"synthetic-provider-key")
    store.verify("openai", lambda provider, secret: ("verified", "synthetic_check"))
    store.staged_path("openai").unlink()
    try:
        store.staged_path("openai").symlink_to(target)
    except OSError:
        pytest.skip("host does not permit test symlinks")

    with pytest.raises(ProviderSecretError, match="not regular"):
        store.prepare_activation("openai", staged["stagedRevision"])
