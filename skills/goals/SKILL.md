---
name: goals
description: Dashboard card for tracking and managing goals across all spaces. Goals are displayed with status, progress, due dates, and notes.
version: 0.1.0
---

# Goals

This skill provides a dashboard card for tracking goals. Everything is self-contained within this skill directory.

## How It Works

1. Goals are stored in `data.jsonl` (in this skill's directory)
2. The dashboard reads `superbot.json` and renders goals with complete/pause/update actions
3. Workers or the user can add goals via the queue script

## Adding Goals

Add a goal using the skill's built-in script:

```bash
bash ~/dev/superbot2/skills/goals/add-goal.sh '<title>' <space> \
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

## File Structure

```
goals/
├── SKILL.md          ← this file (skill instructions)
├── superbot.json     ← skill manifest (card definition)
├── add-goal.sh       ← script to add goals
├── data.jsonl        ← runtime data (gitignored)
└── .gitignore        ← excludes data.jsonl
```
