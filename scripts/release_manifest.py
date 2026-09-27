"""Validate and normalize Conker's authoritative release manifest."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections.abc import Mapping
from pathlib import Path

SUPPORTED_MANIFEST_VERSION = "2"
GATE_VERSION_KEYS = {
    "pi": "PI_VERSION",
    "toolgate": "TOOLGATE_VERSION",
    "memorygate": "MEMORYGATE_VERSION",
    "systemgate": "SYSTEMGATE_VERSION",
    "embeddings": "EMBEDDINGS_VERSION",
}
THIRD_PARTY_IMAGE_KEYS = {
    "postgres": "POSTGRES_IMAGE",
    "qdrant": "QDRANT_IMAGE",
    "ollama": "OLLAMA_IMAGE",
    "searxng": "SEARXNG_IMAGE",
    "node_build": "NODE_BUILD_IMAGE",
}
REQUIRED_KEYS = {
    "RELEASE_MANIFEST_VERSION",
    "CONKER_DASHBOARD_REVISION",
    "OWNER_TERMINAL_STATE",
    *GATE_VERSION_KEYS.values(),
    *THIRD_PARTY_IMAGE_KEYS.values(),
}
GIT_OBJECT_RE = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?\Z")
VERSION_RE = re.compile(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\Z")
DIGEST_IMAGE_RE = re.compile(r"[^\s@:]+(?:/[^\s@:]+)*@sha256:[0-9a-f]{64}\Z")


class ManifestError(ValueError):
    """The release manifest is incomplete, mutable, or inconsistent."""


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not key or not value:
            raise ManifestError(f"{path}:{number}: expected KEY=value")
        if key in values:
            raise ManifestError(f"{path}:{number}: duplicate key {key}")
        values[key] = value
    return values


def dashboard_tree_revision(root: Path) -> str | None:
    try:
        status = subprocess.run(
            ["git", "status", "--porcelain", "--", "dashboard"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        )
        if status.stdout.strip():
            raise ManifestError("dashboard/ has uncommitted changes; no exact release tree exists")
        result = subprocess.run(
            ["git", "rev-parse", "HEAD:dashboard"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip()


def validate_manifest(
    values: Mapping[str, str], *, actual_dashboard_revision: str | None = None
) -> dict[str, object]:
    missing = sorted(REQUIRED_KEYS - values.keys())
    if missing:
        raise ManifestError("missing required keys: " + ", ".join(missing))

    schema = values["RELEASE_MANIFEST_VERSION"]
    if schema != SUPPORTED_MANIFEST_VERSION:
        raise ManifestError(
            f"unsupported RELEASE_MANIFEST_VERSION {schema!r}; "
            f"expected {SUPPORTED_MANIFEST_VERSION}"
        )

    dashboard_revision = values["CONKER_DASHBOARD_REVISION"]
    if not GIT_OBJECT_RE.fullmatch(dashboard_revision):
        raise ManifestError("CONKER_DASHBOARD_REVISION must be an exact Git object ID")
    if actual_dashboard_revision and dashboard_revision != actual_dashboard_revision:
        raise ManifestError(
            "CONKER_DASHBOARD_REVISION does not match HEAD:dashboard "
            f"({dashboard_revision} != {actual_dashboard_revision})"
        )

    gates: dict[str, str] = {}
    for gate, key in GATE_VERSION_KEYS.items():
        value = values[key]
        if value.lower() == "latest" or not VERSION_RE.fullmatch(value):
            raise ManifestError(f"{key} must be an immutable semantic version, got {value!r}")
        gates[gate] = value

    for key, value in values.items():
        if key.endswith("_IMAGE") and not DIGEST_IMAGE_RE.fullmatch(value):
            raise ManifestError(
                f"{key} must use repository@sha256:<64 lowercase hex>; tags are mutable"
            )

    third_party: dict[str, str] = {}
    for component, key in THIRD_PARTY_IMAGE_KEYS.items():
        value = values[key]
        third_party[component] = value

    terminal_state = values["OWNER_TERMINAL_STATE"]
    if terminal_state not in {"deferred", "active"}:
        raise ManifestError("OWNER_TERMINAL_STATE must be deferred or active")
    terminal_image = values.get("OWNER_TERMINAL_IMAGE")
    terminal_acceptance = values.get("OWNER_TERMINAL_ACCEPTANCE_SHA256")
    if terminal_state == "deferred":
        if terminal_image or terminal_acceptance:
            raise ManifestError(
                "deferred owner terminal must not name an unaccepted image or acceptance digest"
            )
    else:
        if not terminal_image or not DIGEST_IMAGE_RE.fullmatch(terminal_image):
            raise ManifestError(
                "active owner terminal requires OWNER_TERMINAL_IMAGE as repository@sha256:<digest>"
            )
        if not terminal_acceptance or not re.fullmatch(r"[0-9a-f]{64}", terminal_acceptance):
            raise ManifestError(
                "active owner terminal requires OWNER_TERMINAL_ACCEPTANCE_SHA256"
            )

    return {
        "manifest_version": int(schema),
        "conker_dashboard_revision": dashboard_revision,
        "gates": gates,
        "third_party_images": third_party,
        "capabilities": {
            "owner-terminal": {
                "state": terminal_state,
                "image": terminal_image,
                "acceptance_sha256": terminal_acceptance,
            }
        },
    }


def load_release_manifest(path: Path, *, verify_checkout: bool = True) -> dict[str, object]:
    root = path.resolve().parent
    actual = dashboard_tree_revision(root) if verify_checkout else None
    return validate_manifest(parse_env(path), actual_dashboard_revision=actual)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest", type=Path, default=Path(__file__).resolve().parents[1] / "versions.env"
    )
    parser.add_argument("--json", action="store_true", help="print normalized manifest JSON")
    parser.add_argument("--check", action="store_true", help="print a short validation result")
    args = parser.parse_args()

    try:
        # Normalization is useful to local tooling while a release tree is being
        # prepared. Explicit/default checks additionally bind it to a clean checkout.
        manifest = load_release_manifest(args.manifest, verify_checkout=not args.json)
    except (OSError, ManifestError) as error:
        parser.exit(1, f"release manifest invalid: {error}\n")

    if args.json:
        print(json.dumps(manifest, indent=2, sort_keys=True))
    elif args.check or not args.json:
        print(
            "release manifest valid: "
            f"schema {manifest['manifest_version']}, "
            f"dashboard {manifest['conker_dashboard_revision']}, "
            f"{len(manifest['gates'])} gates"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
