"""conker inspect and apply on Ubuntu: one validated resource, the fixed gateway command, nothing else."""

from __future__ import annotations

import json

import pytest


def test_inspect_uses_the_fixed_gateway_control_plane_command(ubuntu_cli):
    result = ubuntu_cli("inspect", "agents")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"status": "ok", "checks": {}}
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T gateway python -m gateway inspect agents" in call


def test_inspect_requires_exactly_one_resource_before_compose(ubuntu_cli):
    result = ubuntu_cli("inspect")

    assert result.returncode == 2
    assert not ubuntu_cli.docker_log.exists()


def test_inspect_session_settings_passes_one_validated_compound_resource(ubuntu_cli):
    result = ubuntu_cli("inspect", "session-settings", "ses_1234567890abcdef")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 3
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "gateway python -m gateway inspect session-settings:ses_1234567890abcdef" in call


def test_inspect_approval_passes_one_validated_compound_resource(ubuntu_cli):
    result = ubuntu_cli("inspect", "approval", "req_123")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"id": "req_123", "status": "pending"}
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "gateway python -m gateway inspect approval:req_123" in call


def test_inspect_submission_passes_one_validated_compound_resource(ubuntu_cli):
    result = ubuntu_cli("inspect", "submission", "request_1234567890abcdef")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "running"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert (
        "gateway python -m gateway inspect submission:request_1234567890abcdef"
        in call
    )


@pytest.mark.parametrize(
    ("kind", "identity"),
    [
        ("file-listing", "listing_1234567890abcdef"),
        ("inventory", "inventory_1234567890abcdef"),
    ],
)
def test_inspect_system_observation_passes_validated_compound_resource(
    ubuntu_cli, kind, identity
):
    result = ubuntu_cli("inspect", kind, identity)

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["state"] == "complete"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert f"gateway python -m gateway inspect {kind}:{identity}" in call


@pytest.mark.parametrize(
    ("kind", "identity"),
    [
        ("call", "call_" + "a" * 32),
        ("active-call", "ses_source_123"),
    ],
)
def test_inspect_call_passes_validated_compound_resource(ubuntu_cli, kind, identity):
    result = ubuntu_cli("inspect", kind, identity)

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["execution"] == "typed-and-audio-turns"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert f"gateway python -m gateway inspect {kind}:{identity}" in call


def test_inspect_tool_draft_passes_validated_compound_resource(ubuntu_cli):
    result = ubuntu_cli("inspect", "tool-draft", "example")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["id"] == "example"
    assert "gateway python -m gateway inspect tool-draft:example" in ubuntu_cli.docker_log.read_text()


def test_inspect_tool_access_binds_exact_publication_target(ubuntu_cli):
    digest = "b" * 64
    result = ubuntu_cli("inspect", "tool-access", "example", "2", digest)

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["enabled"] is True
    assert (
        f"gateway python -m gateway inspect tool-access:example:2:{digest}"
        in ubuntu_cli.docker_log.read_text()
    )


def test_apply_models_streams_file_to_the_fixed_gateway_operation(ubuntu_cli, tmp_path):
    configuration = tmp_path / "models.json"
    configuration.write_text(
        json.dumps({"expected_revision": 4, "configuration": {"models": []}}),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "models", str(configuration))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 5
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T gateway python -m gateway apply models" in call
    assert str(configuration) not in call


def test_apply_rejects_unknown_resource_or_missing_file_before_compose(ubuntu_cli, tmp_path):
    unknown = ubuntu_cli("apply", "payments", str(tmp_path / "missing.json"))
    missing = ubuntu_cli("apply", "models", str(tmp_path / "missing.json"))

    assert unknown.returncode == 2 and "supports: agents, approvals, artifacts, calls, character, files, inventory, jobs, memory, models, projects, proposals, sessions, tasks, teams, tools, turns" in unknown.stderr
    assert missing.returncode == 2 and "file not found" in missing.stderr.lower()
    assert not ubuntu_cli.docker_log.exists()


def test_apply_agents_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "agent.json"
    document.write_text(
        json.dumps(
            {
                "operation": "archive",
                "id": "agent_" + "a" * 32,
                "expected_revision": 1,
                "archived": True,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "agents", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply agents" in ubuntu_cli.docker_log.read_text()


def test_apply_projects_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "project.json"
    document.write_text(
        json.dumps(
            {
                "operation": "archive",
                "id": "project_" + "b" * 32,
                "expected_revision": 1,
                "archived": True,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "projects", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply projects" in ubuntu_cli.docker_log.read_text()


def test_apply_teams_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "team.json"
    document.write_text(
        json.dumps(
            {
                "operation": "restore",
                "id": "team_" + "e" * 32,
                "expected_revision": 1,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "teams", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply teams" in ubuntu_cli.docker_log.read_text()


def test_apply_jobs_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "job.json"
    document.write_text(
        json.dumps(
            {
                "operation": "run",
                "id": "job_" + "f" * 32,
                "request_id": "cli:1234567890abcdef",
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "jobs", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "ready"
    assert "gateway python -m gateway apply jobs" in ubuntu_cli.docker_log.read_text()


def test_apply_memory_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "forget.json"
    document.write_text(
        json.dumps(
            {
                "operation": "forget",
                "request_id": "forget_1234567890abcdef",
                "memory_id": "memory.important:1",
                "expected_revision": 8,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "memory", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "forgotten"
    assert "gateway python -m gateway apply memory" in ubuntu_cli.docker_log.read_text()


def test_apply_proposals_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "proposal.json"
    document.write_text(
        json.dumps(
            {"operation": "decide", "id": "proposal_123", "decision": "decline"}
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "proposals", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["state"] == "declined"
    assert "gateway python -m gateway apply proposals" in ubuntu_cli.docker_log.read_text()


def test_apply_tasks_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "task.json"
    document.write_text(
        json.dumps(
            {
                "operation": "archive",
                "id": "tsk_" + "1" * 32,
                "expected_revision": 1,
                "archived": True,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "tasks", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply tasks" in ubuntu_cli.docker_log.read_text()


def test_apply_artifacts_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "artifact.json"
    document.write_text(
        json.dumps(
            {
                "operation": "archive",
                "id": "artifact_" + "4" * 32,
                "expected_revision": 1,
                "archived": True,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "artifacts", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply artifacts" in ubuntu_cli.docker_log.read_text()


def test_apply_sessions_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "session.json"
    document.write_text(
        json.dumps(
            {
                "operation": "update",
                "id": "ses_1234567890abcdef",
                "expected_revision": 3,
                "settings": {
                    "agentId": "companion",
                    "privacy": {"memoryDisabled": True, "harnessDisabled": True},
                    "projectId": None,
                    "projectSources": [],
                    "presentationMode": "focus",
                },
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "sessions", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 4
    assert "gateway python -m gateway apply sessions" in ubuntu_cli.docker_log.read_text()


def test_apply_approvals_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "approval.json"
    document.write_text(
        json.dumps(
            {
                "operation": "decide",
                "id": "req_123",
                "status": "approved",
                "note": "Reviewed.",
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "approvals", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "approved"
    assert "gateway python -m gateway apply approvals" in ubuntu_cli.docker_log.read_text()


def test_apply_turns_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "turn.json"
    document.write_text(
        json.dumps({"operation": "resume", "id": "turn_123"}), encoding="utf-8"
    )

    result = ubuntu_cli("apply", "turns", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "complete"
    assert "gateway python -m gateway apply turns" in ubuntu_cli.docker_log.read_text()


@pytest.mark.parametrize(
    ("resource", "payload"),
    [
        (
            "files",
            {
                "operation": "request",
                "request_id": "listing_1234567890abcdef",
                "root_id": "project",
                "path": "docs",
                "limit": 50,
            },
        ),
        (
            "inventory",
            {
                "operation": "request",
                "request_id": "inventory_1234567890abcdef",
                "limit": 100,
            },
        ),
    ],
)
def test_apply_system_observation_uses_bounded_gateway_entrypoint(
    ubuntu_cli, tmp_path, resource, payload
):
    document = tmp_path / f"{resource}.json"
    document.write_text(json.dumps(payload), encoding="utf-8")

    result = ubuntu_cli("apply", resource, str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["state"] == "complete"
    assert f"gateway python -m gateway apply {resource}" in ubuntu_cli.docker_log.read_text()


def test_apply_character_streams_package_to_isolated_gateway_operation(
    ubuntu_cli, tmp_path
):
    document = tmp_path / "character.json"
    document.write_text(
        json.dumps(
            {"operation": "restore", "expected_revision": 1, "revision": 1}
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "character", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["agentId"] == "companion"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "gateway python -m gateway apply character" in call
    assert str(document) not in call


def test_apply_calls_uses_typed_only_gateway_operation(ubuntu_cli, tmp_path):
    document = tmp_path / "call.json"
    document.write_text(
        json.dumps(
            {
                "operation": "turn",
                "id": "call_" + "a" * 32,
                "request_id": "call_turn_123456789",
                "text": "Think this through.",
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "calls", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["audioIncluded"] is False
    assert "gateway python -m gateway apply calls" in ubuntu_cli.docker_log.read_text()


def test_apply_tools_uses_scoped_gateway_editor_operation(ubuntu_cli, tmp_path):
    document = tmp_path / "tool.json"
    document.write_text(
        json.dumps(
            {
                "operation": "publish",
                "id": "example",
                "expected_revision": 1,
                "expected_publication_version": 0,
                "authorization": "owner_confirmation",
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "tools", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["id"] == "example"
    assert "gateway python -m gateway apply tools" in ubuntu_cli.docker_log.read_text()
