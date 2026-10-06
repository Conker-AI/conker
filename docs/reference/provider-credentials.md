# Hosted provider credentials

Conker manages OpenRouter, OpenAI and Anthropic credentials on the host. Secret
values are write-only. They never belong in browser storage or responses, model
configuration, command arguments, Compose environment values, logs or backup archives.

Settings supports saving, verifying, discarding a staged key, activating and recovering
a credential, and recording issuer revocation. Each write requires an operation-bound
owner password confirmation. The browser submits a key only to its authenticated
Gateway over HTTPS; the Gateway forwards a fixed operation to a private host Unix
socket. It never receives a Docker socket, shell, file path or environment editor.

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
previous file and recreates Pi again, reconnecting the configured decision sidecar.
Recovery remains pending until the restored runtime is confirmed. If the host process itself was interrupted,
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

The private provider-control worker requires a Linux systemd user session. Repository
installation starts it automatically when that session is available. Generated Ubuntu
deployments use `conker providers install-ui-control` from their current source tree.
Only Gateway mounts its private socket directory; Pi sees only the active key files.
Unsupported installations report unavailable, never a simulated successful connection.

Settings receives opaque revisions and safe credential status, not secret values,
arbitrary endpoints or provider error bodies. Model catalogue entries are separate
from credential readiness. OpenAI API access is not ChatGPT/Codex subscription login.

Paid requests require separate explicit authorization. Settings and
`conker providers spending status|on|off|recover` use the same fixed host policy
operation. It revision-checks the current flag, restarts Pi and the decision sidecar,
and confirms the runtime flag. Failed rollback holds a redacted recovery marker.
This switch is not a budget; provider-account limits still apply. Connecting a key
does not enable spending, alter model roles or grant tool access.

Verified backups include the secret-free provider `state.json` as
`config/provider-state.json`, but deliberately omit every provider key file. Backup
refuses a legacy plaintext provider key in `.env`. A restored candidate therefore
cannot silently reactivate an old hosted credential: the recovery hold requires
credential reconciliation and the operator must provision a current key again.

Tests use synthetic tokens and scripted verification responses. They do not contact
provider accounts or prove that a real account, model entitlement or spending limit
works. Live Ubuntu deployment acceptance remains part of the assembled release gate.
