#!/bin/bash
# imessage-setup.sh — Interactive iMessage bridge setup wizard for superbot2
# Usage: superbot2 imessage-setup [status|test|reset]
set -euo pipefail

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
CONFIG="$DIR/config.json"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Colors ───
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
fail() { echo -e "  ${RED}✗${RESET}  $*"; }
info() { echo -e "  ${CYAN}→${RESET}  $*"; }
header() { echo -e "\n${BOLD}$*${RESET}"; }

# ─── Read config helpers ───

get_config() {
  local key="$1"
  python3 -c "
import json, sys
try:
  c = json.load(open('$CONFIG'))
  val = c.get('imessage', {}).get('$key', '')
  print(val if val else '')
except:
  print('')
" 2>/dev/null
}

set_config() {
  local key="$1" val="$2"
  python3 -c "
import json
with open('$CONFIG', 'r') as f:
  c = json.load(f)
c.setdefault('imessage', {})['$key'] = '$val'
with open('$CONFIG', 'w') as f:
  json.dump(c, f, indent=2)
" 2>/dev/null
}

# ─── Status check ───

run_status() {
  header "iMessage Bridge Status"

  local apple_id enabled phone watcher chatdb messages_running

  apple_id=$(get_config appleId)
  enabled=$(get_config enabled)
  phone=$(get_config phoneNumber)

  echo ""
  if [[ "$enabled" == "True" || "$enabled" == "true" ]]; then
    ok "enabled:    yes"
  else
    fail "enabled:    no"
  fi

  if [[ -n "$apple_id" && "$apple_id" != "YOUR_SUPERBOT2_APPLE_ID" ]]; then
    ok "appleId:    $apple_id"
  else
    fail "appleId:    (not set)"
  fi

  if [[ -n "$phone" ]]; then
    ok "phone:      $phone"
  else
    warn "phone:      (not set — needed to receive replies)"
  fi

  if pgrep -f imessage-watcher.sh > /dev/null 2>&1; then
    ok "watcher:    running (PID $(pgrep -f imessage-watcher.sh | head -1))"
  else
    fail "watcher:    not running"
  fi

  if sqlite3 -readonly ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;" > /dev/null 2>&1; then
    ok "chat.db:    readable (Full Disk Access OK)"
  else
    fail "chat.db:    NOT readable (Full Disk Access missing)"
  fi

  if osascript -e 'tell application "System Events" to (name of processes) contains "Messages"' 2>/dev/null | grep -q "true"; then
    ok "Messages:   running"
  else
    warn "Messages:   not running"
  fi

  echo ""
}

# ─── End-to-end test ───

run_test() {
  header "iMessage End-to-End Test"

  local apple_id phone
  apple_id=$(get_config appleId)
  phone=$(get_config phoneNumber)

  if [[ -z "$apple_id" || "$apple_id" == "YOUR_SUPERBOT2_APPLE_ID" ]]; then
    fail "No Apple ID configured. Run: superbot2 imessage-setup"
    exit 1
  fi

  echo ""
  info "Sending test message..."
  if bash "$SCRIPTS_DIR/send-imessage.sh" "${phone:-$apple_id}" "superbot2 test ✓ $(date '+%H:%M:%S')" 2>/dev/null; then
    ok "Test message sent to ${phone:-$apple_id}"
  else
    fail "Failed to send test message. Is Messages.app running and signed in?"
    exit 1
  fi

  echo ""
  info "Watching chat.db for your reply (30s timeout)..."
  info "Text back anything to the superbot2 Apple ID ($apple_id) from your phone now."
  echo ""

  local last_rowid
  last_rowid=$(sqlite3 -readonly ~/Library/Messages/chat.db "SELECT COALESCE(MAX(rowid), 0) FROM message;" 2>/dev/null)

  for i in $(seq 1 6); do
    sleep 5
    local new_msg
    new_msg=$(sqlite3 -readonly ~/Library/Messages/chat.db "
      SELECT m.text FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.rowid
      JOIN chat c ON c.rowid = cmj.chat_id
      WHERE m.rowid > $last_rowid
        AND m.is_from_me = 0
        AND m.text IS NOT NULL
        AND m.text != ''
      ORDER BY m.rowid DESC LIMIT 1;
    " 2>/dev/null || true)

    if [[ -n "$new_msg" ]]; then
      echo ""
      ok "Received: \"$new_msg\""
      echo ""
      ok "iMessage bridge is working end-to-end! 🎉"
      echo ""
      return 0
    fi

    echo -e "  ${CYAN}...${RESET}  waiting ($((i * 5))s)"
  done

  echo ""
  warn "No reply received in 30s. Check:"
  warn "  1. You texted the right Apple ID: $apple_id"
  warn "  2. Messages.app is signed in with that account"
  warn "  3. Full Disk Access is enabled for your terminal"
  echo ""
}

# ─── Reset ───

run_reset() {
  header "Reset iMessage Bridge"
  echo ""

  if pgrep -f imessage-watcher.sh > /dev/null 2>&1; then
    pkill -f imessage-watcher.sh 2>/dev/null || true
    ok "Stopped imessage-watcher"
  else
    info "Watcher was not running"
  fi

  python3 -c "
import json
with open('$CONFIG', 'r') as f:
  c = json.load(f)
c['imessage'] = {'enabled': False, 'appleId': '', 'phoneNumber': ''}
with open('$CONFIG', 'w') as f:
  json.dump(c, f, indent=2)
print('Config reset.')
" 2>/dev/null
  ok "iMessage config cleared"

  rm -f "$DIR/imessage-last-rowid.txt"
  ok "Removed rowid tracker"

  echo ""
  info "iMessage disabled. Run 'superbot2 imessage-setup' to re-enable."
  echo ""
}

# ─── Full setup ───

run_setup() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║   superbot2 iMessage Setup Wizard    ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${RESET}"

  # Step 1: Status check
  header "Step 1/5 — Current Status"
  run_status

  local apple_id phone
  apple_id=$(get_config appleId)
  phone=$(get_config phoneNumber)

  # Step 2: Apple ID
  if [[ -z "$apple_id" || "$apple_id" == "YOUR_SUPERBOT2_APPLE_ID" ]]; then
    header "Step 2/5 — Apple ID"
    echo ""
    info "You need a dedicated Apple ID for superbot2."
    info "This is the iMessage account people will text to reach you."
    echo ""
    info "  1. Go to https://appleid.apple.com and create a new Apple ID"
    info "  2. Suggested: superbot2-yourname@gmail.com (any email works)"
    echo ""
    read -r -p "  Enter the Apple ID email once created: " new_apple_id
    if [[ -z "$new_apple_id" ]]; then
      warn "No Apple ID entered — skipping"
    else
      set_config appleId "$new_apple_id"
      apple_id="$new_apple_id"
      ok "Apple ID set to: $apple_id"
    fi
  else
    header "Step 2/5 — Apple ID"
    ok "Already configured: $apple_id"
  fi

  # Step 3: Messages.app
  header "Step 3/5 — Messages.app"
  echo ""
  info "Sign the superbot2 Apple ID into Messages.app:"
  info "  1. Open Messages.app  (opening it now...)"
  open -a Messages 2>/dev/null || true
  info "  2. Go to Messages → Settings → iMessage  (Cmd+,)"
  info "  3. Sign in with: ${apple_id:-YOUR_APPLE_ID}"
  info "  4. If you have a personal Apple ID signed in already, add this as a 2nd account"
  echo ""
  read -r -p "  Press Enter once you've signed in (or already signed in)..."
  ok "Messages.app step complete"

  # Step 4: Full Disk Access
  header "Step 4/5 — Full Disk Access"
  echo ""
  if sqlite3 -readonly ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;" > /dev/null 2>&1; then
    ok "chat.db is readable — Full Disk Access already enabled"
  else
    fail "chat.db not readable — your terminal needs Full Disk Access"
    echo ""
    info "  1. Open System Settings → Privacy & Security → Full Disk Access"
    info "  2. Find your terminal (Terminal, iTerm2, etc.) and toggle it ON"
    info "  3. Quit and reopen your terminal, then run this wizard again"
    echo ""
    open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null || true
    warn "Reopen your terminal after granting access, then re-run: superbot2 imessage-setup"
    exit 1
  fi

  # Step 5: Enable and start watcher
  header "Step 5/5 — Enable & Start"
  echo ""

  # Ask for phone number if not set
  if [[ -z "$phone" ]]; then
    info "What's your phone number? (for routing replies back to you)"
    read -r -p "  Phone number (e.g. +18015551234): " new_phone
    if [[ -n "$new_phone" ]]; then
      set_config phoneNumber "$new_phone"
      phone="$new_phone"
      ok "Phone number set: $phone"
    fi
  else
    ok "Phone number already set: $phone"
  fi

  # Enable in config
  python3 -c "
import json
with open('$CONFIG', 'r') as f:
  c = json.load(f)
c.setdefault('imessage', {})['enabled'] = True
with open('$CONFIG', 'w') as f:
  json.dump(c, f, indent=2)
" 2>/dev/null
  ok "iMessage enabled in config"

  # Start watcher
  if pgrep -f imessage-watcher.sh > /dev/null 2>&1; then
    ok "Watcher already running (PID $(pgrep -f imessage-watcher.sh | head -1))"
  else
    mkdir -p "$DIR/logs"
    nohup bash "$SCRIPTS_DIR/imessage-watcher.sh" >> "$DIR/logs/imessage-watcher.log" 2>&1 &
    sleep 1
    if pgrep -f imessage-watcher.sh > /dev/null 2>&1; then
      ok "Watcher started (PID $(pgrep -f imessage-watcher.sh | head -1))"
    else
      fail "Watcher failed to start — check $DIR/logs/imessage-watcher.log"
      exit 1
    fi
  fi

  echo ""
  echo -e "${GREEN}${BOLD}Setup complete!${RESET}"
  echo ""

  # Offer end-to-end test
  read -r -p "  Run end-to-end test now? [Y/n] " do_test
  if [[ "${do_test:-Y}" =~ ^[Yy]$ ]]; then
    run_test
  else
    echo ""
    info "Tip: run 'superbot2 imessage-setup test' anytime to verify the bridge."
    echo ""
  fi
}

# ─── Dispatch ───

case "${1:-setup}" in
  status)
    run_status
    ;;
  test)
    run_test
    ;;
  reset)
    run_reset
    ;;
  setup|"")
    run_setup
    ;;
  *)
    echo "Usage: superbot2 imessage-setup [setup|status|test|reset]"
    exit 1
    ;;
esac
