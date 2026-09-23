"""Retire the inspected AgentGate deployment only; preserve private recovery data.

Requires the stopped-container inventory captured by the operator. Never discovers
new deletion targets from directory names, and never removes unrelated projects.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

root = Path.home() / "conker-deploy"
recovery = root / "recovery/legacy-20260923"
inventory = json.loads((recovery / "containers.json").read_text())
allowed = {"agentgate-stack-agentgate-1", "agentgate-stack-pi-adapter-1",
    "agentgate-stack-toolgate-api-1", "agentgate-stack-memorygate-api-1",
    "agentgate-stack-systemgate-api-1", "agentgate-stack-postgres-1",
    "agentgate-stack-qdrant-1", "toolgate-dashboard", "toolgate-searxng",
    "memorygate-postgres", "memorygate-qdrant", "toolgate-api", "memorygate-api", "systemgate-api"}
assert {item["Name"].lstrip("/") for item in inventory} == allowed
ids = subprocess.check_output(["docker", "ps", "-aq"], text=True).split()
all_containers = json.loads(subprocess.check_output(["docker", "inspect", *ids]))
others = [item for item in all_containers if item["Name"].lstrip("/") not in allowed]
other_volumes = {m["Name"] for item in others for m in item["Mounts"] if m["Type"] == "volume"}
volumes = sorted({m["Name"] for item in inventory for m in item["Mounts"] if m["Type"] == "volume"})
assert not set(volumes) & other_volumes, "Legacy volume is shared; do not remove it"
assert all(not item["State"]["Running"] for item in all_containers if item["Name"].lstrip("/") in allowed)
manifest = {}
for volume in volumes:
    archive = recovery / (volume + ".tar.gz")
    if not archive.exists():
        with archive.open("xb") as output:
            archive.chmod(0o600)
            subprocess.run(["docker", "run", "--rm", "--network", "none", "--read-only",
                "--mount", f"type=volume,src={volume},dst=/source,readonly",
                "alpine:latest", "tar", "-czf", "-", "-C", "/source", "."], stdout=output, check=True)
    with tarfile.open(archive, "r:gz") as check:
        members = sum(1 for _ in check)
    digest = hashlib.file_digest(archive.open("rb"), "sha256").hexdigest()
    manifest[volume] = {"archive": archive.name, "sha256": digest, "members": members}
    print("Archived", volume, flush=True)
(recovery / "volume-manifest.json").write_text(json.dumps(manifest, indent=2))
# Copies of the adapter's writable-layer state must exist before container removal.
assert (recovery / "pi-adapter-data").is_dir()
assert (recovery / "pi-adapter-profile").is_dir()
subprocess.run(["docker", "rm", *sorted(allowed)], check=True)
for volume in volumes:
    subprocess.run(["docker", "volume", "rm", volume], check=True)

files = recovery / "files"
files.mkdir(exist_ok=True, mode=0o700)
for relative in ("agentgate", "agentgate-worktrees", "gates"):
    source = Path.home() / relative
    assert source.parent == Path.home() and not source.is_symlink()
    if source.exists():
        source.rename(files / relative)
units = files / "systemd-user"
units.mkdir(exist_ok=True)
for name in ("agentgate-api.service", "agentgate-dashboard.service",
             "agentgate-api.service.d", "agentgate-dashboard.service.d"):
    source = Path.home() / ".config/systemd/user" / name
    if source.exists():
        source.rename(units / name)
subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
print("Legacy containers and volumes removed; old checkouts and service definitions archived. Conker and unrelated projects preserved.", flush=True)
