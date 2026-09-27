# Product direction

This document records the product direction agreed on 26 September 2026. It is a
design constraint for future architecture, onboarding and UI work, not a claim that
the current product already implements it.

## Conker is a harness with a humane control surface

Conker is not primarily a chat application. It is a personal-agent harness that
must remain fully operable through a CLI while making its complete supported power
available through an approachable UI.

The CLI, UI and automation interfaces must operate the same control plane. There
must not be a simplified UI product beside a more capable CLI product, or settings
that can be changed through only one interface.

### Product contract

- Every supported configuration has a typed schema and a plain-language UI.
- Every UI mutation maps to an inspectable CLI command or control-plane operation.
- The CLI supports setup, inspection, export, validation, repair and headless use.
- The UI is the preferred path for ordinary owners; the CLI is not a prerequisite.
- Setup is resumable, idempotent and safe to repeat.
- Configuration is exportable, diffable and restorable without exporting secrets.
- Advanced controls use progressive disclosure rather than being omitted.
- Preview features and unavailable capabilities remain visibly distinct from live
  configuration.

## First-run activation

The first visit should open a guided setup, not an empty dashboard or a wall of
settings. Its purpose is to leave the owner with a working companion and a verified
harness.

Use a real, resumable progress model. Progress is based on completed capabilities,
not page visits. Owners may leave and return without losing work. Optional steps can
be skipped without pretending they are complete.

### Recommended sequence

1. **Secure this Conker**
   Create the owner passphrase, establish the trusted origin, explain local access,
   and verify that login recovery is available.
2. **Meet your companion**
   Name the companion, choose its communication style and show exactly what those
   choices change. Start from a strong, editable default.
3. **Choose how it thinks**
   Discover available local models, test one response, optionally connect a hosted
   provider, and state per choice what leaves the machine and what it may cost.
4. **Choose what it may remember**
   Explain evidence, memory, correction and forgetting in plain language. Offer a
   conservative default and verify storage health.
5. **Connect useful capabilities**
   Present tools by outcome, permission and reversibility. Configure credentials
   through bounded forms; never expose raw infrastructure configuration first.
6. **Set action boundaries**
   Choose approval requirements, destinations, rate limits, budgets and quiet hours.
   Show a short example of what will ask and what may run silently.
7. **Protect the installation**
   Configure backups, retention and an off-machine destination, then create and
   verify the first backup.
8. **Run a real rehearsal**
   Complete one conversation, one memory review and one harmless approval flow.
   Finish only when the system verifies the round trip.

After activation, unfinished or degraded capabilities become a small persistent
"Finish setup" entry with the next useful action. Setup does not permanently take
over the product shell.

### Implementation shape

- Model onboarding as a server-side state machine with stable step IDs, status,
  prerequisites, validation evidence and recovery actions.
- Each step has `not_started`, `in_progress`, `blocked`, `skipped`, `complete` and
  `degraded` states. Completion comes from live verification, not a saved checkbox.
- Expose the same state through `conker setup status`, `conker setup run <step>` and
  the UI.
- Write configuration through one transactional service. UI and CLI are clients.
- Keep secret values write-only. Status returns presence, validity, scope and last
  verification, never the secret.
- Provide `conker doctor` and a matching UI health flow that produce the same
  findings and recovery instructions.

## Professional engagement, not gamification

Conker should be unusually compelling to return to, but it must not manufacture
anxiety, obligation or noise. Duolingo's lesson is the quality of its feedback loop,
not points, mascots, streak loss or artificial urgency.

The desired loop is:

```
notice useful progress
        -> take one clear action
        -> receive immediate, trustworthy feedback
        -> see the system become more capable or quieter
        -> know the next worthwhile action
```

The product earns repeat use through increasing competence, visible control and
relief. It does not demand repeat use for its own metrics.

### Engagement principles

- **Immediate value:** every visit opens on what matters now, not navigation chrome.
- **One clear next move:** when action is useful, make the best next action obvious.
- **Visible mastery:** show which capabilities are configured, verified and trusted.
- **Meaningful closure:** completed work visibly resolves and leaves a calm record.
- **Progressive depth:** simple first, powerful on demand, with state preserved.
- **Continuity:** return people to the exact conversation, task or setup step.
- **Earned delight:** use restrained motion and acknowledgement when something real
  becomes possible, not for routine taps.
- **Trust as reward:** show receipts, sources, reversibility and privacy at the moment
  they build confidence.
- **Increasing quiet:** successful long-term use should reduce prompts and decisions.

### Patterns to use

- A capability map showing `ready`, `needs attention`, `optional` and `unavailable`.
- A daily/return view organized around `Continue`, `Waiting for you`, `Completed`
  and `Suggested`, with strong limits on how much can request attention.
- Short setup missions that end in verified outcomes, such as "Your first local
  reply worked" or "Your first backup was verified."
- Before/after feedback that shows time or steps saved without inventing precision.
- Calm progress history: capabilities gained, approvals avoided through safe grants,
  corrected memories and successful recovery checks.
- Consistent keyboard and command-palette access for expert flow.

### Patterns to reject

- Streaks that punish absence.
- Points, badges or levels unrelated to real capability.
- Variable rewards, fake urgency, celebratory noise and notification pressure.
- Inflated progress bars or completion granted without live verification.
- Engagement metrics that conflict with the philosophy that silence is a feature.
- Hiding safety, privacy or cost decisions to improve activation conversion.

## Design direction

The interface should feel like a precise personal instrument: calm, fast and
recognizably Conker. It is an operating surface, not a SaaS marketing dashboard and
not a game skin.

- Dense enough for repeated work, but staged so a first-time owner sees one decision.
- Warm through language, motion and response quality rather than decorative clutter.
- Serious typography, restrained color and a single strong visual signal for current
  state and progress.
- Capability and consequence are visible before configuration detail.
- Mobile supports conversation, approvals, status and setup; deep construction tools
  may adapt to focused mobile flows rather than compressing desktop editors.

## Success measures

Activation succeeds when an owner reaches a verified first conversation without the
CLI, understands where that conversation ran, and can recover from one intentional
wrong-password attempt without help.

Long-term engagement succeeds when owners return because Conker reliably continues
valuable work, while prompts, repeated corrections and supervision time trend down.
Session count and time-in-app are not success metrics by themselves.
