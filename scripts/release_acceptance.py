"""Executable acceptance gate for the exact images declared by versions.env."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from release_checks import (
    FIXED_CONTAINER_NAMES,
    HEALTH_ENDPOINTS,
    ROOT,
    AcceptanceError,
    CommandRunner,
    Completed,
    Evidence,
    assert_compose_matrix,
    build_image_plan,
)
from release_first_run import FirstRunSteps


class AcceptanceGate(FirstRunSteps):
    def __init__(
        self,
        root: Path,
        evidence: Evidence,
        *,
        require_conversation: bool,
        protection_root: Path | None = None,
        terminal_workspace: Path | None = None,
        runner_factory: Callable[[Path, Evidence, Mapping[str, str]], CommandRunner] = CommandRunner,
    ):
        self.root = root
        self.evidence = evidence
        self.require_conversation = require_conversation
        self.work = root / ".release-acceptance-work"
        self.backups = self.work / "backups"
        self.recovery = self.work / "recovery"
        self.protection_root = protection_root.resolve() if protection_root else None
        self.terminal_workspace = (
            terminal_workspace.resolve() if terminal_workspace else None
        )
        self.snapshot_store = (
            self.protection_root / ("conker-release-acceptance-" + uuid.uuid4().hex[:12])
            if self.protection_root
            else None
        )
        self.cert = self.work / "gateway.crt"
        self.env_file = root / ".env"
        self.mutated = False
        self.recovery_started = False
        self.owns_env = False
        self.owns_work = False
        self.owns_snapshot_store = False
        self.password = "Acceptance-" + secrets.token_urlsafe(24)
        env = {
            "NO_COLOR": "1",
            "CONKER_BACKUP_DIR": str(self.backups),
            "CONKER_LOCAL_MODEL": "qwen2.5:0.5b",
            "CONKER_EMBEDDING_MODEL": "qwen3-embedding:0.6b",
            "CONKER_EMBEDDING_DIMENSION": "1024",
            "GATEWAY_ORIGIN": "https://localhost:8050",
        }
        self.runner = runner_factory(root, evidence, env)
        self.plan: dict[str, Any] = {}
        self.resolved: dict[str, Any] = {}

    def run(self) -> None:
        failure: BaseException | None = None
        try:
            self.preflight()
            self.load_plan()
            self.pull_and_resolve_images()
            self.install()
            self.verify_running_identity()
            self.setup_password_and_authenticate()
            self.verify_health()
            self.configure_first_run()
            self.rehearse_conversation()
            self.complete_rehearsal()
            self.backup_and_restore()
            self.verify_setup_status()
        except (Exception, KeyboardInterrupt) as exc:  # noqa: BLE001 - finalize any gate failure
            failure = exc
            self.evidence.event("gate", "failed", error=f"{type(exc).__name__}: {exc}")
        finally:
            try:
                self.teardown()
            except (Exception, KeyboardInterrupt) as exc:  # noqa: BLE001 - teardown must not mask evidence
                self.evidence.event("teardown", "failed", error=f"{type(exc).__name__}: {exc}")
                if failure is None:
                    failure = exc
            self.evidence.finalize(passed=failure is None, error=str(failure) if failure else None)
        if failure is not None:
            raise failure

    def preflight(self) -> None:
        if not self.require_conversation:
            raise AcceptanceError(
                "release promotion requires --require-conversation and the complete setup rehearsal"
            )
        if self.env_file.exists() or self.work.exists():
            raise AcceptanceError("fresh-run precondition failed: .env or .release-acceptance-work exists")
        self.runner.run(["docker", "info"], timeout=60, phase="docker-info")
        self.runner.run(["docker", "compose", "version"], timeout=60, phase="compose-version")
        for name in FIXED_CONTAINER_NAMES:
            result = subprocess.run(
                ["docker", "container", "inspect", name], capture_output=True, check=False
            )
            if result.returncode == 0:
                raise AcceptanceError(f"fresh-run precondition failed: container {name} already exists")
        project_containers = self.runner.run(
            ["docker", "ps", "--all", "--quiet", "--filter", "label=com.docker.compose.project=conker"],
            phase="preflight-containers",
        ).stdout.split()
        project_volumes = self.runner.run(
            ["docker", "volume", "ls", "--quiet", "--filter", "label=com.docker.compose.project=conker"],
            phase="preflight-volumes",
        ).stdout.split()
        network = subprocess.run(
            ["docker", "network", "inspect", "conker_net"], capture_output=True, check=False
        )
        if project_containers or project_volumes or network.returncode == 0:
            raise AcceptanceError(
                "fresh-run precondition failed: existing Conker Docker resources "
                f"containers={project_containers}, volumes={project_volumes}, conker_net={network.returncode == 0}"
            )
        if (
            self.protection_root is None
            or self.protection_root.is_symlink()
            or not self.protection_root.is_dir()
        ):
            raise AcceptanceError(
                "--protection-root must name an existing, separately mounted directory"
            )
        if os.stat(self.root).st_dev == os.stat(self.protection_root).st_dev:
            raise AcceptanceError(
                "release protection evidence requires storage mounted on a different device"
            )
        assert self.snapshot_store is not None
        self.snapshot_store.mkdir(mode=0o700)
        self.owns_snapshot_store = True
        self.work.mkdir(parents=True)
        self.owns_work = True
        self.evidence.event(
            "preflight",
            "passed",
            clean_runtime=True,
            off_machine_device=True,
        )

    def load_plan(self) -> None:
        self.runner.run(
            [sys.executable, "scripts/release_manifest.py", "--check"],
            phase="strict-manifest-check",
        )
        result = self.runner.run(
            [sys.executable, "scripts/release_manifest.py", "--json"],
            phase="normalize-manifest",
        )
        manifest = json.loads(result.stdout)
        self.plan = build_image_plan(manifest)
        if self.plan["capabilities"]["owner-terminal"]["state"] == "active":
            if self.terminal_workspace is None:
                raise AcceptanceError(
                    "active owner terminal requires --terminal-workspace"
                )
            self.runner.env.update({
                "CONKER_TERMINAL_WORKSPACE": str(self.terminal_workspace),
                "CONKER_TERMINAL_WORKSPACE_LABEL": "Release acceptance workspace",
            })
        self.evidence.artifact("manifest.normalized.json", manifest)
        self.evidence.artifact("image-plan.json", self.plan)

    def pull_and_resolve_images(self) -> None:
        for reference in self.plan["pull_references"]:
            self.runner.run(["docker", "pull", reference], timeout=1800, phase="image-pull")
            inspected = self.runner.run(
                ["docker", "image", "inspect", reference], phase="image-inspect"
            )
            image = json.loads(inspected.stdout)[0]
            repo_digests = sorted(image.get("RepoDigests") or [])
            if "@sha256:" in reference and not any(
                item.endswith("@" + reference.rsplit("@", 1)[1]) for item in repo_digests
            ):
                raise AcceptanceError(
                    f"digest-pinned image did not resolve to its declared identity: {reference}"
                )
            if "@sha256:" not in reference and not repo_digests:
                raise AcceptanceError(f"tagged release image has no registry digest: {reference}")
            self.resolved[reference] = {
                "image_id": image["Id"],
                "repo_digests": repo_digests,
                "os": image.get("Os"),
                "architecture": image.get("Architecture"),
            }
        self.evidence.artifact("image-resolution.json", self.resolved)
        self.evidence.event("image-resolution", "passed", count=len(self.resolved))

    def compose(self, *args: str, **kwargs: Any) -> Completed:
        files = ["-f", str(self.root / "docker-compose.yml")]
        if self.plan.get("capabilities", {}).get("owner-terminal", {}).get("state") == "active":
            files.extend(["-f", str(self.root / "docker-compose.terminal.yml")])
        return self.runner.run(
            [
                "docker", "compose", "--env-file", str(self.root / "versions.env"),
                "--env-file", str(self.env_file), *files,
                *args,
            ],
            **kwargs,
        )

    def install(self) -> None:
        self.mutated = True
        try:
            self.runner.run(
                ["bash", "./install.sh", "--yes"], timeout=3600, phase="fresh-install"
            )
        finally:
            self.owns_env = self.env_file.exists()
        images = self.compose("config", "--images", phase="compose-images").stdout.splitlines()
        assert_compose_matrix(self.plan, images)
        self.evidence.event("compose-matrix", "passed", images=sorted(set(images)))

    def verify_running_identity(self) -> None:
        observed: dict[str, Any] = {}
        for service, reference in self.plan["services"].items():
            container_id = self.compose("ps", "--all", "--quiet", service, phase="container-id").stdout.strip()
            if not container_id:
                raise AcceptanceError(f"Compose created no container for {service}")
            inspected = self.runner.run(
                ["docker", "container", "inspect", container_id], phase="container-inspect"
            )
            container = json.loads(inspected.stdout)[0]
            actual_id = container["Image"]
            expected_id = self.resolved[reference]["image_id"]
            if container["Config"]["Image"] != reference or actual_id != expected_id:
                raise AcceptanceError(
                    f"{service} is not running the pulled declared image {reference}"
                )
            observed[service] = {
                "reference": reference,
                "image_id": actual_id,
                "running": container["State"]["Running"],
            }
            if not container["State"]["Running"]:
                raise AcceptanceError(f"{service} container is not running")
        self.evidence.artifact("running-images.json", observed)
        self.evidence.event("running-image-identity", "passed", services=len(observed))

    def _json_url(self, url: str, *, context: ssl.SSLContext | None = None) -> dict[str, Any]:
        with urllib.request.urlopen(url, timeout=10, context=context) as response:
            value = json.loads(response.read(262145))
        if not isinstance(value, dict):
            raise AcceptanceError(f"{url} did not return a JSON object")
        return value

    def verify_health(self) -> None:
        deadline = time.monotonic() + 240
        pending = dict(HEALTH_ENDPOINTS)
        observed: dict[str, Any] = {}
        while pending and time.monotonic() < deadline:
            for service, url in list(pending.items()):
                try:
                    body = self._json_url(url)
                except (OSError, ValueError, urllib.error.URLError):
                    continue
                observed[service] = body
                del pending[service]
            if pending:
                time.sleep(3)
        gateway = self.runner.run(["bash", "./conker", "auth", "health"], phase="gateway-health")
        observed["gateway"] = json.loads(gateway.stdout)
        self.evidence.artifact("service-health.json", observed)
        if pending:
            raise AcceptanceError(f"health endpoints remained unavailable: {sorted(pending)}")
        unhealthy = {name: body.get("status") for name, body in observed.items() if body.get("status") != "ok"}
        if unhealthy:
            raise AcceptanceError(f"services did not report ok: {unhealthy}")
        self.evidence.event("service-health", "passed", services=sorted(observed))

    def _verified_post(
        self,
        opener: urllib.request.OpenerDirector,
        csrf: str,
        path: str,
        body: dict[str, Any],
        *,
        timeout: int = 30,
    ) -> dict[str, Any]:
        verification = self._request_json(
            opener,
            "POST",
            "/auth/verify",
            {"password": self.password, "operation": {"method": "POST", "path": path, "body": body}},
            csrf=csrf,
        )
        token = verification.get("verification_token")
        if not token:
            raise AcceptanceError(f"password verification issued no token for {path}")
        data = json.dumps(body).encode()
        request = urllib.request.Request(
            "https://localhost:8050" + path,
            data=data,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Origin": "https://localhost:8050",
                "X-CSRF-Token": csrf,
                "X-Conker-Verification": token,
            },
        )
        with opener.open(request, timeout=timeout) as response:
            value = json.loads(response.read(1048576))
        if not isinstance(value, dict):
            raise AcceptanceError(f"response from {path} was not a JSON object")
        return value

    def backup_and_restore(self) -> None:
        assert self.snapshot_store is not None
        self.runner.run(
            ["bash", "./conker", "setup", "run", "protection"],
            timeout=1800,
            phase="policy-bound-protection",
        )
        snapshots = sorted(self.snapshot_store.glob("snapshot-*"))
        if len(snapshots) != 1:
            raise AcceptanceError(f"backup produced {len(snapshots)} snapshots, expected one")
        snapshot = snapshots[0]
        self.runner.run(
            ["bash", "./conker", "verify-backup", str(snapshot)], phase="verify-backup"
        )
        self.recovery_started = True
        self.runner.run(
            ["bash", "./conker", "restore", str(snapshot), "--into", str(self.recovery)],
            expected=(3,),
            timeout=1800,
            phase="isolated-restore",
        )
        status = self.runner.run(
            ["bash", "./conker", "recovery-status", str(self.recovery)],
            expected=(3,),
            phase="recovery-status",
        )
        recovery = json.loads(status.stdout)
        if recovery.get("status") != "held" or not recovery.get("blockers"):
            raise AcceptanceError("restored candidate did not remain held with explicit blockers")
        manifest = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
        if manifest.get("layout") != "repository":
            raise AcceptanceError("release snapshot did not record the repository layout")
        self.evidence.artifact(
            "recovery-evidence.json",
            {
                "snapshot_manifest_sha256": hashlib.sha256(
                    (snapshot / "manifest.json").read_bytes()
                ).hexdigest(),
                "status": recovery.get("status"),
                "recovery_id": recovery.get("recovery_id"),
                "blockers": recovery.get("blockers"),
                "source_layout": recovery.get("source_layout"),
                "database": recovery.get("database"),
            },
        )
        self.evidence.event("backup-restore", "passed", recovery_status="held")

    def teardown(self) -> None:
        errors: list[str] = []
        if self.recovery_started and (self.recovery / ".conker-recovery.json").exists():
            try:
                self.runner.run(
                    [
                        "bash", "./conker", "recovery-status", str(self.recovery),
                        "--abort", "release acceptance teardown",
                    ],
                    expected=(3,),
                    timeout=600,
                    phase="abort-recovery",
                )
            except Exception as exc:  # noqa: BLE001 - continue with independent cleanup
                errors.append(str(exc))
        if self.mutated and self.env_file.exists():
            try:
                self.compose(
                    "down", "--volumes", "--remove-orphans", "--timeout", "30",
                    timeout=300,
                    phase="compose-teardown",
                )
            except Exception as exc:  # noqa: BLE001 - report every independent cleanup failure
                errors.append(str(exc))
        if errors:
            raise AcceptanceError(
                "teardown failures; owned state was retained for repair: " + "; ".join(errors)
            )
        if self.owns_env and self.env_file.exists():
            self.env_file.unlink()
        if self.owns_work and self.work.exists():
            shutil.rmtree(self.work)
        if self.owns_snapshot_store and self.snapshot_store and self.snapshot_store.exists():
            shutil.rmtree(self.snapshot_store)
        self.evidence.event("teardown", "passed", volumes_removed=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--evidence-dir",
        type=Path,
        default=ROOT / "release-acceptance-evidence",
        help="new directory for sanitized machine-readable evidence",
    )
    parser.add_argument(
        "--require-conversation",
        action="store_true",
        help="fail unless a bounded authenticated local-model turn completes",
    )
    configured_protection_root = os.environ.get("CONKER_ACCEPTANCE_PROTECTION_ROOT")
    parser.add_argument(
        "--protection-root",
        type=Path,
        default=Path(configured_protection_root) if configured_protection_root else None,
        help="existing separately mounted directory used for disposable protection evidence",
    )
    configured_terminal_workspace = os.environ.get(
        "CONKER_ACCEPTANCE_TERMINAL_WORKSPACE"
    )
    parser.add_argument(
        "--terminal-workspace",
        type=Path,
        default=(
            Path(configured_terminal_workspace)
            if configured_terminal_workspace
            else None
        ),
        help="existing accepted project directory required by an active owner terminal",
    )
    args = parser.parse_args()
    evidence = Evidence(args.evidence_dir.resolve())
    try:
        AcceptanceGate(
            ROOT,
            evidence,
            require_conversation=args.require_conversation,
            protection_root=args.protection_root,
            terminal_workspace=args.terminal_workspace,
        ).run()
    except (Exception, KeyboardInterrupt) as exc:  # noqa: BLE001 - CLI boundary
        print(f"release acceptance failed: {exc}", file=sys.stderr)
        return 1
    print(f"release acceptance passed; evidence: {evidence.root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
