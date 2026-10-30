"""The host helper's receipts journal and its one-at-a-time lock (ADR-0014).

The journal is an append-only file of JSON lines outside every Docker volume: a "started" line
before an action runs and a "finished" line after it. A receipt is the two folded together. It
names the operation, its public arguments and their digest, the source, the times, the outcome
and a plain-word reason. It never holds a secret or command output.

The lock is an operating-system file lock. The kernel drops it when the process holding it (and
any child given the descriptor) exits, so a crash never leaves a stale lock behind, and an action
still marked "working" while nobody holds the lock was cut off.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

VERSION = 1
OP_ID = re.compile(r"[A-Za-z0-9_.:-]{16,128}")
OPERATION = re.compile(r"[a-z]+(?:\.[a-z]+)+")
DIGEST = re.compile(r"[0-9a-f]{64}")
VALUE = re.compile(r"[A-Za-z0-9_.:-]{1,128}")
SOURCES = {"ui", "cli"}
OUTCOMES = {"done", "failed", "unknown"}
STARTED = {
    "v",
    "event",
    "id",
    "operation",
    "arguments",
    "argumentsDigest",
    "source",
    "startedAt",
}
FINISHED = {"v", "event", "id", "outcome", "endedAt", "reason"}
FLAGS = getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)


class OperationLock:
    """An exclusive, non-blocking lock on one file, shared by the helper and `conker ops run`."""

    def __init__(self, path: Path):
        self.path = path
        self.fd: int | None = None

    def acquire(self) -> bool:
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT | FLAGS, 0o600)
        try:
            if os.name == "posix":
                import fcntl

                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                import msvcrt

                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        except OSError:
            os.close(fd)
            return False
        self.fd = fd
        return True

    def release(self) -> None:
        fd, self.fd = self.fd, None
        if fd is None:
            return
        try:
            if os.name != "posix":
                import msvcrt

                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        finally:
            os.close(fd)


class Journal:
    def __init__(self, directory: Path):
        self.path = directory / "journal.jsonl"

    def append(self, record: dict) -> None:
        line = json.dumps(record, sort_keys=True, separators=(",", ":")).encode()
        fd = os.open(self.path, os.O_RDWR | os.O_APPEND | os.O_CREAT | FLAGS, 0o600)
        try:
            size = os.fstat(fd).st_size
            if size:
                # A line torn by a power cut stays one damaged line; the next record starts clean.
                os.lseek(fd, size - 1, os.SEEK_SET)
                if os.read(fd, 1) != b"\n":
                    line = b"\n" + line
            os.write(fd, line + b"\n")
            os.fsync(fd)
        finally:
            os.close(fd)

    def receipts(self) -> tuple[dict[str, dict], int]:
        """Every receipt by id, oldest first, and how many lines could not be read."""
        try:
            content = self.path.read_bytes()
        except FileNotFoundError:
            return {}, 0
        receipts: dict[str, dict] = {}
        damaged = 0
        for line in content.split(b"\n"):
            if not line:
                continue
            try:
                record = json.loads(line)
            except (UnicodeError, ValueError):
                damaged += 1
                continue
            if not _apply(receipts, record):
                damaged += 1
        return receipts, damaged


def _apply(receipts: dict[str, dict], record: object) -> bool:
    if not isinstance(record, dict) or record.get("v") != VERSION:
        return False
    identity = record.get("id")
    if not isinstance(identity, str) or not OP_ID.fullmatch(identity):
        return False
    if record.get("event") == "started" and set(record) == STARTED:
        arguments = record["arguments"]
        if (
            identity in receipts
            or not isinstance(record["operation"], str)
            or not OPERATION.fullmatch(record["operation"])
            or not isinstance(arguments, dict)
            or any(
                not isinstance(key, str)
                or not isinstance(value, str)
                or not VALUE.fullmatch(value)
                for key, value in arguments.items()
            )
            or not isinstance(record["argumentsDigest"], str)
            or not DIGEST.fullmatch(record["argumentsDigest"])
            or record["source"] not in SOURCES
            or not isinstance(record["startedAt"], str)
        ):
            return False
        receipts[identity] = {
            "id": identity,
            "operation": record["operation"],
            "arguments": arguments,
            "argumentsDigest": record["argumentsDigest"],
            "source": record["source"],
            "startedAt": record["startedAt"],
            "endedAt": None,
            "outcome": "working",
            "reason": None,
        }
        return True
    if record.get("event") == "finished" and set(record) == FINISHED:
        receipt = receipts.get(identity)
        if (
            receipt is None
            or receipt["outcome"] != "working"
            or record["outcome"] not in OUTCOMES
            or not isinstance(record["endedAt"], str)
            or not (record["reason"] is None or isinstance(record["reason"], str))
        ):
            return False
        receipt.update(
            outcome=record["outcome"],
            endedAt=record["endedAt"],
            reason=record["reason"],
        )
        return True
    return False


def started(
    identity: str,
    operation: str,
    arguments: dict[str, str],
    digest: str,
    source: str,
    at: str,
) -> dict:
    return {
        "v": VERSION,
        "event": "started",
        "id": identity,
        "operation": operation,
        "arguments": arguments,
        "argumentsDigest": digest,
        "source": source,
        "startedAt": at,
    }


def finished(identity: str, outcome: str, reason: str | None, at: str) -> dict:
    return {
        "v": VERSION,
        "event": "finished",
        "id": identity,
        "outcome": outcome,
        "endedAt": at,
        "reason": reason,
    }
