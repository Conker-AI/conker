"""conker update --check: the latest release read and checked, compared with the installed version,
and handed to Pi with the update receipts it has not heard about."""

from __future__ import annotations

import io
import json
from pathlib import Path
from urllib.error import HTTPError

import pytest

from scripts import update_check
from scripts.update_check import CheckError, check, parse_release, render

PAGE = "https://github.com/Conker-AI/conker/releases/tag/"


def page(tag="v0.2.0", **changes):
    return {
        "tag_name": tag,
        "html_url": PAGE + tag,
        "draft": False,
        "prerelease": False,
        "published_at": "2026-11-12T08:00:00Z",
        "body": "- **Self-update.** Conker updates itself.\r\n",
        "assets": [{"name": "ignored"}],
        **changes,
    }


def source(tmp_path: Path, version: str | None) -> Path:
    tmp_path.mkdir(parents=True, exist_ok=True)
    lines = ["PI_VERSION=0.25.0"] + ([f"CONKER_VERSION={version}"] if version else [])
    (tmp_path / "versions.env").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return tmp_path


def release(version="0.2.0"):
    return lambda: parse_release(page("v" + version))


def test_a_release_page_keeps_only_what_conker_uses():
    assert parse_release(page()) == {
        "version": "0.2.0",
        "notes": "- **Self-update.** Conker updates itself.",
        "url": PAGE + "v0.2.0",
        "publishedAt": "2026-11-12T08:00:00Z",
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"tag_name": "0.2.0"},
        {"tag_name": "v0.2"},
        {"tag_name": "v0.2.0-rc.1", "html_url": PAGE + "v0.2.0-rc.1"},
        {"draft": True},
        {"prerelease": True},
        {"html_url": "https://github.com/someone/conker/releases/tag/v0.2.0"},
    ],
)
def test_a_release_page_that_is_not_a_conker_release_is_refused(changes):
    with pytest.raises(CheckError):
        parse_release(page(**changes))


def test_long_notes_are_cut_at_a_line_and_point_to_the_page():
    notes = parse_release(page(body="- a line\n" * 5000))["notes"]
    assert len(notes) <= update_check.MAX_NOTES
    assert notes.endswith("(The full notes are on the release page.)")
    assert "- a line\n\n(The full" in notes


def test_a_newer_release_is_found(tmp_path):
    result = check(source(tmp_path, "0.1.0"), fetch=release("0.10.0"))
    assert result["newer"] and result["running"] == "0.1.0"
    text = render(result)
    assert "Conker 0.1.0 is running. 0.10.0 is available (published 2026-11-12)." in text
    assert "conker update --to 0.10.0" in text and "Self-update" in text


def test_the_running_release_is_up_to_date(tmp_path):
    result = check(source(tmp_path, "0.2.0"), fetch=release("0.2.0"))
    assert not result["newer"]
    assert render(result) == "Conker 0.2.0 is running. It is up to date (latest release 0.2.0)."


def test_an_unreleased_build_is_offered_any_release(tmp_path):
    result = check(source(tmp_path, None), fetch=release("0.1.0"))
    assert result["newer"] and result["running"] is None
    assert render(result).startswith("Conker an unreleased build is running. 0.1.0 is available")


def test_no_release_published_yet(tmp_path):
    result = check(source(tmp_path, "0.1.0"), fetch=lambda: None)
    assert render(result) == "Conker 0.1.0 is running. No release is published yet."


class Opener:
    def __init__(self, answer):
        self.answer, self.requests = answer, []

    def open(self, request, timeout):
        self.requests.append(request)
        if isinstance(self.answer, Exception):
            raise self.answer
        return io.BytesIO(self.answer)


def test_the_release_is_read_anonymously_from_the_github_api():
    opener = Opener(json.dumps(page()).encode())
    assert update_check.latest_release(opener)["version"] == "0.2.0"
    [request] = opener.requests
    assert request.full_url == "https://api.github.com/repos/Conker-AI/conker/releases/latest"
    assert "Authorization" not in request.headers


def test_no_release_answers_none_and_other_errors_are_said_plainly():
    missing = HTTPError(update_check.RELEASES, 404, "Not Found", {}, None)
    assert update_check.latest_release(Opener(missing)) is None
    limited = HTTPError(update_check.RELEASES, 403, "rate limited", {}, None)
    with pytest.raises(CheckError, match="HTTP 403"):
        update_check.latest_release(Opener(limited))
    with pytest.raises(CheckError, match="too large"):
        update_check.latest_release(Opener(b" " * (update_check.MAX_ANSWER + 1)))


def receipt(folder: Path, identity: str, status: str, target="0.2.0", finished=1000):
    (folder / "receipts").mkdir(parents=True, exist_ok=True)
    value = {
        "transaction_id": identity,
        "status": status,
        "target": target,
        "finished_at": finished,
        "reason": "candidate failed: Conker 0.2.0 did not answer its health checks",
    }
    (folder / "receipts" / f"{identity}.json").write_text(json.dumps(value), encoding="utf-8")


def test_receipts_are_reported_once_and_runs_that_changed_nothing_are_not(tmp_path):
    root = tmp_path / "deploy"
    folder = root / "state" / "update"
    receipt(folder, "a" * 32, "rolled_back", finished=2000)
    receipt(folder, "b" * 32, "rollback_unproven", finished=3000)
    receipt(folder, "c" * 32, "no_change")
    receipt(folder, "d" * 32, "applied", target=None)  # a branch update names no release
    (folder / "receipts" / "torn.json").write_text("{", encoding="utf-8")
    sent = []
    found = {"running": "0.1.0", "latest": parse_release(page()), "newer": True}
    count = update_check.report(root, "ubuntu", found, send=lambda *args: sent.append(args[2]))
    assert count == 2
    [body] = sent
    assert body["running"] == "0.1.0" and body["latest"]["version"] == "0.2.0"
    assert [(item["id"][0], item["outcome"]) for item in body["results"]] == [
        ("b", "held"),
        ("a", "rolled_back"),
    ]
    update_check.report(root, "ubuntu", found, send=lambda *args: sent.append(args[2]))
    assert sent[1]["results"] == []


def test_a_report_pi_did_not_take_is_sent_again_next_time(tmp_path):
    root = tmp_path / "deploy"
    receipt(root / "state" / "update", "a" * 32, "applied")

    def refused(*_args):
        raise CheckError("Pi did not answer")

    with pytest.raises(CheckError):
        update_check.report(root, "ubuntu", {"running": None, "latest": None}, send=refused)
    sent = []
    update_check.report(
        root, "ubuntu", {"running": None, "latest": None}, send=lambda *a: sent.append(a[2])
    )
    assert [item["outcome"] for item in sent[0]["results"]] == ["applied"]


def test_the_command_says_why_it_could_not_check(tmp_path, monkeypatch, capsys):
    def offline():
        raise CheckError("GitHub could not be reached.")

    monkeypatch.setattr(update_check, "latest_release", offline)
    code = update_check.main(
        ["--root", str(tmp_path), "--source", str(source(tmp_path, "0.1.0")), "--layout", "ubuntu"]
    )
    assert code == 1
    assert "could not check for updates: GitHub could not be reached." in capsys.readouterr().err
