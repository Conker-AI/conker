# Shared diagnostics

`conker doctor` and the authenticated System page consume the same
`conker-diagnostics-1` semantics, represented on the wire by `schemaVersion: 1`.
The contract is assembled by the gateway from fixed internal health endpoints;
neither client invents findings or maps statuses to different recovery advice.

Each report contains an overall `ok` or `attention` status, bounded summary counts,
the generation timestamp, and exactly eight stable findings. A finding identifies
its area, normalized status, observed service status, plain detail, and at most one
recovery action. Recovery may name a connected UI route, a host CLI command, or
both. The UI renders those fields directly. The CLI prints the same JSON:

```sh
conker doctor
```

Exit status is zero only when no finding needs attention. Optional unconfigured
capabilities do not fail the report. Unknown, malformed, oversized, redirected, or
unreachable dependency responses fail closed as attention findings.

The projection never includes upstream response bodies, URLs, headers, credentials,
exception text, environment values, logs, or arbitrary commands. Probes use fixed
origins from host configuration with ambient proxies and redirects disabled. The
browser endpoint is exact and read-only: `GET /api/diagnostics` requires an active
owner session and accepts no parameters.
