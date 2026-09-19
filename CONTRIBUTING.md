# Contributing to Conker

Conker combines independent services with an owner-facing dashboard. Keep each change in the repository that owns it. Start with the [documentation index](docs/README.md) and [current implementation state](docs/current-state.md).

## Choose the right scope

- Frontend work: `dashboard/`, governed by `dashboard/AGENTS.md` and `dashboard/DESIGN.md`.
- Installation, compatibility pins and cross-module deployment: this repository's root, `scripts/` and `tests/`.
- Runtime, tool execution, memory, observation or embeddings: the corresponding [module repository](README.md#modular-by-design).
- Cross-module changes: link the dependent work and prove the integration separately. Do not make a successful UI fixture count as a connected service.

Work on a focused branch. Keep commits reviewable and avoid unrelated formatting, generated build output or a wholesale directory move. Preserve existing work and do not rewrite shared history as cleanup.

## Frontend development

Use Node.js 22.12+ or 24+:

```sh
cd dashboard
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Before handing off a frontend change:

```sh
npm run build
npm run design:check:test
npm run check:conversation
```

Run ESLint for the files you changed and the relevant named checks in `dashboard/package.json`. Call/media work additionally needs the voice/call checks; theme/layout work needs theme/navigation checks. The repository contains dormant template examples: do not claim a globally clean lint run based on scoped lint, or rewrite unrelated examples to hide their failures.

Inspect actual affected screens on desktop and narrow mobile, in the relevant themes and states. Verify interactions, focus, overflow, stopped/error states and browser console output. Screenshots are evidence only for the state they show. Document browser/media limitations rather than pretending a device test ran.

## Deployment and backend changes

Read [browser authentication](docs/browser-auth.md), [module contracts](docs/module-contract.md) and [recovery](docs/recovery.md) first. Check relevant CI jobs in `.github/workflows/ci.yml`; Linux/Docker deployment drills are distinct from offline source tests and can require isolated test volumes.

`./install.sh --check` checks prerequisites. Installation provisions state; `--dry-run` can still write configuration and is not a read-only audit. Never test recovery against the owner's live stores by default.

## Documentation and assets

Keep the root README introductory and link deeper technical material from `docs/README.md`. Update current routes and behavior when implementation changes. Distinguish accepted decisions, proposals, historical research and verified implementation.

Use actual fixture screenshots for public documentation. Store curated images in `docs/images/` with date, route and provenance; keep test output in ignored `test-results/`. Do not commit real conversations, microphone/camera recordings, provider keys, `.env`, browser profiles, backups or machine-specific scratch files. Preserve third-party notices and do not assume all character artwork inherits the code's licensing intent.

## Before a commit or pull request

1. Review `git status` and the complete diff; stage only the intended files.
2. Run appropriate checks and `git diff --check`.
3. Update the relevant docs and changelog when behavior or contracts change.
4. Describe the user-visible result, validation and remaining limitations.
5. Distinguish local commits, pushed branches, merged changes and deployed releases in the handoff.

Runtime credentials and owner approval authority must stay separate. Source code and fixture reviews do not authorize external actions, credential changes, public sharing or production deployment.
