#!/bin/bash
# superbot2 setup - Initialize SUPERBOT2_HOME and install hooks/skills/agents
set -euo pipefail

DIR="${SUPERBOT2_HOME:-$HOME/.superbot2}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Setting up superbot2..."

# --- Directory structure ---
echo "Creating directory structure..."
mkdir -p "$DIR"/{knowledge,escalations/{untriaged,needs_human,resolved},daily,spaces,templates,hooks,skills,scripts}
TEAM_DIR="$HOME/.claude/teams/superbot2"
mkdir -p "$TEAM_DIR/inboxes"

# Initialize team config if missing
if [[ ! -f "$TEAM_DIR/config.json" ]]; then
  LEAD_SESSION=$(uuidgen | tr '[:upper:]' '[:lower:]')
  NOW_MS=$(date +%s)000
  cat > "$TEAM_DIR/config.json" << EOF
{
  "name": "superbot2",
  "description": "Superbot2 — team-lead orchestrates space workers and heartbeat",
  "createdAt": $NOW_MS,
  "leadAgentId": "team-lead@superbot2",
  "leadSessionId": "$LEAD_SESSION",
  "members": [
    {
      "agentId": "team-lead@superbot2",
      "name": "team-lead",
      "agentType": "team-lead",
      "joinedAt": $NOW_MS,
      "cwd": "$HOME/dev",
      "subscriptions": []
    },
    {
      "agentId": "heartbeat@superbot2",
      "name": "heartbeat",
      "agentType": "heartbeat",
      "joinedAt": $NOW_MS,
      "cwd": "$HOME/dev",
      "subscriptions": [],
      "isBackground": true
    }
  ]
}
EOF
  echo "  Created team config"
else
  echo "  Team config already exists, skipping"
fi

# Initialize inboxes if missing
for inbox in team-lead heartbeat; do
  if [[ ! -f "$TEAM_DIR/inboxes/$inbox.json" ]]; then
    echo '[]' > "$TEAM_DIR/inboxes/$inbox.json"
    echo "  Initialized $inbox inbox"
  fi
done

# --- Guide files (expand ~ to absolute path) ---
echo "Copying guide files..."
sed "s|~/.superbot2|$DIR|g" "$REPO_DIR/templates/ORCHESTRATOR_GUIDE.md" > "$DIR/ORCHESTRATOR_GUIDE.md"
sed "s|~/.superbot2|$DIR|g" "$REPO_DIR/templates/SPACE_WORKER_GUIDE.md" > "$DIR/SPACE_WORKER_GUIDE.md"

# --- Templates (expand ~ to absolute path) ---
echo "Copying templates..."
sed "s|~/.superbot2|$DIR|g" "$REPO_DIR/templates/space-worker-prompt.md" > "$DIR/templates/space-worker-prompt.md"
sed "s|~/.superbot2|$DIR|g" "$REPO_DIR/templates/orchestrator-system-prompt-override.md" > "$DIR/templates/orchestrator-system-prompt-override.md"

# --- Identity files (don't overwrite existing) ---
echo "Creating identity files (if missing)..."

if [[ ! -f "$DIR/IDENTITY.md" ]]; then
  cat > "$DIR/IDENTITY.md" << 'EOF'
You are superbot2, a persistent AI assistant that manages software projects autonomously. You are proactive - you find work, not just execute it. You escalate decisions you can't make, and you keep working on what you can.
EOF
  echo "  Created IDENTITY.md"
else
  echo "  IDENTITY.md already exists, skipping"
fi

if [[ ! -f "$DIR/USER.md" ]]; then
  cat > "$DIR/USER.md" << 'EOF'
No user profile configured yet. Edit USER.md in your superbot2 home directory with your name, preferences, and communication style.
EOF
  echo "  Created USER.md"
else
  echo "  USER.md already exists, skipping"
fi

if [[ ! -f "$DIR/MEMORY.md" ]]; then
  cat > "$DIR/MEMORY.md" << 'EOF'
First boot. No memory yet.
EOF
  echo "  Created MEMORY.md"
else
  echo "  MEMORY.md already exists, skipping"
fi

# --- Knowledge files (don't overwrite existing) ---
echo "Creating knowledge files (if missing)..."

for file in conventions decisions preferences; do
  if [[ ! -f "$DIR/knowledge/$file.md" ]]; then
    if [[ -f "$REPO_DIR/seed/knowledge/$file.md" ]]; then
      cp "$REPO_DIR/seed/knowledge/$file.md" "$DIR/knowledge/$file.md"
    else
      echo "# ${file^}" > "$DIR/knowledge/$file.md"
      echo "" >> "$DIR/knowledge/$file.md"
      echo "No ${file} recorded yet." >> "$DIR/knowledge/$file.md"
    fi
    echo "  Created knowledge/$file.md"
  else
    echo "  knowledge/$file.md already exists, skipping"
  fi
done

# --- Default space (don't overwrite existing) ---
echo "Creating default space (if missing)..."

DEFAULT_SPACE="$DIR/spaces/general"
if [[ ! -d "$DEFAULT_SPACE" ]]; then
  mkdir -p "$DEFAULT_SPACE"/{knowledge,plans,app}

  cat > "$DEFAULT_SPACE/space.json" << 'EOF'
{
  "name": "General",
  "slug": "general",
  "status": "active"
}
EOF

  cat > "$DEFAULT_SPACE/OVERVIEW.md" << 'EOF'
# General

General-purpose space for miscellaneous projects and tasks.
EOF

  for file in conventions decisions patterns; do
    echo "# ${file^}" > "$DEFAULT_SPACE/knowledge/$file.md"
    echo "" >> "$DEFAULT_SPACE/knowledge/$file.md"
    echo "No ${file} recorded yet." >> "$DEFAULT_SPACE/knowledge/$file.md"
  done

  echo "  Created default space: general"
else
  echo "  Default space already exists, skipping"
fi

# --- Scripts ---
echo "Installing scripts..."
for script in create-space.sh create-project.sh create-task.sh create-escalation.sh heartbeat-cron.sh scheduler.sh lock-helper.sh; do
  cp "$REPO_DIR/scripts/$script" "$DIR/scripts/$script"
done
chmod +x "$DIR/scripts/"*.sh
echo "  Installed scaffold scripts"

# --- Hooks ---
echo "Installing hooks..."
cp "$REPO_DIR"/hooks/*.sh "$DIR/hooks/"
chmod +x "$DIR/hooks/"*.sh
echo "  Copied hook scripts to $DIR/hooks/"

# Wire hooks into .claude/settings.local.json
SETTINGS="$HOME/.claude/settings.json"

if [[ -f "$SETTINGS" ]]; then
  # Merge hooks into existing settings
  if command -v jq &> /dev/null; then
    HOOKS_JSON=$(cat "$REPO_DIR/hooks/hooks.json")
    # Replace hook command paths with absolute paths
    HOOKS_JSON=$(echo "$HOOKS_JSON" | sed "s|~/.superbot2|$DIR|g; s|\\\${HOME}|$HOME|g; s|~/|$HOME/|g")

    EXISTING=$(cat "$SETTINGS")
    MERGED=$(echo "$EXISTING" | jq --argjson hooks "$(echo "$HOOKS_JSON" | jq '.hooks')" --argjson mkts "$(echo "$HOOKS_JSON" | jq '.extraKnownMarketplaces // {}')" '.hooks = $hooks | .extraKnownMarketplaces = $mkts')
    echo "$MERGED" > "$SETTINGS"
    echo "  Merged hooks and marketplaces into $SETTINGS"
  else
    echo "  WARNING: jq not found. Manually add hooks from hooks/hooks.json to $SETTINGS"
  fi
else
  # Create settings file with hooks
  HOOKS_JSON=$(cat "$REPO_DIR/hooks/hooks.json")
  HOOKS_JSON=$(echo "$HOOKS_JSON" | sed "s|~/.superbot2|$DIR|g; s|\\\${HOME}|$HOME|g; s|~/|$HOME/|g")
  echo "$HOOKS_JSON" > "$SETTINGS"
  echo "  Created $SETTINGS with hooks"
fi

# --- Skills ---
echo "Installing skills..."
SKILLS_DIR="$HOME/.claude/skills"
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
    sed -i '' "s|~/.superbot2|$DIR|g" "$md_file"
  done
  echo "  Installed skill: $skill_name"
done

# --- Agents ---
echo "Installing agents..."
AGENTS_DIR="$HOME/.claude/agents"
mkdir -p "$AGENTS_DIR"

for agent_file in "$REPO_DIR"/agents/*.md; do
  [[ ! -f "$agent_file" ]] && continue
  agent_name=$(basename "$agent_file")
  cp "$agent_file" "$AGENTS_DIR/$agent_name"
  echo "  Installed agent: $agent_name"
done

# --- Dashboard ---
echo "Building dashboard..."

# Install dashboard server dependencies
if [[ -f "$REPO_DIR/dashboard/package.json" ]]; then
  echo "  Installing dashboard server dependencies..."
  (cd "$REPO_DIR/dashboard" && npm install --silent 2>&1)
fi

# Install dashboard UI dependencies and build
if [[ -f "$REPO_DIR/dashboard-ui/package.json" ]]; then
  echo "  Installing dashboard UI dependencies..."
  (cd "$REPO_DIR/dashboard-ui" && npm install --silent 2>&1)
  echo "  Building dashboard UI..."
  (cd "$REPO_DIR/dashboard-ui" && npm run build 2>&1)
  echo "  Dashboard built to dashboard-ui/dist/"
fi

# --- Scheduler ---
echo "Installing scheduler..."
bash "$REPO_DIR/scripts/install-scheduler.sh"

# --- Shell alias ---
echo "Setting up shell alias..."

SHELL_PROFILE=""
if [[ -n "${ZSH_VERSION:-}" ]] || [[ "${SHELL:-}" == */zsh ]]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [[ -n "${BASH_VERSION:-}" ]] || [[ "${SHELL:-}" == */bash ]]; then
  SHELL_PROFILE="$HOME/.bashrc"
fi

if [[ -n "$SHELL_PROFILE" ]]; then
  # Agent Teams env var
  if ! grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$SHELL_PROFILE" 2>/dev/null; then
    echo "" >> "$SHELL_PROFILE"
    echo "# Superbot2: Enable Claude Code Agent Teams" >> "$SHELL_PROFILE"
    echo "export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1" >> "$SHELL_PROFILE"
    echo "  Added CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to $SHELL_PROFILE"
  else
    echo "  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS already set in $SHELL_PROFILE"
  fi

  # Superbot2 alias
  if ! grep -q "alias superbot2=" "$SHELL_PROFILE" 2>/dev/null; then
    echo "" >> "$SHELL_PROFILE"
    echo "# Superbot2" >> "$SHELL_PROFILE"
    echo "alias superbot2=\"$REPO_DIR/superbot2\"" >> "$SHELL_PROFILE"
    echo "  Added superbot2 alias to $SHELL_PROFILE"
  else
    echo "  superbot2 alias already exists in $SHELL_PROFILE"
  fi
else
  echo "  Warning: Could not detect shell profile. Manually add:"
  echo "    export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
  echo "    alias superbot2=\"$REPO_DIR/superbot2\""
fi

# Export for this session
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# --- Done ---
echo ""
echo "Setup complete!"
echo ""
echo "  Runtime directory: $DIR"
echo "  App directory:     $REPO_DIR"
echo ""
echo "Next steps:"
echo "  1. Edit $DIR/USER.md with your preferences"
echo "  2. Edit $DIR/IDENTITY.md to customize the bot personality"
echo "  3. Restart your terminal (to pick up the alias), then run: superbot2"
