"""Transactional paid-model opt-in shared by the host CLI and provider UI."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from scripts.provider_secrets import ProviderSecretError, SecretStore


class PaidPolicy:
    def __init__(self, root: Path, layout: str, *, runner=subprocess.run):
        self.root, self.layout, self.runner = root.resolve(), layout, runner
        self.state = self.root / ("state" if layout == "ubuntu" else ".conker")
        self.environment = self.root / (
            "state/pi.env" if layout == "ubuntu" else ".env"
        )
        self.marker = self.state / "provider-control/paid-transition.json"
        self.lock = SecretStore(self.state / "provider-secrets")

    def _environment(self) -> str:
        if self.environment.is_symlink():
            raise ProviderSecretError("Provider environment must be a regular file.")
        return (
            self.environment.read_text(encoding="utf-8")
            if self.environment.exists()
            else ""
        )

    @staticmethod
    def _allowed(text: str) -> bool:
        values = [
            line.partition("=")[2].strip()
            for line in text.splitlines()
            if line.startswith("PI_ALLOW_PAID_MODELS=")
        ]
        if (
            len(values) > 1
            or values
            and values[0] not in {"", "0", "false", "no", "1", "true", "yes"}
        ):
            raise ProviderSecretError("Provider spending policy is ambiguous.")
        return bool(values and values[0] in {"1", "true", "yes"})

    def status(self):
        return {
            "paidAllowed": self._allowed(self._environment()),
            "policyRecoveryRequired": self.marker.exists(),
        }

    def _write_policy(self, enabled: bool):
        lines = [
            line
            for line in self._environment().splitlines()
            if not line.startswith("PI_ALLOW_PAID_MODELS=")
        ]
        self.lock._write(
            self.environment,
            (
                "\n".join(
                    [*lines, f"PI_ALLOW_PAID_MODELS={'true' if enabled else 'false'}"]
                )
                + "\n"
            ).encode(),
        )

    def _compose(self, *arguments):
        if self.layout == "ubuntu":
            command = [
                "docker",
                "compose",
                "--project-directory",
                str(self.root),
                "-f",
                str(self.root / "compose.json"),
            ]
        else:
            command = [
                "docker",
                "compose",
                "--env-file",
                str(self.root / "versions.env"),
                "--env-file",
                str(self.environment),
                "-f",
                str(self.root / "docker-compose.yml"),
            ]
        return self.runner(
            [*command, *arguments],
            cwd=self.root,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=120,
            check=False,
        )

    def _restart(self, expected: bool):
        result = self._compose("up", "-d", "--no-deps", "--force-recreate", "pi")
        if result.returncode:
            raise ProviderSecretError("AI runtime restart was not confirmed.")
        services = self._compose("config", "--services")
        if services.returncode:
            raise ProviderSecretError("Dependent service inventory was not confirmed.")
        if (
            b"decisions" in services.stdout.splitlines()
            and self._compose(
                "up", "-d", "--no-deps", "--force-recreate", "decisions"
            ).returncode
        ):
            raise ProviderSecretError("Decision-service restart was not confirmed.")
        check = self._compose(
            "exec",
            "-T",
            "pi",
            "python",
            "-c",
            "import os; print('on' if os.environ.get('PI_ALLOW_PAID_MODELS','').strip() in {'1','true','yes'} else 'off')",
        )
        if check.returncode or check.stdout.strip() != (b"on" if expected else b"off"):
            raise ProviderSecretError("Runtime spending policy was not confirmed.")

    def apply(self, enabled: bool, expected: bool):
        if type(enabled) is not bool or type(expected) is not bool:
            raise ProviderSecretError("Supply a boolean spending policy.")
        if any(
            (self.root / name).exists()
            for name in (".conker-recovery.json", ".conker-backup.lock")
        ):
            raise ProviderSecretError(
                "Installation recovery or backup must finish first."
            )
        self.lock.initialize()
        with self.lock.locked():
            if self.marker.exists():
                raise ProviderSecretError(
                    "Recover the interrupted spending-policy change first."
                )
            original = self._environment()
            if self._allowed(original) != expected:
                raise ProviderSecretError(
                    "Spending policy changed; refresh before continuing."
                )
            if enabled == expected:
                return self.status()
            self.marker.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            self.lock._write(
                self.marker,
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "previousAllowed": expected,
                        "requestedAllowed": enabled,
                    }
                ).encode(),
            )
            self._write_policy(enabled)
            try:
                self._restart(enabled)
            except (ProviderSecretError, OSError, subprocess.SubprocessError):
                self._write_policy(expected)
                try:
                    self._restart(expected)
                except (ProviderSecretError, OSError, subprocess.SubprocessError):
                    raise ProviderSecretError(
                        "Spending-policy recovery is required. Inspect status before continuing."
                    ) from None
                self.marker.unlink()
                raise ProviderSecretError(
                    "Spending policy could not activate; the previous policy was restored."
                ) from None
            self.marker.unlink()
            return self.status()

    def recover(self):
        if any(
            (self.root / name).exists()
            for name in (".conker-recovery.json", ".conker-backup.lock")
        ):
            raise ProviderSecretError(
                "Installation recovery or backup must finish first."
            )
        self.lock.initialize()
        with self.lock.locked():
            if (
                not self.marker.is_file()
                or self.marker.is_symlink()
                or self.marker.stat().st_size > 4096
            ):
                raise ProviderSecretError(
                    "No recoverable spending-policy transition exists."
                )
            try:
                saved = json.loads(self.marker.read_text())
                if (
                    not isinstance(saved, dict)
                    or set(saved)
                    != {"schemaVersion", "previousAllowed", "requestedAllowed"}
                    or saved["schemaVersion"] != 1
                    or type(saved["previousAllowed"]) is not bool
                    or type(saved["requestedAllowed"]) is not bool
                ):
                    raise ValueError()
            except (ValueError, UnicodeError):
                raise ProviderSecretError(
                    "Spending-policy recovery state is invalid."
                ) from None
            self._write_policy(saved["previousAllowed"])
            self._restart(saved["previousAllowed"])
            self.marker.unlink()
            return self.status()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    parser.add_argument("action", choices=("status", "on", "off", "recover"))
    args = parser.parse_args()
    policy = PaidPolicy(args.root, args.layout)
    try:
        result = (
            policy.status()
            if args.action == "status"
            else policy.recover()
            if args.action == "recover"
            else policy.apply(args.action == "on", policy.status()["paidAllowed"])
        )
    except (ProviderSecretError, OSError, subprocess.SubprocessError):
        raise SystemExit(
            "Provider spending policy not confirmed. Inspect provider status and recover if required."
        ) from None
    print(json.dumps(result))


if __name__ == "__main__":
    main()
