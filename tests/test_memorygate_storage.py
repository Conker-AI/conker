"""MemoryGate credentials must survive container replacement."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_runtime_key_lives_in_a_persistent_service_volume():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    start = compose.index("  memorygate:\n")
    end = compose.index("\n  postgres:\n", start)
    service = compose[start:end]

    assert "- memorygate_data:/data" in service
    assert "- ${CONKER_BACKUP_DIR}/memorygate:/data/backups" in service
    assert "  memorygate_data:\n" in compose
    assert "/data/runtime-fernet.key:" not in service


def test_recovery_does_not_exempt_an_unmanaged_runtime_key_mount():
    recovery = (ROOT / "scripts" / "recovery.py").read_text(encoding="utf-8")

    assert '"memorygate": {"/data/runtime-fernet.key"}' not in recovery
    assert "MemoryGate runtime key persistence needs migration" not in recovery
