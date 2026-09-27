from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pytest

from scripts import speech_config


def files(tmp_path: Path):
    env = tmp_path / ".env"
    env.write_text("OTHER=kept\nPI_SPEECH_URL=\n", encoding="utf-8")
    key = tmp_path / "speech" / "speech.key"
    return env, key


def arguments(env: Path, key: Path, *extra: str):
    return speech_config.parser().parse_args([
        "--env-file", str(env), "--key-file", str(key), "configure",
        "--url", "https://speech.test/v1", "--stt-model", "whisper-1", *extra,
    ])


def test_configure_is_secret_free_and_preserves_unrelated_environment(tmp_path: Path, monkeypatch):
    env, key = files(tmp_path)
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(b"speech-secret\n")))

    result = speech_config.configure(arguments(
        env, key, "--tts-model", "kokoro", "--voice", "af_heart", "--key-stdin",
    ))

    assert result == {
        "schemaVersion": 1, "configured": True, "speechInput": "configured",
        "speechOutput": "configured", "credentialConfigured": True,
        "urlConfigured": True, "sttModelConfigured": True, "ttsModelConfigured": True,
        "voiceConfigured": True, "characterVoice": "unsupported", "secretsIncluded": False,
    }
    assert "OTHER=kept" in env.read_text(encoding="utf-8")
    assert "speech-secret" not in env.read_text(encoding="utf-8")
    assert key.read_bytes() == b"speech-secret"
    assert "speech-secret" not in json.dumps(result)


def test_invalid_configuration_does_not_mutate_files(tmp_path: Path):
    env, key = files(tmp_path)
    before = env.read_bytes()

    with pytest.raises(speech_config.SpeechConfigError):
        speech_config.configure(arguments(env, key, "--tts-model", "kokoro"))

    assert env.read_bytes() == before
    assert not key.exists()


def test_disable_clears_key_and_public_configuration(tmp_path: Path):
    env, key = files(tmp_path)
    key.parent.mkdir()
    key.write_text("old-secret", encoding="ascii")
    speech_config._write_env(env, {
        "PI_SPEECH_URL": "https://speech.test/v1", "PI_STT_MODEL": "whisper-1",
        "PI_TTS_MODEL": "kokoro", "PI_TTS_VOICE": "af_heart",
        "PI_SPEECH_CHARACTER_VOICE": "unsupported", "PI_SPEECH_TIMEOUT_S": "30",
    })

    result = speech_config.disable(env, key)

    assert result["configured"] is False
    assert result["credentialConfigured"] is False
    assert key.read_bytes() == b""


@pytest.mark.parametrize("url", ["file:///tmp/speech", "https://user:secret@speech.test/v1", "https://speech.test/v1?key=x"])
def test_unsafe_destinations_are_refused(tmp_path: Path, url: str):
    env, key = files(tmp_path)
    args = arguments(env, key)
    args.url = url
    with pytest.raises(speech_config.SpeechConfigError):
        speech_config.configure(args)
