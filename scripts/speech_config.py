#!/usr/bin/env python3
"""Host-owned speech configuration. Secret values never enter browser state or argv."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

MAX_ENV_BYTES = 256 * 1024
MAX_SECRET_BYTES = 4096
NAMES = (
    "PI_SPEECH_URL",
    "PI_STT_MODEL",
    "PI_TTS_MODEL",
    "PI_TTS_VOICE",
    "PI_SPEECH_CHARACTER_VOICE",
    "PI_SPEECH_TIMEOUT_S",
)


class SpeechConfigError(RuntimeError):
    pass


def _regular(path: Path, *, allow_missing: bool = False) -> None:
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise SpeechConfigError(f"Configuration path is not a regular file: {path}")
    if not allow_missing and not path.is_file():
        raise SpeechConfigError(f"Configuration file is missing: {path}")


def _read_env(path: Path) -> tuple[list[str], dict[str, str]]:
    _regular(path)
    encoded = path.read_bytes()
    if len(encoded) > MAX_ENV_BYTES:
        raise SpeechConfigError("Environment file is too large.")
    try:
        lines = encoded.decode("utf-8").splitlines()
    except UnicodeDecodeError as exc:
        raise SpeechConfigError("Environment file must be UTF-8.") from exc
    values: dict[str, str] = {}
    for line in lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name in NAMES:
            if name in values:
                raise SpeechConfigError(f"Environment file contains duplicate {name} entries.")
            values[name] = value
    return lines, values


def _safe_value(name: str, value: str, *, limit: int) -> str:
    if not value or value != value.strip() or len(value) > limit:
        raise SpeechConfigError(f"{name} is missing or invalid.")
    if "$" in value or "#" in value or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise SpeechConfigError(f"{name} contains characters that are unsafe in the host environment file.")
    try:
        value.encode("utf-8")
    except UnicodeError as exc:
        raise SpeechConfigError(f"{name} must be valid UTF-8.") from exc
    return value


def _url(value: str) -> str:
    value = _safe_value("Speech URL", value, limit=2048)
    try:
        parsed = urlsplit(value)
        valid = (
            parsed.scheme in {"http", "https"}
            and bool(parsed.hostname)
            and not parsed.username
            and not parsed.password
            and not parsed.query
            and not parsed.fragment
            and parsed.port != 0
        )
    except ValueError:
        valid = False
    if not valid:
        raise SpeechConfigError("Speech URL must be an explicit HTTP(S) API base without credentials, query or fragment.")
    return value.rstrip("/")


def _secret(path: Path) -> bytes:
    _regular(path, allow_missing=True)
    if not path.exists():
        return b""
    value = path.read_bytes()
    if value.endswith(b"\n"):
        value = value[:-1]
    if value.endswith(b"\r"):
        value = value[:-1]
    if len(value) > MAX_SECRET_BYTES:
        raise SpeechConfigError("Speech credential exceeds 4096 bytes.")
    if value and any(byte < 33 or byte > 126 for byte in value):
        raise SpeechConfigError("Speech credential must be one printable ASCII token without spaces.")
    return value


def _atomic(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def _write_env(path: Path, updates: dict[str, str]) -> None:
    lines, _ = _read_env(path)
    retained = [line for line in lines if not any(line.startswith(name + "=") for name in NAMES)]
    if retained and retained[-1]:
        retained.append("")
    retained.extend(f"{name}={updates[name]}" for name in NAMES)
    _atomic(path, ("\n".join(retained) + "\n").encode("utf-8"))


def status(env_file: Path, key_file: Path) -> dict:
    _, values = _read_env(env_file)
    key = _secret(key_file)
    character = values.get("PI_SPEECH_CHARACTER_VOICE", "unsupported") or "unsupported"
    url = values.get("PI_SPEECH_URL", "")
    stt = values.get("PI_STT_MODEL", "")
    tts = values.get("PI_TTS_MODEL", "")
    voice = values.get("PI_TTS_VOICE", "")
    return {
        "schemaVersion": 1,
        "configured": bool(url and stt),
        "speechInput": "configured" if url and stt else "unconfigured",
        "speechOutput": "configured" if url and tts and (voice or character != "unsupported") else "unconfigured",
        "credentialConfigured": bool(key),
        "urlConfigured": bool(url),
        "sttModelConfigured": bool(stt),
        "ttsModelConfigured": bool(tts),
        "voiceConfigured": bool(voice),
        "characterVoice": character,
        "secretsIncluded": False,
    }


def configure(args: argparse.Namespace) -> dict:
    url = _url(args.url)
    stt = _safe_value("STT model", args.stt_model, limit=200)
    tts = _safe_value("TTS model", args.tts_model, limit=200) if args.tts_model else ""
    voice = _safe_value("TTS voice", args.voice, limit=200) if args.voice else ""
    if voice and not tts:
        raise SpeechConfigError("A TTS voice requires a TTS model.")
    if tts and not voice and args.character_voice == "unsupported":
        raise SpeechConfigError("A TTS model requires a default voice or an explicit character voice adapter.")
    try:
        timeout = float(args.timeout)
    except ValueError as exc:
        raise SpeechConfigError("Speech timeout must be a number between 0.1 and 120.") from exc
    if not math.isfinite(timeout) or not 0.1 <= timeout <= 120:
        raise SpeechConfigError("Speech timeout must be a number between 0.1 and 120.")
    key_file = Path(args.key_file)
    current_key = _secret(key_file)
    if args.key_stdin:
        current_key = sys.stdin.buffer.read(MAX_SECRET_BYTES + 2)
        if current_key.endswith(b"\n"):
            current_key = current_key[:-1]
        if current_key.endswith(b"\r"):
            current_key = current_key[:-1]
        if not current_key:
            raise SpeechConfigError("Speech credential input is empty; omit --key-stdin for an unauthenticated server.")
        if len(current_key) > MAX_SECRET_BYTES or any(byte < 33 or byte > 126 for byte in current_key):
            raise SpeechConfigError("Speech credential must be one printable ASCII token of at most 4096 bytes.")
    elif args.clear_key:
        current_key = b""
    updates = {
        "PI_SPEECH_URL": url,
        "PI_STT_MODEL": stt,
        "PI_TTS_MODEL": tts,
        "PI_TTS_VOICE": voice,
        "PI_SPEECH_CHARACTER_VOICE": args.character_voice,
        "PI_SPEECH_TIMEOUT_S": str(timeout).rstrip("0").rstrip(".") if "." in str(timeout) else str(timeout),
    }
    _write_env(Path(args.env_file), updates)
    _atomic(key_file, current_key)
    return status(Path(args.env_file), key_file)


def disable(env_file: Path, key_file: Path) -> dict:
    _secret(key_file)
    _write_env(env_file, {
        "PI_SPEECH_URL": "", "PI_STT_MODEL": "", "PI_TTS_MODEL": "", "PI_TTS_VOICE": "",
        "PI_SPEECH_CHARACTER_VOICE": "unsupported", "PI_SPEECH_TIMEOUT_S": "30",
    })
    _atomic(key_file, b"")
    return status(env_file, key_file)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--env-file", required=True)
    result.add_argument("--key-file", required=True)
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("status")
    setup = commands.add_parser("configure")
    setup.add_argument("--url", required=True)
    setup.add_argument("--stt-model", required=True)
    setup.add_argument("--tts-model", default="")
    setup.add_argument("--voice", default="")
    setup.add_argument("--character-voice", choices=("unsupported", "qwen3-design", "qwen3-base"), default="unsupported")
    setup.add_argument("--timeout", default="30")
    key = setup.add_mutually_exclusive_group()
    key.add_argument("--key-stdin", action="store_true")
    key.add_argument("--clear-key", action="store_true")
    commands.add_parser("disable")
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "status":
            value = status(Path(args.env_file), Path(args.key_file))
        elif args.command == "configure":
            value = configure(args)
        else:
            value = disable(Path(args.env_file), Path(args.key_file))
    except (OSError, SpeechConfigError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(value, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
