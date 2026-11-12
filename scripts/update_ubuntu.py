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
4. apply code: the old sources and compose.json move to recovery/pre-update-STAMP, the staged
   sources take their place;
5. apply services: prepare.py with the installed origin and agent workspaces, build, start, and the
   refreshed launcher;
6. verify: `conker status --strict` until every service answers.

A failure after step 4 puts the old sources and compose.json back, builds and starts them and
proves them answering (rolled back). When that cannot be proven the coordinator leaves a HOLD and
the snapshot is the way back. The result goes to the Inbox (scripts/update_check.py report).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.request import Request, build_opener

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts.update_check import VERSION, installed_version, report, version_key
    from scripts.update_core import (
        UpdateCoordinator,
        UpdateError,
        UpdateStore,
        _acquire_lock,
    )
except ModuleNotFoundError:
    from update_check import VERSION, installed_version, report, version_key
    from update_core import UpdateCoordinator, UpdateError, UpdateStore, _acquire_lock

ARCHIVE = "https://codeload.github.com/Conker-AI/{repository}/tar.gz/refs/tags/v{version}"
# Source folder -> (its repository, the versions.env line that pins its tag).
MODULES = {
    "pi": ("pi", "PI_VERSION"),
    "toolgate": ("toolgate", "TOOLGATE_VERSION"),
    "memorygate": ("memorygate", "MEMORYGATE_VERSION"),
    "systemgate": ("systemgate", "SYSTEMGATE_VERSION"),
    "embeddings": ("embeddings", "EMBEDDINGS_VERSION"),
}
MAX_ARCHIVE = 300 * 1024 * 1024
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
        with build_opener().open(request, timeout=120) as response:
            size = 0
            while chunk := response.read(1 << 20):
                size += len(chunk)
                if size > MAX_ARCHIVE:
                    raise UpdateError("a release archive was larger than expected")
                buffer.write(chunk)
        buffer.seek(0)
        with tarfile.open(fileobj=buffer, mode="r:gz") as bundle:
            members = []
            for member in bundle.getmembers():
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

    def __init__(self, root: Path, version: str, *, run=None, fetch=download, home=None):
        if not VERSION.fullmatch(version):
            raise UpdateError("name a release as X.Y.Z")
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
        held = {
            ".conker-recovery.json": "a recovery is held",
            ".conker-backup.lock": "a backup is running",
        }
        for name, label in held.items():
            if (self.root / name).exists():
                raise UpdateError(f"{label}, so nothing was changed")
        if not self.compose_file.is_file() or not (self.sources / "companion").is_dir():
            raise UpdateError("this is not an installed Ubuntu-layout Conker")
        if not self.origin():
            raise UpdateError("the installed gateway origin is missing")
        if shutil.disk_usage(self.root).free < MIN_FREE:
            raise UpdateError("the disk needs 20 GB free for the snapshot and the build")

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
            self.fetch(
                ARCHIVE.format(repository="conker", version=self.target), staging / "companion"
            )
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
            "modules": modules,
            "staging": str(staging),
            "recovery": str(self.recovery),
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

    def protect(self, candidate: dict[str, Any]) -> dict[str, str]:
        """A verified snapshot of everything Conker holds, before anything running changes."""
        default = self.home / "conker-snapshots"
        destination = Path(os.environ.get("CONKER_UPDATE_SNAPSHOTS", default))
        destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        before = {path.name for path in destination.iterdir()}
        self._run(
            self._conker("backup", "--destination", str(destination)),
            "the snapshot before the update",
            timeout=4 * 3600,
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
        os.replace(self.sources, recovery / "sources")
        os.replace(staging, self.sources)

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
        if (recovery / "sources").is_dir():
            if self.sources.exists():
                os.replace(self.sources, self.root / "recovery" / f"failed-update-{self.stamp}")
            os.replace(recovery / "sources", self.sources)
        if (recovery / "compose.json").is_file():
            shutil.copy2(recovery / "compose.json", self.compose_file)
        if not self.sources.is_dir():
            raise UpdateError("the sources from before the update are missing")
        self._start(f"Conker {prior['revision']} again")

    def verify_rollback(self, prior: dict[str, Any]) -> None:
        running = installed_version(self.sources / "companion") or "unreleased"
        if running != prior["revision"]:
            raise UpdateError("the sources from before the update are not the ones running")
        self._answering(f"Conker {prior['revision']}")


def tell_inbox(root: Path, send=None) -> None:
    """The result reaches the Inbox now if Pi answers, else with the next daily check."""
    source = root / "sources" / "companion"
    found = {"running": installed_version(source), "latest": None}
    try:
        report(root, "ubuntu", found, **({"send": send} if send else {}))
    except Exception as error:  # noqa: BLE001 - the update already finished; its receipt stays
        print(
            f"The Inbox will hear about this update with the next check ({error}).",
            file=sys.stderr,
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="conker update --to", description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--to", dest="version", required=True)
    args = parser.parse_args(argv)
    os.umask(0o022)  # public sources stay readable to the containers' user (README)
    status = 1
    try:
        transport = UbuntuTransport(args.root, args.version)
        store = UpdateStore(transport.root / "state" / "update")
        lock = _acquire_lock(store)
        try:
            result = UpdateCoordinator(transport, store).run()
        finally:
            lock.unlink(missing_ok=True)
        print(f"Conker update {result['status']}. Receipt: {result['receipt']}")
        status = 0
    except (OSError, UpdateError, json.JSONDecodeError) as error:
        print(f"Conker update stopped: {error}", file=sys.stderr)
    tell_inbox(args.root.resolve())
    return status


if __name__ == "__main__":
    raise SystemExit(main())
