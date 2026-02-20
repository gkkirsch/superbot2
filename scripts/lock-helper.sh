#!/bin/bash
# lock-helper.sh — Atomic file locking for concurrent access
#
# Uses mkdir (atomic on all filesystems) with PID-based stale detection.
# Source this file, then wrap operations with locked_write.
#
# Usage:
#   source "$(dirname "$0")/lock-helper.sh"
#   locked_write "$SESSIONS" '.sessions += [...]'           # jq expression
#   locked_write "$INBOX" '. + [$msg]'                      # works on any JSON file
#   locked_write "$FILE" '.key = "val"' --arg k "v"         # extra jq args supported

LOCK_DIR_BASE="/tmp/superbot2-locks"
LOCK_TIMEOUT=${LOCK_TIMEOUT:-10}  # seconds to wait for lock
LOCK_STALE=${LOCK_STALE:-120}     # seconds before a lock is considered stale

mkdir -p "$LOCK_DIR_BASE"

# Acquire a lock for a file. Returns 0 on success, 1 on failure.
_acquire_lock() {
  local file="$1"
  local lock_name
  lock_name=$(echo "$file" | sed 's|/|_|g')
  local lock_path="$LOCK_DIR_BASE/$lock_name.lock"
  local pid_file="$lock_path/pid"
  local start=$SECONDS

  while true; do
    if mkdir "$lock_path" 2>/dev/null; then
      echo $$ > "$pid_file"
      echo "$lock_path"
      return 0
    fi

    # Check for stale lock
    if [[ -f "$pid_file" ]]; then
      local holder_pid
      holder_pid=$(cat "$pid_file" 2>/dev/null)
      if [[ -n "$holder_pid" ]] && ! kill -0 "$holder_pid" 2>/dev/null; then
        # Holder is dead — remove stale lock
        rm -rf "$lock_path"
        continue
      fi

      # Check age-based staleness
      local lock_age=0
      if [[ "$(uname)" == "Darwin" ]]; then
        lock_age=$(( $(date +%s) - $(stat -f %m "$pid_file" 2>/dev/null || echo "$(date +%s)") ))
      else
        lock_age=$(( $(date +%s) - $(stat -c %Y "$pid_file" 2>/dev/null || echo "$(date +%s)") ))
      fi
      if [[ $lock_age -gt $LOCK_STALE ]]; then
        rm -rf "$lock_path"
        continue
      fi
    fi

    # Timeout check
    if (( SECONDS - start >= LOCK_TIMEOUT )); then
      echo "" # empty = failed
      return 1
    fi

    sleep 0.1
  done
}

# Release a lock
_release_lock() {
  local lock_path="$1"
  [[ -n "$lock_path" && -d "$lock_path" ]] && rm -rf "$lock_path"
}

# locked_write FILE JQ_EXPR [extra jq args...]
# Atomically read-modify-write a JSON file with jq under a lock.
locked_write() {
  local file="$1"; shift
  local expr="$1"; shift
  # Remaining args are passed to jq (e.g. --arg key val)

  local lock_path
  lock_path=$(_acquire_lock "$file")
  if [[ -z "$lock_path" ]]; then
    echo "WARN: Could not acquire lock for $file after ${LOCK_TIMEOUT}s" >&2
    return 1
  fi

  local tmp="${file}.tmp.$$"
  local rc=0
  if jq "$@" "$expr" "$file" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    echo "ERROR: jq failed on $file" >&2
    rc=1
  fi

  _release_lock "$lock_path"
  return $rc
}
