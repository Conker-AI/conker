"""conker quiet: is Conker getting quieter and more useful? Asks per week and how many helped.

Pi route: GET /insights/quiet/weeks (Conker-AI/pi, R-M11 / R-E13). Read only: plain counts Pi
already keeps, per ISO week in the owner's time zone, never his words. Pi defines every count
(pi.agents.quiet_weeks); this module only prints them as a table.
"""

from scripts.cli.conker_context import pi_call

HEADER = ("Week", "Asks", "Approvals", "Pushed", "Acted on", "Dismissed", "Unanswered", "Useful")
NOTE = (
    "Asks: suggestions, questions, change requests and notices Conker raised, plus approvals.\n"
    "Useful: acted on, of the suggestions, questions and change requests you could act on."
)


def register(commands):
    """Register `conker quiet [--weeks N] [--json]`."""
    quiet = commands.add_parser(
        "quiet", help="Is Conker getting quieter? Asks per week and how many helped"
    )
    quiet.add_argument("--weeks", type=int, default=8, help="How many weeks, 1 to 26 (default 8)")
    quiet.add_argument("--json", action="store_true", help="Print Pi's reply as JSON")


def share(value):
    return "-" if value is None else f"{round(value * 100)}%"


def _row(week, current):
    label = week["week"] + ("*" if current else "")
    counts = (week[key] for key in ("asks", "approvalsAsked", "pushed", "actedOn", "dismissed"))
    return (label, *map(str, counts), str(week["unanswered"]), share(week["usefulShare"]))


def _compare(weeks):
    """The last full week against the one before it, in one line."""
    full = weeks[:-1]
    if not full:
        return None
    last = full[-1]
    line = f"Last full week: {last['asks']} asks, {share(last['usefulShare'])} useful"
    if len(full) > 1:
        before = full[-2]
        line += f" (the week before: {before['asks']} asks, {share(before['usefulShare'])} useful)"
    return line + "."


def render(page):
    """A header, one row per week (oldest first, this week last and marked), a comparison, notes."""
    weeks = page["weeks"]
    rows = [HEADER, *(_row(week, i == len(weeks) - 1) for i, week in enumerate(weeks))]
    widths = [max(len(row[col]) for row in rows) for col in range(len(HEADER))]
    lines = [f"Is Conker getting quieter? The last {len(weeks)} weeks ({page['timeZone']}):"]
    for row in rows:
        cells = [row[0].ljust(widths[0])] + [
            c.rjust(w) for c, w in zip(row[1:], widths[1:], strict=True)
        ]
        lines.append("  ".join(cells).rstrip())
    compared = _compare(weeks)
    if compared:
        lines.append(compared)
    lines.append("* this week, still running.")
    lines.append(NOTE)
    return "\n".join(lines)


def operation(args, config, request):
    """Read the weeks; returns the value to print, or None when it printed itself."""
    if not 1 <= args.weeks <= 26:
        raise ValueError("--weeks must be from 1 to 26.")
    page = pi_call(request, config, "/insights/quiet/weeks", query={"weeks": args.weeks})
    if args.json:
        return page
    print(render(page))
    return None
