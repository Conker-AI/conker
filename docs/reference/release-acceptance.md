# Assembled release acceptance

`scripts/release_acceptance.py` is the executable release gate for the published
matrix declared by the normalized `versions.env` contract. It never builds,
retags, or substitutes an image. A registry pull is required for every exact
reference, including all five Conker version tags, runtime dependencies, and the
digest-pinned Node dashboard builder. The image plan records runtime and build-only
references separately. Compose must resolve exactly the runtime set; build-only
images must be pulled and identity-verified but must not appear as services. Each
running service must use the image ID obtained by the required pull.

The ordinary pull-request job runs only deterministic planner, evidence, and
failure-path tests. The expensive live job runs for a published GitHub release or
an explicit workflow dispatch on a dedicated runner labelled
`conker-release-acceptance`. That runner must be Linux x64, have Docker Compose v2,
Bash, Python 3.11 or newer, registry access, no existing Conker installation, and
enough disk and memory for the full stack and local models. It must also expose an
existing writable mount on a different device through the repository variable
`CONKER_ACCEPTANCE_PROTECTION_ROOT`. The gate creates and removes one uniquely named
child there; it never removes the configured mount root.

Run it directly on an equivalent disposable host with:

```sh
python3 scripts/release_acceptance.py --require-conversation \
  --protection-root /mnt/conker-release-acceptance
```

If and only if the reviewed manifest activates `owner-terminal`, also pass
`--terminal-workspace /approved/project` or set
`CONKER_ACCEPTANCE_TERMINAL_WORKSPACE`. The runner forwards that existing directory
through the same host preflight used by installation and selects
`docker-compose.terminal.yml`; a deferred manifest ignores the overlay. The terminal
image must already be digest-pinned in `versions.env` and is then part of the exact
resolved runtime image matrix.

The resulting evidence bundle is a release-promotion artifact, not first-run owner
evidence. It cannot be uploaded to complete onboarding. The setup rehearsal is a
separate UI/CLI workflow that proves one ordinary conversation, one review of the
current memory choice, and one harmless owner approval on the installed system.

The live conversation is mandatory for release promotion; there is no reduced
"skip conversation" promotion mode. The gate accepts the default Companion,
selects and live-probes the exact ready local model candidate, opts into memory and
capabilities, records the inspected ToolGate policy digest, and saves an off-machine
protection policy. It then runs one authenticated conversation and completes the
server-owned rehearsal by reviewing the current memory choice and approving only
the fixed request ID Pi issued for `approval.test-echo`.

The live gate fails rather than inferring success when an image cannot be pulled,
the Compose matrix differs, a container does not use the pulled image ID, a
service reports anything other than `ok`, TLS/browser login fails, or required
setup state is incomplete. The authenticated local turn must return a recorded
answer within four minutes.

After the runtime checks, the gate uses `conker setup run protection`, verifies the
resulting policy-bound snapshot, restores it into isolated recovery volumes, and
requires the restore to return its documented held status with explicit blockers.
Only after conversation, rehearsal, protection and held restore does it require the
first-run status to report no unresolved required step. It then aborts the
isolated recovery and removes the live Compose volumes. Teardown runs after every
failure. A pre-existing `.env`, acceptance work directory, or known Conker
container is a hard precondition failure so cleanup cannot damage another install.

Machine-readable, sanitized evidence is written to
`release-acceptance-evidence/` and uploaded even when the workflow fails. It
uses the `conker-release-acceptance-evidence-2` schema; earlier evidence does not
prove the complete onboarding and policy-bound protection sequence. The bundle
includes the normalized manifest, planned and resolved image identities, observed
running identities, health bodies, browser-auth result, setup status, bounded
setup choices and policy digest, conversation receipt metadata, the exact rehearsal
request/receipt identities, recovery hold evidence, command logs, an event
stream, and a final summary. Passwords, cookies, CSRF/verification tokens, `.env`,
snapshots, databases, and recovery stores are never retained as CI artifacts.
If recovery abort or Compose cleanup fails, the local `.env`, recovery hold,
snapshot child and work directory remain on the dedicated runner for explicit
repair; the sanitized artifact records the failure but never uploads those stores.

This gate proves installation and recovery of the published assembled matrix on
the dedicated runner architecture. It does not prove other CPU architectures,
remote-browser certificate enrollment, Tailscale/reverse-proxy operation, external
provider behavior, real third-party tool effects, or promotion of a recovered
candidate; recovery intentionally remains held and is torn down.
