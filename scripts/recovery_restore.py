"""Restore and review: isolated restore, operator review, readiness proof and abort."""

from __future__ import annotations

import json
import re
import shutil
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

from recovery_data import RecoveryError
from recovery_docker import Docker, helper, wait_postgres
from recovery_layout import (
    BLOCKERS,
    HOLD_FILE,
    READY_FORMAT,
    RECEIPTS_DIR,
    RECOVERY_FORMAT,
    REVIEW_CHECKS,
    REVIEW_FORMAT,
    _bounded_text,
    canonical_sha256,
    parse_timestamp,
    read_json_file,
    sha256,
    utc_now,
    write_json,
)
from recovery_snapshot import (
    load_recovery,
    receipts_directory,
    recovery_fingerprint,
    recovery_lock,
    snapshot_database,
    snapshot_profile,
    verify_snapshot,
)


def restore(snapshot: Path, destination: Path, docker: Docker) -> dict:
    if destination.resolve().is_relative_to(snapshot.resolve()):
        raise RecoveryError(
            "Recovery destination is inside the snapshot; choose a separate new directory."
        )
    manifest = verify_snapshot(snapshot)
    profile = snapshot_profile(manifest)
    database = snapshot_database(manifest, profile)
    # No pulls during recovery, and no Compose from the backup is executed.
    for service in ("pi", "toolgate", "postgres"):
        docker.run("image", "inspect", manifest["images"][service]["id"])
    destination.mkdir(parents=True, mode=0o700, exist_ok=False)
    project = "conker-recovery-" + uuid.uuid4().hex[:12]
    state = {
        "format": RECOVERY_FORMAT,
        "recovery_id": uuid.uuid4().hex,
        "project": project,
        "status": "creating",
        "outbound": "disabled",
        "applications_started": False,
        "snapshot": str(snapshot),
        "snapshot_manifest_sha256": sha256(snapshot / "manifest.json"),
        "source_layout": profile.name,
        "database": database,
        "review_nonce": uuid.uuid4().hex,
        "blockers": BLOCKERS,
        "volumes": {},
        "containers": [],
        "invalidated_requests": [],
        "unfinished_turns": [],
    }
    state_path = destination / HOLD_FILE
    write_json(state_path, state)
    images = manifest["images"]
    try:
        shutil.copytree(snapshot / "config", destination / "recovered-config")
        for store in (*manifest["stores"], "memorygate-runtime", "postgres"):
            volume = project + "-" + store
            state["volumes"][store] = volume
            write_json(state_path, state)
            docker.run(
                "volume", "create", "--label", "conker.recovery=" + project, volume
            )
        for store in manifest["stores"]:
            with (snapshot / (store + ".tar")).open("rb") as source:
                helper(
                    docker,
                    images["pi"]["id"],
                    "restore-tree",
                    {"type": "volume", "source": state["volumes"][store]},
                    input=source,
                )
        if "gateway" in manifest["stores"]:
            state.update(json.loads(helper(
                docker, images["pi"]["id"], "hold-gateway",
                {"type": "volume", "source": state["volumes"]["gateway"]},
            ).stdout))
            write_json(state_path, state)
        # Runtime recovery material gets its own volume; never recreate the
        # original container before extracting this currently unmounted key.
        runtime_tar = destination / "memorygate-runtime.tar"
        from recovery_data import snapshot_tree

        with runtime_tar.open("wb") as output:
            snapshot_tree(snapshot / "memorygate", output)
        with runtime_tar.open("rb") as source:
            helper(
                docker,
                images["pi"]["id"],
                "restore-tree",
                {"type": "volume", "source": state["volumes"]["memorygate-runtime"]},
                input=source,
            )
        toolgate_mount = {"type": "volume", "source": state["volumes"]["toolgate"]}
        state.update(
            json.loads(
                helper(
                    docker, images["toolgate"]["id"], "hold-toolgate", toolgate_mount
                ).stdout
            )
        )
        state["unfinished_turns"] = json.loads(
            helper(
                docker,
                images["pi"]["id"],
                "inspect-pi",
                {"type": "volume", "source": state["volumes"]["pi"], "readonly": True},
            ).stdout
        )
        state.update(
            json.loads(
                helper(
                    docker,
                    images["toolgate"]["id"],
                    "verify-vault",
                    {**toolgate_mount, "readonly": True},
                    snapshot=snapshot,
                ).stdout
            )
        )
        state.update(
            json.loads(
                helper(
                    docker,
                    images["toolgate"]["id"],
                    "verify-memory-key",
                    {
                        "type": "volume",
                        "source": state["volumes"]["memorygate-runtime"],
                        "readonly": True,
                    },
                ).stdout
            )
        )
        postgres = project + "-postgres"
        state["containers"].append(postgres)
        write_json(state_path, state)
        credential = destination / "postgres.env"
        credential.write_text(
            "POSTGRES_USER=" + database["user"]
            + "\nPOSTGRES_DB=" + database["name"]
            + "\nPOSTGRES_PASSWORD="
            + uuid.uuid4().hex
            + "\n"
        )
        credential.chmod(0o600)
        docker.run(
            "run",
            "-d",
            "--pull",
            "never",
            "--name",
            postgres,
            "--network",
            "none",
            "--log-driver",
            "local",
            "--restart",
            "no",
            "--label",
            "conker.recovery=" + project,
            "--env-file",
            str(credential),
            "--mount",
            "type=volume,src="
            + state["volumes"]["postgres"]
            + ",dst=/var/lib/postgresql/data",
            images["postgres"]["id"],
        )
        wait_postgres(docker, postgres, database["user"], database["name"])
        with (snapshot / "memorygate.dump").open("rb") as source:
            docker.run(
                "exec",
                "-i",
                postgres,
                "pg_restore",
                "-U",
                database["user"],
                "-d",
                database["name"],
                "--exit-on-error",
                "--single-transaction",
                "--no-owner",
                "--no-privileges",
                input=source,
            )
        # Even pending local analysis could recreate forgotten material. Park it
        # before any future application startup; preserve its previous state.
        jobs = docker.run(
            "exec",
            postgres,
            "psql",
            "-U",
            database["user"],
            "-d",
            database["name"],
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "SELECT COALESCE(json_agg(json_build_object('id',id,'status',status)), '[]'::json) "
            "FROM processing_jobs WHERE status NOT IN ('completed','failed')",
        ).stdout
        state["held_memory_jobs"] = json.loads(jobs)
        docker.run(
            "exec",
            postgres,
            "psql",
            "-U",
            database["user"],
            "-d",
            database["name"],
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "UPDATE processing_jobs SET status='recovery_held' WHERE status NOT IN ('completed','failed')",
        )
        docker.run("stop", postgres)
        state["status"] = "held"
        state["restored_at"] = utc_now().isoformat()
        state["restore_fingerprint"] = recovery_fingerprint(state)
        write_json(state_path, state)
        return state
    except BaseException:
        state["status"] = "interrupted"
        write_json(state_path, state)
        # Every helper has network=none; a process kill cannot briefly expose
        # an application while a cleanup handler tries to put the fence back.
        raise


def validate_review(review: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    expected_keys = {
        "format",
        "recovery_id",
        "review_nonce",
        "snapshot_manifest_sha256",
        "operator",
        "reviewed_at",
        "expires_at",
        "attestations",
    }
    if set(review) != expected_keys:
        raise RecoveryError("Review fields do not match the exact recovery review schema.")
    bindings = {
        "format": REVIEW_FORMAT,
        "recovery_id": state["recovery_id"],
        "review_nonce": state["review_nonce"],
        "snapshot_manifest_sha256": state["snapshot_manifest_sha256"],
    }
    if any(review.get(key) != value for key, value in bindings.items()):
        raise RecoveryError("Review evidence is stale or belongs to a different restore.")
    _bounded_text(review["operator"], "operator", 200)
    reviewed_at = parse_timestamp(review["reviewed_at"], "reviewed_at")
    expires_at = parse_timestamp(review["expires_at"], "expires_at")
    restored_at = parse_timestamp(state["restored_at"], "restore restored_at")
    now = utc_now()
    if reviewed_at < restored_at or reviewed_at > now + timedelta(minutes=5):
        raise RecoveryError("Review timestamp predates this restore or is in the future.")
    if expires_at <= now or expires_at > reviewed_at + timedelta(days=30):
        raise RecoveryError("Review evidence is expired or has an excessive validity window.")
    attestations = review.get("attestations")
    if not isinstance(attestations, dict) or set(attestations) != set(REVIEW_CHECKS):
        raise RecoveryError("Review must contain every required attestation and no unknown checks.")
    for name, required_status in REVIEW_CHECKS.items():
        item = attestations[name]
        if not isinstance(item, dict) or set(item) != {"status", "evidence_sha256"}:
            raise RecoveryError(f"Review attestation {name} has an invalid schema.")
        if item["status"] != required_status:
            raise RecoveryError(f"Review attestation {name} is not {required_status}.")
        if not re.fullmatch(r"[0-9a-f]{64}", item["evidence_sha256"]):
            raise RecoveryError(f"Review attestation {name} requires a lowercase SHA-256 digest.")
    return review


def review_recovery(directory: Path, review_path: Path) -> dict[str, Any]:
    directory = directory.resolve()
    with recovery_lock(directory):
        state_path, state = load_recovery(directory)
        if state["status"] == "service_ready":
            raise RecoveryError("Recovery is already service-ready; its review cannot be replaced.")
        if state["status"] == "aborted":
            raise RecoveryError("Recovery was aborted and cannot be reviewed.")
        if state["status"] not in {"held", "reviewed", "readiness_interrupted"}:
            raise RecoveryError(f"Recovery cannot be reviewed from status {state['status']!r}.")
        review = validate_review(read_json_file(review_path, "Operator review"), state)
        receipt_path = receipts_directory(directory) / "operator-review.json"
        digest = canonical_sha256(review)
        if state.get("review_receipt_sha256"):
            if state["review_receipt_sha256"] != digest:
                raise RecoveryError("A different operator review is already bound to this restore.")
            stored = read_json_file(receipt_path, "Stored operator review")
            if canonical_sha256(stored) != digest:
                raise RecoveryError("Stored operator review was changed; keep the recovery held.")
            return state
        write_json(receipt_path, review)
        state["review_receipt"] = receipt_path.relative_to(directory).as_posix()
        state["review_receipt_sha256"] = digest
        state["status"] = "reviewed"
        state["resolved_restore_blockers"] = list(BLOCKERS)
        state["blockers"] = ["Service readiness proof is pending."]
        write_json(state_path, state)
        return state


def _inspect_isolated_resources(state: dict[str, Any], docker: Docker) -> dict[str, Any]:
    project = state["project"]
    volumes: dict[str, str] = {}
    for store, name in sorted(state["volumes"].items()):
        details = docker.json("volume", "inspect", name)
        if len(details) != 1 or details[0].get("Labels", {}).get("conker.recovery") != project:
            raise RecoveryError(f"Recovery volume for {store} is missing or has an invalid ownership label.")
        volumes[store] = name
    containers: dict[str, str] = {}
    for name in state["containers"]:
        details = docker.json("inspect", name)
        if len(details) != 1:
            raise RecoveryError("Recovery container inventory is ambiguous.")
        container = details[0]
        host = container.get("HostConfig", {})
        labels = container.get("Config", {}).get("Labels") or {}
        if labels.get("conker.recovery") != project:
            raise RecoveryError("Recovery container has an invalid ownership label.")
        if host.get("NetworkMode") != "none" or host.get("PortBindings"):
            raise RecoveryError("Recovery container is no longer isolated; keep the hold.")
        if container.get("State", {}).get("Running"):
            raise RecoveryError("Recovery container must be stopped before readiness proof.")
        containers[name] = container.get("Image", "")
    return {"volumes": volumes, "containers": containers}


def _verify_review_receipt(directory: Path, state: dict[str, Any]) -> dict[str, Any]:
    relative = state.get("review_receipt")
    if relative != f"{RECEIPTS_DIR}/operator-review.json":
        raise RecoveryError("Operator review receipt path is missing or invalid.")
    review = read_json_file(
        receipts_directory(directory) / "operator-review.json", "Stored operator review"
    )
    validate_review(review, state)
    if canonical_sha256(review) != state.get("review_receipt_sha256"):
        raise RecoveryError("Stored operator review was changed; keep the recovery held.")
    return review


def prove_service_ready(directory: Path, docker: Docker) -> dict[str, Any]:
    directory = directory.resolve()
    with recovery_lock(directory):
        state_path, state = load_recovery(directory)
        if state["status"] == "aborted":
            raise RecoveryError("Aborted recovery cannot become service-ready.")
        if state["status"] == "service_ready":
            receipt = read_json_file(
                receipts_directory(directory) / "service-ready.json", "Service-ready receipt"
            )
            if canonical_sha256(receipt) != state.get("service_ready_receipt_sha256"):
                raise RecoveryError("Service-ready receipt was changed; keep the hold and investigate.")
            return state
        if state["status"] not in {"reviewed", "readiness_interrupted"}:
            raise RecoveryError("Recovery requires a valid operator review before readiness proof.")
        state["status"] = "checking_readiness"
        state.pop("last_failure", None)
        write_json(state_path, state)
        postgres = state["containers"][0] if len(state["containers"]) == 1 else None
        try:
            _verify_review_receipt(directory, state)
            snapshot = Path(state["snapshot"])
            manifest = verify_snapshot(snapshot)
            profile = snapshot_profile(manifest)
            database = snapshot_database(manifest, profile)
            if state.get("source_layout", profile.name) != profile.name or state.get(
                "database", database
            ) != database:
                raise RecoveryError("Recovery hold database identity changed after restore.")
            if sha256(snapshot / "manifest.json") != state["snapshot_manifest_sha256"]:
                raise RecoveryError("Snapshot manifest no longer matches this restore.")
            for image in manifest["images"].values():
                docker.run("image", "inspect", image["id"])
            resources = _inspect_isolated_resources(state, docker)
            if (
                postgres is None
                or resources["containers"].get(postgres)
                != manifest["images"]["postgres"]["id"]
            ):
                raise RecoveryError("Recovery PostgreSQL container image identity changed.")
            toolgate_mount = {
                "type": "volume",
                "source": state["volumes"]["toolgate"],
                "readonly": True,
            }
            vault = json.loads(
                helper(
                    docker,
                    manifest["images"]["toolgate"]["id"],
                    "verify-vault",
                    toolgate_mount,
                    snapshot=snapshot,
                ).stdout
            )
            memory = json.loads(
                helper(
                    docker,
                    manifest["images"]["toolgate"]["id"],
                    "verify-memory-key",
                    {
                        "type": "volume",
                        "source": state["volumes"]["memorygate-runtime"],
                        "readonly": True,
                    },
                ).stdout
            )
            turns = json.loads(
                helper(
                    docker,
                    manifest["images"]["pi"]["id"],
                    "inspect-pi",
                    {"type": "volume", "source": state["volumes"]["pi"], "readonly": True},
                ).stdout
            )
            if vault.get("vault_values_verified") != state.get("vault_values_verified"):
                raise RecoveryError("Recovered vault proof changed after restore.")
            if memory.get("memory_provider_key_verified") is not True:
                raise RecoveryError("Recovered MemoryGate key cannot decrypt its provider token.")
            if turns != state.get("unfinished_turns"):
                raise RecoveryError("Recovered Pi unfinished-work evidence changed after restore.")
            docker.run("start", postgres)
            try:
                wait_postgres(
                    docker, postgres, database["user"], database["name"]
                )
                unheld = docker.run(
                    "exec",
                    postgres,
                    "psql",
                    "-U",
                    database["user"],
                    "-d",
                    database["name"],
                    "-At",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-c",
                    "SELECT count(*) FROM processing_jobs WHERE status NOT IN ('completed','failed','recovery_held')",
                ).stdout.strip()
                if unheld != b"0":
                    raise RecoveryError("Recovered MemoryGate jobs are not all held.")
            finally:
                docker.run("stop", postgres)
            receipt = {
                "format": READY_FORMAT,
                "recovery_id": state["recovery_id"],
                "restore_fingerprint": state["restore_fingerprint"],
                "snapshot_manifest_sha256": state["snapshot_manifest_sha256"],
                "review_receipt_sha256": state["review_receipt_sha256"],
                "proved_at": utc_now().isoformat(),
                "resources": resources,
                "applications_started": False,
                "live_install_modified": False,
                "promotion": "requires a separate explicit operator-authorized deployment",
            }
            receipt_path = receipts_directory(directory) / "service-ready.json"
            write_json(receipt_path, receipt)
            state["service_ready_receipt"] = receipt_path.relative_to(directory).as_posix()
            state["service_ready_receipt_sha256"] = canonical_sha256(receipt)
            state["status"] = "service_ready"
            state["blockers"] = []
            write_json(state_path, state)
            return state
        except BaseException as exc:
            state["status"] = "readiness_interrupted" if not isinstance(exc, Exception) else "reviewed"
            state["last_failure"] = (
                str(exc)[:500] if isinstance(exc, RecoveryError) else type(exc).__name__
            )
            state["blockers"] = ["Service readiness proof is pending."]
            write_json(state_path, state)
            raise


def abort_recovery(directory: Path, reason: str, docker: Docker) -> dict[str, Any]:
    directory = directory.resolve()
    reason = _bounded_text(reason, "abort reason", 500)
    with recovery_lock(directory):
        state_path, state = load_recovery(directory)
        if state["status"] == "aborted":
            return state
        if state["status"] in {"creating", "checking_readiness"}:
            raise RecoveryError("Recovery is mid-operation; inspect it before requesting abort.")
        resuming = state["status"] in {"aborting", "abort_interrupted"}
        state["status"] = "aborting"
        state["abort_reason"] = reason
        state.setdefault("removed_containers", [])
        state.setdefault("removed_volumes", [])
        write_json(state_path, state)
        try:
            project = state["project"]
            for name in state["containers"]:
                if name in state["removed_containers"]:
                    continue
                result = docker.run("inspect", name, check=False)
                if result.returncode:
                    if not resuming:
                        raise RecoveryError("Recovery container disappeared before abort began.")
                    state["removed_containers"].append(name)
                    write_json(state_path, state)
                    continue
                details = json.loads(result.stdout)
                labels = details[0].get("Config", {}).get("Labels") or {}
                if labels.get("conker.recovery") != project:
                    raise RecoveryError("Refusing to remove a container without the exact recovery label.")
                docker.run("rm", "-f", name)
                state["removed_containers"].append(name)
                write_json(state_path, state)
            for name in state["volumes"].values():
                if name in state["removed_volumes"]:
                    continue
                result = docker.run("volume", "inspect", name, check=False)
                if result.returncode:
                    if not resuming:
                        raise RecoveryError("Recovery volume disappeared before abort began.")
                    state["removed_volumes"].append(name)
                    write_json(state_path, state)
                    continue
                details = json.loads(result.stdout)
                if details[0].get("Labels", {}).get("conker.recovery") != project:
                    raise RecoveryError("Refusing to remove a volume without the exact recovery label.")
                docker.run("volume", "rm", name)
                state["removed_volumes"].append(name)
                write_json(state_path, state)
            state["status"] = "aborted"
            state["aborted_at"] = utc_now().isoformat()
            state["resources_removed"] = True
            state["blockers"] = ["Recovery was aborted; no promotion is permitted."]
            write_json(state_path, state)
            return state
        except BaseException as exc:
            state["status"] = "abort_interrupted"
            state["last_failure"] = (
                str(exc)[:500] if isinstance(exc, RecoveryError) else type(exc).__name__
            )
            write_json(state_path, state)
            raise
