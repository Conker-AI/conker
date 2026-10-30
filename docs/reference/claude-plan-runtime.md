# Claude plan runtime

A Claude plan (Pro or Max) is not an API key. Conker uses it through the official Claude Code
CLI, which owns the sign-in, running in its own service: `subscriptions`, built from
`services/subscriptions`. Pi asks it for Claude plan answers at `127.0.0.1:8070` with an
inference key; the control key and the sign-in never reach Pi. With the runtime set, Pi also
sends ChatGPT answers through it, and they go on unchanged to the host's ChatGPT worker.

| Layout | Where the runtime comes from | Turn it on |
|---|---|---|
| Source-built Ubuntu (`deploy/ubuntu`) | Built from the reviewed source export | `prepare.py` adds it |
| Repository install (`./install.sh`) | The published image `ghcr.io/conker-ai/subscriptions`, pinned by digest in `versions.env` | `./install.sh --claude-plan`, once the release pins the image |

## Repository install

The runtime is an overlay, `docker-compose.subscriptions.yml`. It runs only when both are true:

- the release has it: `versions.env` says `SUBSCRIPTIONS_STATE=active` and pins
  `SUBSCRIPTIONS_IMAGE=ghcr.io/conker-ai/subscriptions@sha256:…`;
- you chose it: `.env` says `CONKER_CLAUDE_PLAN=on`.

`./conker`, `install.sh`, `conker update`, `conker backup` and the spending switch all apply the
same rule (`scripts/compose_overlays.py`). Until a release pins the image the state is
`deferred`: `--claude-plan` says so and changes nothing, and `conker providers claude` points to
the API key instead (`conker providers set anthropic`).

```sh
./install.sh --claude-plan          # adds the service and its two keys; asked once without the flag
./conker providers claude login     # open the link it prints on any device, sign in to Claude,
                                    # and paste the code that page shows back here
./conker providers claude status    # "connected": true
```

Then give a Claude model (`sonnet`, `opus` or `haiku`, under Claude Code) to the roles you want
in Settings > Models > Model roles. Nothing else changes: every role keeps its model until you
choose. `./conker providers claude logout` signs out; `./install.sh --no-claude-plan` stops
running the service (the sign-in folder stays until you delete `.conker/subscriptions`).

How it is boxed in:

- It shares Pi's network namespace, because Pi talks to a subscription runtime only at
  127.0.0.1, and listens only there. No port is published.
- Read-only root, every capability dropped, no new privileges, your own user (like Pi), 1 GB of
  memory. Claude Code runs with its self-updater and nonessential traffic off.
- The sign-in lives in `.conker/subscriptions` (0700, yours). It is a host folder rather than a
  named volume because the runtime runs as you and Docker makes a fresh volume as root.
- Its keys, `SUBSCRIPTIONS_CONTROL_KEY` and `SUBSCRIPTIONS_INFERENCE_KEY`, are in `.env` with the
  rest, made even while it is off, so turning it on changes no other key.

**Updates.** `conker update` keeps your choice: it pulls the image the new release pins, starts it
with the rest, and on a failed check rolls it back to the image that ran before, like every other
service. It never turns the runtime on by itself.

**Backups.** Snapshots leave the sign-in out (the service's `/state` and the ChatGPT socket
folder are excluded mounts). After a restore onto another machine, sign in again.

## Releasing the image (maintainers)

The image is versioned on its own, by `subscriptions-vX.Y.Z` tags, and published by
`.github/workflows/publish-subscriptions.yml`. A published version never moves.

1. Move the `## Unreleased` notes in `services/subscriptions/CHANGELOG.md` under a new
   `## X.Y.Z` heading and merge that to `main`.
2. Tag that commit and push the tag:
   `git tag subscriptions-vX.Y.Z <commit> && git push origin subscriptions-vX.Y.Z`.
3. The workflow refuses a tag without its changelog section or a version that already exists,
   builds the image (the Claude Code download checked against its pinned SHA-512), runs Claude
   Code read-only without a network, scans it with Trivy (a fixed HIGH or CRITICAL problem stops
   it), checks nothing secret is inside, then pushes exactly that image and attests it. The run
   summary prints the two lines to pin.
4. First publish only: in the organization's packages, make `subscriptions` public and check it
   is linked to `Conker-AI/conker`; otherwise installs cannot pull it.
5. In a pull request, set `SUBSCRIPTIONS_STATE=active` and `SUBSCRIPTIONS_IMAGE=` the printed
   `ghcr.io/conker-ai/subscriptions@sha256:…` in `versions.env`. CI then checks the digest exists
   in the registry, and the weekly security check scans it.
6. After that merges, owners run `conker update`, then `./install.sh --claude-plan` and
   `./conker providers claude login`.

A new Claude Code version means a new image: update `VERSION` and both SHA-512 pins in
`services/subscriptions/fetch_claude.py` (the registry's `dist.integrity` for
`@anthropic-ai/claude-code-linux-x64` and `-linux-arm64`), add a changelog entry, and release
it as above.
