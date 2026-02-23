# Decisions

Architectural decisions that explain why superbot2 is built the way it is.

## Space-worker custom agent definition

Workers spawn with `subagent_type: "space-worker"` instead of `"general-purpose"`.

- Custom agents defined in `~/.claude/agents/*.md` receive ONLY the agent body as system prompt — not the full default Claude Code system prompt
- Eliminates ~3,000 tokens of irrelevant default prompt per worker (browser automation, plan mode, PR creation, memory management)
- `permissionMode: bypassPermissions` in frontmatter for autonomous operation
- Dev repo copy at `agents/space-worker.md`, installed to `~/.claude/agents/space-worker.md` via setup.sh
- The `mode: "bypassPermissions"` parameter must ALSO be passed on every Task tool call — child agents do not inherit `permissionMode` from the agent definition

## Runtime vs. dev repo separation

Two locations, both must stay in sync:

| Location | Purpose |
|----------|---------|
| `~/.superbot2/` | Runtime — what actually runs, user-specific data |
| `~/.superbot2-app/` | Code — installed from dev repo, generic/reusable content only |

Install location for the code is `~/.superbot2-app/` (sibling to `~/.superbot2/` runtime). Clean separation: runtime data never goes in the code repo.

What belongs in the dev repo: templates, scripts, skills, agents, generic knowledge (conventions, escalation patterns, architectural decisions).

What stays runtime-only: escalations, sessions, todos, space data, config, IDENTITY/USER/MEMORY files, personal credentials.

## Dev-workflow approach

Verification, git status reporting, and commit steps are baked into existing skills (`superbot-implementation`, `verification-before-completion`) rather than standalone skills or orchestrator-level automation.

- Git status is reported in worker completion messages
- No separate dev-workflow skill needed — the behavior lives where the work happens
