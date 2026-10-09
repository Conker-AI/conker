"""Reproducible local native authentication, learned routing and model roles."""

import json
import os
import secrets
import shutil
from pathlib import Path

from workspace import CONFIG, PORTS, ROOT, STATE, interpreter, owned_listener, run


def enhance(config, pi_source, toolgate_source=None, memorygate_source=None):
    if any(
        owned_listener(config, service)
        for service in (
            "pi",
            "gateway",
            "toolgate",
            "memorygate",
            "providers",
            "decisions",
        )
    ):
        raise SystemExit(
            "Stop this workspace before changing its runtimes: python scripts/workspace.py down"
        )
    source = (pi_source or Path(config["repositories"]["pi"])).resolve()
    from workspace_patches import apply_bundle

    if pi_source is None:
        apply_bundle(source, "pi")
    if not all(
        (source / filename).is_file()
        for filename in (
            "pi/background_thinking.py",
            "pi/skills.py",
            "gateway/mcp_control.py",
        )
    ):
        raise SystemExit(
            "Select the Conker Pi checkout containing skills and MCP gateway support with --pi-source."
        )
    toolgate = (toolgate_source or Path(config["repositories"]["toolgate"])).resolve()
    if toolgate_source is None:
        apply_bundle(toolgate, "toolgate")
    if not (toolgate / "toolgate/executors/mcp_http.py").is_file():
        raise SystemExit("Select the ToolGate MCP checkout with --toolgate-source.")
    memorygate = (
        memorygate_source or Path(config["repositories"]["memorygate"])
    ).resolve()
    if memorygate_source is None:
        apply_bundle(memorygate, "memorygate")
    if not (memorygate / "services/api/app/services/lexical_retrieval.py").is_file():
        raise SystemExit(
            "Select the MemoryGate recall checkout with --memorygate-source."
        )
    run(config["python"], "-m", "pip", "install", "-r", source / "requirements.txt")
    decisions = STATE / "runtimes/decisions"
    if not interpreter(decisions).exists():
        run(config["python"], "-m", "venv", decisions)
    # Re-run dependency resolution so an interrupted first install is recoverable.
    run(
        interpreter(decisions),
        "-m",
        "pip",
        "install",
        "torch==2.8.0",
        "--index-url",
        "https://download.pytorch.org/whl/cpu",
    )
    run(
        interpreter(decisions),
        "-m",
        "pip",
        "install",
        "-r",
        ROOT / "services/decisions/requirements.txt",
    )
    native = STATE / "native-codex"
    binaries = list(
        native.glob(
            "node_modules/@openai/codex*/**/codex.exe"
            if os.name == "nt"
            else "node_modules/@openai/codex*/**/bin/codex"
        )
    )
    if not binaries:
        run(
            shutil.which("npm.cmd" if os.name == "nt" else "npm"),
            "install",
            "--prefix",
            native,
            "--no-audit",
            "--no-fund",
            "@openai/codex@0.160.1",
        )
        binaries = list(
            native.glob(
                "node_modules/@openai/codex*/**/codex.exe"
                if os.name == "nt"
                else "node_modules/@openai/codex*/**/bin/codex"
            )
        )
    if not binaries:
        raise SystemExit("The pinned Codex executable could not be located.")
    claude = (
        Path(shutil.which("claude.exe"))
        if os.name == "nt" and shutil.which("claude.exe")
        else (
            Path(os.environ.get("APPDATA", ""))
            / "npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
        )
        if os.name == "nt"
        else Path(shutil.which("claude") or "/unavailable/claude")
    )
    checkpoint = (
        Path.home()
        / ".cache/huggingface/hub/models--convaiinnovations--laya/snapshots/1c5edc17a7acd8701df6fc341c0d179f1c62c982"
    )
    if not checkpoint.is_dir():
        checkpoint = Path(
            run(
                interpreter(decisions),
                "-c",
                "from huggingface_hub import snapshot_download; print(snapshot_download('convaiinnovations/laya',revision='1c5edc17a7acd8701df6fc341c0d179f1c62c982'))",
                capture=True,
            ).splitlines()[-1]
        )
    private = config.get("native_providers") or {
        "control_key": secrets.token_urlsafe(36),
        "inference_key": secrets.token_urlsafe(36),
    }
    private.update(
        state=str(STATE / "providers"), codex=str(binaries[0]), claude=str(claude)
    )
    for name in ("providers", "decisions"):
        (STATE / name).mkdir(exist_ok=True)
    decision_key = config["environments"].get("decisions", {}).get(
        "DECISION_API_KEY"
    ) or secrets.token_urlsafe(36)
    config.update(native_providers=private, ports=PORTS)
    config["repositories"]["pi"] = str(source)
    config["repositories"]["toolgate"] = str(toolgate)
    config["repositories"]["memorygate"] = str(memorygate)
    config["python_by_service"].update(
        decisions=str(interpreter(decisions)), providers=config["python"]
    )
    config["environments"]["providers"] = {}
    config["environments"]["decisions"] = {
        "DECISION_API_KEY": decision_key,
        "DECISION_MODEL_PATH": str(checkpoint),
    }
    config["environments"]["pi"].update(
        PI_SUBSCRIPTION_URL="http://127.0.0.1:18570",
        PI_SUBSCRIPTION_KEY=private["inference_key"],
        PI_DECISION_URL="http://127.0.0.1:18560",
        PI_DECISION_KEY=decision_key,
    )
    config["environments"]["gateway"].update(
        GATEWAY_PROVIDER_CONTROL_URL="http://127.0.0.1:18570",
        GATEWAY_PROVIDER_CONTROL_KEY=private["control_key"],
    )
    if os.name == "nt":
        run(config["python"], "-m", "pip", "install", "pywinpty==3.0.2")
        config["native_terminal"] = True
        config["environments"]["gateway"].update(
            GATEWAY_TERMINAL_SOCKET=str(Path(private["codex"])),
            GATEWAY_TERMINAL_WORKSPACE_LABEL="Windows owner workspace · Conker",
        )
    CONFIG.write_text(json.dumps(config, indent=2), encoding="utf-8")
    run(config["python"], ROOT / "scripts/workspace_models.py", "initialize")
    print(
        "Prepared native authentication and model roles. Verify models in Setup; thinking runs only when requested. Start with workspace.py up."
    )
