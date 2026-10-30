"""The host helper's operations (ADR-0014): a fixed allowlist, typed arguments, one action at a
time, receipts that survive restarts, and an action cut off mid-way recorded as unknown."""

from __future__ import annotations

import json
import subprocess
import sys
import threading
from pathlib import Path

import pytest

from scripts.host_ops import (
    CUT_OFF,
    NO_START,
    HostOps,
    HostOpsError,
    arguments_digest,
)
from scripts.host_ops_journal import Journal, OperationLock, started
from scripts.setup import _policy_digest

SECRET = "synthetic-container-secret"
SERVICES = ["gateway", "memorygate", "pi"]


def inspect_row(service, *, oneoff=False, restart="unless-stopped", status="running"):
    return {
        "Config": {
            "Labels": {
                "com.docker.compose.project": "conker",
                "com.docker.compose.service": service,
                **({"com.docker.compose.oneoff": "True"} if oneoff else {}),
            },
            "Env": [f"GATEWAY_PI_OWNER_KEY={SECRET}"],
        },
        "State": {
            "Status": status,
            "StartedAt": "2026-10-26T09:00:00.123456789Z",
            "Health": {"Status": "healthy"},
        },
        "RestartCount": 2,
        "HostConfig": {"RestartPolicy": {"Name": restart}},
    }


def docker(rows=None, calls=None):
    rows = rows if rows is not None else [inspect_row(name) for name in SERVICES]

    def reader(argv, *, cwd, env, timeout, limit):
        if calls is not None:
            calls.append(argv)
        if argv[:2] == ["docker", "ps"]:
            assert "label=com.docker.compose.project=conker" in argv
            return "\n".join(f"{index:064x}" for index in range(len(rows))).encode()
        if argv[:2] == ["docker", "inspect"]:
            return json.dumps(rows).encode()
        raise AssertionError(f"unexpected read {argv}")

    return reader


class Runner:
    def __init__(self, result=0):
        self.calls, self.result = [], result

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


def no_command(*_args, **_kwargs):
    pytest.fail("no host command may run")


def host(tmp_path, **kwargs) -> HostOps:
    backups = tmp_path / "backups"
    kwargs.setdefault("reader", docker())
    kwargs.setdefault(
        "policy", lambda: {"destination": str(backups), "retentionCopies": 7}
    )
    kwargs.setdefault("runner", no_command)
    return HostOps(tmp_path / "deploy", tmp_path / "source", "ubuntu", **kwargs)


def action(operation, arguments=None, identity="op-1234567890abcdef"):
    return {"id": identity, "operation": operation, "arguments": arguments or {}}


def refusal(call) -> HostOpsError:
    with pytest.raises(HostOpsError) as error:
        call()
    return error.value


# Reads


def test_service_status_keeps_only_named_fields(tmp_path):
    rows = [
        inspect_row("pi"),
        inspect_row("data-owner", restart="no", status="exited"),
        inspect_row("gateway", oneoff=True),
    ]
    ops = host(tmp_path, reader=docker(rows))
    value = ops.read({"operation": "services.status", "arguments": {}})

    assert value["result"] == {
        "services": [
            {
                "service": "data-owner",
                "state": "exited",
                "health": "healthy",
                "startedAt": None,
                "restarts": 2,
                "oneShot": True,
            },
            {
                "service": "pi",
                "state": "running",
                "health": "healthy",
                "startedAt": "2026-10-26T09:00:00Z",
                "restarts": 2,
                "oneShot": False,
            },
        ],
        "backupLock": False,
        "recoveryHeld": False,
    }
    assert SECRET not in json.dumps(value)
    assert not ops.journal.path.exists(), "a read leaves no receipt"


def test_unreadable_docker_answers_unavailable_without_its_output(tmp_path):
    def reader(argv, **_kwargs):
        raise OSError(f"daemon said {SECRET}")

    error = refusal(
        lambda: host(tmp_path, reader=reader).read(
            {"operation": "services.status", "arguments": {}}
        )
    )
    assert (error.status, error.code) == (503, "host_unavailable")
    assert SECRET not in str(error)


def test_backup_list_names_verified_snapshots_newest_first(tmp_path):
    backups = tmp_path / "backups"
    for name in (
        "snapshot-20261027T040000Z-aaaaaaaa",
        "snapshot-20261029T040000Z-bbbbbbbb",
        ".snapshot-20261029T050000Z-cccccccc.partial",
        "notes",
    ):
        (backups / name).mkdir(parents=True)
    value = host(tmp_path).read({"operation": "backup.list", "arguments": {}})["result"]

    assert value["destination"] == str(backups)
    assert value["ready"] is True and value["separateDisk"] is False
    assert isinstance(value["freeBytes"], int)
    assert value["snapshots"] == [
        {
            "name": "snapshot-20261029T040000Z-bbbbbbbb",
            "createdAt": "2026-10-29T04:00:00Z",
        },
        {
            "name": "snapshot-20261027T040000Z-aaaaaaaa",
            "createdAt": "2026-10-27T04:00:00Z",
        },
    ]
    assert value["partialSnapshots"] == 1


def test_backup_list_says_plainly_when_no_folder_is_saved_or_mounted(tmp_path):
    empty = host(tmp_path, policy=lambda: None).read(
        {"operation": "backup.list", "arguments": {}}
    )["result"]
    assert empty["destination"] is None and empty["ready"] is False
    assert empty["snapshots"] == []
    missing = host(tmp_path).read({"operation": "backup.list", "arguments": {}})
    assert missing["result"]["ready"] is False
    assert missing["result"]["freeBytes"] is None


def test_saved_policy_is_read_like_conker_setup_protection(tmp_path):
    destination = "/mnt/conker-backups"
    policy = {
        "schemaVersion": 1,
        "revision": 3,
        "requestId": "setup-protection-test",
        "destinationKind": "mounted_off_machine",
        "destination": destination,
        "retentionCopies": 7,
        "policyDigest": _policy_digest(destination, 7),
        "recordedAt": "2026-10-29T00:00:00Z",
    }
    answers, calls = [policy], []

    def reader(argv, **kwargs):
        calls.append((argv, kwargs))
        return json.dumps(answers[0]).encode()

    ops = HostOps(tmp_path, tmp_path / "source", "ubuntu", reader=reader)
    assert ops.policy()["destination"] == destination
    argv, kwargs = calls[0]
    assert argv == ["bash", str((tmp_path / "source").resolve() / "conker")] + [
        "setup",
        "protection",
    ]
    assert kwargs["env"]["CONKER_LAYOUT"] == "ubuntu"
    answers[0] = {**policy, "revision": 0, "destination": None}
    assert ops.policy() is None
    answers[0] = {**policy, "destination": "/somewhere/else"}
    assert refusal(ops.policy).status == 503


# The allowlist and typed arguments


@pytest.mark.parametrize(
    "value",
    [
        action("shell", {"command": "id"}),
        action("services.exec", {"service": "pi"}),
        action("backup.delete", {"snapshot": "snapshot-20261029T040000Z-bbbbbbbb"}),
        action("services.status"),
        action("services.restart"),
        action("services.restart", {"service": "pi", "timeout": "0"}),
        action("services.restart", {"service": 1}),
        action("services.restart", {"service": True}),
        action("services.restart", {"service": ["pi"]}),
        action("services.restart", {"service": "../pi"}),
        action("services.restart", {"service": "-t0"}),
        action("services.restart", {"service": "pi; reboot"}),
        action("services.restart", {"service": "Pi"}),
        action("backup.verify", {"snapshot": "../../etc"}),
        action("backup.verify", {"snapshot": "/etc/passwd"}),
        action("backup.verify", {"snapshot": "snapshot-1"}),
        action("backup.run", {"destination": "/tmp"}),
        action("backup.run", None, identity="short"),
        action("backup.run", None, identity="op/../../1234567890abcdef"),
        {**action("backup.run"), "source": "cli"},
        {"operation": "backup.run", "arguments": {}},
        ["backup.run"],
        {"id": "op-1234567890abcdef", "operation": ["backup.run"], "arguments": {}},
    ],
)
def test_actions_outside_the_allowlist_are_refused_before_anything_runs(
    tmp_path, value
):
    ops = host(tmp_path, reader=lambda *_a, **_k: pytest.fail("no host read"))
    error = refusal(lambda: ops.start(value))
    assert (error.status, error.code) == (422, "invalid_host_operation")
    assert not ops.journal.path.exists()


@pytest.mark.parametrize(
    "value",
    [
        {"operation": "services.restart", "arguments": {"service": "pi"}},
        {"operation": "services.status", "arguments": {"all": "yes"}},
        {"operation": "services.status"},
        {"operation": "services.status", "arguments": {}, "id": "x"},
        {"operation": "logs.raw", "arguments": {}},
    ],
)
def test_reads_outside_the_allowlist_are_refused(tmp_path, value):
    ops = host(tmp_path, reader=lambda *_a, **_k: pytest.fail("no host read"))
    assert refusal(lambda: ops.read(value)).status == 422


def test_restart_runs_only_the_fixed_cli_argv_and_keeps_no_output(tmp_path):
    runner = Runner()
    ops = host(tmp_path, runner=runner)
    receipt = ops.start(
        action("services.restart", {"service": "memorygate"}), wait=True
    )

    argv, kwargs = runner.calls[0]
    assert argv == ["bash", str(ops.source / "conker"), "restart", "memorygate"]
    assert kwargs["timeout"] == 15 * 60 and isinstance(kwargs["keep_fd"], int)
    assert kwargs["env"]["CONKER_DEPLOY_DIR"] == str(ops.root)
    assert receipt["outcome"] == "done" and receipt["reason"] is None
    assert receipt["source"] == "ui" and receipt["check"] is None
    assert receipt["arguments"] == {"service": "memorygate"}
    assert receipt["argumentsDigest"] == arguments_digest(
        "services.restart", {"service": "memorygate"}
    )
    assert receipt["endedAt"] is not None
    assert SECRET not in ops.journal.path.read_text(encoding="utf-8")


@pytest.mark.parametrize("service", ["postgresx", "data-owner"])
def test_restart_refuses_a_service_this_installation_does_not_run(tmp_path, service):
    rows = [inspect_row("pi"), inspect_row("data-owner", restart="no")]
    ops = host(tmp_path, reader=docker(rows))
    error = refusal(lambda: ops.start(action("services.restart", {"service": service})))
    assert (error.status, error.code) == (409, "host_operation_refused")
    assert ops.receipts()["operations"] == []


def test_backup_actions_use_the_saved_folder_and_names_inside_it(tmp_path):
    snapshot = tmp_path / "backups" / "snapshot-20261029T040000Z-bbbbbbbb"
    snapshot.mkdir(parents=True)
    runner = Runner()
    ops = host(tmp_path, runner=runner)
    ops.start(
        action("backup.verify", {"snapshot": snapshot.name}, "op-verify-0000000001"),
        wait=True,
    )
    ops.start(action("backup.run", None, "op-backup-0000000001"), wait=True)

    (verify, verify_options), (backup, backup_options) = runner.calls
    assert verify[2:] == ["verify-backup", str(snapshot)]
    assert verify_options["timeout"] == 2 * 3600
    assert backup[2:] == ["setup", "run", "protection"]
    # A backup is never stopped mid-capture: that would leave Conker's writers stopped.
    assert backup_options["timeout"] is None


@pytest.mark.parametrize(
    ("policy", "operation", "arguments", "message"),
    [
        (lambda: None, "backup.run", {}, "No backup folder is saved yet"),
        (
            lambda: {"destination": "/not/mounted/anywhere", "retentionCopies": 7},
            "backup.run",
            {},
            "Check that the disk is mounted",
        ),
        (
            None,
            "backup.verify",
            {"snapshot": "snapshot-20261029T040000Z-dddddddd"},
            "not in the backup folder",
        ),
    ],
)
def test_backup_actions_fail_clearly_without_their_folder(
    tmp_path, policy, operation, arguments, message
):
    (tmp_path / "backups").mkdir()
    ops = host(tmp_path, **({"policy": policy} if policy else {}))
    error = refusal(lambda: ops.start(action(operation, arguments)))
    assert error.status == 409 and message in str(error)


# Retries, the lock and the CLI's own guards


def test_same_id_returns_the_same_action_and_never_a_second_run(tmp_path):
    runner = Runner()
    ops = host(tmp_path, runner=runner)
    first = ops.start(action("services.restart", {"service": "pi"}), wait=True)
    again = ops.start(action("services.restart", {"service": "pi"}), wait=True)

    assert again == first and len(runner.calls) == 1
    error = refusal(
        lambda: ops.start(action("services.restart", {"service": "gateway"}))
    )
    assert (error.status, error.code) == (409, "operation_id_conflict")


def test_one_action_at_a_time(tmp_path):
    release, running = threading.Event(), threading.Event()

    def runner(argv, **kwargs):
        running.set()
        assert release.wait(10)
        return 0

    ops = host(tmp_path, runner=runner)
    first = ops.start(
        action("services.restart", {"service": "pi"}, "op-first-000000001")
    )
    assert running.wait(10)
    assert first["outcome"] == "working"

    error = refusal(lambda: ops.start(action("backup.run", None, "op-second-00000001")))
    assert (error.status, error.code) == (409, "host_busy")
    # A retry of the running action is answered with its receipt, not refused.
    retry = ops.start(
        action("services.restart", {"service": "pi"}, "op-first-000000001")
    )
    assert retry["outcome"] == "working"
    assert ops.settle() == 0, "a live action is never marked unknown"

    release.set()
    for _ in range(200):
        if ops.receipt("op-first-000000001")["outcome"] != "working":
            break
        threading.Event().wait(0.05)
    assert ops.receipt("op-first-000000001")["outcome"] == "done"
    assert [row["id"] for row in ops.receipts()["operations"]] == ["op-first-000000001"]


@pytest.mark.parametrize(
    ("name", "message"),
    [
        (".conker-backup.lock", "A backup is running"),
        (".conker-recovery.json", "recovery is held"),
    ],
)
def test_the_clis_backup_lock_and_recovery_hold_refuse_every_action(
    tmp_path, name, message
):
    ops = host(tmp_path)
    (ops.root / name).touch()
    error = refusal(lambda: ops.start(action("services.restart", {"service": "pi"})))
    assert (error.status, error.code) == (409, "host_busy") and message in str(error)
    assert ops.receipts()["operations"] == []
    status = ops.read({"operation": "services.status", "arguments": {}})["result"]
    assert status["backupLock"] or status["recoveryHeld"]


HOLD = """
import sys, time
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from scripts.host_ops_journal import OperationLock
lock = OperationLock(Path(sys.argv[2]))
assert lock.acquire()
print("held", flush=True)
sys.stdin.read()
"""


def test_the_lock_spans_processes_and_the_kernel_drops_it_when_its_holder_dies(
    tmp_path,
):
    ops = host(tmp_path, runner=Runner())
    root = Path(__file__).resolve().parents[1]
    holder = subprocess.Popen(
        [sys.executable, "-c", HOLD, str(root), str(ops.lock_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert holder.stdout.readline().strip() == "held"
        error = refusal(
            lambda: ops.start(action("services.restart", {"service": "pi"}))
        )
        assert error.code == "host_busy"
    finally:
        holder.kill()
        holder.wait(10)
    assert (
        ops.start(action("services.restart", {"service": "pi"}), wait=True)["outcome"]
        == "done"
    )


# Receipts across restarts, and the unknown outcome


def test_receipts_survive_a_helper_restart(tmp_path):
    host(tmp_path, runner=Runner()).start(
        action("services.restart", {"service": "pi"}), wait=True
    )
    later = host(tmp_path)
    value = later.receipts()
    assert [row["outcome"] for row in value["operations"]] == ["done"]
    assert value["damagedRecords"] == 0
    for line in later.journal.path.read_text(encoding="utf-8").splitlines():
        assert set(json.loads(line)) <= {
            "v",
            "event",
            "id",
            "operation",
            "arguments",
            "argumentsDigest",
            "source",
            "startedAt",
            "outcome",
            "endedAt",
            "reason",
        }


@pytest.mark.parametrize(
    ("operation", "arguments", "check"),
    [
        ("services.restart", {"service": "pi"}, ("services.status", {})),
        ("backup.run", {}, ("backup.list", {})),
        (
            "backup.verify",
            {"snapshot": "snapshot-20261029T040000Z-bbbbbbbb"},
            ("backup.verify", {"snapshot": "snapshot-20261029T040000Z-bbbbbbbb"}),
        ),
    ],
)
def test_an_action_cut_off_by_a_restart_becomes_unknown_and_is_never_rerun(
    tmp_path, operation, arguments, check
):
    ops = host(tmp_path)
    identity = "op-cut-off-00000001"
    digest = arguments_digest(operation, arguments)
    ops.journal.append(
        started(identity, operation, arguments, digest, "ui", "2026-10-29T09:00:00Z")
    )
    assert ops.receipt(identity)["outcome"] == "unknown"  # nobody holds the lock

    restarted = host(tmp_path, runner=no_command)
    assert restarted.settle() == 0, "settled once, recorded once"
    receipt = restarted.receipt(identity)
    assert receipt["outcome"] == "unknown" and receipt["reason"] == CUT_OFF
    assert receipt["check"] == {"operation": check[0], "arguments": check[1]}
    retry = restarted.start(
        {"id": identity, "operation": operation, "arguments": arguments}
    )
    assert retry == receipt


def test_an_interrupted_cli_run_records_unknown(tmp_path):
    ops = host(tmp_path, runner=Runner(KeyboardInterrupt()))
    with pytest.raises(KeyboardInterrupt):
        ops.start(action("services.restart", {"service": "pi"}), wait=True)
    receipt = ops.receipt("op-1234567890abcdef")
    assert receipt["outcome"] == "unknown" and receipt["check"]["operation"] == (
        "services.status"
    )
    assert OperationLock(ops.lock_path).acquire(), "the lock was released"


@pytest.mark.parametrize(
    ("result", "outcome", "reason"),
    [
        (
            subprocess.TimeoutExpired("bash", 900, output=SECRET.encode()),
            "unknown",
            "longer than 15 minutes",
        ),
        (1, "failed", "did not restart"),
        (OSError(SECRET), "failed", NO_START),
    ],
)
def test_timeouts_are_unknown_and_failures_say_why(tmp_path, result, outcome, reason):
    receipt = host(tmp_path, runner=Runner(result)).start(
        action("services.restart", {"service": "pi"}), wait=True
    )
    assert receipt["outcome"] == outcome and reason in receipt["reason"]
    assert (receipt["check"] is not None) == (outcome == "unknown")
    assert SECRET not in json.dumps(receipt)


def test_damaged_journal_lines_are_counted_never_trusted(tmp_path):
    ops = host(tmp_path, runner=Runner())
    ops.journal.path.write_bytes(b'not json\n{"v":1,"event":"finished","id":"op-1')
    receipt = ops.start(action("services.restart", {"service": "pi"}), wait=True)
    value = ops.receipts()
    assert receipt["outcome"] == "done"
    assert value["damagedRecords"] == 2
    assert [row["outcome"] for row in value["operations"]] == ["done"]


def test_journal_folds_records_only_in_order():
    receipts = {}
    from scripts.host_ops_journal import _apply, finished

    assert not _apply(receipts, finished("op-1234567890abcdef", "done", None, "t"))
    assert _apply(
        receipts,
        started("op-1234567890abcdef", "backup.run", {}, "a" * 64, "cli", "t"),
    )
    assert not _apply(
        receipts,
        started("op-1234567890abcdef", "backup.run", {}, "a" * 64, "cli", "t"),
    )
    assert _apply(receipts, finished("op-1234567890abcdef", "done", None, "t"))
    assert not _apply(receipts, finished("op-1234567890abcdef", "failed", None, "t"))
    assert receipts["op-1234567890abcdef"]["outcome"] == "done"
    assert not _apply(
        {}, started("op-1234567890abcdef", "backup.run", {}, "a" * 64, "agent", "t")
    )


def test_journal_lives_outside_the_gateway_mount(tmp_path):
    ops = host(tmp_path)
    assert ops.journal.path.parent == ops.root / "state" / "host-ops"
    assert "provider-control" not in ops.journal.path.parts
    assert Journal(ops.journal.path.parent).receipts() == ({}, 0)
