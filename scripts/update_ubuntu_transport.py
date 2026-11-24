"""Source exports, Compose and health for the Ubuntu layout (deploy/ubuntu).

Split from update_ubuntu.py (a move); update_ubuntu re-exports UbuntuTransport."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts import update_cutoff, update_pi_db
    from scripts.update_check import (
        COMMIT,
        MODULES,
        VERSION,
        installed_version,
        version_key,
    )
    from scripts.update_core import LOCK_TOKEN, UpdateError, _token
    from scripts.update_download import download
    from scripts.update_snapshots import SNAPSHOT_NAME, after_update_snapshot
    from scripts.update_swap import identity, put_back, swap_in
    from scripts.update_ubuntu_release import (
        ARCHIVE,
        BUILD_SCRIPT,
        BUILD_SECONDS,
        COMMIT_ARCHIVE,
        MIN_FREE,
        QUIET,
        START_SECONDS,
        _owner,
        module_commits,
        versions,
    )
except ModuleNotFoundError:
    import update_cutoff
    import update_pi_db
    from update_check import (
        COMMIT,
        MODULES,
        VERSION,
        installed_version,
        version_key,
    )
    from update_core import LOCK_TOKEN, UpdateError, _token
    from update_download import download
    from update_snapshots import SNAPSHOT_NAME, after_update_snapshot
    from update_swap import identity, put_back, swap_in
    from update_ubuntu_release import (
        ARCHIVE,
        BUILD_SCRIPT,
        BUILD_SECONDS,
        COMMIT_ARCHIVE,
        MIN_FREE,
        QUIET,
        START_SECONDS,
        _owner,
        module_commits,
        versions,
    )


class UbuntuTransport:
    """Source exports, Compose and health for the Ubuntu layout (deploy/ubuntu)."""

    def __init__(
        self,
        root: Path,
        version: str,
        *,
        commit=None,
        modules=None,
        run=None,
        fetch=download,
        home=None,
    ):
        if not VERSION.fullmatch(version):
            raise UpdateError("name a release as X.Y.Z")
        if commit is not None and not COMMIT.fullmatch(commit):
            raise UpdateError("name the release's commit as 40 hex digits")
        if (commit is None) != (modules is None):
            raise UpdateError("name the release's commit together with each module's")
        self.commit = commit  # the commit the offer's tag named; None: the tag as it is now
        # folder -> (version, commit) the offer's module tags named; None: the tags as they are now
        self.modules = None if modules is None else module_commits(modules)
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
                url = COMMIT_ARCHIVE.format(repository="conker", commit=self.commit)
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
                if self.modules is None:
                    url = ARCHIVE.format(repository=repository, version=version)
                else:
                    offered, commit = self.modules[folder]
                    if offered != version:
                        raise UpdateError(
                            f"the offer named {folder} {offered}, the release pins {version}"
                        )
                    url = COMMIT_ARCHIVE.format(repository=repository, commit=commit)
                self.fetch(url, staging / folder)
                modules[folder] = version
            self._build_dashboard(staging / "companion", pinned.get("NODE_BUILD_IMAGE", ""))
        except BaseException:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return {
            "revision": self.target,
            "commit": self.commit,
            "modules": modules,
            "module_commits": self.modules,
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

    def _snapshots(self, protection: dict | None = None) -> Path:
        """Where the update's snapshot went: the folder it recorded, else (an older update's
        state) where snapshots go now."""
        folder = (protection or {}).get("folder")
        if isinstance(folder, str) and Path(folder).is_absolute():
            return Path(folder)
        default = self.home / "conker-snapshots"
        return Path(os.environ.get("CONKER_UPDATE_SNAPSHOTS", default)).absolute()

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
        receipts = self.root / "state" / "update" / "receipts"
        after_update_snapshot(destination, made[0], receipts, self._verify)  # older update ones
        return {"snapshot": made[0], "folder": str(destination)}

    def _verify(self, snapshot: Path) -> None:
        """Raises for a snapshot that does not verify; the prune keeps the newest that does."""
        self._run(self._conker("verify-backup", str(snapshot)), "a snapshot check", timeout=3600)

    def apply_code(self, candidate: dict[str, Any]) -> None:
        recovery, staging = Path(candidate["recovery"]), Path(candidate["staging"])
        recovery.mkdir(parents=True, mode=0o700)
        shutil.copy2(self.compose_file, recovery / "compose.json")
        swap_in(staging, self.sources, recovery / "sources")  # sources/ exists at every instant

    def _network_joiners(self) -> list[str]:
        services = json.loads(self.compose_file.read_text(encoding="utf-8")).get("services", {})
        return sorted(
            n for n, spec in services.items() if spec.get("network_mode", "").startswith("service:")
        )

    def _start(self, what: str) -> None:
        extra = {"CONKER_WORKSPACES_DIR": folder} if (folder := self.workspaces()) else {}
        prepare = self.sources / "companion" / "deploy" / "ubuntu" / "prepare.py"
        self._run(
            [sys.executable, str(prepare), self.origin() or ""], f"preparing {what}", env=extra
        )
        self._run(self._compose("build"), f"building {what}", timeout=BUILD_SECONDS)
        # Services in Pi's network cannot be stopped once Pi is recreated: remove them first.
        if joined := self._network_joiners():
            self._run(self._compose("rm", "-sf", *joined), f"stopping {', '.join(joined)}")
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

    def restart_writers(self) -> None:
        """Start what a cut-off snapshot stopped (update_cutoff); running services stay as they are."""
        up = self._compose("up", "-d", "--remove-orphans")
        self._run(up, "starting Conker again", timeout=START_SECONDS)

    def discard_candidate(self, candidate: dict[str, Any]) -> None:
        update_cutoff.discard_staging(self.root, candidate.get("staging"))

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
            if not self._pi_database_back(protection or {}):
                raise
            self._answering(f"Conker {prior['revision']} with Pi's database from before the update")

    def _pi_database_back(self, protection: dict) -> bool:
        live, snapshot = (
            self.root / "state" / "pi" / update_pi_db.DATABASE,
            protection.get("snapshot"),
        )
        if not isinstance(snapshot, str) or not SNAPSHOT_NAME.fullmatch(snapshot):
            return False
        with tempfile.TemporaryDirectory(prefix="conker-pi-db-") as scratch:
            try:
                at = self._snapshots(protection) / snapshot
                saved = update_pi_db.from_snapshot(at, Path(scratch))
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
