"""Hosted models on the server: the Claude plan runtime in the source-built Ubuntu layout, the keys
MemoryGate and ToolGate ask Pi for model text with (contract C1), and Ollama's keep-alive, in every
layout that sets them."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import recovery_layout
import service_keys

from tests.ubuntu_generator import prepare


def generated(tmp_path, **environment):
    prepare(tmp_path, environment=environment)
    manifest = json.loads((tmp_path / "compose.json").read_text())
    env = {
        path.stem: dict(line.split("=", 1) for line in path.read_text().splitlines())
        for path in (tmp_path / "state").glob("*.env")
    }
    return manifest, env


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def test_ubuntu_services_get_their_own_pi_keys_and_pi_only_the_hashes(tmp_path):
    _, env = generated(tmp_path)
    memorygate = env["memorygate"]["MEMORYGATE_PI_SERVICE_KEY"]
    toolgate = env["toolgate"]["TOOLGATE_PI_SERVICE_KEY"]

    # Pi's address inside the compose network, as the gateway reaches it too.
    assert env["memorygate"]["MEMORYGATE_PI_URL"] == "http://pi:8050"
    assert env["toolgate"]["TOOLGATE_PI_URL"] == "http://pi:8050"
    assert env["gateway"]["GATEWAY_PI_URL"] == "http://pi:8050"
    assert min(len(memorygate), len(toolgate)) >= 32 and memorygate != toolgate
    assert json.loads(env["pi"]["PI_SERVICE_KEYS_SHA256"]) == {
        "memorygate": sha256(memorygate),
        "toolgate": sha256(toolgate),
    }
    pi = (tmp_path / "state/pi.env").read_text()
    assert memorygate not in pi and toolgate not in pi
    assert toolgate not in (tmp_path / "state/memorygate.env").read_text()
    assert memorygate not in (tmp_path / "state/toolgate.env").read_text()


def test_an_older_deployment_gets_the_new_keys_and_keeps_every_other(tmp_path):
    prepare(tmp_path)
    keyfile = tmp_path / "state/credentials.json"
    older = json.loads(keyfile.read_text())
    for name in (
        "memorygate_pi",
        "toolgate_pi",
        "subscriptions_control",
        "subscriptions_inference",
        "memorygate_import",
    ):
        del older[name]
    older["toolgate_pi"] = "short"
    keyfile.write_text(json.dumps(older))

    _, env = generated_again(tmp_path)

    keys = json.loads(keyfile.read_text())
    assert {name: keys[name] for name in older if name != "toolgate_pi"} == {
        name: value for name, value in older.items() if name != "toolgate_pi"
    }
    assert len(keys["toolgate_pi"]) >= 32
    assert env["toolgate"]["TOOLGATE_PI_SERVICE_KEY"] == keys["toolgate_pi"]
    assert env["pi"]["PI_SUBSCRIPTION_KEY"] == keys["subscriptions_inference"]
    assert env["pi"]["PI_MEMORYGATE_IMPORT_KEY"] == keys["memorygate_import"]
    if sys.platform != "win32":
        assert keyfile.stat().st_mode & 0o777 == 0o600
    # A second run with every key present changes nothing.
    before = keyfile.read_bytes()
    generated_again(tmp_path)
    assert keyfile.read_bytes() == before


def generated_again(tmp_path):
    """Prepare the same deployment again, as an update does."""
    import os
    import subprocess

    from tests.ubuntu_generator import ACCEPT_FOLDER, PREPARE

    workspaces = tmp_path.parent / f"{tmp_path.name}-workspaces"
    subprocess.run(
        [
            sys.executable,
            "-c",
            ACCEPT_FOLDER,
            str(ROOT),
            str(PREPARE),
            "https://conker.test:8443",
        ],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "CONKER_WORKSPACES_DIR": str(workspaces),
            "CONKER_DOCKER_GID": "998",
        },
    )
    manifest = json.loads((tmp_path / "compose.json").read_text())
    env = {
        path.stem: dict(line.split("=", 1) for line in path.read_text().splitlines())
        for path in (tmp_path / "state").glob("*.env")
    }
    return manifest, env


def test_the_claude_plan_runtime_is_its_own_isolated_service(tmp_path):
    manifest, env = generated(tmp_path)
    runtime = manifest["services"]["subscriptions"]
    control = env["subscriptions"]["SUBSCRIPTIONS_CONTROL_KEY"]
    inference = env["subscriptions"]["SUBSCRIPTIONS_INFERENCE_KEY"]

    assert runtime["build"] == {
        "context": "./sources/companion",
        "dockerfile": "services/subscriptions/Dockerfile",
    }
    # Pi reaches a subscription runtime only at 127.0.0.1, so the runtime joins Pi's namespace and
    # publishes nothing; it has no network of its own to reach the other services on.
    assert runtime["network_mode"] == "service:pi"
    assert "networks" not in runtime and "ports" not in runtime
    assert runtime["read_only"] is True and runtime["cap_drop"] == ["ALL"]
    assert runtime["security_opt"] == ["no-new-privileges:true"]
    assert runtime["user"] == "1000:1000"
    # The sign-in has a folder of its own; the ChatGPT worker's socket is only read.
    assert runtime["volumes"] == [
        "./state/subscriptions:/state",
        "./state/chatgpt-inference:/run/conker-chatgpt:ro",
    ]
    assert (tmp_path / "state/subscriptions").is_dir()
    assert env["pi"]["PI_SUBSCRIPTION_URL"] == "http://127.0.0.1:8070"
    assert env["pi"]["PI_SUBSCRIPTION_KEY"] == inference
    assert min(len(control), len(inference)) >= 32 and control != inference
    # Pi can ask for answers but never control the sign-in, and holds no ChatGPT socket of its own.
    assert control not in (tmp_path / "state/pi.env").read_text()
    assert "PI_CHATGPT_SOCKET" not in env["pi"]
    assert not any(
        "chatgpt" in volume for volume in manifest["services"]["pi"]["volumes"]
    )
    assert not any(
        "subscriptions" in volume
        for name, service in manifest["services"].items()
        if name != "subscriptions"
        for volume in service.get("volumes", [])
        if isinstance(volume, str)
    )


def test_recovery_leaves_the_sign_in_out_of_snapshots(tmp_path):
    manifest, _ = generated(tmp_path)
    profile = recovery_layout.UBUNTU_PROFILE
    mounts = {
        volume.split(":")[1]
        for volume in manifest["services"]["subscriptions"]["volumes"]
    }
    assert mounts == profile.excluded_mounts["subscriptions"]
    assert (
        "subscriptions" in profile.optional_services
        and "subscriptions" in profile.writers
    )
    assert "subscriptions" not in profile.stores


def test_ollama_keeps_a_model_loaded_a_day_unless_the_owner_says_otherwise(tmp_path):
    _, env = generated(tmp_path / "default")
    assert env["ollama"]["OLLAMA_KEEP_ALIVE"] == "24h"
    _, chosen = generated(tmp_path / "chosen", CONKER_OLLAMA_KEEP_ALIVE="30m")
    assert chosen["ollama"]["OLLAMA_KEEP_ALIVE"] == "30m"
    refused = prepare(
        tmp_path / "refused",
        environment={"CONKER_OLLAMA_KEEP_ALIVE": "1 day"},
        check=False,
    )
    assert refused.returncode != 0 and "CONKER_OLLAMA_KEEP_ALIVE" in refused.stderr

    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    ollama = compose["services"]["ollama"]["environment"]
    assert ollama["OLLAMA_KEEP_ALIVE"] == "${CONKER_OLLAMA_KEEP_ALIVE:-24h}"
    installer = (ROOT / "install.sh").read_text(encoding="utf-8")
    assert (
        "CONKER_OLLAMA_KEEP_ALIVE=$(keep_optional CONKER_OLLAMA_KEEP_ALIVE)"
        in installer
    )
    assert "\nCONKER_OLLAMA_KEEP_ALIVE=$CONKER_OLLAMA_KEEP_ALIVE\n" in installer


def test_pi_knows_the_context_length_ollama_was_given(tmp_path):
    # Pi caps the owner's models.local.context to it (pi/models/local_settings.py).
    _, env = generated(tmp_path)
    assert env["pi"]["PI_OLLAMA_CONTEXT_LENGTH"] == "8192"
    assert (
        env["pi"]["PI_OLLAMA_CONTEXT_LENGTH"] == env["ollama"]["OLLAMA_CONTEXT_LENGTH"]
    )

    services = yaml.safe_load(
        (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    )["services"]
    assert services["pi"]["environment"]["PI_OLLAMA_CONTEXT_LENGTH"] == (
        "${CONKER_MODEL_CONTEXT:-8192}"
    )
    assert (
        services["pi"]["environment"]["PI_OLLAMA_CONTEXT_LENGTH"]
        == services["ollama"]["environment"]["OLLAMA_CONTEXT_LENGTH"]
    )


def test_the_repository_compose_wires_the_service_keys_to_pi(tmp_path):
    services = yaml.safe_load(
        (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    )["services"]
    assert services["pi"]["environment"]["PI_SERVICE_KEYS_SHA256"] == (
        "${PI_SERVICE_KEYS_SHA256:-}"
    )
    for service, prefix in (("memorygate", "MEMORYGATE"), ("toolgate", "TOOLGATE")):
        environment = services[service]["environment"]
        # Pi's compose service name and port; both stay empty until install.sh writes the key.
        assert (
            environment[f"{prefix}_PI_URL"]
            == f"${{{prefix}_PI_SERVICE_KEY:+http://pi:8050}}"
        )
        assert (
            environment[f"{prefix}_PI_SERVICE_KEY"] == f"${{{prefix}_PI_SERVICE_KEY:-}}"
        )
        assert f"{prefix}_PI_SERVICE_KEY" not in json.dumps(services["pi"])
    assert services["gateway"]["environment"]["GATEWAY_PI_URL"] == "http://pi:8050"
    installer = (ROOT / "install.sh").read_text(encoding="utf-8")
    for name in ("MEMORYGATE_PI_SERVICE_KEY", "TOOLGATE_PI_SERVICE_KEY"):
        assert f"{name}=$(keep_or_make_long {name})" in installer
        assert f"\n{name}=${name}\n" in installer
    assert "\nPI_SERVICE_KEYS_SHA256=$PI_SERVICE_KEYS_SHA256\n" in installer


def test_a_workspace_gets_service_keys_once_and_keeps_them():
    config = {
        "environments": {
            "pi": {},
            "memorygate": {},
            "toolgate": {"TOOLGATE_PI_SERVICE_KEY": "x"},
        }
    }
    assert service_keys.ensure(config, "http://127.0.0.1:18551") is True
    envs = config["environments"]
    assert envs["memorygate"]["MEMORYGATE_PI_URL"] == "http://127.0.0.1:18551"
    assert len(envs["toolgate"]["TOOLGATE_PI_SERVICE_KEY"]) >= 32
    assert json.loads(envs["pi"]["PI_SERVICE_KEYS_SHA256"]) == {
        "memorygate": sha256(envs["memorygate"]["MEMORYGATE_PI_SERVICE_KEY"]),
        "toolgate": sha256(envs["toolgate"]["TOOLGATE_PI_SERVICE_KEY"]),
    }
    before = json.dumps(config)
    assert service_keys.ensure(config, "http://127.0.0.1:18551") is False
    assert json.dumps(config) == before
    assert service_keys.ensure({}, "http://127.0.0.1:18551") is False
