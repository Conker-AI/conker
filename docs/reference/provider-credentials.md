# Hosted provider credentials

Conker manages OpenRouter, OpenAI and Anthropic credentials on the host. Secret
values never belong in browser requests, model configuration, command arguments,
Compose environment values, logs or backup archives.

Repository installs store owner-only files under `.conker/provider-secrets/`.
The isolated Ubuntu layout uses `state/provider-secrets/`. The directory is mode
0700 and secret and metadata files are mode 0600 on POSIX hosts. Pi receives only
the three active files as read-only mounts and reads them once at startup. Each
credential has a random opaque revision; revisions are identifiers, not hashes or
partial keys.

## Add or rotate a credential

Use `openrouter`, `openai` or `anthropic` as `PROVIDER`:

```sh
conker providers status
conker providers set PROVIDER
conker providers verify PROVIDER
conker providers activate PROVIDER credential_0123456789abcdef0123456789abcdef
```

`set` prompts without echo. For automation, send the value on standard input with
`conker providers set PROVIDER --stdin`; never put it in an argument. `status
--json` is secret-free and gives the exact staged revision required by `activate`.

Verification makes one bounded, non-generative request to the provider's fixed
HTTPS hostname and credential endpoint. It ignores environment proxies, follows no
redirects and returns only `verified`, `rejected` or `unavailable` with a sanitized
basis. A successful verification expires after 15 minutes; stale or future-dated
evidence cannot be activated.

Activation first records a recoverable pending transition, atomically switches the
host file, force-recreates Pi, and checks Pi's secret-free health projection for the
expected provider identity. It commits only after that check. Failure restores the
previous file and recreates Pi again. If the host process itself was interrupted,
`conker providers status` reports `activation recovery required`; restore the exact
pending revision with:

```sh
conker providers recover PROVIDER REVISION
```

After a replacement is active, revoke the old credential in the provider's own
account console. Only after the issuer confirms revocation, record that fact locally:

```sh
conker providers record-revoked PROVIDER OLD_REVISION --issuer-confirmed
```

That command is an operator attestation. It does not call the provider or revoke a
credential by itself. Conker refuses to mark an active or staged revision revoked.

## Browser and recovery boundaries

Settings reads provider identity and configured readiness from Pi. It can select
models and routing policy, but it cannot submit, reveal, rotate or delete keys and
does not receive credential revisions, arbitrary endpoints or provider error bodies.
Spending authorization remains a separate host policy (`PI_ALLOW_PAID_MODELS`).

Verified backups include the secret-free provider `state.json` as
`config/provider-state.json`, but deliberately omit every provider key file. Backup
refuses a legacy plaintext provider key in `.env`. A restored candidate therefore
cannot silently reactivate an old hosted credential: the recovery hold requires
credential reconciliation and the operator must provision a current key again.

Tests use synthetic tokens and scripted verification responses. They do not contact
provider accounts or prove that a real account, model entitlement or spending limit
works. Live Ubuntu deployment acceptance remains part of the assembled release gate.
