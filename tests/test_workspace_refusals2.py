"""Refusals of the local workspace scripts (scripts/workspace.py, workspace_setup.py): bad or foreign
configuration, missing tools, dirty or wrong pinned sources, and the stopped-workspace guards.
Every command is a fake; nothing starts a process, reaches Docker or the network."""

from __future__ import annotations

import json
import subprocess

import pytest

from scripts import workspace, workspace_setup


@pytest.fixture
def state(tmp_path, monkeypatch):
    root = tmp_path / "state"
    root.mkdir()
    monkeypatch.setattr(workspace, "STATE", root)
    monkeypatch.setattr(workspace, "CONFIG", root / "configuration.json")
    monkeypatch.setattr(workspace_setup, "STATE", root)
    monkeypatch.setattr(workspace_setup, "CONFIG", root / "configuration.json")
    return root


def test_read_config_refuses_a_missing_file(state):
    with pytest.raises(SystemExit, match="install first"):
        workspace.read_config()


@pytest.mark.parametrize("body", [{}, {"workspace_schema": 2}])
def test_read_config_refuses_a_foreign_directory(state, body):
    (state / "configuration.json").write_text(json.dumps(body), encoding="utf-8")
    with pytest.raises(SystemExit, match="different local stack"):
        workspace.read_config()


def test_install_keeps_an_existing_workspace(state, capsys, monkeypatch):
    (state / "configuration.json").write_text('{"workspace_schema": 1}', encoding="utf-8")
    monkeypatch.setattr(workspace, "run", lambda *a, **k: pytest.fail("must not run anything"))
    workspace.install("model")
    assert "Existing workspace retained" in capsys.readouterr().out


def test_install_refuses_a_foreign_existing_directory(state):
    (state / "configuration.json").write_text('{"workspace_schema": 9}', encoding="utf-8")
    with pytest.raises(SystemExit, match="different local stack"):
        workspace.install("model")


@pytest.mark.parametrize("missing", ["git", "node", "npm", "docker"])
def test_install_names_the_missing_tool(state, monkeypatch, missing):
    monkeypatch.setattr(workspace.shutil, "which", lambda name: None if name == missing else name)
    monkeypatch.setattr(workspace, "run", lambda *a, **k: pytest.fail("must not run anything"))
    with pytest.raises(SystemExit, match=f"Install {missing} before"):
        workspace.install("model")


def fake_git(heads: dict[str, str]):
    calls: list[tuple] = []

    def run(*args, cwd=None, capture=False, timeout=None):
        calls.append(args)
        if args[:2] == ("git", "rev-parse"):
            return heads["head"]
        if args[:2] == ("git", "status"):
            return heads["status"]
        return None

    return run, calls


def test_prepare_source_refuses_a_dirty_checkout(state, monkeypatch):
    (state / "sources" / "pi").mkdir(parents=True)
    run, calls = fake_git({"head": "old", "status": " M file.py"})
    monkeypatch.setattr(workspace, "run", run)
    with pytest.raises(SystemExit, match="local changes"):
        workspace.prepare_source("pi", "new")
    assert not any(call[:2] == ("git", "checkout") for call in calls)


def test_prepare_source_refuses_when_the_checkout_misses_the_pin(state, monkeypatch):
    (state / "sources" / "pi").mkdir(parents=True)
    run, calls = fake_git({"head": "other", "status": ""})
    monkeypatch.setattr(workspace, "run", run)
    with pytest.raises(SystemExit, match="identity check failed"):
        workspace.prepare_source("pi", "pin")
    assert ("git", "checkout", "--detach", "pin") in [call[:4] for call in calls]


def test_prepare_source_keeps_a_checkout_already_at_the_pin(state, monkeypatch):
    source = state / "sources" / "pi"
    source.mkdir(parents=True)
    (source / "requirements.txt").write_text("uvloop==1\nfastapi==2\n", encoding="utf-8")
    env = state / "runtimes" / "pi"
    workspace.interpreter(env).parent.mkdir(parents=True)
    workspace.interpreter(env).write_text("", encoding="utf-8")
    run, calls = fake_git({"head": "pin", "status": ""})
    monkeypatch.setattr(workspace, "run", run)
    monkeypatch.setattr(workspace.os, "name", "nt")
    assert workspace.prepare_source("pi", "pin") == str(workspace.interpreter(env))
    assert not any(call[:2] in {("git", "fetch"), ("git", "clone")} for call in calls)
    written = (state / "pi-requirements.txt").read_text(encoding="utf-8")
    assert "uvloop" not in written and "fastapi==2" in written


def test_run_passes_the_timeout_and_strips_output(monkeypatch):
    seen = {}

    def fake(args, **kwargs):
        seen.update(args=args, **kwargs)
        return subprocess.CompletedProcess(args, 0, stdout="out\n")

    monkeypatch.setattr(workspace.subprocess, "run", fake)
    assert workspace.run("a", 1, capture=True, timeout=3) == "out"
    assert seen["args"] == ["a", "1"] and seen["timeout"] == 3
    assert workspace.run("a") is None


def test_require_memory_ports_refuses_changed_or_untyped_ports():
    for ports in (None, [], {"pi": 1, "memorygate": 2}, {"pi": "18551", "memorygate": 18520}):
        with pytest.raises(SystemExit, match="ports must match"):
            workspace_setup._require_memory_ports({"ports": ports})
    workspace_setup._require_memory_ports({"ports": workspace.PORTS})


def test_enhance_refuses_while_a_service_runs(monkeypatch):
    monkeypatch.setattr(workspace_setup, "owned_process", lambda config, service: True)
    with pytest.raises(SystemExit, match="Stop this workspace"):
        workspace_setup.enhance({}, None)


def idle(monkeypatch):
    monkeypatch.setattr(workspace_setup, "owned_process", lambda config, service: False)
    monkeypatch.setattr(workspace_setup, "run", lambda *a, **k: pytest.fail("must not run"))


def test_enhance_refuses_changed_ports(monkeypatch):
    idle(monkeypatch)
    with pytest.raises(SystemExit, match="ports must match"):
        workspace_setup.enhance({"ports": {}}, None)


def test_enhance_names_the_first_wrong_checkout(tmp_path, monkeypatch):
    from scripts import workspace_memory

    idle(monkeypatch)
    monkeypatch.setattr(workspace_memory, "prepare", lambda config: (config, False))
    config = {
        "ports": workspace.PORTS,
        "repositories": {
            "pi": str(tmp_path),
            "toolgate": str(tmp_path),
            "memorygate": str(tmp_path),
        },
    }
    with pytest.raises(SystemExit, match="--pi-source"):
        workspace_setup.enhance(config, tmp_path)

    for relative in ("pi/turns/thinking.py", "pi/agents/skills.py", "gateway/mcp_control.py"):
        (tmp_path / relative).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / relative).write_text("", encoding="utf-8")
    with pytest.raises(SystemExit, match="--toolgate-source"):
        workspace_setup.enhance(config, tmp_path)

    toolgate = tmp_path / "toolgate/executors/mcp_http.py"
    toolgate.parent.mkdir(parents=True)
    toolgate.write_text("", encoding="utf-8")
    with pytest.raises(SystemExit, match="--memorygate-source"):
        workspace_setup.enhance(config, tmp_path)


def test_enhance_turns_a_bad_configuration_into_a_refusal(monkeypatch):
    from scripts import workspace_memory

    idle(monkeypatch)

    def refuse(config):
        raise ValueError("configuration is unusable")

    monkeypatch.setattr(workspace_memory, "prepare", refuse)
    with pytest.raises(SystemExit, match="configuration is unusable"):
        workspace_setup.enhance({"ports": workspace.PORTS}, None)


def test_memory_corrections_refuse_while_services_run(monkeypatch):
    monkeypatch.setattr(workspace_setup, "owned_process", lambda config, service: True)
    with pytest.raises(SystemExit, match="Stop Pi and MemoryGate"):
        workspace_setup.configure_memory_corrections({})


def test_memory_corrections_refuse_a_changed_configuration(state, monkeypatch):
    idle(monkeypatch)
    (state / "configuration.json").write_text('{"changed": true}', encoding="utf-8")
    with pytest.raises(SystemExit, match="changed; reload"):
        workspace_setup.configure_memory_corrections({"ports": workspace.PORTS})


def test_memory_corrections_refuse_an_unreadable_configuration(state, monkeypatch):
    idle(monkeypatch)
    with pytest.raises(SystemExit):
        workspace_setup.configure_memory_corrections({"ports": workspace.PORTS})
