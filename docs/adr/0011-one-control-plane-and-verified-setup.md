# ADR-0011 — One control plane and verified setup

**Status:** Accepted · 2026-09-26

## Context

Conker is a personal-agent harness, not only a chat interface. An owner needs to
configure the companion, models, memory, tools, approval boundaries, privacy,
budgets and backups. Today those choices are split across shell-generated
environment variables, service-specific APIs, fixture-only UI state and direct
host commands. This creates two products: the capable harness and a partial UI.

Giving the browser generic access to `.env`, Docker or the host filesystem would
close the feature gap by destroying the security boundary. Hiding configuration
in the CLI would preserve the boundary by failing the product requirement.

## Decision

**Conker has one typed owner control plane.** The CLI, dashboard and automations are
clients of the same versioned operations. A supported setting is never implemented
only in a React store, shell branch or private service endpoint.

The system separates two planes.

### Host bootstrap plane

The host CLI owns the minimum authority required before a trusted browser session
can exist:

- install and upgrade immutable release manifests;
- create service identities and persist encryption material;
- establish the HTTPS origin and owner password;
- start, stop, back up and enter isolated recovery;
- reconcile and promote a held recovery.

This plane uses narrow commands and local host authority. It is not exposed as a
generic browser terminal, Docker socket, filesystem editor or environment editor.
Where a browser workflow assists bootstrap, it invokes a named, schema-bounded
operation with one-time authority and receives a redacted receipt.

### Owner control plane

After authentication, the owner control plane configures the running product:

- companion identity and instructions;
- model providers, catalogue, roles and routing;
- memory policy, review, correction and forgetting;
- tool credentials, grants, approval floors, limits and budgets;
- quiet hours, notifications and other owner preferences;
- backup policy and verification status;
- setup progress and capability readiness.

Every write is schema-bounded, revision-checked, idempotent where retry can occur,
and produces a durable redacted receipt. Secrets are write-only. Reads report only
presence, scope, validity and last verification.

## Setup state machine

Setup is durable product state, not a client-side checklist. Steps have stable IDs,
prerequisites and one of these states:

- `not_started`
- `in_progress`
- `blocked`
- `skipped`
- `complete`
- `degraded`

The initial steps are `security`, `companion`, `model`, `memory`, `capabilities`,
`boundaries`, `protection` and `rehearsal`.

Completion is derived from current live evidence plus a durable receipt. Visiting a
page or saving a draft never completes a step. A completed step may become degraded
when its evidence expires or the underlying capability fails. Optional steps can be
skipped without being represented as complete.

The state machine returns:

- schema and setup-state versions;
- current step and overall readiness;
- each step's state, prerequisites and blocking reason code;
- evidence timestamps and non-secret capability summaries;
- one bounded recommended next operation.

The CLI exposes the same state through `conker setup status` and performs the same
operations as the UI. `conker doctor` and the UI health flow consume one diagnostic
contract and therefore cannot disagree about recovery instructions.

## Authority and routing

- Browser setup reads and writes use the existing authenticated gateway.
- Ordinary setup reads require a signed-in owner session.
- Setup writes require operation-bound password verification unless an existing ADR
  explicitly defines a narrower session-only mutation.
- Gateway routes are explicit allowlists; there is no arbitrary reverse proxy.
- Host bootstrap operations use separate one-time or local authority and never reuse
  Pi runtime, ToolGate execution or owner-approval credentials.
- A setup operation cannot widen its own route allowlist, issue a broader credential
  or modify Conker's code.

## Configuration representation

The authoritative configuration is a versioned typed document assembled from the
owning services. It records public configuration and secret references, not secret
values. Each service remains authoritative for its domain and provides revisioned
owner operations; the control plane composes their capability status.

Host deployment configuration is generated from the immutable release manifest and
validated before service recreation. Application settings belong in durable service
stores where they can be changed transactionally; new product settings should not
default to environment-only configuration.

## Consequences

- The existing fixture/connected application split must disappear. Runtime mode
  selects adapters and capabilities, not a second router or product shell.
- Environment variables remain suitable for bootstrap addresses and credentials,
  but not as the only writable store for ordinary owner preferences.
- Setup can be resumed from another authenticated browser because progress is not
  local UI state.
- UI progress cannot lie when a service is missing, a model fails its probe or a
  backup has never been verified.
- Full browser control does not imply general host execution authority.
- The first implementation slice is a read-only, versioned setup-status projection;
  writes follow one domain at a time with consumer/provider tests.

## Required acceptance

1. A new installation reaches a verified first local conversation without editing
   files or using a service-specific admin API.
2. The same setup can be inspected and continued through CLI and UI with identical
   state and reason codes.
3. Wrong password, browser reload, process restart and dependency outage lose no
   completed work and grant no extra authority.
4. Secret values never appear in setup status, receipts, logs, exported config or
   browser storage.
5. An unavailable capability remains blocked or degraded; it is never marked
   complete from intended configuration.
6. The exact released image matrix passes setup and rehearsal acceptance before the
   compatibility manifest is promoted.
