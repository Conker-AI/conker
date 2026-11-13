"""What every Conker update shares, whatever the layout: the update's saved state and receipts,
the coordinator that walks its phases and rolls back a failed one, and the one-update lock.

A layout supplies a transport (scripts/update.py for the repository layout, scripts/update_ubuntu.py
for the Ubuntu layout). The coordinator saves each phase before it starts, so an update cut off at
any point is rolled back on the next run instead of being left half applied.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar

try:
    import fcntl
except ImportError:  # Windows: the repository layout's tests; one updater per checkout there
    fcntl = None


class UpdateError(RuntimeError):
    """An update could not be completed or safely recovered."""


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def _why(error: BaseException) -> str:
    """An UpdateError's own words (written here, never command output); otherwise its kind."""
    return str(error) if isinstance(error, UpdateError) and str(error) else type(error).__name__


@dataclass
class UpdateStore:
    directory: Path

    @property
    def active_path(self) -> Path:
        return self.directory / "active.json"

    @property
    def hold_path(self) -> Path:
        return self.directory / "HOLD.json"

    def load_active(self) -> dict[str, Any] | None:
        if not self.active_path.exists():
            return None
        return json.loads(self.active_path.read_text(encoding="utf-8"))

    def save_active(self, state: dict[str, Any]) -> None:
        _atomic_json(self.active_path, state)

    def clear_active(self) -> None:
        self.active_path.unlink(missing_ok=True)

    def receipt(self, state: dict[str, Any], status: str, reason: str | None = None) -> Path:
        receipt = {
            "schema": 1,
            "transaction_id": state["transaction_id"],
            "status": status,
            "target": state.get("target"),
            "started_at": state["started_at"],
            "finished_at": int(time.time()),
            "prior": {
                "revision": (state.get("prior") or {}).get("revision"),
                "manifest": (state.get("prior") or {}).get("manifest"),
                "services": (state.get("prior") or {}).get("services"),
            },
            "candidate": {
                "revision": state.get("candidate", {}).get("revision"),
                "manifest": state.get("candidate", {}).get("manifest"),
                "resolved_images": state.get("candidate", {}).get("resolved_images"),
            },
        }
        if state.get("protection"):
            receipt["protection"] = state["protection"]
        if reason:
            receipt["reason"] = reason
        path = self.directory / "receipts" / f"{state['transaction_id']}.json"
        _atomic_json(path, receipt)
        return path

    def hold(self, state: dict[str, Any], reason: str) -> Path:
        hold = {
            "schema": 1,
            "transaction_id": state["transaction_id"],
            "status": "rollback_unproven",
            "created_at": int(time.time()),
            "prior_revision": (state.get("prior") or {}).get("revision"),
            "candidate_revision": state.get("candidate", {}).get("revision"),
            "reason": reason,
            "operator_action": "Inspect the update receipt and restore from a verified backup before removing this hold.",
        }
        _atomic_json(self.hold_path, hold)
        return self.hold_path


class UpdateCoordinator:
    """Persist update phases around an injectable host transport."""

    MUTATING_PHASES: ClassVar[set[str]] = {
        "applying_code",
        "code_applied",
        "applying",
        "verifying",
        "rolling_back",
    }

    def __init__(self, transport: Any, store: UpdateStore):
        self.transport = transport
        self.store = store

    def _rollback(self, state: dict[str, Any], reason: str) -> None:
        state["phase"] = "rolling_back"
        self.store.save_active(state)
        try:
            self.transport.rollback(state["prior"], state.get("candidate"))
            # The snapshot from before the update, for data a newer release changed (Pi's
            # migrations, scripts/update_pi_db.py).
            self.transport.verify_rollback(state["prior"], state.get("protection") or {})
        except Exception as error:  # rollback is the last safety boundary
            failure = f"rollback could not be proven: {_why(error)}"
            self.store.receipt(state, "rollback_unproven", failure)
            hold = self.store.hold(state, failure)
            raise UpdateError(f"Update held: {hold}. {failure}") from error
        self.store.receipt(state, "rolled_back", reason)
        self.store.clear_active()

    def recover_interrupted(self) -> None:
        """Called under update.lock, so the hold is checked where no other update can write one."""
        if self.store.hold_path.exists():
            raise UpdateError(f"Update is held: {self.store.hold_path}")
        state = self.store.load_active()
        if not state:
            return
        if state.get("phase") in self.MUTATING_PHASES:
            self._rollback(state, "interrupted update recovered before rerun")
            return
        self.store.receipt(state, "abandoned_before_apply", "interrupted preflight")
        self.store.clear_active()

    def run(self) -> dict[str, Any]:
        self.recover_interrupted()

        state: dict[str, Any] = {
            "schema": 1,
            "transaction_id": uuid.uuid4().hex,
            "started_at": int(time.time()),
            "phase": "recorded",
            # The release a layout updates to by name (the Ubuntu layout); None follows a branch.
            "target": getattr(self.transport, "target", None),
            "prior": {},
        }
        self.store.save_active(state)

        try:
            # A refusal here leaves a receipt too, so the owner hears why nothing changed.
            self.transport.preflight()
            state["prior"] = self.transport.snapshot()
            self.store.save_active(state)
            candidate = self.transport.prepare_candidate(state["prior"])
            state["candidate"] = candidate
            state["phase"] = "candidate_validated"
            self.store.save_active(state)

            if candidate["revision"] == state["prior"]["revision"]:
                receipt = self.store.receipt(state, "no_change")
                self.store.clear_active()
                return {"status": "no_change", "receipt": str(receipt)}

            candidate["resolved_images"] = self.transport.pull_exact_images(candidate)
            state["phase"] = "candidate_ready"
            self.store.save_active(state)

            # A layout that keeps no prior images to go back to takes a verified snapshot here,
            # before anything running changes; a failure stops the update before it applies.
            protect = getattr(self.transport, "protect", None)
            if protect is not None:
                state["phase"] = "protecting"
                self.store.save_active(state)
                state["protection"] = protect(candidate)
                self.store.save_active(state)

            state["phase"] = "applying_code"
            self.store.save_active(state)
            self.transport.apply_code(candidate)
            state["phase"] = "code_applied"
            self.store.save_active(state)

            state["phase"] = "applying"
            self.store.save_active(state)
            self.transport.apply_services(candidate)

            state["phase"] = "verifying"
            self.store.save_active(state)
            self.transport.verify_candidate(candidate)
        except Exception as error:
            if state.get("phase") in self.MUTATING_PHASES:
                self._rollback(state, f"candidate failed: {_why(error)}")
                raise UpdateError("Candidate failed acceptance; prior release was restored.") from error
            receipt = self.store.receipt(
                state, "failed_before_apply", f"preflight failed: {_why(error)}"
            )
            self.store.clear_active()
            # Say why (an UpdateError's own words, e.g. a dirty checkout or a version not newer).
            reason = _why(error).rstrip(".")
            raise UpdateError(f"Update stopped before apply: {reason}. Receipt: {receipt}") from error

        receipt = self.store.receipt(state, "applied")
        self.store.clear_active()
        return {"status": "applied", "receipt": str(receipt)}


BOOT_ID = Path("/proc/sys/kernel/random/boot_id")
PROC_STAT = Path("/proc/stat")


def _boot_id() -> str:
    """This boot's id on Linux, else empty: a lock from an earlier boot is stale whatever its pid."""
    try:
        return BOOT_ID.read_text(encoding="ascii").strip()
    except OSError:
        return ""


def _booted_at() -> float | None:
    """When this boot started (Linux), for a lock written before boot ids were recorded."""
    try:
        for line in PROC_STAT.read_text(encoding="ascii").splitlines():
            name, _, value = line.partition(" ")
            if name == "btime":
                return float(value)
    except (OSError, ValueError):
        return None
    return None


def _token() -> str:
    return f"{os.getpid()} {_boot_id()}".rstrip()


def _stale(lock: Path) -> bool:
    """The lock's owner is gone: an earlier boot wrote it, or its pid no longer runs."""
    owner, _, boot = lock.read_text(encoding="ascii").strip().partition(" ")
    pid = int(owner)  # ValueError: a torn or foreign file
    current = _boot_id()
    if boot and current and boot != current:
        return True  # after a reboot another process may have the same pid
    booted = None if boot else _booted_at()
    if booted is not None and lock.stat().st_mtime < booted:
        return True  # a pid-only lock (an older release) written before this boot
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    return False


@contextmanager
def _guard(directory: Path) -> Iterator[None]:
    """One process at a time checks, breaks, takes or drops update.lock (POSIX; the kernel lets go
    on exit). update.lock itself stays a plain file: backups and drills read it as "an update runs"."""
    if fcntl is None:
        yield
        return
    descriptor = os.open(directory / "update.lock.guard", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


LOCK_TOKEN = "CONKER_UPDATE_LOCK"  # the token an update hands its own snapshot (`conker backup`)


def update_running(directory: Path, own: str | None = None) -> bool:
    """Another update or a recovery holds `directory`'s update.lock right now. A stale lock does
    not count, nor the lock whose token is `own` (an update's own snapshot runs under its lock)."""
    lock = directory / "update.lock"
    if not lock.exists():
        return False
    with _guard(directory):
        try:
            if own and lock.read_text(encoding="ascii").strip() == own:
                return False
            return not _stale(lock)
        except FileNotFoundError:
            return False
        except ValueError:
            # Under the guard nobody is half way through writing it: a writer died (stale).
            # Without one (Windows) a write may be in progress, so it counts.
            return fcntl is None
        except OSError:
            return True


def _acquire_lock(store: UpdateStore) -> Path:
    lock = store.directory / "update.lock"
    store.directory.mkdir(parents=True, exist_ok=True)
    with _guard(store.directory):
        for attempt in range(2):
            try:
                descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                break
            except FileExistsError as error:
                try:
                    stale = _stale(lock)
                except ValueError:
                    stale = None  # unreadable: replaced once, then refused
                if stale is not False and attempt == 0:
                    lock.unlink(missing_ok=True)
                    continue
                if stale is None:
                    raise UpdateError(f"invalid update lock: {lock}") from error
                raise UpdateError(f"another update may be active: {lock}") from error
        else:  # pragma: no cover - the loop either opens or raises
            raise UpdateError(f"could not acquire update lock: {lock}")
        with os.fdopen(descriptor, "w", encoding="ascii") as stream:
            stream.write(_token() + "\n")
            stream.flush()
            os.fsync(stream.fileno())
    return lock


def _release_lock(lock: Path) -> None:
    """Drop update.lock only while it is still this process's (never another update's)."""
    with _guard(lock.parent):
        try:
            if lock.read_text(encoding="ascii").strip() == _token():
                lock.unlink()
        except FileNotFoundError:
            pass
