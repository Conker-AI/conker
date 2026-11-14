"""conker update --check: is a newer Conker release published, and what changed in it.

The host reads the latest release anonymously from the GitHub API (Pi reads nothing outside,
ADR-0005) and compares it with CONKER_VERSION in the installed versions.env; a tree without
CONKER_VERSION is an unreleased build, so any release is newer. On the Ubuntu layout a newer release
is kept as an offer (state/update/offer.json: each version with the commit its tag named when first
offered, and the commit each module tag its versions.env pins named then): the only releases the
Inbox's Update (`update.run`) installs, by those commits. With --report, what it found and
every update receipt not reported yet go to Pi's /updates/report through the relay in Pi's own
container (scripts/config_cli.py), with the recovery key that never leaves that container. The
host helper runs `conker update --check --report` once a day (scripts/provider_control.py).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

RELEASES = "https://api.github.com/repos/Conker-AI/conker/releases/latest"
# The commit a release tag names, as 40 hex digits (Accept: application/vnd.github.sha).
TAG_COMMIT = "https://api.github.com/repos/Conker-AI/{repository}/commits/v{version}"
# The versions.env a Conker commit holds (Accept: application/vnd.github.raw).
PINS_AT = "https://api.github.com/repos/Conker-AI/conker/contents/versions.env?ref={commit}"
# Source folder -> (its repository, the versions.env line that pins its tag).
MODULES = {
    "pi": ("pi", "PI_VERSION"),
    "toolgate": ("toolgate", "TOOLGATE_VERSION"),
    "memorygate": ("memorygate", "MEMORYGATE_VERSION"),
    "systemgate": ("systemgate", "SYSTEMGATE_VERSION"),
    "embeddings": ("embeddings", "EMBEDDINGS_VERSION"),
}
COMMIT = re.compile(r"[0-9a-f]{40}")
OFFER = "offer.json"
RELEASE_PAGE = "https://github.com/Conker-AI/conker/releases/tag/"
VERSION = re.compile(r"[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}")
MAX_ANSWER = 512 * 1024
MAX_NOTES = 20000
MAX_REASON = 300
MAX_RESULTS = 20
# How each update receipt (scripts/update_core.py) reads in Pi; a run that changed nothing is not
# reported.
OUTCOMES: dict[object, str] = {
    "applied": "applied",
    "rolled_back": "rolled_back",
    "rollback_unproven": "held",
    "failed_before_apply": "failed",
    "abandoned_before_apply": "failed",
}
RECEIPT_ID = re.compile(r"[0-9a-f]{32}")


class CheckError(RuntimeError):
    """The latest release could not be read, or Pi did not take the report."""


class _Stay(HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None


def version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split("."))


def installed_version(source: Path) -> str | None:
    """CONKER_VERSION in a source tree's versions.env, or None for an unreleased build."""
    try:
        lines = (source / "versions.env").read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        name, separator, value = line.partition("=")
        if separator and name.strip() == "CONKER_VERSION":
            value = value.strip()
            return value if VERSION.fullmatch(value) else None
    return None


def _notes(body: object) -> str:
    """The release text, cut at a line so a long one never ends mid-sentence."""
    text = body if isinstance(body, str) else ""
    text = text.replace("\r\n", "\n").strip()
    if len(text) <= MAX_NOTES:
        return text
    cut = text.rfind("\n", 0, MAX_NOTES - 60)
    kept = text[: cut if cut > 0 else MAX_NOTES - 60].rstrip()
    return kept + "\n\n(The full notes are on the release page.)"


def parse_release(value: object) -> dict:
    """The fields Conker uses, checked; anything else on the page is ignored."""
    if not isinstance(value, dict):
        raise CheckError("The release answer was not an object.")
    tag = value.get("tag_name")
    if not isinstance(tag, str) or not tag.startswith("v") or not VERSION.fullmatch(tag[1:]):
        raise CheckError("The latest release is not named vX.Y.Z.")
    if value.get("draft") or value.get("prerelease"):
        raise CheckError("The latest release is a draft or a pre-release.")
    if value.get("html_url") != RELEASE_PAGE + tag:
        raise CheckError("The latest release page is not Conker's.")
    published = value.get("published_at")
    return {
        "version": tag[1:],
        "notes": _notes(value.get("body")),
        "url": RELEASE_PAGE + tag,
        "publishedAt": published[:40] if isinstance(published, str) else None,
    }


def latest_release(opener=None) -> dict | None:
    """The newest published release, read without a key; None when none is published yet."""
    request = Request(
        RELEASES,
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "conker-update-check",
        },
    )
    try:
        with (opener or build_opener(_Stay())).open(request, timeout=30) as response:
            raw = response.read(MAX_ANSWER + 1)
    except HTTPError as error:
        if error.code == 404:
            return None
        raise CheckError(f"GitHub answered HTTP {error.code}.") from None
    except (URLError, OSError, TimeoutError):
        raise CheckError("GitHub could not be reached.") from None
    if len(raw) > MAX_ANSWER:
        raise CheckError("The release answer was too large.")
    try:
        return parse_release(json.loads(raw))
    except (ValueError, UnicodeDecodeError):
        raise CheckError("The release answer was not JSON.") from None


def _read(url: str, accept: str, limit: int, what: str, opener=None) -> bytes:
    """One anonymous GitHub API read; any failure is a CheckError naming `what`."""
    request = Request(
        url,
        headers={
            "Accept": accept,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "conker-update-check",
        },
    )
    try:
        with (opener or build_opener(_Stay())).open(request, timeout=30) as response:
            raw = response.read(limit + 1)
    except HTTPError as error:
        raise CheckError(f"GitHub answered HTTP {error.code} for {what}.") from None
    except (URLError, OSError, TimeoutError):
        raise CheckError("GitHub could not be reached.") from None
    if len(raw) > limit:
        raise CheckError(f"The answer for {what} was too large.")
    return raw


def tag_commit(version: str, opener=None, repository: str = "conker") -> str:
    """The commit a release tag names now, read without a key. The update downloads that
    commit, so a tag moved after the offer cannot change what is installed."""
    what = "the release's commit" if repository == "conker" else f"the {repository} tag's commit"
    url = TAG_COMMIT.format(repository=repository, version=version)
    commit = _read(url, "application/vnd.github.sha", 128, what, opener)
    commit = commit.decode("ascii", "replace").strip()
    if not COMMIT.fullmatch(commit):
        raise CheckError(f"GitHub named no commit for {what}.")
    return commit


def pins_at(commit: str, opener=None) -> dict[str, str]:
    """The KEY=VALUE lines of versions.env at a Conker commit."""
    url = PINS_AT.format(commit=commit)
    raw = _read(url, "application/vnd.github.raw", MAX_ANSWER, "the release's versions.env", opener)
    pins = {}
    for line in raw.decode("utf-8", "replace").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and not key.startswith("#"):
            pins[key.strip()] = value.strip()
    return pins


def release_commits(version: str, opener=None) -> dict:
    """What an offer installs: the release's commit, and the commit each module tag pinned in that
    commit's versions.env names now (so a module tag moved later changes nothing either)."""
    commit = tag_commit(version, opener)
    pins = pins_at(commit, opener)
    modules = {}
    for folder, (repository, key) in MODULES.items():
        pinned = pins.get(key, "")
        if not VERSION.fullmatch(pinned):
            raise CheckError(f"The {version} release pins no exact {folder} version.")
        modules[folder] = {"version": pinned, "commit": tag_commit(pinned, opener, repository)}
    return {"commit": commit, "modules": modules}


def _is_offer(value: object) -> bool:
    if not isinstance(value, dict) or set(value) != {"commit", "modules"}:
        return False
    modules = value["modules"]
    return (
        isinstance(value["commit"], str)
        and COMMIT.fullmatch(value["commit"]) is not None
        and isinstance(modules, dict)
        and set(modules) == set(MODULES)
        and all(
            isinstance(module, dict)
            and set(module) == {"version", "commit"}
            and isinstance(module["version"], str)
            and VERSION.fullmatch(module["version"]) is not None
            and isinstance(module["commit"], str)
            and COMMIT.fullmatch(module["commit"]) is not None
            for module in modules.values()
        )
    )


def offers(directory: Path) -> dict[str, dict]:
    """Every release a check offered that is still installable, each with the commits its tags
    named when it was first offered; {} when there is none or the file is not one (an offer from
    before module commits were kept is not one: the next check offers it again)."""
    try:
        value = json.loads((directory / OFFER).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    found = value.get("offers") if isinstance(value, dict) else None
    if not isinstance(found, dict) or not all(
        isinstance(version, str) and VERSION.fullmatch(version) and _is_offer(offer)
        for version, offer in found.items()
    ):
        return {}
    return dict(found)


def offered(directory: Path, version: str) -> dict | None:
    """What `update.run` installs for `version` ({"commit", "modules"}), or None: never offered,
    or gone."""
    return offers(directory).get(version)


def offer_arguments(offer: dict) -> list[str]:
    """`conker update --to X.Y.Z` arguments that install an offer by its commits."""
    pins = (f"{name}={pin['version']}@{pin['commit']}" for name, pin in offer["modules"].items())
    return ["--commit", offer["commit"], "--modules", ",".join(pins)]


def save_offers(directory: Path, result: dict, commits_of=None) -> dict[str, dict]:
    """Keep what `update.run` may install (the Ubuntu layout, before Pi hears of the release).

    The latest release is added with the commits its tags name now; one offered before keeps the
    commits it was offered with, so moving a tag later changes nothing. A release at or below the
    running one is dropped (installed or passed), and so is one above the latest (pulled). Every
    other offer stays, so any card Pi still shows can be installed. A check that failed changes
    nothing (this is not called)."""
    latest = (result["latest"] or {}).get("version")
    running = result["running"]

    def keep(version: str) -> bool:
        above = running is None or version_key(version) > version_key(running)
        return above and latest is not None and version_key(version) <= version_key(latest)

    kept = {version: offer for version, offer in offers(directory).items() if keep(version)}
    if result["newer"] and latest is not None and latest not in kept:
        kept[latest] = (commits_of or release_commits)(latest)
    path = directory / OFFER
    if not kept:
        path.unlink(missing_ok=True)
        return kept
    directory.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"offers": kept}, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)
    return kept


def check(source: Path, fetch=None) -> dict:
    running, latest = installed_version(source), (fetch or latest_release)()
    newer = latest is not None and (
        running is None or version_key(latest["version"]) > version_key(running)
    )
    return {"running": running, "latest": latest, "newer": newer}


def render(result: dict) -> str:
    running = result["running"] or "an unreleased build"
    latest = result["latest"]
    if latest is None:
        return f"Conker {running} is running. No release is published yet."
    if not result["newer"]:
        return (
            f"Conker {running} is running. It is up to date "
            f"(latest release {latest['version']})."
        )
    published = f" (published {latest['publishedAt'][:10]})" if latest["publishedAt"] else ""
    return "\n".join(
        [
            f"Conker {running} is running. {latest['version']} is available{published}.",
            "",
            latest["notes"] or "(No release notes.)",
            "",
            f"Release page: {latest['url']}",
            "Update from the Inbox, or run: conker update --to " + latest["version"],
        ]
    )


def update_directory(root: Path, layout: str) -> Path:
    """Where this layout's update state and receipts live (scripts/update_core.py UpdateStore)."""
    if layout == "ubuntu":
        return root / "state" / "update"
    path = subprocess.run(
        ["git", "rev-parse", "--git-path", "conker-update"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    ).stdout.strip()
    candidate = Path(path)
    return candidate if candidate.is_absolute() else (root / candidate).resolve()


def _reported(directory: Path) -> set[str]:
    try:
        value = json.loads((directory / "reported.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    return {item for item in value if isinstance(item, str)} if isinstance(value, list) else set()


def _result(receipt: dict) -> dict | None:
    outcome = OUTCOMES.get(receipt.get("status"))
    identity = receipt.get("transaction_id")
    version = receipt.get("target") or (receipt.get("candidate") or {}).get("revision")
    finished = receipt.get("finished_at")
    if (
        outcome is None
        or not isinstance(identity, str)
        or not RECEIPT_ID.fullmatch(identity)
        or not isinstance(version, str)
        or not VERSION.fullmatch(version)
        or not isinstance(finished, (int, float))
    ):
        return None
    reason = receipt.get("reason")
    return {
        "id": identity,
        "version": version,
        "outcome": outcome,
        "reason": reason[:MAX_REASON] if isinstance(reason, str) else None,
        "finishedAt": float(finished),
    }


def pending_results(directory: Path) -> list[dict]:
    """Finished updates Pi has not been told about, newest first."""
    done, results = _reported(directory), []
    for path in sorted((directory / "receipts").glob("*.json")):
        try:
            receipt = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        result = _result(receipt) if isinstance(receipt, dict) else None
        if result and result["id"] not in done:
            results.append(result)
    results.sort(key=lambda item: item["finishedAt"], reverse=True)
    return results[:MAX_RESULTS]


def mark_reported(directory: Path, identities: list[str]) -> None:
    if not identities:
        return
    seen = sorted(_reported(directory) | set(identities))
    path = directory / "reported.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(seen) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def relay(root: Path, layout: str, body: dict) -> dict:
    """POST /updates/report inside the pi container (scripts/config_cli.py)."""
    try:
        from config_cli import NotConfirmed, compose, request
    except ModuleNotFoundError:
        from scripts.config_cli import NotConfirmed, compose, request
    try:
        return request(compose(root, layout), "pi", "/updates/report", body)
    except NotConfirmed as error:
        raise CheckError(str(error)) from None


def report(root: Path, layout: str, result: dict, send=None) -> int:
    """Hand Pi what the check found and the unreported receipts; returns how many receipts."""
    directory = update_directory(root, layout)
    results = pending_results(directory)
    body = {"running": result["running"], "latest": result["latest"], "results": results}
    (send or relay)(root, layout, body)
    mark_reported(directory, [item["id"] for item in results])
    return len(results)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="conker update --check", description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    parser.add_argument("--report", action="store_true", help="also tell Pi (the Inbox)")
    parser.add_argument("--json", action="store_true", help="print the result as JSON")
    args = parser.parse_args(argv)
    failures = (CheckError, OSError, subprocess.SubprocessError)
    try:
        result = check(args.source)
        if args.layout == "ubuntu":  # before Pi offers it, so the Inbox's Update finds it
            save_offers(update_directory(args.root, args.layout), result)
    except failures as error:
        # GitHub can't be read: a finished update still reaches the Inbox.
        if args.report:
            unknown = {"running": installed_version(args.source), "latest": None}
            try:
                if pending_results(update_directory(args.root, args.layout)):
                    report(args.root, args.layout, unknown)
            except failures:
                pass  # sent again at the next check
        print(f"Conker could not check for updates: {error}", file=sys.stderr)
        return 1
    try:
        reported = report(args.root, args.layout, result) if args.report else None
    except failures as error:
        print(f"Conker could not tell the Inbox: {error}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(render(result))
        if reported:
            print(f"Told the Inbox about {reported} finished update(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
