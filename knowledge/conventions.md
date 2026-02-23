# Conventions

## Default Web Stack

All web projects use this stack unless explicitly overridden:

- **Runtime**: Node.js
- **Framework**: React (with Vite)
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui
- **Icons**: Lucide React
- **Fonts**: Google Fonts (Inter as default)
- **API**: Express
- **Validation**: Zod
- **Language**: TypeScript

When starting a new web project, use the `web-project-setup` skill to scaffold it.

## Git Workflow

All development must use feature branches. Never commit directly to `main`.

- At session start: `git branch --show-current` — if on main, create a branch immediately
- Use descriptive branch names matching the project: `hostaway-integration`, `facebook-gtm`, etc.
- All commits go on the branch
- When work is complete: create a PR or escalation requesting merge — workers never self-merge
- User reviews and merges

This applies to all spaces and all projects.

## Default Database

- **Database**: PostgreSQL (prefer over SQLite for all backends)

Use Postgres even for simple projects — it's the default. Only use SQLite if there's a specific reason (e.g., embedded/local-only with no server).

## System File Sync

**Two locations exist. Both must stay in sync. This is a hard rule.**

| Location | Purpose |
|----------|---------|
| `~/dev/superbot2/` | Source of truth — git repo, commit here |
| `~/.superbot2/` | Runtime — what actually runs |

### Which files need syncing (both locations)

| Runtime path | Dev repo path |
|-------------|---------------|
| `~/.superbot2/templates/orchestrator-system-prompt-override.md` | `~/dev/superbot2/templates/orchestrator-system-prompt-override.md` |
| `~/.superbot2/scripts/*.sh` | `~/dev/superbot2/scripts/*.sh` |
| `~/.superbot2/skills/<name>/` | `~/dev/superbot2/skills/<name>/` |
| `~/.superbot2/knowledge/*.md` | `~/dev/superbot2/knowledge/*.md` |
| `~/.claude/agents/space-worker.md` | `~/dev/superbot2/agents/space-worker.md` |

Note: `ORCHESTRATOR_GUIDE.md` and `SPACE_WORKER_GUIDE.md` are runtime-only (no dev counterpart — they are injected into prompts at runtime).

### Which files are runtime-only (do NOT sync to dev)

These live only in `~/.superbot2/` and are never committed to the dev repo:
- `escalations/`, `sessions/`, `todos.json`, `config.json`
- `spaces/` (space-specific data, knowledge, plans)
- `knowledge/` (global knowledge — orchestrator-managed, not versioned)
- `IDENTITY.md`, `USER.md`, `MEMORY.md`
- `dashboard.pid`, `dashboard.log`, `*.pid`

### The sync rule

**Whenever you modify a system file, sync it to the other location in the same session.**

1. `diff <runtime-file> <dev-file>` — always diff first
2. If only one side has changes, copy your changes to the other
3. If both sides have changes, merge manually — never blindly overwrite
4. Commit the dev repo copy: `git add <file> && git commit -m "..."`

**The orchestrator and workers must both follow this.** If you modified a template, guide, script, skill, or agent definition — check the other copy before you finish.
