# Agent-Browser: Connecting to User's Chrome Profile

## The Working Recipe

Connect to the user's authenticated Chrome session via CDP (Chrome DevTools Protocol) on port 9222.

### Prerequisites
- Chrome running with `--remote-debugging-port=9222`
- Launch: `open -a "Google Chrome" --args --remote-debugging-port=9222`
- Profile path on macOS: `~/Library/Application Support/Google/Chrome/Default/`

### Step-by-step

```bash
# 1. Verify Chrome is listening
lsof -i :9222

# 2. Create a new tab via CDP HTTP API (MUST use PUT, not GET)
curl -s -X PUT "http://localhost:9222/json/new?https://YOUR_TARGET_URL"

# 3. Wait for page load
sleep 3

# 4. Use agent-browser with --cdp flag on EVERY command
npx agent-browser --cdp 9222 snapshot -i
npx agent-browser --cdp 9222 click @e5
npx agent-browser --cdp 9222 fill @e3 "text"
npx agent-browser --cdp 9222 screenshot /tmp/screenshot.png

# 5. Close tab when done (only if not the last tab)
# curl -s -X PUT "http://localhost:9222/json/close/TAB_ID"
```

## Key Gotchas

1. **No page targets by default** — Chrome CDP only lists extension service workers, not page tabs. Must create a tab via `curl -X PUT "http://localhost:9222/json/new?URL"` first.
2. **PUT not GET** — `/json/new` endpoint rejects GET requests.
3. **`--user-data-dir` doesn't work** — Playwright can't share Chrome's locked profile directory. Use CDP connection instead.
4. **`--auto-connect` and `connect` fail** — Because no page targets exist until you create one.
5. **Every command needs `--cdp 9222`** — Unlike normal agent-browser daemon mode.
6. **Snapshot refs invalidate on DOM changes** — Re-snapshot after every navigation or dialog.
7. **`networkidle` timeouts on heavy SPAs** — Use `wait 3000` instead of `wait --load networkidle` for Google Cloud Console and similar.
8. **Don't close the last tab** — `tab close` fails if it's the last one in the user's Chrome.

## Reusable Template

```bash
#!/bin/bash
CDP_PORT=9222
TARGET_URL="https://example.com"

if ! lsof -i :$CDP_PORT > /dev/null 2>&1; then
  echo "ERROR: Chrome not listening on port $CDP_PORT"
  echo "Launch Chrome with: open -a 'Google Chrome' --args --remote-debugging-port=$CDP_PORT"
  exit 1
fi

TAB_INFO=$(curl -s -X PUT "http://localhost:$CDP_PORT/json/new?$TARGET_URL")
TAB_ID=$(echo "$TAB_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
sleep 3

npx agent-browser --cdp $CDP_PORT snapshot -i
# ... interact ...
```

## Multi-Chrome Instances (for concurrent workers)

Multiple workers can each get their own Chrome instance to avoid conflicts. Port 9222 is the user's main Chrome; workers use ports 9223–9299.

### Scripts

```bash
# Launch a worker Chrome instance (headless, fresh profile)
~/.superbot2/scripts/launch-chrome-instance.sh 9223

# List all active instances
~/.superbot2/scripts/list-chrome-instances.sh        # table format
~/.superbot2/scripts/list-chrome-instances.sh --json  # JSON format

# Stop and clean up
~/.superbot2/scripts/stop-chrome-instance.sh 9223
```

### Worker Usage

Workers receive their CDP port via the `CDP_PORT` env var (set by orchestrator):

```bash
# Worker browser commands — use $CDP_PORT instead of hardcoded 9222
curl -s -X PUT "http://localhost:$CDP_PORT/json/new?$URL"
npx agent-browser --cdp $CDP_PORT snapshot -i
```

### Port Allocation

| Port | Purpose |
|------|---------|
| 9222 | User's main Chrome (all logins, cookies, extensions) — never managed by scripts |
| 9223+ | Worker instances (ephemeral, headless, clean profiles) |

The orchestrator assigns ports sequentially starting at 9223. Worker instances are headless (`--headless=new`) with temp `user-data-dir` at `/tmp/superbot2-chrome-<port>/`. If a worker needs to log into a service, it does Google OAuth fresh.

### Key Differences from Main Chrome

- Worker instances have **no saved logins** — they start with a clean profile
- Worker instances run **headless** — no visible browser window
- Worker instances are **ephemeral** — stopped and cleaned up when the worker finishes
- Scripts **refuse to touch port 9222** — the user's main Chrome is protected

## Source

Discovered during kidsvids/agent-chat YouTube API key setup (2026-02-21). Full details with GCP Console navigation in `spaces/kidsvids/knowledge/agent-browser-chrome-profile.md`.
