# 5 · Developing Conker

## Where code lives

| Repository | Owns |
|---|---|
| [conker](https://github.com/Conker-AI/conker) (this one) | Dashboard, deployment, docs, optional decision service |
| [pi](https://github.com/Conker-AI/pi) | Conversations, model routing, tool calls, **and the Gateway** |
| [memorygate](https://github.com/Conker-AI/memorygate) | Evidence, memories, retrieval, deletion |
| [toolgate](https://github.com/Conker-AI/toolgate) | Tools, workflows, approvals, credentials, receipts |
| [systemgate](https://github.com/Conker-AI/systemgate) | Read-only machine health |
| [embeddings](https://github.com/Conker-AI/embeddings) | Text to vectors (via Ollama) |

Change the repository that owns the behavior. A change that crosses repositories isn't done until
both sides are tested together.

### This repository

```text
dashboard/          React + Vite + TypeScript + shadcn frontend (the product UI)
services/decisions/ Optional Laya decision service (routing, memory ranking)
deploy/ubuntu/      Server deployment scripts and acceptance checks
scripts/            Local Windows stack, recovery, verification scripts
tests/              Installer and deployment tests
design-system/      Earlier design foundation (the dashboard is the active one)
docs/               These docs; reference/ for deep dives; archive/ for history
versions.env        Pinned module versions, the only place pins live
```

## Frontend

```sh
cd dashboard
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Before handing off:

```sh
npm run build
npm run design:check:test
npm run check:conversation
npm run check:gateway      # if you touched live/gateway code
```

- UI rules: [dashboard/DESIGN.md](../dashboard/DESIGN.md). Colours and fonts come from the design
  tokens. Don't add raw hex values or font-families; CI rejects them.
- All data goes through the `ConkerClient` interface (`src/lib/api`). Fixture mode and gateway mode
  are separate, and gateway mode never falls back to sample data.
- Check affected screens at phone width and desktop width, in light and dark themes.

## Backend services

Python 3.11+, FastAPI, `ruff`, type hints on anything crossing a service boundary. Every service
has the same shape:

- `GET /health` in the shared format, reporting `degraded` honestly
- generated `openapi.json`, a `README.md` and a `CHANGELOG.md`
- a `docker-compose.yml` that runs it standalone

Details: [reference/module-contract.md](reference/module-contract.md).

## Done means

1. You **ran it**, not just reasoned about it.
2. Tests cover it at the boundary (the API), including the **failure path**.
3. Approvals: a replayed approval must fail. Test it.
4. History: nothing rewrites an earlier turn. Test it.
5. Docs are updated: [status.md](status.md) if what works changed, the service README if its API
   changed.
6. Nothing left behind: no commented-out code, debug prints or scratch files.

## Where things go

| You have… | Put it in |
|---|---|
| A bug or a task | A GitHub issue in the owning repository |
| A plan or a proposal | A GitHub issue (or a discussion), not a new doc |
| A change to what works | [status.md](status.md) |
| A hard-to-reverse decision | A new ADR in [adr/](adr/) |
| Research notes, audits, logs | An issue comment, or `archive/` if it must be kept |

The docs stay small on purpose. If a new document seems necessary, update one of the five first.

## Decisions (ADRs)

| # | Decision |
|---|---|
| [0001](adr/0001-build-pi-in-house.md) | Build Pi ourselves instead of adopting an agent framework |
| [0002](adr/0002-transcripts-and-evidence.md) | Pi owns transcripts; MemoryGate owns evidence |
| [0003](adr/0003-the-gates-go-headless.md) | Services have no UI; the dashboard is the only UI |
| [0004](adr/0004-multilingual-embeddings-from-a-sidecar.md) | Multilingual embeddings from a separate service |
| [0005](adr/0005-toolgate-is-the-only-action-path.md) | Every action goes through ToolGate |
| [0006](adr/0006-autonomy-is-a-configurable-policy.md) | You configure autonomy per kind of action |
| [0007](adr/0007-three-swap-contracts.md) | Memory, tools and embeddings are swappable |
| [0008](adr/0008-supply-chain-policy.md) | Own the thin layers; few dependencies |
| [0009](adr/0009-radix-primitives-for-now.md) | Radix UI primitives for now |
