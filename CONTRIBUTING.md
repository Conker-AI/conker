# Contributing to Conker

Thanks for helping. Start with the [developer guide](docs/5-developing.md). It covers where code
lives, how to run checks and what "done" means.

## In short

1. Make the change in the repository that owns the behavior. The services live in their own repos
   under [Conker-AI](https://github.com/Conker-AI).
2. Work on a branch. Keep commits focused, and don't reformat unrelated code.
3. Frontend: run `npm run build`, `npm run design:check:test` and `npm run check:conversation` in
   `dashboard/`. Look at the affected screens at phone and desktop width, in light and dark themes.
4. Backend: test the API boundary, including the failure path.
5. If what works has changed, update [docs/status.md](docs/status.md). Put plans and ideas in a
   GitHub issue, not a new doc.
6. In the pull request, say what the user sees, how you checked it, and what's still missing.

Never commit secrets, `.env` files, real conversations, recordings or backups.
