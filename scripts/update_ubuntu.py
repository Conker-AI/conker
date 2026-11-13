"""conker update --to X.Y.Z on the Ubuntu layout: staged, snapshotted, verified, rolled back.

The Ubuntu layout builds its images from the source exports in `sources/` (deploy/ubuntu/README.md).
An update goes to one exact Conker release, never a branch, on the shared coordinator
(scripts/update_core.py), which saves every phase so an update cut off anywhere is rolled back on
the next run:

1. preflight: the release is newer than the running one, no recovery or backup is held, the disk
   has room;
2. stage: that tag of Conker and the tag of every module its versions.env pins, downloaded into a
   staging folder, and the dashboard built from it in the pinned Node image; nothing running
   changes;
3. protect: a verified snapshot (`conker backup`), before anything running changes;
4. apply code: compose.json is copied to recovery/pre-update-STAMP, the staged sources trade
   places with sources/ in one step (scripts/update_swap.py, so a power cut never leaves sources/
   missing) and the old ones move into that folder;
5. apply services: prepare.py with the installed origin and agent workspaces, build, start, and the
   refreshed launcher;
6. verify: `conker status --strict` until every service answers.

A failure after step 4 puts the old sources and compose.json back, builds and starts them and
proves them answering (rolled back). An update cut off part way (a reboot) gets the same rollback
from `conker update --recover`, which the host helper runs when it starts. When that cannot be proven the coordinator leaves a HOLD and
the snapshot is the way back. The result goes to the Inbox (scripts/update_check.py report).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path
from typing import Any, NoReturn
from urllib.request import Request, build_opener

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts import update_pi_db
    from scripts.update_check import (
        COMMIT,
        VERSION,
        _Stay,
        installed_version,
        report,
        version_key,
    )
    from scripts.update_core import (
        LOCK_TOKEN,
        UpdateCoordinator,
        UpdateError,
        UpdateStore,
        _acquire_lock,
        _release_lock,
        _token,
    )
    from scripts.update_swap import identity, put_back, swap_in
except ModuleNotFoundError:
    import update_pi_db
    from update_check import COMMIT, VERSION, _Stay, installed_version, report, version_key
    from update_core import (
        LOCK_TOKEN,
        UpdateCoordinator,
        UpdateError,
        UpdateStore,
        _acquire_lock,
        _release_lock,
        _token,
    )
    from update_swap import identity, put_back, swap_in

ARCHIVE = "https://codeload.github.com/Conker-AI/{repository}/tar.gz/refs/tags/v{version}"
COMMIT_ARCHIVE = "https://codeload.github.com/Conker-AI/conker/tar.gz/{commit}"
# A snapshot `conker backup` made (scripts/recovery_backup.py): the update's own, named in its state.
SNAPSHOT_NAME = re.compile(r"snapshot-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}")
# Source folder -> (its repository, the versions.env line that pins its tag).
MODULES = {
    "pi": ("pi", "PI_VERSION"),
    "toolgate": ("toolgate", "TOOLGATE_VERSION"),
    "memorygate": ("memorygate", "MEMORYGATE_VERSION"),
    "systemgate": ("systemgate", "SYSTEMGATE_VERSION"),
    "embeddings": ("embeddings", "EMBEDDINGS_VERSION"),
}
MAX_ARCHIVE = 300 * 1024 * 1024
# Markers in the deployment that no update or rollback may run beside.
QUIET = {".conker-recovery.json": "a recovery is held", ".conker-backup.lock": "a backup is running"}
# What one unpacked release may hold: a hostile archive cannot fill the disk before the update starts.
MAX_UNPACKED = 3 * 1024 * 1024 * 1024
MAX_MEMBERS = 200_000
MIN_FREE = 20 * 1024**3  # a snapshot (about 10 GB today) plus the build
BUILD_SECONDS = 3600
START_SECONDS = 900
# Runs in the pinned Node image; the built files belong to the owner, not to root.
BUILD_SCRIPT = (
    "npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null"
    ' && chown -R "$HOST_UID:$HOST_GID" dist'
)


def _owner() -> tuple[int, int]:
    """This user's ids, for the files the dashboard build writes (POSIX; 1000 elsewhere)."""
    getuid, getgid = getattr(os, "getuid", None), getattr(os, "getgid", None)
    return (getuid(), getgid()) if getuid and getgid else (1000, 1000)


def versions(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        if separator and not name.lstrip().startswith("#"):
            values[name.strip()] = value.strip()
    return values


def download(url: str, target: Path) -> None:
    """One GitHub tag archive into `target`, without its top folder. Links stay inside it."""
    with tempfile.TemporaryFile() as buffer:
        request = Request(url, headers={"User-Agent": "conker-update"})
        with build_opener(_Stay()).open(request, timeout=120) as response:
            size = 0
            while chunk := response.read(1 << 20):
                size += len(chunk)
                if size > MAX_ARCHIVE:
                    raise UpdateError("a release archive was larger than expected")
                buffer.write(chunk)
        buffer.seek(0)
        with tarfile.open(fileobj=buffer, mode="r:gz") as bundle:
            members, unpacked = [], 0
            for count, member in enumerate(bundle, start=1):
                unpacked += max(member.size, 0)
                if count > MAX_MEMBERS or unpacked > MAX_UNPACKED:
                    raise UpdateError("a release archive unpacks to more than expected")
                _, _, inner = member.name.partition("/")
                if not inner:
                    continue
                member.name = inner
                if member.islnk():
                    member.linkname = member.linkname.partition("/")[2]
                members.append(member)
            target.mkdir(parents=True)
            bundle.extractall(target, members=members, filter="data")


class UbuntuTransport:
    """Source exports, Compose and health for the Ubuntu layout (deploy/ubuntu)."""

    def __init__(
        self, root: Path, version: str, *, commit=None, run=None, fetch=download, home=None
    ):
        if not VERSION.fullmatch(version):
            raise UpdateError("name a release as X.Y.Z")
        if commit is not None and not COMMIT.fullmatch(commit):
            raise UpdateError("name the release's commit as 40 hex digits")
        self.commit = commit  # the commit the offer's tag named; None: the tag as it is now
        self.root, self.target = root.resolve(), version
        self.sources, self.compose_file = self.root / "sources", self.root / "compose.json"
        self.fetch, self.home = fetch, Path(home or Path.home())
        self._runner = run or self._subprocess
        self.stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())

    # --- commands ---------------------------------------------------------------------------

    @staticmethod
    def _subprocess(argv, *, cwd, env, timeout) -> int:
        return subprocess.run(
            argv,
            cwd=cwd,
            env=env,
            timeout=timeout,
            check=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode

    def _environment(self, **extra: str) -> dict[str, str]:
        return {
            **os.environ,
            "CONKER_LAYOUT": "ubuntu",
            "CONKER_DEPLOY_DIR": str(self.root),
            "NO_COLOR": "1",
            **extra,
        }

    def _run(
        self, argv: list[str], what: str, *, timeout: int = 600, env: dict | None = None
    ) -> None:
        try:
            code = self._runner(
                argv, cwd=self.root, env=self._environment(**(env or {})), timeout=timeout
            )
        except subprocess.TimeoutExpired:
            raise UpdateError(f"{what} took longer than {timeout // 60} minutes") from None
        except OSError:
            raise UpdateError(f"{what} could not start") from None
        if code:
            raise UpdateError(f"{what} failed")

    def _conker(self, *arguments: str) -> list[str]:
        return ["bash", str(self.sources / "companion" / "conker"), *arguments]

    def _compose(self, *arguments: str) -> list[str]:
        return [
            "docker",
            "compose",
            "--project-directory",
            str(self.root),
            "-f",
            str(self.compose_file),
            *arguments,
        ]

    # --- the coordinator's steps -------------------------------------------------------------

    def preflight(self) -> None:
        running = installed_version(self.sources / "companion")
        if running is not None and version_key(running) >= version_key(self.target):
            raise UpdateError(f"Conker {running} is running; {self.target} is not newer")
        self.require_quiet()
        if not self.compose_file.is_file() or not (self.sources / "companion").is_dir():
            raise UpdateError("this is not an installed Ubuntu-layout Conker")
        if not self.origin():
            raise UpdateError("the installed gateway origin is missing")
        if shutil.disk_usage(self.root).free < MIN_FREE:
            raise UpdateError("the disk needs 20 GB free for the snapshot and the build")

    def require_quiet(self) -> None:
        """No held recovery and no running backup: a rollback restarts what a backup stops."""
        for name, label in QUIET.items():
            if (self.root / name).exists():
                raise UpdateError(f"{label}, so nothing was changed")

    def origin(self) -> str | None:
        try:
            return versions(self.root / "state" / "gateway.env").get("GATEWAY_ORIGIN") or None
        except OSError:
            return None

    def workspaces(self) -> str | None:
        """The agent workspaces folder this install already uses (prepare.py's volume)."""
        model = json.loads(self.compose_file.read_text(encoding="utf-8"))
        volume = (model.get("volumes") or {}).get("agent_workspaces") or {}
        device = (volume.get("driver_opts") or {}).get("device")
        return device if isinstance(device, str) and device.startswith("/") else None

    def snapshot(self) -> dict[str, Any]:
        """What is installed now, so a rollback can prove it came back."""
        digest = hashlib.sha256(self.compose_file.read_bytes()).hexdigest()
        return {
            "revision": installed_version(self.sources / "companion") or "unreleased",
            "manifest": {"compose_sha256": digest},
            "services": None,
        }

    @property
    def staging(self) -> Path:
        return self.root / f"staging-{self.stamp}"

    @property
    def recovery(self) -> Path:
        return self.root / "recovery" / f"pre-update-{self.stamp}"

    def prepare_candidate(self, prior: dict[str, Any]) -> dict[str, Any]:
        staging = self.staging
        try:
            if self.commit:
                url = COMMIT_ARCHIVE.format(commit=self.commit)
            else:
                url = ARCHIVE.format(repository="conker", version=self.target)
            self.fetch(url, staging / "companion")
            pinned = versions(staging / "companion" / "versions.env")
            if pinned.get("CONKER_VERSION") != self.target:
                raise UpdateError(f"the v{self.target} release does not say it is {self.target}")
            modules = {}
            for folder, (repository, key) in MODULES.items():
                version = pinned.get(key, "")
                if not VERSION.fullmatch(version):
                    raise UpdateError(f"the release pins no exact {folder} version")
                self.fetch(
                    ARCHIVE.format(repository=repository, version=version), staging / folder
                )
                modules[folder] = version
            self._build_dashboard(staging / "companion", pinned.get("NODE_BUILD_IMAGE", ""))
        except BaseException:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return {
            "revision": self.target,
            "commit": self.commit,
            "modules": modules,
            "staging": str(staging),
            "recovery": str(self.recovery),
            # How a rollback knows the sources from before wherever a cut left them (update_swap).
            "sources_id": identity(self.sources),
        }

    def _build_dashboard(self, companion: Path, image: str) -> None:
        if "@sha256:" not in image:
            raise UpdateError("the release pins no Node build image by digest")
        self._run(
            [
                "docker", "run", "--rm", "--network", "bridge",
                "--env", f"HOST_UID={_owner()[0]}", "--env", f"HOST_GID={_owner()[1]}",
                "--mount", f"type=bind,src={companion / 'dashboard'},dst=/workspace",
                "--mount", "type=volume,dst=/workspace/node_modules",
                "--workdir", "/workspace", image, "sh", "-c",
                BUILD_SCRIPT,
            ],
            "building the dashboard",
            timeout=BUILD_SECONDS,
        )  # fmt: skip
        if not (companion / "dashboard" / "dist" / "index.html").is_file():
            raise UpdateError("the dashboard build made no page")

    def pull_exact_images(self, candidate: dict[str, Any]) -> dict[str, str]:
        """Nothing to pull: this layout builds its images from the sources in apply_services."""
        return {}

    def _snapshots(self) -> Path:
        return Path(os.environ.get("CONKER_UPDATE_SNAPSHOTS", self.home / "conker-snapshots"))

    def protect(self, candidate: dict[str, Any]) -> dict[str, str]:
        """A verified snapshot of everything Conker holds, before anything running changes."""
        destination = self._snapshots()
        destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        before = {path.name for path in destination.iterdir()}
        self._run(
            self._conker("backup", "--destination", str(destination)),
            "the snapshot before the update",
            timeout=4 * 3600,
            env={LOCK_TOKEN: _token()},  # this update's own snapshot may run under its lock
        )
        made = sorted(
            path.name
            for path in destination.iterdir()
            if path.name not in before and path.name.startswith("snapshot-")
        )
        if len(made) != 1:
            raise UpdateError("the snapshot before the update could not be found")
        return {"snapshot": made[0]}

    def apply_code(self, candidate: dict[str, Any]) -> None:
        recovery, staging = Path(candidate["recovery"]), Path(candidate["staging"])
        recovery.mkdir(parents=True, mode=0o700)
        shutil.copy2(self.compose_file, recovery / "compose.json")
        swap_in(staging, self.sources, recovery / "sources")  # sources/ exists at every instant

    def _start(self, what: str) -> None:
        extra = {"CONKER_WORKSPACES_DIR": folder} if (folder := self.workspaces()) else {}
        prepare = self.sources / "companion" / "deploy" / "ubuntu" / "prepare.py"
        self._run(
            [sys.executable, str(prepare), self.origin() or ""], f"preparing {what}", env=extra
        )
        self._run(self._compose("build"), f"building {what}", timeout=BUILD_SECONDS)
        self._run(
            self._compose("up", "-d", "--remove-orphans"),
            f"starting {what}",
            timeout=START_SECONDS,
        )
        launcher = self.home / ".local" / "bin" / "conker"
        if launcher.is_file():
            shutil.copy2(self.sources / "companion" / "deploy" / "ubuntu" / "conker", launcher)
            launcher.chmod(0o755)

    def apply_services(self, candidate: dict[str, Any]) -> None:
        self._start(f"Conker {self.target}")

    def _answering(self, what: str) -> None:
        limit = int(os.environ.get("CONKER_UPDATE_HEALTH_TIMEOUT", "300"))
        deadline = time.monotonic() + limit
        while True:
            try:
                self._run(self._conker("status", "--strict"), "the health check", timeout=120)
                return
            except UpdateError:
                if time.monotonic() >= deadline:
                    raise UpdateError(f"{what} did not answer its health checks") from None
            time.sleep(10)

    def verify_candidate(self, candidate: dict[str, Any]) -> None:
        self._answering(f"Conker {self.target}")

    def rollback(self, prior: dict[str, Any], candidate: dict[str, Any] | None) -> None:
        """Put the sources and compose.json from before back, then build and start them."""
        if candidate is None:
            return
        recovery = Path(candidate["recovery"])
        failed = self.root / "recovery" / f"failed-update-{self.stamp}"
        if before := candidate.get("sources_id"):
            places = [recovery / "sources", Path(candidate["staging"])]
            if not put_back(before, places, self.sources, failed):
                raise UpdateError("the sources from before the update are missing")
        elif (recovery / "sources").is_dir():  # an update an older release started
            if self.sources.exists():
                os.replace(self.sources, failed)
            os.replace(recovery / "sources", self.sources)
        if (recovery / "compose.json").is_file():
            shutil.copy2(recovery / "compose.json", self.compose_file)
        if not self.sources.is_dir():
            raise UpdateError("the sources from before the update are missing")
        self._start(f"Conker {prior['revision']} again")

    def verify_rollback(self, prior: dict[str, Any], protection: dict | None = None) -> None:
        running = installed_version(self.sources / "companion") or "unreleased"
        if running != prior["revision"]:
            raise UpdateError("the sources from before the update are not the ones running")
        try:
            self._answering(f"Conker {prior['revision']}")
        except UpdateError:
            # A Pi does not start on a database a newer Pi migrated: only then is the snapshot's
            # copy of it put back (scripts/update_pi_db.py); anything else holds.
            if not self._pi_database_back((protection or {}).get("snapshot")):
                raise
            self._answering(f"Conker {prior['revision']} with Pi's database from before the update")

    def _pi_database_back(self, snapshot: str | None) -> bool:
        live = self.root / "state" / "pi" / update_pi_db.DATABASE
        if not snapshot or not SNAPSHOT_NAME.fullmatch(snapshot):
            return False
        with tempfile.TemporaryDirectory(prefix="conker-pi-db-") as scratch:
            try:
                saved = update_pi_db.from_snapshot(self._snapshots() / snapshot, Path(scratch))
                newer = update_pi_db.migrated_since(live, saved)
            except (update_pi_db.DatabaseError, sqlite3.Error) as error:
                raise UpdateError(f"Pi's database could not be compared: {error}") from None
            if not newer:
                return False
            self._run(self._compose("stop", "pi"), "stopping Pi")
            try:
                kept = update_pi_db.put_back(live, saved, f"from-update-{self.stamp}")
            except OSError as error:  # held, Pi stopped: the snapshot is the way back
                raise UpdateError(f"Pi's database could not be put back ({error})") from None
        print(
            f"Pi's database from before the update is back; the one migrated by "
            f"{', '.join(sorted(newer))} is kept as {kept}.",
            file=sys.stderr,
        )
        self._run(self._compose("up", "-d"), "starting Pi with its database from before the update")
        return True


def tell_inbox(root: Path, send=None) -> None:
    """The result reaches the Inbox now if Pi answers, else with the next daily check."""
    source = root / "sources" / "companion"
    found = {"running": installed_version(source), "latest": None}
    try:
        report(root, "ubuntu", found, **({"send": send} if send else {}))
    except Exception as error:  # the update already finished; its receipt stays
        print(
            f"The Inbox will hear about this update with the next check ({error}).",
            file=sys.stderr,
        )


def recover(root: Path, transport_for=None) -> str:
    """`conker update --recover`: finish an update that was cut off (a reboot, a killed helper).

    One cut off after its sources moved is rolled back and proven answering, as a failed one is;
    one cut off before is closed as abandoned. Refused while an update still runs (its update.lock),
    while a backup runs or a recovery is held (a rollback restarts services), and once the update is
    held (the snapshot is the way back). State that cannot be read is held, never guessed at. The
    host helper runs this when it starts and before each daily check.
    """
    store = UpdateStore(root.resolve() / "state" / "update")
    if store.hold_path.exists():  # checked again under the lock, where no update can write one
        raise UpdateError(
            f"Update is held: {store.hold_path}. Restore the snapshot from before it."
        )
    lock = _acquire_lock(store)  # refuses while the update that wrote active.json still runs
    try:
        try:
            state = store.load_active()
        except (OSError, ValueError) as error:
            _hold_unreadable(store, f"its saved state could not be read ({error})")
        if not state:
            return "No update was cut off. Nothing to do."
        target = state.get("target") if isinstance(state, dict) else None
        if not isinstance(target, str) or not VERSION.fullmatch(target):
            _hold_unreadable(store, "its saved state names no release")
        transport = (transport_for or UbuntuTransport)(root, target)
        coordinator = UpdateCoordinator(transport, store)
        moved = state.get("phase") in coordinator.MUTATING_PHASES
        if moved:
            transport.require_quiet()
        coordinator.recover_interrupted()
    finally:
        _release_lock(lock)
    if moved:
        return f"The update to {target} was cut off part way: Conker is back on the version it had."
    return f"The update to {target} was cut off before anything changed. Nothing changed."


def _hold_unreadable(store: UpdateStore, why: str) -> NoReturn:
    """Nobody can tell whether the sources moved, so nothing retries: the owner restores."""
    store.hold({"transaction_id": None}, f"an update was cut off and {why}")
    raise UpdateError(f"An update was cut off and {why}. Held: restore the snapshot from before it.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="conker update --to", description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--to", dest="version")
    action.add_argument("--recover", action="store_true", help="finish an update that was cut off")
    parser.add_argument("--commit", help="the commit the offered release's tag named (--to only)")
    args = parser.parse_args(argv)
    if args.commit and not args.version:
        parser.error("--commit goes with --to")
    os.umask(0o022)  # public sources stay readable to the containers' user (README)
    status = 1
    try:
        if args.recover:
            print(recover(args.root))
            status = 0
        else:
            transport = UbuntuTransport(args.root, args.version, commit=args.commit)
            store = UpdateStore(transport.root / "state" / "update")
            lock = _acquire_lock(store)
            try:
                transport.require_quiet()  # its own rollback of a cut-off update restarts services
                result = UpdateCoordinator(transport, store).run()
            finally:
                _release_lock(lock)
            print(f"Conker update {result['status']}. Receipt: {result['receipt']}")
            status = 0
    except (OSError, UpdateError, json.JSONDecodeError) as error:
        print(f"Conker update stopped: {error}", file=sys.stderr)
    except Exception as error:  # never skip telling the Inbox what was already written
        print(f"Conker update stopped unexpectedly: {error!r}", file=sys.stderr)
    tell_inbox(args.root.resolve())
    return status


if __name__ == "__main__":
    raise SystemExit(main())
