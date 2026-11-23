# Contributing to Conker

Thanks for helping. Start with the [developer guide](docs/5-developing.md). It covers where code
lives, how to run checks and what "done" means. To try Conker first, follow the
[Quickstart](README.md#quickstart) in the README: the interface with sample data in five minutes.

## In short

1. Make the change in the repository that owns the behavior. The services live in their own repos
   under [Conker-AI](https://github.com/Conker-AI).
2. Work on a branch. In this repo, `python scripts/new_worktree.py NAME` makes a worktree from the
   latest `main` with the dashboard dependencies installed. Keep commits focused, and don't
   reformat unrelated code. Before pushing, `python scripts/prepush.py` runs the CI checks your
   changed files can break.
3. Frontend: in `dashboard/`, run what CI runs: `npm run lint`, `npm run typecheck`,
   `npm run format:check`, `npm run build`, `npm run check`, `npm run test:unit` and `npm run e2e`.
   Look at the affected screens at phone and desktop width, in light and dark themes
   (`npm run shots` against `npm run dev` takes them at 320, 390 and 1280 px).
4. Backend: test the API boundary, including the failure path.
5. If what works has changed, update [docs/status.md](docs/status.md). Put plans and ideas in a
   GitHub issue, not a new doc.
6. In the pull request, say what the user sees, how you checked it, and what's still missing.

## Good first tasks

Small, self-contained and open as of November 2026. Each says where to look and when it is done;
open an issue or a draft pull request to claim one.

- **Docs name npm scripts that exist.** Add a test that every `npm run NAME` named in `docs/` and
  the READMEs is in `dashboard/package.json` (`dashboard/README.md` still names a missing
  `check:navigation`).
- **Keep the ADR table complete.** Add a test that every `docs/adr/NNNN-*.md` has a row in the
  decisions table of `docs/5-developing.md` (0012-0014 were just added by hand).
- **Find paths and names that no longer exist.** Add a test that every backticked repo path in
  `docs/` exists (a short allowlist for Pi's own docs and archived permalinks, each with a reason).
- **Check heading anchors.** `tests/test_doc_links.py` skips `#anchor` links; resolve them against
  the target file's headings with GitHub's slug rules, with a self-test for a broken one.
- **Bring the developer guide's frontend checks up to date.** "Before handing off" in
  `docs/5-developing.md` lists `build`, `design:check:test`, `check:gateway` and `e2e`; CI
  (`.github/workflows/dashboard.yml`) also runs `lint`, `typecheck`, `format:check`, `check` and
  `test:unit`. Done when the list matches CI and names `python scripts/prepush.py`.
- **Turn the React lint rules back on in the runtime workspace.**
  `dashboard/src/components/gateway/runtime-workspace.tsx` starts with an `eslint-disable` for
  three rules: `react-hooks/refs`, `react-hooks/set-state-in-effect` and
  `react-hooks/preserve-manual-memoization`. Fix what they find and delete the comment; done when
  `npm run lint`, `npm run build` and `npm run check` pass.
- **Format the files moved out by the dashboard split.** `dashboard/.prettierignore` skips
  `runtime-chat-start.ts`, `runtime-submissions.ts`, `fake-gateway-agents.ts`,
  `fake-gateway-projects.ts`, `fake-gateway-search.ts`, `fake-gateway-usage.ts` and
  `control-schemas.ts` (its last block). Drop those lines, run `npm run format`, and fix any
  `npm run check` script that matched the old text; done when `npm run format:check` and
  `npm run check` pass.

Never commit secrets, `.env` files, real conversations, recordings or backups.
