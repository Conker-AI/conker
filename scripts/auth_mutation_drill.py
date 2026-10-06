"""Break deployment and restore boundaries in disposable copies of this repository."""

import os
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEPLOYMENT = "tests/test_browser_auth.py::test_compose_cannot_give_worker_owner_credentials_or_auth_storage"
RESTORE = (
    "tests/test_recovery.py::test_snapshot_restores_vault_models_and_holds_actions"
)
CASES = [
    (
        "worker-joins-owner-transport",
        "docker-compose.yml",
        "    container_name: conker-pi",
        "    container_name: conker-pi\n    networks: [conker_net, owner_control]",
        DEPLOYMENT,
    ),
    (
        "gateway-store-omitted",
        "scripts/recovery.py",
        'REPOSITORY_STORES = {\n    "gateway": "/auth",\n',
        "REPOSITORY_STORES = {\n",
        RESTORE,
    ),
    (
        "restored-browser-sessions-revived",
        "scripts/recovery.py",
        'if "gateway" in manifest["stores"]:',
        "if False:",
        RESTORE,
    ),
    (
        "pi-owner-key-mounted-in-worker",
        "docker-compose.yml",
        "      PI_OWNER_KEY_SHA256: ${PI_OWNER_KEY_SHA256:?run ./install.sh}",
        (
            "      PI_OWNER_KEY_SHA256: ${PI_OWNER_KEY_SHA256:?run ./install.sh}\n"
            "      GATEWAY_PI_OWNER_KEY: ${GATEWAY_PI_OWNER_KEY:?run ./install.sh}"
        ),
        DEPLOYMENT,
    ),
    (
        "toolgate-owner-key-mounted-in-worker",
        "docker-compose.yml",
        "      PI_GATEWAY_KEY_SHA256: ${PI_GATEWAY_KEY_SHA256:?run ./install.sh}",
        (
            "      PI_GATEWAY_KEY_SHA256: ${PI_GATEWAY_KEY_SHA256:?run ./install.sh}\n"
            "      GATEWAY_TOOLGATE_OWNER_KEY: ${GATEWAY_TOOLGATE_OWNER_KEY:-}"
        ),
        DEPLOYMENT,
    ),
    (
        "worker-can-read-browser-sessions",
        "docker-compose.yml",
        "      - pi_data:/data",
        "      - pi_data:/data\n      - gateway_data:/auth",
        DEPLOYMENT,
    ),
    (
        "worker-published-without-gateway",
        "docker-compose.yml",
        "    container_name: conker-pi",
        '    container_name: conker-pi\n    ports: ["127.0.0.1:8051:8050"]',
        DEPLOYMENT,
    ),
]


INDEX = "tests/test_browser_auth.py::test_qdrant_network_is_shared_only_with_memorygate"
CASES.extend([
    ("qdrant-back-on-worker-network", "docker-compose.yml",
     "    networks: [memory_index]", "    networks: [conker_net]", INDEX),
    ("memorygate-loses-index-network", "docker-compose.yml",
     "      memory_index: {}", "", INDEX),
])


def main() -> int:
    scratch = ROOT / ".test-gates"
    scratch.mkdir(exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix="auth-mutations-", dir=scratch))
    for name, filename, old, new, selected in [
        ("baseline", None, None, None, None),
        *CASES,
    ]:
        target = run / name
        for directory in ("scripts", "tests"):
            shutil.copytree(
                ROOT / directory,
                target / directory,
                ignore=shutil.ignore_patterns("__pycache__"),
            )
        for file in ("conker", "install.sh", "docker-compose.yml", "versions.env"):
            shutil.copyfile(ROOT / file, target / file)
        if filename:
            file = target / filename
            source = file.read_text(encoding="utf-8")
            if source.count(old) != 1:
                raise RuntimeError(
                    f"{name}: expected exactly one mutation site; update the drill"
                )
            file.write_text(source.replace(old, new), encoding="utf-8")
        report = target / "results.xml"
        tests = [selected] if selected else [DEPLOYMENT, RESTORE, INDEX]
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                *tests,
                "-q",
                "-p",
                "no:cacheprovider",
                "--basetemp",
                str(target / "temp"),
                "--junitxml",
                str(report),
            ],
            cwd=target,
            env={**os.environ, "PYTHONPATH": str(target)},
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        (target / "output.txt").write_text(
            result.stdout + result.stderr, encoding="utf-8"
        )
        suites = (
            list(ET.parse(report).getroot().iter("testsuite"))
            if report.exists()
            else []
        )
        failures = sum(int(s.get("failures", 0)) for s in suites)
        errors = sum(int(s.get("errors", 0)) for s in suites)
        skipped = sum(int(s.get("skipped", 0)) for s in suites)
        if (
            not suites
            or errors
            or skipped
            or (
                result.returncode != 0
                if name == "baseline"
                else result.returncode != 1 or failures < 1
            )
        ):
            print(f"FAILED {name}; inspect {target / 'output.txt'}")
            return 1
        print(f"{name}: {'passed' if name == 'baseline' else 'caught'}", flush=True)
    print(f"All {len(CASES)} mutants caught. Evidence: {run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
