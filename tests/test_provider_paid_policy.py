import json
import subprocess

import pytest

from scripts.provider_paid_policy import PaidPolicy
from scripts.provider_secrets import ProviderSecretError


def policy(tmp_path, *, fail_first=False, fail_always=False):
    state = tmp_path / "state"
    state.mkdir()
    (state / "pi.env").write_text(
        "PI_ALLOW_PAID_MODELS=false\nUNCHANGED=synthetic-private-key\n"
    )
    seen = []
    restarts = [0]

    def runner(command, **kwargs):
        seen.append(command)
        if "--force-recreate" in command and command[-1] == "pi":
            restarts[0] += 1
            if fail_always or fail_first and restarts[0] == 1:
                return subprocess.CompletedProcess(
                    command, 1, stdout=b"private failure"
                )
        output = (
            b"pi\ndecisions\n"
            if command[-2:] == ["config", "--services"]
            else (
                b"on"
                if "PI_ALLOW_PAID_MODELS=true" in (state / "pi.env").read_text()
                else b"off"
            )
        )
        return subprocess.CompletedProcess(command, 0, stdout=output)

    return PaidPolicy(tmp_path, "ubuntu", runner=runner), seen


def test_explicit_paid_opt_in_is_cas_checked_and_runtime_verified(tmp_path):
    value, seen = policy(tmp_path)
    assert value.status()["paidAllowed"] is False
    assert value.apply(True, False) == {
        "paidAllowed": True,
        "policyRecoveryRequired": False,
    }
    assert "UNCHANGED=synthetic-private-key" in value.environment.read_text()
    assert any(command[-1] == "decisions" for command in seen)
    assert any(command[-3] == "python" for command in seen)
    with pytest.raises(ProviderSecretError, match="changed"):
        value.apply(False, False)
    assert "synthetic-private-key" not in json.dumps(value.status())


def test_failed_opt_in_restores_previous_permission(tmp_path):
    value, _ = policy(tmp_path, fail_first=True)
    with pytest.raises(ProviderSecretError, match="previous policy was restored"):
        value.apply(True, False)
    assert value.status() == {"paidAllowed": False, "policyRecoveryRequired": False}


def test_failed_rollback_retains_durable_recovery_hold(tmp_path):
    value, _ = policy(tmp_path, fail_always=True)
    with pytest.raises(ProviderSecretError, match="recovery is required"):
        value.apply(True, False)
    assert value.status()["policyRecoveryRequired"] is True
    assert "synthetic-private-key" not in value.marker.read_text()
    with pytest.raises(ProviderSecretError, match="Recover"):
        value.apply(True, False)
    # A later recovery must not undo an unrelated operator environment edit.
    value.environment.write_text(
        value.environment.read_text() + "NEW_SETTING=preserved\n"
    )
    value.runner = lambda command, **kwargs: subprocess.CompletedProcess(
        command, 0, stdout=b"off"
    )
    assert value.recover()["policyRecoveryRequired"] is False
    assert "NEW_SETTING=preserved" in value.environment.read_text()


def test_bad_types_and_ambiguous_source_never_restart(tmp_path):
    value, seen = policy(tmp_path)
    with pytest.raises(ProviderSecretError):
        value.apply("true", False)
    value.environment.write_text(
        "PI_ALLOW_PAID_MODELS=true\nPI_ALLOW_PAID_MODELS=false\n"
    )
    with pytest.raises(ProviderSecretError, match="ambiguous"):
        value.status()
    assert seen == []
