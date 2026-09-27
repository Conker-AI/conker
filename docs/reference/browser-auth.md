# Browser authentication (B4)

This guide describes the B4 browser-authentication boundary. **September 19, 2026
status:** the reviewed source includes the gateway package, connected owner UI,
and separate owner-control channels for Pi configuration and ToolGate approvals.
The release manifest still points at older published component versions until the
assembled release gate passes; source review alone does not verify those images.

The browser connects to a separate HTTPS gateway. The Pi execution worker has
neither plaintext owner credential nor access to the gateway volume. It receives
hashes for its bounded owner API and a separate runtime credential hash. The
gateway holds the Pi owner credential. Its ToolGate approval credential is separate
again and travels only over an internal Docker network that Pi does not join.
Pi and the gateway drop Linux capabilities.
The gateway volume contains the password verifier, sessions and TLS material and
must be captured by backup. Restore must invalidate sessions before any gateway
can be started. Existing service admin keys remain host recovery credentials.

First setup and a forgotten password are handled from the host terminal. The
password protects browser access to conversations and owner decisions; only a
salted password verifier is stored on this machine. Someone controlling the host
can reset it. A reset cannot recover missing data, vault keys or forgotten content.

B4's review surface includes backend requests, the connected dashboard, CLI setup
status and an executable mutation drill. Development fixtures still exist for UI
work, but production always enters through the authenticated gateway. There is no
admin-key fallback for either owner channel.

## Password and recovery, for the owner

Run `./conker auth setup` in the terminal on the machine running Conker. Choose a
passphrase of at least 15 characters; spaces and Russian text are supported.
This protects browser access to your conversations and approval decisions. Conker
stores a salted password verifier in its private `gateway_data` Docker volume,
not your password and not an account on someone else's server.

If you forget it, run `./conker auth reset-password` on that machine. This sets a
new password and signs out every browser. Someone who controls the host can do
the same thing; the password does not protect against that person. A reset cannot
restore lost conversations, lost vault keys, deleted memories or a missing backup,
and cannot undo an action already sent. There is no email recovery service.

`./conker auth revoke-all` signs out every browser without changing the password.
Sessions also expire after 30 minutes without use or after 24 hours in total.
Backup captures the auth database using SQLite's backup API, plus its TLS material
and service configuration. Restore retains the password verifier, invalidates all
browser sessions and stays isolated under the existing recovery hold. Backups from
before B4 remain readable; they do not contain browser authentication data.

## HTTPS and other devices

The default address is `https://localhost:8050`. The local TLS certificate is
self-signed: the browser cannot know that it is yours until you trust it. Export
the **public certificate** from the host with
`./conker auth certificate > conker-local.crt` and import that certificate into
your client's trusted certificate store. Keep the TLS private key on the host.
Browser/OS trust installation is not automated by this patch. Do not enter the
password through HTTP or disable certificate verification to bypass a mismatch.

The local certificate lasts one year. Run `./conker auth renew-certificate`,
then restart the gateway with the normal Compose command and export/trust the new
certificate. A renewal never silently replaces your password or session data.

Tailscale membership alone cannot reach a localhost-bound port. Remote use needs
an HTTPS reverse proxy forwarding to the local HTTPS gateway; configure its exact
public browser origin as `GATEWAY_ORIGIN`. Preserve that origin as the Host and
Origin headers, trust the gateway certificate on the proxy, and leave the worker
unpublished. Forwarded scheme/IP headers cannot authenticate a request. Automatic
remote HTTPS setup and a browser trust wizard are outside this backend patch.

## Rollout and review

1. Verify that the Pi image pinned in `versions.env` includes the reviewed gateway
   and worker entry points. The current pin is 0.4.0; a source checkout and a pin
   alone do not prove the published artifact or deployment works.
2. Re-run `./install.sh`. It preserves distinct runtime, Pi owner, ToolGate owner,
   and ToolGate execution credentials. Pi receives only owner-key hashes and its
   scoped execution credential; the gateway receives the two owner credentials
   and the separate execution credential needed for owner-started workflow runs.
   No admin key or service owner key is placed in the browser.
3. The installer provisions ToolGate with the SHA-256 digest of its generated owner
   credential. ToolGate verifies `GET /v2/owner/requests` and
   `POST /v2/owner/requests/{id}/decision` using `X-ToolGate-Owner-Key`; there is
   no admin-key fallback and rerunning the installer does not rotate the key.
4. Run `conker setup status` and verify it matches the browser setup screen, then
   complete a real approval round trip and prove that Pi's execution key is denied
   on the owner endpoint before closing B4. Missing owner configuration returns
   503; there is no admin-key fallback.

For a source review before publishing, build `../gates/pi` with a distinct local
image tag and use a temporary Compose override for **both** gateway and Pi. Do not
retag a published image or present a local build as testing the pinned release.
Deployment tests run the real `docker compose config` CLI without starting services.
`python scripts/auth_mutation_drill.py` tests missing auth capture, revived sessions,
owner credentials or auth storage leaking into Pi, and publishing the worker port.
The real Docker recovery drill also checks browser-session invalidation; it requires
Linux with Docker and `CONKER_RECOVERY_DOCKER=1`.
