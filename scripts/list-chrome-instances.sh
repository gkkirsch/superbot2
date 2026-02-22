#!/bin/bash
# list-chrome-instances.sh — List all active superbot2 Chrome instances
#
# Usage: list-chrome-instances.sh [--json]
#
# Shows all Chrome instances running with --remote-debugging-port,
# deduplicated by port (Chrome spawns many subprocesses per instance).
#
# Options:
#   --json    Output as JSON array (for programmatic use)

set -uo pipefail

JSON_MODE=false
if [[ "${1:-}" == "--json" ]]; then
  JSON_MODE=true
fi

# Find Chrome main processes (no --type= flag) with remote-debugging-port
PROCS=$(ps aux | grep -E "remote-debugging-port=[0-9]+" | grep -v grep | grep -v -- "--type=" || true)

if [[ -z "$PROCS" ]]; then
  # Fallback: get unique ports from any Chrome process
  PROCS=$(ps aux | grep -E "remote-debugging-port=[0-9]+" | grep -v grep || true)
fi

if [[ -z "$PROCS" ]]; then
  if $JSON_MODE; then
    echo "[]"
  else
    echo "No Chrome instances with CDP found"
  fi
  exit 0
fi

# Deduplicate by port using a simple seen list
SEEN_PORTS=""

port_seen() {
  echo "$SEEN_PORTS" | grep -qw "$1" 2>/dev/null
}

mark_seen() {
  SEEN_PORTS="$SEEN_PORTS $1"
}

if $JSON_MODE; then
  echo "["
  FIRST=true
  while IFS= read -r line; do
    PORT=$(echo "$line" | grep -oE "remote-debugging-port=[0-9]+" | grep -oE "[0-9]+")
    port_seen "$PORT" && continue
    mark_seen "$PORT"

    PID=$(echo "$line" | awk '{print $2}')
    USER_DATA_DIR=$(echo "$line" | grep -oE "user-data-dir=[^ ]+" | sed 's/user-data-dir=//' || echo "default")

    if [[ "$PORT" == "9222" ]]; then
      TYPE="main"
    else
      TYPE="worker"
    fi

    if $FIRST; then
      FIRST=false
    else
      echo ","
    fi
    printf '  {"port": %s, "pid": %s, "type": "%s", "user_data_dir": "%s"}' "$PORT" "$PID" "$TYPE" "$USER_DATA_DIR"
  done <<< "$PROCS"
  echo ""
  echo "]"
else
  printf "%-8s %-8s %-10s %s\n" "PORT" "PID" "TYPE" "USER-DATA-DIR"
  printf "%-8s %-8s %-10s %s\n" "----" "---" "----" "-------------"
  while IFS= read -r line; do
    PORT=$(echo "$line" | grep -oE "remote-debugging-port=[0-9]+" | grep -oE "[0-9]+")
    port_seen "$PORT" && continue
    mark_seen "$PORT"

    PID=$(echo "$line" | awk '{print $2}')
    USER_DATA_DIR=$(echo "$line" | grep -oE "user-data-dir=[^ ]+" | sed 's/user-data-dir=//' || echo "(default profile)")

    if [[ "$PORT" == "9222" ]]; then
      TYPE="main"
    else
      TYPE="worker"
    fi

    printf "%-8s %-8s %-10s %s\n" "$PORT" "$PID" "$TYPE" "$USER_DATA_DIR"
  done <<< "$PROCS"
fi
