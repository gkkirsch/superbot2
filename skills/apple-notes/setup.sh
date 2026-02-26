#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Setting up apple-notes-cli (Node.js)..."

if ! command -v node &>/dev/null; then
    echo "Error: node not found"
    exit 1
fi

if ! command -v npm &>/dev/null; then
    echo "Error: npm not found"
    exit 1
fi

cd "$SCRIPT_DIR"
npm install

chmod +x "$SCRIPT_DIR/bin/notes-cli"

echo "Setup complete. Run: $SCRIPT_DIR/bin/notes-cli --help"
