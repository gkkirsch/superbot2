# Superbot2

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/gkkirsch/superbot2/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)]()

An autonomous AI orchestrator built on [Claude Code](https://claude.ai/). Superbot2 runs a persistent team of AI agents that manage your projects, execute tasks, and continuously self-improve -- all from a single command.

Unlike one-shot AI coding tools, Superbot2 operates as a **persistent, multi-agent system**. It organizes work into spaces, triages priorities, dispatches autonomous workers, escalates decisions to you when needed, and learns from its own performance over time. A built-in web dashboard lets you monitor everything in real time.

<!-- TODO: Add screenshot or demo GIF here -->
<!-- ![Superbot2 Dashboard](docs/images/dashboard-screenshot.png) -->

---

## Feature Highlights

### Multi-Agent Orchestrator
A team-lead agent reads your spaces and projects, triages escalations, dispatches work to space workers, and makes decisions based on your knowledge files. Workers execute plans autonomously, escalating only when human input is needed. The orchestrator maintains context across sessions through persistent memory and identity files.

### Spaces and Projects
Organize work into **spaces** (domains) and **projects** (specific initiatives). Each project gets its own plan, tasks, and working directory. The orchestrator coordinates across all of them, ensuring work progresses in priority order.

### Web Dashboard
A full-featured React + Vite dashboard for monitoring agent activity, chatting with the orchestrator, resolving escalations, managing spaces, and configuring the system. Launches automatically at `http://localhost:3274`. Features include:
- Real-time activity log and agent status
- Chat interface for direct orchestrator communication
- Escalation queue with resolve/dismiss actions
- Space and project management UI
- Goals tracking and progress visualization

### Escalation Management
When agents encounter decisions that require human judgment, they create escalations with full context. You review and resolve them through the dashboard or the file system, and the orchestrator incorporates your decisions into its workflow.

### Knowledge Management
Shared knowledge files are loaded into the orchestrator's context automatically. Add documentation, style guides, architectural decisions, or domain-specific knowledge -- agents reference it when making decisions and writing code.

### Skills and Plugins
A skills system lets you extend agent capabilities. Skills are deployed to Claude Code and available to all agents during execution. Create custom skills for your workflow or use the built-in ones.

### Scheduler
Cron-based scheduling for recurring jobs. Configure schedules in `config.json` to run:
- Weekly self-improvement analysis
- Periodic code reviews
- Custom maintenance tasks
- Any recurring automation you define

### Self-Improvement
Superbot2 analyzes its own performance and suggests improvements. The self-improvement system reviews past work, identifies patterns, and proposes concrete optimizations to how it operates.

### macOS Tray App
An Electron-based menu bar app that provides quick access to the dashboard, status monitoring, and system controls without opening a terminal. Start, stop, and monitor the orchestrator from your menu bar.

---

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/gkkirsch/superbot2/main/install.sh | bash
```

This clones the repo, builds the dashboard, deploys hooks/skills/agents, and opens the dashboard in your browser. After install, restart your terminal and run `superbot2` to start the full system.

**Prerequisites:** macOS, Node.js v18+, git, jq. Claude Code is installed automatically if missing.

---

## How It Works

Superbot2 uses Claude Code's agent teams feature to create a multi-agent system:

- **Orchestrator (team-lead)** -- Reads your spaces and projects, triages escalations, dispatches work to space workers, and makes decisions based on your knowledge files
- **Space workers** -- Autonomous agents that execute project plans, write code, run tests, and escalate when they need human input
- **Heartbeat** -- A periodic cron job that detects changes to your spaces, knowledge, and escalations, then notifies the orchestrator
- **Scheduler** -- Runs scheduled jobs (like weekly self-improvement analysis)
- **Dashboard** -- A web UI for monitoring activity, chatting with the orchestrator, resolving escalations, and managing configuration

---

## Architecture

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

---

## Installation

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/gkkirsch/superbot2/main/install.sh | bash
```

The installer clones to `~/.superbot2-app/`, builds the dashboard, deploys hooks/skills/agents, initializes `~/.superbot2/`, and adds a shell alias.

### Clone Manually

```bash
git clone https://github.com/gkkirsch/superbot2.git ~/.superbot2-app
cd ~/.superbot2-app
./install.sh
```

### Custom Install Location

```bash
# Install code to a custom directory
SUPERBOT2_APP_DIR=~/my-superbot2 curl -fsSL https://raw.githubusercontent.com/gkkirsch/superbot2/main/install.sh | bash

# Use a custom runtime directory
SUPERBOT2_HOME=/tmp/superbot2-test superbot2
```

---

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

---

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

### Typical Workflow

1. **Install** Superbot2 with the one-line installer
2. **Create a space** for your domain (e.g., "web-app", "data-pipeline")
3. **Create projects** within that space with descriptions of what you want built
4. **Create tasks** within projects, or let the orchestrator break down the work
5. **Run `superbot2`** -- the orchestrator picks up your spaces, plans work, and dispatches agents
6. **Monitor** progress through the dashboard at `http://localhost:3274`
7. **Resolve escalations** when agents need your input on decisions
8. **Review results** -- agents commit code, update plans, and report progress

The orchestrator continues working across sessions. It remembers context, learns from past work, and adapts to your preferences over time.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SUPERBOT2_HOME` | `~/.superbot2` | Runtime data directory |
| `SUPERBOT2_APP_DIR` | `~/.superbot2-app` | Code installation directory |

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get involved.

Ways to contribute:
- Report bugs or request features via [GitHub Issues](https://github.com/gkkirsch/superbot2/issues)
- Submit pull requests for bug fixes or new features
- Improve documentation
- Create and share custom skills
- Help with testing on different environments

---

## Links

- [GitHub Repository](https://github.com/gkkirsch/superbot2)
- [Issue Tracker](https://github.com/gkkirsch/superbot2/issues)
- [Contributing Guide](CONTRIBUTING.md)
- [License](LICENSE)

---

## License

[MIT](LICENSE)
