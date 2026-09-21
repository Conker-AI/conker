# Connecting the existing tool editor

Inspected 22 September 2026 against the dashboard ToolDefinition and ToolGate V2Automation implementations. This is the remaining integration contract, not a claim that the editor is live.

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

## Next implementation sequence

1. Define a bounded, versioned editor document and authoritative backend validation.
   Save invalid/disconnected drafts without allowing publication. Use revision conflicts
   to prevent one editor from overwriting another.
2. Add narrow ToolGate owner endpoints for editor documents and safe registry metadata,
   then explicit gateway routes using the existing owner credential. No generic admin proxy.
3. Inject a workspace client into the existing editor instead of importing fixture state.
   Preserve canvas/source/configure modes and use password-bound operations for writes.
4. Compile supported graphs with value-semantic parity tests against actual ToolGate
   execution. Reject unsupported constructs with a node-specific error. Do not substitute
   preview output for execution or treat arbitrary source text as executable Python.
5. Publish separately, bind explicit execution grants, run with a stable action ID,
   and show approval, failure, uncertainty and completed receipts from ToolGate.
6. Verify a saved graph survives refresh; test a calculation and both condition branches;
   then one scoped connector through owner approval. Check desktop/mobile editor layouts.

## Runtime defects found during mapping

ToolGate commit `5d5f38a` fixes a validated `in` condition that was unsupported at runtime,
restores loop variables (including absent/null values and early exits), and rejects
non-finite calculations before they enter result receipts. The workflow/core/approval
test selection passed 68 tests. ToolGate was restarted locally with these changes.

The translation layer and live editor are still pending. The current live Tools screen
is a scoped inventory, not the complete editor.
