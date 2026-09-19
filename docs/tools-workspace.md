# Unified Tools workspace

Decision, September 20, 2026. This extends Conker's existing frontend preview and does not connect external execution.

## Ownership

One owner-facing library contains callable capabilities. Connector and workflow remain implementation types; no competing Flows sidebar destination. ConkerClient is the transport boundary. ToolGate owns validated definitions, credentials, approvals, scoped execution and receipts. Pi remains the agent coordinator and the planned single schedule owner. A job references a published target and version rather than asking a model to reconstruct a procedure at each tick.

## Editor direction

Operate mode. Preserve Conker's established visual system. Library uses the shared responsive table. Opening a capability fills the workspace with a local Build / Source / Configure selector, a searchable step palette, central draggable canvas, contextual inspector, and optional test/history panel. The canvas should lead the first viewport; no separate large heading or stacked summary cards. Ports and directed edges represent actual stored connections. Selection reveals editable node properties and its recorded test output. A structured step list makes the same operations usable without dragging.

The definition is canonical. Canvas and JSON Source edit it; invalid source remains visible and cannot replace a valid draft. Arbitrary programming languages cannot round-trip losslessly to a graph. Code-module execution is deferred until a real sandbox and credential broker exist, and is not simulated with eval in the browser.

## Research informing composition

- [n8n workflow tools](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolworkflow/): a workflow can expose one callable interface.
- [Windmill flow editor](https://www.windmill.dev/docs/flows/flow_editor): selected-step editing, connected data, testing near execution, nested logic.
- [Windmill architecture](https://www.windmill.dev/docs/flows/architecture): structured definitions compose code modules and control blocks; code and flow remain distinct representations.
- [n8n Code node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/): custom code needs explicit runtime restrictions.
- [OWASP prompt injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html): untrusted content boundaries are one layer, not authority to perform actions.

## Security and production boundary

Fixtures never access real credentials, execute scripts, fetch destinations or call models. A credential reference is metadata, not a secret. A future trusted connector must attach credentials only for allowed destinations and operations. Injection into arbitrary code would expose a key to that code. Output leak checks and code-pattern scans are supplementary defenses, not proof of confinement. Reports must name the violated rule, never echo the secret. No live claim is made by a passing fixture test or a preview publish.

Production integration must translate the editor definition to ToolGate's current bounded workflow format, enforce policy server-side, bind child versions/approvals, use stable action IDs, handle cancellation and uncertain outcomes, and define restart recovery. Current ToolGate durable-execution documentation explicitly does not promise partial-workflow resume after restart. Scheduled jobs and arbitrary-code workers remain separate integration work.

## Implemented frontend slice

- Searchable shared library, create/duplicate/delete, viewport-filling editor, zoom/fit/maximize, keyboard-accessible step list and connection forms. Small screens default to readable steps with an optional graph.
- Build / Source / Configure share one bounded definition. Source is editable JSON, not arbitrary executable code. Node argument buffers and invalid source survive route navigation; explicit Apply/Discard prevents silent loss. Reload resets this fixture service.
- Input, connector calls, published tool calls, set-value, arithmetic, conditions, bounded list transformations and return. Published child versions are immutable; nested preview calls share aggregate step/item/time bounds and reject recursive calls. General loop bodies, joins, waits, retries, AI nodes and resumable workers are deferred.
- Input/output contracts, effect declarations, agent discovery metadata, credential references and execution budgets. Metadata does not grant access. Original scope, recent-use and Inbox links remain in Configure for registry tools.
- Fixture tests exercise the stored edges, record skipped branches and nested receipts, validate contracts, and retain test history. Only a test matching the exact current draft paints its graph. Historical receipts stay inspectable without pretending to describe changed code.
- Preview publishing, immutable versions, restoring into a draft, export and local run history. Nothing is registered with a real MCP server. Jobs are not yet bound to these preview versions.

## Verification

`npm run check:tools` covers validation, invalid references, missing optional values, branch behavior, contracts, version isolation, nested limits, recursion, deletion dependencies and fixture isolation. Browser checks cover both conditional paths, invalid source recovery, argument-buffer route persistence, Apply/Undo, preview publication, responsive composition and themes. Screenshot evidence is local under `dashboard/.impeccable/review/tools/`.
