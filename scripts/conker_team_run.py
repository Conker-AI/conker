"""Run a saved team from the CLI: the owner's own, explicit steps over Pi's /team-runs routes.

A team run is owner-directed: Pi freezes the team, runs one role at a time and never decides on
its own that a handoff condition holds. `conker team run` starts the run and runs its first
role; `conker team next` runs the next role over a handoff after he reviewed the last answer;
`conker team show` reads a run; `conker team finish` ends it. Pi refuses to start or step a run
while the daily spending cap is off, and every paid call of a role passes that cap.
"""

import re
import uuid

from scripts.conker_context import pi_call

TEAM_ID = re.compile(r"team_[0-9a-f]{32}")
RUN_ID = re.compile(r"teamrun_[0-9a-f]{32}")
CHAT_ID = re.compile(r"ses_[0-9a-f]{16}")
MAX_TASK = 8000


def register(team_commands):
    """Add run, next, show and finish to the `team` area."""
    run = team_commands.add_parser(
        "run", help="Start a run of a saved team and run its first role"
    )
    run.add_argument("team_id", help="The team's id (team_...)")
    run.add_argument("--chat", required=True, help="The chat the run starts from (ses_...)")
    run.add_argument("--task", required=True, help="What the team should do, 1-8000 characters")
    run.add_argument("--json", action="store_true", help="Print Pi's reply")
    after = team_commands.add_parser(
        "next", help="Run the next role, after you reviewed the last answer"
    )
    after.add_argument("run_id", help="The run's id (teamrun_...)")
    after.add_argument(
        "--reviewed",
        action="store_true",
        required=True,
        help="Say you reviewed the last role's answer and its handoff condition holds",
    )
    after.add_argument("--json", action="store_true", help="Print Pi's reply")
    show = team_commands.add_parser("show", help="Read a run: its steps, state and usage")
    show.add_argument("run_id", help="The run's id (teamrun_...)")
    show.add_argument("--json", action="store_true", help="Print Pi's reply")
    finish = team_commands.add_parser("finish", help="End a run, as completed or cancelled")
    finish.add_argument("run_id", help="The run's id (teamrun_...)")
    finish.add_argument("--cancel", action="store_true", help="End it as cancelled")
    finish.add_argument("--json", action="store_true", help="Print Pi's reply")


def _id(pattern, value, name):
    if not isinstance(value, str) or not pattern.fullmatch(value.strip()):
        raise ValueError(f"Give {name} as an id like {pattern.pattern.split('[')[0]}...")
    return value.strip()


def _request_id(kind):
    return f"cli-{kind}-{uuid.uuid4().hex}"


def _steps(run):
    return run["steps"]


def _first_role(definition):
    """The role no handoff leads to (a linear team's first)."""
    targets = {edge["toRoleId"] for edge in definition["handoffs"]}
    for role in definition["roles"]:
        if role["id"] not in targets:
            return role["id"]
    raise ValueError("This team has no first role.")


def _next_edge(definition, last_role):
    """The handoff from the last role that ran, and the role it leads to."""
    for edge in definition["handoffs"]:
        if edge["fromRoleId"] == last_role:
            return edge
    raise ValueError("No handoff leads on from the last role; finish the run.")


def _run_step(request, config, run, body):
    return pi_call(
        request,
        config,
        f"/team-runs/{run['id']}/steps",
        {"request_id": _request_id("step"), "expected_revision": run["revision"], **body},
    )


def _summary(run):
    names = {role["id"]: role["name"] for role in run["snapshot"]["definition"]["roles"]}
    lines = [f"Run {run['id']}: {run['state']}"]
    for step in _steps(run):
        label = names.get(step["role_id"], step["role_id"])
        lines.append(f"  {label}: {step['state']} (chat {step['session_id']})")
    return lines


def _start(args, config, request):
    team_id = _id(TEAM_ID, args.team_id, "the team")
    chat = _id(CHAT_ID, args.chat, "--chat")
    task = args.task.strip()
    if not 1 <= len(task) <= MAX_TASK:
        raise ValueError(f"Give --task as 1-{MAX_TASK} characters.")
    team = pi_call(request, config, f"/collaboration/teams/{team_id}")
    run = pi_call(
        request,
        config,
        f"/team-runs/from-team/{team_id}",
        {
            "request_id": _request_id("run"),
            "expected_revision": team["revision"],
            "source_session_id": chat,
            "text": task,
            "budgetMode": "observed-stop",
            "acknowledgeCurrentCallMayOvershoot": True,
        },
    )
    run = _run_step(request, config, run, {"roleId": _first_role(team["definition"])})
    if args.json:
        return run
    lines = _summary(run)
    lines.append(
        "Read the answer in the chat above, then run the next role with "
        f"`conker team next {run['id']} --reviewed`, or end it with `conker team finish`."
    )
    print("\n".join(lines))
    return None


def _next(args, config, request):
    run_id = _id(RUN_ID, args.run_id, "the run")
    run = pi_call(request, config, f"/team-runs/{run_id}")
    steps = _steps(run)
    if not steps:
        raise ValueError("This run has run no role yet; start it with `conker team run`.")
    edge = _next_edge(run["snapshot"]["definition"], steps[-1]["role_id"])
    run = _run_step(
        request,
        config,
        run,
        {"roleId": edge["toRoleId"], "handoffId": edge["id"], "conditionReviewed": True},
    )
    if args.json:
        return run
    print("\n".join(_summary(run)))
    return None


def _show(args, config, request):
    run = pi_call(request, config, f"/team-runs/{_id(RUN_ID, args.run_id, 'the run')}")
    if args.json:
        return run
    print("\n".join(_summary(run)))
    return None


def _finish(args, config, request):
    run_id = _id(RUN_ID, args.run_id, "the run")
    run = pi_call(request, config, f"/team-runs/{run_id}")
    state = "cancelled" if args.cancel else "completed"
    run = pi_call(
        request,
        config,
        f"/team-runs/{run_id}/finish",
        {"expected_revision": run["revision"], "state": state},
    )
    if args.json:
        return run
    print(f"Run {run_id} is {run['state']}.")
    return None


def operation(args, config, request):
    """Run one team-run subcommand and return the value to print (None: printed)."""
    handler = {"run": _start, "next": _next, "show": _show, "finish": _finish}[args.operation]
    return handler(args, config, request)
