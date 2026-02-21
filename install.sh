#!/bin/bash
set -e

# Superbot2 installer
# Usage: curl -fsSL https://raw.githubusercontent.com/gkkirsch/superbot2/main/install.sh | bash

SUPERBOT2_NAME="${SUPERBOT2_NAME:-superbot2}"
INSTALL_DIR="${SUPERBOT2_APP_DIR:-$HOME/.${SUPERBOT2_NAME}-app}"
SUPERBOT2_HOME="${SUPERBOT2_HOME:-$HOME/.$SUPERBOT2_NAME}"

echo ""
echo "  ╔═══════════════════════════════╗"
echo "  ║      Installing Superbot2     ║"
echo "  ╚═══════════════════════════════╝"
echo ""

# --- Check prerequisites ---

missing=()

if ! command -v git &>/dev/null; then
  missing+=("git")
fi

if ! command -v node &>/dev/null; then
  missing+=("node")
fi

if ! command -v jq &>/dev/null; then
  missing+=("jq")
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing required tools: ${missing[*]}"
  echo ""
  echo "Install them first:"
  for tool in "${missing[@]}"; do
    case "$tool" in
      git)  echo "  git  — https://git-scm.com" ;;
      node) echo "  node — https://nodejs.org (v18+)" ;;
      jq)   echo "  jq   — brew install jq / apt install jq" ;;
    esac
  done
  exit 1
fi

# --- Check for Claude Code ---

if ! command -v claude &>/dev/null; then
  # Check common install locations not yet in PATH
  for candidate in "$HOME/.claude/local/bin/claude" "$HOME/.local/bin/claude" "/usr/local/bin/claude"; do
    if [[ -x "$candidate" ]]; then
      export PATH="$(dirname "$candidate"):$PATH"
      break
    fi
  done
fi

if ! command -v claude &>/dev/null; then
  if [[ -t 0 ]]; then
    # Interactive mode — ask the user
    echo "Claude Code is not installed."
    echo ""
    read -p "Would you like to install it now? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Superbot2 requires Claude Code. Install it manually:"
      echo "  curl -fsSL https://claude.ai/install.sh | bash"
      exit 1
    fi
  else
    # Pipe mode (curl | bash) — auto-install
    echo "Claude Code is not installed. Installing automatically..."
  fi

  echo "Installing Claude Code..."
  curl -fsSL https://claude.ai/install.sh | bash
  echo ""

  for candidate in "$HOME/.claude/local/bin/claude" "$HOME/.local/bin/claude" "/usr/local/bin/claude"; do
    if [[ -x "$candidate" ]]; then
      export PATH="$(dirname "$candidate"):$PATH"
      break
    fi
  done

  if ! command -v claude &>/dev/null; then
    echo "Installation finished but 'claude' command not found in current shell."
    echo "You may need to restart your terminal, then re-run this script."
    exit 1
  fi
  echo "Claude Code installed successfully."
  echo ""
fi

# --- Backup helper ---

backup_if_exists() {
  local target="$1"
  if [[ -e "$target" ]]; then
    local backup="${target}.backup.$(date +%Y%m%d-%H%M%S)"
    echo "  Backing up $target → $backup"
    cp -a "$target" "$backup"
  fi
}

# --- Clone or update (skip if SUPERBOT2_LOCAL points to a local repo) ---

if [[ -n "${SUPERBOT2_LOCAL:-}" ]]; then
  if [[ ! -d "$SUPERBOT2_LOCAL/scripts" ]]; then
    echo "SUPERBOT2_LOCAL=$SUPERBOT2_LOCAL does not look like a superbot2 repo."
    exit 1
  fi
  INSTALL_DIR="$SUPERBOT2_LOCAL"
  echo "Using local repo at $INSTALL_DIR (SUPERBOT2_LOCAL mode, skipping clone)"
elif [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "Updating existing installation at $INSTALL_DIR..."
  backup_if_exists "$INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  if [[ -d "$INSTALL_DIR" ]]; then
    echo "Directory $INSTALL_DIR exists but is not a git repo."
    echo "Backing up before proceeding..."
    backup_if_exists "$INSTALL_DIR"
    rm -rf "$INSTALL_DIR"
  fi
  echo "Cloning superbot2 to $INSTALL_DIR..."
  git clone https://github.com/gkkirsch/superbot2.git "$INSTALL_DIR"
fi

# --- Run setup ---

echo ""
echo "Running setup..."
echo ""
SUPERBOT2_NAME="$SUPERBOT2_NAME" SUPERBOT2_HOME="$SUPERBOT2_HOME" bash "$INSTALL_DIR/scripts/setup.sh"

# --- Launch dashboard ---

echo ""
echo "Starting dashboard..."

# Kill any existing dashboard on port 3274
lsof -ti:3274 2>/dev/null | xargs kill 2>/dev/null || true

SUPERBOT2_HOME="$SUPERBOT2_HOME" node "$INSTALL_DIR/dashboard/server.js" &
DASHBOARD_PID=$!

# Give server a moment to start
sleep 2

# Open in browser (macOS)
if command -v open &>/dev/null; then
  open "http://localhost:3274"
elif command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:3274"
fi

# --- Done ---

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║        $SUPERBOT2_NAME installed!           ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""
echo "  Dashboard:  http://localhost:3274  (running now)"
echo "  Data:       $SUPERBOT2_HOME"
echo "  Code:       $INSTALL_DIR"
echo ""
echo "  Next steps:"
echo "    1. Restart your terminal (to pick up the $SUPERBOT2_NAME alias)"
echo "    2. Run: $SUPERBOT2_NAME"
echo ""
echo "  The dashboard is running in the background (PID $DASHBOARD_PID)."
echo "  It will stop when you close this terminal."
echo "  Run '$SUPERBOT2_NAME' to start the full system (orchestrator + dashboard)."
echo ""
