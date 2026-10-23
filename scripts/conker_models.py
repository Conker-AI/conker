"""conker models --role ROLE --model ID|--off: point one model role at one model, or switch it off.

The rest of the configuration is kept exactly as saved; Pi validates the result and refuses a
model that is not in the catalogue or a change made after this command read the settings.
"""

from __future__ import annotations

PATH = "/models/configuration"


def set_role(request, config, role: str, model: str | None) -> dict:
    saved = request(config, "pi", PATH)
    configuration = saved.get("configuration")
    if configuration is None:
        raise ValueError("Choose a talking model first; there are no model settings yet.")
    roles = configuration["roleSettings"]["roles"]
    if role not in roles:
        raise ValueError(f"No model role called {role}. Roles: {', '.join(sorted(roles))}.")
    if model is not None and model not in {item["id"] for item in configuration["models"]}:
        raise ValueError(f"No model called {model} in the catalogue; conker models lists them.")
    current = roles[role]
    roles[role] = (
        {**current, "enabled": False}
        if model is None
        else {
            **current,
            "enabled": True,
            "eligibleModelIds": [model],
            "modelId": model,
            "fallbackModelId": None,
        }
    )
    return request(
        config,
        "pi",
        PATH,
        {"expected_revision": saved["revision"], "configuration": configuration},
    )
