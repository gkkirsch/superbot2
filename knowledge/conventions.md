# Conventions

## System File Sync

When modifying system files in `~/.superbot2/` (guides, templates, scripts), always sync changes to `~/dev/superbot2/`. The dev repo is the source of truth; the deployed copy is at `~/.superbot2/`.

Key mappings:
- `~/.superbot2/templates/orchestrator-system-prompt-override.md` ↔ `~/dev/superbot2/templates/orchestrator-system-prompt-override.md`
- `~/.claude/agents/space-worker.md` ↔ `~/dev/superbot2/agents/space-worker.md`
- `~/.superbot2/hooks/*.sh` ↔ `~/dev/superbot2/hooks/*.sh`
- `~/.superbot2/scripts/*.sh` ↔ `~/dev/superbot2/scripts/*.sh`
- Skills: `~/dev/superbot2/skills/` (source, workers edit directly)

**IMPORTANT: Always diff before syncing.** Never blindly copy. Workers may have made changes to the dev repo copy. Always compare, review differences, and merge carefully if both sides have changes.

## Plugin Structure

Claude Code plugins follow this structure:
```
plugin-name/
├── .claude-plugin/
│   └── plugin.json           # Manifest: name, version, description, author, keywords
├── commands/
│   └── command-name.md       # User-facing commands (YAML frontmatter + markdown)
├── skills/
│   └── skill-name/
│       ├── SKILL.md          # Skill definition (YAML frontmatter + markdown)
│       └── references/       # Supporting documentation
├── agents/                   # Optional: background agents
│   └── agent-name.md
├── hooks/                    # Optional: event hooks
│   └── hooks.json
└── templates/                # Optional: shell script templates
```

## Pack Tags
Use `pack:<name>` in plugin keywords to group into packs:
- `pack:developer` — Professional Designer, TS Monorepo, Agent Browser
- `pack:social-media` — Facebook Navigator, X.com
- `pack:productivity` — Gmail
- `pack:marketing` — Marketing
- `pack:deployment` — Cloudflare Deploy, Heroku Deploy

## Bash 3.2 Constraint
All shell scripts must remain bash 3.2 compatible (macOS default). No associative arrays, no bash 4+ features. Use `grep` + `awk` for hash lookups instead.
