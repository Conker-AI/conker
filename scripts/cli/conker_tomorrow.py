"""conker tomorrow: what Conker will do on its own in the next day, and what would hold it back.

Pi route: GET /insights/tomorrow (Conker-AI/pi, R-U10). Read only: nothing is run or changed. Pi
decides every hold by the runner's own checks; this module only prints the list in plain words,
at the owner's time zone.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from scripts.cli.conker_context import pi_call
from scripts.cli.conker_inputs import plain

# Why a start would not run, in Pi's codes (pi.agents.tomorrow_runs).
REASONS = {
    "QUIET_HOURS": "your quiet hours",
    "PROACTIVITY_OFF": "proactive work is off",
    "URGENT_ONLY": "only urgent work is allowed",
    "OVER_BUDGET": "today's suggestion budget is used up",
    "TRIGGER_OFF": "you do not let this kind of trigger start jobs",
    "TOO_SOON": "too soon after its last run",
    "RUN_LIMIT": "it already made its runs for the day",
    "LAST_RUN_OPEN": "its last run is still open or waits for your answer",
    "SCHEDULER_OFF": "the job scheduler is off",
    "ROLE_OFF": "the ideas model is off",
}


def register(commands):
    """Register `conker tomorrow [--hours N] [--json]`."""
    tomorrow = commands.add_parser(
        "tomorrow", help="What Conker will do on its own in the next day, and what holds it back"
    )
    tomorrow.add_argument(
        "--hours", type=int, default=24, help="How far ahead, 1 to 168 hours (default 24)"
    )
    tomorrow.add_argument("--json", action="store_true", help="Print Pi's reply as JSON")


def _zone(name):
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return UTC


def why(code):
    """A held start's reason in plain words; an unknown code is shown as it came."""
    return REASONS.get(code, f"held back ({code})")


def render(page):
    """A header, one line per start (soonest first, watches last), then expiring approvals."""
    zone = _zone(page["timeZone"])
    hours = page["hours"]
    lines = [f"The next {hours} hours ({page['timeZone']}):"]
    runs = page.get("runs") or []
    for item in runs:
        name = plain(item["name"])
        if item["kind"] == "watch":
            when = "watching"
            what = f"{name}, checks every {item['everyMinutes']} min"
        else:
            when = datetime.fromtimestamp(item["at"], UTC).astimezone(zone).strftime("%a %H:%M")
            what = name
        outcome = "runs" if item["wouldRun"] else f"held: {why(item['reason'])}"
        lines.append(f"{when:<9}  {what}  {outcome}")
    if not runs:
        lines.append(f"Nothing planned for the next {hours} hours.")
    count = len(page.get("approvals") or [])
    if count:
        noun = "approval runs" if count == 1 else "approvals run"
        lines.append(f"{count} {noun} out in this time; answer in the Inbox to keep them.")
    return "\n".join(lines)


def operation(args, config, request):
    """Read the forecast; returns the value to print, or None when it printed itself."""
    if not 1 <= args.hours <= 168:
        raise ValueError("--hours must be from 1 to 168.")
    page = pi_call(request, config, "/insights/tomorrow", query={"hours": args.hours})
    if args.json:
        return page
    print(render(page))
    return None
