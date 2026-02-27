#!/usr/bin/env bash
# start-tunnel.sh — Start a Cloudflare quick tunnel to expose localhost:3274
# The tunnel URL is saved to ~/.superbot2/config.json under telegram.webAppUrl
#
# Usage: bash start-tunnel.sh [port]
# Default port: 3274

set -euo pipefail

PORT="${1:-3274}"
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
else
    echo "WARNING: config.json not found at $CONFIG — URL not saved"
fi

echo ""
echo "Tunnel is running. To stop: bash $(dirname "$0")/stop-tunnel.sh"
echo "Logs: $LOG"
