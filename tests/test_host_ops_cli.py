"""The host helper's two doors (ADR-0014): `conker ops` on the host, which works with the helper
down, and the /host routes on the gateway-only provider-control socket."""

from __future__ import annotations

import http.client
import json
import shutil
import socketserver
import sys
import threading
from functools import partial
from pathlib import Path

import pytest
import yaml

from scripts import host_ops_cli
from scripts.host_ops import HostOps, route
from scripts.provider_control import ProviderControl, handler
from tests.test_host_ops import Runner, action, docker, host
from tests.ubuntu_generator import prepare

ROOT = Path(__file__).resolve().parents[1]


def cli(tmp_path, *arguments):
    return host_ops_cli.main(
        [
            "--root",
            str(tmp_path / "deploy"),
            "--source",
            str(tmp_path / "source"),
            "--layout",
            "ubuntu",
            *arguments,
        ]
    )


def test_conker_ops_lists_receipts_newest_first(tmp_path, capsys):
    assert cli(tmp_path) == 0
    assert capsys.readouterr().out.strip() == "No server actions yet."
    ops = host(tmp_path, runner=Runner(1))
    ops.start(action("services.restart", {"service": "pi"}), wait=True)

    assert cli(tmp_path, "list") == 0
    out = capsys.readouterr().out
    assert "failed   services.restart service=pi  (ui, op-1234567890abcdef)" in out
    assert "did not restart" in out
    assert cli(tmp_path, "show", "op-1234567890abcdef") == 0
    assert json.loads(capsys.readouterr().out)["outcome"] == "failed"
    assert cli(tmp_path, "show", "op-missing-0000000") == 1


def test_conker_ops_run_uses_the_same_table_lock_and_journal(
    tmp_path, capsys, monkeypatch
):
    runner = Runner()
    monkeypatch.setattr(
        host_ops_cli,
        "HostOps",
        partial(HostOps, runner=runner, reader=docker(), policy=lambda: None),
    )
    assert cli(tmp_path, "run", "services.restart", "service=pi") == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["source"] == "cli" and receipt["outcome"] == "done"
    assert runner.calls[0][0][2:] == ["restart", "pi"]
    assert cli(tmp_path, "run", "services.status") == 0
    assert json.loads(capsys.readouterr().out)["operation"] == "services.status"
    assert cli(tmp_path, "run", "backup.run") == 1
    assert "No backup folder is saved yet" in capsys.readouterr().err
    assert cli(tmp_path, "run", "services.restart", "service=../pi") == 1
    with pytest.raises(SystemExit):
        cli(tmp_path, "run", "services.restart", "service=pi", "service=gateway")
    with pytest.raises(SystemExit):
        cli(tmp_path, "run", "shell", "command=id")
    assert len(runner.calls) == 1


# The socket routes


def test_routes_answer_fixed_codes_and_plain_words(tmp_path):
    ops = host(tmp_path, runner=Runner())
    assert route(None, "GET", "/host/ops", None)[0] == 503
    assert route(ops, "GET", "/host/ops", None) == (
        200,
        {"schemaVersion": 1, "operations": [], "damagedRecords": 0},
    )
    assert route(ops, "GET", "/host/ops/op-missing-0000000", None)[0] == 404
    assert route(ops, "GET", "/host/ops/..%2F..%2Fjournal", None)[0] == 404
    assert route(ops, "GET", "/host/ops?limit=1000", None)[0] == 404
    assert route(ops, "POST", "/host/shell", {"command": "id"})[0] == 404
    status, value = route(ops, "POST", "/host/ops", {"operation": "shell"})
    assert status == 422 and value["error"] == "invalid_host_operation"
    assert "shell" not in value["message"]
    status, value = route(
        ops, "POST", "/host/ops", action("services.restart", {"service": "pi"})
    )
    assert status == 200 and value["id"] == "op-1234567890abcdef"
    assert route(ops, "GET", "/host/ops/op-1234567890abcdef", None)[0] == 200


def test_helper_socket_handler_serves_host_routes_beside_providers(tmp_path):
    control = ProviderControl(tmp_path, tmp_path / "source", "ubuntu")
    ops = host(tmp_path)

    # The same handler the Unix socket serves; TCP here so the test also runs on Windows.
    server = socketserver.TCPServer(("127.0.0.1", 0), handler(control, None, ops))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()

    def request(method, path, body=None, content_type="application/json"):
        connection = http.client.HTTPConnection(*server.server_address, timeout=10)
        try:
            payload = json.dumps(body) if body is not None else None
            headers = {"Content-Type": content_type} if body is not None else {}
            connection.request(method, path, body=payload, headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    try:
        assert request("GET", "/providers")[0] == 200
        assert request("GET", "/host/ops")[0] == 200
        status, value = request(
            "POST", "/host/read", {"operation": "services.status", "arguments": {}}
        )
        assert status == 200 and value["result"]["services"]
        assert request("POST", "/host/ops", {"operation": "shell"})[0] == 422
        assert (
            request("POST", "/host/ops", action("backup.run"), "text/plain")[0] == 422
        )
        assert request("POST", "/host/exec", {"operation": "shell"})[0] == 404
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


def test_without_a_working_journal_host_routes_answer_unavailable(tmp_path):
    control = ProviderControl(tmp_path, tmp_path / "source", "ubuntu")
    server = socketserver.TCPServer(("127.0.0.1", 0), handler(control, None, None))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        connection = http.client.HTTPConnection(*server.server_address, timeout=10)
        connection.request("GET", "/host/ops")
        response = connection.getresponse()
        assert response.status == 503
        assert json.loads(response.read())["error"] == "host_unavailable"
        connection.close()
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


# Who can reach the helper


def mounts(service: dict) -> list[str]:
    return [
        volume if isinstance(volume, str) else volume.get("source", "")
        for volume in service.get("volumes", [])
    ]


def test_only_the_gateway_mounts_the_helper_socket_and_nothing_mounts_the_journal(
    tmp_path,
):
    compose = {}
    for name in (
        "docker-compose.yml",
        "docker-compose.terminal.yml",
        "docker-compose.sandbox.yml",
    ):
        for service, value in yaml.safe_load((ROOT / name).read_text())[
            "services"
        ].items():
            compose.setdefault(service, []).extend(mounts(value))
    prepare(tmp_path)
    ubuntu = json.loads((tmp_path / "compose.json").read_text(encoding="utf-8"))[
        "services"
    ]
    for layout in (compose, {name: mounts(value) for name, value in ubuntu.items()}):
        reaching = {
            service
            for service, volumes in layout.items()
            if any("provider-control" in volume for volume in volumes)
        }
        assert reaching == {"gateway"}
        assert not any(
            "host-ops" in volume for volumes in layout.values() for volume in volumes
        )


# The installed launcher


@pytest.fixture()
def launcher(ubuntu_cli):
    scripts = ubuntu_cli.deployment / "sources/companion/scripts"
    for name in (
        "host_ops.py",
        "host_ops_cli.py",
        "host_ops_journal.py",
        "host_ops_reads.py",
    ):
        shutil.copy2(ROOT / "scripts" / name, scripts / name)
    return ubuntu_cli


def test_conker_ops_works_with_the_helper_down(launcher):
    result = launcher("ops")
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "No server actions yet."
    assert (launcher.deployment / "state/host-ops").is_dir()
    assert not launcher.docker_log.exists()


def test_conker_restart_takes_one_named_service(launcher):
    assert launcher("restart", "pi").returncode == 0
    calls = launcher.docker_log.read_text(encoding="utf-8").splitlines()
    assert any(call.endswith("restart pi") for call in calls)
    for bad in (
        ("restart", "-t0"),
        ("restart", "pi;reboot"),
        ("restart", "pi", "gateway"),
    ):
        result = launcher(*bad)
        assert result.returncode == 2
    assert len(launcher.docker_log.read_text(encoding="utf-8").splitlines()) == len(
        calls
    )


def restarts(launcher) -> list[str]:
    return [
        call.rsplit(" restart", 1)[1].strip() or "everything"
        for call in launcher.docker_log.read_text(encoding="utf-8").splitlines()
        if " restart" in call
    ]


def test_restarting_pi_restarts_the_services_in_its_network_after_it(launcher):
    # Restarting Pi gives it a new network namespace; its sharers must join the new one.
    launcher.environment["FAKE_SERVICES"] = "pi gateway decisions subscriptions"
    assert launcher("restart", "pi").returncode == 0
    assert restarts(launcher) == ["pi", "decisions", "subscriptions"]

    launcher.docker_log.unlink()
    assert launcher("restart").returncode == 0
    assert restarts(launcher) == ["everything", "decisions", "subscriptions"]

    launcher.docker_log.unlink()
    assert launcher("restart", "gateway").returncode == 0
    assert restarts(launcher) == ["gateway"]

    # A layout without them restarts Pi alone.
    launcher.docker_log.unlink()
    launcher.environment["FAKE_SERVICES"] = "pi gateway"
    assert launcher("restart", "pi").returncode == 0
    assert restarts(launcher) == ["pi"]


INSPECT = json.dumps(
    [
        {
            "Config": {"Labels": {"com.docker.compose.service": "pi"}},
            "State": {"Status": "running", "StartedAt": "2026-10-26T09:00:00Z"},
            "HostConfig": {"RestartPolicy": {"Name": "unless-stopped"}},
        }
    ]
)


@pytest.mark.skipif(sys.platform == "win32", reason="the fake Docker is a POSIX script")
def test_conker_ops_run_restarts_through_the_launcher_with_a_receipt(launcher):
    docker = launcher.docker_log.parent / "bin/docker"
    docker.write_text(
        "#!/bin/sh\n"
        'printf \'%s\\n\' "$*" >> "$DOCKER_LOG"\n'
        'case "$*" in\n'
        f"  'ps '*) printf '%s\\n' {'a' * 64} ;;\n"
        f"  'inspect '*) printf '%s\\n' '{INSPECT}' ;;\n"
        '  *) printf \'%s\\n\' \'{"status":"ok","checks":{}}\' ;;\n'
        "esac\n",
        encoding="utf-8",
    )
    refused = launcher("ops", "run", "services.restart", "service=memorygate")
    assert refused.returncode == 1 and "no service with that name" in refused.stderr

    result = launcher("ops", "run", "services.restart", "service=pi")
    assert result.returncode == 0, result.stderr
    receipt = json.loads(result.stdout)
    assert receipt["outcome"] == "done" and receipt["source"] == "cli"
    calls = launcher.docker_log.read_text(encoding="utf-8").splitlines()
    assert any(
        "compose --project-directory" in call and call.endswith("restart pi")
        for call in calls
    )
    listing = launcher("ops")
    assert "done     services.restart service=pi  (cli, cli-" in listing.stdout
