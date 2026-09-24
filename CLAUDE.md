# Project rules

**Conker** is a self-hosted personal AI companion. This repository holds the dashboard, deployment
and docs. The services live in their own repositories under
[github.com/Conker-AI](https://github.com/Conker-AI).

## Read first (in order, about 20 minutes)

1. [docs/1-overview.md](docs/1-overview.md): what it is, and the glossary. Use those words.
2. [docs/2-how-it-works.md](docs/2-how-it-works.md): services and flows
3. [docs/status.md](docs/status.md): what actually works today
4. [docs/5-developing.md](docs/5-developing.md): repos, checks, definition of done
5. The [ADRs](docs/adr/) that touch what you're changing

Frontend work: also [dashboard/DESIGN.md](dashboard/DESIGN.md) and
[dashboard/AGENTS.md](dashboard/AGENTS.md).

**Don't read `docs/archive/` unless asked.** It's historical and often out of date.

## Rules

- **Build, don't document.** No new plan, audit, progress or acceptance files. Plans and tasks go
  in GitHub issues. Update [status.md](docs/status.md) when what works changes, and nothing else.
- **Keep the docs small.** Update one of the five docs instead of adding a new one. Each stays
  about two pages.
- **Honest status.** Never mark a preview feature as live. A health check that can't reach its
  dependency reports `degraded`, never `ok`. No silent fallbacks.
- **Boundaries.** Every action on the outside world goes through ToolGate. The browser only talks
  to the Gateway. History is append-only. Approvals are single-use.
- **Done means run.** You ran it, tested the failure path, and checked the UI at phone and desktop
  width.
- **Design tokens only.** No raw hex values or font-families in application code.
- **Git.** Branch per task (`<type>/<subject>`). `main` stays green. Commit messages say why.
- Contradicting an ADR is allowed if you say which one and why, and record the new decision.

## Skills worth using

`claude-api` for anything that calls a model · `run` to verify changes · `code-review` and
`security-review` before merge · `prototype` for uncertain UI · `grilling` to stress-test a plan.

Issues: GitHub issues in `Conker-AI/conker` via `gh` (see
[docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)).
