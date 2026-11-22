# shellcheck shell=bash
# Sourced by install.sh after the checkout is in place; the machine check and the questions only a person can answer.
# It only defines functions. The variables it reads are set in install.sh or in the other parts.

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

# The answers are read by secrets.sh and start.sh, which a check of this file alone cannot see.
# shellcheck disable=SC2034
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
