"""Initialize local model roles from the installation choice and actual inventory."""

import json
import sys
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener

from workspace import read_config


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def installed_models(url):
    """Inspect local Ollama; an inventory is not an inference test."""
    parsed = urlsplit(url)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError(
            "Model initialization requires the configured loopback Ollama URL."
        )
    opener = build_opener(ProxyHandler({}), NoRedirect())
    with opener.open(url.rstrip("/") + "/api/tags", timeout=5) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("Local model inventory is too large.")
    value = json.loads(raw)
    rows = value.get("models") if isinstance(value, dict) else None
    if not isinstance(rows, list) or len(rows) > 1000:
        raise ValueError("Local model inventory is invalid.")
    return {
        row["name"]
        for row in rows
        if isinstance(row, dict)
        and isinstance(row.get("name"), str)
        and 0 < len(row["name"]) <= 300
    }


def configuration_for(model, installed, roles):
    if not isinstance(model, str) or not model.strip() or len(model) > 300:
        raise ValueError("The installation needs a valid local model route.")

    def present(route):
        return route in installed or (
            ":" not in route and route + ":latest" in installed
        )

    primary_available = present(model)
    models = [
        {
            "id": "local-answer",
            "providerId": "ollama",
            "name": model,
            "route": model,
            "enabled": primary_available,
            "routingDescription": "The owner's selected local model for everyday conversation and tasks.",
        }
    ]
    # Do not adopt unrelated local models or replace the installation choice.
    if primary_available and model != "qwen3:4b" and present("qwen3:4b"):
        models.append(
            {
                "id": "local-thinking",
                "providerId": "ollama",
                "name": "Qwen 3 · analysis",
                "route": "qwen3:4b",
                "enabled": True,
                "routingDescription": "Complex reasoning, code, multi-step planning and analytical comparison.",
            }
        )
    answer_ids = [entry["id"] for entry in models if entry["enabled"]]
    models.append(
        {
            "id": "laya-router",
            "providerId": "decisions",
            "name": "Laya · automatic selection",
            "route": "model-routing",
            "enabled": primary_available,
            "routingDescription": "Selects a talking model; does not write answers.",
        }
    )
    assignments = {
        role: {
            "enabled": False,
            "eligibleModelIds": [],
            "modelId": None,
            "timeoutMs": 120000,
            "failure": "stop",
            "fallbackModelIds": [],
        }
        for role in roles
    }
    if primary_available:
        for role in ("answer", "summarization"):
            assignments[role].update(
                enabled=True,
                eligibleModelIds=answer_ids if role == "answer" else ["local-answer"],
                modelId="local-answer",
            )
        thinker = "local-thinking" if "local-thinking" in answer_ids else "local-answer"
        # The assignment enables explicit Think requests, not automatic inference.
        assignments["thinking"].update(
            enabled=True, eligibleModelIds=[thinker], modelId=thinker
        )
        assignments["routing"].update(
            enabled=True,
            eligibleModelIds=["laya-router"],
            modelId="laya-router",
            timeoutMs=10000,
        )
    return {
        "providers": [
            {"id": identity, "name": name, "enabled": True}
            for identity, name in (
                ("ollama", "Local Ollama"),
                ("decisions", "Laya"),
                ("chatgpt", "ChatGPT subscription"),
                ("claude-code", "Claude Code subscription"),
            )
        ],
        "models": models,
        "defaultModelId": "local-answer" if primary_available else None,
        "roleSettings": {
            "answerMode": "router" if primary_available else "manual",
            "roles": assignments,
        },
    }


def initialize():
    settings = read_config()
    sys.path.insert(0, settings["repositories"]["pi"])
    from pi.conversation.store import Store
    from pi.models import roles as model_roles

    store = Store(settings["environments"]["pi"]["PI_DB_PATH"])
    try:
        saved = model_roles.load(store)
        if saved["configuration"]:
            print(
                "Existing model choices retained. Review Talking and Thinking in Settings."
            )
            return
        environment = settings["environments"]["pi"]
        try:
            installed = installed_models(environment["PI_OLLAMA_URL"])
        except (OSError, ValueError):
            print(
                "Local model inventory unavailable; model choices were not changed. Start Ollama and rerun workspace_models.py."
            )
            return
        value = configuration_for(environment["PI_MODEL"], installed, model_roles.ROLES)
        model_roles.save(
            store,
            model_roles.Update(
                expected_revision=saved["revision"], configuration=value
            ),
        )
        if value["defaultModelId"]:
            print(
                "Configured the installed talking model, conversation summaries, and thinking on request. Verify inference in Setup."
            )
        else:
            print(
                "The installation's model is not installed. Saved its disabled route; select and verify a model in Setup."
            )
    finally:
        store.close()


if __name__ == "__main__":
    initialize()
