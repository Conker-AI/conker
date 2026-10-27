"""ToolGate owner operations from the CLI: remote MCP tools, and which tools Conker may use."""

from __future__ import annotations

from conker_inputs import (
    MCP_ID,
    TOOL_ID,
    identity,
    imported_mcp,
    mcp_endpoint,
    secret_reference,
)

COMMANDS = {"mcp", "tool-access"}


def check(args) -> None:
    """Refuse malformed ids and half-specified changes before anything is read or sent."""
    if args.command == "mcp" and args.operation in {"state", "access"}:
        identity(args.id, MCP_ID, "MCP capability ID")
        if args.expected_digest is not None:
            identity(args.expected_digest, r"[a-f0-9]{64}", "exact saved digest")
            if args.enabled is None:
                raise ValueError(
                    "Use --enabled together with --expected-digest to change access."
                )
    if args.command == "tool-access":
        identity(args.id, TOOL_ID, "tool ID")
        if (args.enabled is None) != (args.expected_digest is None):
            raise ValueError("Use --enabled together with --expected-digest to change access.")
        if args.expected_digest is not None:
            identity(args.expected_digest, r"[a-f0-9]{64}", "exact saved digest")


def operation(args, config, request):
    if args.command == "tool-access":
        body = (
            {"enabled": args.enabled == "true", "expected_digest": args.expected_digest}
            if args.enabled is not None
            else None
        )
        return request(config, "toolgate-owner", f"/v2/owner/tools/{args.id}/access", body)
    path, body = "/v2/owner/mcp/tools", None
    if args.operation == "discover":
        path = "/v2/owner/mcp/discover"
        body = {
            "url": mcp_endpoint(args.url),
            "secret_ref": secret_reference(args.secret_ref),
        }
    elif args.operation == "import":
        path = "/v2/owner/mcp/import"
        body = imported_mcp(args)
    elif args.operation in {"state", "access"}:
        path += "/" + args.id + "/" + args.operation
        if args.enabled is not None:
            if not args.expected_digest:
                raise ValueError(
                    "Supply --expected-digest from the inspected tool before changing access."
                )
            body = {
                "enabled": args.enabled == "true",
                "expected_digest": args.expected_digest,
            }
    return request(config, "toolgate-owner", path, body)
