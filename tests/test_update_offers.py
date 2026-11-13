"""The offers (state/update/offer.json): the only releases update.run installs, by the commits
their tags named when first offered, Conker's and each module's (scripts/update_check.py)."""

from __future__ import annotations

import io
import json
from urllib.error import HTTPError

import pytest

from scripts import update_check
from scripts.update_check import CheckError
from tests.test_update_check import SHA, Opener, release, source

OTHER = "f" * 40
PINS = {
    "pi": ("pi", "0.24.0"),
    "toolgate": ("toolgate", "0.15.1"),
    "memorygate": ("memorygate", "0.8.2"),
    "systemgate": ("systemgate", "0.5.2"),
    "embeddings": ("embeddings", "0.1.7"),
}


def pinned(commit=SHA, module=SHA):
    """One offer as release_commits() makes it."""
    modules = {name: {"version": version, "commit": module} for name, (_r, version) in PINS.items()}
    return {"commit": commit, "modules": modules}


def found(running, latest):
    """What check() found: `latest` None means no release is published."""
    newer = latest is not None and (
        running is None or update_check.version_key(latest) > update_check.version_key(running)
    )
    return {"running": running, "latest": {"version": latest} if latest else None, "newer": newer}


class GitHub:
    """Answers by URL, as the GitHub API would; an unknown URL is a 404."""

    def __init__(self, answers):
        self.answers, self.requests = answers, []

    def open(self, request, timeout):
        self.requests.append(request)
        if request.full_url not in self.answers:
            raise HTTPError(request.full_url, 404, "Not Found", {}, None)  # type: ignore[arg-type]
        return io.BytesIO(self.answers[request.full_url])


API = "https://api.github.com/repos/Conker-AI/"
VERSIONS_ENV = "".join(
    f"{key}={PINS[folder][1]}\n" for folder, (_r, key) in update_check.MODULES.items()
)


def github(versions_env=VERSIONS_ENV, module=OTHER):
    answers = {
        API + "conker/commits/v0.2.0": SHA.encode(),
        API + f"conker/contents/versions.env?ref={SHA}": ("CONKER_VERSION=0.2.0\n" + versions_env).encode(),
    }
    for repository, version in PINS.values():
        answers[API + f"{repository}/commits/v{version}"] = (module + "\n").encode()
    return GitHub(answers)


# --- reading the commits -----------------------------------------------------------------------


def test_the_tag_commit_is_read_anonymously_as_a_bare_sha():
    opener = Opener((SHA + "\n").encode())
    assert update_check.tag_commit("0.2.0", opener) == SHA
    [request] = opener.requests
    assert request.full_url == "https://api.github.com/repos/Conker-AI/conker/commits/v0.2.0"
    assert request.headers["Accept"] == "application/vnd.github.sha"
    assert "Authorization" not in request.headers


@pytest.mark.parametrize("answer", [b"main", b"{}", SHA[:39].encode(), SHA.upper().encode()])
def test_an_answer_that_is_not_a_commit_is_refused(answer):
    with pytest.raises(CheckError, match="no commit"):
        update_check.tag_commit("0.2.0", Opener(answer))


def test_a_missing_tag_is_said_plainly():
    missing = HTTPError(update_check.TAG_COMMIT, 422, "No commit", {}, None)  # type: ignore[arg-type]
    with pytest.raises(CheckError, match="HTTP 422"):
        update_check.tag_commit("0.2.0", Opener(missing))


def test_each_module_is_read_at_the_tag_the_release_commit_pins():
    opener = github()
    assert update_check.release_commits("0.2.0", opener) == pinned(SHA, OTHER)
    urls = [request.full_url for request in opener.requests]
    # versions.env is read at the release's commit, not at the tag (which may move meanwhile).
    assert urls[1] == API + f"conker/contents/versions.env?ref={SHA}"
    assert opener.requests[1].headers["Accept"] == "application/vnd.github.raw"
    assert sorted(urls[2:]) == sorted(API + f"{r}/commits/v{v}" for r, v in PINS.values())
    assert all("Authorization" not in request.headers for request in opener.requests)


@pytest.mark.parametrize(
    "versions_env",
    [
        VERSIONS_ENV.replace("PI_VERSION=0.24.0\n", ""),
        VERSIONS_ENV.replace("PI_VERSION=0.24.0", "PI_VERSION=latest"),
        VERSIONS_ENV.replace("PI_VERSION=0.24.0", "# PI_VERSION=0.24.0"),
    ],
)
def test_a_release_without_an_exact_module_pin_is_not_offered(versions_env):
    with pytest.raises(CheckError, match="pins no exact pi version"):
        update_check.release_commits("0.2.0", github(versions_env))


def test_a_module_tag_that_is_missing_or_not_a_commit_is_not_offered():
    opener = github(module="main")
    with pytest.raises(CheckError, match="no commit for the pi tag's commit"):
        update_check.release_commits("0.2.0", opener)
    opener = github()
    del opener.answers[API + "embeddings/commits/v0.1.7"]
    with pytest.raises(CheckError, match="HTTP 404 for the embeddings tag's commit"):
        update_check.release_commits("0.2.0", opener)


# --- keeping the offers ------------------------------------------------------------------------


def test_an_offer_keeps_the_commits_it_was_first_offered_with(tmp_path):
    update_check.save_offers(tmp_path, found("0.1.0", "0.2.0"), commits_of=lambda _v: pinned())
    # Conker's tag and a module's tag moved: a later check must not install what they name now.
    moved = lambda _v: pinned(OTHER, OTHER)  # noqa: E731
    kept = update_check.save_offers(tmp_path, found("0.1.0", "0.2.0"), commits_of=moved)
    assert kept == {"0.2.0": pinned()}
    assert update_check.offered(tmp_path, "0.2.0") == pinned()


def test_an_offer_becomes_the_update_arguments():
    offer = pinned(SHA, OTHER)
    arguments = update_check.offer_arguments(offer)
    assert arguments[:3] == ["--commit", SHA, "--modules"]
    assert arguments[3].split(",") == [f"{name}={v}@{OTHER}" for name, (_r, v) in PINS.items()]


def test_an_older_offer_stays_installable_beside_a_newer_one(tmp_path):
    update_check.save_offers(tmp_path, found("0.1.0", "0.2.0"), commits_of=lambda _v: pinned())
    newer = lambda _v: pinned(OTHER)  # noqa: E731
    update_check.save_offers(tmp_path, found("0.1.0", "0.3.0"), commits_of=newer)
    # Pi may still show the 0.2.0 card (its report failed, or the shell checked): it still works.
    assert update_check.offers(tmp_path) == {"0.2.0": pinned(), "0.3.0": pinned(OTHER)}


def test_installed_passed_and_pulled_releases_are_dropped(tmp_path):
    for version in ("0.2.0", "0.3.0", "0.4.0"):
        update_check.save_offers(tmp_path, found("0.1.0", version), commits_of=lambda _v: pinned())
    # 0.2.0 is running now, and 0.4.0 was pulled (the latest is 0.3.0 again).
    assert update_check.save_offers(tmp_path, found("0.2.0", "0.3.0")) == {"0.3.0": pinned()}
    assert update_check.save_offers(tmp_path, found("0.3.0", "0.3.0")) == {}
    assert not (tmp_path / "offer.json").exists()


def test_no_commit_is_looked_up_when_nothing_is_newer(tmp_path):
    def lookup(_version):
        pytest.fail("not looked up")

    assert update_check.save_offers(tmp_path, found("0.2.0", "0.2.0"), commits_of=lookup) == {}
    assert update_check.save_offers(tmp_path, found("0.2.0", None), commits_of=lookup) == {}


def _without(name):
    offer = pinned()
    del offer["modules"][name]
    return offer


def _module(**changes):
    offer = pinned()
    offer["modules"]["pi"] = {**offer["modules"]["pi"], **changes}
    return offer


@pytest.mark.parametrize(
    "text",
    [
        "{bad",
        "[]",
        json.dumps({"version": "0.2.0", "commit": SHA}),
        json.dumps({"offers": {"v0.2.0": pinned()}}),
        json.dumps({"offers": {"0.2.0": SHA}}),  # from before module commits were kept
        json.dumps({"offers": {"0.2.0": pinned("main")}}),
        json.dumps({"offers": {"0.2.0": pinned(), "0.3.0": pinned(SHA[:39])}}),
        json.dumps({"offers": {"0.2.0": _without("systemgate")}}),
        json.dumps({"offers": {"0.2.0": {**pinned(), "extra": 1}}}),
        json.dumps({"offers": {"0.2.0": _module(commit="main")}}),
        json.dumps({"offers": {"0.2.0": _module(version="0.24")}}),
        json.dumps({"offers": {"0.2.0": _module(tag="v0.24.0")}}),
        json.dumps({"offers": {"0.2.0": {"commit": SHA, "modules": {**pinned()["modules"], "x": {}}}}}),
    ],
)
def test_an_offer_file_that_is_not_one_offers_nothing(tmp_path, text):
    (tmp_path / "offer.json").write_text(text, encoding="utf-8")
    assert update_check.offers(tmp_path) == {}
    assert update_check.offered(tmp_path, "0.2.0") is None


# --- the daily check ---------------------------------------------------------------------------


def test_the_daily_check_keeps_the_offer_before_telling_pi(tmp_path, monkeypatch):
    root, seen = tmp_path / "deploy", []
    folder = root / "state" / "update"
    monkeypatch.setattr(update_check, "latest_release", release("0.2.0"))
    monkeypatch.setattr(update_check, "release_commits", lambda _v: pinned())
    monkeypatch.setattr(
        update_check, "relay", lambda *args: seen.append(update_check.offers(folder))
    )
    arguments = ["--root", str(root), "--source", str(source(tmp_path / "src", "0.1.0"))]

    assert update_check.main([*arguments, "--layout", "ubuntu", "--report"]) == 0

    assert seen == [{"0.2.0": pinned()}]  # there when Pi showed the card


def test_a_commit_that_cannot_be_read_fails_the_check_and_keeps_the_offers(tmp_path, monkeypatch):
    root = tmp_path / "deploy"
    folder = root / "state" / "update"
    update_check.save_offers(folder, found("0.1.0", "0.2.0"), commits_of=lambda _v: pinned())
    sent = []

    def offline(_version):
        raise CheckError("GitHub could not be reached.")

    monkeypatch.setattr(update_check, "latest_release", release("0.3.0"))
    monkeypatch.setattr(update_check, "release_commits", offline)
    monkeypatch.setattr(update_check, "relay", lambda *args: sent.append(args[2]))
    arguments = ["--root", str(root), "--source", str(source(tmp_path / "src", "0.1.0"))]

    assert update_check.main([*arguments, "--layout", "ubuntu", "--report"]) == 1
    assert update_check.offers(folder) == {"0.2.0": pinned()}
    assert sent == []  # Pi is not offered 0.3.0, which could not be installed


def test_the_repository_layout_looks_up_no_commit(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(update_check, "latest_release", release("0.2.0"))
    monkeypatch.setattr(update_check, "release_commits", lambda _v: pytest.fail("not looked up"))
    arguments = ["--root", str(tmp_path), "--source", str(source(tmp_path / "src", "0.1.0"))]

    assert update_check.main([*arguments, "--layout", "repository"]) == 0
    assert "0.2.0 is available" in capsys.readouterr().out
