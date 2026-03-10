#!/usr/bin/env bash
# check-progress.sh — Automated goal progress check
# Called by the schedule (every 6 hours) to review active goals
# and append progress notes based on recent activity.
#
# Usage: bash check-progress.sh [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_FILE="$SCRIPT_DIR/data.jsonl"
SUPERBOT_DIR="${SUPERBOT_DIR:-$HOME/.superbot2}"
DRY_RUN="${1:-}"

if [ ! -f "$DATA_FILE" ]; then
  echo "No goals data file found at $DATA_FILE"
  exit 0
fi

# Read active goals and gather progress context
node -e "
const fs = require('fs');
const path = require('path');

const dataFile = process.argv[1];
const superbotDir = process.argv[2];
const dryRun = process.argv[3] === '--dry-run';

// Read goals
const lines = fs.readFileSync(dataFile, 'utf-8').trim().split('\n').filter(Boolean);
const goals = lines.map(l => JSON.parse(l));
const activeGoals = goals.filter(g => g.status === 'active');

if (activeGoals.length === 0) {
  console.log('No active goals to check.');
  process.exit(0);
}

const now = new Date().toISOString();
const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

// Gather context from spaces
function getRecentActivity(space) {
  const notes = [];

  // Check for completed tasks in the space
  const tasksDir = path.join(superbotDir, 'spaces', space, 'plans');
  if (fs.existsSync(tasksDir)) {
    try {
      const plans = fs.readdirSync(tasksDir);
      for (const plan of plans) {
        const planTasksDir = path.join(tasksDir, plan, 'tasks');
        if (!fs.existsSync(planTasksDir)) continue;
        const taskFiles = fs.readdirSync(planTasksDir).filter(f => f.endsWith('.json'));
        let completed = 0;
        let total = 0;
        for (const tf of taskFiles) {
          try {
            const task = JSON.parse(fs.readFileSync(path.join(planTasksDir, tf), 'utf-8'));
            total++;
            if (task.status === 'completed') completed++;
          } catch {}
        }
        if (total > 0) {
          notes.push(plan + ': ' + completed + '/' + total + ' tasks done');
        }
      }
    } catch {}
  }

  // Check for recent escalations
  const escDir = path.join(superbotDir, 'escalations', 'pending');
  if (fs.existsSync(escDir)) {
    try {
      const escFiles = fs.readdirSync(escDir).filter(f => f.endsWith('.json'));
      const spaceEscs = [];
      for (const ef of escFiles) {
        try {
          const esc = JSON.parse(fs.readFileSync(path.join(escDir, ef), 'utf-8'));
          if (esc.space === space) spaceEscs.push(esc);
        } catch {}
      }
      if (spaceEscs.length > 0) {
        notes.push(spaceEscs.length + ' pending escalation(s)');
      }
    } catch {}
  }

  return notes;
}

// Update each active goal with progress info
let updated = false;
const updatedGoals = goals.map(goal => {
  if (goal.status !== 'active') return goal;

  const activity = goal.space ? getRecentActivity(goal.space) : [];
  if (activity.length === 0) return goal;

  const progressNote = '[' + new Date().toLocaleDateString() + '] ' + activity.join('; ');
  const existingNotes = goal.notes || '';
  const newNotes = existingNotes
    ? existingNotes + '\\n' + progressNote
    : progressNote;

  updated = true;

  if (dryRun) {
    console.log('Would update goal: ' + goal.title);
    console.log('  Progress: ' + activity.join('; '));
    return goal;
  }

  return { ...goal, notes: newNotes, updatedAt: now };
});

if (!updated) {
  console.log('No progress updates found for active goals.');
  process.exit(0);
}

if (!dryRun) {
  const output = updatedGoals.map(g => JSON.stringify(g)).join('\n') + '\n';
  fs.writeFileSync(dataFile, output);
  console.log('Progress check complete. Updated ' + activeGoals.filter((g, i) => {
    const ug = updatedGoals.find(u => u.id === g.id);
    return ug && ug.notes !== g.notes;
  }).length + ' goal(s).');
} else {
  console.log('Dry run complete.');
}
" "$DATA_FILE" "$SUPERBOT_DIR" "$DRY_RUN"
