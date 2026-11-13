# Connecting the existing tool editor

Inspected 22 September 2026 against the dashboard ToolDefinition and ToolGate V2Automation implementations.

Live draft save, catalogue binding, immutable publication, explicit grants,
approval/resume and durable execution receipts are connected and verified.
`scripts/check_local_workflow.py` exercises them against a real local ToolGate. The
September implementation log that used to follow here is in git history (this file
before 2026-11-13).

## Keep the workspace; translate explicitly

The dashboard owns canvas layout and draft editing. ToolGate owns validation,
publication, credentials, policy and execution. The owner channel manages definitions;
the agent channel receives only explicitly granted published capabilities. Saving a
draft must not publish it, grant it to Pi or execute it.

The existing formats are not interchangeable:

| Dashboard | ToolGate | Required bridge |
| --- | --- | --- |
| Nodes, edges, positions | Ordered steps with nested branches | Preserve editor graph separately; compile and validate structured control flow |
| `$input`, `$steps.id`, `$last` | `$args.field`, `$vars.field`, `$last` | Preserve the value of each node, not ToolGate's receipt envelope |
| Condition `greater`, `less`, `exists` | `gt`, `lt`, no existence operator | Explicit translation; missing references and null have different meanings |
| Loop maps identity/trim/uppercase and returns items/count | Loop executes a body; limit 20 | Implement matching map semantics or block publication; never silently reinterpret |
| Connector identifiers from MOCK_CONNECTORS | Registered ToolGate IDs and schemas | Replace fixture catalogue with owner-visible registrations and explicit bindings |
| Published workflow version | Immutable automation publication and dependency digest | Resolve and pin the actual publication, preserving authorization |
| Required output fields validated after Return | Return currently returns any value | Enforce the output contract on the backend |
| Millisecond deadline and graph step budget | Seconds and executed instruction budget | Account for compiler overhead without granting more logical work |
| In-memory draft/preview receipt | Durable definition/action journal | Persist versioned drafts and return genuine execution receipts |

