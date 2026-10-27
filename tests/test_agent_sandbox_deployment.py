"""The agent sandbox overlay stays deferred until its isolated services are accepted."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def load_compose(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


# --- sandbox-runner hardening ---

def test_sandbox_runner_is_networkless_read_only_and_hardened():
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")
    sr = overlay["services"]["sandbox-runner"]

    assert sr["network_mode"] == "none"
    assert sr["read_only"] is True
    assert sr["init"] is True
    assert sr["cap_drop"] == ["ALL"]
    assert sr["security_opt"] == ["no-new-privileges:true"]
    assert sr["user"] == "65533:65533"
    assert sr["pids_limit"] is not None
    assert sr["mem_limit"] is not None
    assert sr.get("ports") is None
    assert sr.get("networks") is None
    assert sr.get("env_file") is None
    assert sr.get("secrets") is None


def test_sandbox_runner_volumes_are_exactly_docker_socket_control_and_workspaces():
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")
    sr = overlay["services"]["sandbox-runner"]

    assert sr["volumes"] == [
        "/var/run/docker.sock:/var/run/docker.sock",
        "sandbox_control:/run/conker-sandbox",
        "agent_workspaces:/workspaces:nocopy",
    ]


def test_sandbox_runner_environment_keys_and_no_secret_references():
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")
    sr = overlay["services"]["sandbox-runner"]
    env = sr["environment"]

    assert set(env.keys()) == {
        "SANDBOX_IMAGE",
        "SANDBOX_CLIENT_UIDS",
        "SANDBOX_WORKSPACES_VOLUME",
        "SANDBOX_PROXY_VOLUME",
    }

    forbidden = {"KEY", "TOKEN", "SECRET", "PASSWORD"}
    for key, value in env.items():
        for word in forbidden:
            assert word not in value, (
                f"sandbox-runner env {key} references a variable containing {word}: {value}"
            )


# --- package-proxy hardening ---

def test_package_proxy_is_on_sandbox_egress_only_and_hardened():
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")
    pp = overlay["services"]["package-proxy"]

    assert pp["networks"] == ["sandbox_egress"]
    assert pp["user"] == "65532:65532"
    assert pp["read_only"] is True
    assert pp["init"] is True
    assert pp["cap_drop"] == ["ALL"]
    assert pp["security_opt"] == ["no-new-privileges:true"]
    assert pp["volumes"] == ["sandbox_proxy:/run/conker-proxy"]
    assert pp.get("ports") is None
    assert pp.get("env_file") is None
    assert pp.get("secrets") is None


def test_package_proxy_environment_is_only_client_uids():
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")
    pp = overlay["services"]["package-proxy"]

    assert set(pp["environment"].keys()) == {"PROXY_CLIENT_UIDS"}


# --- cross-compose isolation ---

def test_only_sandbox_runner_mounts_docker_socket():
    base = load_compose(ROOT / "docker-compose.yml")
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")

    for name, svc in base["services"].items():
        for vol in svc.get("volumes", []):
            assert "/var/run/docker.sock" not in str(vol), (
                f"{name} in docker-compose.yml mounts the Docker socket"
            )

    for name, svc in overlay["services"].items():
        if name == "sandbox-runner":
            continue
        for vol in svc.get("volumes", []):
            assert "/var/run/docker.sock" not in str(vol), (
                f"{name} in sandbox overlay mounts the Docker socket"
            )


def test_only_toolgate_and_sandbox_runner_mount_sandbox_control():
    base = load_compose(ROOT / "docker-compose.yml")
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")

    for name, svc in base["services"].items():
        for vol in svc.get("volumes", []):
            assert "sandbox_control" not in str(vol), (
                f"{name} in docker-compose.yml mounts sandbox_control"
            )

    for name, svc in overlay["services"].items():
        if name in ("toolgate", "sandbox-runner"):
            continue
        for vol in svc.get("volumes", []):
            assert "sandbox_control" not in str(vol), (
                f"{name} in sandbox overlay mounts sandbox_control"
            )


def test_only_sandbox_runner_mounts_agent_workspaces():
    base = load_compose(ROOT / "docker-compose.yml")
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")

    for name, svc in base["services"].items():
        for vol in svc.get("volumes", []):
            assert "agent_workspaces" not in str(vol), (
                f"{name} in docker-compose.yml mounts agent_workspaces"
            )

    for name, svc in overlay["services"].items():
        if name == "sandbox-runner":
            continue
        for vol in svc.get("volumes", []):
            assert "agent_workspaces" not in str(vol), (
                f"{name} in sandbox overlay mounts agent_workspaces"
            )


def test_no_service_except_package_proxy_is_on_sandbox_egress():
    base = load_compose(ROOT / "docker-compose.yml")
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")

    for name, svc in base["services"].items():
        nets = svc.get("networks", [])
        if isinstance(nets, dict):
            nets = list(nets.keys())
        assert "sandbox_egress" not in nets, (
            f"{name} in docker-compose.yml is on sandbox_egress"
        )

    for name, svc in overlay["services"].items():
        if name == "package-proxy":
            continue
        nets = svc.get("networks", [])
        if isinstance(nets, dict):
            nets = list(nets.keys())
        assert "sandbox_egress" not in nets, (
            f"{name} in sandbox overlay is on sandbox_egress"
        )


def test_sandbox_services_are_on_neither_conker_net_nor_owner_control():
    overlay = load_compose(ROOT / "docker-compose.sandbox.yml")

    for name in ("sandbox-runner", "package-proxy"):
        svc = overlay["services"][name]
        nets = svc.get("networks", [])
        if isinstance(nets, dict):
            nets = list(nets.keys())
        assert "conker_net" not in nets, f"{name} is on conker_net"
        assert "owner_control" not in nets, f"{name} is on owner_control"


# --- hardening in docker-compose.yml ---

def test_toolgate_has_cap_drop_all_read_only_tmpfs_and_no_cap_add():
    base = load_compose(ROOT / "docker-compose.yml")
    tg = base["services"]["toolgate"]

    assert tg["cap_drop"] == ["ALL"]
    assert tg["read_only"] is True
    assert tg.get("cap_add") is None
    assert any("/tmp" in str(t) for t in tg.get("tmpfs", [])), (
        "toolgate has no /tmp tmpfs"
    )


def test_memorygate_has_cap_drop_all_dac_override_read_only_and_tmpfs():
    base = load_compose(ROOT / "docker-compose.yml")
    mg = base["services"]["memorygate"]

    assert mg["cap_drop"] == ["ALL"]
    assert mg["cap_add"] == ["DAC_OVERRIDE"]
    assert mg["read_only"] is True
    assert any("/tmp" in str(t) for t in mg.get("tmpfs", [])), (
        "memorygate has no /tmp tmpfs"
    )


# --- launcher and installer source checks ---

def test_launcher_and_installer_select_overlay_only_for_active_sandbox():
    installer = (ROOT / "install.sh").read_text(encoding="utf-8")
    launcher = (ROOT / "conker").read_text(encoding="utf-8")

    for source, name in ((installer, "install.sh"), (launcher, "conker")):
        assert "AGENT_SANDBOX_STATE=active" in source, (
            f"{name} does not check AGENT_SANDBOX_STATE=active"
        )
        assert "docker-compose.sandbox.yml" in source, (
            f"{name} does not include docker-compose.sandbox.yml"
        )


# --- release manifest cases ---

sys.path.insert(0, str(ROOT / "scripts"))
from release_manifest import ManifestError, parse_env, validate_manifest

MANIFEST = ROOT / "versions.env"


def test_deferred_sandbox_with_an_image_fails():
    values = parse_env(MANIFEST)
    values["AGENT_SANDBOX_STATE"] = "deferred"
    values["AGENT_SANDBOX_IMAGE"] = "ghcr.io/conker-ai/toolgate-sandbox@sha256:" + "a" * 64

    with pytest.raises(ManifestError, match="deferred agent sandbox"):
        validate_manifest(values)


def test_active_sandbox_without_image_fails():
    values = parse_env(MANIFEST)
    values["AGENT_SANDBOX_STATE"] = "active"
    values.pop("AGENT_SANDBOX_IMAGE", None)

    with pytest.raises(ManifestError, match="active agent sandbox requires AGENT_SANDBOX_IMAGE"):
        validate_manifest(values)


def test_active_sandbox_with_a_tag_image_fails():
    values = parse_env(MANIFEST)
    values["AGENT_SANDBOX_STATE"] = "active"
    values["AGENT_SANDBOX_IMAGE"] = "ghcr.io/conker-ai/toolgate-sandbox:0.6.0"
    values["TOOLGATE_VERSION"] = "0.6.0"

    with pytest.raises(ManifestError, match="tags are mutable"):
        validate_manifest(values)


def test_active_sandbox_with_a_digest_of_another_repository_fails():
    values = parse_env(MANIFEST)
    values["AGENT_SANDBOX_STATE"] = "active"
    values["AGENT_SANDBOX_IMAGE"] = "ghcr.io/other/toolgate-sandbox@sha256:" + "a" * 64
    values["TOOLGATE_VERSION"] = "0.6.0"

    with pytest.raises(ManifestError, match="ghcr.io/conker-ai/toolgate-sandbox"):
        validate_manifest(values)


def test_active_sandbox_with_toolgate_version_below_0_6_0_fails():
    values = parse_env(MANIFEST)
    values["AGENT_SANDBOX_STATE"] = "active"
    values["AGENT_SANDBOX_IMAGE"] = "ghcr.io/conker-ai/toolgate-sandbox@sha256:" + "a" * 64
    values["TOOLGATE_VERSION"] = "0.5.1"

    with pytest.raises(ManifestError, match="TOOLGATE_VERSION at least 0.6.0"):
        validate_manifest(values)


def test_active_sandbox_with_0_6_0_and_correct_digest_passes():
    values = parse_env(MANIFEST)
    values["AGENT_SANDBOX_STATE"] = "active"
    values["AGENT_SANDBOX_IMAGE"] = "ghcr.io/conker-ai/toolgate-sandbox@sha256:" + "a" * 64
    values["TOOLGATE_VERSION"] = "0.6.0"

    result = validate_manifest(values)
    assert result["capabilities"]["agent-sandbox"]["state"] == "active"
    assert result["capabilities"]["agent-sandbox"]["image"] == (
        "ghcr.io/conker-ai/toolgate-sandbox@sha256:" + "a" * 64
    )


# --- recovery cases ---

from recovery_layout import REPOSITORY_PROFILE
from recovery_snapshot import valid_service_inventory


def test_repository_inventory_is_valid_with_and_without_sandbox_services():
    base = set(REPOSITORY_PROFILE.services)
    assert valid_service_inventory(base, REPOSITORY_PROFILE)
    assert valid_service_inventory(base | {"sandbox-runner", "package-proxy"}, REPOSITORY_PROFILE)
    assert not valid_service_inventory(base | {"sandbox-shell"}, REPOSITORY_PROFILE)


def test_sandbox_services_are_writers_stopped_for_a_backup():
    assert {"sandbox-runner", "package-proxy"} <= set(REPOSITORY_PROFILE.writers)


def test_sandbox_mounts_are_never_archived():
    assert REPOSITORY_PROFILE.excluded_mounts["toolgate"] == frozenset({"/run/conker-sandbox"})
    assert REPOSITORY_PROFILE.excluded_mounts["sandbox-runner"] == frozenset(
        {"/var/run/docker.sock", "/run/conker-sandbox", "/workspaces"}
    )
    assert REPOSITORY_PROFILE.excluded_mounts["package-proxy"] == frozenset({"/run/conker-proxy"})
