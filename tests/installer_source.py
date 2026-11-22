"""install.sh and the parts it sources from deploy/install/, read as one text for source checks."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTS = ("machine", "secrets", "start")  # the order install.sh sources them in
FILES = ("install.sh", *(f"deploy/install/{part}.sh" for part in PARTS))


def installer_text() -> str:
    return "".join((ROOT / name).read_text(encoding="utf-8") for name in FILES)
