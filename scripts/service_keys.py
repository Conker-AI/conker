"""Keys MemoryGate and ToolGate use to ask Pi for model text (contract C1, `POST /inference`).

Each service gets its own plaintext key; Pi gets only their SHA256 hashes, as one JSON object in
`PI_SERVICE_KEYS_SHA256`. These keys protect no stored data, so a missing or short one is made
again. The repository installer does the same in shell (install.sh, `write_env`).
"""

from __future__ import annotations

import hashlib
import json
import secrets

# Service name in PI_SERVICE_KEYS_SHA256 -> its environment prefix.
SERVICES = {"memorygate": "MEMORYGATE", "toolgate": "TOOLGATE"}
MINIMUM = 32


def new_key() -> str:
    return secrets.token_urlsafe(36)


def usable(value: object) -> bool:
    return isinstance(value, str) and len(value) >= MINIMUM and value.isprintable()


def digests(keys: dict[str, str]) -> str:
    """PI_SERVICE_KEYS_SHA256: each service's key hash, compact and in a fixed order."""
    return json.dumps(
        {name: hashlib.sha256(keys[name].encode()).hexdigest() for name in SERVICES},
        separators=(",", ":"),
        sort_keys=True,
    )


def environments(pi_url: str, keys: dict[str, str]) -> dict[str, dict[str, str]]:
    """The settings each service gets: the plaintext to the caller, the hashes to Pi."""
    values = {
        name: {f"{prefix}_PI_URL": pi_url, f"{prefix}_PI_SERVICE_KEY": keys[name]}
        for name, prefix in SERVICES.items()
    }
    values["pi"] = {"PI_SERVICE_KEYS_SHA256": digests(keys)}
    return values


def ensure(config: dict, pi_url: str) -> bool:
    """Give a workspace configuration its service keys; keeps usable ones. True when it changed.

    A configuration without Pi, MemoryGate and ToolGate environments is left alone."""
    envs = config.get("environments")
    if not isinstance(envs, dict) or any(
        not isinstance(envs.get(name), dict) for name in ("pi", *SERVICES)
    ):
        return False
    keys, changed = {}, False
    for name, prefix in SERVICES.items():
        current = envs[name].get(f"{prefix}_PI_SERVICE_KEY")
        keys[name] = current if usable(current) else new_key()
        changed = changed or keys[name] != current
    for name, values in environments(pi_url, keys).items():
        for key, value in values.items():
            if envs[name].get(key) != value:
                envs[name][key] = value
                changed = True
    return changed
