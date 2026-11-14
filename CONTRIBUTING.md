# Contributing to Conker

Thanks for helping. Start with the [developer guide](docs/5-developing.md). It covers where code
lives, how to run checks and what "done" means.

## In short

1. Make the change in the repository that owns the behavior. The services live in their own repos
   under [Conker-AI](https://github.com/Conker-AI).
2. Work on a branch. Keep commits focused, and don't reformat unrelated code.
3. Frontend: run `npm run build`, `npm run design:check:test` and `npm run check:gateway` in
   `dashboard/`. Look at the affected screens at phone and desktop width, in light and dark themes.
4. Backend: test the API boundary, including the failure path.
5. If what works has changed, update [docs/status.md](docs/status.md). Put plans and ideas in a
   GitHub issue, not a new doc.
6. In the pull request, say what the user sees, how you checked it, and what's still missing.

## Good first tasks

Small, self-contained and open as of November 2026. Each says where to look and when it is done;
open an issue or a draft pull request to claim one.

- **Test the type-baseline check.** `scripts/check_types.py` holds CI's type baseline but has no
  test. Add `tests/test_check_types.py` (like `tests/test_check_file_sizes.py`) with the pyright
  call faked: a malformed baseline line, a file above and below its count, `--write`.
- **Shrink the type baseline.** `tests/test_settings_registry.py` and
  `tests/test_local_stack_config.py` have baselined pyright errors (Optional access, module
  attributes). Fix them type-only and delete their lines from `type-baseline.txt`.
- **Docs name npm scripts that exist.** Add a test that every `npm run NAME` named in `docs/` and
  the READMEs is in `dashboard/package.json` (a stale `dev:legacy-fixtures` was just removed by hand).
- **Keep the ADR table complete.** Add a test that every `docs/adr/NNNN-*.md` has a row in the
  decisions table of `docs/5-developing.md` (0012-0014 were just added by hand).
- **Find paths and names that no longer exist.** Add a test that every backticked repo path in
  `docs/` exists (a short allowlist for Pi's own docs and archived permalinks, each with a reason).
- **Check heading anchors.** `tests/test_doc_links.py` skips `#anchor` links; resolve them against
  the target file's headings with GitHub's slug rules, with a self-test for a broken one.
- **Say "updating" on the folded update card.** In `dashboard/src/components/inbox/update-cards.tsx`
  the folded offer card hides Update while an update runs but still reads as a new release. Show
  that it is updating and assert it in `dashboard/e2e/list-flows.spec.ts`; screenshots at
  320/390/1280 px, light and dark.

Never commit secrets, `.env` files, real conversations, recordings or backups.
