---
name: tmux-testing
description: Use when testing superbot2 or any long-running CLI process that needs interactive observation and input via tmux
---

# Tmux Testing

## Overview

Test long-running processes (like superbot2) by launching them in tmux panes, observing output, and sending input — all from your current session.

**Core principle:** Use `tmux send-keys` to type, `tmux capture-pane` to read. Never pipe through tee or lose the interactive terminal.

## When to Use

- Testing superbot2 orchestrator sessions
- Running any CLI process you need to observe and interact with
- Integration testing where you need to monitor output and send follow-up input
- Testing agent team inbox delivery

## Setup

### 1. Check tmux is available

```bash
# Verify we're in tmux
echo "TMUX=$TMUX"
tmux list-sessions
```

### 2. Create a pane

```bash
# Horizontal split, 100 chars wide
tmux split-window -h -l 100

# Get the new pane's ID (use the highest numbered one)
tmux list-panes -F '#{pane_id} #{pane_index} #{pane_active}'
```

Save the pane ID (e.g., `%67`) — you'll use it for all subsequent commands.

### 3. Send commands

```bash
# Type a command and press Enter
tmux send-keys -t %67 'bash /path/to/script.sh' Enter
```

### 4. Read output

```bash
# Wait, then capture visible pane content
sleep 5 && tmux capture-pane -t %67 -p

# Capture with scrollback (more history)
tmux capture-pane -t %67 -p -S -100
```

### 5. Send interactive input

```bash
# Type text into the pane (like a user typing)
tmux send-keys -t %67 'your message here' Enter
```

### 6. Send control sequences

```bash
# Ctrl-C to interrupt
tmux send-keys -t %67 C-c

# Escape key
tmux send-keys -t %67 Escape
```

### 7. Clean up

```bash
# Kill the pane when done
tmux kill-pane -t %67
```

## Superbot2 Testing Pattern

### Full test cycle

```bash
# 1. Reset state
rm -f ~/.superbot2/.orchestrator-session
rm -f ~/.superbot2/.heartbeat-last-fingerprint
echo '[]' > ~/.claude/teams/superbot2/inboxes/team-lead.json

# 2. Run setup (re-deploys templates, creates team config)
bash ~/dev/superbot2/scripts/setup.sh

# 3. Create pane
tmux split-window -h -l 100
# Note the pane ID from:
tmux list-panes -F '#{pane_id} #{pane_index}'

# 4. Launch superbot2
tmux send-keys -t %XX 'superbot2' Enter

# 5. Wait for heartbeat delivery and initial cycle
sleep 15 && tmux capture-pane -t %XX -p

# 6. Send a user message (after orchestrator is idle)
tmux send-keys -t %XX 'your task description here' Enter

# 7. Monitor
sleep 30 && tmux capture-pane -t %XX -p -S -50
```

### Session ID conflicts

If you get "Session ID already in use":
```bash
rm -f ~/.superbot2/.orchestrator-session
```
The next launch generates a fresh UUID.

### Checking inbox delivery

The heartbeat writes to the inbox and Claude Code delivers it automatically:
```bash
# Check what's in the inbox
cat ~/.claude/teams/superbot2/inboxes/team-lead.json | jq .

# Manually trigger a heartbeat
bash ~/dev/superbot2/scripts/heartbeat-cron.sh
```

When delivered, you'll see `@heartbeat>` in the pane output.

## Key Patterns

### Wait-then-check loop

For monitoring something that takes variable time:
```bash
for i in {1..10}; do
  sleep 5
  output=$(tmux capture-pane -t %XX -p)
  echo "=== Check $i ==="
  echo "$output" | tail -5
  # Break when you see expected output
  echo "$output" | grep -q "expected text" && break
done
```

### Capture full scrollback

Default `capture-pane` only gets visible lines. For full history:
```bash
tmux capture-pane -t %XX -p -S -500  # last 500 lines
```

### Multiple panes

You can run multiple processes in parallel:
```bash
tmux split-window -h -l 80  # pane for process A
tmux split-window -v -l 20  # pane for process B (splits the new one)
```

## Monitoring Teammate Workers

When superbot2 spawns teammates (space workers), they run as separate Claude Code processes in their own tmux panes. You can find and monitor them:

```bash
# List ALL panes across all sessions — teammates show as separate Claude Code processes
tmux list-panes -a -F '#{pane_id} #{pane_title} #{pane_current_command}'
```

Teammate panes will show up with descriptive titles (e.g., "Kids Video Player") and `node` or Claude Code version as the command. You can `capture-pane` and `send-keys` to them just like the orchestrator pane.

```bash
# Example: orchestrator is %77, worker is %78
tmux capture-pane -t %78 -p -S -50   # read the worker's output
```

This is useful for:
- Seeing if a worker invoked the brainstorming skill
- Watching a worker's build progress in real time
- Debugging why a worker is stuck or idle

## Incremental Testing (No Full Reset)

Don't nuke `~/.superbot2/` or `~/.claude/` for every test — there's real project data in there. Use incremental resets:

```bash
# Minimal reset: just clear session lock and inbox
rm -f ~/.superbot2/.orchestrator-session
rm -f ~/.superbot2/.heartbeat-last-fingerprint
echo '[]' > ~/.claude/teams/superbot2/inboxes/team-lead.json

# Redeploy code changes without touching user data
superbot2 update
```

`superbot2 update` redeploys templates, hooks, skills, scripts, agents, and rebuilds the dashboard but preserves spaces, escalations, knowledge, identity, and memory.

## Testing Hooks

The `TeammateIdle` hook can be tested directly without launching superbot2:

```bash
# Simulate hook with a mock transcript
echo '{"teammate_name":"test-worker","team_name":"superbot2","cwd":"/Users/gkkirsch/dev","transcript_path":"/tmp/mock.jsonl"}' \
  | bash ~/.superbot2/hooks/teammate-idle.sh 2>&1
echo "EXIT: $?"
```

Create mock transcripts to test pass/fail cases:
```bash
# Failing transcript (worker did nothing)
cat > /tmp/mock-fail.jsonl << 'EOF'
{"type":"message","role":"user","content":"Build the component"}
{"type":"message","role":"assistant","content":"Starting work."}
EOF

# Passing transcript (all checklist items present)
cat > /tmp/mock-pass.jsonl << 'EOF'
{"type":"message","role":"user","content":"Build the component"}
{"type":"tool_use","name":"Bash","input":{"command":"npm test"}}
{"type":"tool_use","name":"Write","input":{"file_path":"knowledge/patterns.md"}}
{"type":"tool_use","name":"Bash","input":{"command":"bash create-escalation.sh decision space proj 'question'"}}
{"type":"tool_use","name":"SendMessage","input":{"recipient":"team-lead","content":"Done"}}
{"type":"message","role":"assistant","content":"IDLE_CHECKLIST_COMPLETE"}
EOF
```

### Hook debugging tips

- The hook detects the worker's space by looking for recently modified files (tasks, plans, escalations). If no files were modified in 30 minutes, the hook exits 0 (allow idle) because it can't identify the space.
- Hook feedback appears as `role:user` messages in the worker's transcript with the prefix `TeammateIdle hook feedback:`.
- Hooks are defined in `~/.claude/settings.json` (user-wide) — NOT `settings.local.json`. The user-wide file applies to all sessions including teammates.
- Worker panes disappear when the worker exits. If you need to see what happened, find the transcript file: `find ~/.claude/projects -name "*.jsonl" -mmin -5`

## Port Conflicts

If the dashboard server starts then immediately exits, check for zombie processes:
```bash
lsof -i :3274 | grep LISTEN    # find the process
kill <PID>                       # kill it
```
Then restart the server. Express 5 exits silently on EADDRINUSE.

## Gotchas

- **Pane IDs change** when panes are created/destroyed. Always re-check with `tmux list-panes`.
- **Capture timing** — if you capture too early, the process hasn't output yet. Use `sleep` or the wait-then-check loop.
- **Long output** — `capture-pane` only gets what's visible. Use `-S -N` for scrollback.
- **Quoting** — `send-keys` sends literal text. Quotes in your message are fine, but escape special tmux chars if needed.
- **Claude CLI needs initial message** — you can't start `claude` without a prompt argument. The launcher script handles this.
- **Double Enter for Claude CLI input** — When sending user messages to a running Claude CLI session (superbot2), the first `Enter` may just confirm the text in the input buffer. Send a second `Enter` after a short delay to actually submit:
  ```bash
  tmux send-keys -t %XX 'your message here' Enter
  sleep 2
  tmux send-keys -t %XX '' Enter
  ```
- **Worker panes are ephemeral** — Teammate worker panes disappear when the worker goes idle and gets shut down by the orchestrator. If you need to catch what the worker did, monitor its pane actively or find its transcript after the fact.
- **Pane title changes** — The orchestrator pane's title may change to reflect the current task (e.g., "Add favicon to app"). Use `tmux list-panes -a -F '#{pane_id} #{pane_title}'` to find the right pane by title rather than memorizing IDs.
