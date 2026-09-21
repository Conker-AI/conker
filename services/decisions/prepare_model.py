"""Explicit download step, outside serving. No private inputs or inference."""
from huggingface_hub import snapshot_download

REPOSITORY = "convaiinnovations/laya"
REVISION = "1c5edc17a7acd8701df6fc341c0d179f1c62c982"

if __name__ == "__main__":
    print(snapshot_download(REPOSITORY, revision=REVISION, allow_patterns=[
        "rl_agent_config.json", "model.safetensors", "tokenizer/*", "encoder/*",
    ]))
