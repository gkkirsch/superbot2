#!/bin/bash
# Load node path resolved at install time (works across all node managers)
DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
[[ -f "$DIR/.node-path" ]] && export PATH="$(cat "$DIR/.node-path"):$PATH"
export PATH="$HOME/.local/bin:$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source file locking helper
source "$SCRIPT_DIR/lock-helper.sh"
CONFIG="$DIR/config.json"
LAST_RUN="$DIR/schedule-last-run.json"
LOG="$DIR/logs/scheduler.log"
TEAM_DIR="$HOME/.claude/teams/superbot2"

# Exit silently if no config or team not set up
[[ ! -f "$CONFIG" ]] && exit 0
[[ ! -f "$TEAM_DIR/config.json" ]] && exit 0

# Ensure log directory exists
mkdir -p "$DIR/logs"

# Extract schedule array
SCHEDULE_DATA=$(jq -r '.schedule // []' "$CONFIG")
[[ "$SCHEDULE_DATA" == "[]" ]] && exit 0

SCHEDULE=$(mktemp)
echo "$SCHEDULE_DATA" > "$SCHEDULE"
trap "rm -f $SCHEDULE" EXIT

# Ensure last-run tracker exists
[[ ! -f "$LAST_RUN" ]] && echo '{}' > "$LAST_RUN"

NOW_HOUR=$(date '+%H')
NOW_MIN=$(date '+%M')
NOW_DAY=$(date '+%a' | tr '[:upper:]' '[:lower:]')
NOW_DATE=$(date '+%Y-%m-%d')

# Find due jobs, update last-run tracker, output JSON array of due jobs
RESULT=$(node -e "
const fs = require('fs');
const schedule = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const lastRun = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const [nowHour, nowMin, nowDay, nowDate] = [process.argv[3], process.argv[4], process.argv[5], process.argv[6]];

const due = [];
for (const job of schedule) {
  const [jobH, jobM] = job.time.split(':');
  if (jobH !== nowHour || jobM !== nowMin) continue;
  if (job.days && job.days.length > 0 && !job.days.includes(nowDay)) continue;
  const key = job.name + ':' + nowDate + 'T' + job.time;
  if (lastRun[job.name] === key) continue;
  lastRun[job.name] = key;
  due.push(job);
}
fs.writeFileSync(process.argv[2], JSON.stringify(lastRun, null, 2));
if (due.length > 0) console.log(JSON.stringify(due));
" "$SCHEDULE" "$LAST_RUN" "$NOW_HOUR" "$NOW_MIN" "$NOW_DAY" "$NOW_DATE" 2>> "$LOG")

[[ -z "$RESULT" ]] && exit 0

# Drop each due job as a notification in team-lead's inbox
INBOX="$TEAM_DIR/inboxes/team-lead.json"

echo "$RESULT" | jq -c '.[]' | while read -r JOB; do
  JOB_NAME=$(echo "$JOB" | jq -r '.name')
  JOB_TASK=$(echo "$JOB" | jq -r '.task')
  JOB_TIME=$(echo "$JOB" | jq -r '.time')

  # Extract optional fields from job config for metadata
  JOB_SPACE=$(echo "$JOB" | jq -r '.space // empty')
  JOB_DAYS=$(echo "$JOB" | jq -c '.days // []')

  MSG=$(jq -n \
    --arg from "scheduler" \
    --arg type "scheduled_job" \
    --arg text "Scheduled job **$JOB_NAME** is due (${JOB_TIME}):\n\n$JOB_TASK" \
    --arg summary "Scheduled: $JOB_NAME" \
    --arg jobName "$JOB_NAME" \
    --arg jobTime "$JOB_TIME" \
    --arg jobSpace "$JOB_SPACE" \
    --argjson jobDays "$JOB_DAYS" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{from: $from, type: $type, text: $text, summary: $summary, metadata: {jobName: $jobName, scheduledTime: $jobTime, space: (if $jobSpace != "" then $jobSpace else null end), days: $jobDays}, timestamp: $ts, read: false}')

  if [[ -f "$INBOX" ]] && jq -e '. | type == "array"' "$INBOX" >/dev/null 2>&1; then
    locked_write "$INBOX" '. + [$msg]' --argjson msg "$MSG"
  else
    echo "[$MSG]" > "$INBOX"
  fi

  echo "$(date '+%Y-%m-%d %H:%M') - Scheduled: $JOB_NAME → team-lead inbox" >> "$LOG"
done
