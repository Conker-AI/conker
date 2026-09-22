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

## Implemented owner draft transport

ToolGate `3fe882c` adds bounded editor documents in a separate durable
`v2_editor_drafts` table. Owner-only list/get/save routes preserve disconnected
drafts and require an expected revision; concurrent or stale saves fail with 409.
No tool, automation, publication or execution grant is created by saving.

Gateway `901a998` exposes only list/get/save at `/api/owner/editor-drafts` and
`/api/owner/editor-drafts/{id}`. Saves require the existing origin/CSRF checks and
one-use password proof bound to the exact path and body. Publish/run paths are not
admitted by this transport. ToolGate owner/draft tests passed 21 tests; gateway
API/verification tests passed 42 tests.

Verified against the running local HTTPS gateway using its trusted local certificate:
`local-draft-acceptance` saved as revision 1 and reloaded unchanged. An unverified
save and reuse of its consumed proof both returned 428. This labelled draft is
retained, unpublished, for the editor integration check.

## Live editor draft UI

The Tools inventory now links to `/tools?view=drafts`. This lists owner drafts,
loads additional pages explicitly, and searches the loaded records. New draft
creation and Save use the password-verified transport. `/tools?draft=<id>` mounts
the existing Build/Source/Configure editor, preserving its canvas and mobile step
list. The live editor does not use the preview draft cache or preview registry
records. Publication, duplication, deletion and test controls remain disabled.

Browser evidence: changed the description of `local-draft-acceptance`, verified
the owner password, and reloaded the saved revision 2. Created
`tool-9b565ddc-6708-41f3-8644-bcba5624fc91` (Browser draft acceptance) through the
phone-width UI. Inspected desktop 1440x1000 and phone 390x844 screenshots; no browser
console errors or warnings were reported. Build, focused lint, control/verification
checks and gateway import isolation passed. The browser retains its existing
64 KiB request limit; oversized drafts fail visibly before submission.

The translation layer, live connector binding, publication and execution remain
pending. These drafts cannot yet run; no preview receipts are presented as live
execution. Conflict errors preserve the unsaved editor state rather than retrying
an overwrite automatically.

## Backend graph validation

ToolGate now validates executable graph shape separately from draft storage.
Owner-only GET `/v2/owner/editor-drafts/{id}/validation` reports the exact saved
revision, node-specific issues, and graph validity. It explicitly reports
`execution_ready: false`; valid structure alone does not prove connector binding,
publication or permission readiness. This endpoint is not yet exposed in the UI.

Checks include a unique Input, complete branch edges, cycles, disconnected nodes,
bounded loop settings, typed publication versions, supported configuration fields
and references. A reference to another step must be available on every incoming
path, so a merged branch cannot accidentally read a value from the branch that
did not run. Seven graph tests plus draft/owner route tests passed (29 total).

## Published graph runtime and live publication

ToolGate `2acf86d` executes editor graphs as an explicit automation block through
the existing publication, scoped execution, approval and durable action journal.
It preserves graph values and per-node receipts, bounds nested work and output,
pins all branches' dependencies, and rejects unpublished execution. Known graph
failures are recorded as `WORKFLOW_FAILED`; uncertain dispatch remains held.
The focused graph/publication/workflow/approval selection passed 53 tests.

Owner publication now atomically binds an exact saved draft revision to a stable
automation identity and immutable version. Stale revisions, registry conflicts,
invalid graphs and missing dependencies fail without partially publishing.
Publishing does not create execution credentials or modify scopes. Owner approval
is the default; selecting automatic authorization still requires a scoped caller.
History reports whether dependencies remain available. It returns the latest 100
versions. The owner-publication and existing publication tests passed 14 tests.

The live editor now exposes Publish saved version and version history through a
password-bound gateway route. Gateway API/verification tests passed 43 tests;
the dashboard build, focused lint, verification and import-isolation checks passed.
Browser evidence: published revision 1 of Browser draft acceptance
(`tool-9b565ddc-6708-41f3-8644-bcba5624fc91`), confirmed version 1 in history after
reload, and inspected desktop 1440x1000 and phone 390x844 screenshots. No console
errors or warnings. No agent grant or workflow execution was made by this action.

Remaining: real registered capability selection, explicit execution grants, live
run controls and journal receipts in the editor. Test remains disabled until that
path is connected; it never substitutes the preview executor.
