"""The conker CLI argument grammar: every command, subcommand and option."""

import argparse
from pathlib import Path

from conker_chat import register as register_chat
from conker_config import register as register_config
from conker_context import register as register_context
from conker_files import register as register_files
from conker_inbox import register as register_inbox
from conker_messages import register as register_message
from conker_workflows import register as register_workflows


def build_parser(description):
    parser = argparse.ArgumentParser(description=description)
    commands = parser.add_subparsers(dest="command", required=True)
    sessions = commands.add_parser("sessions", help="Browse compact chat history pages")
    sessions.add_argument("--limit", type=int, default=50, help="Chats per page (1-50)")
    sessions.add_argument(
        "--query", help="Literal title/summary search, at most 200 characters"
    )
    sessions.add_argument(
        "--cursor", help="next_cursor from the same query; omit to refresh"
    )
    new = commands.add_parser("new")
    new.add_argument("title", nargs="?", default="")
    chat = commands.add_parser("chat")
    chat.add_argument("session")
    chat.add_argument("text")
    chat.add_argument("--model")
    chat.add_argument("--request-id")
    chat.add_argument(
        "--draft-revision",
        type=int,
        help="Consume exactly this saved draft revision when the message binds",
    )
    chat.add_argument("--research-mode", choices=["off", "web", "deep"], default="off")
    chat.add_argument(
        "--think",
        action="store_true",
        help="Request background analysis for this message",
    )
    resume = commands.add_parser(
        "resume", help="Resume the saved turn without replaying completed actions"
    )
    resume.add_argument("turn")
    usage = commands.add_parser(
        "usage", help="Inspect recorded model calls, reported usage and missing totals"
    )
    usage.add_argument("turn")
    commands.add_parser(
        "memory-forget-pending",
        help="Inspect the saved identity of an unresolved memory forget request",
    )
    memory_edit = commands.add_parser(
        "memory-edit", help="Review and correct retained Companion memory text"
    )
    memory_edit_commands = memory_edit.add_subparsers(dest="operation", required=True)
    memory_show = memory_edit_commands.add_parser(
        "show", help="Read full authoritative text and its revision before editing"
    )
    memory_show.add_argument("memory_id")
    memory_apply = memory_edit_commands.add_parser(
        "apply", help="Apply exactly the reviewed UTF-8 text file and revision"
    )
    memory_apply.add_argument("memory_id")
    memory_apply.add_argument("file", type=Path)
    memory_apply.add_argument("--expected-revision", required=True, type=int)
    memory_apply.add_argument("--request-id", required=True)
    memory_edit_commands.add_parser(
        "pending", help="Find unresolved correction identity without reading its text"
    )
    memory_status = memory_edit_commands.add_parser(
        "status", help="Check the original receipt without sending an edit"
    )
    memory_status.add_argument("request_id")
    memory_retry = memory_edit_commands.add_parser(
        "retry", help="Explicitly resend only the exact previously approved correction"
    )
    memory_retry.add_argument("request_id")
    memory_retry.add_argument("--expected-payload-hash", required=True)
    delivery = commands.add_parser(
        "memory-delivery", help="Read acknowledged memory delivery for saved messages"
    )
    delivery.add_argument("session")
    delivery.add_argument(
        "--message", help="Read one saved user message, including older history"
    )
    register_context(commands)
    register_files(commands)
    register_message(commands)
    register_chat(commands)
    register_inbox(commands)
    register_config(commands)
    register_workflows(commands)
    stop = commands.add_parser(
        "stop", help="Stop the saved submission by its request ID"
    )
    stop.add_argument("request_id")
    submission = commands.add_parser(
        "submission", help="Inspect a durable submission before deciding how to recover"
    )
    submission.add_argument("request_id")
    draft = commands.add_parser(
        "draft", help="Read or save private composer drafts without sending a message"
    )
    draft_commands = draft.add_subparsers(dest="operation", required=True)
    for operation in ("show", "save", "clear"):
        item = draft_commands.add_parser(operation)
        item.add_argument(
            "target", help="Conversation ID, or new for the unsent first message"
        )
        item.add_argument("--task", help="Separate task draft within this conversation")
        if operation == "save":
            item.add_argument(
                "file",
                type=Path,
                help="JSON with text and optional model_id, skill_ids, think, research_mode; new also accepts title, agent_id, privacy",
            )
        if operation in {"save", "clear"}:
            item.add_argument("--expected-revision", type=int, required=True)
    draft_start = draft_commands.add_parser(
        "start",
        help="Create a conversation from the saved new draft without running a model",
    )
    draft_start.add_argument("--expected-revision", type=int, required=True)
    draft_start.add_argument(
        "--request-id",
        required=True,
        help="Keep this identity for inspection or an exact retry after an uncertain result",
    )
    draft_status = draft_commands.add_parser(
        "start-status",
        help="Inspect a saved new-chat start request without repeating it",
    )
    draft_status.add_argument("request_id")
    chat.add_argument(
        "--skill",
        action="append",
        default=[],
        help="Select a saved skill (up to three)",
    )
    chat.add_argument(
        "--attach",
        action="append",
        default=[],
        help="Attach a file by its ID (repeatable)",
    )
    skills = commands.add_parser("skills", help="Manage reusable SKILL.md instructions")
    skill_commands = skills.add_subparsers(dest="operation", required=True)
    skill_commands.add_parser("list")
    skill_show = skill_commands.add_parser("show")
    skill_show.add_argument("id")
    skill_import = skill_commands.add_parser("import")
    skill_import.add_argument("file", type=Path)
    skill_import.add_argument("--expected-revision", type=int, default=0)
    skill_import.add_argument(
        "--expected-id", help="Bind a replacement to the inspected skill ID"
    )
    skill_state = skill_commands.add_parser("state")
    skill_state.add_argument("id")
    skill_state.add_argument("--enabled", choices=["true", "false"], required=True)
    skill_state.add_argument("--expected-revision", type=int, required=True)
    mcp = commands.add_parser(
        "mcp", help="Discover and manage remote MCP tools through ToolGate"
    )
    mcp_commands = mcp.add_subparsers(dest="operation", required=True)
    mcp_commands.add_parser("list")
    discover = mcp_commands.add_parser("discover")
    discover.add_argument("url", help="Public HTTPS Streamable HTTP endpoint")
    discover.add_argument(
        "--secret-ref",
        help="Existing ToolGate vault reference; never a credential value",
    )
    mcp_import = mcp_commands.add_parser(
        "import", help="Import one tool from saved discovery JSON"
    )
    mcp_import.add_argument("file", type=Path)
    mcp_import.add_argument("--tool", required=True, help="Exact remote tool name")
    mcp_import.add_argument("--id", required=True, help="New mcp.<name> capability ID")
    mcp_import.add_argument("--name", help="Display name")
    mcp_import.add_argument("--secret-ref")
    for operation in ("state", "access"):
        item = mcp_commands.add_parser(operation)
        item.add_argument("id")
        item.add_argument(
            "--enabled", choices=["true", "false"], required=operation == "state"
        )
        item.add_argument("--expected-digest", required=operation == "state")
    tool_access = commands.add_parser(
        "tool-access", help="Show or switch whether Conker may use one ToolGate tool"
    )
    tool_access.add_argument("id")
    tool_access.add_argument("--enabled", choices=["true", "false"])
    tool_access.add_argument("--expected-digest")
    tool_card = commands.add_parser(
        "tool-card",
        help="Show or pick the buttons your Inbox shows when one tool asks you",
    )
    tool_card.add_argument("id")
    tool_card.add_argument(
        "--template",
        choices=["do", "send", "publish", "ship", "run", "delete", "pay", "save"],
        help="do: Do it / Don't, send: Send it / Don't send, publish: Publish / Not yet, ...",
    )
    show = commands.add_parser("show")
    show.add_argument("session")
    think = commands.add_parser("thinking")
    think.add_argument("session")
    think.add_argument("--cancel", metavar="TURN_ID")
    models = commands.add_parser("models")
    models.add_argument(
        "--save",
        type=Path,
        help="JSON update containing expected_revision and configuration",
    )
    models.add_argument(
        "--role", help="Point one model role at one model, e.g. drafting"
    )
    choice = models.add_mutually_exclusive_group()
    choice.add_argument(
        "--model", help="The model ID for --role, as conker models lists it"
    )
    choice.add_argument("--off", action="store_true", help="Switch --role off")
    commands.add_parser(
        "profiles", help="Read-only model profiles from recorded outcomes"
    )
    definitions = commands.add_parser(
        "definitions",
        help="Agents, teams, templates, skills, cron jobs and projects in one list",
    )
    definitions.add_argument(
        "--kind", choices=["agent", "team", "template", "skill", "job", "project"]
    )
    definitions.add_argument("--search", help="Text to find in names and descriptions")
    definitions.add_argument(
        "--archived", action="store_true", help="Include archived ones"
    )
    limits = commands.add_parser(
        "limits",
        help="How much of each subscription window is left, in percent, and when it resets",
    )
    limits.add_argument("provider", nargs="?", choices=["chatgpt", "claude"])
    limits.add_argument(
        "--alerts",
        action="store_true",
        help="Pi's latest readings and the plan alerts still open",
    )
    limits.add_argument(
        "--dismiss", metavar="ALERT_ID", help="Hide one alert until its window resets"
    )
    auth = commands.add_parser("auth")
    auth.add_argument("provider", choices=["chatgpt", "claude"])
    auth.add_argument(
        "action",
        choices=["status", "login", "cancel", "logout", "models"],
        default="status",
        nargs="?",
    )
    auth.add_argument(
        "--billing", choices=["subscription", "api"], default="subscription"
    )
    native = commands.add_parser(
        "native",
        help="Run the official agent with Conker's isolated sign-in; native permissions apply",
    )
    native.add_argument("harness", choices=["codex", "claude"])
    native.add_argument("arguments", nargs=argparse.REMAINDER)
    native_sessions = commands.add_parser(
        "native-sessions",
        help="Read isolated Codex history or inspect and stop Claude background sessions",
    )
    native_sessions.add_argument("provider", choices=["claude", "codex"])
    native_operations = native_sessions.add_subparsers(dest="operation", required=True)
    native_list = native_operations.add_parser("list")
    native_list.add_argument(
        "--limit", type=int, help="Codex page size, 1 to 50 (default 25)"
    )
    native_list.add_argument(
        "--cursor", help="Next cursor from the same Codex history scope and page size"
    )
    native_list.add_argument(
        "--archived",
        action="store_true",
        default=None,
        help="Read archived Codex history",
    )
    for operation in ("status", "output", "stop"):
        operation_parser = native_operations.add_parser(operation)
        operation_parser.add_argument("id")
        if operation == "stop":
            operation_parser.add_argument("--expected-identity", required=True)
    api = commands.add_parser(
        "api",
        help="Host-owner access to the same service APIs; tool grants still apply",
    )
    api.add_argument("service", choices=["pi", "toolgate"])
    api.add_argument("path")
    api.add_argument("--body", type=Path)
    return parser
