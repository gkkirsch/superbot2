#!/bin/bash
# superbot2 update — pull latest code and reinstall assets (lightweight, no backup)
set -euo pipefail

SUPERBOT2_NAME="${SUPERBOT2_NAME:-superbot2}"
DIR="${SUPERBOT2_HOME:-$HOME/.$SUPERBOT2_NAME}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_DIR="$DIR/.claude"

echo "Updating $SUPERBOT2_NAME..."

# --- Git pull ---
echo "Pulling latest changes..."
cd "$REPO_DIR"
BEFORE=$(git rev-parse HEAD)
git pull --ff-only
AFTER=$(git rev-parse HEAD)

if [[ "$BEFORE" == "$AFTER" ]]; then
  echo "Already up to date."
else
  echo ""
  echo "New commits:"
  git log --oneline "$BEFORE..$AFTER"
  echo ""
fi

# --- npm install + build ---
echo "Installing dashboard server dependencies..."
(cd "$REPO_DIR/dashboard" && npm install --silent)

echo "Installing dashboard UI dependencies..."
(cd "$REPO_DIR/dashboard-ui" && npm install --silent)

echo "Building dashboard UI..."
(cd "$REPO_DIR/dashboard-ui" && npm run build)

# --- Copy scripts ---
echo "Updating scripts..."
mkdir -p "$DIR/scripts"
for script in create-space.sh create-project.sh create-task.sh update-task.sh create-escalation.sh resolve-escalation.sh promote-escalation.sh consume-escalation.sh write-session.sh portfolio-status.sh heartbeat-cron.sh scheduler.sh lock-helper.sh update.sh restart-dashboard.sh; do
  if [[ -f "$REPO_DIR/scripts/$script" ]]; then
    cp "$REPO_DIR/scripts/$script" "$DIR/scripts/$script"
  fi
done
chmod +x "$DIR/scripts/"*.sh
echo "  Scripts updated"

# --- Copy skills ---
echo "Updating skills..."
SKILLS_DIR="$CLAUDE_DIR/skills"
mkdir -p "$SKILLS_DIR"

for skill_dir in "$REPO_DIR"/skills/*/; do
  skill_name=$(basename "$skill_dir")
  if [[ -d "$SKILLS_DIR/$skill_name" ]]; then
    rm -rf "$SKILLS_DIR/$skill_name"
  fi
  cp -r "$skill_dir" "$SKILLS_DIR/$skill_name"
  # Expand ~/.superbot2 paths in skill markdown files
  for md_file in "$SKILLS_DIR/$skill_name"/*.md; do
    [[ -f "$md_file" ]] || continue
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|~/.superbot2|$DIR|g" "$md_file"
    else
      sed -i "s|~/.superbot2|$DIR|g" "$md_file"
    fi
  done
done
echo "  Skills updated"

# --- Copy agents ---
echo "Updating agents..."
AGENTS_DIR="$CLAUDE_DIR/agents"
mkdir -p "$AGENTS_DIR"

for agent_file in "$REPO_DIR"/agents/*.md; do
  [[ ! -f "$agent_file" ]] && continue
  agent_name=$(basename "$agent_file")
  cp "$agent_file" "$AGENTS_DIR/$agent_name"
done
echo "  Agents updated"

# --- Restart dashboard server ---
echo "Restarting dashboard server..."
bash "$REPO_DIR/scripts/restart-dashboard.sh"

# --- Done ---
echo ""
echo "Update complete!"
