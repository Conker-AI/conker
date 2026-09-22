# Documentation

Start with the [product overview and screenshots](../README.md), then choose the guide for the work you want to do. Plans describe intended behavior; they do not prove a feature is connected.

Start with the [Conker project map](conker-project.md) for ownership, readiness and setup.

## Run and develop

| Guide | Use it for |
| --- | --- |
| [Dashboard](../dashboard/README.md) | Local frontend setup, actual routes, fixture limits and checks. |
| [Current state](current-state.md) | Source-verified implementation boundaries and integration gaps. |
| [Contributing](../CONTRIBUTING.md) | Change scope, verification and repository hygiene. |
| [Browser authentication](browser-auth.md) | HTTPS gateway, host setup, session recovery and rollout prerequisites. |
| [Live gateway workspace](gateway-workspace.md) | Fixture/live separation, authenticated conversation transport and remaining integration limits. |
| [Recorded tasks and Activity](live-activity.md) | Durable task tracking, exact run records, concurrent edits and recovery. |
| [Protected writes and turn recovery](gateway-verification-recovery.md) | Fresh operation-bound verification, verified unlock deadlines and durable submission identities. |
| [Completion plan and evidence](completion-plan.md) | Ordered launch work, local checkpoints and acceptance evidence. |
| [Backup and recovery](recovery.md) | Capturing stores, verifying snapshots and held restoration. |

## Understand the system

| Guide | Use it for |
| --- | --- |
| [Vocabulary](../CONTEXT.md) | Shared meanings for sessions, actions, evidence and modules. |
| [Philosophy](philosophy.md) | Product purpose and operating principles. |
| [Architecture](architecture.md) | Service responsibilities and the intended connected architecture. |
| [Module contract](module-contract.md) | Health, configuration and external service conventions. |
| [Decisions](adr/) | Accepted architectural decisions and their tradeoffs. |
| [Repository organization](repository-organization.md) | Independent modules, shared planning and an optional organization. |

## Work on the interface

- [Dashboard design contract](../dashboard/DESIGN.md): current component, theme, layout and interaction authority.
- [Design language](design-language.md), [template reference](template-reference.md), [color contract](color-system.md): product direction and the selected shadcn foundation.
- [Character Studio](../dashboard/CHARACTER_STUDIO.md): authored identity, appearance, voice configuration and preview boundaries.
- [Call interface](../dashboard/CALL_INTERFACE.md): channel controls, captions, pause, mini view and unconnected services.
- [Chat delivery plan](chat-delivery-plan.md): bounded, proposed next frontend milestone.
- [AI chat interaction catalogue](ai-chat-ui-inventory-2026-09-19.md): browser research with selectable features and dated implementation follow-ups.

## Plans and history

- [Roadmap](roadmap.md): checkpoint order and linked issue history, not a live health report.
- [Open issues](open-issues.md): recorded integration questions and defects; verify current status before implementation.
- [Visual control workspace proposal](workspace-control-plan.md): flows, teams, memory exploration and system controls; proposed, not implemented by this documentation pass.
- [Screen map](screens.md), [dashboard vision](dashboard-vision.md), [UX pass](dashboard-ux-pass.md): design history. The active route table is in the dashboard guide.
- [Research](research/): dated investigations and source evidence.
- [Concept archive](concept/): original ideas; not automatically approved requirements.
- [Changelog](../CHANGELOG.md): repository changes; each service maintains its own changelog.

## Documentation authority

Current code and verification establish what runs. `dashboard/DESIGN.md` governs the active frontend. Accepted ADRs govern architectural decisions; changes to those decisions must be explicit. `current-state.md` records dated observations, while plans and research preserve proposals and history. Do not convert a screenshot or a planned feature into a claim of a working backend.
