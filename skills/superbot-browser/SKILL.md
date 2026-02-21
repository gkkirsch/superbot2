---
name: superbot-browser
description: >
  Browser automation using the user's authenticated Chrome session via CDP (Chrome DevTools Protocol).
  Use when you need to interact with websites that require the user's login session — Google Cloud Console,
  Anthropic Console, GitHub, or any site where the user is already authenticated in Chrome.
  Triggers: "automate browser", "use my Chrome", "navigate to", "fill out form on", "click button on",
  "extract data from website", "take screenshot of page", "use CDP", "connect to Chrome".
  NOT for: launching a fresh browser, Playwright direct mode, headless scraping without auth.
---

# Browser Automation via CDP (Chrome DevTools Protocol)

Connect to the user's running Chrome browser and automate it with their existing cookies, sessions, and logins intact.

## Prerequisites

Chrome must be running with remote debugging enabled on port 9222.

```bash
# Check if Chrome is listening
lsof -i :9222

# If not listening, launch Chrome with debugging enabled
open -a "Google Chrome" --args --remote-debugging-port=9222
```

**Warning**: If Chrome is already running without the flag, you may need to quit and relaunch it. The `--remote-debugging-port` flag only takes effect at launch.

## Core Workflow

Every browser automation follows this pattern:

```
1. Verify CDP port  →  lsof -i :9222
2. Create tab       →  curl -X PUT "http://localhost:9222/json/new?URL"
3. Wait for load    →  sleep 3
4. Snapshot          →  npx agent-browser --cdp 9222 snapshot -i
5. Interact          →  npx agent-browser --cdp 9222 click/fill/select @ref
6. Re-snapshot       →  npx agent-browser --cdp 9222 snapshot -i
```

### Step-by-Step

```bash
# 1. Verify Chrome is listening on CDP port
if ! lsof -i :9222 > /dev/null 2>&1; then
  echo "Chrome not listening on port 9222."
  echo "Launch with: open -a 'Google Chrome' --args --remote-debugging-port=9222"
  exit 1
fi

# 2. Create a new tab in the user's Chrome (MUST use PUT, not GET)
TAB_INFO=$(curl -s -X PUT "http://localhost:9222/json/new?https://YOUR_TARGET_URL")
TAB_ID=$(echo "$TAB_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "Created tab: $TAB_ID"

# 3. Wait for page to load
sleep 3

# 4. Snapshot to get interactive element refs
npx agent-browser --cdp 9222 snapshot -i
# Output: @e1 [button] "Sign In", @e2 [input] "Email", @e3 [link] "Dashboard"

# 5. Interact using refs
npx agent-browser --cdp 9222 click @e3
npx agent-browser --cdp 9222 fill @e2 "user@example.com"

# 6. Re-snapshot after any navigation or DOM change
npx agent-browser --cdp 9222 snapshot -i
```

### The `--cdp 9222` Flag

**Every command needs `--cdp 9222`**. Unlike normal agent-browser where a daemon persists state, CDP mode connects directly to Chrome on each command. Never omit this flag.

```bash
# Correct
npx agent-browser --cdp 9222 snapshot -i
npx agent-browser --cdp 9222 click @e1

# Wrong — will launch a separate browser
npx agent-browser snapshot -i
npx agent-browser click @e1
```

## Essential Commands

```bash
# Navigation
npx agent-browser --cdp 9222 open <url>              # Navigate to URL

# Snapshot (always do this before interacting)
npx agent-browser --cdp 9222 snapshot -i              # Interactive elements with refs
npx agent-browser --cdp 9222 snapshot -i -C           # Include cursor-interactive elements

# Interaction (use @refs from snapshot)
npx agent-browser --cdp 9222 click @e1                # Click element
npx agent-browser --cdp 9222 fill @e2 "text"          # Clear field and type
npx agent-browser --cdp 9222 type @e2 "text"          # Type without clearing
npx agent-browser --cdp 9222 select @e1 "option"      # Select dropdown option
npx agent-browser --cdp 9222 check @e1                # Check checkbox
npx agent-browser --cdp 9222 press Enter              # Press key
npx agent-browser --cdp 9222 scroll down 500          # Scroll page

# Get information
npx agent-browser --cdp 9222 get text @e1             # Element text
npx agent-browser --cdp 9222 get value @e1            # Input value
npx agent-browser --cdp 9222 get url                  # Current URL
npx agent-browser --cdp 9222 get title                # Page title

# Wait
npx agent-browser --cdp 9222 wait @e1                 # Wait for element
npx agent-browser --cdp 9222 wait 3000                # Wait milliseconds
npx agent-browser --cdp 9222 wait --url "**/page"     # Wait for URL pattern

# Capture
npx agent-browser --cdp 9222 screenshot               # Screenshot to temp dir
npx agent-browser --cdp 9222 screenshot /tmp/shot.png  # Screenshot to path
npx agent-browser --cdp 9222 screenshot --full         # Full page screenshot

# Tab management
npx agent-browser --cdp 9222 tab close                # Close current tab
```

## Gotchas

### 1. No page targets by default
Chrome's CDP endpoint only lists extension service workers, not page tabs. You MUST create a tab via `curl -X PUT "http://localhost:9222/json/new?URL"` before using agent-browser.

### 2. PUT not GET for /json/new
The `/json/new` endpoint rejects GET requests. Always use `-X PUT`.

### 3. `--user-data-dir` does NOT work
Playwright can't share Chrome's locked profile directory. Don't try to point `--user-data-dir` at Chrome's profile. Use CDP instead.

### 4. `--auto-connect` and `connect` fail
These fail because no page targets exist until you create one via the HTTP API.

### 5. Snapshot refs invalidate on DOM changes
After clicking a button that navigates, opens a modal, or loads new content, all `@eN` refs become stale. Always re-snapshot after any significant DOM change.

### 6. `wait --load networkidle` times out on heavy SPAs
Google Cloud Console and similar SPAs have continuous background requests. Use `wait 3000` or `wait 5000` instead of `wait --load networkidle`.

### 7. Don't close the last tab
`tab close` fails if it's the last tab in the user's Chrome. Leave it open or let the user close it.

### 8. Overlays block clicks
Notification toasts, cookie banners, and modal overlays can block clicks on underlying elements. Dismiss them first, or navigate directly via URL as a workaround:
```bash
# If clicking "APIs & Services" is blocked by an overlay:
npx agent-browser --cdp 9222 open "https://console.cloud.google.com/apis/library?project=PROJECT_ID"
```

## Diagnostic Commands

```bash
# Check if Chrome is listening
lsof -i :9222

# List all CDP targets (page, service_worker, etc.)
curl -s http://localhost:9222/json/list | python3 -c "import json,sys; [print(f'{t[\"type\"]}: {t[\"title\"][:80]}') for t in json.load(sys.stdin)]"

# Check Chrome version
curl -s http://localhost:9222/json/version | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Chrome {d[\"Browser\"]}')"
```

## Deep-Dive Documentation

| Reference | When to Use |
|-----------|-------------|
| [references/commands.md](references/commands.md) | Full command reference (~20 commands for CDP mode) |
| [references/patterns.md](references/patterns.md) | Common automation patterns (login, forms, Google/GCP) |
| [references/troubleshooting.md](references/troubleshooting.md) | What to do when things go wrong |

## Ready-to-Use Templates

| Template | Description |
|----------|-------------|
| [templates/connect.sh](templates/connect.sh) | CDP connection boilerplate |
| [templates/google-oauth.sh](templates/google-oauth.sh) | Google OAuth login pattern |
