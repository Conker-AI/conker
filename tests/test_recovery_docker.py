"""A real Docker/PostgreSQL drill, opt-in locally and mandatory in its CI job.

Only uniquely named fixture containers/volumes are used. No installed Conker,
host socket mount, application worker, or model download is involved.
"""

from __future__ import annotations

import json
import os
import uuid

import pytest
from test_recovery import ROOT, Engine, operator_review, recovery

pytestmark = pytest.mark.skipif(
    os.environ.get("CONKER_RECOVERY_DOCKER") != "1",
    reason="set CONKER_RECOVERY_DOCKER=1 on Linux with Docker to run the real recovery drill",
)


@pytest.fixture
def live_stack(tmp_path):
    docker = recovery.Docker()
    versions = dict(
        line.split("=", 1)
        for line in (ROOT / "versions.env").read_text().splitlines()
        if line and not line.startswith("#")
    )
    gate_image = "ghcr.io/conker-ai/toolgate:" + versions["TOOLGATE_VERSION"]
    postgres_image = versions["POSTGRES_IMAGE"]
    # Pull only before creating a recovery environment. Recovery itself always
    # uses the captured image IDs with --pull never.
    docker.run("pull", gate_image)
    docker.run("pull", postgres_image)
    data = Engine(tmp_path)
    root = tmp_path / "source-install"
    root.mkdir()
    (root / ".env").write_text("TEST_INSTALL=1\n")
    (root / "versions.env").write_text("# fixture uses resolved image references\n")
    project = "conker-drill-" + uuid.uuid4().hex[:12]
    services = {}
    for service in recovery.SERVICES:
        spec = {
            "image": gate_image,
            "network_mode": "none",
            "entrypoint": [
                "python",
                "-c",
                "import signal,sys,time; signal.signal(signal.SIGTERM, lambda *_: sys.exit(0)); time.sleep(3600)",
            ],
            "volumes": [],
        }
        if service in recovery.STORES:
            spec["volumes"].append(
                {
                    "type": "bind",
                    "source": str(data.volumes["original-" + service]),
                    "target": recovery.STORES[service],
                }
            )
        if service == "toolgate":
            spec["environment"] = {"TOOLGATE_DATA_DIR": "/var/lib/toolgate"}
        if service == "memorygate":
            spec["volumes"] = [
                {
                    "type": "bind",
                    "source": str(data.volumes["original-memorygate"]),
                    "target": "/data",
                },
                {
                    "type": "bind",
                    "source": str(tmp_path / "backup-location/memorygate"),
                    "target": "/data/backups",
                },
            ]
        services[service] = spec
    services["postgres"] = {
        "image": postgres_image,
        "network_mode": "none",
        "environment": {
            "POSTGRES_USER": "memorygate",
            "POSTGRES_DB": "memorygate",
            "POSTGRES_PASSWORD": "fixture-only-password",
        },
        "volumes": [
            {
                "type": "volume",
                "source": "postgres",
                "target": "/var/lib/postgresql/data",
            }
        ],
    }
    compose_file = root / "docker-compose.yml"
    compose_file.write_text(
        json.dumps({"name": project, "services": services, "volumes": {"postgres": {}}})
    )
    compose = ["compose", "-f", str(compose_file)]
    try:
        docker.run(*compose, "up", "-d")
        postgres = docker.run(*compose, "ps", "-q", "postgres").stdout.decode().strip()
        recovery.wait_postgres(docker, postgres)
        seed = tmp_path / "seed.sql"
        seed.write_text(
            "CREATE TABLE ai_runtime_settings(id TEXT,api_key_encrypted TEXT);\n"
            "INSERT INTO ai_runtime_settings VALUES ('singleton','"
            + data.memory_token.decode()
            + "');\n"
            "CREATE TABLE processing_jobs(id TEXT,status TEXT);\n"
            "INSERT INTO processing_jobs VALUES ('pending-job','pending');\n"
            "CREATE TABLE owner_data(value TEXT); INSERT INTO owner_data VALUES ('persisted memory');\n"
        )
        with seed.open("rb") as stream:
            docker.run(
                "exec",
                "-i",
                postgres,
                "psql",
                "-U",
                "memorygate",
                "-d",
                "memorygate",
                "-v",
                "ON_ERROR_STOP=1",
                input=stream,
            )
        gate = docker.run(*compose, "ps", "-q", "toolgate").stdout.decode().strip()
        create = (
            "from toolgate.core import control_plane as cp; "
            "r=cp.create_verification_request('echo','fixture','agent','tool','echo',{},1,900,'agent-id'); "
            "cp.decide_request(r['id'],'approved','owner'); print(r['id'])"
        )
        approval = (
            docker.run("exec", gate, "python", "-c", create).stdout.decode().strip()
        )
        yield root, docker, gate_image, approval
    finally:
        # The reports are written before allocation. Even an interrupted drill
        # leaves the exact names needed for cleanup, without a global prune.
        for report in tmp_path.glob("recovered-*/.conker-recovery.json"):
            state = json.loads(report.read_text())
            for container in state["containers"]:
                assert container.startswith("conker-recovery-")
                docker.run("rm", "-f", container, check=False)
            for volume in state["volumes"].values():
                assert volume.startswith("conker-recovery-")
                docker.run("volume", "rm", volume, check=False)
        docker.run(*compose, "down", "--volumes", check=False)


def test_real_backup_restore_and_interruption(live_stack, tmp_path):
    root, docker, gate_image, approval = live_stack
    snapshot = recovery.backup(root, None, docker)
    state = recovery.restore(snapshot, tmp_path / "recovered-normal", docker)
    assert state["vault_values_verified"] == 1
    assert state["memory_provider_key_verified"] is True
    assert approval in state["invalidated_requests"]
    assert state["invalidated_browser_sessions"] == 1
    postgres = state["containers"][0]
    restored = docker.json("inspect", postgres)[0]
    assert restored["HostConfig"]["NetworkMode"] == "none"
    assert not restored["HostConfig"].get("PortBindings")
    assert restored["State"]["Running"] is False
    # The only restarted process is the isolated database, never Pi or a gate.
    docker.run("start", postgres)
    recovery.wait_postgres(docker, postgres)
    rows = docker.run(
        "exec",
        postgres,
        "psql",
        "-U",
        "memorygate",
        "-d",
        "memorygate",
        "-At",
        "-c",
        "SELECT value FROM owner_data; SELECT status FROM processing_jobs",
    ).stdout.decode()
    assert "persisted memory" in rows and "recovery_held" in rows
    docker.run("stop", postgres)
    check_approval = (
        "import sys; from toolgate.core import control_plane as cp; "
        "allowed,_=cp.consume_verification(sys.argv[1],'tool','echo',{},1,'agent','agent-id'); "
        "assert not allowed; assert cp.settings()['lockdown']"
    )
    docker.run(
        "run",
        "--rm",
        "--pull",
        "never",
        "--network",
        "none",
        "--mount",
        "type=volume,src=" + state["volumes"]["toolgate"] + ",dst=/var/lib/toolgate",
        "--env",
        "TOOLGATE_DATA_DIR=/var/lib/toolgate",
        "--entrypoint",
        "python",
        gate_image,
        "-c",
        check_approval,
        approval,
    )
    review_path = tmp_path / "operator-review.json"
    operator_review(state, review_path)
    recovery.review_recovery(tmp_path / "recovered-normal", review_path)
    ready = recovery.prove_service_ready(tmp_path / "recovered-normal", docker)
    assert ready["status"] == "service_ready"
    assert (tmp_path / "recovered-normal" / recovery.HOLD_FILE).is_file()

    class Interrupted(recovery.Docker):
        def run(self, *args, **kwargs):
            result = super().run(*args, **kwargs)
            if "pg_restore" in args:
                raise KeyboardInterrupt(
                    "interrupt after PostgreSQL accepted the restore"
                )
            return result

    with pytest.raises(KeyboardInterrupt):
        recovery.restore(snapshot, tmp_path / "recovered-interrupted", Interrupted())
    interrupted = json.loads(
        (tmp_path / "recovered-interrupted" / recovery.HOLD_FILE).read_text()
    )
    assert interrupted["status"] == "interrupted"
    assert interrupted["applications_started"] is False
    for container in interrupted["containers"]:
        info = docker.json("inspect", container)[0]
        assert info["HostConfig"]["NetworkMode"] == "none"
        assert not info["HostConfig"].get("PortBindings")
