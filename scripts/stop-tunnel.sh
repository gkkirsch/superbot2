#!/usr/bin/env bash
# stop-tunnel.sh — Stop the Cloudflare tunnel started by start-tunnel.sh

set -euo pipefail

SUPERBOT_DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
PID_FILE="$SUPERBOT_DIR/tunnel.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "No tunnel PID file found. Trying pkill..."
    pkill -f "cloudflared tunnel" 2>/dev/null && echo "Stopped cloudflared" || echo "No cloudflared process found"
    exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped tunnel (PID $PID)"
else
    echo "Tunnel process $PID not running"
fi

rm -f "$PID_FILE"
