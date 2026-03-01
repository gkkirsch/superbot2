#!/bin/bash
# SubagentStop logging hook — logs all input to verify it fires for teammates
INPUT=$(cat)
LOGFILE="/tmp/subagentstop-hook.log"
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOGFILE"
echo "$INPUT" | jq . >> "$LOGFILE" 2>/dev/null || echo "$INPUT" >> "$LOGFILE"
echo "---" >> "$LOGFILE"
exit 0
