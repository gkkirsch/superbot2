# Superbot2 TODOs

## ~~Orchestrator pre-prompt / launch mechanism~~ DONE
Launcher script created at `scripts/superbot2.sh`. Uses `--system-prompt` (full override) to inject custom orchestrator prompt with identity/user/memory. Sends initial message to kick off the cycle.

## Restart trigger strategy
The launcher has a watchdog loop and `.restart` file pattern (carried from v1). Still need to decide:
- What triggers the restart? Options: dashboard writes `.restart` on escalation resolution, periodic cron, orchestrator self-triggers, manual
- Should there be a periodic auto-restart (every 30-60 min) for context refresh?
- Should the heartbeat cron touch `.restart` if it detects file changes?
- How does the dashboard notify the orchestrator when escalations are resolved?

## ~~Fork brainstorming skill~~ DONE
Forked to `skills/superbot-brainstorming/SKILL.md`. Changes: output path → project's plan.md, removed git commit step, removed worktree/writing-plans steps, added task creation step. Setup script will symlink/copy to `~/.claude/skills/superbot-brainstorming/`.

## ~~Setup script~~ DONE
Created `scripts/setup.sh`. Creates directory structure, copies guides/templates/hooks/skills/agents, creates initial identity/knowledge files, installs hooks into `.claude/settings.local.json`.

## ~~Hooks installation~~ DONE
Handled by setup script. Hooks copied to `~/.superbot2/hooks/`, wired into `.claude/settings.local.json`.

## Daily notes / memory strategy
Need to design:
- When does the orchestrator write daily notes? End of cycle? On shutdown?
- What goes in daily/ vs MEMORY.md vs knowledge/?
  - daily/ = session log (what happened today, ephemeral)
  - MEMORY.md = persistent cross-session notes (injected into system prompt each boot)
  - knowledge/ = stable conventions, decisions, patterns (read on boot, not injected)
- Should there be a daily observer (like v1) that summarizes session transcripts?
- How does the morning briefing get generated? From escalations + daily notes?
- Does the orchestrator auto-update MEMORY.md or does the user curate it?
- Memory size budget (it gets injected into system prompt every boot)

## Dashboard API
Build Express API endpoints for:
- `GET /api/escalations` - list pending escalations (morning briefing)
- `PATCH /api/escalations/:id` - resolve an escalation (triggers `.restart`)
- `GET /api/portfolio` - portfolio view (spaces, projects, task counts)
- `GET /api/briefing` - latest morning briefing

## Heartbeat / cron script
Carry forward from v1, adapted for v2:
- Periodic trigger (every N minutes)
- Fingerprint-based dedup (skip if nothing changed)
- Optionally touch `.restart` to wake orchestrator
