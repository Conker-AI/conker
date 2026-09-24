# Organizing the Conker ecosystem

Recommendation, September 19, 2026. This document proposes organization; it does not create a GitHub Project, organization, repository transfer or new permissions.

## Keep the modules independent

Retain six repositories: `conker`, `pi`, `toolgate`, `memorygate`, `systemgate` and `embeddings`. Conker owns the combined experience and deployment pins. Each module owns its service API, standalone setup, tests, security model, changelog and releases.

MemoryGate and ToolGate should describe their generic purpose first and list Conker as an integration. Sharing a roadmap must not make a standalone installation require the Conker dashboard. Avoid a monorepo migration merely to make the GitHub page look organized.

## Three different GitHub concepts

| Concept | Job | Recommendation |
| --- | --- | --- |
| Repository | Stores code, docs, issues and releases for a component. | Keep current module boundaries. |
| Project | Tracks issues and pull requests in table, board and roadmap views. | One cross-repository **Conker ecosystem** project. It organizes work, not source ownership. |
| Organization | A shared identity and administrative home for repositories and teams. | Optional next step when the name, ownership and access policy are settled. Not required for a shared project. |

[GitHub Projects documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) and [organization documentation](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/about-organizations) describe these distinct roles. AIRI uses a clear product README and points to a related project organization; that presentation can inspire Conker without copying its dependency structure.

## Proposed project setup

Start under the existing owner account; keep visibility private while any linked integration work is private. Link issues/PRs from their owning repositories rather than copying an entire backlog into Conker.

Fields:

- **Status:** Backlog, Ready, In progress, Review, Verified, Blocked.
- **Component:** Dashboard, Pi/Gateway, ToolGate, MemoryGate, SystemGate, Embeddings, Integration.
- **Priority:** Critical, High, Normal, Low.
- **Checkpoint:** the named delivery goal or architectural checkpoint.
- **Readiness:** Local UI, Fixture preview, Service implemented, Integrated, Release verified.

Views:

1. **Now:** ready/in-progress/review work for the active goal.
2. **Dependencies:** integration blockers grouped by component.
3. **Roadmap:** checkpoints and cross-repository parent issues.
4. **Quality:** regressions, security boundaries, documentation and release prerequisites.

A cross-module capability gets a Conker integration issue with linked implementation issues in the relevant service repos. For example, browser approvals require a ToolGate owner API, gateway integration and a dashboard adapter. Closing one child must not automatically call the whole feature live.

Simple automations may move a linked item to Review when a PR opens or mark its implementation complete after merge. **Verified** requires evidence against the acceptance checklist; a merged PR alone is insufficient for integration readiness. Do not bulk-create 160 research items before selecting the active scope.

## If an organization is created later

Choose one umbrella identity, with a profile README introducing the ecosystem and pinned module repositories. A transfer plan must cover permissions, CI secrets, GHCR image paths, release automation, package references, redirects and installer pins. Keep repository visibility unchanged unless deliberately reviewed. No transfer is needed to finish the current frontend milestone.

Every repository should have a short product introduction, honest status, real screenshots where applicable, standalone setup, API/architecture links, test commands, changelog and appropriate license notices. Conker's README is the product entrance; module READMEs are the independent-service entrances.
