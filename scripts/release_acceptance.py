"""Executable acceptance gate for the exact images declared by versions.env."""
from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import json
import os
import re
import secrets
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_SCHEMA = "conker-release-acceptance-evidence-2"
OWN_IMAGE_REPOSITORY = "ghcr.io/alexeybe1kin"
OWN_COMPONENTS = ("pi", "toolgate", "memorygate", "systemgate", "embeddings")
SERVICE_IMAGES = {
    "gateway": "pi",
    "pi": "pi",
    "toolgate": "toolgate",
    "memorygate": "memorygate",
    "systemgate": "systemgate",
    "embeddings": "embeddings",
    "postgres": "postgres",
    "qdrant": "qdrant",
    "ollama": "ollama",
    "searxng": "searxng",
}
HEALTH_ENDPOINTS = {
    "toolgate": "http://127.0.0.1:8010/health",
    "memorygate": "http://127.0.0.1:8020/health",
    "systemgate": "http://127.0.0.1:8040/health",
    "embeddings": "http://127.0.0.1:8030/health",
}
FIXED_CONTAINER_NAMES = (
    "conker-gateway",
    "conker-pi",
    "toolgate-api",
    "toolgate-searxng",
    "memorygate-api",
    "memorygate-postgres",
    "memorygate-qdrant",
    "embeddings-api",
    "conker-ollama",
    "systemgate-api",
)
SENSITIVE_KEYS = {"csrf_token", "verification_token", "password", "cookie", "set-cookie"}
SETUP_STEP_IDS = {
    "security",
    "companion",
    "model",
    "memory",
    "capabilities",
    "boundaries",
    "protection",
    "rehearsal",
}


class AcceptanceError(RuntimeError):
    """A required acceptance observation failed."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if key.lower() in SENSITIVE_KEYS else sanitize(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    return value


def build_image_plan(manifest: Mapping[str, Any]) -> dict[str, Any]:
    gates = manifest.get("gates")
    third_party = manifest.get("third_party_images")
    capabilities = manifest.get("capabilities")
    if not isinstance(gates, dict) or not isinstance(third_party, dict) or not isinstance(capabilities, dict):
        raise AcceptanceError("normalized manifest lacks gates, third_party_images or capabilities")
    terminal = capabilities.get("owner-terminal")
    if not isinstance(terminal, dict) or terminal.get("state") not in {"deferred", "active"}:
        raise AcceptanceError("normalized manifest lacks an explicit owner-terminal state")
    missing_gates = sorted(set(OWN_COMPONENTS) - gates.keys())
    missing_third_party = sorted(set(SERVICE_IMAGES.values()) - set(OWN_COMPONENTS) - third_party.keys())
    if missing_gates or missing_third_party:
        raise AcceptanceError(
            f"normalized manifest matrix is incomplete: gates={missing_gates}, third_party={missing_third_party}"
        )
    component_refs = {
        component: f"{OWN_IMAGE_REPOSITORY}/{component}:{gates[component]}"
        for component in OWN_COMPONENTS
    }
    component_refs.update({name: third_party[name] for name in sorted(third_party)})
    service_images = dict(SERVICE_IMAGES)
    if terminal["state"] == "active":
        image = terminal.get("image")
        acceptance = terminal.get("acceptance_sha256")
        if not isinstance(image, str) or not isinstance(acceptance, str):
            raise AcceptanceError("active owner terminal lacks image or acceptance identity")
        component_refs["owner_terminal"] = image
        service_images["owner-terminal"] = "owner_terminal"
    runtime_components = set(service_images.values())
    runtime_references = sorted({component_refs[name] for name in runtime_components})
    build_only_references = sorted(
        {reference for name, reference in component_refs.items() if name not in runtime_components}
    )
    return {
        "manifest_version": manifest.get("manifest_version"),
        "dashboard_revision": manifest.get("conker_dashboard_revision"),
        "capabilities": capabilities,
        "components": component_refs,
        "services": {
            service: component_refs[component] for service, component in service_images.items()
        },
        "runtime_references": runtime_references,
        "build_only_references": build_only_references,
        "pull_references": sorted(set(runtime_references + build_only_references)),
    }


def assert_compose_matrix(plan: Mapping[str, Any], compose_images: Iterable[str]) -> None:
    expected = set(plan["runtime_references"])
    actual = {line.strip() for line in compose_images if line.strip()}
    if actual != expected:
        raise AcceptanceError(
            "resolved Compose image matrix differs from normalized manifest: "
            f"missing={sorted(expected - actual)}, unexpected={sorted(actual - expected)}"
        )


def assert_complete_setup(status: Mapping[str, Any]) -> None:
    steps = status.get("steps")
    if not isinstance(steps, list) or any(not isinstance(step, dict) for step in steps):
        raise AcceptanceError("setup status did not contain a bounded step list")
    identities = [step.get("id") for step in steps]
    if len(identities) != len(set(identities)) or set(identities) != SETUP_STEP_IDS:
        raise AcceptanceError(f"setup step inventory differs from the release contract: {identities}")
    incomplete = {
        str(step["id"]): step.get("state")
        for step in steps
        if step.get("state") != "complete"
    }
    if (
        status.get("schemaVersion") != 1
        or status.get("state") != "complete"
        or status.get("currentStep") is not None
        or status.get("recommendedNextOperation") is not None
        or incomplete
    ):
        raise AcceptanceError(
            "setup did not finish every release step; "
            f"state={status.get('state')}, incomplete={incomplete}"
        )


class Evidence:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=False)
        self.events_path = self.root / "events.jsonl"
        self.steps: list[dict[str, Any]] = []
        self.started_at = utc_now()

    def event(self, phase: str, status: str, **detail: Any) -> None:
        record = {"at": utc_now(), "phase": phase, "status": status, **sanitize(detail)}
        with self.events_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, sort_keys=True) + "\n")
        self.steps.append(record)

    def artifact(self, name: str, value: Any) -> None:
        write_json(self.root / name, sanitize(value))

    def finalize(self, *, passed: bool, error: str | None = None) -> None:
        write_json(
            self.root / "summary.json",
            {
                "schema": EVIDENCE_SCHEMA,
                "started_at": self.started_at,
                "finished_at": utc_now(),
                "passed": passed,
                "error": error,
                "steps": self.steps,
            },
        )


@dataclass
class Completed:
    args: list[str]
    returncode: int
    stdout: str
    stderr: str


class CommandRunner:
    def __init__(self, root: Path, evidence: Evidence, env: Mapping[str, str]):
        self.root = root
        self.evidence = evidence
        self.env = {**os.environ, **env}
        self.sequence = 0

    def run(
        self,
        args: Sequence[str],
        *,
        expected: Iterable[int] = (0,),
        timeout: int = 300,
        input_text: str | None = None,
        phase: str = "command",
    ) -> Completed:
        self.sequence += 1
        command = [str(item) for item in args]
        stem = f"{self.sequence:03d}-{phase}"
        try:
            result = subprocess.run(
                command,
                cwd=self.root,
                env=self.env,
                input=input_text,
                text=True,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout.decode(errors="replace") if isinstance(exc.stdout, bytes) else exc.stdout or ""
            stderr = exc.stderr.decode(errors="replace") if isinstance(exc.stderr, bytes) else exc.stderr or ""
            (self.evidence.root / f"{stem}.stdout.log").write_text(stdout, encoding="utf-8")
            (self.evidence.root / f"{stem}.stderr.log").write_text(stderr, encoding="utf-8")
            self.evidence.event(
                phase,
                "failed",
                command=command,
                reason="timeout",
                timeout_seconds=timeout,
                stdout=f"{stem}.stdout.log",
                stderr=f"{stem}.stderr.log",
            )
            raise AcceptanceError(f"{phase} exceeded {timeout} seconds") from exc
        (self.evidence.root / f"{stem}.stdout.log").write_text(result.stdout, encoding="utf-8")
        (self.evidence.root / f"{stem}.stderr.log").write_text(result.stderr, encoding="utf-8")
        self.evidence.event(
            phase,
            "passed" if result.returncode in set(expected) else "failed",
            command=command,
            returncode=result.returncode,
            stdout=f"{stem}.stdout.log",
            stderr=f"{stem}.stderr.log",
        )
        if result.returncode not in set(expected):
            raise AcceptanceError(
                f"{phase} exited {result.returncode}; see {stem}.stderr.log"
            )
        return Completed(command, result.returncode, result.stdout, result.stderr)


class AcceptanceGate:
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

    def setup_password_and_authenticate(self) -> None:
        self.runner.run(
            ["bash", "./conker", "auth", "setup"],
            input_text=f"{self.password}\n{self.password}\n",
            phase="host-password-setup",
        )
        certificate = self.runner.run(
            ["bash", "./conker", "auth", "certificate"], phase="certificate-export"
        ).stdout
        self.cert.write_text(certificate, encoding="utf-8")
        cert_sha = hashlib.sha256(certificate.encode()).hexdigest()
        context = ssl.create_default_context(cafile=str(self.cert))
        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar), urllib.request.HTTPSHandler(context=context)
        )
        session = self._request_json(opener, "GET", "/auth/session")
        login = self._request_json(
            opener,
            "POST",
            "/auth/login",
            {"password": self.password},
            csrf=session.get("csrf_token"),
        )
        authenticated = self._request_json(opener, "GET", "/auth/session")
        if not authenticated.get("authenticated"):
            raise AcceptanceError("browser session did not become authenticated")
        self.browser = (opener, login.get("csrf_token") or authenticated.get("csrf_token"))
        self.evidence.artifact(
            "browser-auth.json",
            {
                "certificate_sha256": cert_sha,
                "login_authenticated": bool(login.get("authenticated")),
                "session_authenticated": True,
                "cookie_names": sorted(cookie.name for cookie in jar),
            },
        )
        self.evidence.event("browser-auth", "passed", tls_verified=True)

    def _request_json(
        self,
        opener: urllib.request.OpenerDirector,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        csrf: str | None = None,
        timeout: int = 30,
    ) -> dict[str, Any]:
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Accept": "application/json", "Origin": "https://localhost:8050"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if csrf:
            headers["X-CSRF-Token"] = csrf
        request = urllib.request.Request(
            "https://localhost:8050" + path, data=data, headers=headers, method=method
        )
        with opener.open(request, timeout=timeout) as response:
            raw = response.read(1048577)
        if len(raw) > 1048576:
            raise AcceptanceError(f"response from {path} exceeded 1 MiB")
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise AcceptanceError(f"response from {path} was not a JSON object")
        return value

    def configure_first_run(self) -> None:
        self.runner.run(
            ["bash", "./conker", "setup", "run", "companion", "--accept"],
            phase="setup-companion",
        )
        options = self.runner.run(
            ["bash", "./conker", "setup", "models"], phase="setup-model-options"
        )
        model_options = json.loads(options.stdout)
        candidates = model_options.get("candidates")
        route = self.runner.env["CONKER_LOCAL_MODEL"]
        matching = [
            candidate
            for candidate in candidates or []
            if isinstance(candidate, dict)
            and candidate.get("route") == route
            and candidate.get("execution") == "local"
            and candidate.get("status") == "ready"
            and isinstance(candidate.get("id"), str)
        ]
        if len(matching) != 1:
            raise AcceptanceError(
                f"setup exposed {len(matching)} ready local candidates for {route}, expected one"
            )
        candidate = matching[0]
        self.runner.run(
            ["bash", "./conker", "setup", "run", "model", candidate["id"]],
            timeout=300,
            phase="setup-model-probe",
        )
        self.runner.run(
            ["bash", "./conker", "setup", "run", "memory", "--include"],
            phase="setup-memory",
        )
        self.runner.run(
            ["bash", "./conker", "setup", "run", "capabilities", "--include"],
            phase="setup-capabilities",
        )
        boundaries = self.runner.run(
            ["bash", "./conker", "inspect", "boundaries"], phase="setup-boundaries-inspect"
        )
        policy = json.loads(boundaries.stdout)
        digest = policy.get("digest")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise AcceptanceError("ToolGate boundary inspection returned no exact policy digest")
        self.runner.run(
            [
                "bash",
                "./conker",
                "setup",
                "run",
                "boundaries",
                "--confirm-digest",
                digest,
            ],
            phase="setup-boundaries-confirm",
        )
        assert self.snapshot_store is not None
        self.runner.run(
            [
                "bash",
                "./conker",
                "setup",
                "configure",
                "protection",
                "--destination",
                str(self.snapshot_store),
                "--retention",
                "2",
            ],
            phase="setup-protection-policy",
        )
        self.evidence.artifact(
            "setup-configuration.json",
            {
                "model_candidate_id": candidate["id"],
                "model_route": route,
                "model_execution": "local",
                "memory": "include",
                "capabilities": "include",
                "boundary_digest": digest,
                "protection_retention": 2,
            },
        )
        self.evidence.event("setup-configuration", "passed", steps=6)

    def verify_setup_status(self) -> None:
        result = self.runner.run(["bash", "./conker", "setup", "status"], phase="setup-status")
        status = json.loads(result.stdout)
        self.evidence.artifact("setup-status.json", status)
        assert_complete_setup(status)
        self.evidence.event("setup-status", "passed", reported_state=status.get("state"))

    def rehearse_conversation(self) -> None:
        if not self.require_conversation:
            self.evidence.event(
                "conversation", "skipped", reason="live conversation was explicitly disabled"
            )
            return
        opener, csrf = self.browser
        session = self._verified_post(opener, csrf, "/api/pi/sessions", {"title": "Release acceptance"})
        session_id = session.get("session_id")
        if not session_id:
            raise AcceptanceError("conversation rehearsal did not create a session")
        turn = self._verified_post(
            opener,
            csrf,
            f"/api/pi/sessions/{session_id}/turns",
            {
                "text": "Reply with exactly: assembled release accepted",
                "request_id": "release_acceptance_" + uuid.uuid4().hex,
            },
            timeout=240,
        )
        content = ((turn.get("message") or {}).get("content") or "").strip()
        if not turn.get("turn_id") or not content:
            raise AcceptanceError("bounded conversation produced no recorded answer")
        self.evidence.artifact(
            "conversation.json",
            {
                "session_id": session_id,
                "turn_id": turn.get("turn_id"),
                "status": turn.get("status"),
                "reply_sha256": hashlib.sha256(content.encode()).hexdigest(),
                "reply_length": len(content),
            },
        )
        self.evidence.event("conversation", "passed", bounded_timeout_seconds=240)

    def complete_rehearsal(self) -> None:
        if not self.require_conversation:
            raise AcceptanceError(
                "complete release acceptance requires the conversation rehearsal"
            )
        self.runner.run(
            ["bash", "./conker", "setup", "run", "rehearsal", "--review-memory"],
            phase="setup-rehearsal-memory",
        )
        started = self.runner.run(
            ["bash", "./conker", "setup", "run", "rehearsal", "--start-approval"],
            phase="setup-rehearsal-approval-start",
        )
        rehearsal = json.loads(started.stdout)
        request_id = rehearsal.get("approvalRequestId")
        if not isinstance(request_id, str) or not re.fullmatch(
            r"[A-Za-z][A-Za-z0-9_.:-]{0,127}", request_id
        ):
            raise AcceptanceError("rehearsal did not return one bounded approval request ID")
        approval = self.work / "rehearsal-approval.json"
        write_json(
            approval,
            {
                "operation": "decide",
                "id": request_id,
                "status": "approved",
                "note": "Release acceptance: fixed local setup rehearsal.",
            },
        )
        self.runner.run(
            ["bash", "./conker", "apply", "approvals", str(approval)],
            phase="setup-rehearsal-approval-decide",
        )
        self.runner.run(
            [
                "bash",
                "./conker",
                "setup",
                "run",
                "rehearsal",
                "--finish-approval",
                request_id,
            ],
            phase="setup-rehearsal-approval-finish",
        )
        finalized = self.runner.run(
            ["bash", "./conker", "setup", "run", "rehearsal", "--finalize"],
            phase="setup-rehearsal-finalize",
        )
        receipt = json.loads(finalized.stdout)
        if receipt.get("source") != "conker.first-run-rehearsal":
            raise AcceptanceError("Pi did not issue the expected first-run rehearsal receipt")
        self.evidence.artifact(
            "setup-rehearsal.json",
            {
                "approval_request_id": request_id,
                "receipt_id": receipt.get("receiptId"),
                "evidence_digest": receipt.get("evidenceDigest"),
                "source": receipt.get("source"),
                "subject": receipt.get("subject"),
            },
        )
        self.evidence.event("setup-rehearsal", "passed", approval_request_id=request_id)

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
