#!/usr/bin/env bash
#
# Conker — one command.
#
# Checks the machine, asks a few plain questions, generates every secret,
# writes .env, pulls pinned images, starts them, waits for health, and prints
# one URL.
#
# Three rules shape everything below:
#
#   It never asks for anything it can work out itself, and never asks a person
#   to invent a secret. Every key here comes from a random generator.
#
#   It never reports success for a service it did not reach. A service that
#   does not answer is reported degraded, with the reason, and the install
#   still finishes with whatever does work.
#
#   Re-running it repairs rather than duplicates. Existing secrets are kept —
#   regenerating them would lock you out of your own data.
#
# Usage:
#   ./install.sh                 ask the questions
#   ./install.sh --yes           accept every default, ask nothing
#   ./install.sh --dry-run       do everything except pull and start
#   ./install.sh --check         only check the machine, change nothing

set -euo pipefail

readonly REPO_URL="https://github.com/alexeybe1kin/conker.git"
readonly REQUIRED_GB=20
readonly LOW_MEMORY_GB=6

ASSUME_YES=0
DRY_RUN=0
CHECK_ONLY=0

# --- how this talks ---------------------------------------------------------
# Colour only when a terminal is actually attached. Piped into a file or a log,
# escape codes are noise that makes a failure harder to read, not easier.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
    YELLOW=$'\033[33m'; BLUE=$'\033[34m'; OFF=$'\033[0m'
else
    BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; OFF=''
fi

say()   { printf '%s\n' "$*"; }
step()  { printf '\n%s%s%s\n' "$BOLD" "$*" "$OFF"; }
good()  { printf '  %s✓%s %s\n' "$GREEN" "$OFF" "$*"; }
warn()  { printf '  %s!%s %s\n' "$YELLOW" "$OFF" "$*"; }
info()  { printf '  %s%s%s\n' "$DIM" "$*" "$OFF"; }

# Every failure says what broke and the exact next step. Never a wall of
# container output, and never a stack trace as the last word — by the time
# someone is reading this, they need an instruction, not a diagnosis.
die() {
    printf '\n%s%sConker could not finish.%s\n\n' "$BOLD" "$RED" "$OFF" >&2
    printf '  %s\n' "$1" >&2
    if [ $# -gt 1 ]; then
        printf '\n%sWhat to do:%s\n' "$BOLD" "$OFF" >&2
        shift
        for line in "$@"; do printf '  %s\n' "$line" >&2; done
    fi
    printf '\n' >&2
    exit 1
}

# --- arguments --------------------------------------------------------------
while [ $# -gt 0 ]; do
    case "$1" in
        -y|--yes)    ASSUME_YES=1 ;;
        -n|--dry-run) DRY_RUN=1 ;;
        --check)     CHECK_ONLY=1 ;;
        -h|--help)
            sed -n '2,30p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
            exit 0 ;;
        *) die "I do not know the option '$1'." "Run './install.sh --help' to see what it accepts." ;;
    esac
    shift
done

# --- where we are -----------------------------------------------------------
# Piped from curl there is no repository yet, so fetch one. Run from a checkout,
# use it as it is: a clone on top would throw away local edits.
if [ -f "${BASH_SOURCE[0]}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/docker-compose.yml" ]; then
    ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    ROOT="${CONKER_HOME:-$HOME/conker}"
    NEEDS_CLONE=1
fi

if [ -f "$ROOT/.conker-recovery.json" ] || [ -f "$PWD/.conker-recovery.json" ]; then
    printf 'Recovery is held. Read conker recovery-status DIRECTORY before provisioning any services.\n' >&2
    exit 1
fi
if [ -f "$ROOT/.conker-backup.lock" ]; then
    printf 'Backup is running or was interrupted. Inspect its source-state.json before provisioning services.\n' >&2
    exit 1
fi

banner() {
    printf '\n%s' "$BLUE"
    cat <<'ART'
   ___          _
  / __\___  _ _| | _____ _ __
 / /  / _ \| '_| |/ / _ \ '__|
/ /__| (_) | | |   <  __/ |
\____/\___/|_| |_|\_\___|_|
ART
    printf '%s' "$OFF"
    say "  Your companion, on your own machine."
    say ""
}

# ============================================================================
# 1. Does this machine can run it?
# ============================================================================

check_machine() {
    step "Checking this machine"
    local problems=0

    case "$(uname -s)" in
        Linux)  good "Linux" ;;
        Darwin) good "macOS"
                warn "Host telemetry is thinner on macOS — SystemGate reads Linux /proc." ;;
        *) die "Conker runs on Linux or macOS, and this is $(uname -s)." \
               "On Windows, install it inside WSL2 and run this again from there." ;;
    esac

    if ! command -v docker >/dev/null 2>&1; then
        die "Docker is not installed, and everything here runs in containers." \
            "Install it:  curl -fsSL https://get.docker.com | sh" \
            "Then run this again."
    fi
    if ! docker info >/dev/null 2>&1; then
        die "Docker is installed but not responding." \
            "Start it:    sudo systemctl start docker" \
            "If that works only with sudo, add yourself to the docker group:" \
            "             sudo usermod -aG docker \$USER   (then log out and back in)"
    fi
    good "Docker is running"

    if ! docker compose version >/dev/null 2>&1; then
        die "This Docker has no 'compose' command (Compose v2)." \
            "Install the plugin:  sudo apt-get install docker-compose-plugin" \
            "The old 'docker-compose' script is not enough — the compose file uses v2 syntax."
    fi
    good "Compose v2"

    # Space, not to be clever, but because pulling several GB of images and then
    # failing at 96% is a miserable way to find out.
    local free_gb
    free_gb=$(df -Pk "$ROOT" 2>/dev/null | awk 'NR==2 {print int($4/1024/1024)}' || echo 0)
    if [ "${free_gb:-0}" -lt "$REQUIRED_GB" ]; then
        warn "About ${free_gb}GB free. Images and local models want around ${REQUIRED_GB}GB."
        problems=$((problems + 1))
    else
        good "${free_gb}GB free"
    fi

    MEMORY_GB=$(detect_memory_gb)
    if [ "$MEMORY_GB" -gt 0 ]; then
        good "${MEMORY_GB}GB memory"
    else
        info "Could not read how much memory this machine has; assuming it is enough."
    fi

    check_port_free "${CONKER_PORT:-8050}" || problems=$((problems + 1))

    if [ "$problems" -gt 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
        say ""
        ask_yes_no "Some checks came back with warnings. Carry on anyway?" y || exit 0
    fi
}

detect_memory_gb() {
    if [ -r /proc/meminfo ]; then
        awk '/MemTotal/ {print int($2/1024/1024)}' /proc/meminfo
    elif command -v sysctl >/dev/null 2>&1; then
        sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024/1024/1024)}' || echo 0
    else
        echo 0
    fi
}

# A port already taken is worth catching now: compose would fail later with a
# message about bind addresses that says nothing about what to do.
check_port_free() {
    local port="$1"
    local in_use=""
    if command -v ss >/dev/null 2>&1; then
        in_use=$(ss -ltn "sport = :$port" 2>/dev/null | awk 'NR>1' || true)
    elif command -v lsof >/dev/null 2>&1; then
        in_use=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    fi
    if [ -n "$in_use" ]; then
        # Our own previous install holding it is not a conflict.
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -Eq '^conker-(pi|gateway)$'; then
            good "Port $port is held by an existing Conker (it will be replaced)"
            return 0
        fi
        warn "Port $port is already in use by something else."
        info "Set a different one:  CONKER_PORT=8060 ./install.sh"
        return 1
    fi
    good "Port $port is free"
    return 0
}

# ============================================================================
# 2. The few things only a person can answer
# ============================================================================

ask_yes_no() {
    local prompt="$1" default="${2:-y}" reply hint="[Y/n]"
    [ "$default" = "n" ] && hint="[y/N]"
    if [ "$ASSUME_YES" -eq 1 ] || [ ! -t 0 ]; then
        [ "$default" = "y" ]
        return
    fi
    printf '  %s %s ' "$prompt" "$hint"
    read -r reply || reply=""
    reply="${reply:-$default}"
    case "$reply" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

ask_text() {
    local prompt="$1" default="$2" reply
    if [ "$ASSUME_YES" -eq 1 ] || [ ! -t 0 ]; then
        printf '%s' "$default"
        return
    fi
    printf '  %s %s(%s)%s ' "$prompt" "$DIM" "$default" "$OFF" >&2
    read -r reply || reply=""
    printf '%s' "${reply:-$default}"
}

ask_questions() {
    step "A few questions"
    say ""

    # Asked in human terms. "Which AI should Conker think with?" is a question a
    # person can answer; "PI_MODEL" is not.
    local suggested="qwen3:4b"
    if [ "${MEMORY_GB:-0}" -gt 0 ] && [ "${MEMORY_GB:-0}" -lt "$LOW_MEMORY_GB" ]; then
        suggested="qwen2.5:3b"
        info "This machine has ${MEMORY_GB}GB of memory, so a smaller model is the sensible default."
    fi
    say "  ${BOLD}Which AI should Conker think with?${OFF}"
    info "It runs on this machine. Nothing is sent anywhere, and it costs nothing."
    CONKER_LOCAL_MODEL=$(ask_text "Model:" "$suggested")
    say ""

    say "  ${BOLD}Where should backups go?${OFF}"
    info "Conversations, memory and settings are copied here. Put it somewhere you"
    info "actually back up — an external disk, or a synced folder."
    CONKER_BACKUP_DIR=$(ask_text "Backup folder:" "$HOME/conker-backups")
    # ~ typed by hand is a literal character, not the shell's expansion.
    CONKER_BACKUP_DIR="${CONKER_BACKUP_DIR/#\~/$HOME}"
    say ""

    say "  ${BOLD}Give Conker access to free hosted models as well?${OFF}"
    info "Optional. Conker works entirely on this machine without it. An OpenRouter"
    info "key adds free hosted models for harder questions. Paid models stay off"
    info "unless you turn them on later."
    if ask_yes_no "Add an OpenRouter key now?" n; then
        printf '  Paste it (it is stored in .env on this machine only): '
        read -r OPENROUTER_KEY || OPENROUTER_KEY=""
    fi
    say ""
}

# ============================================================================
# 3. Secrets — generated, never requested
# ============================================================================

# ToolGate derives its vault key from this with scrypt, and reads it with
# bytes.fromhex - so it must be hex, not merely random. ToolGate would generate
# its own if this were left unset, but that copy lives only on the container's
# volume and would never reach the backup, which makes the vault unrecoverable
# the day the machine dies. Generated here so it is in .env with the rest.
random_hex() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 16
    else
        od -vAn -N16 -tx1 /dev/urandom | tr -d ' \n'
    fi
}

random_secret() {
    local bytes="${1:-24}"
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 "$bytes" | tr -d '\n=+/' | cut -c1-32
    else
        # No openssl is normal on a slim image. urandom is the same entropy.
        head -c "$((bytes * 2))" /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-32
    fi
}

# Keep what is already there. Regenerating a key on a re-run would lock the
# owner out of their own encrypted vault and their own database — the exact
# opposite of "re-running repairs".
keep_or_make() {
    local name="$1" existing=""
    [ -f "$ENV_FILE" ] && existing=$(sed -n "s/^${name}=//p" "$ENV_FILE" | head -1)
    if [ -n "$existing" ]; then
        printf '%s' "$existing"
    else
        printf '%s' "$(random_secret)"
    fi
}

# A key that must start with a particular prefix. Keeps an existing one only if
# it already has the right shape, so a key written by an older installer that
# did not know about the prefix is replaced rather than carried forward broken.
shaped() {
    local name="$1" prefix="$2" value
    value=$(keep_or_make "$name")
    case "$value" in
        "$prefix"*) printf '%s' "$value" ;;
        *) printf '%s%s' "$prefix" "$(random_secret 32)" ;;
    esac
}

write_env() {
    step "Writing configuration"

    local existing_env=0
    [ -f "$ENV_FILE" ] && existing_env=1

    CONKER_ADMIN_KEY=$(keep_or_make CONKER_ADMIN_KEY)
    PI_GATEWAY_KEY=$(keep_or_make PI_GATEWAY_KEY)
    if command -v sha256sum >/dev/null 2>&1; then
        PI_GATEWAY_KEY_SHA256=$(printf '%s' "$PI_GATEWAY_KEY" | sha256sum | cut -d ' ' -f1)
    else
        PI_GATEWAY_KEY_SHA256=$(printf '%s' "$PI_GATEWAY_KEY" | shasum -a 256 | cut -d ' ' -f1)
    fi
    # A service-issued owner credential must never be invented or replaced by an installer rerun.
    GATEWAY_TOOLGATE_OWNER_KEY=${GATEWAY_TOOLGATE_OWNER_KEY:-}
    if [ -z "$GATEWAY_TOOLGATE_OWNER_KEY" ] && [ -f "$ENV_FILE" ]; then
        GATEWAY_TOOLGATE_OWNER_KEY=$(sed -n 's/^GATEWAY_TOOLGATE_OWNER_KEY=//p' "$ENV_FILE" | head -1)
    fi
    GATEWAY_ORIGIN=${GATEWAY_ORIGIN:-}
    if [ -z "$GATEWAY_ORIGIN" ] && [ -f "$ENV_FILE" ]; then
        GATEWAY_ORIGIN=$(sed -n 's/^GATEWAY_ORIGIN=//p' "$ENV_FILE" | head -1)
    fi
    GATEWAY_ORIGIN=${GATEWAY_ORIGIN:-https://localhost:${CONKER_PORT:-8050}}
    TOOLGATE_ADMIN_KEY=$(keep_or_make TOOLGATE_ADMIN_KEY)
    # Kept only if it is still valid hex: a salt written by an earlier installer
    # that did not know the requirement would make the vault unreadable, and
    # ToolGate reports that as a bare ValueError several minutes later.
    TOOLGATE_VAULT_SALT=$(keep_or_make TOOLGATE_VAULT_SALT)
    case "$TOOLGATE_VAULT_SALT" in
        *[!0-9a-fA-F]* | "") TOOLGATE_VAULT_SALT=$(random_hex) ;;
    esac
    TOOLGATE_CALLBACK_SECRET=$(keep_or_make TOOLGATE_CALLBACK_SECRET)
    MEMORYGATE_ADMIN_KEY=$(keep_or_make MEMORYGATE_ADMIN_KEY)
    MEMORYGATE_DB_PASSWORD=$(keep_or_make MEMORYGATE_DB_PASSWORD)
    SYSTEMGATE_ADMIN_KEY=$(keep_or_make SYSTEMGATE_ADMIN_KEY)
    EMBEDDINGS_KEY=$(keep_or_make EMBEDDINGS_KEY)

    # Two services demand a particular shape and refuse anything else. Getting
    # it wrong does not fail here: it fails minutes later at container start,
    # as a stack trace in a log nobody is watching. So the shape is applied at
    # the point the key is made.
    PI_TOOLGATE_KEY=$(shaped PI_TOOLGATE_KEY "tgx_")
    MEMORYGATE_READ_KEY=$(shaped MEMORYGATE_READ_KEY "mg_read_")

    mkdir -p "$CONKER_BACKUP_DIR/memorygate"

    # Written with a restrictive umask and to a temp file first: a half-written
    # .env that compose reads is worse than no .env at all.
    local tmp="$ENV_FILE.tmp.$$"
    ( umask 077; : > "$tmp" )
    cat > "$tmp" <<ENV
# Conker configuration. Written by install.sh — safe to re-run.
#
# EVERY VALUE HERE IS A SECRET. This file is chmod 600 and gitignored.
# Losing it means losing access to the encrypted vault and the database.
# It is included in the backup folder named at the end of the install.

# --- what you chose ---
CONKER_PORT=${CONKER_PORT:-8050}
CONKER_LOCAL_MODEL=$CONKER_LOCAL_MODEL
CONKER_BACKUP_DIR=$CONKER_BACKUP_DIR
OPENROUTER_KEY=${OPENROUTER_KEY:-}

# --- embedding model and its width. They must agree; change both or neither. ---
CONKER_EMBEDDING_MODEL=${CONKER_EMBEDDING_MODEL:-qwen3-embedding:0.6b}
CONKER_EMBEDDING_DIMENSION=${CONKER_EMBEDDING_DIMENSION:-1024}

# --- generated. You never need to read, type or remember any of these. ---
CONKER_ADMIN_KEY=$CONKER_ADMIN_KEY
PI_GATEWAY_KEY=$PI_GATEWAY_KEY
PI_GATEWAY_KEY_SHA256=$PI_GATEWAY_KEY_SHA256
GATEWAY_ORIGIN=$GATEWAY_ORIGIN
GATEWAY_TOOLGATE_OWNER_KEY=$GATEWAY_TOOLGATE_OWNER_KEY
TOOLGATE_ADMIN_KEY=$TOOLGATE_ADMIN_KEY
TOOLGATE_VAULT_SALT=$TOOLGATE_VAULT_SALT
TOOLGATE_CALLBACK_SECRET=$TOOLGATE_CALLBACK_SECRET
MEMORYGATE_ADMIN_KEY=$MEMORYGATE_ADMIN_KEY
MEMORYGATE_READ_KEY=$MEMORYGATE_READ_KEY
MEMORYGATE_DB_PASSWORD=$MEMORYGATE_DB_PASSWORD
SYSTEMGATE_ADMIN_KEY=$SYSTEMGATE_ADMIN_KEY
EMBEDDINGS_KEY=$EMBEDDINGS_KEY
PI_TOOLGATE_KEY=$PI_TOOLGATE_KEY
ENV
    chmod 600 "$tmp"
    mv "$tmp" "$ENV_FILE"

    if [ "$existing_env" -eq 1 ]; then
        good "Updated .env, keeping the keys that were already there"
    else
        good "Wrote .env and generated every key in it"
    fi
    info "Nobody has to invent, remember or type any of them."
}

# ============================================================================
# 4. Start, and tell the truth about what came up
# ============================================================================

compose() {
    docker compose --env-file "$ROOT/versions.env" --env-file "$ENV_FILE" \
        -f "$ROOT/docker-compose.yml" "$@"
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
        while [ "$(date +%s)" -lt "$deadline" ]; do
            if [ "${names[$i]}" = "gateway" ]; then
                body=$(compose exec -T gateway python -m gateway health 2>/dev/null || true)
            else
                body=$(curl -fsS -m 3 "http://127.0.0.1:$port/health" 2>/dev/null || true)
            fi
            [ -n "$body" ] && break
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
    info "First set your browser password on this host: ./conker auth setup"
    info "Trust this installation's local TLS certificate before signing in; see docs/reference/browser-auth.md."
    info "This release provides the auth API; dashboard screens are a separate checkpoint."
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
}

# ============================================================================

main() {
    banner

    if [ "${NEEDS_CLONE:-0}" = "1" ]; then
        step "Fetching Conker"
        command -v git >/dev/null 2>&1 || die "git is needed to fetch Conker, and is not installed." \
            "Install it:  sudo apt-get install -y git"
        if [ -d "$ROOT/.git" ]; then
            git -C "$ROOT" pull --ff-only >/dev/null 2>&1 || true
            good "Updated $ROOT"
        else
            git clone --depth 1 "$REPO_URL" "$ROOT" >/dev/null 2>&1 \
                || die "Could not clone $REPO_URL into $ROOT." "Check the machine is online."
            good "Cloned into $ROOT"
        fi
    fi

    ENV_FILE="$ROOT/.env"
    LOG="${TMPDIR:-/tmp}/conker-install.$$.log"
    trap 'rm -f "$LOG"' EXIT

    check_machine
    [ "$CHECK_ONLY" -eq 1 ] && { say ""; good "This machine can run Conker."; exit 0; }

    # Defaults for a non-interactive run, before the questions may override them.
    CONKER_LOCAL_MODEL="${CONKER_LOCAL_MODEL:-qwen3:4b}"
    CONKER_BACKUP_DIR="${CONKER_BACKUP_DIR:-$HOME/conker-backups}"
    ask_questions

    write_env

    if [ "$DRY_RUN" -eq 1 ]; then
        step "Dry run — stopping before anything is pulled or started"
        good "Configuration is written and valid"
        compose config >/dev/null || die "The compose file did not validate." "This is a bug; please report it."
        good "docker-compose.yml validates against your .env"
        exit 0
    fi

    pull_and_start
    wait_for_health
    finish
}

main "$@"
