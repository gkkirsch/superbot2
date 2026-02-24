#!/bin/bash
# PreCompact hook — logs context compaction event to dashboard
EVENTS_FILE="$HOME/.superbot2/compaction-events.jsonl"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "{\"timestamp\":\"$TIMESTAMP\",\"trigger\":\"auto\"}" >> "$EVENTS_FILE"
exit 0
