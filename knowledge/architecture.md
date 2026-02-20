# Architecture Patterns

## Packaging

### Entry Points
1. **`install.sh`** (repo root) — curl-able installer. Checks prereqs (git, node, jq, claude), clones to `SUPERBOT2_APP_DIR` (default `~/.superbot2-app/`), runs setup.
2. **`superbot2`** (repo root) — main executable. Subcommands: `(none)` = start orchestrator, `update` = pull+rebuild+redeploy, `setup` = re-run setup, `help`.
3. **`scripts/setup.sh`** — initializes `~/.superbot2/` runtime. Called by install.sh and `superbot2 setup`.

### Directory Layout
- **Repo** (`~/.superbot2-app/` or wherever cloned): code, scripts, templates, skills, agents, hooks, dashboard source
- **Runtime** (`~/.superbot2/`): user data (spaces, escalations, knowledge, identity, memory) + deployed copies of scripts/hooks/templates

### Dashboard Build
- `dashboard/` has `package.json` (Express server, just `express` dep)
- `dashboard-ui/` has `package.json` (Vite+React, many deps)
- Both need `npm install`. Dashboard-ui also needs `npm run build` to produce `dist/`
- Build happens during setup.sh and `superbot2 update`
- server.js serves `dist/` using `express.static` with path relative to `import.meta.dirname`

### Path Resolution in server.js
Sibling directories via `import.meta.dirname`:
- `SUPERBOT_SKILLS_DIR = join(import.meta.dirname, '..', 'skills')`
- `SELF_IMPROVEMENT_SCRIPT = join(import.meta.dirname, '..', 'scripts', 'run-self-improvement.sh')`
- `DIST_DIR = join(import.meta.dirname, '..', 'dashboard-ui', 'dist')`

Runtime paths via `homedir()`:
- `SUPERBOT_DIR = join(homedir(), '.superbot2')`
- `TEAM_INBOXES_DIR = join(homedir(), '.claude', 'teams', 'superbot2', 'inboxes')`

### Shell Alias
Setup adds `alias superbot2="<repo-root>/superbot2"` to `.zshrc`/`.bashrc` with duplicate protection. Also adds `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env var.

## Dashboard Architecture

### 3-Column Layout
Grid: `grid-cols-[1fr_1.2fr_1fr]` (center column wider for chat).
- **Left**: Escalations (needs_human) + Orchestrator Decisions
- **Center**: ChatSection — full-height chat with message history + input
- **Right**: Pulse + Recent Activity + Schedule + Self-Improvement + Skills

Max width `max-w-[1600px]`. Collapses to single column on mobile via `grid-cols-1 lg:grid-cols-[...]`.

### Endpoint Parity Bug Pattern
`GET /api/spaces` (list) and `GET /api/spaces/:slug` (detail) compute space data independently. When adding new per-project data, always update BOTH endpoints in `dashboard/server.js`.

### Section Patterns
- **Always-visible**: Rendered with `<SectionHeader>`, always shown
- **Conditional**: Self-contained with own `<section>` wrapper, return `null` when empty

### Enable/Disable Toggles
1. **Skills** (`~/dev/superbot2/skills/`): Rename `SKILL.md` ↔ `SKILL.md.disabled`
2. **Hooks** (`~/.claude/settings.json`): Move between settings.json and `~/.superbot2/disabled-hooks.json`
3. **Agents** (`~/.claude/agents/`): Rename `.md` ↔ `.md.disabled`

### Markdown Rendering
Two styling classes in `index.css`:
- `.docs-content` — full-size (text-sm) for documentation pages
- `.markdown-compact` — compact (text-xs) for inline content like escalation cards

`MarkdownContent` component wraps `react-markdown` + `remark-gfm`.

## Team Inbox Messaging

Messages at `~/.claude/teams/superbot2/inboxes/`. Each agent has own file. Format:
```json
[{"from": "sender", "text": "content", "summary": "brief", "timestamp": "ISO", "read": false}]
```

### Chat Message Classification (4 types)
1. **User** (`from: "dashboard-user"`) — right-aligned warm bubbles
2. **Orchestrator** (`from: "team-lead"`) — to-worker: faded one-liner; to-user: full cool-gray bubble
3. **Agent** (workers) — left-aligned neutral bubbles, hidden by default
4. **System** (heartbeat, scheduled_job, idle, shutdown) — centered one-line, hidden by default

### Activity Indicators
Default view groups non-primary messages into clusters. Primary = user + orchestrator→user. Background = everything else.

## Self-Improvement Pipeline

3-stage:
1. **Extraction** (`scripts/extract-metrics.mjs`): Streams JSONL conversation logs, outputs ~11KB JSON
2. **Analysis** (`scripts/run-self-improvement.sh`): Injects metrics into prompt template, sends to Claude Sonnet
3. **Surfacing**: Creates escalations per suggestion (type: `improvement`), saves analysis snapshot

Escalation type `improvement`: Lightbulb icon, amber-400. Options: Implement / Defer / Reject.

## Heartbeat Per-File Change Tracking

Uses `.heartbeat-knowledge-hashes` for per-file MD5 hashes. Format: `hash  filename` per line. Enables identifying NEW vs UPDATED files and extracting topic headings from changed files.
