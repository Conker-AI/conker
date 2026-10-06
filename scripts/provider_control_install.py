"""Install the bounded provider-control bridge for a Linux systemd user session."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path


def quoted(value: str) -> str:
    if any(char in value for char in "\x00\r\n"):
        raise ValueError("Service arguments must be one line.")
    return (
        '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%") + '"'
    )


def working_directory(source: Path) -> str:
    value = str(source)
    if not source.is_absolute() or any(char in value for char in "\x00\r\n"):
        raise ValueError("Service working directory must be an absolute one-line path.")
    # Unlike ExecStart arguments, quotes here become literal path characters.
    return value.replace("%", "%%")


def install(root: Path, source: Path, layout: str):
    if os.name != "posix" or layout not in {"ubuntu", "repository"}:
        raise ValueError("A Linux systemd user session is required.")
    root, source = root.resolve(), source.resolve()
    state = root / ("state" if layout == "ubuntu" else ".conker")
    if not (source / "scripts/provider_control.py").is_file():
        raise ValueError("Provider-control source is missing.")
    directory = state / "provider-control"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    socket = directory / "control.sock"
    name = (
        "conker-providers-"
        + hashlib.sha256(str(root).encode()).hexdigest()[:12]
        + ".service"
    )
    unit_directory = Path.home() / ".config/systemd/user"
    unit_directory.mkdir(parents=True, exist_ok=True)
    arguments = [
        "/usr/bin/python3",
        "-m",
        "scripts.provider_control",
        "--root",
        str(root),
        "--source",
        str(source),
        "--layout",
        layout,
        "--socket",
        str(socket),
    ]
    unit = (
        "[Unit]\nDescription=Conker private provider control\n\n[Service]\n"
        f"WorkingDirectory={working_directory(source)}\nExecStart={' '.join(map(quoted, arguments))}\n"
        "Restart=on-failure\nRestartSec=2\nUMask=0077\nNoNewPrivileges=true\n"
        "PrivateTmp=true\nStandardOutput=null\nStandardError=null\n\n[Install]\nWantedBy=default.target\n"
    )
    path = unit_directory / name
    if path.is_symlink():
        raise ValueError("Service unit must be a regular file.")
    path.write_text(unit, encoding="utf-8")
    path.chmod(0o600)
    environment = {**os.environ, "XDG_RUNTIME_DIR": f"/run/user/{os.getuid()}"}
    subprocess.run(
        ["systemctl", "--user", "daemon-reload"], env=environment, check=True
    )
    subprocess.run(["systemctl", "--user", "enable", name], env=environment, check=True)
    subprocess.run(
        ["systemctl", "--user", "restart", name], env=environment, check=True
    )
    return {"service": name, "socket": str(socket)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    args = parser.parse_args()
    print(json.dumps(install(args.root, args.source, args.layout)))


if __name__ == "__main__":
    main()
