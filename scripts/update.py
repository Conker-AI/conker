"""Fail-closed, resumable updates for repository-layout Conker installs."""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar


class UpdateError(RuntimeError):
    """An update could not be completed or safely recovered."""


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


@dataclass
class UpdateStore:
    directory: Path

    @property
    def active_path(self) -> Path:
        return self.directory / "active.json"

    @property
    def hold_path(self) -> Path:
        return self.directory / "HOLD.json"

    def load_active(self) -> dict[str, Any] | None:
        if not self.active_path.exists():
            return None
        return json.loads(self.active_path.read_text(encoding="utf-8"))

    def save_active(self, state: dict[str, Any]) -> None:
        _atomic_json(self.active_path, state)

    def clear_active(self) -> None:
        self.active_path.unlink(missing_ok=True)

    def receipt(self, state: dict[str, Any], status: str, reason: str | None = None) -> Path:
        receipt = {
            "schema": 1,
            "transaction_id": state["transaction_id"],
            "status": status,
            "started_at": state["started_at"],
            "finished_at": int(time.time()),
            "prior": {
                "revision": state.get("prior", {}).get("revision"),
                "manifest": state.get("prior", {}).get("manifest"),
                "services": state.get("prior", {}).get("services"),
            },
            "candidate": {
                "revision": state.get("candidate", {}).get("revision"),
                "manifest": state.get("candidate", {}).get("manifest"),
                "resolved_images": state.get("candidate", {}).get("resolved_images"),
            },
        }
        if reason:
            receipt["reason"] = reason
        path = self.directory / "receipts" / f"{state['transaction_id']}.json"
        _atomic_json(path, receipt)
        return path

    def hold(self, state: dict[str, Any], reason: str) -> Path:
        hold = {
            "schema": 1,
            "transaction_id": state["transaction_id"],
            "status": "rollback_unproven",
            "created_at": int(time.time()),
            "prior_revision": state.get("prior", {}).get("revision"),
            "candidate_revision": state.get("candidate", {}).get("revision"),
            "reason": reason,
            "operator_action": "Inspect the update receipt and restore from a verified backup before removing this hold.",
        }
        _atomic_json(self.hold_path, hold)
        return self.hold_path


class UpdateCoordinator:
    """Persist update phases around an injectable host transport."""

    MUTATING_PHASES: ClassVar[set[str]] = {
        "applying_code",
        "code_applied",
        "applying",
        "verifying",
        "rolling_back",
    }

    def __init__(self, transport: Any, store: UpdateStore):
        self.transport = transport
        self.store = store

    def _rollback(self, state: dict[str, Any], reason: str) -> None:
        state["phase"] = "rolling_back"
        self.store.save_active(state)
        try:
            self.transport.rollback(state["prior"], state.get("candidate"))
            self.transport.verify_rollback(state["prior"])
        except Exception as error:  # rollback is the last safety boundary
            failure = f"rollback could not be proven ({type(error).__name__})"
            self.store.receipt(state, "rollback_unproven", failure)
            hold = self.store.hold(state, failure)
            raise UpdateError(f"Update held: {hold}. {failure}") from error
        self.store.receipt(state, "rolled_back", reason)
        self.store.clear_active()

    def recover_interrupted(self) -> None:
        state = self.store.load_active()
        if not state:
            return
        if state.get("phase") in self.MUTATING_PHASES:
            self._rollback(state, "interrupted update recovered before rerun")
            return
        self.store.receipt(state, "abandoned_before_apply", "interrupted preflight")
        self.store.clear_active()

    def run(self) -> dict[str, Any]:
        if self.store.hold_path.exists():
            raise UpdateError(f"Update is held: {self.store.hold_path}")
        self.recover_interrupted()
        self.transport.preflight()

        state: dict[str, Any] = {
            "schema": 1,
            "transaction_id": uuid.uuid4().hex,
            "started_at": int(time.time()),
            "phase": "recorded",
            "prior": self.transport.snapshot(),
        }
        self.store.save_active(state)

        try:
            candidate = self.transport.prepare_candidate(state["prior"])
            state["candidate"] = candidate
            state["phase"] = "candidate_validated"
            self.store.save_active(state)

            if candidate["revision"] == state["prior"]["revision"]:
                receipt = self.store.receipt(state, "no_change")
                self.store.clear_active()
                return {"status": "no_change", "receipt": str(receipt)}

            candidate["resolved_images"] = self.transport.pull_exact_images(candidate)
            state["phase"] = "candidate_ready"
            self.store.save_active(state)

            state["phase"] = "applying_code"
            self.store.save_active(state)
            self.transport.apply_code(candidate)
            state["phase"] = "code_applied"
            self.store.save_active(state)

            state["phase"] = "applying"
            self.store.save_active(state)
            self.transport.apply_services(candidate)

            state["phase"] = "verifying"
            self.store.save_active(state)
            self.transport.verify_candidate(candidate)
        except Exception as error:
            if state.get("phase") in self.MUTATING_PHASES:
                self._rollback(state, f"candidate failed ({type(error).__name__})")
                raise UpdateError("Candidate failed acceptance; prior release was restored.") from error
            receipt = self.store.receipt(
                state, "failed_before_apply", f"preflight failed ({type(error).__name__})"
            )
            self.store.clear_active()
            raise UpdateError(f"Update stopped before apply. Receipt: {receipt}") from error

        receipt = self.store.receipt(state, "applied")
        self.store.clear_active()
        return {"status": "applied", "receipt": str(receipt)}


class HostTransport:
    """Git, Docker and health operations for the repository installation."""

    OWNER_IMAGE_RE = re.compile(
        r"ghcr\.io/(?:alexeybe1kin|conker-ai)/[a-z0-9_.-]+:\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\Z"
    )
    DIGEST_RE = re.compile(r"[^\s]+@sha256:[0-9a-f]{64}\Z")
    HEALTH_ENDPOINTS: ClassVar[dict[str, str]] = {
        "toolgate": "http://127.0.0.1:8010/health",
        "memorygate": "http://127.0.0.1:8020/health",
        "embeddings": "http://127.0.0.1:8030/health",
        "systemgate": "http://127.0.0.1:8040/health",
    }

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.env_file = self.root / ".env"
        self.compose_file = self.root / "docker-compose.yml"
        self.override_file = self._git_private_dir() / "resolved-images.json"

    def _run(
        self, command: list[str], *, cwd: Path | None = None, timeout: int = 300
    ) -> str:
        result = subprocess.run(
            command,
            cwd=cwd or self.root,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        if result.returncode:
            label = " ".join(command[:3])
            raise UpdateError(f"command failed: {label}")
        return result.stdout.strip()

    def _git(self, *arguments: str) -> str:
        return self._run(["git", *arguments])

    def _git_succeeds(self, *arguments: str) -> bool:
        return (
            subprocess.run(
                ["git", *arguments],
                cwd=self.root,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            ).returncode
            == 0
        )

    def _git_private_dir(self) -> Path:
        path = self._run(["git", "rev-parse", "--git-path", "conker-update"])
        candidate = Path(path)
        return candidate if candidate.is_absolute() else (self.root / candidate).resolve()

    def _compose_command(
        self, *arguments: str, root: Path | None = None, override: Path | None = None
    ) -> list[str]:
        source = root or self.root
        command = [
            "docker",
            "compose",
            "--env-file",
            str(source / "versions.env"),
            "--env-file",
            str(self.env_file),
            "-f",
            str(source / "docker-compose.yml"),
        ]
        if override:
            command.extend(["-f", str(override)])
        command.extend(arguments)
        return command

    def _compose_json(self, root: Path | None = None) -> dict[str, Any]:
        output = self._run(self._compose_command("config", "--format", "json", root=root))
        return json.loads(output)

    def _service_state(self, services: list[str]) -> dict[str, dict[str, Any]]:
        state: dict[str, dict[str, Any]] = {}
        for service in services:
            container = self._run(
                self._compose_command("ps", "-q", "--all", service), timeout=30
            ).splitlines()
            if not container:
                state[service] = {"exists": False, "running": False, "image_id": None}
                continue
            details = json.loads(self._run(["docker", "inspect", container[0]]))[0]
            state[service] = {
                "exists": True,
                "running": bool(details["State"]["Running"]),
                "image_id": details["Image"],
            }
        return state

    def preflight(self) -> None:
        blockers = {
            self.root / ".conker-recovery.json": "recovery hold",
            self.root / ".conker-backup.lock": "backup lock",
        }
        for path, label in blockers.items():
            if path.exists():
                raise UpdateError(f"refusing update while {label} exists")
        if not self.env_file.is_file():
            raise UpdateError("repository installation is missing .env")
        if self._git("status", "--porcelain", "--untracked-files=all"):
            raise UpdateError("refusing update because the repository is dirty")

    def snapshot(self) -> dict[str, Any]:
        model = self._compose_json()
        services = sorted(model.get("services", {}))
        branch = self._git("symbolic-ref", "--quiet", "--short", "HEAD")
        manifest = json.loads(
            self._run(
                [sys.executable, str(self.root / "scripts/release_manifest.py"), "--json"]
            )
        )
        return {
            "revision": self._git("rev-parse", "HEAD"),
            "branch": branch,
            "manifest": manifest,
            "services": self._service_state(services),
        }

    def prepare_candidate(self, prior: dict[str, Any]) -> dict[str, Any]:
        requested = os.environ.get("CONKER_UPDATE_REF")
        if requested and (
            requested.startswith("-")
            or any(token in requested for token in ("..", "@{", "\\", ":", "~", "^", "?", "*", "["))
            or not re.fullmatch(r"[0-9A-Za-z._/-]+", requested)
        ):
            raise UpdateError("CONKER_UPDATE_REF is not a safe Git ref")
        upstream = requested or self._git(
            "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"
        )
        if requested:
            self._git("fetch", "--prune", "origin", requested)
            candidate_revision = self._git("rev-parse", "FETCH_HEAD")
        else:
            remote, separator, branch = upstream.partition("/")
            if not separator or not remote or not branch:
                raise UpdateError("the current branch has no safe upstream")
            self._git("fetch", "--prune", remote, branch)
            candidate_revision = self._git("rev-parse", upstream)
        self._run(["git", "merge-base", "--is-ancestor", prior["revision"], candidate_revision])

        staging = Path(tempfile.mkdtemp(prefix="conker-update-"))
        try:
            self._git("worktree", "add", "--detach", str(staging), candidate_revision)
            self._run(
                [
                    sys.executable,
                    str(self.root / "scripts/release_manifest.py"),
                    "--manifest",
                    str(staging / "versions.env"),
                    "--check",
                ],
                cwd=staging,
            )
            manifest = json.loads(
                self._run(
                    [
                        sys.executable,
                        str(self.root / "scripts/release_manifest.py"),
                        "--manifest",
                        str(staging / "versions.env"),
                        "--json",
                    ],
                    cwd=staging,
                )
            )
            model = self._compose_json(staging)
        finally:
            try:
                self._git("worktree", "remove", "--force", str(staging))
            finally:
                shutil.rmtree(staging, ignore_errors=True)

        images = {
            service: definition["image"]
            for service, definition in model.get("services", {}).items()
            if definition.get("image")
        }
        return {
            "revision": candidate_revision,
            "manifest": manifest,
            "service_images": images,
        }

    def _resolved_digest(self, reference: str) -> str:
        digests = json.loads(
            self._run(
                ["docker", "image", "inspect", reference, "--format", "{{json .RepoDigests}}"]
            )
        )
        if not digests:
            raise UpdateError("pulled image has no registry digest")
        wanted_repository = reference.split("@", 1)[0].rsplit(":", 1)[0]
        for digest in digests:
            repository = digest.split("@", 1)[0]
            if repository == wanted_repository or repository.endswith("/" + wanted_repository):
                return digest
        raise UpdateError("pulled image digest does not match its requested repository")

    def pull_exact_images(self, candidate: dict[str, Any]) -> dict[str, str]:
        resolved_by_reference: dict[str, str] = {}
        for reference in sorted(set(candidate["service_images"].values())):
            if not (self.DIGEST_RE.fullmatch(reference) or self.OWNER_IMAGE_RE.fullmatch(reference)):
                raise UpdateError("candidate contains an unpinned or mutable image reference")
            self._run(["docker", "pull", reference], timeout=900)
            resolved_by_reference[reference] = self._resolved_digest(reference)
        return {
            service: resolved_by_reference[reference]
            for service, reference in candidate["service_images"].items()
        }

    def apply_code(self, candidate: dict[str, Any]) -> None:
        if self._git("status", "--porcelain", "--untracked-files=all"):
            raise UpdateError("repository changed after preflight")
        self._git("merge", "--ff-only", candidate["revision"])

    def _write_override(self, images: dict[str, str]) -> Path:
        _atomic_json(
            self.override_file,
            {"services": {service: {"image": image} for service, image in images.items()}},
        )
        return self.override_file

    def apply_services(self, candidate: dict[str, Any]) -> None:
        override = self._write_override(candidate["resolved_images"])
        self._run(
            self._compose_command("up", "-d", "--remove-orphans", override=override), timeout=900
        )

    @staticmethod
    def _health_status(body: str) -> str | None:
        try:
            return json.loads(body).get("status")
        except (json.JSONDecodeError, AttributeError):
            return None

    def verify_candidate(self, candidate: dict[str, Any]) -> None:
        deadline = time.monotonic() + int(os.environ.get("CONKER_UPDATE_HEALTH_TIMEOUT", "120"))
        override = self._write_override(candidate["resolved_images"])
        while True:
            try:
                for service in candidate["service_images"]:
                    container = self._run(
                        self._compose_command(
                            "ps", "-q", "--status", "running", service, override=override
                        ),
                        timeout=30,
                    )
                    if not container:
                        raise UpdateError(f"service did not reach running state: {service}")
                gateway = self._run(
                    self._compose_command(
                        "exec", "-T", "gateway", "python", "-m", "gateway", "health", override=override
                    ),
                    timeout=30,
                )
                bodies = [gateway]
                for endpoint in self.HEALTH_ENDPOINTS.values():
                    bodies.append(self._run(["curl", "-fsS", "-m", "5", endpoint], timeout=10))
                if all(self._health_status(body) in {"ok", "degraded"} for body in bodies):
                    return
            except UpdateError:
                pass
            if time.monotonic() >= deadline:
                raise UpdateError("candidate failed service health acceptance")
            time.sleep(2)

    def _restore_code(self, prior: dict[str, Any], candidate: dict[str, Any] | None) -> None:
        expected = (candidate or {}).get("revision")
        current = self._git("rev-parse", "HEAD")
        if expected and current not in {expected, prior["revision"]}:
            raise UpdateError("HEAD moved outside the recorded update transaction")
        prior_tree = self._git("rev-parse", f"{prior['revision']}^{{tree}}")
        candidate_tree = self._git("rev-parse", f"{expected}^{{tree}}") if expected else None
        index_tree = self._git("write-tree")
        untracked = self._git("ls-files", "--others", "--exclude-standard")
        worktree_matches_index = self._git_succeeds("diff", "--quiet")

        if untracked or not worktree_matches_index:
            raise UpdateError("repository changed during update; refusing destructive rollback")
        if index_tree not in {prior_tree, candidate_tree}:
            raise UpdateError("Git index moved outside the recorded update transaction")

        if index_tree == candidate_tree:
            self._git(
                "restore", "--source", prior["revision"], "--staged", "--worktree", "--", "."
            )
        if current != prior["revision"]:
            branch_ref = f"refs/heads/{prior['branch']}"
            self._git("update-ref", branch_ref, prior["revision"], current)
        if self._git("rev-parse", "HEAD") != prior["revision"]:
            raise UpdateError("Git revision was not restored")
        if self._git("status", "--porcelain", "--untracked-files=all"):
            raise UpdateError("Git files were not restored exactly")

    def rollback(self, prior: dict[str, Any], candidate: dict[str, Any] | None) -> None:
        self._restore_code(prior, candidate)
        images = {
            service: details["image_id"]
            for service, details in prior["services"].items()
            if details["exists"] and details["image_id"]
        }
        for image in images.values():
            self._run(["docker", "image", "inspect", image], timeout=30)
        override = self._write_override(images)
        self._run(self._compose_command("stop", override=override), timeout=300)
        self._run(self._compose_command("rm", "-sf", override=override), timeout=300)
        for service, details in prior["services"].items():
            if not details["exists"]:
                continue
            if details["running"]:
                self._run(
                    self._compose_command("up", "-d", "--no-deps", service, override=override),
                    timeout=300,
                )
            else:
                self._run(
                    self._compose_command("create", "--no-build", service, override=override),
                    timeout=300,
                )

    def verify_rollback(self, prior: dict[str, Any]) -> None:
        if self._git("rev-parse", "HEAD") != prior["revision"]:
            raise UpdateError("prior Git revision is not active")
        actual = self._service_state(sorted(prior["services"]))
        if actual != prior["services"]:
            raise UpdateError("prior image identities or service running state were not restored")


def _acquire_lock(store: UpdateStore) -> Path:
    lock = store.directory / "update.lock"
    store.directory.mkdir(parents=True, exist_ok=True)
    for attempt in range(2):
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            break
        except FileExistsError as error:
            try:
                owner = int(lock.read_text(encoding="ascii").strip())
            except ValueError:
                if attempt == 0:
                    lock.unlink(missing_ok=True)
                    continue
                raise UpdateError(f"invalid update lock: {lock}") from error
            try:
                os.kill(owner, 0)
            except ProcessLookupError:
                if attempt == 0:
                    lock.unlink(missing_ok=True)
                    continue
            except PermissionError:
                pass
            raise UpdateError(f"another update may be active: {lock}") from error
    else:  # pragma: no cover - the loop either opens or raises
        raise UpdateError(f"could not acquire update lock: {lock}")
    with os.fdopen(descriptor, "w", encoding="ascii") as stream:
        stream.write(f"{os.getpid()}\n")
    return lock


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        transport = HostTransport(args.root)
        store = UpdateStore(transport._git_private_dir())
        lock = _acquire_lock(store)
        try:
            result = UpdateCoordinator(transport, store).run()
        finally:
            lock.unlink(missing_ok=True)
    except (OSError, UpdateError, json.JSONDecodeError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f"Conker update stopped: {error}\n")
    print(f"Conker update {result['status']}. Receipt: {result['receipt']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
