# Conker project map

One product, independently usable services. Each repository owns its API, tests, release history and deployment configuration.

| Repository | Owns |
| --- | --- |
| [Conker](https://github.com/alexeybe1kin/conker) | Dashboard, product documentation, local launcher, optional decision service |
| [Pi](https://github.com/alexeybe1kin/pi) | Sessions, turns, tasks, model roles, context assembly and separate browser gateway |
| [MemoryGate](https://github.com/alexeybe1kin/memorygate) | Evidence, provenance, structured memories, retrieval and deletion |
| [ToolGate](https://github.com/alexeybe1kin/toolgate) | Tools, immutable workflows, grants, approvals, credentials and execution receipts |

| [SystemGate](https://github.com/alexeybe1kin/systemgate) | Read-only host/container/backup telemetry; no execution or mutation endpoints |
| [Embeddings](https://github.com/alexeybe1kin/embeddings) | Stateless text-to-vector service; callers own indexes |

## Request path

Browser → authenticated gateway → Pi → selected answer/helper provider.
Pi retrieves authorized candidates from MemoryGate, optionally ranks previews with its configured helper, and preserves original records and citations. Pi invokes tools and published workflows through ToolGate. A schedule triggers a defined capability without needing a model to reconstruct its workflow each morning.

The dashboard is the common control surface; services remain execution and storage authorities. A graph editor is an authoring interface, not the workflow runtime.

## Start here

- [Frontend preview](../dashboard/README.md): no backend needed; sample data is explicit.
- [Connected local stack](local-windows-startup.md): isolated Windows services and stores.
- [Integration evidence](local-integration-plan.md): checks, receipts and limitations.
- [Workflow contract](tool-workspace-live-contract.md): publication, access and runs.
- [Decision service](../services/decisions/README.md): optional CPU Laya and measured limits.
- [Design contract](../dashboard/DESIGN.md): shared frontend rules.

## Readiness

| Area | Current boundary |
| --- | --- |
| Conversations | Local connected path verified; quality depends on the model |
| Memory | Retrieval and provenance verified; this machine has no semantic embedding backend configured |
| Workflows | Editor publication, nested execution, approvals and explicit chat invocation verified locally |
| Calls and character | Interactive frontend; complete realtime voice/vision pipeline remains future integration |
| System | Several controls and telemetry remain preview-only |
| Ubuntu | Destination-server acceptance outstanding |

## Shared delivery

Change the repository owning the behavior. Test API producers and consumers before declaring integration complete. Commit independently and record exact repository revisions for deployment; a project board does not create an atomic cross-repository release.

For the planned GitHub Project, use one cross-repository board with service, phase (Frontend / Backend / Integration), status, priority and acceptance evidence. Link issues from their owning repositories. No repository move or monorepo is needed. No remote project is created by this change.
