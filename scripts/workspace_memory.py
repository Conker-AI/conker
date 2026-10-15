"""Prepare a dedicated local owner correction link without widening runtime grants."""

import copy
import json
import os
import re
import secrets
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

FIELDS = {
    "memorygate": ("MEMORYGATE_CORRECTION_KEY", "MEMORYGATE_CORRECTION_AGENT_ID"),
    "pi": (
        "PI_MEMORY_CORRECTION_URL",
        "PI_MEMORY_CORRECTION_KEY",
        "PI_MEMORY_CORRECTION_AGENT_ID",
    ),
}


def _environment(config):
    envs = config.get("environments")
    if not isinstance(envs, dict) or any(
        not isinstance(envs.get(name), dict) for name in FIELDS
    ):
        raise ValueError("Local MemoryGate and Pi environments are required.")
    return envs


def _origin(value, port):
    if not isinstance(value, str):
        raise TypeError(
            "Memory correction setup needs the configured local MemoryGate endpoint."
        )
    try:
        url = urlsplit(value)
        valid = (
            url.scheme == "http"
            and url.hostname in {"127.0.0.1", "localhost"}
            and url.port == port
            and url.path in {"", "/"}
            and not url.username
            and not url.password
            and not url.query
            and not url.fragment
            and not any(
                character.isspace() or ord(character) < 32 for character in value
            )
        )
    except ValueError:
        valid = False
    if not valid:
        raise ValueError(
            "Memory correction setup needs the configured local MemoryGate endpoint."
        )
    return url.scheme, url.hostname, url.port


def _context(config, envs):
    ports = config.get("ports", {})
    if not isinstance(ports, dict):
        raise TypeError("Local MemoryGate port configuration needs review.")
    port = ports.get("memorygate", 8020)
    if type(port) is not int or not 1024 < port <= 65535:
        raise ValueError("Local MemoryGate port configuration needs review.")
    agent = envs["pi"].get("PI_MEMORYGATE_AGENT_ID")
    if (
        not isinstance(agent, str)
        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", agent)
        or agent != envs["memorygate"].get("MEMORYGATE_CONVERSATION_AGENT_ID")
    ):
        raise ValueError(
            "Pi and local MemoryGate companion namespaces must already match."
        )
    url = envs["pi"].get("PI_MEMORYGATE_URL")
    _origin(url, port)
    return agent, url, port


def _other_strings(config):
    """Exclude only the two new key slots; never reuse any other saved credential."""
    remaining = copy.deepcopy(config)
    for name, key in (
        ("pi", "PI_MEMORY_CORRECTION_KEY"),
        ("memorygate", "MEMORYGATE_CORRECTION_KEY"),
    ):
        remaining.get("environments", {}).get(name, {}).pop(key, None)

    def strings(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, dict):
            for item in value.values():
                yield from strings(item)
        elif isinstance(value, list):
            for item in value:
                yield from strings(item)

    return set(strings(remaining))


def _validate(config, envs, agent, url, port):
    pi, memory = envs["pi"], envs["memorygate"]
    key = pi.get("PI_MEMORY_CORRECTION_KEY")
    if (
        not isinstance(key, str)
        or not 32 <= len(key) <= 512
        or not all(33 <= ord(character) <= 126 for character in key)
        or key != memory.get("MEMORYGATE_CORRECTION_KEY")
        or key in _other_strings(config)
        or pi.get("PI_MEMORY_CORRECTION_AGENT_ID") != agent
        or memory.get("MEMORYGATE_CORRECTION_AGENT_ID") != agent
        or _origin(pi.get("PI_MEMORY_CORRECTION_URL"), port) != _origin(url, port)
    ):
        raise ValueError(
            "Existing memory correction credentials or scope need review; nothing replaced."
        )


def prepare(config):
    """Return an independent config and changed flag. Existing choices are never replaced."""
    envs = _environment(config)
    agent, url, port = _context(config, envs)
    presence = [
        field in envs[name] for name, fields in FIELDS.items() for field in fields
    ]
    if any(presence):
        if not all(presence):
            raise ValueError(
                "Partial memory correction configuration needs review; nothing replaced."
            )
        _validate(config, envs, agent, url, port)
        return copy.deepcopy(config), False
    forbidden = _other_strings(config)
    for _ in range(10):
        key = "mg_correction_" + secrets.token_urlsafe(36)
        if key not in forbidden:
            break
    else:
        raise ValueError("Could not create a distinct memory correction credential.")
    result = copy.deepcopy(config)
    result["environments"]["memorygate"].update(
        MEMORYGATE_CORRECTION_KEY=key,
        MEMORYGATE_CORRECTION_AGENT_ID=agent,
    )
    result["environments"]["pi"].update(
        PI_MEMORY_CORRECTION_URL=url,
        PI_MEMORY_CORRECTION_KEY=key,
        PI_MEMORY_CORRECTION_AGENT_ID=agent,
    )
    _validate(result, result["environments"], agent, url, port)
    return result, True


def status(config):
    """Configuration evidence only: never claim running services accepted the key."""
    try:
        envs = _environment(config)
        present = [
            field in envs[name] for name, fields in FIELDS.items() for field in fields
        ]
        if not any(present):
            return "not configured"
        if not all(present):
            return "configuration needs review"
        _validate(config, envs, *_context(config, envs))
    except (ValueError, TypeError, AttributeError):
        return "configuration needs review"
    return "configured; running capability not verified"


def require_sources(config):
    repositories = config.get("repositories", {})
    if not isinstance(repositories, dict):
        raise TypeError("Local service source configuration needs review.")
    for repository, relative in (
        ("pi", "pi/memory/corrections.py"),
        ("memorygate", "services/api/app/routes/corrections.py"),
    ):
        root = repositories.get(repository)
        if not isinstance(root, str) or not (Path(root) / relative).is_file():
            raise ValueError(
                "Upgrade the local Pi and MemoryGate correction sources before configuring them."
            )


def write_config(path, config, original):
    """Atomic replacement: never persist one side's new credential alone."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=path.name + ".tmp.",
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            json.dump(config, stream, indent=2, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        if path.read_bytes() != original:
            raise ValueError(
                "Workspace configuration changed; reload before preparing memory corrections."
            )
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
