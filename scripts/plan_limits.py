"""How much of each subscription window is left, read from the official runtimes.

Both readers return one shape, so any screen can show it the same way:
{"provider", "available", "plan", "windows": [{"id", "label", "usedPercent", "leftPercent",
"resetsAt", "minutes"}], "checkedAt"} or {"provider", "available": false, "problem"}.
Percentages come from the provider; nothing here estimates usage or money.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
from datetime import UTC, datetime

MAX_OUTPUT = 1_000_000
# A local command: Claude Code reads the plan's usage itself and makes no model call. Nothing else
# can run: no tools, no MCP servers, no settings or hooks, one turn, no saved session.
CLAUDE_USAGE = (
    "-p",
    "/usage",
    "--output-format",
    "stream-json",
    "--verbose",
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--setting-sources",
    "",
    "--no-session-persistence",
    "--max-turns",
    "1",
)
MAX_WINDOWS = 12
LABEL = re.compile(r"[\w .()+/:-]{1,60}")


def _now():
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _percent(value):
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    ):
        return None
    return max(0, min(100, round(value)))


def _when(value):
    """Unix seconds or an ISO timestamp, as ISO UTC; anything else is unknown."""
    try:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            moment = datetime.fromtimestamp(value, UTC)
        elif isinstance(value, str) and len(value) <= 64:
            moment = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
                UTC
            )
        else:
            return None
    except (ValueError, OverflowError, OSError):
        return None
    return moment.isoformat(timespec="seconds").replace("+00:00", "Z")


def _label(text):
    text = str(text or "").strip()
    return text if LABEL.fullmatch(text) else None


def _window(identity, label, used, resets, minutes=None):
    used = _percent(used)
    if used is None or not label:
        return None
    return {
        "id": identity,
        "label": label,
        "usedPercent": used,
        "leftPercent": 100 - used,
        "resetsAt": _when(resets),
        "minutes": minutes
        if isinstance(minutes, int) and 0 < minutes <= 525_600
        else None,
    }


def unavailable(provider, problem):
    return {"provider": provider, "available": False, "problem": problem}


def _span(minutes):
    if minutes == 300:
        return "5-hour"
    if minutes == 10_080:
        return "weekly"
    if isinstance(minutes, int) and minutes > 0:
        if minutes % 1440 == 0:
            return f"{minutes // 1440}-day"
        if minutes % 60 == 0:
            return f"{minutes // 60}-hour"
        return f"{minutes}-minute"
    return "window"


def chatgpt(result):
    """Normalize Codex app-server `account/rateLimits/read` (GetAccountRateLimitsResponse)."""
    if not isinstance(result, dict):
        return unavailable("chatgpt", "invalid_provider_response")
    snapshots = result.get("rateLimitsByLimitId")
    if not isinstance(snapshots, dict) or not snapshots:
        snapshots = {"": result.get("rateLimits")}
    windows, plan = [], None
    for key, snapshot in sorted(snapshots.items()):
        if not isinstance(snapshot, dict):
            continue
        plan = plan or _label(snapshot.get("planType"))
        name = _label(snapshot.get("limitName")) if key and key != "codex" else None
        for slot in ("primary", "secondary"):
            value = snapshot.get(slot)
            if not isinstance(value, dict):
                continue
            minutes = value.get("windowDurationMins")
            span = _span(minutes)
            window = _window(
                f"{key or 'default'}:{slot}",
                f"{name} {span}" if name else span,
                value.get("usedPercent"),
                value.get("resetsAt"),
                minutes,
            )
            if window:
                windows.append(window)
    if not windows:
        return unavailable("chatgpt", "limits_unavailable")
    credits = (result.get("rateLimitResetCredits") or {}).get("availableCount")
    return {
        "provider": "chatgpt",
        "available": True,
        "plan": plan,
        "windows": windows[:MAX_WINDOWS],
        "resetCredits": credits
        if isinstance(credits, int) and 0 <= credits < 1000
        else None,
        "checkedAt": _now(),
    }


def claude(output):
    """Normalize the `usage_report` that `claude -p /usage --output-format stream-json` prints."""
    if not isinstance(output, (bytes, str)) or len(output) > MAX_OUTPUT:
        return unavailable("claude", "invalid_provider_response")
    text = (
        output.decode("utf-8", errors="replace")
        if isinstance(output, bytes)
        else output
    )
    report = None
    for line in text.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict) and event.get("type") == "assistant":
            candidate = event.get("usage_report")
            if isinstance(candidate, dict):
                report = candidate
    limits = ((report or {}).get("rate_limits") or {}).get("limits")
    if not isinstance(limits, list):
        # Null rate_limits: the sign-in cannot read plan usage (for example API billing).
        return unavailable("claude", "limits_unavailable")
    windows = []
    for index, row in enumerate(limits[:MAX_WINDOWS]):
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "")
        scope = ((row.get("scope") or {}).get("model") or {}).get("display_name")
        if kind == "session":
            label = "5-hour"
        elif kind == "weekly_all":
            label = "weekly"
        elif kind == "weekly_scoped" and _label(scope):
            label = f"weekly {_label(scope)}"
        else:
            label = _label(kind.replace("_", " "))
        window = _window(
            f"{kind or 'window'}:{index}",
            label,
            row.get("percent"),
            row.get("resets_at"),
        )
        if window:
            windows.append(window)
    if not windows:
        return unavailable("claude", "limits_unavailable")
    extra = ((report or {}).get("rate_limits") or {}).get("extra_usage")
    return {
        "provider": "claude",
        "available": True,
        "plan": None,
        "windows": windows,
        "extraUsageEnabled": bool(extra.get("is_enabled"))
        if isinstance(extra, dict)
        else None,
        "checkedAt": _now(),
    }


def read_chatgpt(control):
    """Ask Conker's isolated Codex sign-in for its rate-limit windows."""
    if not getattr(control, "rpc", None):
        return unavailable("chatgpt", "runtime_unavailable")
    with control.lock:
        try:
            account = control.rpc.call("account/read", {"refreshToken": False}).get(
                "account"
            )
            if not isinstance(account, dict) or account.get("type") != "chatgpt":
                return unavailable("chatgpt", "sign_in_required")
            return chatgpt(
                control.rpc.call(
                    "account/rateLimits/read", {"excludeResetCreditDetails": True}
                )
            )
        except (ValueError, OSError) as error:
            # ChatGPTError is a ValueError whose message is a fixed code, never provider text.
            code = str(error)
            return unavailable(
                "chatgpt", code if LABEL.fullmatch(code) else "runtime_unavailable"
            )


def read_claude(runtime):
    """Run Claude Code's own `/usage` with Conker's isolated sign-in."""
    if not runtime.executable.is_file():
        return unavailable("claude", "runtime_unavailable")
    if not runtime.status().get("connected"):
        return unavailable("claude", "sign_in_required")
    try:
        result = subprocess.run(
            [str(runtime.executable), *CLAUDE_USAGE],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=60,
            check=False,
            **runtime.options(),
        )
    except (OSError, subprocess.SubprocessError):
        return unavailable("claude", "runtime_unavailable")
    if result.returncode != 0:
        return unavailable("claude", "provider_request_failed")
    return claude(result.stdout[: MAX_OUTPUT + 1])
