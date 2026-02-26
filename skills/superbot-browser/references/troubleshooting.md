# Troubleshooting

## "No page found. Make sure the app has loaded content."

**Symptom**: Any agent-browser command fails with this error.

**Cause**: Chrome's CDP endpoint only exposes extension service workers by default — no page targets exist. Agent-browser requires at least one page target.

**Fix**: Create a tab first via the CDP HTTP API:
```bash
curl -s -X PUT "http://localhost:9222/json/new?https://example.com"
sleep 3
npx agent-browser --cdp 9222 snapshot -i
```

**Diagnostic**: Check what targets exist:
```bash
curl -s http://localhost:9222/json/list | python3 -c "import json,sys; [print(f'{t[\"type\"]}: {t[\"title\"][:80]}') for t in json.load(sys.stdin)]"
```

If you only see `service_worker` entries and no `page` entries, you need to create a tab.

---

## "Using unsafe HTTP verb GET to invoke /json/new"

**Symptom**: `curl "http://localhost:9222/json/new?URL"` returns this error.

**Cause**: The `/json/new` endpoint requires the PUT HTTP method.

**Fix**: Add `-X PUT`:
```bash
curl -s -X PUT "http://localhost:9222/json/new?https://example.com"
```

---

## Chrome not listening on port 9222

**Symptom**: `lsof -i :9222` returns nothing. Commands fail to connect.

**Cause**: Chrome was not launched with `--remote-debugging-port=9222`.

**Fix**: Launch the superbot2 Chrome profile (it includes `--remote-debugging-port=9222`):
```bash
# Launch superbot2 profile with CDP
bash ~/.superbot2/scripts/open-superbot-chrome.sh
sleep 3

# Verify
lsof -i :9222
```

**Note**: The superbot2 profile automatically enables CDP on port 9222. If the user has Chrome running without CDP, they don't need to quit it — the superbot2 profile opens alongside it.

---

## "Element @eN is blocked by another element (likely a modal or overlay)"

**Symptom**: `click @eN` fails because a notification toast, cookie banner, or modal is covering the target element.

**Cause**: An overlay element sits on top of the element you're trying to click.

**Fix (option 1)**: Dismiss the overlay:
```bash
npx agent-browser --cdp 9222 snapshot -i
# Find the dismiss/close button in the snapshot
npx agent-browser --cdp 9222 click @e30  # Close/Dismiss button
npx agent-browser --cdp 9222 wait 1000
npx agent-browser --cdp 9222 snapshot -i  # Must re-snapshot — refs are stale
```

**Fix (option 2)**: Navigate directly via URL to bypass the overlay:
```bash
npx agent-browser --cdp 9222 open "https://app.example.com/target-page"
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i
```

---

## Stale refs after navigation

**Symptom**: `click @e5` interacts with the wrong element or fails after a previous click caused navigation.

**Cause**: Element refs (`@e1`, `@e2`, etc.) are tied to the DOM state at the time of the snapshot. Any navigation, modal opening, or dynamic content loading invalidates all refs.

**Fix**: Always re-snapshot after any action that changes the page:
```bash
npx agent-browser --cdp 9222 click @e5       # This navigates
npx agent-browser --cdp 9222 wait 3000
npx agent-browser --cdp 9222 snapshot -i      # Get fresh refs
npx agent-browser --cdp 9222 click @e1        # Use new refs
```

**Rule of thumb**: If in doubt, snapshot again.

---

## `wait --load networkidle` times out

**Symptom**: Timeout error when waiting for network idle on heavy SPAs like Google Cloud Console.

**Cause**: SPAs make continuous background requests (analytics, polling, WebSocket heartbeats). The network never truly goes "idle."

**Fix**: Use a fixed duration wait instead:
```bash
# Instead of this (times out on GCP, Gmail, etc.)
npx agent-browser --cdp 9222 wait --load networkidle

# Use this
npx agent-browser --cdp 9222 wait 3000   # 3 seconds for most pages
npx agent-browser --cdp 9222 wait 5000   # 5 seconds for heavy pages (GCP project creation, API enabling)
```

---

## tab close fails — "Cannot close the last tab"

**Symptom**: `tab close` errors because it's the last tab.

**Cause**: Chrome doesn't allow closing the last tab via CDP.

**Fix**: Don't close the last tab. Leave it open or let the user close it manually. If you created a tab via `curl -X PUT`, you can close it by ID only if other tabs exist:
```bash
# Close by tab ID (only if not the last tab)
curl -s -X PUT "http://localhost:9222/json/close/TAB_ID"
```

---

## Agent-browser launches a separate browser

**Symptom**: A new browser window opens instead of connecting to the superbot2 Chrome profile. The cookies and sessions are not available.

**Cause**: You forgot the `--cdp 9222` flag. Without it, agent-browser launches its own Playwright-managed browser.

**Fix**: Add `--cdp 9222` to every command:
```bash
# Wrong — launches separate browser
npx agent-browser snapshot -i

# Correct — connects to superbot2 Chrome profile
npx agent-browser --cdp 9222 snapshot -i
```

---

## Port 9222 shows "teamcoherence" in lsof

**Symptom**: `lsof -i :9222` shows the service name as "teamcoherence" instead of something Chrome-related.

**Cause**: Port 9222 is registered as "teamcoherence" in the IANA service name registry. This is normal — it's still Chrome's remote debugging port.

**Not a problem**: This is expected. The connection will work fine.

---

## Connection refused / timeout

**Symptom**: `curl http://localhost:9222/json/list` fails with connection refused.

**Possible causes**:
1. Chrome is not running
2. Chrome was launched without `--remote-debugging-port=9222`
3. Another process is using port 9222

**Diagnostic**:
```bash
# Check what's on port 9222
lsof -i :9222

# Check if Chrome is running at all
pgrep -l "Google Chrome"

# Check Chrome's launch arguments
ps aux | grep "Google Chrome" | grep remote-debugging
```

---

## npx agent-browser hangs or is slow

**Symptom**: Commands take a long time or hang indefinitely.

**Possible causes**:
1. npx downloading agent-browser for the first time
2. Page is still loading
3. Chrome is unresponsive

**Fix**:
```bash
# First run: npx downloads the package — this is normal, wait for it
# Subsequent runs should be fast

# If hanging, try with a timeout
timeout 30 npx agent-browser --cdp 9222 snapshot -i

# Check if Chrome is responsive
curl -s http://localhost:9222/json/version
```
