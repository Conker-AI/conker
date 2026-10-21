"""Release acceptance pieces: the image plan, setup and compose checks, evidence and the command runner."""
from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


EVIDENCE_SCHEMA = "conker-release-acceptance-evidence-2"


OWN_IMAGE_REPOSITORY = "ghcr.io/conker-ai"


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
