"""Docker access for recovery: the engine wrapper, the helper container and readiness waits."""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import BinaryIO

from recovery_data import RecoveryError


class Docker:
    def run(
        self,
        *args: str,
        output: BinaryIO | None = None,
        input: BinaryIO | None = None,
        check: bool = True,
    ) -> subprocess.CompletedProcess[bytes]:
        try:
            result = subprocess.run(
                ["docker", *args],
                stdin=input,
                stdout=output or subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=3600,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RecoveryError(
                "Docker unavailable or timed out; check Docker access and inspect the recovery hold before retrying."
            ) from exc
        if check and result.returncode:
            # Docker errors can contain substituted configuration and credentials.
            operation = next(
                (
                    arg
                    for arg in args
                    if arg
                    in {
                        "pg_dump",
                        "pg_dumpall",
                        "pg_restore",
                        "psql",
                        "/recovery/recovery_data.py",
                    }
                ),
                args[0],
            )
            reason = ""
            if operation == "/recovery/recovery_data.py":
                operation = "offline data operation"
                safe_prefix = b"Recovery data operation failed: "
                if result.stderr.startswith(safe_prefix):
                    reason = (
                        result.stderr.decode("utf-8", errors="replace").splitlines()[0][
                            :500
                        ]
                        + ". "
                    )
            raise RecoveryError(
                f"Docker {operation} failed (exit {result.returncode}). {reason}"
                "Run docker info to check access; inspect the named source/recovery containers and free disk space before retrying."
            )
        return result

    def json(self, *args: str) -> dict | list:
        return json.loads(self.run(*args).stdout)


def helper(
    docker: Docker,
    image: str,
    operation: str,
    mount: dict,
    *,
    output: BinaryIO | None = None,
    input: BinaryIO | None = None,
    snapshot: Path | None = None,
) -> subprocess.CompletedProcess[bytes]:
    scripts = Path(__file__).resolve().parent
    args = [
        "run",
        "--rm",
        "--pull",
        "never",
        "--network",
        "none",
        "--log-driver",
        "local",
        "--security-opt",
        "no-new-privileges",
        "--mount",
        f"type=bind,src={scripts},dst=/recovery,readonly",
        "--mount",
        f"type={mount['type']},src={mount['source']},dst=/store"
        + (",readonly" if mount.get("readonly") else ""),
    ]
    if input is not None:
        args.append("-i")
    if snapshot:
        args.extend(["--mount", f"type=bind,src={snapshot},dst=/snapshot,readonly"])
    args.extend(
        [
            "--entrypoint",
            "python",
            image,
            "/recovery/recovery_data.py",
            operation,
            "/store",
        ]
    )
    if operation == "verify-vault":
        args.extend(["--runtime", "/snapshot/config/runtime.json"])
    if operation == "snapshot-tree" and mount.get("database"):
        args.extend(["--require-sqlite", mount["database"]])
    return docker.run(*args, output=output, input=input)


def wait_postgres(
    docker: Docker,
    container: str,
    database_user: str = "memorygate",
    database_name: str = "memorygate",
) -> None:
    # The image briefly runs a temporary server during initdb. Readiness alone
    # can succeed just before that server stops underneath pg_restore.
    probe = (
        'test "$(cat /proc/1/comm)" = postgres && pg_isready -U '
        + database_user
        + " -d "
        + database_name
    )
    for _ in range(60):
        if (
            docker.run("exec", container, "sh", "-c", probe, check=False).returncode
            == 0
        ):
            return
        time.sleep(0.5)
    raise RecoveryError(
        f"PostgreSQL did not finish startup. Inspect docker logs {container} before retrying."
    )


def mount_at(container: dict, destination: str) -> dict:
    matches = [
        mount for mount in container["Mounts"] if mount["Destination"] == destination
    ]
    if len(matches) != 1:
        raise RecoveryError(
            f"No unambiguous persistent store at {destination}; review the Compose storage layout."
        )
    mount = matches[0]
    if mount["Type"] not in {"volume", "bind"}:
        raise RecoveryError(
            "Unsupported storage type; add an explicit backup adapter before proceeding."
        )
    return {
        "type": mount["Type"],
        "source": mount.get("Name") if mount["Type"] == "volume" else mount["Source"],
        "readonly": True,
    }
