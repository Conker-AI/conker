#!/usr/bin/env python3
"""Validate the product capability matrix against repository evidence."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MATRIX = ROOT / "capabilities.json"
ID = re.compile(r"[a-z][a-z0-9-]{1,63}")
AUTHORITIES = {"gateway", "pi", "toolgate", "memorygate", "systemgate", "conker-host"}
STATES = {"active", "deferred"}
REQUIRED_CAPABILITIES = {
    "admin-key-recovery",
    "agents",
    "artifacts",
    "browser-authentication",
    "browser-session-administration",
    "calls-voice",
    "companion-editing",
    "conversations",
    "held-recovery",
    "host-inventory",
    "jobs-schedules",
    "local-model-download",
    "memory-exploration",
    "memory-forgetting",
    "model-configuration",
    "owner-approvals",
    "owner-files",
    "owner-terminal",
    "pinned-updates",
    "projects-context",
    "proposals",
    "provider-secret-management",
    "remote-access-tls",
    "service-lifecycle",
    "session-privacy",
    "setup-evidence-receipts",
    "setup-status",
    "system-status",
    "tasks-activity",
    "teams-collaboration",
    "typed-calls",
    "tool-inventory",
    "tool-workflow-authoring",
    "turn-recovery",
    "verified-backup",
}
FIELDS = {
    "id",
    "name",
    "authority",
    "state",
    "gatewayRoutes",
    "uiRoutes",
    "cliCommands",
    "deploymentRequirements",
    "evidence",
}


class MatrixError(ValueError):
    pass


def _strings(value: object, field: str, identity: str) -> list[str]:
    if not isinstance(value, list) or any(
        not isinstance(item, str) or not item for item in value
    ):
        raise MatrixError(f"{identity}.{field} must be a list of non-empty strings")
    if len(value) != len(set(value)):
        raise MatrixError(f"{identity}.{field} contains duplicates")
    return value


def validate(data: object, root: Path = ROOT) -> dict[str, object]:
    if not isinstance(data, dict) or set(data) != {"schemaVersion", "capabilities"}:
        raise MatrixError("matrix must contain exactly schemaVersion and capabilities")
    if data["schemaVersion"] != 1 or not isinstance(data["capabilities"], list):
        raise MatrixError("unsupported capability matrix schema")

    seen: set[str] = set()
    active = deferred = 0
    for index, row in enumerate(data["capabilities"]):
        if not isinstance(row, dict):
            raise MatrixError(f"capability {index} must be an object")
        identity = row.get("id")
        if (
            not isinstance(identity, str)
            or not ID.fullmatch(identity)
            or identity in seen
        ):
            raise MatrixError(f"capability {index} has an invalid or duplicate id")
        seen.add(identity)
        state = row.get("state")
        allowed = FIELDS | ({"gap"} if state == "deferred" else set())
        if set(row) != allowed:
            raise MatrixError(f"{identity} has missing or unexpected fields")
        if row.get("authority") not in AUTHORITIES or state not in STATES:
            raise MatrixError(f"{identity} has an invalid authority or state")
        if not isinstance(row.get("name"), str) or not row["name"].strip():
            raise MatrixError(f"{identity}.name must be non-empty")

        routes = _strings(row["gatewayRoutes"], "gatewayRoutes", identity)
        ui = _strings(row["uiRoutes"], "uiRoutes", identity)
        commands = _strings(row["cliCommands"], "cliCommands", identity)
        requirements = _strings(
            row["deploymentRequirements"], "deploymentRequirements", identity
        )
        if any(not route.startswith("/") for route in routes + ui):
            raise MatrixError(f"{identity} routes must be absolute")
        if any(not command.startswith("conker ") for command in commands):
            raise MatrixError(f"{identity} CLI commands must start with 'conker '")
        if not requirements:
            raise MatrixError(f"{identity} must name a deployment requirement")
        if state == "active":
            active += 1
            if not (routes or ui or commands):
                raise MatrixError(f"{identity} is active but has no product surface")
        else:
            deferred += 1
            if routes or ui or commands:
                raise MatrixError(
                    f"{identity} is deferred but claims a product surface"
                )
            if not isinstance(row.get("gap"), str) or len(row["gap"].strip()) < 20:
                raise MatrixError(f"{identity}.gap must explain the deferral")

        evidence = row.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            raise MatrixError(f"{identity} must cite repository evidence")
        if state == "active" and len(evidence) < 2:
            raise MatrixError(f"{identity} must cite at least two facts while active")
        for item in evidence:
            if not isinstance(item, dict) or set(item) != {"path", "contains"}:
                raise MatrixError(f"{identity} has malformed evidence")
            relative, needle = item["path"], item["contains"]
            if (
                not isinstance(relative, str)
                or not isinstance(needle, str)
                or not needle
            ):
                raise MatrixError(f"{identity} has malformed evidence values")
            candidate = (root / relative).resolve()
            try:
                candidate.relative_to(root.resolve())
            except ValueError as exc:
                raise MatrixError(
                    f"{identity} evidence escapes the repository"
                ) from exc
            if not candidate.is_file():
                raise MatrixError(f"{identity} evidence file is missing: {relative}")
            if needle not in candidate.read_text(encoding="utf-8"):
                raise MatrixError(
                    f"{identity} evidence is stale: {relative} lacks {needle!r}"
                )

    missing, unexpected = REQUIRED_CAPABILITIES - seen, seen - REQUIRED_CAPABILITIES
    if missing or unexpected:
        raise MatrixError(
            f"capability inventory changed: missing={sorted(missing)} unexpected={sorted(unexpected)}"
        )
    return {
        "schemaVersion": 1,
        "capabilities": len(seen),
        "active": active,
        "deferred": deferred,
    }


def load(path: Path = DEFAULT_MATRIX, root: Path = ROOT) -> dict[str, object]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MatrixError(f"cannot read capability matrix: {exc}") from exc
    return validate(data, root)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matrix", type=Path, default=DEFAULT_MATRIX)
    parser.add_argument(
        "--json", action="store_true", help="print validation summary as JSON"
    )
    args = parser.parse_args()
    try:
        result = load(args.matrix)
    except MatrixError as exc:
        parser.error(str(exc))
    print(
        json.dumps(result, sort_keys=True)
        if args.json
        else "Capability matrix is valid."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
