#!/bin/bash
# superbot2 setup - Initialize SUPERBOT2_HOME and install hooks/skills/agents
set -euo pipefail

SUPERBOT2_NAME="${SUPERBOT2_NAME:-superbot2}"
DIR="${SUPERBOT2_HOME:-$HOME/.$SUPERBOT2_NAME}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Setting up $SUPERBOT2_NAME..."

# --- Backup helper ---

backup_if_exists() {
  local target="$1"
  if [[ -e "$target" ]]; then
    local backup="${target}.backup.$(date +%Y%m%d-%H%M%S)"
    echo "  Backing up $target → $backup"
    cp -a "$target" "$backup"
  fi
}

# --- Directory structure ---
echo "Creating directory structure..."
backup_if_exists "$DIR"
mkdir -p "$DIR"/{knowledge,escalations/{untriaged,needs_human,resolved},daily,spaces,templates,skills,scripts}
CLAUDE_DIR="$DIR/.claude"
mkdir -p "$CLAUDE_DIR"
TEAM_DIR="$CLAUDE_DIR/teams/$SUPERBOT2_NAME"
TASK_DIR="$CLAUDE_DIR/tasks/$SUPERBOT2_NAME"
backup_if_exists "$TEAM_DIR"
mkdir -p "$TEAM_DIR/inboxes"
mkdir -p "$TASK_DIR"
touch "$TASK_DIR/.lock"
echo "1" > "$TASK_DIR/.highwatermark"

# Initialize team config if missing
if [[ ! -f "$TEAM_DIR/config.json" ]]; then
  LEAD_SESSION=$(uuidgen | tr '[:upper:]' '[:lower:]')
  NOW_MS=$(date +%s)000
  cat > "$TEAM_DIR/config.json" << EOF
{
  "name": "$SUPERBOT2_NAME",
  "description": "$SUPERBOT2_NAME — team-lead orchestrates space workers and heartbeat",
  "createdAt": $NOW_MS,
  "leadAgentId": "team-lead@$SUPERBOT2_NAME",
  "leadSessionId": "$LEAD_SESSION",
  "members": [
    {
      "agentId": "team-lead@$SUPERBOT2_NAME",
      "name": "team-lead",
      "agentType": "team-lead",
      "joinedAt": $NOW_MS,
      "cwd": "$HOME/dev",
      "subscriptions": []
    },
    {
      "agentId": "heartbeat@$SUPERBOT2_NAME",
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
for inbox in team-lead heartbeat dashboard-user; do
  if [[ ! -f "$TEAM_DIR/inboxes/$inbox.json" ]]; then
    echo '[]' > "$TEAM_DIR/inboxes/$inbox.json"
    echo "  Initialized $inbox inbox"
  fi
done

# --- Auth: copy credentials into isolated CLAUDE_DIR ---
echo "Setting up auth credentials..."

# Copy .claude.json for config/preferences
if [[ -f "$HOME/.claude.json" ]]; then
  cp "$HOME/.claude.json" "$CLAUDE_DIR/.claude.json"
  echo "  Copied .claude.json"
else
  echo "  No ~/.claude.json found, skipping"
fi

# Compute hash of the config dir for keychain service name and copy credential
if command -v security &>/dev/null; then
  CONFIG_HASH=$(echo -n "$CLAUDE_DIR" | shasum -a 256 | cut -c1-8)
  NEW_SERVICE="Claude Code-credentials-${CONFIG_HASH}"

  CRED=$(security find-generic-password -s "Claude Code-credentials" -a "$USER" -w 2>/dev/null || true)
  if [[ -n "$CRED" ]]; then
    security add-generic-password -s "$NEW_SERVICE" -a "$USER" -w "$CRED" -U 2>/dev/null || true
    echo "  Copied keychain credential to $NEW_SERVICE"
  else
    echo "  No existing Claude Code keychain credential found, skipping"
  fi
else
  echo "  Not on macOS (no security command), skipping keychain setup"
fi

# --- Templates (expand ~ to absolute path) ---
echo "Copying templates..."
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
# User Profile

## Who I Am

**Name**: (your name)
**Projects**: (what you're building)

## Working Style

(How you like to work — decisive, methodical, etc.)

## Technical Preferences

(Languages, frameworks, hosting platforms, etc.)

## Escalation Preferences

(What you want escalated vs. auto-resolved)

## Communication Style

(How you prefer updates and messages)
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

# --- Knowledge directory (free-form, orchestrator manages files) ---
echo "Creating knowledge directory (if missing)..."
mkdir -p "$DIR/knowledge"
echo "  knowledge/ ready"

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
    title=$(echo "$file" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')
    echo "# $title" > "$DEFAULT_SPACE/knowledge/$file.md"
    echo "" >> "$DEFAULT_SPACE/knowledge/$file.md"
    echo "No ${file} recorded yet." >> "$DEFAULT_SPACE/knowledge/$file.md"
  done

  echo "  Created default space: general"
else
  echo "  Default space already exists, skipping"
fi

# --- Scripts ---
echo "Installing scripts..."
for script in create-space.sh create-project.sh create-task.sh update-task.sh create-escalation.sh resolve-escalation.sh promote-escalation.sh consume-escalation.sh write-session.sh portfolio-status.sh heartbeat-cron.sh scheduler.sh lock-helper.sh update.sh restart-dashboard.sh; do
  cp "$REPO_DIR/scripts/$script" "$DIR/scripts/$script"
done
chmod +x "$DIR/scripts/"*.sh
echo "  Installed scaffold scripts"

# --- Settings ---
SETTINGS="$CLAUDE_DIR/settings.json"
GLOBAL_SETTINGS="$HOME/.claude/settings.json"

if command -v jq &> /dev/null; then
  BASE='{}'

  # Merge in existing user prefs (preserve enabledPlugins, skipDangerousModePermissionPrompt, etc.)
  backup_if_exists "$SETTINGS"
  if [[ -f "$SETTINGS" ]]; then
    EXISTING=$(cat "$SETTINGS" | jq 'del(.hooks)')
    BASE=$(echo "$BASE" | jq --argjson existing "$EXISTING" '. + $existing')
  fi

  # Seed enabledPlugins + skipDangerousModePermissionPrompt from global settings
  if [[ -f "$GLOBAL_SETTINGS" ]]; then
    BASE=$(echo "$BASE" | jq --argjson global "$(cat "$GLOBAL_SETTINGS")" '
      .enabledPlugins = ($global.enabledPlugins // .enabledPlugins // {}) |
      .skipDangerousModePermissionPrompt = ($global.skipDangerousModePermissionPrompt // .skipDangerousModePermissionPrompt // false)')
    echo "  Seeded enabledPlugins + skipDangerousModePermissionPrompt from global"
  fi

  echo "$BASE" > "$SETTINGS"
  echo "  Wrote $SETTINGS (user prefs)"
else
  echo "  WARNING: jq not found. Manually configure $SETTINGS"
fi

# --- Skills ---
echo "Installing skills..."
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
  echo "  Installed skill: $skill_name"
done

# --- Agents ---
echo "Installing agents..."
AGENTS_DIR="$CLAUDE_DIR/agents"
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
  if ! (cd "$REPO_DIR/dashboard" && npm install --silent); then
    echo "  ERROR: Failed to install dashboard server dependencies"
    echo "  Try running manually: cd $REPO_DIR/dashboard && npm install"
  fi
fi

# Install dashboard UI dependencies and build
if [[ -f "$REPO_DIR/dashboard-ui/package.json" ]]; then
  echo "  Installing dashboard UI dependencies..."
  if ! (cd "$REPO_DIR/dashboard-ui" && npm install --silent); then
    echo "  ERROR: Failed to install dashboard UI dependencies"
    echo "  Try running manually: cd $REPO_DIR/dashboard-ui && npm install"
  else
    echo "  Building dashboard UI..."
    if ! (cd "$REPO_DIR/dashboard-ui" && npm run build); then
      echo "  ERROR: Failed to build dashboard UI"
      echo "  Try running manually: cd $REPO_DIR/dashboard-ui && npm run build"
    else
      echo "  Dashboard built to dashboard-ui/dist/"
    fi
  fi
fi

# --- Start dashboard server ---
echo "Starting dashboard server..."
bash "$REPO_DIR/scripts/restart-dashboard.sh"
echo "  Dashboard running at http://localhost:3274"

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
  if ! grep -q "alias $SUPERBOT2_NAME=" "$SHELL_PROFILE" 2>/dev/null; then
    echo "" >> "$SHELL_PROFILE"
    echo "# $SUPERBOT2_NAME" >> "$SHELL_PROFILE"
    echo "alias $SUPERBOT2_NAME=\"SUPERBOT2_NAME=$SUPERBOT2_NAME SUPERBOT2_HOME=$DIR $REPO_DIR/superbot2\"" >> "$SHELL_PROFILE"
    echo "  Added $SUPERBOT2_NAME alias to $SHELL_PROFILE"
  else
    echo "  $SUPERBOT2_NAME alias already exists in $SHELL_PROFILE"
  fi
else
  echo "  Warning: Could not detect shell profile. Manually add:"
  echo "    export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
  echo "    alias $SUPERBOT2_NAME=\"$REPO_DIR/superbot2\""
fi

# Export for this session
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# --- Done ---
echo ""
echo "Setup complete!"
echo ""
echo "  Runtime directory: $DIR"
echo "  App directory:     $REPO_DIR"
echo "  Team name:         $SUPERBOT2_NAME"
echo ""
echo "Next steps:"
echo "  1. Edit $DIR/USER.md with your preferences"
echo "  2. Edit $DIR/IDENTITY.md to customize the bot personality"
echo "  3. Restart your terminal (to pick up the alias), then run: $SUPERBOT2_NAME"
