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

    # The steps live in deploy/install/ and are read from the checkout, which piped from curl
    # is the one just fetched. Each part only defines functions.
    local part
    for part in machine secrets start; do
        [ -f "$ROOT/deploy/install/$part.sh" ] \
            || die "$ROOT/deploy/install/$part.sh is missing, so this checkout is incomplete." \
                "Fetch the whole repository again, then run this again."
    done
    # shellcheck source=deploy/install/machine.sh
    . "$ROOT/deploy/install/machine.sh"
    # shellcheck source=deploy/install/secrets.sh
    . "$ROOT/deploy/install/secrets.sh"
    # shellcheck source=deploy/install/start.sh
    . "$ROOT/deploy/install/start.sh"

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
