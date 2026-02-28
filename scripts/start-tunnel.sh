#!/usr/bin/env bash
# start-tunnel.sh — Start a Cloudflare quick tunnel to expose the dashboard
# The tunnel URL is saved to ~/.superbot2/config.json under telegram.webAppUrl
#
# Usage: bash start-tunnel.sh [port]
# Default port: 3274

set -euo pipefail

PORT="${1:-${SUPERBOT2_UI_PORT:-47474}}"
SUPERBOT_DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
CONFIG="$SUPERBOT_DIR/config.json"
LOG="$SUPERBOT_DIR/logs/tunnel.log"
PID_FILE="$SUPERBOT_DIR/tunnel.pid"

mkdir -p "$SUPERBOT_DIR/logs"

# Check if tunnel is already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Tunnel already running (PID $PID)"
        echo "Stop it first: bash $(dirname "$0")/stop-tunnel.sh"
        exit 1
    fi
    rm -f "$PID_FILE"
fi

# Check for cloudflared
if ! command -v cloudflared &>/dev/null; then
    echo "cloudflared not found. Installing via brew..."
    brew install cloudflared
fi

echo "Starting Cloudflare tunnel to localhost:$PORT..."

# Start cloudflared quick tunnel in background
cloudflared tunnel --url "http://localhost:$PORT" &>"$LOG" &
TUNNEL_PID=$!
echo "$TUNNEL_PID" > "$PID_FILE"

echo "Tunnel PID: $TUNNEL_PID"
echo "Waiting for tunnel URL..."

# Wait for the URL to appear in logs (up to 30 seconds)
TUNNEL_URL=""
for i in $(seq 1 30); do
    sleep 1
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
        echo "ERROR: cloudflared exited unexpectedly. Check $LOG"
        rm -f "$PID_FILE"
        exit 1
    fi
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
done

if [ -z "$TUNNEL_URL" ]; then
    echo "ERROR: Could not detect tunnel URL after 30s. Check $LOG"
    kill "$TUNNEL_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"

# Save URL to config.json
if [ -f "$CONFIG" ]; then
    # Use node for reliable JSON manipulation
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG', 'utf-8'));
        if (!config.telegram) config.telegram = {};
        config.telegram.webAppUrl = '$TUNNEL_URL';
        fs.writeFileSync('$CONFIG', JSON.stringify(config, null, 2));
    "
    echo "Saved webAppUrl to config.json"

    # Auto-update Telegram menu button if bot token is configured
    BOT_TOKEN=$(node -e "const c = JSON.parse(require('fs').readFileSync('$CONFIG','utf-8')); console.log(c.telegram?.botToken || '')")

    if [ -n "$BOT_TOKEN" ]; then
        RESULT=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
            -H "Content-Type: application/json" \
            -d "{\"menu_button\": {\"type\": \"web_app\", \"text\": \"Dashboard\", \"web_app\": {\"url\": \"$TUNNEL_URL\"}}}")

        if echo "$RESULT" | grep -q '"ok":true'; then
            echo "Updated Telegram menu button to $TUNNEL_URL"
        else
            echo "WARNING: Failed to update Telegram menu button: $RESULT"
        fi

        # Register bot commands (shows autocomplete when users type /)
        COMMANDS='[{"command":"dashboard","description":"Open the superbot2 dashboard"},{"command":"status","description":"Portfolio status summary"},{"command":"escalations","description":"Show pending escalations"},{"command":"spaces","description":"Spaces and project details"},{"command":"recent","description":"Recent session summaries"},{"command":"schedule","description":"Scheduled jobs"},{"command":"todo","description":"Your todos"},{"command":"help","description":"List available commands"}]'
        CMD_RESULT=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
            -H "Content-Type: application/json" \
            -d "{\"commands\": $COMMANDS}")

        if echo "$CMD_RESULT" | grep -q '"ok":true'; then
            echo "Registered bot command menu"
        else
            echo "WARNING: Failed to register bot commands: $CMD_RESULT"
        fi
    else
        echo "No Telegram bot token found in config — skipping menu button update"
    fi
else
    echo "WARNING: config.json not found at $CONFIG — URL not saved"
fi

echo ""
echo "Tunnel is running. To stop: bash $(dirname "$0")/stop-tunnel.sh"
echo "Logs: $LOG"
