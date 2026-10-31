import hashlib
import importlib.util
import json
import os
import stat
from pathlib import Path

import pytest


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
    assert "PI_MEMORY_RERANK_ENABLED" not in env["pi"]  # ranking is opt-in via the model catalogue
    owner = env["gateway"]["GATEWAY_PI_OWNER_KEY"]
    assert env["pi"]["PI_OWNER_KEY_SHA256"] == hashlib.sha256(owner.encode()).hexdigest()
    assert owner not in {env["pi"]["PI_ADMIN_KEY"], env["gateway"]["PI_GATEWAY_KEY"], env["gateway"]["GATEWAY_TOOLGATE_OWNER_KEY"]}
    module.initialize()
    assert module.CONFIG.read_bytes() == first


def load(name):
    path = Path(__file__).parents[1] / "scripts/local_stack.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_command_runs_with_an_owner_only_umask(monkeypatch, capsys):
    module = load("local_stack_umask")
    masks = []
    monkeypatch.setattr(module.os, "umask", lambda mask: masks.append(mask) or 0o022)
    monkeypatch.setattr(module, "listening", lambda port: False)
    monkeypatch.setattr(module.sys, "argv", ["local_stack.py", "status"])
    module.main()
    assert masks == [0o077]
    assert "closed" in capsys.readouterr().out


@pytest.mark.skipif(os.name != "posix", reason="file modes are POSIX only")
def test_a_key_file_is_owner_only_even_when_it_already_existed(tmp_path):
    module = load("local_stack_private")
    path = tmp_path / "environment"
    path.write_text("old\n", encoding="utf-8")
    path.chmod(0o644)
    module.write_private(path, "SYNTHETIC_KEY=x\n")
    assert path.read_text(encoding="utf-8") == "SYNTHETIC_KEY=x\n"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
