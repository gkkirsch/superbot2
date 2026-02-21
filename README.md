# Superbot2

An autonomous AI orchestrator built on [Claude Code](https://claude.ai/). Superbot2 runs as a persistent team of AI agents that manage projects, execute tasks, and self-improve — all from a single command.

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/gkkirsch/superbot2/main/install.sh | bash
```

This clones the repo, builds the dashboard, deploys hooks/skills/agents, and opens the dashboard in your browser. After install, restart your terminal and run `superbot2` to start the full system.

**Prerequisites:** macOS, Node.js v18+, git, jq. Claude Code is installed automatically if missing.

## How It Works

Superbot2 uses Claude Code's agent teams feature to create a multi-agent system:

- **Orchestrator (team-lead)** — Reads your spaces and projects, triages escalations, dispatches work to space workers, and makes decisions based on your knowledge files
- **Space workers** — Autonomous agents that execute project plans, write code, run tests, and escalate when they need human input
- **Heartbeat** — A periodic cron job that detects changes to your spaces, knowledge, and escalations, then notifies the orchestrator
- **Scheduler** — Runs scheduled jobs (like weekly self-improvement analysis)
- **Dashboard** — A web UI for monitoring activity, chatting with the orchestrator, resolving escalations, and managing configuration

### Architecture

```
~/.superbot2-app/          # Code (cloned repo)
  superbot2                # Main executable
  install.sh               # Curl-able installer
  scripts/                 # Setup, heartbeat, scheduler, scaffolding
  templates/               # Guide templates (expanded during setup)
  hooks/                   # Claude Code hooks (teammate-idle, task-completed, etc.)
  skills/                  # Skills deployed to ~/.claude/skills/
  agents/                  # Agent definitions deployed to ~/.claude/agents/
  dashboard/               # Express server (API + static file serving)
  dashboard-ui/            # Vite + React dashboard

~/.superbot2/              # Runtime data (user-owned, never overwritten by updates)
  spaces/                  # Your spaces (projects, plans, tasks, knowledge)
  escalations/             # Questions and decisions needing human input
  knowledge/               # Shared knowledge files loaded into orchestrator context
  IDENTITY.md              # Superbot2's personality and identity
  USER.md                  # Your profile and preferences
  MEMORY.md                # Persistent memory across sessions
  config.json              # Schedule and configuration
```

## Install

See [Quick Start](#quick-start) above. The installer clones to `~/.superbot2-app/`, builds the dashboard, deploys hooks/skills/agents, initializes `~/.superbot2/`, and adds a shell alias.

## Usage

```bash
# Start the orchestrator (launches dashboard at http://localhost:3274)
superbot2

# Pull latest code and redeploy (preserves your data)
superbot2 update

# Re-run initial setup
superbot2 setup

# Show help
superbot2 help
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SUPERBOT2_HOME` | `~/.superbot2` | Runtime data directory |
| `SUPERBOT2_APP_DIR` | `~/.superbot2-app` | Code installation directory |

### Custom Install Location

```bash
# Install code to a custom directory
SUPERBOT2_APP_DIR=~/my-superbot2 curl -fsSL https://raw.githubusercontent.com/gkkirsch/superbot2/main/install.sh | bash

# Use a custom runtime directory
SUPERBOT2_HOME=/tmp/superbot2-test superbot2
```

## Creating Spaces and Projects

Superbot2 organizes work into **spaces** (domains of work) and **projects** (specific initiatives within a space):

```bash
# Create a space
~/.superbot2/scripts/create-space.sh my-space "Description of this space" ~/path/to/working/dir

# Create a project within a space
~/.superbot2/scripts/create-project.sh my-space my-project "What this project does"

# Create a task within a project
~/.superbot2/scripts/create-task.sh my-space my-project "Task subject" "Detailed description"
```

Or use the dashboard to manage spaces and projects through the web UI.

## License

[MIT](LICENSE)
