"""Initialize explicit local model roles while this workspace is stopped."""

import sys

from workspace import read_config


def initialize():
    settings = read_config()
    sys.path.insert(0, settings["repositories"]["pi"])
    from pi import model_roles
    from pi.store import Store

    store = Store(settings["environments"]["pi"]["PI_DB_PATH"])
    try:
        saved = model_roles.load(store)
        if saved["configuration"]:
            print(
                "Existing role choices retained. Enable Auto and Thinking in Settings."
            )
            return
        providers = [
            {"id": id, "name": name, "enabled": True}
            for id, name in [
                ("ollama", "Local Ollama"),
                ("decisions", "Laya"),
                ("chatgpt", "ChatGPT subscription"),
                ("claude-code", "Claude Code subscription"),
            ]
        ]
        models = [
            {
                "id": id,
                "providerId": provider,
                "name": name,
                "route": route,
                "enabled": True,
                "routingDescription": description,
            }
            for id, provider, name, route, description in [
                (
                    "local-fast",
                    "ollama",
                    "Qwen 2.5 · fast conversation",
                    "qwen2.5:3b",
                    "Quick conversation, simple questions, short replies, lightweight writing. Prefer for everyday requests.",
                ),
                (
                    "local-thinking",
                    "ollama",
                    "Qwen 3 · analysis",
                    "qwen3:4b",
                    "Complex reasoning, coding, multi-step planning, long context, analytical comparison and difficult problems.",
                ),
                (
                    "laya-router",
                    "decisions",
                    "Laya · automatic selection",
                    "model-routing",
                    "Selects an eligible model for the request. This classifier does not write answers.",
                ),
            ]
        ]
        roles = {
            role: {
                "enabled": False,
                "eligibleModelIds": [],
                "modelId": None,
                "timeoutMs": 120000,
                "failure": "stop",
                "fallbackModelId": None,
            }
            for role in model_roles.ROLES
        }
        roles["answer"].update(
            enabled=True,
            eligibleModelIds=["local-fast", "local-thinking"],
            modelId="local-fast",
            failure="fallback",
            fallbackModelId="local-thinking",
        )
        roles["routing"].update(
            enabled=True,
            eligibleModelIds=["laya-router"],
            modelId="laya-router",
            timeoutMs=10000,
        )
        roles["thinking"].update(
            enabled=True, eligibleModelIds=["local-thinking"], modelId="local-thinking"
        )
        value = {
            "providers": providers,
            "models": models,
            "defaultModelId": "local-fast",
            "roleSettings": {"answerMode": "router", "roles": roles},
        }
        model_roles.save(
            store,
            model_roles.Update(
                expected_revision=saved["revision"], configuration=value
            ),
        )
        print(
            "Configured Auto with Laya, two eligible local models, and a separate background thinker."
        )
    finally:
        store.close()


if __name__ == "__main__":
    initialize()
