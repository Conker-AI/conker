"""Private Unix-socket bridge to the same host provider operations as conker CLI.

No TCP listener, shell command input, environment editor, or secret read route.
Only the authenticated gateway mounts this socket directory.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import socketserver
import stat
import subprocess
import threading
from http.server import BaseHTTPRequestHandler
from pathlib import Path

from scripts.chatgpt_provider import (
    ChatGPTControl,
    ChatGPTError,
    inference_events,
    responses_payload,
)
from scripts.provider_paid_policy import PaidPolicy
from scripts.provider_secrets import (
    PROVIDERS,
    REVISION,
    ProviderSecretError,
    SecretStore,
    verify_provider,
)

MAX_BODY = 16 * 1024
PROJECTION_FIELDS = {
    "id",
    "configured",
    "activeRevision",
    "activeAt",
    "stagedRevision",
    "stagedAt",
    "verificationStatus",
    "verificationBasis",
    "verifiedAt",
    "verificationStale",
    "activationPending",
    "revokedRevisions",
    "secretIncluded",
}


class ProviderControl:
    def __init__(
        self,
        root: Path,
        source: Path,
        layout: str,
        *,
        runner=subprocess.run,
        verifier=verify_provider,
    ):
        self.root, self.source, self.layout = root.resolve(), source.resolve(), layout
        if layout not in {"ubuntu", "repository"}:
            raise ValueError("Unknown installation layout.")
        directory = (
            self.root
            / ("state" if layout == "ubuntu" else ".conker")
            / "provider-secrets"
        )
        self.store = SecretStore(directory)
        self.runner, self.verifier = runner, verifier
        self.policy = PaidPolicy(self.root, layout, runner=runner)

    def status(self) -> dict:
        value = self.store.status()
        return {
            "schemaVersion": 1,
            "available": True,
            "secretsIncluded": False,
            **self.policy.status(),
            "providers": [
                {key: row[key] for key in PROJECTION_FIELDS}
                for row in value["providers"]
            ],
        }

    def apply(self, value: dict) -> dict:
        if not isinstance(value, dict):
            raise ProviderSecretError("Supply a provider operation.")
        if value.get("operation") == "paid-policy":
            if set(value) != {"operation", "enabled", "expectedAllowed"}:
                raise ProviderSecretError(
                    "Supply only the spending policy and its expected state."
                )
            self.policy.apply(value["enabled"], value["expectedAllowed"])
            return self.status()
        if value.get("operation") == "recover-paid-policy":
            if set(value) != {"operation"}:
                raise ProviderSecretError(
                    "Supply only the spending recovery operation."
                )
            self.policy.recover()
            return self.status()
        if self.policy.status()["policyRecoveryRequired"]:
            raise ProviderSecretError(
                "Recover the spending policy before changing credentials."
            )
        provider, operation = value.get("provider"), value.get("operation")
        if not isinstance(provider, str) or provider not in PROVIDERS:
            raise ProviderSecretError("Unsupported provider.")
        if any(
            (self.root / name).exists()
            for name in (".conker-recovery.json", ".conker-backup.lock")
        ):
            raise ProviderSecretError(
                "Installation recovery or backup must finish first."
            )
        if operation == "stage":
            if set(value) != {
                "provider",
                "operation",
                "secret",
                "activeRevision",
                "stagedRevision",
            }:
                raise ProviderSecretError(
                    "Supply only the key and expected credential revisions."
                )
            for key in ("activeRevision", "stagedRevision"):
                if value[key] is not None and (
                    not isinstance(value[key], str)
                    or not REVISION.fullmatch(value[key])
                ):
                    raise ProviderSecretError("Invalid expected credential revision.")
            if not isinstance(value["secret"], str):
                raise ProviderSecretError("Supply a printable API key.")
            try:
                secret = value["secret"].encode("ascii")
            except UnicodeEncodeError:
                raise ProviderSecretError("Supply a printable API key.") from None
            self.store.stage(
                provider,
                secret,
                expected=(value["activeRevision"], value["stagedRevision"]),
            )
        else:
            expected = {"provider", "operation", "revision"}
            if operation == "record-revoked":
                expected.add("issuerConfirmed")
            revision = value.get("revision")
            if (
                set(value) != expected
                or not isinstance(revision, str)
                or not REVISION.fullmatch(revision)
            ):
                raise ProviderSecretError("Supply the exact credential revision.")
            if operation == "verify":
                self.store.verify(provider, self.verifier, revision=revision)
            elif operation == "discard":
                self.store.discard(provider, revision)
            elif operation in {"activate", "recover", "record-revoked"}:
                if (
                    operation == "record-revoked"
                    and value["issuerConfirmed"] is not True
                ):
                    raise ProviderSecretError(
                        "Confirm revocation at the provider first."
                    )
                command = [
                    "bash",
                    str(self.source / "conker"),
                    "providers",
                    operation,
                    provider,
                    revision,
                ]
                if operation == "record-revoked":
                    command.append("--issuer-confirmed")
                environment = {
                    **os.environ,
                    "CONKER_LAYOUT": self.layout,
                    "CONKER_DEPLOY_DIR": str(self.root),
                    "NO_COLOR": "1",
                }
                try:
                    # Never return subprocess output: it may contain host details or secrets.
                    result = self.runner(
                        command,
                        cwd=self.root,
                        env=environment,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=180,
                        check=False,
                    )
                except (OSError, subprocess.SubprocessError):
                    raise ProviderSecretError(
                        "Provider operation interrupted; inspect credential status before retrying."
                    ) from None
                if result.returncode != 0:
                    raise ProviderSecretError(
                        "Provider operation failed; inspect credential status before retrying."
                    )
            else:
                raise ProviderSecretError("Unsupported provider operation.")
        return self.status()


def handler(control: ProviderControl, chatgpt=None):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_args):
            pass

        def respond(self, status, value):
            content = json.dumps(value).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):
            if self.path == "/chatgpt" and chatgpt:
                return self.respond(200, chatgpt.status())
            if self.path != "/providers":
                return self.respond(404, {"error": "unsupported_operation"})
            try:
                self.respond(200, control.status())
            except (ProviderSecretError, OSError):
                self.respond(503, {"error": "provider_control_unavailable"})

        def do_POST(self):
            if self.path not in {"/providers", "/chatgpt"} or (
                self.path == "/chatgpt" and not chatgpt
            ):
                return self.respond(404, {"error": "unsupported_operation"})
            length = self.headers.get("Content-Length", "")
            if (
                not length.isdigit()
                or not 0 < int(length) <= MAX_BODY
                or self.headers.get("Transfer-Encoding")
                or self.headers.get("Content-Type") != "application/json"
            ):
                return self.respond(422, {"error": "invalid_provider_operation"})
            self.connection.settimeout(10)
            try:
                value = json.loads(self.rfile.read(int(length)).decode("utf-8"))
                result = (
                    chatgpt.apply(value)
                    if self.path == "/chatgpt"
                    else control.apply(value)
                )
                self.respond(200, result)
            except (UnicodeError, ValueError, ProviderSecretError, ChatGPTError):
                self.respond(409, {"error": "provider_operation_rejected"})
            except (OSError, subprocess.SubprocessError):
                self.respond(503, {"error": "provider_control_unavailable"})

    return Handler


def inference_handler(control):
    slots = threading.BoundedSemaphore(2)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.path != "/status":
                self.send_error(404)
                return
            value = control.status()
            content = json.dumps(
                {"connected": value["connected"], "available": value["available"]}
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_POST(self):
            length = self.headers.get("Content-Length", "")
            if (
                self.path != "/responses"
                or not length.isdigit()
                or not 0 < int(length) <= 8_000_000
                or self.headers.get("Transfer-Encoding")
                or self.headers.get("Content-Type") != "application/json"
            ):
                self.send_error(422)
                return
            if not slots.acquire(blocking=False):
                self.send_error(503)
                return
            try:
                self.connection.settimeout(10)
                value = json.loads(self.rfile.read(int(length)))
                responses_payload(value)
                self.connection.settimeout(180)
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.end_headers()
                events = inference_events(control, value)
                try:
                    for event in events:
                        self.wfile.write(json.dumps(event).encode() + b"\n")
                        self.wfile.flush()
                except ChatGPTError as error:
                    self.wfile.write(
                        json.dumps({"type": "error", "code": str(error)}).encode()
                        + b"\n"
                    )
                finally:
                    events.close()
            except (OSError, ValueError):
                pass
            finally:
                slots.release()

    return Handler


class ThreadedUnixServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    address_family = getattr(socket, "AF_UNIX", socket.AF_INET)
    daemon_threads = True


def private_socket(path):
    if not path.is_absolute() or path.parent.is_symlink() or path.is_symlink():
        raise ValueError("Socket must be an absolute private non-symlink path.")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    if path.exists():
        if not stat.S_ISSOCK(path.lstat().st_mode):
            raise ValueError("Existing path is not a socket.")
        with socket.socket(socket.AF_UNIX) as probe:
            probe.settimeout(1)
            try:
                probe.connect(str(path))
            except ConnectionRefusedError:
                path.unlink()
            else:
                raise ValueError("Provider socket is already running.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--layout", required=True, choices=("ubuntu", "repository"))
    parser.add_argument("--socket", required=True, type=Path)
    parser.add_argument("--codex", type=Path)
    args = parser.parse_args()
    if os.name != "posix" or not args.socket.is_absolute():
        parser.error(
            "Provider control requires an absolute Unix socket on a POSIX host."
        )
    directory = args.socket.parent
    if directory.is_symlink() or (directory.exists() and not directory.is_dir()):
        parser.error("Socket directory must be a real private directory.")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    if args.socket.exists():
        if not stat.S_ISSOCK(args.socket.lstat().st_mode):
            parser.error("Existing socket path is not a socket.")
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
            probe.settimeout(1)
            try:
                probe.connect(str(args.socket))
            except ConnectionRefusedError:
                args.socket.unlink()
            else:
                parser.error("Provider control is already running.")
    control = ProviderControl(args.root, args.source, args.layout)
    control.status()
    state = args.root / ("state" if args.layout == "ubuntu" else ".conker")
    chatgpt = ChatGPTControl(
        state, args.codex or Path.home() / "conker-model-runtime/bin/codex"
    )
    inference_socket = state / "chatgpt-inference/inference.sock"
    private_socket(inference_socket)
    inference_server = ThreadedUnixServer(
        str(inference_socket), inference_handler(chatgpt)
    )
    inference_socket.chmod(0o600)
    threading.Thread(target=inference_server.serve_forever, daemon=True).start()
    with socketserver.UnixStreamServer(
        str(args.socket), handler(control, chatgpt)
    ) as server:
        args.socket.chmod(0o600)
        try:
            server.serve_forever()
        finally:
            inference_server.shutdown()
            inference_server.server_close()
            inference_socket.unlink(missing_ok=True)
            if chatgpt.rpc:
                chatgpt.rpc.close()
            if args.socket.exists() and stat.S_ISSOCK(args.socket.lstat().st_mode):
                args.socket.unlink()


if __name__ == "__main__":
    main()
