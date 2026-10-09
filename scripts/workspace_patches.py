"""Apply reviewed, ordered extensions to the pinned workspace sources."""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from workspace import ROOT

BUNDLES = {
    "pi": (
        "pi-model-roles.patch",
        "pi-skills.patch",
        "pi-daily-companion.patch",
        "pi-companion-reliability.patch",
    ),
    "toolgate": ("toolgate-mcp.patch",),
    "memorygate": (
        "memorygate-lexical-recall.patch",
        "memorygate-owner-retention.patch",
    ),
}


def _git(directory, *args, check=True):
    return subprocess.run(
        [
            "git",
            "-c",
            "core.autocrlf=false",
            "-c",
            "core.safecrlf=false",
            *map(str, args),
        ],
        cwd=directory,
        capture_output=True,
        check=check,
    )


def _paths(source, patches):
    paths = set()
    for patch in patches:
        # These reviewed bundles contain ordinary file updates/additions only.
        # Refuse new file kinds instead of incompletely snapshotting them.
        content = patch.read_bytes()
        if any(
            line.startswith(
                (
                    b"rename from ",
                    b"copy from ",
                    b"new file mode 120000",
                    b"old mode 120000",
                    b"new mode 120000",
                    b"deleted file mode 120000",
                )
            )
            for line in content.splitlines()
        ):
            raise SystemExit(
                "Workspace bundles cannot rename, copy or modify symlinks."
            )
        for entry in _git(source, "apply", "--numstat", "-z", patch).stdout.split(
            b"\0"
        ):
            if not entry:
                continue
            identity = entry.split(b"\t", 2)[2].decode("utf-8")
            relative = Path(identity)
            if (
                relative.is_absolute()
                or ".." in relative.parts
                or ".git" in relative.parts
                or ":" in identity
                or "\\" in identity
            ):
                raise SystemExit("Workspace patch contains an unsupported path.")
            target = source / relative
            if not target.resolve().is_relative_to(source):
                raise SystemExit("Workspace patch target escapes its source checkout.")
            for item in (target, *target.parents):
                if item == source:
                    break
                if item.is_symlink() or getattr(item, "is_junction", lambda: False)():
                    raise SystemExit(
                        "Workspace patch targets must not pass through links."
                    )
            if target.exists() and not target.is_file():
                raise SystemExit("Workspace patch target is not an ordinary file.")
            paths.add(relative)
    return sorted(paths)


def apply_bundle(source: Path, name: str) -> None:
    """Preflight an entire ordered bundle; update the working tree once or not at all."""
    source = source.resolve()
    try:
        pins = json.loads((ROOT / "scripts/workspace-sources.json").read_text())
        if name not in BUNDLES or name not in pins:
            raise SystemExit("Unknown workspace patch bundle.")
        if _git(source, "rev-parse", "HEAD").stdout.decode().strip() != pins[name]:
            raise SystemExit(
                f"{name} is not at the pinned base. Select an explicit reviewed source checkout."
            )
        with tempfile.TemporaryDirectory(prefix="conker-bundle-") as temporary:
            base = Path(temporary)
            patch_directory = base / "patches"
            patch_directory.mkdir()
            patches = []
            for filename in BUNDLES[name]:
                copied = patch_directory / filename
                copied.write_bytes((ROOT / "scripts/patches" / filename).read_bytes())
                patches.append(copied)
            paths = _paths(source, patches)
            snapshot = base / "snapshot"
            snapshot.mkdir()
            existing = set()
            for relative in paths:
                original = source / relative
                if original.is_file():
                    destination = snapshot / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(original, destination)
                    existing.add(relative)
            for count in reversed(range(len(patches) + 1)):
                # Reverse a complete applied prefix, then replay the full bundle
                # on a private copy. This handles overlapping extension hunks and
                # preserves unrelated local edits, including in affected files.
                candidate = base / f"candidate-{count}"
                shutil.copytree(snapshot, candidate)
                _git(candidate, "init", "-q")
                _git(candidate, "add", "--force", "--all")
                ok = True
                for patch in reversed(patches[:count]):
                    if _git(
                        candidate, "apply", "--reverse", patch, check=False
                    ).returncode:
                        ok = False
                        break
                if ok:
                    for patch in patches:
                        if _git(candidate, "apply", patch, check=False).returncode:
                            ok = False
                            break
                if not ok:
                    continue
                for relative in paths:
                    if relative not in existing and (candidate / relative).is_file():
                        _git(
                            candidate,
                            "add",
                            "--intent-to-add",
                            "--force",
                            "--",
                            relative,
                        )
                change = _git(
                    candidate,
                    "diff",
                    "--binary",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--no-renames",
                ).stdout
                if not change:
                    return
                combined = base / "reviewed-bundle.patch"
                combined.write_bytes(change)
                if (
                    _git(source, "rev-parse", "HEAD").stdout.decode().strip()
                    != pins[name]
                ):
                    raise SystemExit(
                        "Workspace source changed during patch review; nothing was applied."
                    )
                _git(source, "apply", "--check", combined)
                # git apply validates every hunk before changing any source file.
                _git(source, "apply", combined)
                return
        raise SystemExit(
            f"{name} has changes conflicting with the reviewed bundle; nothing was overwritten. "
            "Select a reviewed checkout with its explicit source option."
        )
    except (OSError, ValueError, KeyError, IndexError, subprocess.CalledProcessError):
        raise SystemExit(
            f"Could not apply the {name} workspace bundle; source changes were retained. "
            "Check the pinned checkout and reviewed patch files."
        ) from None
