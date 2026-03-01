#!/bin/bash
# PreCompact hook - Notifies dashboard chat when context compaction happens
#
# Receives JSON on stdin with: session_id, transcript_path, cwd,
#   permission_mode, hook_event_name, trigger, custom_instructions
# Team hooks also receive: teammate_name, team_name
#
# If teammate_name is present → worker compacting
# If teammate_name is absent → orchestrator/solo agent compacting
#
# Exit 0 always — never block compaction

set -uo pipefail

INPUT=$(cat)
TRIGGER=$(echo "$INPUT" | jq -r '.trigger // "auto"')
TEAMMATE=$(echo "$INPUT" | jq -r '.teammate_name // empty')

DASHBOARD_INBOX="$HOME/.claude/teams/superbot2/inboxes/dashboard-user.json"

# Only write if the inbox file exists (dashboard infrastructure is set up)
if [[ ! -f "$DASHBOARD_INBOX" ]]; then
  exit 0
fi

# Build message text based on who is compacting
if [[ -n "$TEAMMATE" ]]; then
  # Worker/teammate compacting
  TEXT="$TEAMMATE compacting"
else
  # Orchestrator or solo agent compacting
  TEXT="orchestrator compacting"
fi

if [[ "$TRIGGER" == "manual" ]]; then
  TEXT="$TEXT (manual)"
fi

# Append message to dashboard-user inbox
python3 -c "
import json, os
from datetime import datetime, timezone
inbox_path = '$DASHBOARD_INBOX'
msgs = json.load(open(inbox_path)) if os.path.exists(inbox_path) else []
msgs.append({
    'from': 'system',
    'type': 'compact',
    'text': '$TEXT',
    'timestamp': datetime.now(timezone.utc).isoformat(),
    'read': False
})
json.dump(msgs, open(inbox_path, 'w'), indent=2)
" 2>/dev/null || true

exit 0
