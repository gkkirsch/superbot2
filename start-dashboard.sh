#!/bin/bash
# Start the superbot2 dashboard
# Usage: ./start-dashboard.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$DIR/dashboard"

if [ ! -d "$DASHBOARD_DIR" ]; then
  echo "Dashboard not found at $DASHBOARD_DIR"
  exit 1
fi

echo "Starting dashboard..."
cd "$DASHBOARD_DIR" && npm run dev
