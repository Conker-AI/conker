"""Meaning search in the local workspace: opt-in, pinned, loopback only, and never half-configured."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import local_stack
import workspace
import workspace_search as search


def config():
    return {
        "workspace_schema": 1,
        "ports": {"memorygate": 18520},
        "postgres_container": "conker-workspace-abc1234567",
        "repositories": {"memorygate": "/sources/memorygate"},
        "python_by_service": {"memorygate": "/runtimes/memorygate/python"},
        "environments": {
            "memorygate": {
                "QDRANT_URL": "http://127.0.0.1:6333",
                "EMBEDDINGS_URL": "http://127.0.0.1:8030",
                "MEMORYGATE_ADMIN_KEY": "private-admin-key-retained-123456",
            },
            "pi": {"PI_ADMIN_KEY": "private-pi-key-retained-123456"},
        },
    }


def test_preparation_points_memorygate_at_the_new_services_with_one_shared_key():
    original = config()
    prepared, changed = search.prepare(
        original,
        "k" * 48,
        "/runtimes/embeddings/python",
        "qdrant/qdrant@sha256:" + "a" * 64,
    )
    assert changed and original == config()
    memory = prepared["environments"]["memorygate"]
    assert memory["QDRANT_URL"] == "http://127.0.0.1:16333"
    assert memory["EMBEDDINGS_URL"] == "http://127.0.0.1:18530"
    assert (
        memory["EMBEDDINGS_KEY"]
        == prepared["environments"]["embeddings"]["EMBEDDINGS_ADMIN_KEY"]
        == "k" * 48
    )
    assert memory["MEMORYGATE_ADMIN_KEY"] == "private-admin-key-retained-123456"
    assert prepared["environments"]["embeddings"] == {
        "EMBEDDINGS_ADMIN_KEY": "k" * 48,
        "EMBEDDINGS_OLLAMA_URL": "http://127.0.0.1:11434",
        "EMBEDDINGS_MODEL": "qwen3-embedding:0.6b",
        "EMBEDDINGS_DIMENSION": "1024",
    }
    assert prepared["ports"] == {
        "memorygate": 18520,
        "embeddings": 18530,
        "qdrant": 16333,
    }
    assert (
        prepared["qdrant_container"]
        == prepared["qdrant_volume"]
        == "conker-workspace-qdrant-abc1234567"
    )
    assert prepared["meaning_search"]["qdrant_image"].startswith(
        "qdrant/qdrant@sha256:"
    )
    again, changed = search.prepare(
        prepared, "other-key" * 6, "/elsewhere", "other-image"
    )
    assert not changed and again == prepared


def test_the_qdrant_image_is_the_releases_pinned_digest():
    image = search.pinned("QDRANT_IMAGE")
    assert image.startswith("qdrant/qdrant@sha256:") and len(image.split(":")[-1]) == 64
    with pytest.raises(ValueError):
        search.pinned("NO_SUCH_IMAGE")


def test_a_running_memorygate_is_refused_before_any_download(monkeypatch):
    monkeypatch.setattr(
        search, "owned_process", lambda config, service: service == "memorygate"
    )
    monkeypatch.setattr(
        search, "prepare_source", lambda *a: pytest.fail("no source work while running")
    )
    with pytest.raises(SystemExit, match="Stop the workspace"):
        search.enable(config())


@pytest.mark.parametrize(
    "models,message",
    [
        (set(), "ollama pull qwen3-embedding:0.6b"),
        (OSError("refused"), "Start Ollama first"),
    ],
)
def test_the_embedding_model_must_already_be_in_ollama(monkeypatch, models, message):
    monkeypatch.setattr(search, "owned_process", lambda config, service: False)

    def installed():
        if isinstance(models, Exception):
            raise models
        return models

    monkeypatch.setattr(search, "installed_models", installed)
    monkeypatch.setattr(
        search,
        "prepare_source",
        lambda *a: pytest.fail("no source work without the model"),
    )
    with pytest.raises(SystemExit, match=message):
        search.enable(config())


def test_meaning_search_starts_its_services_before_memorygate(monkeypatch, capsys):
    seen = []
    configured = {**config(), "meaning_search": {"model": "qwen3-embedding:0.6b"}}
    monkeypatch.setattr(workspace, "read_config", lambda: configured)
    monkeypatch.setattr(
        workspace,
        "service_state",
        lambda config, service: seen.append(service) or "stopped",
    )
    monkeypatch.setattr(sys, "argv", ["workspace.py", "status"])
    monkeypatch.setattr(
        "workspace_memory.status", lambda config: "not configured", raising=False
    )
    workspace.main()
    assert seen == [
        "postgres",
        "qdrant",
        "embeddings",
        "memorygate",
        "toolgate",
        "pi",
        "gateway",
    ]
    assert (
        "meaning search: configured (qwen3-embedding:0.6b)" in capsys.readouterr().out
    )


def test_qdrant_runs_labelled_on_loopback_with_its_own_volume(monkeypatch):
    calls = []

    def fake_run(args, **options):
        calls.append(args)
        if args[:3] == ["docker", "container", "inspect"]:
            return subprocess.CompletedProcess(args, 1, b"", b"")
        return subprocess.CompletedProcess(args, 0, b"", b"")

    monkeypatch.setattr(local_stack.subprocess, "run", fake_run)
    monkeypatch.setattr(local_stack, "listening", lambda port: False)
    monkeypatch.setitem(local_stack.SERVICES, "qdrant", 16333)
    settings = {
        "qdrant_container": "q",
        "qdrant_volume": "q",
        "meaning_search": {"qdrant_image": "qdrant/qdrant@sha256:abc"},
    }
    local_stack.qdrant("start", settings)
    assert calls[-1] == [
        "docker",
        "run",
        "--detach",
        "--name",
        "q",
        "--label",
        "conker.local-integration=true",
        "--publish",
        "127.0.0.1:16333:6333",
        "--memory",
        "512m",
        "--volume",
        "q:/qdrant/storage",
        "qdrant/qdrant@sha256:abc",
    ]


def test_a_foreign_qdrant_container_is_never_started_or_stopped(monkeypatch):
    foreign = [{"Config": {"Labels": {}}, "HostConfig": {}, "Mounts": []}]
    calls = []

    def fake_run(args, **options):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, json.dumps(foreign).encode(), b"")

    monkeypatch.setattr(local_stack.subprocess, "run", fake_run)
    for command in ("start", "stop"):
        with pytest.raises(SystemExit, match="owned by another setup"):
            local_stack.qdrant(command, {"qdrant_container": "q", "qdrant_volume": "q"})
    assert all(call[:3] == ["docker", "container", "inspect"] for call in calls)


def test_an_owned_qdrant_container_is_recognised_by_label_port_and_volume(monkeypatch):
    details = [
        {
            "Config": {"Labels": {"conker.local-integration": "true"}},
            "HostConfig": {
                "PortBindings": {
                    "6333/tcp": [{"HostIp": "127.0.0.1", "HostPort": "16333"}]
                }
            },
            "Mounts": [{"Name": "q", "Destination": "/qdrant/storage"}],
            "State": {"Running": True, "Restarting": False},
        }
    ]

    def fake_run(*args, **options):
        return "q" if args[1] == "container" else json.dumps(details)

    monkeypatch.setattr(workspace, "run", fake_run)
    settings = {"qdrant_container": "q", "qdrant_volume": "q"}
    assert workspace.container_state(settings, True, "qdrant") == "listening"
    details[0]["Mounts"][0]["Name"] = "someone-else"
    with pytest.raises(SystemExit, match="Qdrant container does not belong"):
        workspace.container_state(settings, True, "qdrant")


def test_the_start_order_is_the_same_every_time(monkeypatch, capsys):
    configured = {**config(), "meaning_search": {"model": "qwen3-embedding:0.6b"}}
    monkeypatch.setattr(workspace, "read_config", lambda: configured)
    monkeypatch.setattr(sys, "argv", ["workspace.py", "status"])
    monkeypatch.setattr(
        "workspace_memory.status", lambda config: "not configured", raising=False
    )
    runs = []
    for _ in range(2):
        seen = []
        monkeypatch.setattr(
            workspace,
            "service_state",
            lambda config, service, seen=seen: seen.append(service) or "stopped",
        )
        workspace.main()
        runs.append(seen)
    assert runs[0] == runs[1] and runs[0].count("qdrant") == 1
