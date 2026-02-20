#!/bin/bash
set -e

# Superbot2 installer
# Usage: curl -fsSL https://raw.githubusercontent.com/gkkirsch/superbot2/main/install.sh | bash

INSTALL_DIR="${SUPERBOT2_APP_DIR:-$HOME/.superbot2-app}"

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
  echo "Claude Code is not installed."
  echo ""
  read -p "Would you like to install it now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
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
  else
    echo "Superbot2 requires Claude Code. Install it manually:"
    echo "  curl -fsSL https://claude.ai/install.sh | bash"
    exit 1
  fi
  echo ""
fi

# --- Clone or update ---

if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "Updating existing installation at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  if [[ -d "$INSTALL_DIR" ]]; then
    echo "Directory $INSTALL_DIR exists but is not a git repo."
    echo "Remove it first or set SUPERBOT2_APP_DIR to a different path."
    exit 1
  fi
  echo "Cloning superbot2 to $INSTALL_DIR..."
  git clone https://github.com/gkkirsch/superbot2.git "$INSTALL_DIR"
fi

# --- Run setup ---

echo ""
echo "Running setup..."
echo ""
SUPERBOT2_HOME="${SUPERBOT2_HOME:-$HOME/.superbot2}" bash "$INSTALL_DIR/scripts/setup.sh"
