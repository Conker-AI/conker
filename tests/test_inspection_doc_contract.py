"""The CLI inspection reference table agrees with Pi's INSPECTIONS map (cross-gate).

Set CONKER_TEST_PI_SOURCE when Pi is not checked out beside this repository.
Both sides are parsed as text (ast for Pi, so its imports never run): a resource
added to or removed from either list, or one whose authority or route drifts,
fails with the exact offending names.
"""

import ast
import os
import re
from pathlib import Path

import pytest

DOC = Path(__file__).resolve().parents[1] / "docs" / "reference" / "cli-inspection.md"
ROW = re.compile(r"^\| `([^`]+)` \| ([^|]+?) \| `([^`]+)` \|$")
DOC_AUTHORITIES = {
    "owner": "owner",
    "runtime": "runtime",
    "ToolGate owner": "toolgate-owner",
}


def pi_inspections(source: Path) -> dict:
    module = ast.parse((source / "gateway" / "inspection.py").read_text(encoding="utf-8"))
    for node in module.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "INSPECTIONS"
            for target in node.targets
        ):
            break
    else:
        raise AssertionError("gateway/inspection.py has no module-level INSPECTIONS dict")
    inspections = {}
    for key, call in zip(node.value.keys, node.value.values):
        authority, path, *query = (ast.literal_eval(arg) for arg in call.args)
        route = path
        if query:
            route += "?" + "&".join(f"{k}={v}" for k, v in query[0])
        inspections[ast.literal_eval(key)] = (authority, route)
    return inspections


def doc_rows() -> dict:
    lines = DOC.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("| Resource |"))
    rows = {}
    for line in lines[start + 1 :]:
        if not line.strip():
            break
        match = ROW.match(line)
        if match:
            name, authority, route = match.groups()
            assert authority in DOC_AUTHORITIES, f"Unmapped doc authority: {authority}"
            rows[name] = (DOC_AUTHORITIES[authority], route)
    return rows


@pytest.fixture
def pi():
    source = Path(
        os.environ.get(
            "CONKER_TEST_PI_SOURCE", Path(__file__).resolve().parents[2] / "gates" / "pi"
        )
    )
    if not (source / "gateway" / "inspection.py").is_file():
        pytest.skip("Set CONKER_TEST_PI_SOURCE for the Pi inspection contract test.")
    return pi_inspections(source)


def test_inspection_doc_matches_pi(pi):
    documented = doc_rows()
    missing = sorted(set(pi) - set(documented))
    extra = sorted(set(documented) - set(pi))
    differing = sorted(name for name in set(pi) & set(documented) if pi[name] != documented[name])
    detail = "; ".join(
        f"{name}: doc {documented[name]!r} != Pi {pi[name]!r}" for name in differing
    )
    assert not missing and not extra and not differing, (
        f"Resources missing from the doc: {missing}; "
        f"doc rows unknown to Pi: {extra}; "
        f"rows that differ: {detail}"
    )
