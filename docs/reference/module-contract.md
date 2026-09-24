# Module contract

Every Conker module presents identically from outside. A programmer who has read one finds their
way around any other in a minute, and **one dashboard renders any module's state without special
cases** — which is the whole reason this exists. See
[ADR-0003](../adr/0003-the-gates-go-headless.md).

Five modules are in scope: **Pi**, **MemoryGate**, **ToolGate**, **SystemGate**, **Embeddings**.

---

## `GET /health`

Unauthenticated. Identical shape in every module.

```json
{
  "service": "systemgate",
  "version": "0.2.0",
  "status": "degraded",
  "degraded": ["docker"],
  "checks": {
    "procfs":    { "status": "ok" },
    "docker":    { "status": "unavailable", "reason": "unreachable" },
    "admin_key": { "status": "ok" }
  },
  "checked_at": "2026-09-05T14:52:40.231460+00:00",
  "age_seconds": 0.0
}
```

| Field | Type | Meaning |
|---|---|---|
| `service` | string | The module's own name, lowercase, stable. |
| `version` | string | The module's version. Semantic, and its own — not an API revision. |
| `status` | `ok` \| `degraded` | `degraded` if any check is anything but `ok` or `not_configured`. |
| `degraded` | string[] | Names of the checks that are not healthy. Sorted. Empty when `ok`. |
| `checks` | object | **Keyed by check name.** Never a list — a caller must be able to ask for one check by name without scanning. |
| `checked_at` | string | ISO 8601 with timezone, when the probes actually ran. |
| `age_seconds` | number | How old that answer is. Health may be cached; a cached answer must carry its age. |

### Check status vocabulary

| Value | Means |
|---|---|
| `ok` | Probed and working. |
| `degraded` | Working, with a known partial failure. |
| `unavailable` | Configured, probed, and not working. |
| `not_configured` | Not set up. **Not a failure** — it does not make the module `degraded`. |
| `unknown` | Could not determine. Never substitute a plausible default. |

`not_configured` and `unavailable` must never be collapsed. "Nothing here yet" and "it broke" are
different facts, and merging them is how a dashboard starts lying.

### Rules

- **Probe, never assert.** A hardcoded `ok` is a bug. If a dependency is not actually reached, it is
  not `ok`.
- **`reason` stays coarse.** `/health` takes no key, so `reason` must never carry host paths,
  socket locations, URLs, credentials or exception text. A short category or an exception class
  name is enough; the status word carries the meaning, `reason` only narrows it.
- **`degraded` is per dependency**, not global. One broken thing does not make the rest unknown.

---

## The rest of the contract

| Ships | Requirement |
|---|---|
| `README.md` | Same sections, same order: what it is · its boundary · run it · configure it · API · status vocabulary |
| `openapi.json` | **Generated**, never hand-written. This is what a forker swaps against ([ADR-0007](../adr/0007-three-swap-contracts.md)). |
| `docker-compose.yml` | Runs standalone for development, composes into the whole for real use. |
| `CHANGELOG.md` | Honest versioning, so replacing a module has visible consequences. |
| `.gitattributes` | `* text=auto eol=lf`. These run on Linux; a CRLF in an entrypoint is a "bad interpreter" failure nothing on Windows surfaces. |
| `LICENSE` | MIT. A public repository without one is under default copyright and nobody may legally use it. |
| Config | One precedence everywhere: **environment → file → default**, documented. |
| Errors | One shape across every service, so the dashboard renders failures uniformly. |
| Secure by default | No key configured means the service **refuses to start**, exiting with an error naming the exact fix. It never falls back to open. |

## Enforcement

A convention nobody checks decays into a convention nobody follows. CI checks the **contract, not
the prose**: the `/health` response validates against the schema above, `openapi.json` is current
and generated, the required files exist, and README headings match the required order.
