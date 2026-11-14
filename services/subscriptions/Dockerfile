# The Claude plan runtime. The source-built Ubuntu layout builds it from the reviewed source export
# (deploy/ubuntu/prepare.py); the repository install pulls it as ghcr.io/conker-ai/subscriptions,
# published by .github/workflows/publish-subscriptions.yml. Python runs the private bridge
# (services/subscriptions/subscription_runtime.py); Claude Code is the official native binary at a pinned
# version, checked against its SHA-512.
# Python 3.12.16, slim.
FROM python:3.12.16-slim@sha256:8523d6abeb48ceae0b7240d30c5808fc26cb79c1a635bacdf19cf3baecfbec07
ARG TARGETARCH=amd64
WORKDIR /app
# Debian security fixes newer than the pinned base image.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
COPY services/subscriptions/requirements.txt services/subscriptions/fetch_claude.py /build/
RUN pip install --no-cache-dir -r /build/requirements.txt \
    && python /build/fetch_claude.py "$TARGETARCH" /opt/claude/bin/claude \
    && rm -rf /build
COPY services/subscriptions/subscription_runtime.py services/subscriptions/workspace_providers.py \
    services/subscriptions/chatgpt_relay.py services/subscriptions/inference_requests.py \
    services/subscriptions/native_claude.py services/subscriptions/native_claude_sessions.py \
    services/subscriptions/native_codex_sessions.py /app/
# Shared with the host helper (scripts/provider_control.py), so these two have not moved yet.
COPY scripts/chatgpt_provider.py scripts/plan_limits.py /app/
# The sign-in and Claude Code's own files live in /state, this service's folder; the image is
# read-only. No self-update, telemetry or error reports leave the runtime.
ENV HOME=/state/home \
    DISABLE_AUTOUPDATER=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
USER 1000:1000
CMD ["python", "/app/subscription_runtime.py", "serve"]
