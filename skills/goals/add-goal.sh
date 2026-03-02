#!/usr/bin/env bash
# add-goal.sh — Add a new goal to the goals data file
# Usage: bash add-goal.sh '<title>' <space> [--progress '3/10'] [--due '2026-06-01'] [--notes 'context']

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_FILE="$SCRIPT_DIR/data.jsonl"

if [ $# -lt 2 ]; then
  echo "Usage: $0 '<title>' <space> [--progress '...'] [--due '...'] [--notes '...']"
  exit 1
fi

TITLE="$1"
SPACE="$2"
shift 2

PROGRESS=""
DUE_DATE=""
NOTES=""

while [ $# -gt 0 ]; do
  case "$1" in
    --progress) PROGRESS="$2"; shift 2 ;;
    --due) DUE_DATE="$2"; shift 2 ;;
    --notes) NOTES="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

ID="goal-$(date +%Y%m%d%H%M%S)-$((RANDOM))"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Build JSON safely with node
node -e "
const item = {
  id: process.argv[1],
  title: process.argv[2],
  status: 'active',
  progress: process.argv[3],
  dueDate: process.argv[4],
  notes: process.argv[5],
  space: process.argv[6],
  createdAt: process.argv[7]
};
process.stdout.write(JSON.stringify(item) + '\n');
" "$ID" "$TITLE" "$PROGRESS" "$DUE_DATE" "$NOTES" "$SPACE" "$CREATED_AT" >> "$DATA_FILE"

echo "Goal added: $TITLE (id: $ID)"
