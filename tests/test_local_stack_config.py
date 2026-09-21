import importlib.util
import json
from pathlib import Path


def test_local_configuration_matches_service_bootstrap_contracts_and_is_not_replaced(tmp_path):
    path = Path(__file__).parents[1] / "scripts/local_stack.py"
    spec = importlib.util.spec_from_file_location("local_stack_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.STATE = tmp_path / "state"
    module.CONFIG = module.STATE / "configuration.json"
    module.initialize()
    first = module.CONFIG.read_bytes()
    config = json.loads(first)
    env = config["environments"]
    assert env["pi"]["PI_TOOLGATE_KEY"].startswith("tgx_")
    assert env["memorygate"]["MEMORYGATE_BOOTSTRAP_READ_KEY"].startswith("mg_read_")
    assert len(bytes.fromhex(env["toolgate"]["TOOLGATE_VAULT_SALT"])) == 16
    assert env["pi"]["PI_TOOLGATE_KEY"] == env["toolgate"]["TOOLGATE_BOOTSTRAP_EXECUTION_KEY"]
    assert env["pi"]["PI_MEMORYGATE_READ_KEY"] == env["memorygate"]["MEMORYGATE_BOOTSTRAP_READ_KEY"]
    assert env["pi"]["PI_DECISION_KEY"] == env["decisions"]["DECISION_API_KEY"]
    assert env["toolgate"]["TOOLGATE_BOOTSTRAP_SCOPES"] == ""
    assert env["memorygate"]["DATABASE_URL"].startswith("postgresql+psycopg://")
    assert env["pi"]["PI_MEMORY_RERANK_ENABLED"] == "false"
    module.initialize()
    assert module.CONFIG.read_bytes() == first
