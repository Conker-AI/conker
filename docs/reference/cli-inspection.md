# CLI inspection

`conker inspect RESOURCE` is the headless, read-only view of Conker's live control
plane. It executes inside the gateway container, uses the same fixed Pi or
ToolGate routes as the authenticated dashboard, and prints the returned JSON for
scripts, support bundles, and diffable snapshots.

Supported resources are:

| Resource | Authority | Service route |
| --- | --- | --- |
| `agents` | owner | `/agents` |
| `approvals` | ToolGate owner | `/v2/owner/requests` |
| `artifacts` | owner | `/artifacts` |
| `boundaries` | owner | `/setup/boundaries` |
| `character` | owner | `/characters/companion` |
| `character-export` | owner | `/characters/companion/export` |
| `character-history` | owner | `/characters/companion/history` |
| `call-capabilities` | owner | `/calls/browser/capabilities` |
| `file-roots` | owner | `/system/files/roots` |
| `inventory-containers` | owner | `/system/inventory/configured/containers` |
| `inventory-services` | owner | `/system/inventory/configured/services` |
| `jobs` | owner | `/jobs` |
| `memory` | owner | `/memory/objects` |
| `models` | owner | `/models/configuration` |
| `projects` | owner | `/projects` |
| `setup` | owner | `/setup/status` |
| `teams` | owner | `/collaboration/teams` |
| `proposals` | runtime | `/proposals` |
| `runs` | runtime | `/runs` |
| `sessions` | runtime | `/sessions` |
| `tasks` | runtime | `/tasks` |
| `tool-capabilities` | ToolGate owner | `/v2/owner/editor-capabilities?kind=tool&limit=50` |
| `tool-drafts` | ToolGate owner | `/v2/owner/editor-drafts?limit=50` |
| `tools` | runtime | `/tools` |
| `workflow-capabilities` | ToolGate owner | `/v2/owner/editor-capabilities?kind=workflow&limit=50` |

Validated identity forms provide paired detail reads: `conker inspect approval
REQUEST_ID` maps to `/v2/owner/requests/{id}`, and `conker inspect
session-settings SESSION_ID` maps to `/sessions/{id}/settings`. `conker inspect
submission REQUEST_ID` maps to `/turn-submissions/{id}` and requires the retained
16-128 character request identity. All IDs are restricted to ASCII letters, digits,
underscores, and hyphens before any network call.
`conker inspect file-listing REQUEST_ID` maps to one directory metadata receipt,
and `conker inspect inventory REQUEST_ID` maps to one redacted host-observation
receipt. Their request IDs are 16-100 characters under the same alphabet.
`conker inspect call CALL_ID` and `active-call CONVERSATION_ID` select one typed
call or the active call for one conversation; neither exposes a media route.
Tool editor detail views use a 1-64 character draft ID beginning with a letter.
`tool-access` additionally requires the exact positive publication version and
64-character lowercase SHA-256 digest. Access and run-history reads use both the
owner and scoped execution credentials; all other editor reads use only the owner
credential.

The mapping is compiled into the gateway. The command does not accept URLs,
paths, methods, headers, or credentials from the caller. It validates every route
against a compiled Pi or ToolGate service contract, sends only the credential set
for that route's authority, disables ambient proxies and redirects, and accepts
only a JSON object. Responses are bounded to 8 MiB by default; only the three
Companion character views use the existing isolated 66 MiB media envelope.
Upstream bodies are not included in errors.

This is inspection and export coverage, not write parity. Mutations continue to
use their typed owner operations, concurrency checks, approvals, and recovery
contracts. Adding a write command requires using that same service operation; it
must not create a second host-only implementation.
