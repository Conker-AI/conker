"""conker models --role ROLE --model ID [--backup ID]...|--off: point one model role at one model,
with backups tried in order when it fails, or switch it off.

The rest of the configuration is kept exactly as saved; Pi validates the result and refuses a
model that is not in the catalogue or a change made after this command read the settings.
"""

from __future__ import annotations

PATH = "/models/configuration"


def set_role(request, config, role: str, model: str | None, backups: list[str] = ()) -> dict:
    saved = request(config, "pi", PATH)
    configuration = saved.get("configuration")
    if configuration is None:
        raise ValueError("Choose a talking model first; there are no model settings yet.")
    roles = configuration["roleSettings"]["roles"]
    if role not in roles:
        raise ValueError(f"No model role called {role}. Roles: {', '.join(sorted(roles))}.")
    catalogue = {item["id"] for item in configuration["models"]}
    for name in ([] if model is None else [model, *backups]):
        if name not in catalogue:
            raise ValueError(f"No model called {name} in the catalogue; conker models lists them.")
    current = roles[role]
    roles[role] = (
        {**current, "enabled": False}
        if model is None
        else {
            **current,
            "enabled": True,
            "eligibleModelIds": [model, *backups],
            "modelId": model,
            "failure": "fallback" if backups else "stop",
            "fallbackModelIds": list(backups),
        }
    )
    return request(
        config,
        "pi",
        PATH,
        {"expected_revision": saved["revision"], "configuration": configuration},
    )
