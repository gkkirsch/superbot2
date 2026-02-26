# Troubleshooting

## Profile not persisting sessions

**Symptom**: You log in with `--headed`, but next time you run a command the sessions are gone.

**Cause**: The `AGENT_BROWSER_PROFILE` env var is not set, so agent-browser is using a temporary profile.

**Fix**: Ensure the env var is set in your shell:
```bash
echo 'export AGENT_BROWSER_PROFILE="$HOME/.superbot2/browser/profile"' >> ~/.zshrc
source ~/.zshrc

# Verify
echo $AGENT_BROWSER_PROFILE
```

Or pass `--profile` explicitly on every command:
```bash
agent-browser --profile ~/.superbot2/browser/profile open "https://example.com"
```

---

## Browser fails to launch

**Symptom**: Commands hang or error with "browser failed to launch" or similar.

**Possible causes**:
1. Chromium not installed (first run)
2. Profile directory corrupted
3. Another agent-browser process has the profile locked

**Fix (install Chromium)**:
```bash
agent-browser install
```

**Fix (corrupted profile)**: Reset the profile:
```bash
rm -rf ~/.superbot2/browser/profile
# Next command will create a fresh profile
agent-browser --headed open "https://accounts.google.com"
# Log in again — sessions will persist in the new profile
```

**Fix (locked profile)**: Check for running processes:
```bash
pgrep -f "chromium|chrome" | head -5
# Kill orphaned browser processes if needed
```

---

## Stale refs after navigation

**Symptom**: `click @e5` interacts with the wrong element or fails after a previous click caused navigation.

**Cause**: Element refs (`@e1`, `@e2`, etc.) are tied to the DOM state at the time of the snapshot. Any navigation, modal opening, or dynamic content loading invalidates all refs.

**Fix**: Always re-snapshot after any action that changes the page:
```bash
agent-browser click @e5       # This navigates
agent-browser wait 3000
agent-browser snapshot -i      # Get fresh refs
agent-browser click @e1        # Use new refs
```

**Rule of thumb**: If in doubt, snapshot again.

---

## "Element is blocked by another element"

**Symptom**: `click @eN` fails because a notification toast, cookie banner, or modal is covering the target element.

**Fix (option 1)**: Dismiss the overlay:
```bash
agent-browser snapshot -i
agent-browser click @e30  # Close/Dismiss button
agent-browser wait 1000
agent-browser snapshot -i  # Must re-snapshot — refs are stale
```

**Fix (option 2)**: Navigate directly via URL to bypass the overlay:
```bash
agent-browser open "https://app.example.com/target-page"
agent-browser wait 3000
agent-browser snapshot -i
```

---

## `wait --load networkidle` times out

**Symptom**: Timeout error when waiting for network idle on heavy SPAs like Google Cloud Console.

**Cause**: SPAs make continuous background requests (analytics, polling, WebSocket heartbeats). The network never truly goes "idle."

**Fix**: Use a fixed duration wait instead:
```bash
# Instead of this (times out on GCP, Gmail, Facebook, etc.)
agent-browser wait --load networkidle

# Use this
agent-browser wait 3000   # 3 seconds for most pages
agent-browser wait 5000   # 5 seconds for heavy pages
```

---

## tab close fails — "Cannot close the last tab"

**Symptom**: `tab close` errors because it's the last tab.

**Fix**: Open a new tab first if you need to close the current one:
```bash
agent-browser tab new
agent-browser tab 1
agent-browser tab close    # Now safe — tab 2 still exists
```

---

## Commands are slow on first run

**Symptom**: The first `agent-browser` command takes a long time.

**Cause**: npx is downloading agent-browser for the first time, or Chromium is being downloaded for the profile.

**Fix**: This is normal for the first run. To pre-install:
```bash
npm install -g agent-browser
agent-browser install
```

---

## Screenshot is blank or shows wrong page

**Symptom**: Screenshot shows a blank page or unexpected content.

**Fix**:
```bash
# Wait for content to load
agent-browser wait 3000
agent-browser screenshot ~/.superbot2/uploads/debug.png

# Check which tab you're on
agent-browser tab list
agent-browser get url
agent-browser get title
```

---

## JavaScript eval returns undefined

**Symptom**: `agent-browser eval '...'` returns nothing.

**Cause**: Shell quoting mangled the JavaScript.

**Fix**: Use `--stdin` for anything beyond simple expressions:
```bash
agent-browser eval --stdin <<'EVALEOF'
JSON.stringify({
  title: document.title,
  url: window.location.href,
  links: document.querySelectorAll("a").length
})
EVALEOF
```

---

## Debugging tips

When automation isn't working as expected:

```bash
# 1. Use --headed to see what's happening
agent-browser --headed open "https://example.com"

# 2. Take a screenshot
agent-browser screenshot /tmp/debug.png

# 3. Check console for errors
agent-browser errors

# 4. Get current URL and title
agent-browser get url
agent-browser get title

# 5. Full page text dump
agent-browser get text body > /tmp/page-dump.txt

# 6. Highlight an element to verify it's the right one
agent-browser highlight @e1
agent-browser screenshot /tmp/highlighted.png
```
