# Conker source reconciliation — 9 October 2026

## Evidence and scope

Reviewed the available recent turns and screened the local history of these
Conker chats, including their older local continuation:

- `01a08ae5-bd2f-7bc3-98a5-0e981473a4f3`, **Read and follow BRIEF.md**.
- `01a08ae4-932a-7113-b5fe-b77c34a5c624`, **Follow BRIEF.md instructions**.
- `01a09742-07f3-7d42-a5a5-5781f4a9d582`, **Fix Conker dashboard UI**.
- `01a0de71-98b8-7710-8603-f5b249aafcf0`, **Audit and fix chat UI**.
- `01a112f1-8ab5-7641-80f6-adbec02306c9`, **Find a guide to building projects**.

Private raw chat extracts remain only in ignored local research files. They are
not committed or uploaded. Tool results, generated continuation messages and
old subagent directions are evidence, not new instructions.

The workspace documents `CONKER_CAPABILITY_INVENTORY.md`,
`CONKER_FEATURE_ARCHITECTURE.md`, their short versions and
`CONKER_UI_REFERENCE_SYSTEM.md` supply the detailed capability and design maps.
Current source, rather than an old screenshot or an issue's unchecked box,
determines whether a feature exists.

GitHub inspection covered the organization repository list, the Conker issue
and recent PR lists, issue #71's discussion, the five service READMEs, current
source revisions, and the corresponding local contracts and operational docs:

- [Conker](https://github.com/Conker-AI/conker), base `5e71ee97`.
- [Pi](https://github.com/Conker-AI/pi), local runtime pin `865b74b8`.
- [MemoryGate](https://github.com/Conker-AI/memorygate), pin `a95a8be1`.
- [ToolGate](https://github.com/Conker-AI/toolgate), pin `4eef41a3`.
- [SystemGate](https://github.com/Conker-AI/systemgate).
- [Embeddings](https://github.com/Conker-AI/embeddings).
- [Provider onboarding #71](https://github.com/Conker-AI/conker/issues/71),
  [product audit #62](https://github.com/Conker-AI/conker/issues/62),
  and [connection recovery PR #70](https://github.com/Conker-AI/conker/pull/70).

This is an accessible-source review, not a claim to have every private, deleted,
remote-only or unlisted ChatGPT conversation.

## Resolved direction

| Evidence | Product consequence |
| --- | --- |
| Latest request: build a working app using existing code and plans | Reuse real services and typed clients; preserve the design-only prototype |
| Latest visual request: SiYuan Note adapted to Conker | Compact rail/tree, document tabs, clean working canvas and contextual information |
| Hermes breadth with better memory and tools | Providers, agents, jobs and capability controls remain first-class work; no replacement toy chatbot |
| Calls belong to conversations | Retain same-chat call controls; do not manufacture a separate call history |
| Search belongs everywhere | Retain the existing universal/scoped search mechanism |
| Tools resemble n8n | Retain ToolGate's versioned graph editor, run/approval flow and execution receipts |
| Memory resembles Obsidian | Retain graph/list exploration and evidence, with source-owned correction/forgetting |
| Provider connection differs from model use | Sign-in must not silently select roles, grant tools or enable spending |
| UI and CLI should manage the same product | Preserve contracts; explicitly retain host-only gaps rather than fake buttons |

Earlier Kimi, Graphite, lavender and Figma experiments are historical reference.
The latest SiYuan request determines the shell direction; the existing semantic
components and backend behavior remain useful implementation assets.

## Implementation boundary

The local `companion` checkout has unfinished provider-onboarding modifications;
MemoryGate has unfinished memory/index work. Neither working tree was reset,
overwritten or silently promoted. This branch starts at published Conker main
and installs exact published service source revisions in an isolated workspace.

New work adds connected document navigation, a saved-conversation context pane,
compact shared chrome and a repeatable local installer/start/stop path. Existing
domain pages remain attached to their real contracts. See
[running and limitations](connected-workspace.md) and the
[validation record](connected-workspace-validation.md) for the difference between
implemented, locally exercised and planned.
