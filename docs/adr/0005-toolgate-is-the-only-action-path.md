# ADR-0005 — ToolGate is the only action path, reached over the keyed HTTP API

**Status:** Accepted · 2026-09-04 · [issue #9](https://github.com/alexeybe1kin/conker/issues/9),
[issue #15](https://github.com/alexeybe1kin/conker/issues/15)

## Context

`principles.md` §8 says the action boundary acts and nothing else does. Making that true requires
two things: that Pi has no execution path of its own, and that the path to ToolGate actually carries
identity.

ToolGate exposes a **stdio MCP bridge**, which looked like the natural attachment point. Reading the
code showed otherwise: `toolgate/mcp/toolgate_mcp.py` imports the control plane in-process,
hardcodes actor `local-mcp` (default name `"Pi MCP"`), exposes every active tool and **never calls
`is_scoped`**. Validation, approval binding, rate limits and lockdown still apply — identity and
scope do not.

Three further defects were found in the gates, documented in
[`docs/research/gate-surfaces.md`](../archive/research/gate-surfaces.md).

## Decision

**Every action goes through ToolGate over the keyed HTTP API with scoped execution keys. Never the
MCP bridge.** The dividing line:

> If it touches anything outside Pi's own store, it goes through ToolGate.

No local shell in Pi. No file access. No outbound HTTP except to the four services and the model
providers. A capability that feels convenient to add directly to Pi is precisely the one that
belongs in ToolGate, where it gets policy, approval, limits and an audit record.

**The approval round-trip:** Pi invokes → ToolGate answers *approval required* with a request id and
redacted detail → Pi surfaces it on Approvals and the turn parks → the owner approves in Conker's UI
→ Pi retries carrying the approval → ToolGate consumes the nonce atomically, once.

**SystemGate is read directly by Pi.** This does not breach §8: SystemGate has no write path, so
reading it cannot become an action. Anything prompted by what it reports still goes through
ToolGate. Conker noticing a full disk and Conker clearing it are different events with different
rules.

**Security fixes land upstream in the gate repos**, not in Conker's install layer — otherwise every
other consumer of those public repos stays exposed and the fix is invisible:

- MemoryGate **refuses to start** with no key configured, and stops defaulting CORS to `*`.
  Today `verify_admin_key()` returns `True` when unconfigured, which stock compose leaves it.
- ToolGate's vault is **encrypted at rest**, or loses the name. Write-only is an API property, not
  storage; anyone with file access currently reads every provider key.
- The MCP bridge is retitled and documented as local-trusted-only.
- SystemGate's README is corrected — its "no shell" claim overstates the code, which is defensible
  as written but not as described.

## Consequences

**There is no always-allow in Conker.** That semantics could not be reconciled with a once-only
nonce, and it is not reintroduced by the autonomy policy — see
[ADR-0006](0006-autonomy-is-a-configurable-policy.md).

**The rule is enforceable by construction**, because Pi genuinely has nowhere else to execute. This
is the main thing [ADR-0001](0001-build-pi-in-house.md) bought.

**The browser is structurally safe**, not carefully guarded: it talks only to Pi, and Pi renders
redacted views. §3's forbidden list cannot reach a client that has no route to the services holding
it.
