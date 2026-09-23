"""Run inside the Pi container once. Existing model choices are never replaced."""
import os
from pi import model_roles
from pi.store import Store

store = Store(os.environ["PI_DB_PATH"])
current = model_roles.load(store)
if current["configuration"] is not None:
    print("Existing model configuration preserved.")
else:
    disabled = dict(enabled=False, eligibleModelIds=[], modelId=None, timeoutMs=3000,
                    failure="stop", fallbackModelId=None)
    roles = {name: dict(disabled) for name in model_roles.ROLES}
    roles["answer"].update(enabled=True, eligibleModelIds=["local-answer"], modelId="local-answer", timeoutMs=120000)
    roles["memory-ranking"].update(enabled=True, eligibleModelIds=["local-ranking"], modelId="local-ranking")
    configuration = dict(
        providers=[dict(id="ollama", name="Local Ollama", enabled=True),
                   dict(id="decisions", name="Local decision service", enabled=True)],
        models=[dict(id="local-answer", providerId="ollama", name="Qwen 2.5 3B", route="qwen2.5:3b", enabled=True),
                dict(id="local-ranking", providerId="decisions", name="Local memory ranking", route="memory-ranking", enabled=True),
                dict(id="local-routing", providerId="decisions", name="Local model routing", route="model-routing", enabled=True)],
        defaultModelId="local-answer", roleSettings=dict(answerMode="manual", roles=roles))
    model_roles.save(store, model_roles.Update(expected_revision=current["revision"], configuration=configuration))
    print("Independent answer and memory-ranking roles initialized. Routing stays off until multiple answer models are available.")
