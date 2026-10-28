# Documentation

Five guides, read in order, about 20 minutes in all.

| | |
|---|---|
| [1 · Overview](1-overview.md) | What Conker is, why, and the words it uses |
| [2 · How it works](2-how-it-works.md) | Services, one message, one approval, in diagrams |
| [3 · Using Conker](3-using.md) | Each screen and common tasks |
| [4 · Running Conker](4-running.md) | Install, update, back up, recover |
| [5 · Developing](5-developing.md) | Repositories, checks, rules, decisions |

**[Status](status.md)** is the one place that says what works today.
**[Product direction](product-direction.md)** records where Conker is heading.

## Reference

**Using it**

- [Settings](reference/settings.md): every setting, its default and its home; `conker config`
- [Chat CLI](reference/chat-cli.md): every chat feature from the terminal
- [Workflow builder](reference/workflow-builder.md): describe a workflow in words, review the draft, publish it
- [Glossary](reference/glossary.md): every kind of thing in plain words, and the other names code uses

**Running it**

- [Connected workspace](reference/connected-workspace.md): the native local stack for development
- [Local Windows](reference/local-windows.md) · [Recovery](reference/recovery.md) · [Diagnostics](reference/diagnostics.md)
- [Hosted provider credentials](reference/provider-credentials.md): stage, verify, activate and rotate keys
- [Harnesses and model roles](reference/harnesses-and-models.md): subscription sign-in and background thinking
- [Release manifest](reference/release-manifest.md) · [Release acceptance](reference/release-acceptance.md) · [Deployment parity](reference/deployment-parity.md)

**How it is built**

- [Capability matrix](reference/capability-matrix.md): UI, CLI, gateway and deployment coverage, checked in CI
- [Module contract](reference/module-contract.md) · [Gateway workspace](reference/gateway-workspace.md) · [Browser authentication](reference/browser-auth.md)
- [CLI inspection](reference/cli-inspection.md): bounded views of the live control plane
- [Owner-terminal sidecar](reference/owner-terminal-sidecar.md): the deferred terminal's isolation contract
- [Philosophy](reference/philosophy.md): the principles behind every decision

**Decisions**

- [adr/](adr/): why the hard-to-reverse decisions were made, one record each
