"""One-time retirement of the explicitly audited FreeLLMAPI deployment."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile

os.umask(0o077)
home = Path.home()
recovery = home / "conker-deploy/recovery/freellmapi-20260923"
recovery.mkdir(mode=0o700, parents=True, exist_ok=True)
name = "freellmapi-freellmapi-1"
volume = "freellmapi_freellmapi-data"
ids = subprocess.check_output(["docker", "ps", "-aq"], text=True).split()
inventory = json.loads(subprocess.check_output(["docker", "inspect", *ids]))
target = next((c for c in inventory if c["Name"] == "/" + name), None)
if target:
    assert target["Config"]["Labels"]["com.docker.compose.project"] == "freellmapi"
    assert [(m["Type"], m.get("Name")) for m in target["Mounts"]] == [("volume", volume)]
    assert not any(m.get("Name") == volume for c in inventory if c != target for m in c["Mounts"])
    (recovery / "container.json").write_text(json.dumps(target, indent=2), encoding="utf-8")
    subprocess.run(["docker", "stop", name], check=True)
    archive = recovery / "data.tar.gz"
    with archive.open("wb") as output:
        subprocess.run(["docker", "run", "--rm", "--network", "none", "--read-only",
                        "--mount", f"type=volume,src={volume},dst=/source,readonly",
                        "alpine:latest", "tar", "-czf", "-", "-C", "/source", "."],
                       stdout=output, check=True)
    with tarfile.open(archive, "r:gz") as check:
        members = sum(1 for _ in check)
    with archive.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    (recovery / "manifest.json").write_text(json.dumps({"members": members, "sha256": digest}), encoding="utf-8")
    subprocess.run(["docker", "rm", name], check=True)
    subprocess.run(["docker", "volume", "rm", volume], check=True)
    if not any(c["Image"] == target["Image"] for c in inventory if c != target):
        subprocess.run(["docker", "image", "rm", target["Config"]["Image"]], check=True)

cron = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
if cron.returncode == 0:
    lines = cron.stdout.splitlines(keepends=True)
    obsolete = "0 4 * * * /home/alexeybe1kin/agentgate/legacy/repos/conker/backup/backup.sh >> /home/alexeybe1kin/agentgate/backups/conker-backups/backup-cron.log 2>&1"
    kept = [line for line in lines if line.strip() != obsolete]
    if kept != lines:
        (recovery / "crontab.before").write_text(cron.stdout, encoding="utf-8")
        subprocess.run(["crontab", "-"], input="".join(kept), text=True, check=True)

# Retain old data and maintenance scripts privately, outside active home paths.
files = recovery / "files"
files.mkdir(mode=0o700, exist_ok=True)
for name in (".hermes", "conker-backups", "patch_jobs_remote.py", "refactor_fixture_remote.py",
             "skills-parity-review-full.txt", "skills-parity-review.diff"):
    source = home / name
    assert source.parent == home and not source.is_symlink()
    if source.exists():
        assert not (files / name).exists()
        source.rename(files / name)
print("FreeLLMAPI retired, obsolete backup cron removed, legacy files archived privately.")
