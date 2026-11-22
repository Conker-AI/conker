"""install.sh's secrets and settings: what it generates, what it keeps when it runs again.

Split from test_installer.py, whose fixtures these use."""

from __future__ import annotations

import json
import stat

from tests.test_installer import (  # noqa: F401
    env_values,
    install,
    needs_docker,
    pytestmark,
)

SECRETS = [
    "CONKER_ADMIN_KEY",
    "TOOLGATE_ADMIN_KEY",
    "TOOLGATE_VAULT_SALT",
    "TOOLGATE_CALLBACK_SECRET",
    "MEMORYGATE_ADMIN_KEY",
    "MEMORYGATE_READ_KEY",
    "MEMORYGATE_DB_PASSWORD",
    "SYSTEMGATE_ADMIN_KEY",
    "EMBEDDINGS_KEY",
    "PI_TOOLGATE_KEY",
    "PI_GATEWAY_KEY",
    "GATEWAY_PI_OWNER_KEY",
    "GATEWAY_TOOLGATE_OWNER_KEY",
    "MEMORYGATE_INGEST_KEY",
]


@needs_docker
def test_every_secret_is_generated_and_none_is_requested(install):
    """The rule is 'never ask a person to invent a secret'. Ten services need
    keys; a human should be asked for exactly none of them."""
    result = install("--yes", "--dry-run")
    values = env_values(install.env_file)

    for name in SECRETS:
        assert name in values, f"{name} was never written"
        assert len(values[name]) >= 20, f"{name} is too short to be a key: {values[name]!r}"

    # No two services share a key: one compromise must not be all of them.
    generated = [values[n] for n in SECRETS]
    assert len(set(generated)) == len(generated), "two services were given the same secret"

    lowered = result.stdout.lower()
    assert "paste" not in lowered.split("openrouter")[0]
    assert "enter a key" not in lowered and "choose a password" not in lowered


@needs_docker
def test_the_toolgate_key_has_the_shape_toolgate_demands(install):
    """ToolGate rejects a bootstrap key that is not `tgx_` and >= 20 chars. A
    generic random string here would fail at container start instead."""
    install("--yes", "--dry-run")
    key = env_values(install.env_file)["PI_TOOLGATE_KEY"]
    assert key.startswith("tgx_") and len(key) >= 20


@needs_docker
def test_keys_that_must_have_a_shape_have_it(install):
    """Three services demand a particular shape and refuse anything else, and
    each one was found the same way: not here, but minutes later, as a stack
    trace at container start. All three are now made with the shape."""
    install("--yes", "--dry-run")
    values = env_values(install.env_file)

    assert values["PI_TOOLGATE_KEY"].startswith("tgx_")
    assert len(values["PI_TOOLGATE_KEY"]) >= 20

    assert values["MEMORYGATE_READ_KEY"].startswith("mg_read_")
    assert len(values["MEMORYGATE_READ_KEY"]) >= 24

    # ToolGate reads this with bytes.fromhex to derive the vault key. Random is
    # not enough; it has to be hex.
    salt = values["TOOLGATE_VAULT_SALT"]
    int(salt, 16)
    assert len(salt) >= 32, f"salt is only {len(salt)} hex chars"


@needs_docker
def test_a_wrongly_shaped_key_from_an_older_install_is_replaced(install):
    """Keeping an existing key is right, except when the existing key is the
    bug. A base64 salt written before the hex requirement was known would make
    the vault permanently unreadable."""
    install("--yes", "--dry-run")
    body = install.env_file.read_text()
    install.env_file.write_text(
        body.replace(
            f"TOOLGATE_VAULT_SALT={env_values(install.env_file)['TOOLGATE_VAULT_SALT']}",
            "TOOLGATE_VAULT_SALT=not+hex/at+all==",
        ).replace(
            f"MEMORYGATE_READ_KEY={env_values(install.env_file)['MEMORYGATE_READ_KEY']}",
            "MEMORYGATE_READ_KEY=missing-the-prefix",
        )
    )

    install("--yes", "--dry-run")
    values = env_values(install.env_file)

    int(values["TOOLGATE_VAULT_SALT"], 16)
    assert values["MEMORYGATE_READ_KEY"].startswith("mg_read_")


@needs_docker
def test_the_env_file_is_not_readable_by_anyone_else(install):
    install("--yes", "--dry-run")
    mode = stat.S_IMODE(install.env_file.stat().st_mode)
    assert mode == 0o600, f"expected 600, got {mode:o}"


@needs_docker
def test_running_twice_repairs_rather_than_duplicates(install):
    """Regenerating keys on a re-run would lock the owner out of their own
    encrypted vault and their own database."""
    install("--yes", "--dry-run")
    first = env_values(install.env_file)
    install("--yes", "--dry-run")
    second = env_values(install.env_file)

    for name in SECRETS:
        assert first[name] == second[name], f"{name} was regenerated on the second run"

    body = install.env_file.read_text()
    for name in SECRETS:
        assert body.count(f"{name}=") == 1, f"{name} was written twice"


@needs_docker
def test_gateway_key_and_owner_credential_survive_installer_rerun(install):
    import hashlib

    install("--yes", "--dry-run")
    first = env_values(install.env_file)
    assert (
        first["PI_GATEWAY_KEY_SHA256"]
        == hashlib.sha256(first["PI_GATEWAY_KEY"].encode()).hexdigest()
    )
    assert (
        first["PI_OWNER_KEY_SHA256"]
        == hashlib.sha256(first["GATEWAY_PI_OWNER_KEY"].encode()).hexdigest()
    )
    assert first["GATEWAY_ORIGIN"] == "https://localhost:8050"
    assert (
        first["TOOLGATE_OWNER_KEY_SHA256"]
        == hashlib.sha256(first["GATEWAY_TOOLGATE_OWNER_KEY"].encode()).hexdigest()
    )
    install("--yes", "--dry-run")
    second = env_values(install.env_file)
    assert second["PI_GATEWAY_KEY"] == first["PI_GATEWAY_KEY"]
    assert second["GATEWAY_PI_OWNER_KEY"] == first["GATEWAY_PI_OWNER_KEY"]
    assert second["GATEWAY_TOOLGATE_OWNER_KEY"] == first["GATEWAY_TOOLGATE_OWNER_KEY"]


@needs_docker
def test_optional_decision_adapter_settings_survive_installer_rerun(install):
    install("--yes", "--dry-run")
    body = install.env_file.read_text()
    body = body.replace("PI_DECISION_URL=", "PI_DECISION_URL=https://decisions.test")
    body = body.replace("PI_DECISION_KEY=", "PI_DECISION_KEY=private-decision-key")
    install.env_file.write_text(body)

    install("--yes", "--dry-run")
    values = env_values(install.env_file)
    assert values["PI_DECISION_URL"] == "https://decisions.test"
    assert values["PI_DECISION_KEY"] == "private-decision-key"


@needs_docker
def test_hosted_provider_settings_survive_installer_rerun(install):
    install("--yes", "--dry-run")
    body = install.env_file.read_text()
    body = body.replace("PI_ALLOW_PAID_MODELS=", "PI_ALLOW_PAID_MODELS=true")
    body += (
        "\nOPENROUTER_KEY=preserved-openrouter-key"
        "\nPI_OPENAI_KEY=preserved-openai-key"
        "\nPI_ANTHROPIC_KEY=preserved-anthropic-key\n"
    )
    install.env_file.write_text(body)

    install("--yes", "--dry-run")
    values = env_values(install.env_file)
    assert values["PI_ALLOW_PAID_MODELS"] == "true"
    assert "OPENROUTER_KEY" not in values
    assert "PI_OPENAI_KEY" not in values
    assert "PI_ANTHROPIC_KEY" not in values
    directory = install.dir / ".conker" / "provider-secrets"
    assert (directory / "openrouter.key").read_text() == "preserved-openrouter-key"
    assert (directory / "openai.key").read_text() == "preserved-openai-key"
    assert (directory / "anthropic.key").read_text() == "preserved-anthropic-key"
    state = json.loads((directory / "state.json").read_text())
    assert all(
        state["providers"][name]["activeRevision"] for name in ("openrouter", "openai", "anthropic")
    )


@needs_docker
def test_speech_settings_and_mounted_key_survive_installer_rerun(install):
    install("--yes", "--dry-run")
    body = install.env_file.read_text()
    replacements = {
        "PI_SPEECH_URL=": "PI_SPEECH_URL=https://speech.test/v1",
        "PI_STT_MODEL=": "PI_STT_MODEL=whisper-1",
        "PI_TTS_MODEL=": "PI_TTS_MODEL=kokoro",
        "PI_TTS_VOICE=": "PI_TTS_VOICE=af_heart",
    }
    for before, after in replacements.items():
        body = body.replace(before, after)
    install.env_file.write_text(body)
    key = install.dir / ".conker/speech/speech.key"
    key.write_text("preserved-speech-key", encoding="ascii")

    install("--yes", "--dry-run")

    values = env_values(install.env_file)
    assert values["PI_SPEECH_URL"] == "https://speech.test/v1"
    assert values["PI_STT_MODEL"] == "whisper-1"
    assert values["PI_TTS_MODEL"] == "kokoro"
    assert values["PI_TTS_VOICE"] == "af_heart"
    assert key.read_text(encoding="ascii") == "preserved-speech-key"


@needs_docker
def test_subscription_socket_directory_is_private_before_docker_mount(install):
    install("--yes", "--dry-run")
    directory = install.dir / ".conker/chatgpt-inference"
    assert directory.is_dir() and not directory.is_symlink()
    assert directory.stat().st_mode & 0o777 == 0o700


@needs_docker
def test_a_damaged_env_is_repaired_without_losing_what_survived(install):
    install("--yes", "--dry-run")
    kept = env_values(install.env_file)["CONKER_ADMIN_KEY"]
    # Someone deletes a line. Re-running should replace only that one.
    body = install.env_file.read_text()
    install.env_file.write_text(
        "\n".join(line for line in body.splitlines() if not line.startswith("EMBEDDINGS_KEY="))
    )

    install("--yes", "--dry-run")
    values = env_values(install.env_file)

    assert values["CONKER_ADMIN_KEY"] == kept, "an untouched key was regenerated"
    assert len(values["EMBEDDINGS_KEY"]) >= 20, "the missing key was not restored"
