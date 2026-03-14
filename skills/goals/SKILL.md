---
name: goals
description: >
  Dashboard card for tracking and managing goals. Shows a Goals card with add/complete/pause/update actions.
  Every 6 hours, runs an automated progress check that reviews space activity and appends progress notes to active goals.
  Triggers: "check goals", "goal progress", "add goal".
  NOT for: task management (use todos), project planning (use spaces).
version: 0.1.0
allowed-tools: Read, Grep, Glob, Bash

metadata:
  superbot:
    emoji: "\U0001F3AF"
    scope: "space"
    icon: "target"
---

# Goals

Track and manage goals across all spaces with automated progress checks.

## How It Works

1. Goals are stored in `data.jsonl` (JSONL format, one goal per line)
2. The dashboard renders goals using the `goal-tracker` renderer with complete/pause/update actions
3. Every 6 hours, `check-progress.sh` reviews active goals and appends progress notes based on space activity
4. Users can add goals via the dashboard UI or the `add-goal.sh` script

## Adding Goals

### Via Dashboard
Click "Add goal" on the Goals card. Fill in the title, optional notes, and optional due date.

### Via Script
```bash
bash $SUPERBOT2_APP_DIR/skills/goals/add-goal.sh '<title>' <space> \
  --progress '0/10' \
  --due '2026-06-01' \
  --notes 'context about this goal'
```

Arguments:
- `title` (required) — the goal text
- `space` (required) — which space this goal belongs to (or "general")

Options:
- `--progress` — progress indicator (e.g. "3/10", "75%")
- `--due` — target date (YYYY-MM-DD)
- `--notes` — additional context

## Scheduled Progress Check

Every 6 hours (00:00, 06:00, 12:00, 18:00), the skill runs `check-progress.sh` which:
1. Reads all active goals
2. For each goal with an associated space, checks:
   - Task completion counts across plans
   - Pending escalations
3. Appends a timestamped progress note to the goal

Run manually:
```bash
bash $SUPERBOT2_APP_DIR/skills/goals/check-progress.sh
bash $SUPERBOT2_APP_DIR/skills/goals/check-progress.sh --dry-run  # preview only
```

## Settings

- **Progress check sources** — What to review: all activity, spaces only, or manual only
- **Auto-add progress notes** — Toggle automatic progress note appending

## File Structure

```
goals/
├── SKILL.md          <- this file (skill instructions)
├── superbot.json     <- skill manifest (card, settings, schedule)
├── add-goal.sh       <- script to add goals
├── check-progress.sh <- automated progress checker (runs on schedule)
├── data.jsonl        <- runtime data (gitignored)
└── .gitignore        <- excludes data.jsonl
```
