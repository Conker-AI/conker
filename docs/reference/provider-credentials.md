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

The browser distinguishes owner verification, provider work and an unconfirmed
outcome. A status check stops waiting after 15 seconds. A submitted operation
allows 210 seconds after verification; time spent entering the password is not
counted. Some host recovery sequences can continue beyond that limit. A timeout
or lost response does not establish cancellation, failure or rollback.

Use **Check status** in the API-key panel after an unconfirmed operation. It reads current
evidence without repeating the write, and keeps the earlier uncertainty visible.
Credential revisions and recovery markers determine which actions are available
next. A slow older refresh cannot replace an acknowledged change. Pending or
failed checks label retained settings as last checked and prevent changes until
current status is available.

Unsent keys remain only in the current editor's memory and are cleared on submit,
close, owner change or server-client replacement. The editor is tied to the
displayed active and staged revisions; changed revisions require opening it
again. Canceling password verification does not restore a submitted key draft.

Paid requests require separate explicit authorization. Settings and
`conker providers spending status|on|off|recover` use the same fixed host policy
operation. It revision-checks the current flag, restarts Pi and the sidecars that share its
network (Laya on Ubuntu, and the Claude plan runtime where it runs), and confirms the runtime flag.
An Anthropic, OpenAI or OpenRouter key answers nothing until spending is on: Pi reports the
provider as not configured, "paid models are disabled". Failed rollback holds a redacted recovery marker.
This switch is not a budget; provider-account limits still apply. Connecting a key
does not enable spending, alter model roles or grant tool access.

## Claude plan sign-in

A Claude subscription is not an API key and is not stored here. It runs in its own
`subscriptions` service (the source-built Ubuntu layout builds it; the repository install runs
the published image after `./install.sh --claude-plan`): `conker providers claude login` runs
the official `claude auth login --claudeai` in that service, in the owner's terminal, and the
sign-in stays in `state/subscriptions` (`.conker/subscriptions` in the repository install).
`status` and `logout` use the same CLI. Pi holds only the runtime's inference key
(`PI_SUBSCRIPTION_KEY`), never its control key or the sign-in; snapshots leave the folder out. Until a release pins its image, the repository install uses the API key above.
See [Claude plan runtime](claude-plan-runtime.md) and
[Running Conker](../4-running.md#connect-claude).

Verified backups include the secret-free provider `state.json` as
`config/provider-state.json`, but deliberately omit every provider key file. Backup
refuses a legacy plaintext provider key in `.env`. A restored candidate therefore
cannot silently reactivate an old hosted credential: the recovery hold requires
credential reconciliation and the operator must provision a current key again.

Tests use synthetic tokens and scripted verification responses. They do not contact
provider accounts or prove that a real account, model entitlement or spending limit
works. Live Ubuntu deployment acceptance remains part of the assembled release gate.
