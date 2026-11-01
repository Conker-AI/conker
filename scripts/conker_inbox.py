"""Inbox command: everything that happened and everything that needs the owner."""

import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from conker_context import pi_call


def register(commands):
    inbox = commands.add_parser(
        "inbox", help="Everything that happened and everything that needs you"
    )
    inbox.add_argument("--json", action="store_true", help="Output raw JSON")


def _emit(text):
    """Print text; characters the output cannot encode (a redirected Windows pipe) are replaced."""
    encoding = sys.stdout.encoding or "utf-8"
    print(text.encode(encoding, errors="replace").decode(encoding))


def operation(args, config, request):
    value = pi_call(request, config, "/inbox")
    _emit(
        json.dumps(value, indent=2, ensure_ascii=False) if args.json else render(value)
    )
    return 0


def render(value):
    """Render inbox data as plain text."""
    day = value["day"]
    date = day["date"]
    tz = day["timeZone"]

    lines = []
    lines.append(f"Inbox · {date} ({tz})")
    lines.append("")

    # Needs you section
    needs_you = value.get("needsYou", [])
    lines.append(f"Needs you ({len(needs_you)})")
    if needs_you:
        for item in needs_you:
            marker = _needs_you_marker(item)
            title = _truncate_title(item["title"], 48)
            time_str = _format_time(item.get("since"), day, tz)
            if time_str != "-":
                time_str = "since " + time_str

            if item["kind"] == "approval":
                line = f"  {marker} {title}: approve {item['tool']}"
            elif item["kind"] == "suggestion" or item["kind"] == "memory":
                line = f"  {marker} {title}"
            elif item["kind"] == "attention":
                line = f"  {marker} {title}: {item.get('status', '')}"
            elif item["kind"] == "plan" and item.get("resetsAt"):
                line = (
                    f"  {marker} {title}, resets {_format_reset(item['resetsAt'], tz)}"
                )
            else:
                line = f"  {marker} {title}"

            line = _pad_to_column(line, time_str, 54)
            lines.append(line)
    else:
        lines.append("  nothing")

    # Handled section
    handled = value.get("handled", [])
    lines.append(f"Handled ({len(handled)})")
    if handled:
        for item in handled:
            title = _truncate_title(item["title"], 48)
            time_str = _format_time(item.get("at"), day, tz)
            line = f"  ✓ {title}"
            line = _pad_to_column(line, time_str, 54)
            lines.append(line)
    else:
        lines.append("  nothing")

    # Upcoming section
    upcoming = value.get("upcoming", [])
    lines.append(f"Upcoming ({len(upcoming)})")
    if upcoming:
        for item in upcoming:
            title = _truncate_title(item["title"], 48)
            time_str = _format_time(item.get("at"), day, tz)
            line = f"  · {title}"
            line = _pad_to_column(line, time_str, 54)
            lines.append(line)
    else:
        lines.append("  nothing")

    # Impact section
    impact_today = value["impact"]["today"]
    impact_week = value["impact"]["week"]

    lines.append(
        f"Impact today: {impact_today['answers']} {_plural('answer', impact_today['answers'])} · "
        f"{impact_today['actions']} {_plural('action', impact_today['actions'])} · "
        f"{impact_today['tasksCompleted']} {_plural('task', impact_today['tasksCompleted'])} · "
        f"{impact_today['jobsCompleted']} {_plural('job', impact_today['jobsCompleted'])} · "
        f"${impact_today['costUsd']:.4f}"
    )
    lines.append(
        f"This week:    {impact_week['answers']} {_plural('answer', impact_week['answers'])} · "
        f"{impact_week['actions']} {_plural('action', impact_week['actions'])} · "
        f"{impact_week['tasksCompleted']} {_plural('task', impact_week['tasksCompleted'])} · "
        f"{impact_week['jobsCompleted']} {_plural('job', impact_week['jobsCompleted'])} · "
        f"${impact_week['costUsd']:.4f}"
    )

    return "\n".join(lines)


def _needs_you_marker(item):
    """Get the marker for needs-you items."""
    if item["kind"] == "approval":
        return "!"
    elif item["kind"] == "suggestion" or item["kind"] == "memory":
        return "?"
    elif item["kind"] == "attention":
        if item.get("urgency", {}).get("urgent", False):
            return "!"
        else:
            return "-"
    else:
        return "-"


def _format_reset(value, tz):
    """An ISO reset time as the owner's local weekday and time."""
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return moment.astimezone(ZoneInfo(tz)).strftime("%a %H:%M")
    except (ValueError, KeyError):
        return value


def _truncate_title(title, max_length):
    """Truncate title to max_length, adding ellipsis if needed."""
    if len(title) <= max_length:
        return title
    return title[: max_length - 1] + "…"


def _format_time(timestamp, day, tz):
    """Format a timestamp for display."""
    if timestamp is None:
        return "-"

    try:
        dt = datetime.fromtimestamp(timestamp, ZoneInfo(tz))
        day_dt = datetime.fromtimestamp(day["startsAt"], ZoneInfo(tz))
        day_date = day_dt.date()

        if dt.date() == day_date:
            return dt.strftime("%H:%M")
        else:
            return dt.strftime("%a %H:%M")
    except (ValueError, OSError, KeyError):
        return "-"


def _pad_to_column(text, time_str, column):
    """Pad text to align time_str at the specified column."""
    # Column is 1-based, so we need to pad to column-1 spaces
    target_length = column - 1
    if len(text) >= target_length:
        return text + " " + time_str
    return text + " " * (target_length - len(text)) + time_str


def _plural(word, count):
    """Return singular or plural form based on count."""
    return word if count == 1 else word + "s"
