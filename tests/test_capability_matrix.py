import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.validate_capabilities import DEFAULT_MATRIX, MatrixError, load, validate

ROOT = Path(__file__).resolve().parents[1]


def matrix():
    return json.loads(DEFAULT_MATRIX.read_text(encoding="utf-8"))


def row(data, identity):
    return next(item for item in data["capabilities"] if item["id"] == identity)


def test_repository_capability_matrix_is_complete_and_evidenced():
    assert load() == {
        "schemaVersion": 1,
        "capabilities": 35,
        "active": 34,
        "deferred": 1,
    }


def test_validator_cli_emits_machine_readable_summary():
    result = subprocess.run(
        [sys.executable, "scripts/validate_capabilities.py", "--json"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    assert json.loads(result.stdout) == load()


def test_human_status_tracks_matrix_counts_and_deferred_families():
    data = matrix()
    summary = load()
    status = (ROOT / "docs/status.md").read_text(encoding="utf-8")

    assert (
        f"{summary['capabilities']} tracked\ncapability families: "
        f"{summary['active']} active and {summary['deferred']} deferred"
    ) in status
    for capability in data["capabilities"]:
        if capability["state"] == "deferred":
            assert f"| {capability['name']} |" in status


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda data: data["capabilities"].pop(), "inventory changed"),
        (
            lambda data: row(data, "agents").pop("authority"),
            "missing or unexpected fields",
        ),
        (
            lambda data: row(data, "conversations").update(
                gatewayRoutes=[], uiRoutes=[], cliCommands=[]
            ),
            "no product surface",
        ),
        (
            lambda data: row(data, "owner-terminal").update(uiRoutes=["/system"]),
            "deferred but claims",
        ),
        (
            lambda data: row(data, "setup-status")["evidence"][0].update(
                contains="invented route"
            ),
            "evidence is stale",
        ),
        (
            lambda data: row(data, "verified-backup")["evidence"][0].update(
                path="../outside"
            ),
            "escapes the repository",
        ),
    ],
)
def test_validator_rejects_false_or_incomplete_claims(mutate, message):
    data = copy.deepcopy(matrix())
    mutate(data)
    with pytest.raises(MatrixError, match=message):
        validate(data)
