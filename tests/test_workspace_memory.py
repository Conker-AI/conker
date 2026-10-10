"""Local correction provisioning is explicit, private and independent of execution grants."""

import copy
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import local_stack
import workspace
import workspace_memory as memory
import workspace_setup as setup


def config():
    return {
        "workspace_schema": 1,
        "ports": {"memorygate": 18520, "pi": 18551},
        "native_providers": {
            "control_key": "private-provider-key-retained-123456",
            "settings": {"keep": True},
        },
        "environments": {
            "pi": {
                "PI_MEMORYGATE_URL": "http://127.0.0.1:18520",
                "PI_MEMORYGATE_AGENT_ID": "local_companion",
                "PI_ADMIN_KEY": "private-pi-admin-key-retained-123456",
                "PI_MODEL": "custom-answer",
                "PI_MEMORYGATE_INGEST_KEY": "private-ingest-key-retained-123456",
                "PI_MEMORYGATE_READ_KEY": "private-read-key-retained-123456",
            },
            "memorygate": {
                "MEMORYGATE_CONVERSATION_AGENT_ID": "local_companion",
                "MEMORYGATE_CONVERSATION_KEY": "private-ingest-key-retained-123456",
                "MEMORYGATE_ADMIN_KEY": "private-memory-admin-retained-123456",
                "MEMORYGATE_BOOTSTRAP_READ_KEY": "private-read-key-retained-123456",
            },
            "toolgate": {"TOOLGATE_BOOTSTRAP_SCOPES": "existing-owner-selected-scope"},
            "gateway": {
                "GATEWAY_TOOLGATE_OWNER_KEY": "private-owner-key-retained-123456"
            },
        },
    }


def remove_correction_fields(value):
    result = copy.deepcopy(value)
    for name, fields in memory.FIELDS.items():
        for field in fields:
            result["environments"][name].pop(field, None)
    return result


def test_preparation_adds_only_five_fields_and_distinct_scoped_secret():
    original = config()
    before = copy.deepcopy(original)
    prepared, changed = memory.prepare(original)
    assert (
        changed and original == before and remove_correction_fields(prepared) == before
    )
    pi, gate = prepared["environments"]["pi"], prepared["environments"]["memorygate"]
    assert pi["PI_MEMORY_CORRECTION_KEY"] == gate["MEMORYGATE_CORRECTION_KEY"]
    assert len(pi["PI_MEMORY_CORRECTION_KEY"]) >= 32
    assert pi["PI_MEMORY_CORRECTION_KEY"] not in memory._other_strings(original)
    assert (
        pi["PI_MEMORY_CORRECTION_AGENT_ID"]
        == gate["MEMORYGATE_CORRECTION_AGENT_ID"]
        == "local_companion"
    )
    assert pi["PI_MEMORY_CORRECTION_URL"] == pi["PI_MEMORYGATE_URL"]
    assert memory.status(prepared) == "configured; running capability not verified"


def test_existing_complete_configuration_is_preserved_without_rotating_anything(
    monkeypatch,
):
    prepared, _ = memory.prepare(config())
    monkeypatch.setattr(
        memory.secrets,
        "token_urlsafe",
        lambda *a: pytest.fail("Never rotate an existing key"),
    )
    after, changed = memory.prepare(prepared)
    assert after == prepared and not changed


@pytest.mark.parametrize(
    "service,field,value",
    [
        ("pi", "PI_MEMORY_CORRECTION_KEY", "owner-existing-key-1234567890123456"),
        ("pi", "PI_MEMORY_CORRECTION_KEY", ""),
        ("memorygate", "MEMORYGATE_CORRECTION_AGENT_ID", "other_namespace"),
    ],
)
def test_partial_configuration_is_not_guessed_or_overwritten(service, field, value):
    original = config()
    original["environments"][service][field] = value
    before = copy.deepcopy(original)
    with pytest.raises(ValueError, match="Partial"):
        memory.prepare(original)
    assert (
        original == before and memory.status(original) == "configuration needs review"
    )


@pytest.mark.parametrize(
    "service,field,value",
    [
        ("pi", "PI_MEMORY_CORRECTION_AGENT_ID", "other_namespace"),
        ("memorygate", "MEMORYGATE_CORRECTION_AGENT_ID", "other_namespace"),
        ("pi", "PI_MEMORY_CORRECTION_KEY", "short"),
        ("pi", "PI_MEMORY_CORRECTION_URL", "http://127.0.0.1:1"),
        ("pi", "PI_MEMORY_CORRECTION_URL", "https://outside.example"),
    ],
)
def test_mismatched_existing_configuration_is_preserved_and_readiness_is_not_ready(
    service, field, value
):
    original, _ = memory.prepare(config())
    original["environments"][service][field] = value
    before = copy.deepcopy(original)
    with pytest.raises(ValueError):
        memory.prepare(original)
    assert (
        original == before and memory.status(original) == "configuration needs review"
    )


@pytest.mark.parametrize(
    "value",
    [
        "http://remote.example:18520",
        "http://127.0.0.1:18520/other",
        "http://secret@127.0.0.1:18520",
        "http://127.0.0.1:18520?key=secret",
        "http://127.0.0.1:8020",
        "https://127.0.0.1:18520",
        "http://127.0.0.1:18520#fragment",
    ],
)
def test_no_credential_is_minted_for_foreign_or_ambiguous_memory_target(
    value, monkeypatch
):
    original = config()
    original["environments"]["pi"]["PI_MEMORYGATE_URL"] = value
    monkeypatch.setattr(
        memory.secrets,
        "token_urlsafe",
        lambda *a: pytest.fail("Validate destination before minting"),
    )
    with pytest.raises(ValueError, match="local MemoryGate endpoint"):
        memory.prepare(original)


def test_namespace_mismatch_is_rejected_without_widening_scope():
    original = config()
    original["environments"]["memorygate"]["MEMORYGATE_CONVERSATION_AGENT_ID"] = (
        "other_namespace"
    )
    with pytest.raises(ValueError, match="namespaces"):
        memory.prepare(original)
    assert original["environments"]["pi"]["PI_MEMORYGATE_AGENT_ID"] == "local_companion"


@pytest.mark.parametrize(
    "service,field",
    [
        ("pi", "PI_ADMIN_KEY"),
        ("pi", "PI_MEMORYGATE_READ_KEY"),
        ("memorygate", "MEMORYGATE_CONVERSATION_KEY"),
        ("gateway", "GATEWAY_TOOLGATE_OWNER_KEY"),
    ],
)
def test_existing_key_reuse_is_not_accepted_as_dedicated_capability(service, field):
    original, _ = memory.prepare(config())
    reused = original["environments"][service][field]
    original["environments"]["pi"]["PI_MEMORY_CORRECTION_KEY"] = reused
    original["environments"]["memorygate"]["MEMORYGATE_CORRECTION_KEY"] = reused
    with pytest.raises(ValueError, match="credentials or scope"):
        memory.prepare(original)


def sources(tmp_path, value):
    repositories = {}
    for name, relative in (
        ("pi", "pi/memory_corrections.py"),
        ("memorygate", "services/api/app/routes/corrections.py"),
    ):
        root = tmp_path / name
        source = root / relative
        source.parent.mkdir(parents=True)
        source.write_text("# isolated capability marker", encoding="utf-8")
        repositories[name] = str(root)
    value["repositories"] = repositories
    return value


def test_targeted_command_updates_only_stopped_config_atomically_and_never_prints_secret(
    tmp_path, monkeypatch, capsys
):
    value = sources(tmp_path, config())
    path = tmp_path / "configuration.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    monkeypatch.setattr(setup, "CONFIG", path)
    checked = []
    monkeypatch.setattr(
        setup, "owned_listener", lambda _config, name: checked.append(name) or False
    )
    monkeypatch.setattr(
        setup, "run", lambda *a, **k: pytest.fail("No installation or model calls")
    )
    setup.configure_memory_corrections(value)
    prepared = json.loads(path.read_text(encoding="utf-8"))
    assert checked == ["pi", "memorygate"]
    assert remove_correction_fields(prepared) == value
    secret = prepared["environments"]["pi"]["PI_MEMORY_CORRECTION_KEY"]
    assert secret not in capsys.readouterr().out
    original_bytes = path.read_bytes()
    setup.configure_memory_corrections(prepared)
    assert path.read_bytes() == original_bytes
    assert not list(tmp_path.glob("configuration.json.tmp.*"))


@pytest.mark.parametrize("running", ["pi", "memorygate"])
def test_targeted_command_refuses_running_services_before_writes(
    tmp_path, monkeypatch, running
):
    path = tmp_path / "configuration.json"
    path.write_text("unchanged", encoding="utf-8")
    monkeypatch.setattr(setup, "CONFIG", path)
    monkeypatch.setattr(setup, "owned_listener", lambda _config, name: name == running)
    with pytest.raises(SystemExit, match="Stop Pi and MemoryGate"):
        setup.configure_memory_corrections(config())
    assert path.read_text() == "unchanged"


def test_stale_or_incomplete_setup_never_overwrites_current_config(
    tmp_path, monkeypatch
):
    value = sources(tmp_path, config())
    path = tmp_path / "configuration.json"
    path.write_text(json.dumps({**value, "changed": True}), encoding="utf-8")
    monkeypatch.setattr(setup, "CONFIG", path)
    monkeypatch.setattr(setup, "owned_listener", lambda *args: False)
    before = path.read_bytes()
    with pytest.raises(SystemExit, match="configuration changed"):
        setup.configure_memory_corrections(value)
    assert path.read_bytes() == before
    with pytest.raises(ValueError, match="configuration changed"):
        memory.write_config(path, value, b"stale")
    assert path.read_bytes() == before and not list(tmp_path.glob("*.tmp.*"))


def test_fresh_local_stack_has_separate_correctly_scoped_link_and_existing_init_is_noop(
    tmp_path, monkeypatch
):
    state = tmp_path / "state"
    monkeypatch.setattr(local_stack, "STATE", state)
    monkeypatch.setattr(local_stack, "CONFIG", state / "configuration.json")
    local_stack.initialize()
    raw = local_stack.CONFIG.read_bytes()
    fresh = json.loads(raw)
    assert memory.status(fresh) == "configured; running capability not verified"
    assert fresh["environments"]["toolgate"]["TOOLGATE_BOOTSTRAP_SCOPES"] == ""
    local_stack.initialize()
    assert local_stack.CONFIG.read_bytes() == raw


def test_workspace_command_dispatches_narrow_repair_without_other_work(monkeypatch):
    value = config()
    calls = []
    monkeypatch.setattr(workspace, "read_config", lambda: value)
    monkeypatch.setattr(
        setup, "configure_memory_corrections", lambda config: calls.append(config)
    )
    monkeypatch.setattr(sys, "argv", ["workspace.py", "memory-corrections"])
    workspace.main()
    assert calls == [value]


def test_failed_atomic_replace_keeps_original_config_and_removes_temporary_file(
    tmp_path, monkeypatch
):
    path = tmp_path / "configuration.json"
    original = json.dumps(config()).encode()
    path.write_bytes(original)
    prepared, _ = memory.prepare(config())

    def failed(*args):
        raise OSError("synthetic replace failure")

    monkeypatch.setattr(memory.os, "replace", failed)
    with pytest.raises(OSError, match="replace failure"):
        memory.write_config(path, prepared, original)
    assert path.read_bytes() == original
    assert not list(tmp_path.glob("*.tmp.*"))


def test_missing_correction_sources_does_not_mint_or_write_credentials(
    tmp_path, monkeypatch
):
    value = config()
    value["repositories"] = {"pi": str(tmp_path), "memorygate": str(tmp_path)}
    path = tmp_path / "configuration.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    original = path.read_bytes()
    monkeypatch.setattr(setup, "CONFIG", path)
    monkeypatch.setattr(setup, "owned_listener", lambda *args: False)
    monkeypatch.setattr(
        memory.secrets,
        "token_urlsafe",
        lambda *a: pytest.fail("Missing capability must be checked first"),
    )
    with pytest.raises(SystemExit, match="Upgrade the local"):
        setup.configure_memory_corrections(value)
    assert path.read_bytes() == original


def test_enhancement_validates_existing_partial_link_before_any_source_or_dependency_work(
    monkeypatch,
):
    value = config()
    value["environments"]["pi"]["PI_MEMORY_CORRECTION_KEY"] = (
        "saved-existing-private-key-123456789"
    )
    before = copy.deepcopy(value)
    monkeypatch.setattr(setup, "owned_listener", lambda *args: False)
    monkeypatch.setattr(
        setup,
        "run",
        lambda *a, **k: pytest.fail("Preflight before dependency installation"),
    )
    with pytest.raises(SystemExit, match="Partial memory correction"):
        setup.enhance(value, None)
    assert value == before


def test_status_does_not_claim_live_readiness_or_generate_credentials(monkeypatch):
    value = config()
    monkeypatch.setattr(
        memory.secrets, "token_urlsafe", lambda *a: pytest.fail("Read-only status")
    )
    assert memory.status(value) == "not configured"
    monkeypatch.setattr(workspace, "read_config", lambda: value)
    monkeypatch.setattr(workspace, "owned_listener", lambda *args: False)
    monkeypatch.setattr(sys, "argv", ["workspace.py", "status"])
    workspace.main()


@pytest.mark.parametrize("service", ["pi", "memorygate"])
def test_custom_service_ports_are_refused_before_minting_or_writing(
    tmp_path, monkeypatch, service
):
    value = config()
    value["ports"][service] += 1
    if service == "memorygate":
        value["environments"]["pi"]["PI_MEMORYGATE_URL"] = "http://127.0.0.1:18521"
    path = tmp_path / "configuration.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    before = path.read_bytes()
    monkeypatch.setattr(setup, "CONFIG", path)
    monkeypatch.setattr(setup, "owned_listener", lambda *args: False)
    monkeypatch.setattr(
        memory.secrets,
        "token_urlsafe",
        lambda *args: pytest.fail("Do not mint for unchecked service ports"),
    )
    with pytest.raises(SystemExit, match="ownership checks"):
        setup.configure_memory_corrections(value)
    with pytest.raises(SystemExit, match="ownership checks"):
        setup.enhance(value, None)
    assert path.read_bytes() == before


def test_collision_with_any_existing_credential_is_retried_without_reusing_it(
    monkeypatch,
):
    value = config()
    collision = "c" * 48
    value["native_providers"]["control_key"] = "mg_correction_" + collision
    tokens = iter([collision, "d" * 48])
    monkeypatch.setattr(memory.secrets, "token_urlsafe", lambda *args: next(tokens))
    prepared, _ = memory.prepare(value)
    assert (
        prepared["environments"]["pi"]["PI_MEMORY_CORRECTION_KEY"]
        == "mg_correction_" + "d" * 48
    )
