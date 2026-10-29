"""Installer keys: always the length the services demand, and a short one from an older install
is replaced. Split from test_installer.py, whose fixtures these use."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess

from tests.test_installer import (  # noqa: F401
    ROOT,
    env_values,
    install,
    needs_docker,
    pytestmark,
)


def test_generated_secrets_are_always_32_characters():
    """Base64 of 24 bytes is exactly 32 characters, and dropping '+', '/' and
    '=' made most keys shorter; the gateway refuses any key under 32 and
    stopped a fresh install from starting."""
    script = (
        re.search(r"^random_secret\(\) \{.*?^\}\n", (ROOT / "install.sh").read_text(), re.MULTILINE | re.DOTALL)[0]
        + 'for _ in $(seq 200); do s=$(random_secret); [ "${#s}" -eq 32 ] || { echo "short:${#s}"; exit 1; }; done'
    )
    proc = subprocess.run(["bash", "-c", script], capture_output=True, text=True, check=False)
    assert proc.returncode == 0, proc.stdout + proc.stderr


@needs_docker
def test_a_short_gateway_key_from_an_older_install_is_replaced(install):  # noqa: F811 - fixture
    """The two keys the gateway shares with Pi must be 32 characters or the
    gateway will not start. They protect no stored data, so a short one from an
    older installer is replaced, and its SHA256 follows."""
    install("--yes", "--dry-run")
    values = env_values(install.env_file)
    body = install.env_file.read_text()
    install.env_file.write_text(
        body.replace(f"PI_GATEWAY_KEY={values['PI_GATEWAY_KEY']}", "PI_GATEWAY_KEY=only31charactersxxxxxxxxxxxxxxx")
        .replace(f"GATEWAY_PI_OWNER_KEY={values['GATEWAY_PI_OWNER_KEY']}", "GATEWAY_PI_OWNER_KEY=short")
    )

    install("--yes", "--dry-run")
    after = env_values(install.env_file)

    for name in ("PI_GATEWAY_KEY", "GATEWAY_PI_OWNER_KEY"):
        assert len(after[name]) >= 32, name
    assert after["PI_GATEWAY_KEY_SHA256"] == hashlib.sha256(after["PI_GATEWAY_KEY"].encode()).hexdigest()
    assert after["PI_OWNER_KEY_SHA256"] == hashlib.sha256(after["GATEWAY_PI_OWNER_KEY"].encode()).hexdigest()
    # Keys that protect stored data are kept exactly.
    assert after["MEMORYGATE_DB_PASSWORD"] == values["MEMORYGATE_DB_PASSWORD"]
    assert after["TOOLGATE_VAULT_SALT"] == values["TOOLGATE_VAULT_SALT"]


@needs_docker
def test_memorygate_and_toolgate_get_their_own_pi_keys_and_pi_the_hashes(install):  # noqa: F811
    """Contract C1: each service asks Pi for model text with its own key; Pi holds only the
    hashes. A key from an older install is kept, a short one made again, and an install from
    before them gets them on the next run without any other key changing."""
    install("--yes", "--dry-run")
    values = env_values(install.env_file)
    memorygate, toolgate = values["MEMORYGATE_PI_SERVICE_KEY"], values["TOOLGATE_PI_SERVICE_KEY"]
    assert min(len(memorygate), len(toolgate)) >= 32 and memorygate != toolgate
    assert json.loads(values["PI_SERVICE_KEYS_SHA256"]) == {
        "memorygate": hashlib.sha256(memorygate.encode()).hexdigest(),
        "toolgate": hashlib.sha256(toolgate.encode()).hexdigest(),
    }

    older = "".join(
        line + "\n"
        for line in install.env_file.read_text().splitlines()
        if not line.startswith(("MEMORYGATE_PI_SERVICE_KEY=", "PI_SERVICE_KEYS_SHA256="))
    ).replace(f"TOOLGATE_PI_SERVICE_KEY={toolgate}", "TOOLGATE_PI_SERVICE_KEY=short")
    install.env_file.write_text(older)
    install("--yes", "--dry-run")
    after = env_values(install.env_file)

    assert len(after["MEMORYGATE_PI_SERVICE_KEY"]) >= 32
    assert len(after["TOOLGATE_PI_SERVICE_KEY"]) >= 32
    assert json.loads(after["PI_SERVICE_KEYS_SHA256"])["toolgate"] == hashlib.sha256(
        after["TOOLGATE_PI_SERVICE_KEY"].encode()
    ).hexdigest()
    for name in ("MEMORYGATE_DB_PASSWORD", "TOOLGATE_VAULT_SALT", "CONKER_ADMIN_KEY", "PI_TOOLGATE_KEY"):
        assert after[name] == values[name]
    install("--yes", "--dry-run")
    assert env_values(install.env_file)["TOOLGATE_PI_SERVICE_KEY"] == after["TOOLGATE_PI_SERVICE_KEY"]
