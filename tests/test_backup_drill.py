"""The restore drill against a real snapshot (recorded Docker transport, production store code):
it passes and leaves nothing behind, cleans up when the restore fails midway, refuses when busy
or short of disk, and its receipt holds no secret."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import cast

import pytest
import recovery  # on sys.path through tests.recovery_fakes
import recovery_data
from recovery_docker import Docker

from scripts import backup_cli, backup_drill
from scripts.backup_schedule import UPDATE_BUSY, UPDATE_MARKERS, journal, last_record
from scripts.host_ops_journal import OperationLock
from tests.recovery_fakes import Engine
from tests.test_backup_schedule import hold_update
from tests.test_host_ops import host

ROOT = Path(__file__).resolve().parents[1]
LIVE = "conker"
SECRETS = ("credential-must-survive", "original-install-secret", "password-verifier")


class DrillEngine(Engine):
    """Adds the label listings the drill uses; the source containers belong to the live project."""

    def __init__(self, tmp):
        super().__init__(tmp)
        for container in self.containers.values():
            container["Config"]["Labels"] = {"com.docker.compose.project": LIVE}
        self.fail_at = None

    def run(self, *args, output=None, input=None, check=True):
        if self.fail_at and self.fail_at in args:
            raise recovery_data.RecoveryError("Docker pg_restore failed (exit 1).")
        if args[0] == "ps" or args[:2] == ("volume", "ls"):
            key, value = args[args.index("--filter") + 1].removeprefix("label=").split("=", 1)
            if args[0] == "ps":
                names = [
                    name
                    for name, item in self.containers.items()
                    if (item["Config"].get("Labels") or {}).get(key) == value
                ]
            else:
                names = [n for n, labels in self.volume_labels.items() if labels.get(key) == value]
            self.calls.append(args)
            return subprocess.CompletedProcess(args, 0, "\n".join(names).encode(), b"")
        return super().run(*args, output=output, input=input, check=check)

    def copies(self):
        """Every container and volume a restore made."""
        return [
            name
            for name in [*self.containers, *self.volumes]
            if name.startswith("conker-recovery-")
        ]


@pytest.fixture
def stack(tmp_path):
    root = tmp_path / "install"
    root.mkdir()
    for name in (".env", "versions.env", "docker-compose.yml"):
        (root / name).write_text("test configuration\n")
    engine = DrillEngine(tmp_path)
    snapshot = recovery.backup(root, None, cast(Docker, engine))
    workspace = root / ".conker" / "backup-schedule"
    workspace.mkdir(parents=True)
    lock = OperationLock(root / ".conker" / "operation.lock")
    return root, engine, snapshot, workspace, lock


def run(stack, **kwargs):
    root, engine, snapshot, workspace, lock = stack
    kwargs.setdefault("free", lambda path: 1 << 50)
    return backup_drill.drill(root, snapshot, workspace, lock, engine, **kwargs)


def test_drill_restores_checks_and_removes_every_trace(stack):
    _, engine, snapshot, workspace, _ = stack
    live = sorted(engine.containers), sorted(engine.volumes)

    receipt = run(stack)

    assert receipt["outcome"] == "passed", receipt
    assert receipt["checks"] == list(backup_drill.CHECKS)
    assert receipt["snapshot"] == snapshot.name and receipt["leftovers"] is None
    assert engine.copies() == []
    assert (sorted(engine.containers), sorted(engine.volumes)) == live
    assert list(workspace.iterdir()) == []
    # The restore made a labelled copy first, and the drill removed exactly that.
    assert any(call[:2] == ("volume", "create") for call in engine.calls)
    assert all(
        call[2].startswith("conker-recovery-")
        for call in engine.calls
        if call[:2] in {("rm", "-f"), ("volume", "rm")}
    )
    # Only the isolated database ever ran; Pi and the gates never started.
    runs = [call for call in engine.calls if call[0] == "run" and "--entrypoint" not in call]
    assert len(runs) == 1 and "--network" in runs[0] and "none" in runs[0]


def test_receipt_holds_names_and_outcomes_never_secrets(stack):
    receipt = run(stack)
    text = json.dumps(receipt)

    assert set(receipt) == {
        "v", "kind", "id", "source", "snapshot", "startedAt", "endedAt",
        "durationSeconds", "outcome", "checks", "leftovers", "swept", "reason",
    }
    assert receipt["swept"] == 0
    assert not any(secret in text for secret in SECRETS)
    assert "POSTGRES_PASSWORD" not in text and str(stack[0]) not in text


def test_a_restore_failing_midway_still_removes_what_it_made(stack):
    _, engine, _, workspace, _ = stack
    engine.fail_at = "pg_restore"

    receipt = run(stack)

    assert receipt["outcome"] == "failed"
    assert receipt["reason"] == "Docker pg_restore failed (exit 1)."
    assert receipt["checks"] == ["snapshot verified", "cleaned up"]
    assert engine.copies() == [] and list(workspace.iterdir()) == []


def test_an_interrupted_drill_cleans_up_before_the_interrupt_goes_on(stack):
    _, engine, _, workspace, lock = stack
    engine.fail_restore = True  # KeyboardInterrupt during pg_restore

    with pytest.raises(KeyboardInterrupt):
        run(stack)

    assert engine.copies() == [] and list(workspace.iterdir()) == []
    assert lock.acquire()  # the lock went with the interrupted drill
    lock.release()


def test_leftovers_are_named_when_a_copy_cannot_be_removed(stack):
    _, engine, _, _, _ = stack
    original = engine.run

    def stubborn(*args, **kwargs):
        if args[:2] == ("volume", "rm"):
            return subprocess.CompletedProcess(args, 0, b"", b"")  # Docker kept it
        return original(*args, **kwargs)

    engine.run = stubborn
    receipt = run(stack)

    assert receipt["outcome"] == "failed"
    assert receipt["leftovers"].startswith("containers or volumes labelled conker.recovery=")
    assert "cleaned up" not in receipt["checks"]


def test_a_changed_live_stack_fails_the_drill(stack):
    _, engine, _, _, _ = stack
    original = engine.run

    def recreate(*args, **kwargs):
        result = original(*args, **kwargs)
        if args[:2] == ("volume", "create"):
            engine.containers["replaced-pi"] = {"Config": {"Labels": {"com.docker.compose.project": LIVE}}}
        return result

    engine.run = recreate
    receipt = run(stack)

    assert receipt["outcome"] == "failed"
    assert "live Conker containers or volumes changed" in receipt["reason"]
    assert "live stack untouched" not in receipt["checks"]


@pytest.mark.parametrize(
    "hold",
    ["lock", ".conker-backup.lock", ".conker-recovery.json", "disk", *UPDATE_MARKERS],
)
def test_drill_refuses_at_once_and_touches_nothing(stack, hold):
    root, engine, snapshot, workspace, lock = stack
    other = OperationLock(lock.path)
    kwargs = {}
    if hold == "lock":
        assert other.acquire()
    elif hold == "disk":
        kwargs["free"] = lambda path: 2 * backup_drill.snapshot_size(snapshot) - 1
    elif hold in UPDATE_MARKERS:
        hold_update(root, hold)  # `conker update` keeps its own lock, not the helper's
    else:
        (root / hold).write_text("held")
    calls = len(engine.calls)
    try:
        receipt = run(stack, **kwargs)
    finally:
        other.release()

    assert receipt["outcome"] == "refused" and receipt["reason"]
    assert receipt["checks"] == []
    assert engine.calls[calls:] == [] and list(workspace.iterdir()) == []
    if hold == "disk":
        assert "Not enough free disk" in receipt["reason"]
    if hold in UPDATE_MARKERS:
        assert receipt["reason"] == UPDATE_BUSY


def test_the_next_drill_sweeps_a_copy_a_killed_drill_left(stack, monkeypatch):
    _, engine, _, workspace, _ = stack
    # A drill killed by SIGKILL never reaches its clean-up: its folder and copy stay.
    monkeypatch.setattr(backup_drill, "clean_up", lambda work, docker: None)
    run(stack)
    assert engine.copies() and len(list(workspace.iterdir())) == 1
    monkeypatch.undo()

    receipt = run(stack)

    assert receipt["outcome"] == "passed", receipt
    assert receipt["swept"] == 1
    assert engine.copies() == [] and list(workspace.iterdir()) == []


def test_a_stale_copy_that_will_not_go_fails_the_drill_before_any_restore(stack, monkeypatch):
    _, engine, _, workspace, _ = stack
    (workspace / ("drill-" + "a" * 12)).mkdir()
    monkeypatch.setattr(backup_drill, "clean_up", lambda work, docker: "the drill folder")
    calls = len(engine.calls)

    receipt = run(stack)

    assert receipt["outcome"] == "failed" and receipt["leftovers"] == "the drill folder"
    assert "earlier drill" in receipt["reason"] and receipt["checks"] == []
    assert not any(call[:2] == ("volume", "create") for call in engine.calls[calls:])


STOPPED_DRILL = """
import json, signal, sys
from pathlib import Path
from tests.test_backup_drill import DrillEngine
import recovery
from scripts import backup_cli, backup_drill

tmp = Path(sys.argv[1])
root = tmp / "install"
root.mkdir()
for name in (".env", "versions.env", "docker-compose.yml"):
    (root / name).write_text("test configuration\\n")
engine = DrillEngine(tmp)
snapshot = recovery.backup(root, None, engine)
original = engine.run

def stopped_midway(*args, **kwargs):
    if "pg_restore" in args:
        signal.raise_signal(signal.SIGTERM)  # what systemd or `kill` sends
    return original(*args, **kwargs)

engine.run = stopped_midway
backup_drill.Docker = lambda: engine
code = backup_cli.main([
    "--root", str(root), "--source", str(tmp), "--layout", "repository",
    "drill", str(snapshot),
])
print("COPIES " + json.dumps(engine.copies()))
sys.exit(code)
"""


def test_a_drill_stopped_by_sigterm_still_cleans_up_and_records_it(tmp_path):
    result = subprocess.run(
        [sys.executable, "-c", STOPPED_DRILL, str(tmp_path)],
        cwd=ROOT,
        env={**os.environ, "PYTHONPATH": os.pathsep.join([str(ROOT), str(ROOT / "scripts")])},
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )

    assert result.returncode == backup_cli.INTERRUPTED, result.stderr[-2000:]
    assert "COPIES []" in result.stdout
    root = tmp_path / "install"
    assert list((root / ".conker" / "backup-schedule").glob("drill-*")) == []
    lines = journal(root, "repository").path.read_text(encoding="utf-8").splitlines()
    assert [json.loads(line)["outcome"] for line in lines] == ["running", "failed"]
    receipt = last_record(journal(root, "repository"), "drill")
    assert receipt is not None
    assert receipt["reason"] == backup_cli.STOPPED
    assert receipt["checks"] == ["snapshot verified", "cleaned up"]
    assert receipt["leftovers"] is None
    lock = OperationLock(root / ".conker" / "host-ops" / "operation.lock")
    assert lock.acquire()  # released on the way out
    lock.release()


def test_drill_cli_picks_the_newest_backup_and_last_shows_its_receipt(tmp_path, capsys, monkeypatch):
    backups = tmp_path / "backups"
    for name in ("snapshot-20261101T030000Z-aaaaaaaa", "snapshot-20261112T030000Z-bbbbbbbb"):
        (backups / name).mkdir(parents=True)
    ops = host(tmp_path)
    seen = {}

    def fake_drill(root, snapshot, workspace, lock, docker, *, source, checkouts, announce):
        seen.update(snapshot=snapshot.name, source=source, lock=lock.path, checkouts=checkouts)
        return {**backup_drill.new_receipt(snapshot.name, source), "outcome": "passed"}

    monkeypatch.setattr(backup_drill, "drill", fake_drill)
    monkeypatch.setattr(backup_drill, "Docker", lambda: None)
    assert backup_cli.run_drill(ops, ops.root, "ubuntu", None, "cli") == 0
    assert seen == {
        "snapshot": "snapshot-20261112T030000Z-bbbbbbbb",
        "source": "cli",
        "lock": ops.lock_path,
        "checkouts": (ops.source,),  # an update in the source checkout refuses the drill
    }
    capsys.readouterr()
    assert backup_cli.main([
        "--root", str(ops.root), "--source", str(tmp_path / "source"),
        "--layout", "ubuntu", "drill", "--last",
    ]) == 0
    out = capsys.readouterr().out
    assert out.startswith("Restore drill passed: snapshot-20261112T030000Z-bbbbbbbb")


def test_scheduled_drill_with_no_destination_is_skipped_and_recorded(tmp_path):
    ops = host(tmp_path, policy=lambda: None)

    assert backup_cli.run_drill(ops, ops.root, "ubuntu", None, "schedule") == 0
    assert backup_cli.run_drill(ops, ops.root, "ubuntu", None, "cli") == 1

    record = last_record(journal(ops.root, "ubuntu"), "drill")
    assert record is not None
    assert record["outcome"] == "skipped" and record["snapshot"] is None
    assert "No backup destination" in record["reason"]


def test_drill_last_with_no_drill_yet_says_so(tmp_path, capsys):
    assert backup_cli.main([
        "--root", str(tmp_path / "deploy"), "--source", str(tmp_path),
        "--layout", "ubuntu", "drill", "--last",
    ]) == 1
    assert "No restore drill has run yet" in capsys.readouterr().out

