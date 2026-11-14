"""Refusals of the capability matrix validator and the status page generator.

Every case builds its own matrix, evidence file, README, status page and versions.env in
tmp_path, so nothing here depends on the repository's current counts or pins.
"""

from __future__ import annotations

import copy
import json
import runpy
import sys
from pathlib import Path

import pytest

from scripts import status_page, validate_capabilities
from scripts.validate_capabilities import REQUIRED_CAPABILITIES, MatrixError, validate

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
DEFERRED_ID = "owner-terminal"
GAP = "Waits for a terminal boundary that is tested on Linux."
SUMMARY = {"schemaVersion": 1, "capabilities": 41, "active": 40, "deferred": 1}


def active_row(identity: str) -> dict:
    return {
        "id": identity,
        "name": identity.replace("-", " ").title(),
        "authority": "pi",
        "state": "active",
        "gatewayRoutes": [],
        "uiRoutes": [f"/{identity}"],
        "cliCommands": [f"conker {identity}"],
        "deploymentRequirements": ["pi"],
        "evidence": [
            {"path": "evidence.txt", "contains": "alpha"},
            {"path": "evidence.txt", "contains": "beta"},
        ],
    }


def make_matrix(root: Path) -> dict:
    (root / "evidence.txt").write_text("alpha beta\n", encoding="utf-8")
    rows = []
    for identity in sorted(REQUIRED_CAPABILITIES):
        row = active_row(identity)
        if identity == DEFERRED_ID:
            row.update(
                state="deferred",
                uiRoutes=[],
                cliCommands=[],
                gap=GAP,
                evidence=[{"path": "evidence.txt", "contains": "alpha"}],
            )
        rows.append(row)
    return {"schemaVersion": 1, "capabilities": rows}


def row(data: dict, identity: str) -> dict:
    return next(item for item in data["capabilities"] if item["id"] == identity)


def test_a_minimal_matrix_is_valid_and_counted(tmp_path):
    data = make_matrix(tmp_path)
    row(data, "agents").update(
        cliCommands=["python scripts/conker.py agents"],
        frozen="Kept as built until the hero screens ship.",
    )
    assert validate(data, tmp_path) == SUMMARY


@pytest.mark.parametrize(
    ("data", "message"),
    [
        ([], "exactly schemaVersion and capabilities"),
        ({"schemaVersion": 1}, "exactly schemaVersion and capabilities"),
        ({"schemaVersion": 1, "capabilities": [], "extra": 1}, "exactly schemaVersion"),
        ({"schemaVersion": 2, "capabilities": []}, "unsupported capability matrix schema"),
        ({"schemaVersion": 1, "capabilities": {}}, "unsupported capability matrix schema"),
        ({"schemaVersion": 1, "capabilities": ["agents"]}, "capability 0 must be an object"),
        ({"schemaVersion": 1, "capabilities": [{"id": "A"}]}, "capability 0 has an invalid"),
        ({"schemaVersion": 1, "capabilities": [{"id": 7}]}, "capability 0 has an invalid"),
        ({"schemaVersion": 1, "capabilities": [{"id": "x"}]}, "capability 0 has an invalid"),
    ],
)
def test_a_malformed_matrix_shape_is_refused(tmp_path, data, message):
    with pytest.raises(MatrixError, match=message):
        validate(data, tmp_path)


def test_a_duplicate_id_is_refused(tmp_path):
    data = make_matrix(tmp_path)
    data["capabilities"].append(copy.deepcopy(row(data, "agents")))
    with pytest.raises(MatrixError, match=r"capability 41 has an invalid or duplicate id"):
        validate(data, tmp_path)


EVIDENCE = [{"path": "evidence.txt", "contains": "alpha"}]


@pytest.mark.parametrize(
    ("identity", "change", "message"),
    [
        ("agents", {"gap": GAP}, "agents has missing or unexpected fields"),
        ("agents", {"note": "x"}, "agents has missing or unexpected fields"),
        (DEFERRED_ID, {"gap": None}, "owner-terminal has missing or unexpected fields"),
        ("agents", {"authority": "cloud"}, "agents has an invalid authority or state"),
        ("agents", {"state": "retired"}, "agents has an invalid authority or state"),
        ("agents", {"name": "   "}, r"agents\.name must be non-empty"),
        ("agents", {"name": 5}, r"agents\.name must be non-empty"),
        ("agents", {"uiRoutes": "/agents"}, r"agents\.uiRoutes must be a list"),
        ("agents", {"gatewayRoutes": [""]}, r"agents\.gatewayRoutes must be a list"),
        ("agents", {"cliCommands": [3]}, r"agents\.cliCommands must be a list"),
        ("agents", {"uiRoutes": ["/a", "/a"]}, r"agents\.uiRoutes contains duplicates"),
        ("agents", {"deploymentRequirements": None}, "deploymentRequirements must be a list"),
        ("agents", {"uiRoutes": ["agents"]}, "agents routes must be absolute"),
        ("agents", {"gatewayRoutes": ["api/agents"]}, "agents routes must be absolute"),
        ("agents", {"cliCommands": ["./conker agents"]}, "must use a Conker launcher"),
        ("agents", {"cliCommands": ["conker"]}, "must use a Conker launcher"),
        ("agents", {"deploymentRequirements": []}, "must name a deployment requirement"),
        (
            "agents",
            {"gatewayRoutes": [], "uiRoutes": [], "cliCommands": []},
            "agents is active but has no product surface",
        ),
        (DEFERRED_ID, {"cliCommands": ["conker terminal"]}, "deferred but claims"),
        (DEFERRED_ID, {"gatewayRoutes": ["/terminal"]}, "deferred but claims"),
        (DEFERRED_ID, {"gap": "later"}, r"owner-terminal\.gap must explain the deferral"),
        (DEFERRED_ID, {"gap": " " * 30}, r"owner-terminal\.gap must explain the deferral"),
        (DEFERRED_ID, {"gap": 42}, r"owner-terminal\.gap must explain the deferral"),
        ("agents", {"frozen": "short"}, r"agents\.frozen must say why"),
        ("agents", {"frozen": " " * 25}, r"agents\.frozen must say why"),
        ("agents", {"evidence": []}, "agents must cite repository evidence"),
        ("agents", {"evidence": {"path": "x"}}, "agents must cite repository evidence"),
        (DEFERRED_ID, {"evidence": []}, "owner-terminal must cite repository evidence"),
        ("agents", {"evidence": EVIDENCE}, "at least two facts while active"),
        ("agents", {"evidence": ["evidence.txt", "x"]}, "agents has malformed evidence$"),
        (
            "agents",
            {"evidence": [{"path": "evidence.txt"}, *EVIDENCE]},
            "agents has malformed evidence$",
        ),
        (
            "agents",
            {"evidence": [{**EVIDENCE[0], "line": 1}, *EVIDENCE]},
            "agents has malformed evidence$",
        ),
        (
            "agents",
            {"evidence": [{"path": "evidence.txt", "contains": ""}, *EVIDENCE]},
            "malformed evidence values",
        ),
        (
            "agents",
            {"evidence": [{"path": 3, "contains": "alpha"}, *EVIDENCE]},
            "malformed evidence values",
        ),
        (
            "agents",
            {"evidence": [{"path": "evidence.txt", "contains": ["alpha"]}, *EVIDENCE]},
            "malformed evidence values",
        ),
        (
            "agents",
            {"evidence": [{"path": "gone.txt", "contains": "alpha"}, *EVIDENCE]},
            "agents evidence file is missing: gone.txt",
        ),
        (
            "agents",
            {"evidence": [{"path": ".", "contains": "alpha"}, *EVIDENCE]},
            r"agents evidence file is missing: \.$",
        ),
        (
            "agents",
            {"evidence": [{"path": "evidence.txt", "contains": "gamma"}, *EVIDENCE]},
            "agents evidence is stale: evidence.txt lacks 'gamma'",
        ),
    ],
)
def test_a_false_or_malformed_row_is_refused(tmp_path, identity, change, message):
    data = make_matrix(tmp_path)
    target = row(data, identity)
    for key, value in change.items():
        if value is None and key == "gap":
            target.pop("gap")
        else:
            target[key] = value
    with pytest.raises(MatrixError, match=message):
        validate(data, tmp_path)


def test_evidence_outside_the_root_is_refused_even_when_it_exists(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    (tmp_path / "secret.txt").write_text("alpha\n", encoding="utf-8")
    data = make_matrix(root)
    outside = [{"path": "../secret.txt", "contains": "alpha"}, *EVIDENCE]
    row(data, "agents")["evidence"] = outside
    with pytest.raises(MatrixError, match="agents evidence escapes the repository"):
        validate(data, root)
    row(data, "agents")["evidence"] = [{"path": str(tmp_path / "secret.txt"), "contains": "alpha"}, *EVIDENCE]
    with pytest.raises(MatrixError, match="agents evidence escapes the repository"):
        validate(data, root)


def test_an_added_or_removed_family_is_refused(tmp_path):
    data = make_matrix(tmp_path)
    data["capabilities"].append(active_row("new-family"))
    with pytest.raises(MatrixError, match=r"missing=\[\] unexpected=\['new-family'\]"):
        validate(data, tmp_path)
    data["capabilities"] = [item for item in data["capabilities"] if item["id"] != "agents"]
    with pytest.raises(MatrixError, match=r"missing=\['agents'\]"):
        validate(data, tmp_path)


def write_claims(root: Path, readme: str, status: str) -> None:
    (root / "docs").mkdir(exist_ok=True)
    (root / "README.md").write_text(readme, encoding="utf-8")
    (root / "docs" / "status.md").write_text(status, encoding="utf-8")


README_OK = "Conker has 40 of 41 tracked capability families active.\n"
STATUS_OK = "The source has **41 tracked\ncapability families: 40 active and 1 deferred**.\n"


def test_status_claims_that_match_the_matrix_pass(tmp_path):
    write_claims(tmp_path, README_OK, STATUS_OK)
    assert validate_capabilities.check_status_claims(SUMMARY, tmp_path) is None


@pytest.mark.parametrize(
    ("readme", "status", "message"),
    [
        ("Conker is great.\n", STATUS_OK, "README.md no longer states the capability counts"),
        (README_OK, "No numbers here.\n", "docs/status.md no longer states the capability"),
        (
            "Conker has 39 of 41 tracked capability families active.\n",
            STATUS_OK,
            r"README.md claims 'has 39 of 41 .*capabilities.json says \(40, 41\)",
        ),
        (
            README_OK,
            STATUS_OK.replace("1 deferred", "2 deferred"),
            r"docs/status.md claims .*capabilities.json says \(41, 40, 1\)",
        ),
    ],
)
def test_a_stale_or_missing_status_claim_is_refused(tmp_path, readme, status, message):
    write_claims(tmp_path, readme, status)
    with pytest.raises(MatrixError, match=message):
        validate_capabilities.check_status_claims(SUMMARY, tmp_path)


def test_an_unreadable_matrix_file_is_refused(tmp_path):
    with pytest.raises(MatrixError, match="cannot read capability matrix"):
        validate_capabilities.load(tmp_path / "missing.json", tmp_path)
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    with pytest.raises(MatrixError, match="cannot read capability matrix"):
        validate_capabilities.load(broken, tmp_path)


@pytest.fixture
def matrix_home(tmp_path, monkeypatch):
    """A matrix in tmp_path that main() treats as the repository default."""
    path = tmp_path / "capabilities.json"
    path.write_text(json.dumps(make_matrix(tmp_path)), encoding="utf-8")
    monkeypatch.setattr(validate_capabilities, "DEFAULT_MATRIX", path)
    monkeypatch.setattr(validate_capabilities.load, "__defaults__", (path, tmp_path))
    monkeypatch.setattr(validate_capabilities.check_status_claims, "__defaults__", (tmp_path,))
    return path


def run_validator(monkeypatch, *args: str) -> int:
    monkeypatch.setattr(sys, "argv", ["validate_capabilities.py", *args])
    return validate_capabilities.main()


def test_main_checks_the_default_matrix_and_its_status_claims(matrix_home, monkeypatch, capsys):
    write_claims(matrix_home.parent, README_OK, STATUS_OK)
    assert run_validator(monkeypatch) == 0
    assert capsys.readouterr().out == "Capability matrix is valid.\n"


def test_main_refuses_a_stale_status_claim_on_the_default_matrix(matrix_home, monkeypatch, capsys):
    write_claims(matrix_home.parent, README_OK.replace("40 of", "38 of"), STATUS_OK)
    with pytest.raises(SystemExit) as exit_info:
        run_validator(monkeypatch)
    assert exit_info.value.code == 2
    assert "README.md claims 'has 38 of 41" in capsys.readouterr().err


def test_main_skips_status_claims_for_another_matrix_and_prints_json(matrix_home, monkeypatch, capsys):
    other = matrix_home.parent / "other.json"
    other.write_bytes(matrix_home.read_bytes())
    # No README or status page exists here: a non-default matrix must not read them.
    assert run_validator(monkeypatch, "--matrix", str(other), "--json") == 0
    assert json.loads(capsys.readouterr().out) == SUMMARY


def test_main_refuses_a_missing_matrix_with_a_usage_error(matrix_home, monkeypatch, capsys):
    with pytest.raises(SystemExit) as exit_info:
        run_validator(monkeypatch, "--matrix", str(matrix_home.parent / "nope.json"))
    assert exit_info.value.code == 2
    assert "cannot read capability matrix" in capsys.readouterr().err


def test_main_refuses_an_invalid_matrix(matrix_home, monkeypatch, capsys):
    data = json.loads(matrix_home.read_text(encoding="utf-8"))
    row(data, "agents")["authority"] = "cloud"
    matrix_home.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(SystemExit) as exit_info:
        run_validator(monkeypatch)
    assert exit_info.value.code == 2
    assert "agents has an invalid authority or state" in capsys.readouterr().err


def test_both_scripts_refuse_bad_arguments_when_run_as_programs(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["validate_capabilities.py", "--matrix", str(tmp_path / "x")])
    with pytest.raises(SystemExit) as exit_info:
        runpy.run_path(str(SCRIPTS / "validate_capabilities.py"), run_name="__main__")
    assert exit_info.value.code == 2
    monkeypatch.setattr(sys, "argv", ["status_page.py", "--write"])
    with pytest.raises(SystemExit) as exit_info:
        runpy.run_path(str(SCRIPTS / "status_page.py"), run_name="__main__")
    assert exit_info.value.code == 2
    assert "Use: python scripts/status_page.py [--check]" in capsys.readouterr().err


# --- status_page -------------------------------------------------------------------------

PINS = {
    "PI_VERSION": "1.0.0",
    "TOOLGATE_VERSION": "2.0.0",
    "MEMORYGATE_VERSION": "3.0.0",
    "SYSTEMGATE_VERSION": "4.0.0",
    "EMBEDDINGS_VERSION": "5.0.0",
    "AGENT_SANDBOX_STATE": "active",
    "OWNER_TERMINAL_STATE": "deferred",
}
CAPS = [
    {"name": "Chats", "state": "active", "deploymentRequirements": ["pi"]},
    {"name": "Terminal", "state": "deferred", "deploymentRequirements": [], "gap": GAP},
]
BLOCKS = ("families", "release", "deferred", "frozen")


def page_text(**bodies: str) -> str:
    parts = ["# Status\n\nHand-written intro.\n"]
    for name in BLOCKS:
        body = bodies.get(name, "old\n")
        parts.append(f"<!-- generated:{name} -->\n{body}<!-- /generated:{name} -->\n")
    return "\n".join(parts) + "\nHand-written end.\n"


def test_deferred_rows_without_requirements_say_so_and_none_deferred_says_nothing():
    assert "| Terminal | " + GAP + " | nothing recorded |" in status_page.deferred(CAPS)
    assert status_page.deferred(CAPS[:1]) == "Nothing is deferred.\n"


@pytest.mark.parametrize(
    "text",
    [
        "No generated blocks at all.\n",
        page_text() + "<!-- generated:frozen -->\nagain\n<!-- /generated:frozen -->\n",
        page_text().replace("generated:frozen", "generated:extra"),
        page_text().replace("<!-- /generated:deferred -->", "<!-- /generated:frozen -->", 1),
    ],
)
def test_a_page_with_missing_duplicate_or_unknown_blocks_is_refused(text):
    with pytest.raises(status_page.StatusPageError, match="must hold each generated block once"):
        status_page.render(text, CAPS, PINS)


@pytest.fixture
def status_home(tmp_path, monkeypatch):
    page = tmp_path / "status.md"
    caps = tmp_path / "capabilities.json"
    env = tmp_path / "versions.env"
    page.write_text(page_text(), encoding="utf-8")
    caps.write_text(json.dumps({"schemaVersion": 1, "capabilities": CAPS}), encoding="utf-8")
    env.write_text("".join(f"{key}={value}\n" for key, value in PINS.items()), encoding="utf-8")
    monkeypatch.setattr(status_page, "PAGE", page)
    monkeypatch.setattr(status_page, "CAPABILITIES", caps)
    monkeypatch.setattr(status_page, "MANIFEST", env)
    return page


@pytest.mark.parametrize("argv", [["--write"], ["--check", "--check"], ["check"]])
def test_main_refuses_unknown_arguments_before_reading_anything(status_home, argv, capsys):
    status_home.unlink()
    assert status_page.main(argv) == 2
    assert "Use: python scripts/status_page.py [--check]" in capsys.readouterr().err


def test_check_refuses_an_out_of_date_page_and_leaves_it_alone(status_home, capsys):
    before = status_home.read_bytes()
    assert status_page.main(["--check"]) == 1
    assert "docs/status.md is out of date" in capsys.readouterr().err
    assert status_home.read_bytes() == before


def test_main_writes_the_page_with_lf_endings_then_reports_it_up_to_date(status_home, capsys):
    assert status_page.main([]) == 0
    assert capsys.readouterr().out == "Wrote docs/status.md.\n"
    written = status_home.read_bytes()
    assert b"\r\n" not in written
    assert b"| ToolGate | 2.0.0 |" in written
    assert b"Hand-written intro." in written and b"Hand-written end." in written
    assert status_page.main(["--check"]) == 0
    assert capsys.readouterr().out == "docs/status.md is up to date.\n"
    assert status_page.main([]) == 0
    assert status_home.read_bytes() == written


def test_main_refuses_a_missing_pin_without_writing(status_home, capsys):
    env = status_page.MANIFEST
    env.write_text("".join(f"{k}={v}\n" for k, v in PINS.items() if k != "EMBEDDINGS_VERSION"), encoding="utf-8")
    before = status_home.read_bytes()
    assert status_page.main([]) == 1
    assert "versions.env has no EMBEDDINGS_VERSION for the row 'Embeddings'" in capsys.readouterr().err
    assert status_home.read_bytes() == before


def test_main_refuses_a_page_without_its_blocks_without_writing(status_home, capsys):
    status_home.write_text("Only hand-written text.\n", encoding="utf-8")
    assert status_page.main([]) == 1
    assert "must hold each generated block once" in capsys.readouterr().err
    assert status_home.read_text(encoding="utf-8") == "Only hand-written text.\n"
