# shellcheck shell=bash
# Sourced by install.sh after the checkout is in place; starting the services, reading their health and the closing summary.
# It only defines functions. The variables it reads are set in install.sh or in the other parts.

# ============================================================================
# 4. Start, and tell the truth about what came up
# ============================================================================

owner_terminal_active() {
    grep -qx 'OWNER_TERMINAL_STATE=active' "$ROOT/versions.env"
}

agent_sandbox_active() {
    grep -qx 'AGENT_SANDBOX_STATE=active' "$ROOT/versions.env"
}

# Gemini, xAI, Mistral, DeepSeek and Groq keys: released once the pinned Pi reads them.
direct_providers_active() {
    grep -qx 'DIRECT_PROVIDERS_STATE=active' "$ROOT/versions.env"
}

claude_plan_released() {
    grep -qx 'SUBSCRIPTIONS_STATE=active' "$ROOT/versions.env"
}

# The same rule as ./conker and scripts/compose_overlays.py, read from the choice being written.
claude_plan_active() {
    claude_plan_released && [ "${CONKER_CLAUDE_PLAN:-}" = on ]
}

compose() {
    local files=(-f "$ROOT/docker-compose.yml")
    if owner_terminal_active; then
        files+=(-f "$ROOT/docker-compose.terminal.yml")
    fi
    if agent_sandbox_active; then
        files+=(-f "$ROOT/docker-compose.sandbox.yml")
    fi
    if direct_providers_active; then
        files+=(-f "$ROOT/docker-compose.direct-providers.yml")
    fi
    if claude_plan_active; then
        files+=(-f "$ROOT/docker-compose.subscriptions.yml")
    fi
    docker compose --env-file "$ROOT/versions.env" --env-file "$ENV_FILE" \
        "${files[@]}" "$@"
}

prepare_dashboard() {
    step "Preparing the dashboard"
    local image
    image=$(sed -n 's/^NODE_BUILD_IMAGE=//p' "$ROOT/versions.env" | head -1)
    [ -n "$image" ] || die "versions.env does not declare NODE_BUILD_IMAGE."
    if ! docker run --rm --env "HOST_UID=$(id -u)" --env "HOST_GID=$(id -g)" \
        --mount "type=bind,src=$ROOT/dashboard,dst=/workspace" \
        --mount "type=volume,dst=/workspace/node_modules" \
        --workdir /workspace "$image" sh -c \
        'npm ci --no-audit --no-fund && npm run build && chown -R "$HOST_UID:$HOST_GID" dist' \
        >"$LOG" 2>&1; then
        die "The connected dashboard could not be built with its pinned Node image." \
            "The last few lines were:" "$(tail -5 "$LOG" | sed 's/^/  /')" \
            "Fix the reported dashboard build error, then run this installer again."
    fi
    [ -f "$ROOT/dashboard/dist/index.html" ] \
        || die "The dashboard build finished without producing dashboard/dist/index.html."
    good "Connected dashboard assets are ready"
}

# Whether every image the compose file resolves to is already on this machine.
# Asked of the resolved config rather than of versions.env, so it is the same
# list docker is about to use and not a second copy that can drift.
images_all_present() {
    local image
    while read -r image; do
        [ -n "$image" ] || continue
        docker image inspect "$image" >/dev/null 2>&1 || return 1
    done < <(compose config --images 2>/dev/null)
    return 0
}

pull_and_start() {
    step "Pulling images"
    info "Pinned by version and digest. First run downloads a few GB."
    if compose pull 2>"$LOG"; then
        good "All images pulled"
    elif images_all_present; then
        # Every pinned image is already here. Since they are pinned by version
        # and digest, a local copy under that reference *is* the right image —
        # so an offline or rate-limited machine installs fine. Said out loud,
        # because "could not reach the registry" is worth knowing even when it
        # changed nothing.
        warn "Could not reach the registry, but every pinned image is already on this machine."
        info "Installing from those. Nothing was downloaded."
    else
        if grep -qi "denied\|unauthorized\|403" "$LOG"; then
            die "The images could not be pulled — the registry refused." \
                "If these packages are private, log in first:" \
                "  echo \$GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin" \
                "Then run this again."
        fi
        die "Pulling the images failed." \
            "The last few lines were:" "$(tail -3 "$LOG" | sed 's/^/  /')" \
            "Check the machine is online, then run this again."
    fi

    step "Starting"
    adopt_stale_network
    # A stale image must fail here, never leave an unauthenticated worker as the browser surface.
    if ! compose run --rm --no-deps -T gateway python -c 'import gateway.api' 2>"$LOG"; then
        die "The browser gateway preflight failed." \
            "Check Docker with docker info and verify that PI_VERSION includes the B4 gateway." \
            "For branch review and the release gate, follow docs/reference/browser-auth.md."
    fi
    if ! compose up -d 2>"$LOG"; then
        # A port conflict is the most common way this fails, and Docker reports
        # it as a 500 from an internal forwarding API — true, and no use to
        # anyone. The preflight check cannot always see it either: under Docker
        # Desktop the port is bound on the host, which a check running inside a
        # VM does not see. So it is caught here, where the truth is known.
        if grep -qi "ports are not available\|address already in use\|port is already allocated" "$LOG"; then
            local port
            port=$(grep -o "127\.0\.0\.1:[0-9]\+" "$LOG" | head -1 | cut -d: -f2)
            die "Port ${port:-8050} is already being used by something else on this machine." \
                "Find it:     sudo lsof -nP -iTCP:${port:-8050} -sTCP:LISTEN" \
                "Stop it, or give Conker a different port:" \
                "             CONKER_PORT=8060 ./install.sh"
        fi
        die "The containers would not start." \
            "The last few lines were:" "$(tail -5 "$LOG" | sed 's/^/  /')" \
            "For the whole story:  ./conker logs"
    fi
    good "Containers started"

    pull_models
}

# A conker_net created by hand — or by an earlier, gate-by-gate setup — is not
# managed by compose, and compose refuses to adopt it. The error it gives says
# "incorrect label", which is true and useless to the person reading it.
#
# An empty one is safe to clear and nothing is lost: it is a name, not data.
# One with containers still attached is the owner's call, so that case says
# exactly what is on it and exactly what to run.
adopt_stale_network() {
    docker network inspect conker_net >/dev/null 2>&1 || return 0

    local label attached
    label=$(docker network inspect conker_net \
        --format '{{index .Labels "com.docker.compose.network"}}' 2>/dev/null || true)
    [ -n "$label" ] && return 0

    attached=$(docker network inspect conker_net --format '{{len .Containers}}' 2>/dev/null || echo 0)
    if [ "${attached:-0}" -gt 0 ]; then
        local who
        who=$(docker network inspect conker_net \
            --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || true)
        die "A network called conker_net already exists and other containers are using it." \
            "These are on it:  $who" \
            "Stop them, then run this again:" \
            "  docker rm -f $who" \
            "Their data is in named volumes and is not affected."
    fi

    if docker network rm conker_net >/dev/null 2>&1; then
        info "Cleared an old conker_net that was not created by Conker."
    fi
}

# The model is pulled after the containers are up, because it needs Ollama
# running. Failing here is not fatal: everything else works, and Conker will
# say it has no local model rather than pretend it does.
pull_models() {
    step "Fetching the local model"
    info "$CONKER_LOCAL_MODEL — several GB, once."
    if compose exec -T ollama ollama pull "$CONKER_LOCAL_MODEL" >/dev/null 2>"$LOG"; then
        good "$CONKER_LOCAL_MODEL is ready"
    else
        warn "Could not fetch $CONKER_LOCAL_MODEL."
        info "Conker will start without it and say so. To try again:"
        info "  ./conker model $CONKER_LOCAL_MODEL"
    fi
    local embed="${CONKER_EMBEDDING_MODEL:-qwen3-embedding:0.6b}"
    if compose exec -T ollama ollama pull "$embed" >/dev/null 2>"$LOG"; then
        good "$embed is ready (this is what makes memory searchable)"
    else
        warn "Could not fetch $embed — memory search will report degraded, not fail."
    fi
}

# The top-level status, and never a nested one.
#
# `sed 's/.*"status".../'` looks right and is wrong: `.*` is greedy, so it walks
# to the LAST "status" in the body - whichever check happens to appear last. A
# Pi reporting `degraded` because its model was unreachable displayed as `ok`,
# because `action_boundary` came last and said so.
#
# The health contract puts the service-level status before `checks`, so the
# first match is both correct and the honest reading. Getting this wrong in the
# status command is the worst possible place for it: the owner is told
# everything is fine at exactly the moment they need to know it is not.
top_level_status() {
    grep -o '"status"[[:space:]]*:[[:space:]]*"[a-z_]*"' \
        | head -1 \
        | sed 's/.*"\([a-z_]*\)"$/\1/'
}

# Ask each service directly. A container that is "running" has proved nothing:
# reporting success for a service nobody reached is the one thing this must
# never do.
wait_for_health() {
    step "Checking what actually came up"
    local names=(gateway toolgate memorygate systemgate embeddings)
    local ports=(8050 8010 8020 8040 8030)
    local labels=("Conker" "Tools" "Memory" "System" "Embeddings")
    local deadline=$(( $(date +%s) + 180 ))

    DEGRADED=()
    local i
    for i in "${!names[@]}"; do
        local port="${ports[$i]}"
        [ "${names[$i]}" = "gateway" ] && port="${CONKER_PORT:-8050}"
        local body="" status=""
        while :; do
            if [ "${names[$i]}" = "gateway" ]; then
                body=$(compose exec -T gateway python -m gateway health 2>/dev/null || true)
            else
                body=$(curl -fsS -m 3 "http://127.0.0.1:$port/health" 2>/dev/null || true)
            fi
            [ -n "$body" ] && break
            # Every service is probed once, even after the shared deadline has passed.
            [ "$(date +%s)" -ge "$deadline" ] && break
            sleep 2
        done

        if [ -z "$body" ]; then
            printf '  %s✗%s %-12s %sunreachable on port %s%s\n' \
                "$RED" "$OFF" "${labels[$i]}" "$DIM" "$port" "$OFF"
            DEGRADED+=("${labels[$i]} never answered on port $port")
            continue
        fi
        status=$(printf '%s' "$body" | top_level_status)
        case "$status" in
            ok) good "${labels[$i]}" ;;
            degraded)
                warn "${labels[$i]} — degraded"
                local why
                why=$(printf '%s' "$body" | sed -n 's/.*"degraded"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/p')
                [ -n "$why" ] && info "  ${why//\"/}"
                DEGRADED+=("${labels[$i]} is degraded: ${why//\"/}") ;;
            *)
                warn "${labels[$i]} — reports '${status:-no status}'"
                DEGRADED+=("${labels[$i]} reports ${status:-no status}") ;;
        esac
    done

    claude_plan_active || return 0
    local runtime="" stop_at=$(( $(date +%s) + 60 ))
    while [ "$(date +%s)" -lt "$stop_at" ]; do
        runtime=$(compose exec -T subscriptions python /app/subscription_runtime.py status 2>/dev/null || true)
        [ -n "$runtime" ] && break
        sleep 2
    done
    if printf '%s' "$runtime" | grep -q '"connected": true'; then
        good "Claude plan (signed in)"
    elif printf '%s' "$runtime" | grep -q '"available": true'; then
        good "Claude plan runtime (sign in once: ./conker providers claude login)"
    else
        warn "Claude plan runtime — not answering"
        DEGRADED+=("The Claude plan runtime did not answer; see ./conker logs subscriptions")
    fi
}

# MemoryGate creates a listener only through its admin API, so this runs once it answers. It is
# safe to repeat: an existing listener keeps the owner's choices and gets the key again.
create_import_listener() {
    if python3 "$ROOT/scripts/import_listener.py" --root "$ROOT" --layout repository >/dev/null 2>"$LOG"; then
        good "Imported chats can reach memory"
    else
        warn "Imported chats cannot reach memory yet: $(tail -1 "$LOG")"
        DEGRADED+=("MemoryGate's listener for imported chats is not set up; retry with ./conker setup import-listener")
    fi
}

# ============================================================================
# 5. What to tell them at the end
# ============================================================================

finish() {
    local url="$GATEWAY_ORIGIN"

    if [ "${#DEGRADED[@]}" -gt 0 ]; then
        step "Conker is running, with some services degraded"
        say ""
        local d
        for d in "${DEGRADED[@]}"; do warn "$d"; done
        say ""
        info "This is not a failed install. What works, works — and Conker will keep"
        info "saying which parts are unavailable rather than quietly pretending."
        info "To look closer:  ./conker status"
    else
        step "Conker is running"
    fi

    say ""
    say "  ${BOLD}Open:${OFF}  ${BLUE}${url}${OFF}"
    info "First-run setup, starting with your browser password: ./conker setup"
    info "Trust this installation's local TLS certificate before signing in; see docs/reference/browser-auth.md."
    info "The connected dashboard is served by the authenticated gateway."
    if claude_plan_active; then
        info "Claude plan: sign in once with ./conker providers claude login (backups leave the sign-in out)."
    fi
    say ""
    say "  ${BOLD}Your backups are in:${OFF}"
    say "     ${BOLD}${CONKER_BACKUP_DIR}${OFF}"
    info "Everything Conker knows is copied there — conversations, memory, and the"
    info "keys in .env. If you ever move machines, that folder is what you carry."
    say ""
    say "  ${DIM}Say that once more, because it is the thing people wish they had known:${OFF}"
    say "  ${BOLD}Back up ${CONKER_BACKUP_DIR} — it is the only copy.${OFF}"
    say ""
    info "Conker is bound to this machine only. Nothing is reachable from the"
    info "internet. To use it from your phone or laptop:  ./conker tailscale"
    say ""
    if [ "$ASSUME_YES" -eq 0 ] && [ -t 0 ] && [ -t 1 ]; then
        if ask_yes_no "Walk through first-run setup now, one question at a time?" y; then
            bash "$ROOT/conker" setup || info "Continue any time with:  ./conker setup"
        else
            info "When you are ready:  ./conker setup"
        fi
        say ""
    fi
}
