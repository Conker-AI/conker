# Provider secret management audit

Status: **implemented locally; assembled Ubuntu acceptance pending**. Credentials remain
host-managed. Browser model configuration contains routing and eligibility only; it cannot
receive keys or endpoints.

## Repaired now

- Installer reruns preserve OpenRouter, OpenAI, Anthropic and paid-model policy values.
- Interactive OpenRouter entry no longer echoes terminal input.
- Root Compose and the isolated Ubuntu generator pass the same supported provider settings.
- Pi and Gateway return a static validation error, never FastAPI's rejected input value.
- Fixed provider endpoints, disabled redirects and environment proxies, and sanitized
  provider transport errors remain intact.
- Plaintext provider values are migrated out of `.env` into owner-only host files. Pi receives
  only read-only active files and publishes a secret-free configured-provider health check.
- `conker providers` stages hidden/stdin input, assigns opaque revisions, verifies against fixed
  non-generative endpoints, rejects evidence older than 15 minutes, activates with Pi recreation
  and health confirmation, and rolls back or recovers interrupted activation.
- Issuer revocation is explicitly separate and can be recorded only for a non-live revision
  after the operator supplies `--issuer-confirmed`.
- Backups reject legacy plaintext provider environment values, omit all provider key files and
  retain only bounded revision metadata for held recovery reconciliation.

## Remaining release evidence

1. Run the assembled acceptance suite on the supported Ubuntu deployment. Confirm POSIX file
   ownership/modes, read-only mounts, Pi recreation, rollback and no secret sentinels in browser
   responses, logs, diagnostics or exports.
2. Exercise a real provider only as an explicit operator acceptance step; automated tests use
   synthetic keys and make no external provider calls.
3. Issuer-side revocation remains an external account operation. The CLI records the owner's
   confirmation but does not claim provider-issued proof.

The UI may eventually show provider identity, configured presence, active revision,
spending policy, verification basis/time/staleness and sanitized failures. It must not show
key values, partial keys, raw environment, arbitrary endpoints or raw provider responses.
Browser credential entry remains intentionally absent. Adding it would require an independently
audited write-only contract with operation-bound owner authorization; it is not needed for the
host lifecycle to be a connected product capability.
