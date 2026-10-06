import json
import subprocess

import pytest

from scripts.provider_control import ProviderControl
from scripts.provider_secrets import ProviderSecretError


def bridge(tmp_path, **kwargs):
    return ProviderControl(tmp_path, tmp_path / "source", "ubuntu", **kwargs)


def stage(control, **kwargs):
    return control.apply(
        {
            "provider": "openai",
            "operation": "stage",
            "secret": "synthetic-provider-key",
            "activeRevision": None,
            "stagedRevision": None,
            **kwargs,
        }
    )


def test_ui_and_cli_share_redacted_revisioned_state(tmp_path):
    control = bridge(tmp_path, verifier=lambda *_: ("verified", "synthetic_check"))
    saved = stage(control)
    current = saved["providers"][1]
    assert current["verificationStatus"] == "unverified"
    assert "synthetic-provider-key" not in json.dumps(saved)
    assert (
        control.store.status()["providers"][1]["stagedRevision"]
        == current["stagedRevision"]
    )
    verified = control.apply(
        {
            "provider": "openai",
            "operation": "verify",
            "revision": current["stagedRevision"],
        }
    )
    assert verified["providers"][1]["verificationStatus"] == "verified"
    assert current["stagedRevision"] == verified["providers"][1]["stagedRevision"]


def test_stale_stage_and_verify_cannot_change_another_credential(tmp_path):
    control = bridge(
        tmp_path, verifier=lambda *_: pytest.fail("must not send stale credential")
    )
    stage(control)
    with pytest.raises(ProviderSecretError, match="changed"):
        stage(control, secret="different-synthetic-key")
    with pytest.raises(ProviderSecretError, match="changed"):
        control.apply(
            {
                "provider": "openai",
                "operation": "verify",
                "revision": "credential_" + "a" * 32,
            }
        )
    assert control.store.staged_path("openai").read_bytes() == b"synthetic-provider-key"


def test_discard_is_revision_bound_and_preserves_active_key(tmp_path):
    control = bridge(tmp_path)
    control.store.import_active("openai", b"synthetic-active-key")
    active = control.store.status()["providers"][1]["activeRevision"]
    saved = stage(control, activeRevision=active)
    revision = saved["providers"][1]["stagedRevision"]
    control.apply({"provider": "openai", "operation": "discard", "revision": revision})
    assert control.store.active_path("openai").read_bytes() == b"synthetic-active-key"
    assert not control.store.staged_path("openai").exists()
    with pytest.raises(ProviderSecretError):
        control.apply(
            {"provider": "openai", "operation": "discard", "revision": revision}
        )


@pytest.mark.parametrize(
    "value",
    [
        {"provider": "arbitrary", "operation": "stage"},
        {
            "provider": "openai",
            "operation": "execute",
            "revision": "credential_" + "a" * 32,
        },
        {"provider": "openai", "operation": "recover", "revision": "--help"},
        {
            "provider": "openai",
            "operation": "verify",
            "revision": "credential_" + "a" * 32,
            "url": "https://evil.test",
        },
        {
            "provider": "openai",
            "operation": "record-revoked",
            "revision": "credential_" + "a" * 32,
            "issuerConfirmed": False,
        },
    ],
)
def test_no_arbitrary_commands_or_endpoints(tmp_path, value):
    control = bridge(
        tmp_path, runner=lambda *_args, **_kwargs: pytest.fail("no host invocation")
    )
    with pytest.raises(ProviderSecretError):
        control.apply(value)


def test_activation_invokes_only_existing_cli_without_secret_arguments(tmp_path):
    seen = []

    def runner(command, **kwargs):
        seen.append((command, kwargs))
        return subprocess.CompletedProcess(command, 1)

    control = bridge(tmp_path, runner=runner)
    saved = stage(control)
    revision = saved["providers"][1]["stagedRevision"]
    with pytest.raises(ProviderSecretError, match="inspect credential status"):
        control.apply(
            {"provider": "openai", "operation": "activate", "revision": revision}
        )
    command, kwargs = seen[0]
    assert command[-4:] == ["providers", "activate", "openai", revision]
    assert "synthetic-provider-key" not in json.dumps(command)
    assert kwargs["stdout"] == subprocess.DEVNULL
    assert kwargs["stderr"] == subprocess.DEVNULL
    assert kwargs["env"]["CONKER_DEPLOY_DIR"] == str(tmp_path.resolve())


@pytest.mark.parametrize("name", [".conker-recovery.json", ".conker-backup.lock"])
def test_recovery_hold_blocks_browser_writes(tmp_path, name):
    (tmp_path / name).touch()
    control = bridge(tmp_path)
    with pytest.raises(ProviderSecretError, match="finish first"):
        stage(control)


def test_interruption_never_includes_subprocess_or_provider_details(tmp_path):
    def interrupted(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(
            "private-command", 180, output=b"synthetic-private-body"
        )

    control = bridge(tmp_path, runner=interrupted)
    with pytest.raises(ProviderSecretError) as error:
        control.apply(
            {
                "provider": "openrouter",
                "operation": "recover",
                "revision": "credential_" + "a" * 32,
            }
        )
    assert "synthetic-private-body" not in str(error.value)


def test_failed_runtime_recovery_keeps_transition_and_blocks_verification(tmp_path):
    control = bridge(tmp_path, verifier=lambda *_: ("verified", "synthetic_check"))
    control.store.import_active("openai", b"synthetic-old-key")
    active = control.store.status()["providers"][1]["activeRevision"]
    saved = stage(control, activeRevision=active)
    revision = saved["providers"][1]["stagedRevision"]
    control.store.verify("openai", control.verifier, revision=revision)
    control.store.prepare_activation("openai", revision)
    with pytest.raises(ProviderSecretError, match="pending activation"):
        control.store.verify("openai", control.verifier, revision=revision)
    with pytest.raises(ProviderSecretError, match="not been restored"):
        control.store.finish_rollback("openai", revision)
    restored = control.store.rollback_activation("openai", revision, hold=True)
    assert restored["activationPending"] is True
    assert control.store.active_path("openai").read_bytes() == b"synthetic-old-key"
    assert control.store.previous_path("openai").is_file()
    assert (
        control.store.finish_rollback("openai", revision)["activationPending"] is False
    )


@pytest.mark.skipif(
    __import__("os").name != "posix", reason="Unix socket requires Linux"
)
def test_private_unix_socket_roundtrip(tmp_path):
    import socketserver
    import threading

    import httpx

    from scripts.provider_control import handler

    control = bridge(tmp_path)
    with socketserver.UnixStreamServer(
        str(tmp_path / "control.sock"), handler(control)
    ) as server:
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with httpx.Client(
                transport=httpx.HTTPTransport(uds=str(tmp_path / "control.sock"))
            ) as client:
                status = client.get("http://conker-host/providers")
                assert (
                    status.status_code == 200
                    and status.json()["secretsIncluded"] is False
                )
                assert (
                    client.post(
                        "http://conker-host/providers", json={"operation": "shell"}
                    ).status_code
                    == 409
                )
                assert (
                    client.get("http://conker-host/providers?secret=test").status_code
                    == 404
                )
        finally:
            server.shutdown()
            worker.join(timeout=5)
