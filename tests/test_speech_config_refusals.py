"""`scripts/speech_config.py` through `main()`: the exact refusal for each bad file or option, and the receipts.

The CLI is run in-process with argv and a fake stdin; env and key files live in tmp_path. Every refusal
is exit code 1 with one message on stderr and nothing on stdout, and never echoes the credential.
"""

from __future__ import annotations

import io
import json
import sys

import pytest

from scripts import speech_config

SYNTHETIC = "synthetic-credential-one"


@pytest.fixture()
def files(tmp_path):
    env = tmp_path / "state/pi.env"
    key = tmp_path / "state/speech.key"
    env.parent.mkdir()
    env.write_text("PI_ADMIN_KEY=synthetic\n", encoding="utf-8")
    key.write_bytes(b"")
    return env, key


def cli(monkeypatch, env, key, *argv, stdin=b""):
    monkeypatch.setattr(
        sys, "argv", ["speech_config.py", "--env-file", str(env), "--key-file", str(key), *argv]
    )
    monkeypatch.setattr(sys, "stdin", type("In", (), {"buffer": io.BytesIO(stdin)})())
    return speech_config.main()


def configure(monkeypatch, files, *options, stdin=b""):
    env, key = files
    return cli(
        monkeypatch,
        env,
        key,
        "configure",
        "--url",
        "https://speech.example.test/v1/",
        "--stt-model",
        "whisper",
        *options,
        stdin=stdin,
    )


def refusal(capsys):
    captured = capsys.readouterr()
    assert captured.out == ""
    return captured.err.strip()


# ---- reading the files --------------------------------------------------------------------


def test_status_refuses_a_missing_environment_file(tmp_path, monkeypatch, capsys):
    missing = tmp_path / "missing.env"
    assert cli(monkeypatch, missing, tmp_path / "k", "status") == 1
    assert refusal(capsys) == f"Configuration file is missing: {missing}"


def test_status_refuses_a_path_that_is_not_a_regular_file(tmp_path, files, monkeypatch, capsys):
    assert cli(monkeypatch, tmp_path, files[1], "status") == 1
    assert refusal(capsys) == f"Configuration path is not a regular file: {tmp_path}"


def test_status_refuses_an_oversized_environment_file(files, monkeypatch, capsys):
    files[0].write_bytes(b"#" * (256 * 1024 + 1))
    assert cli(monkeypatch, *files, "status") == 1
    assert refusal(capsys) == "Environment file is too large."


def test_status_refuses_an_environment_file_that_is_not_utf8(files, monkeypatch, capsys):
    files[0].write_bytes(b"\xff\xfe=")
    assert cli(monkeypatch, *files, "status") == 1
    assert refusal(capsys) == "Environment file must be UTF-8."


def test_status_refuses_a_duplicated_setting(files, monkeypatch, capsys):
    files[0].write_text("PI_STT_MODEL=a\n# note\nPI_STT_MODEL=b\n", encoding="utf-8")
    assert cli(monkeypatch, *files, "status") == 1
    assert refusal(capsys) == "Environment file contains duplicate PI_STT_MODEL entries."


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"x" * 4097, "Speech credential exceeds 4096 bytes."),
        (b"has space", "Speech credential must be one printable ASCII token without spaces."),
    ],
)
def test_status_refuses_a_bad_credential_file(files, monkeypatch, capsys, content, message):
    files[1].write_bytes(content)
    assert cli(monkeypatch, *files, "status") == 1
    assert refusal(capsys) == message


def test_status_reports_what_is_configured_without_secrets(files, monkeypatch, capsys):
    files[0].write_text(
        "PI_SPEECH_URL=https://s.test\nPI_STT_MODEL=w\nPI_TTS_MODEL=t\n"
        "PI_SPEECH_CHARACTER_VOICE=qwen3-base\n",
        encoding="utf-8",
    )
    files[1].write_bytes(SYNTHETIC.encode() + b"\r\n")
    assert cli(monkeypatch, *files, "status") == 0
    out = capsys.readouterr().out
    assert SYNTHETIC not in out
    status = json.loads(out)
    assert status["speechInput"] == "configured"
    assert status["speechOutput"] == "configured"
    assert status["credentialConfigured"] is True
    assert status["voiceConfigured"] is False
    assert status["characterVoice"] == "qwen3-base"
    assert status["secretsIncluded"] is False


# ---- configure refusals -------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "ftp://speech.test",
        "http://user:pw@speech.test",
        "http://speech.test?x=1",
        "http://speech.test:0",
        "http://speech.test:99999",
        "https://",
    ],
)
def test_configure_refuses_a_url_that_is_not_a_plain_http_base(files, monkeypatch, capsys, url):
    env, key = files
    assert cli(monkeypatch, env, key, "configure", "--url", url, "--stt-model", "w") == 1
    assert refusal(capsys) == (
        "Speech URL must be an explicit HTTP(S) API base without credentials, query or fragment."
    )


@pytest.mark.parametrize(
    ("url", "message"),
    [
        (" https://s.test", "Speech URL is missing or invalid."),
        (
            "https://s.test/$x",
            "Speech URL contains characters that are unsafe in the host environment file.",
        ),
        (
            "https://s.test/#x",
            "Speech URL contains characters that are unsafe in the host environment file.",
        ),
    ],
)
def test_configure_refuses_an_unsafe_url_value(files, monkeypatch, capsys, url, message):
    env, key = files
    assert cli(monkeypatch, env, key, "configure", "--url", url, "--stt-model", "w") == 1
    assert refusal(capsys) == message


@pytest.mark.parametrize(
    ("options", "message"),
    [
        (("--voice", "alloy"), "A TTS voice requires a TTS model."),
        (
            ("--tts-model", "kokoro"),
            "A TTS model requires a default voice or an explicit character voice adapter.",
        ),
        (("--timeout", "soon"), "Speech timeout must be a number between 0.1 and 120."),
        (("--timeout", "nan"), "Speech timeout must be a number between 0.1 and 120."),
        (("--timeout", "0.05"), "Speech timeout must be a number between 0.1 and 120."),
        (("--timeout", "121"), "Speech timeout must be a number between 0.1 and 120."),
        (
            ("--tts-model", "a$b", "--voice", "v"),
            "TTS model contains characters that are unsafe in the host environment file.",
        ),
    ],
)
def test_configure_refuses_bad_options(files, monkeypatch, capsys, options, message):
    assert configure(monkeypatch, files, *options) == 1
    assert refusal(capsys) == message
    assert files[0].read_text(encoding="utf-8") == "PI_ADMIN_KEY=synthetic\n"


def test_configure_refuses_an_empty_credential_on_stdin(files, monkeypatch, capsys):
    assert configure(monkeypatch, files, "--key-stdin", stdin=b"\n") == 1
    assert refusal(capsys) == (
        "Speech credential input is empty; omit --key-stdin for an unauthenticated server."
    )


@pytest.mark.parametrize("secret", [b"two words\n", b"x" * 4097])
def test_configure_refuses_a_credential_that_is_not_one_printable_token(
    files, monkeypatch, capsys, secret
):
    assert configure(monkeypatch, files, "--key-stdin", stdin=secret) == 1
    message = refusal(capsys)
    assert message == "Speech credential must be one printable ASCII token of at most 4096 bytes."
    assert "words" not in message


# ---- configure and disable ----------------------------------------------------------------


def test_configure_writes_the_settings_and_keeps_the_credential_out_of_the_output(
    files, monkeypatch, capsys
):
    env, key = files
    code = configure(
        monkeypatch,
        files,
        "--tts-model",
        "kokoro",
        "--voice",
        "alloy",
        "--timeout",
        "1.50",
        "--key-stdin",
        stdin=SYNTHETIC.encode() + b"\r\n",
    )
    assert code == 0
    out = capsys.readouterr().out
    assert SYNTHETIC not in out
    status = json.loads(out)
    assert status["configured"] is True and status["credentialConfigured"] is True
    assert key.read_bytes() == SYNTHETIC.encode()
    text = env.read_text(encoding="utf-8")
    assert text.startswith(
        "PI_ADMIN_KEY=synthetic\n\nPI_SPEECH_URL=https://speech.example.test/v1\n"
    )
    assert "PI_SPEECH_TIMEOUT_S=1.5\n" in text
    assert "PI_TTS_VOICE=alloy\n" in text


def test_configure_keeps_the_saved_credential_unless_told_otherwise(files, monkeypatch, capsys):
    files[1].write_bytes(SYNTHETIC.encode())
    assert configure(monkeypatch, files) == 0
    assert files[1].read_bytes() == SYNTHETIC.encode()
    assert "PI_SPEECH_TIMEOUT_S=30\n" in files[0].read_text(encoding="utf-8")
    assert json.loads(capsys.readouterr().out)["credentialConfigured"] is True


def test_configure_can_clear_the_saved_credential(files, monkeypatch, capsys):
    files[1].write_bytes(SYNTHETIC.encode())
    assert configure(monkeypatch, files, "--clear-key") == 0
    assert files[1].read_bytes() == b""
    assert json.loads(capsys.readouterr().out)["credentialConfigured"] is False


def test_disable_turns_speech_off_and_removes_the_credential(files, monkeypatch, capsys):
    assert configure(monkeypatch, files, "--key-stdin", stdin=SYNTHETIC.encode()) == 0
    capsys.readouterr()
    assert cli(monkeypatch, *files, "disable") == 0
    status = json.loads(capsys.readouterr().out)
    assert status["configured"] is False
    assert status["credentialConfigured"] is False
    assert status["characterVoice"] == "unsupported"
    assert files[1].read_bytes() == b""
    assert "PI_SPEECH_URL=\n" in files[0].read_text(encoding="utf-8")


def test_disable_refuses_a_bad_credential_file_and_changes_nothing(files, monkeypatch, capsys):
    files[1].write_bytes(b"has space")
    before = files[0].read_text(encoding="utf-8")
    assert cli(monkeypatch, *files, "disable") == 1
    assert refusal(capsys) == "Speech credential must be one printable ASCII token without spaces."
    assert files[0].read_text(encoding="utf-8") == before
