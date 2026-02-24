---
name: imessage-setup
description: >
  Set up or troubleshoot the superbot2 iMessage bridge. Walks through Apple ID creation,
  Messages.app configuration, Full Disk Access, config setup, and end-to-end testing.
argument-hint: "[test|status|reset]"
version: 1.0.0
---

# iMessage Setup Wizard

Interactive guide to set up, test, or troubleshoot the superbot2 iMessage bridge.

## Argument Handling

Check `$ARGUMENTS` to determine what to do:

- If `$ARGUMENTS` is `status` → jump to **Status Check Only**
- If `$ARGUMENTS` is `test` → jump to **Test Only**
- If `$ARGUMENTS` is `reset` → jump to **Reset**
- If `$ARGUMENTS` is empty or `setup` → run the **Full Setup Flow**

---

## Status Check Only

Run these checks and report a clear summary to the user:

```bash
# 1. Read config
CONFIG=$(cat ~/.superbot2/config.json 2>/dev/null)
echo "$CONFIG" | python3 -c "
import json, sys
c = json.load(sys.stdin)
im = c.get('imessage', {})
print(f\"  enabled:  {im.get('enabled', False)}\")
print(f\"  appleId:  {im.get('appleId', '(not set)')}\")
print(f\"  phone:    {im.get('phoneNumber', '(not set)')}\")
"

# 2. Check watcher process
pgrep -f imessage-watcher.sh > /dev/null 2>&1 && echo "  watcher:  running (PID $(pgrep -f imessage-watcher.sh))" || echo "  watcher:  not running"

# 3. Check Full Disk Access (chat.db readable)
sqlite3 -readonly ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;" 2>/dev/null && echo "  chat.db:  readable (Full Disk Access OK)" || echo "  chat.db:  NOT readable (Full Disk Access missing)"

# 4. Check Messages.app running
osascript -e 'tell application "System Events" to (name of processes) contains "Messages"' 2>/dev/null | grep -q "true" && echo "  Messages: running" || echo "  Messages: not running"
```

Present the results as a clean status table to the user, then stop.

---

## Test Only

Run the end-to-end test without going through setup:

```bash
# Read the configured Apple ID
APPLE_ID=$(python3 -c "import json; c=json.load(open('$HOME/.superbot2/config.json')); print(c.get('imessage',{}).get('appleId',''))" 2>/dev/null)
```

If `APPLE_ID` is empty or `YOUR_SUPERBOT2_APPLE_ID`, tell the user they need to run setup first (`/imessage-setup` or `/imessage-setup setup`).

Otherwise:

1. **Send a test message:**
```bash
bash ~/.superbot2/scripts/send-imessage.sh "$APPLE_ID" "superbot2 is online ✓"
```
Tell the user: "I sent a test message to $APPLE_ID. You should see it arrive in Messages.app."

2. **Ask the user to reply** from their phone by texting the superbot2 Apple ID.

3. **Watch for an incoming reply** (poll chat.db for 30 seconds):
```bash
LAST_ROWID=$(sqlite3 -readonly ~/Library/Messages/chat.db "SELECT COALESCE(MAX(rowid), 0) FROM message;" 2>/dev/null)
echo "Watching for new messages (30s timeout)..."
for i in $(seq 1 6); do
  sleep 5
  NEW=$(sqlite3 -readonly ~/Library/Messages/chat.db "
    SELECT m.text FROM message m
    JOIN chat_message_join cmj ON cmj.message_id = m.rowid
    JOIN chat c ON c.rowid = cmj.chat_id
    WHERE m.rowid > $LAST_ROWID
      AND m.is_from_me = 0
      AND m.text IS NOT NULL
      AND m.text != ''
    ORDER BY m.rowid DESC LIMIT 1;
  " 2>/dev/null)
  if [[ -n "$NEW" ]]; then
    echo "Received: $NEW"
    break
  fi
  echo "  ...waiting ($((i * 5))s)"
done
```

4. If a message was received, tell the user the iMessage bridge is working end-to-end. If not after 30s, tell them to check that:
   - They texted the correct Apple ID
   - Messages.app is signed in with that account
   - Full Disk Access is enabled

---

## Reset

Disable iMessage integration, stop the watcher, and clear config:

```bash
# 1. Stop watcher if running
pkill -f imessage-watcher.sh 2>/dev/null && echo "Stopped imessage-watcher" || echo "Watcher was not running"

# 2. Disable in config
python3 -c "
import json
with open('$HOME/.superbot2/config.json', 'r') as f:
    c = json.load(f)
c['imessage'] = {'enabled': False, 'appleId': '', 'phoneNumber': ''}
with open('$HOME/.superbot2/config.json', 'w') as f:
    json.dump(c, f, indent=2)
print('iMessage config reset.')
"

# 3. Remove last-rowid tracker
rm -f ~/.superbot2/imessage-last-rowid.txt
echo "Removed rowid tracker."
```

Tell the user iMessage has been disabled. They can re-run `/imessage-setup` to set it up again.

---

## Full Setup Flow

Work through each step in order. After each step, report what you found and whether it passed or needs action.

### Step 1: Check Current Status

Run the same commands from **Status Check Only** above. Present the results to the user.

Then determine which steps can be skipped:
- If `appleId` is set and not `YOUR_SUPERBOT2_APPLE_ID` → skip Step 2
- If Messages.app is running → Step 3 may just need confirmation
- If chat.db is readable → skip Step 4
- If `enabled` is `true` and watcher is running → skip Step 5

Tell the user: "Here's what's already configured and what still needs to be done."

### Step 2: Apple ID

Check the current Apple ID:

```bash
APPLE_ID=$(python3 -c "import json; c=json.load(open('$HOME/.superbot2/config.json')); print(c.get('imessage',{}).get('appleId',''))" 2>/dev/null)
echo "Current Apple ID: $APPLE_ID"
```

**If `APPLE_ID` is empty or `YOUR_SUPERBOT2_APPLE_ID`:**

Tell the user:

> You need a dedicated Apple ID for superbot2's iMessage account. This is the Apple ID people will text to reach superbot2.
>
> 1. Go to https://appleid.apple.com and create a new Apple ID
> 2. Suggested naming: `superbot2-yourname@gmail.com` (or similar)
> 3. Come back here and tell me the email once it's created

Wait for the user to provide the Apple ID email. Then update config:

```bash
python3 -c "
import json, sys
email = sys.argv[1]
with open('$HOME/.superbot2/config.json', 'r') as f:
    c = json.load(f)
c.setdefault('imessage', {})['appleId'] = email
with open('$HOME/.superbot2/config.json', 'w') as f:
    json.dump(c, f, indent=2)
print(f'Apple ID set to: {email}')
" "THE_EMAIL_USER_PROVIDED"
```

**If `APPLE_ID` is already set to a real value:** Tell the user the Apple ID is already configured and move on.

### Step 3: Messages.app

Check if Messages is running:

```bash
osascript -e 'tell application "System Events" to (name of processes) contains "Messages"' 2>/dev/null
```

Tell the user:

> Now sign the superbot2 Apple ID into Messages.app:
>
> 1. Open **Messages.app** (I can open it for you if you'd like)
> 2. Go to **Messages → Settings → iMessage** (Cmd+,)
> 3. If you see "Sign in with Apple ID" — sign in with: `THE_CONFIGURED_APPLE_ID`
> 4. If you already have a personal Apple ID signed in, you can add superbot2 as a second account
>
> Let me know once you've signed in.

If the user wants you to open Messages:

```bash
open -a Messages
```

Wait for the user to confirm they've signed in before proceeding.

### Step 4: Full Disk Access

Test if chat.db is readable:

```bash
sqlite3 -readonly ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;" 2>/dev/null
```

**If the command succeeds:** Tell the user Full Disk Access is working and move on.

**If it fails (permission denied or error):**

Tell the user:

> Your terminal needs Full Disk Access to read the iMessage database. Without this, superbot2 can't see incoming messages.
>
> 1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
> 2. Find your terminal app (Terminal, iTerm2, or whichever you use) and toggle it ON
> 3. You may need to quit and reopen your terminal for it to take effect
>
> Let me know once you've enabled it.

After user confirms, re-test:

```bash
sqlite3 -readonly ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;" 2>/dev/null
```

If it still fails, tell the user the change may not have taken effect yet and they might need to restart their terminal.

### Step 5: Configure and Enable

Update config to enable iMessage:

```bash
python3 -c "
import json
with open('$HOME/.superbot2/config.json', 'r') as f:
    c = json.load(f)
c.setdefault('imessage', {})['enabled'] = True
with open('$HOME/.superbot2/config.json', 'w') as f:
    json.dump(c, f, indent=2)
print('iMessage enabled in config.')
"
```

Start the watcher if not already running:

```bash
if pgrep -f imessage-watcher.sh > /dev/null 2>&1; then
  echo "Watcher already running (PID $(pgrep -f imessage-watcher.sh))"
else
  nohup bash ~/.superbot2/scripts/imessage-watcher.sh >> ~/.superbot2/logs/imessage-watcher.log 2>&1 &
  sleep 1
  if pgrep -f imessage-watcher.sh > /dev/null 2>&1; then
    echo "Watcher started (PID $(pgrep -f imessage-watcher.sh))"
  else
    echo "WARNING: Watcher failed to start. Check ~/.superbot2/logs/imessage-watcher.log"
  fi
fi
```

### Step 6: End-to-End Test

Run the same test flow from **Test Only** above:

1. Send a test message to the configured Apple ID
2. Ask the user to text the superbot2 Apple ID from their phone
3. Watch chat.db for 30 seconds for an incoming reply
4. Report success or troubleshooting tips

If everything works, congratulate the user:

> iMessage bridge is fully set up! People can now text your superbot2 Apple ID and messages will flow into the superbot2 system.
>
> **Tip:** Add the superbot2 Apple ID as "Superbot2" in your Contacts so it's easy to find.

If the test fails, run the status check again and report which component needs attention.
