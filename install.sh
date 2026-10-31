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
#   ./install.sh --claude-plan   also run the Claude plan runtime, when this release has it
#                                (then sign in once: ./conker providers claude login)
#   ./install.sh --no-claude-plan  stop running it

set -euo pipefail

readonly REPO_URL="https://github.com/Conker-AI/conker.git"
readonly REQUIRED_GB=20
readonly LOW_MEMORY_GB=6

ASSUME_YES=0
DRY_RUN=0
CHECK_ONLY=0
CLAUDE_PLAN_CHOICE=""

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
        --claude-plan)    CLAUDE_PLAN_CHOICE=on ;;
        --no-claude-plan) CLAUDE_PLAN_CHOICE=off ;;
        -h|--help)
            sed -n '2,/^$/p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
            exit 0 ;;
        *) die "I do not know the option '$1'." "Run './install.sh --help' to see what it accepts." ;;
    esac
    shift
done

# --- where we are -----------------------------------------------------------
# Piped from curl there is no repository yet, so fetch one. Run from a checkout,
# use it as it is: a clone on top would throw away local edits.
INSTALL_SOURCE="${BASH_SOURCE[0]:-}"
if [ -f "$INSTALL_SOURCE" ] && [ -f "$(dirname "$INSTALL_SOURCE")/docker-compose.yml" ]; then
    ROOT="$(cd "$(dirname "$INSTALL_SOURCE")" && pwd)"
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

    if ! command -v python3 >/dev/null 2>&1; then
        die "Python 3 is required for transactional provider credentials and recovery." \
            "Install it:  sudo apt-get install python3" \
            "Then run this again."
    fi
    good "Python 3"

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
        read -r -s OPENROUTER_KEY || OPENROUTER_KEY=""
        printf '\n'
    fi
    say ""

    choose_claude_plan

    if owner_terminal_active; then
        CONKER_TERMINAL_WORKSPACE=$(keep_optional CONKER_TERMINAL_WORKSPACE)
        if [ -z "$CONKER_TERMINAL_WORKSPACE" ]; then
            if [ "$ASSUME_YES" -eq 1 ] || [ ! -t 0 ]; then
                die "This accepted release activates the owner terminal, but no workspace was selected." \
                    "Set CONKER_TERMINAL_WORKSPACE to one existing project directory, then run this again." \
                    "Grant group 65532 read, write and traverse access before installation."
            fi
            CONKER_TERMINAL_WORKSPACE=$(ask_text \
                "Existing project folder for the terminal:" "$HOME/conker-workspace")
        fi
        CONKER_TERMINAL_WORKSPACE_LABEL=$(keep_optional CONKER_TERMINAL_WORKSPACE_LABEL)
        CONKER_TERMINAL_WORKSPACE_LABEL=${CONKER_TERMINAL_WORKSPACE_LABEL:-$(basename -- "$CONKER_TERMINAL_WORKSPACE")}
        say ""
    fi

    if agent_sandbox_active; then
        CONKER_WORKSPACES_DIR=$(keep_optional CONKER_WORKSPACES_DIR)
        if [ -z "$CONKER_WORKSPACES_DIR" ]; then
            CONKER_WORKSPACES_DIR=$(ask_text "Agent workspaces folder:" "$HOME/conker-workspaces")
        fi
        # ~ typed by hand is a literal character, not the shell's expansion.
        CONKER_WORKSPACES_DIR="${CONKER_WORKSPACES_DIR/#\~/$HOME}"
        say ""
    fi
}

# The Claude plan runtime (docker-compose.subscriptions.yml) runs only when this release pins its
# image and the owner chose it. A re-run keeps the choice, --claude-plan and --no-claude-plan
# change it, and a person at a terminal is asked once.
choose_claude_plan() {
    CONKER_CLAUDE_PLAN=$(keep_optional CONKER_CLAUDE_PLAN)
    case "$CONKER_CLAUDE_PLAN" in on|off) ;; *) CONKER_CLAUDE_PLAN="" ;; esac
    if ! claude_plan_released; then
        if [ "$CLAUDE_PLAN_CHOICE" = on ]; then
            warn "This release does not include the Claude plan runtime yet, so it stays off."
            info "Connect Claude with an Anthropic API key meanwhile:  ./conker providers set anthropic"
            say ""
        fi
        return 0
    fi
    if [ -n "$CLAUDE_PLAN_CHOICE" ]; then
        CONKER_CLAUDE_PLAN=$CLAUDE_PLAN_CHOICE
        return 0
    fi
    [ -z "$CONKER_CLAUDE_PLAN" ] || return 0
    say "  ${BOLD}Use a Claude plan (Pro or Max) here as well?${OFF}"
    info "Optional. Adds Claude Code's own runtime. You sign in once, in a terminal, and"
    info "Conker uses it only for what you give a Claude model in Settings. An Anthropic"
    info "API key works without it."
    if ask_yes_no "Add the Claude plan runtime?" n; then
        CONKER_CLAUDE_PLAN=on
    else
        CONKER_CLAUDE_PLAN=off
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

# Always 32 characters: the gateway refuses shorter keys. Base64 of 48 random
# bytes is 64 characters, so dropping '+', '/' and '=' still leaves well over
# 32. Base64 of 24 bytes is exactly 32, and every dropped character made the
# key shorter than the gateway accepts.
random_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-32
    else
        # No openssl is normal on a slim image. urandom is the same entropy.
        head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-32
    fi
}

sha256_secret() {
    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s' "$1" | sha256sum | cut -d ' ' -f1
    else
        printf '%s' "$1" | shasum -a 256 | cut -d ' ' -f1
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

# A key two services share only to talk to each other, which the gateway
# demands be at least 32 characters. Older installers could write a shorter one;
# keeping it would leave the gateway refusing to start. It protects no stored
# data, so a short one is simply replaced (its SHA256 is derived again below).
keep_or_make_long() {
    local value
    value=$(keep_or_make "$1")
    if [ "${#value}" -ge 32 ]; then
        printf '%s' "$value"
    else
        printf '%s' "$(random_secret)"
    fi
}

keep_optional() {
    local name="$1" value=""
    value="${!name:-}"
    if [ -z "$value" ] && [ -f "$ENV_FILE" ]; then
        value=$(sed -n "s/^${name}=//p" "$ENV_FILE" | head -1)
    fi
    printf '%s' "$value"
}

# A key that must start with a particular prefix. Keeps an existing one only if
# it already has the right shape, so a key written by an older installer that
# did not know about the prefix is replaced rather than carried forward broken.
shaped() {
    local name="$1" prefix="$2" value
    value=$(keep_or_make "$name")
    case "$value" in
        "$prefix"*) printf '%s' "$value" ;;
        *) printf '%s%s' "$prefix" "$(random_secret)" ;;
    esac
}

write_env() {
    step "Writing configuration"

    local existing_env=0
    [ -f "$ENV_FILE" ] && existing_env=1

    CONKER_ADMIN_KEY=$(keep_or_make CONKER_ADMIN_KEY)
    PI_GATEWAY_KEY=$(keep_or_make_long PI_GATEWAY_KEY)
    PI_GATEWAY_KEY_SHA256=$(sha256_secret "$PI_GATEWAY_KEY")
    GATEWAY_PI_OWNER_KEY=$(keep_or_make_long GATEWAY_PI_OWNER_KEY)
    PI_OWNER_KEY_SHA256=$(sha256_secret "$GATEWAY_PI_OWNER_KEY")
    GATEWAY_TOOLGATE_OWNER_KEY=$(keep_or_make GATEWAY_TOOLGATE_OWNER_KEY)
    TOOLGATE_OWNER_KEY_SHA256=$(sha256_secret "$GATEWAY_TOOLGATE_OWNER_KEY")
    GATEWAY_ORIGIN=${GATEWAY_ORIGIN:-}
    if [ -z "$GATEWAY_ORIGIN" ] && [ -f "$ENV_FILE" ]; then
        GATEWAY_ORIGIN=$(sed -n 's/^GATEWAY_ORIGIN=//p' "$ENV_FILE" | head -1)
    fi
    GATEWAY_ORIGIN=${GATEWAY_ORIGIN:-https://localhost:${CONKER_PORT:-8050}}
    PI_DECISION_URL=$(keep_optional PI_DECISION_URL)
    PI_DECISION_KEY=$(keep_optional PI_DECISION_KEY)
    OPENROUTER_KEY=$(keep_optional OPENROUTER_KEY)
    PI_OPENAI_KEY=$(keep_optional PI_OPENAI_KEY)
    PI_ANTHROPIC_KEY=$(keep_optional PI_ANTHROPIC_KEY)
    PI_ALLOW_PAID_MODELS=$(keep_optional PI_ALLOW_PAID_MODELS)
    PI_SPEECH_URL=$(keep_optional PI_SPEECH_URL)
    PI_STT_MODEL=$(keep_optional PI_STT_MODEL)
    PI_TTS_MODEL=$(keep_optional PI_TTS_MODEL)
    PI_TTS_VOICE=$(keep_optional PI_TTS_VOICE)
    PI_SPEECH_CHARACTER_VOICE=$(keep_optional PI_SPEECH_CHARACTER_VOICE)
    PI_SPEECH_TIMEOUT_S=$(keep_optional PI_SPEECH_TIMEOUT_S)
    if owner_terminal_active; then
        CONKER_TERMINAL_WORKSPACE=$(keep_optional CONKER_TERMINAL_WORKSPACE)
        CONKER_TERMINAL_WORKSPACE_LABEL=$(keep_optional CONKER_TERMINAL_WORKSPACE_LABEL)
        if [ -z "$CONKER_TERMINAL_WORKSPACE_LABEL" ] \
            || [ "${#CONKER_TERMINAL_WORKSPACE_LABEL}" -gt 120 ]; then
            die "The owner-terminal workspace label must contain 1-120 characters."
        fi
        case "$CONKER_TERMINAL_WORKSPACE_LABEL" in
            *$'\n'*|*$'\r'*)
                die "The owner-terminal workspace label must stay on one line." ;;
        esac
    else
        CONKER_TERMINAL_WORKSPACE=""
        CONKER_TERMINAL_WORKSPACE_LABEL=""
    fi
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
    MEMORYGATE_INGEST_KEY=$(keep_or_make MEMORYGATE_INGEST_KEY)

    # MemoryGate's and ToolGate's own keys for asking Pi for model text. Pi holds only their
    # hashes, as one JSON object. They protect no stored data, so a short one is made again.
    MEMORYGATE_PI_SERVICE_KEY=$(keep_or_make_long MEMORYGATE_PI_SERVICE_KEY)
    TOOLGATE_PI_SERVICE_KEY=$(keep_or_make_long TOOLGATE_PI_SERVICE_KEY)
    PI_SERVICE_KEYS_SHA256=$(printf '{"memorygate":"%s","toolgate":"%s"}' \
        "$(sha256_secret "$MEMORYGATE_PI_SERVICE_KEY")" "$(sha256_secret "$TOOLGATE_PI_SERVICE_KEY")")
    # The key of MemoryGate's listener for imported chats, which Pi offers imported messages
    # through. MemoryGate compares it as given (it keeps no hash), so Pi gets the same value. It
    # protects no stored data, so a short one is made again; create_import_listener creates the
    # listener once MemoryGate answers.
    MEMORYGATE_IMPORT_KEY=$(keep_or_make_long MEMORYGATE_IMPORT_KEY)
    # Empty means the default in docker-compose.yml (24h).
    CONKER_OLLAMA_KEEP_ALIVE=$(keep_optional CONKER_OLLAMA_KEEP_ALIVE)
    # The Claude plan runtime's two keys: the control key stays inside it, and Pi gets only the
    # inference key. Made even while it is off, so turning it on later changes no other key. They
    # protect no stored data, so a short one is made again.
    SUBSCRIPTIONS_CONTROL_KEY=$(keep_or_make_long SUBSCRIPTIONS_CONTROL_KEY)
    SUBSCRIPTIONS_INFERENCE_KEY=$(keep_or_make_long SUBSCRIPTIONS_INFERENCE_KEY)

    mkdir -p "$CONKER_BACKUP_DIR/memorygate"
    # Memory backups are the owner's alone. A folder an older Docker run created as root cannot
    # be changed here; say so rather than stop the install.
    chmod 700 "$CONKER_BACKUP_DIR" "$CONKER_BACKUP_DIR/memorygate" 2>/dev/null         || say "  Could not make $CONKER_BACKUP_DIR private; run: chmod 700 $CONKER_BACKUP_DIR"

    local provider_dir="$ROOT/.conker/provider-secrets"
    python3 "$ROOT/scripts/provider_secrets.py" --directory "$provider_dir" initialize >/dev/null
    mkdir -p "$ROOT/.conker/provider-control"
    chmod 700 "$ROOT/.conker/provider-control"
    mkdir -p "$ROOT/.conker/chatgpt-inference"
    chmod 700 "$ROOT/.conker/chatgpt-inference"
    if claude_plan_active; then
        # The Claude plan sign-in. Made here, as the owner, before Docker would make it as root.
        mkdir -p "$ROOT/.conker/subscriptions"
        chmod 700 "$ROOT/.conker/subscriptions"
    fi
    if [ -n "$OPENROUTER_KEY" ]; then
        printf '%s' "$OPENROUTER_KEY" | python3 "$ROOT/scripts/provider_secrets.py" \
            --directory "$provider_dir" import-active openrouter >/dev/null
    fi
    if [ -n "$PI_OPENAI_KEY" ]; then
        printf '%s' "$PI_OPENAI_KEY" | python3 "$ROOT/scripts/provider_secrets.py" \
            --directory "$provider_dir" import-active openai >/dev/null
    fi
    if [ -n "$PI_ANTHROPIC_KEY" ]; then
        printf '%s' "$PI_ANTHROPIC_KEY" | python3 "$ROOT/scripts/provider_secrets.py" \
            --directory "$provider_dir" import-active anthropic >/dev/null
    fi

    local speech_dir="$ROOT/.conker/speech"
    mkdir -p "$speech_dir"
    chmod 700 "$speech_dir"
    if [ -L "$speech_dir/speech.key" ] || { [ -e "$speech_dir/speech.key" ] && [ ! -f "$speech_dir/speech.key" ]; }; then
        die "The speech credential path is not a regular file." \
            "Move $speech_dir/speech.key aside, then run the installer again."
    fi
    if [ ! -f "$speech_dir/speech.key" ]; then
        ( umask 077; : > "$speech_dir/speech.key" )
    fi
    chmod 600 "$speech_dir/speech.key"

    if owner_terminal_active; then
        local terminal_record="$ROOT/.conker/terminal-workspace.json"
        local terminal_record_tmp="$terminal_record.tmp.$$"
        if ! python3 "$ROOT/scripts/terminal_workspace.py" \
            --workspace "$CONKER_TERMINAL_WORKSPACE" \
            --installation "$ROOT" \
            --state "$ROOT/.conker" \
            --recovery "$ROOT/.conker/recovery" \
            --credentials "$provider_dir" \
            --backups "$CONKER_BACKUP_DIR" \
            --home "$HOME" \
            --workspace-gid 65532 >"$terminal_record_tmp" 2>"$LOG"; then
            rm -f "$terminal_record_tmp"
            die "The owner-terminal workspace did not pass its host boundary check." \
                "$(tail -3 "$LOG")" \
                "Select one existing project directory outside Conker, backups and your home root." \
                "Grant group 65532 access with chgrp/chmod, then run this again."
        fi
        chmod 600 "$terminal_record_tmp"
        mv "$terminal_record_tmp" "$terminal_record"
    fi

    if agent_sandbox_active; then
        CONKER_DOCKER_GID=$(stat -c %g /var/run/docker.sock 2>/dev/null) \
            || die "Cannot read the Docker socket group. Is Docker installed and running?"
        mkdir -p "$CONKER_WORKSPACES_DIR"
        local AGENT_SANDBOX_IMAGE
        AGENT_SANDBOX_IMAGE=$(sed -n 's/^AGENT_SANDBOX_IMAGE=//p' "$ROOT/versions.env" | head -1)
        docker run --rm --network none --user 0:0 \
            --mount "type=bind,src=$CONKER_WORKSPACES_DIR,dst=/w" \
            "$AGENT_SANDBOX_IMAGE" \
            sh -c 'chown 65533:'"$(id -g)"' /w && chmod 2770 /w'
        good "Agent workspaces folder is ready — agents' files appear there, one folder per agent"
    fi

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
PI_ALLOW_PAID_MODELS=${PI_ALLOW_PAID_MODELS:-}
PI_DECISION_URL=$PI_DECISION_URL
PI_DECISION_KEY=$PI_DECISION_KEY
PI_SPEECH_URL=$PI_SPEECH_URL
PI_STT_MODEL=$PI_STT_MODEL
PI_TTS_MODEL=$PI_TTS_MODEL
PI_TTS_VOICE=$PI_TTS_VOICE
PI_SPEECH_CHARACTER_VOICE=${PI_SPEECH_CHARACTER_VOICE:-unsupported}
PI_SPEECH_TIMEOUT_S=${PI_SPEECH_TIMEOUT_S:-30}
CONKER_TERMINAL_WORKSPACE=$CONKER_TERMINAL_WORKSPACE
CONKER_TERMINAL_WORKSPACE_LABEL=$CONKER_TERMINAL_WORKSPACE_LABEL
CONKER_WORKSPACES_DIR=${CONKER_WORKSPACES_DIR:-}
CONKER_DOCKER_GID=${CONKER_DOCKER_GID:-}
# How long a local model stays loaded after its last use; empty is 24h.
CONKER_OLLAMA_KEEP_ALIVE=$CONKER_OLLAMA_KEEP_ALIVE
# The Claude plan runtime: on or off (./install.sh --claude-plan or --no-claude-plan).
CONKER_CLAUDE_PLAN=${CONKER_CLAUDE_PLAN:-}
# Pi and the gateway run as you, so they can read your private provider files.
CONKER_UID=$(id -u)
CONKER_GID=$(id -g)

# --- embedding model and its width. They must agree; change both or neither. ---
CONKER_EMBEDDING_MODEL=${CONKER_EMBEDDING_MODEL:-qwen3-embedding:0.6b}
CONKER_EMBEDDING_DIMENSION=${CONKER_EMBEDDING_DIMENSION:-1024}

# --- generated. You never need to read, type or remember any of these. ---
CONKER_ADMIN_KEY=$CONKER_ADMIN_KEY
PI_GATEWAY_KEY=$PI_GATEWAY_KEY
PI_GATEWAY_KEY_SHA256=$PI_GATEWAY_KEY_SHA256
GATEWAY_PI_OWNER_KEY=$GATEWAY_PI_OWNER_KEY
PI_OWNER_KEY_SHA256=$PI_OWNER_KEY_SHA256
GATEWAY_ORIGIN=$GATEWAY_ORIGIN
GATEWAY_TOOLGATE_OWNER_KEY=$GATEWAY_TOOLGATE_OWNER_KEY
TOOLGATE_OWNER_KEY_SHA256=$TOOLGATE_OWNER_KEY_SHA256
TOOLGATE_ADMIN_KEY=$TOOLGATE_ADMIN_KEY
TOOLGATE_VAULT_SALT=$TOOLGATE_VAULT_SALT
TOOLGATE_CALLBACK_SECRET=$TOOLGATE_CALLBACK_SECRET
MEMORYGATE_ADMIN_KEY=$MEMORYGATE_ADMIN_KEY
MEMORYGATE_READ_KEY=$MEMORYGATE_READ_KEY
MEMORYGATE_INGEST_KEY=$MEMORYGATE_INGEST_KEY
MEMORYGATE_DB_PASSWORD=$MEMORYGATE_DB_PASSWORD
SYSTEMGATE_ADMIN_KEY=$SYSTEMGATE_ADMIN_KEY
EMBEDDINGS_KEY=$EMBEDDINGS_KEY
PI_TOOLGATE_KEY=$PI_TOOLGATE_KEY
MEMORYGATE_PI_SERVICE_KEY=$MEMORYGATE_PI_SERVICE_KEY
TOOLGATE_PI_SERVICE_KEY=$TOOLGATE_PI_SERVICE_KEY
PI_SERVICE_KEYS_SHA256=$PI_SERVICE_KEYS_SHA256
MEMORYGATE_IMPORT_KEY=$MEMORYGATE_IMPORT_KEY
SUBSCRIPTIONS_CONTROL_KEY=$SUBSCRIPTIONS_CONTROL_KEY
SUBSCRIPTIONS_INFERENCE_KEY=$SUBSCRIPTIONS_INFERENCE_KEY
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

owner_terminal_active() {
    grep -qx 'OWNER_TERMINAL_STATE=active' "$ROOT/versions.env"
}

agent_sandbox_active() {
    grep -qx 'AGENT_SANDBOX_STATE=active' "$ROOT/versions.env"
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

# ============================================================================

main() {
    banner

    if [ "${NEEDS_CLONE:-0}" = "1" ]; then
        step "Fetching Conker"
        command -v git >/dev/null 2>&1 || die "git is needed to fetch Conker, and is not installed." \
            "Install it:  sudo apt-get install -y git"
        if [ -d "$ROOT/.git" ]; then
            [ -z "$(git -C "$ROOT" status --porcelain)" ] \
                || die "The existing checkout has local changes; it was not updated." \
                    "Save or commit those changes in $ROOT, then run the installer again."
            git -C "$ROOT" pull --ff-only >/dev/null 2>&1 \
                || die "Could not update $ROOT; no services were changed." \
                    "Run 'git -C $ROOT pull --ff-only' to inspect the failure, then try again."
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
    # Only the owner may read it: it collects error output from every step.
    ( umask 077; : > "$LOG" )

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

    prepare_dashboard
    pull_and_start
    wait_for_health
    create_import_listener
    if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
        if ! python3 "$ROOT/scripts/provider_control_install.py" --root "$ROOT" --source "$ROOT" --layout repository >/dev/null; then
            warn "Provider UI control could not start. Retry with: conker providers install-ui-control"
        fi
    else
        warn "Provider key entry in Settings requires a Linux systemd user session. CLI provider management remains available."
    fi
    finish
}

main "$@"
