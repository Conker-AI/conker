"""Memory search, new agents and new teams from the CLI, over the owner's own Pi routes.

These are the owner's counterparts of Conker's built-in tools `conker.recall`,
`conker.create_agent` and `conker.create_team`: he searches memory and makes agents and teams
directly, without a change request. Pi validates every body; this module only shapes it.
"""

from conker_context import pi_call

ROLE_TOKENS = 50_000
ROLE_CENTS = 25
MAX_ROLES = 12
MAX_ROLE_TOOLS = 100


def register(commands):
    """Register the memory, agent and team areas."""
    memory = commands.add_parser("memory", help="Search what Conker remembers")
    memory_commands = memory.add_subparsers(dest="operation", required=True)
    search = memory_commands.add_parser(
        "search", help="Find memories by their words, as the Memory screen does"
    )
    search.add_argument("query", help="Words to find, at most 200 characters")
    search.add_argument(
        "--limit", type=int, default=10, help="How many to show, 1 to 50 (default 10)"
    )

    agent = commands.add_parser("agent", help="Make a new agent")
    agent_commands = agent.add_subparsers(dest="operation", required=True)
    create = agent_commands.add_parser("create", help="Make an agent now")
    create.add_argument("--name", required=True, help="1-80 characters, unique")
    create.add_argument("--role", required=True, help="What it does, 1-160 characters")
    create.add_argument("--instructions", required=True, help="1-8000 characters")
    create.add_argument(
        "--tool",
        action="append",
        default=[],
        metavar="ID",
        help="A tool it may use; repeat for more (default none)",
    )
    create.add_argument("--model", help="Model ID; default is your answer model")
    create.add_argument(
        "--memory",
        choices=["none", "conversation", "owner"],
        default="conversation",
        help="What it remembers: nothing, only its chat (default), or what Conker knows about you",
    )

    team = commands.add_parser("team", help="Make a new team of existing agents")
    team_commands = team.add_subparsers(dest="operation", required=True)
    team_create = team_commands.add_parser(
        "create", help="Make a linear team: each role hands its result to the next"
    )
    team_create.add_argument("--name", required=True, help="1-80 characters, unique")
    team_create.add_argument("--objective", required=True, help="1-2000 characters")
    team_create.add_argument(
        "--role",
        action="append",
        nargs=3,
        required=True,
        metavar=("NAME", "AGENT", "INSTRUCTIONS"),
        help="One role, in order; AGENT is an agent id or its exact name. Repeat for each role.",
    )
    team_create.add_argument(
        "--role-tokens", type=int, default=ROLE_TOKENS, help="Token budget per role"
    )
    team_create.add_argument(
        "--role-cents",
        type=int,
        default=ROLE_CENTS,
        help="Cost budget per role, in cents",
    )


def _text(value, name, limit):
    text = value.strip()
    if not 1 <= len(text) <= limit:
        raise ValueError(f"Give {name} as 1-{limit} characters.")
    return text


def _search(args, config, request):
    query = _text(args.query, "the search words", 200)
    if not 1 <= args.limit <= 50:
        raise ValueError("--limit must be from 1 to 50.")
    return pi_call(
        request, config, "/memory/objects", query={"search": query, "limit": args.limit}
    )


def _agent(args, config, request):
    tools = list(dict.fromkeys(tool.strip() for tool in args.tool if tool.strip()))
    body = {
        "name": _text(args.name, "--name", 80),
        "role": _text(args.role, "--role", 160),
        "instructions": _text(args.instructions, "--instructions", 8000),
        "modelId": args.model.strip() if args.model and args.model.strip() else None,
        "toolIds": tools,
        "toolAccess": {},
        "memory": {"scope": args.memory, "memoryIds": []},
    }
    return pi_call(request, config, "/agents", body)


def _find(agents, reference):
    """The agent a role names, by id or exact name (case does not matter)."""
    wanted = reference.strip()
    for agent in agents:
        if (
            agent["id"] == wanted
            or agent["configuration"]["name"].casefold() == wanted.casefold()
        ):
            if agent.get("archived_at") is not None:
                raise ValueError(f"The agent “{wanted}” is archived; restore it first.")
            return agent
    raise ValueError(
        f"There is no agent “{wanted}”. Run `conker definitions --kind agent`."
    )


def team_definition(args, agents):
    """A linear team over existing agents, each role with its agent's tools and no memory."""
    if not 1 <= len(args.role) <= MAX_ROLES:
        raise ValueError(f"A team has 1 to {MAX_ROLES} roles.")
    if args.role_tokens < 1 or args.role_cents < 0:
        raise ValueError(
            "--role-tokens must be at least 1 and --role-cents at least 0."
        )
    budget = {
        "maxTurns": 1,
        "maxTokens": args.role_tokens,
        "maxCostCents": args.role_cents,
    }
    roles = []
    for index, (name, reference, instructions) in enumerate(args.role, 1):
        agent = _find(agents, reference)
        tools = agent["configuration"]["toolIds"]
        if len(tools) > MAX_ROLE_TOOLS:
            raise ValueError(
                f"A team role may use at most {MAX_ROLE_TOOLS} tools; "
                f"{agent['configuration']['name']} has {len(tools)}."
            )
        roles.append(
            {
                "id": f"role{index}",
                "name": _text(name, "each role's name", 80),
                "agentId": agent["id"],
                "instructions": _text(instructions, "each role's instructions", 8000),
                "toolIds": tools,
                "memory": {"scope": "none", "memoryIds": []},
                "context": {"mode": "task_only", "sourceIds": []},
                "budget": budget,
            }
        )
    count = len(roles)
    return {
        "name": _text(args.name, "--name", 80),
        "objective": _text(args.objective, "--objective", 2000),
        "roles": roles,
        "handoffs": [
            {
                "id": f"handoff{index}",
                "fromRoleId": f"role{index}",
                "toRoleId": f"role{index + 1}",
                "condition": f"The owner reviewed the result of {roles[index - 1]['name']}.",
                "payload": "result_only",
                "maxTransfers": 1,
            }
            for index in range(1, count)
        ],
        "budget": {
            "maxTurns": count + 2,
            "maxTokens": args.role_tokens * count,
            "maxCostCents": args.role_cents * count,
            "maxHandoffs": count - 1,
        },
    }


def operation(args, config, request):
    """Run one memory, agent or team subcommand and return the value to print."""
    if args.command == "memory":
        return _search(args, config, request)
    if args.command == "agent":
        return _agent(args, config, request)
    agents = pi_call(request, config, "/agents")["results"]
    return pi_call(
        request, config, "/collaboration/teams", team_definition(args, agents)
    )
