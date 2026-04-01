#!/bin/bash
# telegram-watchdog.sh — Supervises telegram-watcher.mjs with auto-restart
# Usage: bash telegram-watchdog.sh
#
# Restarts the watcher on crash with exponential backoff (1s -> 2s -> 4s -> ... -> 60s).
# Backoff resets after 60 seconds of stable running.
# Monitors heartbeat file — kills watcher if no heartbeat for 5 minutes.
# Writes its own PID to ~/.superbot2/telegram-watchdog.pid for management.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHER_SCRIPT="$SCRIPT_DIR/telegram-watcher.mjs"
SUPERBOT_DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
WATCHDOG_PID_FILE="$SUPERBOT_DIR/telegram-watchdog.pid"
HEARTBEAT_FILE="$SUPERBOT_DIR/telegram-heartbeat.txt"
LOG_DIR="$SUPERBOT_DIR/logs"
LOG_FILE="$LOG_DIR/telegram-watcher.log"
HEALTH_CHECK_INTERVAL=60   # check heartbeat every 60s
HEARTBEAT_STALE_THRESHOLD=300  # 5 minutes in seconds

mkdir -p "$LOG_DIR"

# Write watchdog PID
echo $$ > "$WATCHDOG_PID_FILE"

cleanup() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] telegram-watchdog: shutting down" >> "$LOG_FILE"
  # Kill the watcher child if running
  if [ -n "$CHILD_PID" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill "$CHILD_PID" 2>/dev/null
    wait "$CHILD_PID" 2>/dev/null
  fi
  rm -f "$WATCHDOG_PID_FILE"
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

BACKOFF=1
MAX_BACKOFF=60
STABLE_THRESHOLD=60  # seconds of uptime before resetting backoff

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] telegram-watchdog: starting (pid=$$)" >> "$LOG_FILE"

while true; do
  START_TIME=$(date +%s)

  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] telegram-watchdog: launching watcher (backoff=${BACKOFF}s)" >> "$LOG_FILE"

  node "$WATCHER_SCRIPT" >> "$LOG_FILE" 2>&1 &
  CHILD_PID=$!

  # Monitor loop: check child status and heartbeat
  while true; do
    # Check if child is still running
    if ! kill -0 "$CHILD_PID" 2>/dev/null; then
      wait "$CHILD_PID" 2>/dev/null
      EXIT_CODE=$?
      CHILD_PID=""
      break
    fi

    # Check heartbeat staleness
    if [ -f "$HEARTBEAT_FILE" ]; then
      HEARTBEAT_TS=$(cat "$HEARTBEAT_FILE" 2>/dev/null)
      if [ -n "$HEARTBEAT_TS" ]; then
        NOW_MS=$(($(date +%s) * 1000))
        AGE_MS=$((NOW_MS - HEARTBEAT_TS))
        AGE_S=$((AGE_MS / 1000))
        if [ "$AGE_S" -gt "$HEARTBEAT_STALE_THRESHOLD" ]; then
          echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] telegram-watchdog: heartbeat stale (${AGE_S}s > ${HEARTBEAT_STALE_THRESHOLD}s) — killing watcher" >> "$LOG_FILE"
          kill "$CHILD_PID" 2>/dev/null
          wait "$CHILD_PID" 2>/dev/null
          EXIT_CODE=1
          CHILD_PID=""
          rm -f "$HEARTBEAT_FILE"
          break
        fi
      fi
    fi

    sleep "$HEALTH_CHECK_INTERVAL"
  done

  END_TIME=$(date +%s)
  UPTIME=$((END_TIME - START_TIME))

  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] telegram-watchdog: watcher exited (code=$EXIT_CODE, uptime=${UPTIME}s)" >> "$LOG_FILE"

  # If the watcher ran for a while, it was stable — reset backoff
  if [ "$UPTIME" -ge "$STABLE_THRESHOLD" ]; then
    BACKOFF=1
  fi

  # Exit code 0 means clean shutdown (e.g. telegram disabled) — don't restart
  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] telegram-watchdog: clean exit, not restarting" >> "$LOG_FILE"
    rm -f "$WATCHDOG_PID_FILE"
    exit 0
  fi

  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] telegram-watchdog: restarting in ${BACKOFF}s..." >> "$LOG_FILE"
  sleep "$BACKOFF"

  # Exponential backoff
  BACKOFF=$((BACKOFF * 2))
  if [ "$BACKOFF" -gt "$MAX_BACKOFF" ]; then
    BACKOFF=$MAX_BACKOFF
  fi
done
