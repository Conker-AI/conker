# shellcheck shell=bash
# Sourced by install.sh after the checkout is in place; the generated secrets and the .env they are written to.
# It only defines functions. The variables it reads are set in install.sh or in the other parts.

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
        # A kept localhost origin follows the port; one the owner set is left alone.
        case "$GATEWAY_ORIGIN" in
            *:${CONKER_PORT:-8050}) ;;
            https://localhost:*|http://localhost:*) GATEWAY_ORIGIN=https://localhost:${CONKER_PORT:-8050} ;;
        esac
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
