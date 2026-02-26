---
name: superbot-browser
description: >
  Browser automation via CDP (Chrome DevTools Protocol).
  Connects to the superbot2 Chrome profile on port 9222, or auto-launches it as fallback.
  Use when you need to automate web interactions — navigate sites, fill forms, click buttons,
  take screenshots, extract data, or interact with authenticated sessions.
  Triggers: "automate browser", "use my Chrome", "navigate to", "fill out form on", "click button on",
  "extract data from website", "take screenshot of page", "use CDP", "connect to Chrome", "browser".
  NOT for: Playwright direct mode, headless scraping without auth.
---

# Browser Automation via CDP (Chrome DevTools Protocol)

Superbot2 connects to Chrome via CDP on port 9222 using the **superbot2 Chrome profile**. This is a dedicated Chrome profile with its own logins, cookies, and sessions for automation.

The superbot2 profile is set up via `~/.superbot2/scripts/setup-superbot-chrome.sh` and opened via `~/.superbot2/scripts/open-superbot-chrome.sh` (which launches Chrome with `--remote-debugging-port=9222`).

## Prerequisites

**Always check port 9222 first.** Only launch the superbot2 profile if nothing is already listening.

```bash
# Check if Chrome is already listening on CDP port
if lsof -i :9222 > /dev/null 2>&1; then
  echo "Using existing Chrome on port 9222"
else
  # No Chrome on 9222 — launch superbot2 profile with CDP
  echo "Launching superbot2 Chrome profile..."
  open -a "Google Chrome" --args \
    --profile-directory="superbot2" \
    --remote-debugging-port=9222 \
    --disable-infobars &
  sleep 3
fi

# Verify it's running
curl -s http://localhost:9222/json/version | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Chrome {d[\"Browser\"]}')"
```

**Key points:**
- The superbot2 Chrome profile has its own authenticated sessions (Facebook, Instagram, etc.)
- If Chrome is already on port 9222, connect to it directly
- If not, the superbot2 profile launches automatically with CDP enabled
- The profile persists logins, cookies, and sessions across restarts

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
# 1. Ensure Chrome is available on CDP port (use existing or launch superbot2 profile)
if ! lsof -i :9222 > /dev/null 2>&1; then
  open -a "Google Chrome" --args \
    --profile-directory="superbot2" \
    --remote-debugging-port=9222 \
    --disable-infobars &
  sleep 3
fi

# 2. Create a new tab (MUST use PUT, not GET)
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

# Capture — save to ~/.superbot2/uploads/ so images render in dashboard, Telegram, and iMessage
npx agent-browser --cdp 9222 screenshot ~/.superbot2/uploads/shot.png  # Screenshot to uploads (recommended)
npx agent-browser --cdp 9222 screenshot /tmp/shot.png                  # Screenshot to temp dir
npx agent-browser --cdp 9222 screenshot --full                         # Full page screenshot

# Tab management
npx agent-browser --cdp 9222 tab close                # Close current tab
```

## Gotchas

### 1. No page targets by default
Chrome's CDP endpoint only lists extension service workers, not page tabs. You MUST create a tab via `curl -X PUT "http://localhost:9222/json/new?URL"` before using agent-browser.

### 2. PUT not GET for /json/new
The `/json/new` endpoint rejects GET requests. Always use `-X PUT`.

### 3. Superbot2 Chrome profile
The skill expects the superbot2 Chrome profile to be running on port 9222. If nothing is on port 9222, it auto-launches the superbot2 profile with CDP enabled. The superbot2 profile has its own logins, cookies, and sessions for automation.

### 4. `--auto-connect` and `connect` fail
These fail because no page targets exist until you create one via the HTTP API.

### 5. Snapshot refs invalidate on DOM changes
After clicking a button that navigates, opens a modal, or loads new content, all `@eN` refs become stale. Always re-snapshot after any significant DOM change.

### 6. `wait --load networkidle` times out on heavy SPAs
Google Cloud Console and similar SPAs have continuous background requests. Use `wait 3000` or `wait 5000` instead of `wait --load networkidle`.

### 7. Don't close the last tab
`tab close` fails if it's the last tab in Chrome. Leave it open or let the user close it.

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

## Social Media Automation — Use Playwright CDP

For social media automation (Facebook, Instagram, X), use **Playwright via CDP** instead of agent-browser. Playwright creates an isolated page per operation, making it immune to shared Chrome tab conflicts.

```javascript
const { chromium } = require('playwright');

async function withPage(fn) {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage(); // fresh isolated tab every time
  try {
    return await fn(page);
  } finally {
    await page.close(); // always clean up
  }
}
```

- Each operation gets a fresh tab — zero conflict with other workers or user tabs
- Inherits the superbot2 profile's authenticated sessions (cookies/sessions from existing context)
- Install once: `npm install playwright` in the space's `app/` directory
- **One Chrome worker at a time** — never run multiple CDP workers concurrently, they override each other

See [references/social-media.md](references/social-media.md) for Facebook, Instagram, and X-specific tips.

## Deep-Dive Documentation

| Reference | When to Use |
|-----------|-------------|
| [references/commands.md](references/commands.md) | Full command reference (~20 commands for CDP mode) |
| [references/patterns.md](references/patterns.md) | Common automation patterns (login, forms, Google/GCP) |
| [references/troubleshooting.md](references/troubleshooting.md) | What to do when things go wrong |
| [references/social-media.md](references/social-media.md) | Facebook, Instagram, X selectors and automation tips |

## Ready-to-Use Templates

| Template | Description |
|----------|-------------|
| [templates/connect.sh](templates/connect.sh) | CDP connection boilerplate |
| [templates/google-oauth.sh](templates/google-oauth.sh) | Google OAuth login pattern |
