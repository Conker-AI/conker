# Changelog: the Claude plan runtime image

`ghcr.io/conker-ai/subscriptions`, built from this folder's Dockerfile by
`.github/workflows/publish-subscriptions.yml` when a `subscriptions-vX.Y.Z` tag is pushed. The
workflow refuses a tag without its `## X.Y.Z` section here. Release steps:
[docs/reference/claude-plan-runtime.md](../../docs/reference/claude-plan-runtime.md).

## Unreleased

- First published image: the private bridge (`scripts/subscription_runtime.py`, with the ChatGPT
  relay) and Claude Code 2.1.310, the npm registry's native binary checked against its pinned
  SHA-512. Python 3.12.16 slim, by digest; runs as any user, read-only, with its state in `/state`.
