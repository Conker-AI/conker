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
