# Key Decisions

## Skills & Marketplace (2026-02-17)
- Skills cloned from superchargeclaudecode.com marketplace at install time (not bundled)
- Skills namespaced as plugins (`.claude-plugin/plugin.json`)
- Starter pack IS the marketplace's featured content — publish first, then bundle as packs
- Plugin keywords/tags (e.g., `pack:developer`) group plugins into packs
- Pack-install skill may not be needed (user uncertain about value)

## Dev Workflow (2026-02-18)
- Workers verify (build/test) before claiming completion
- Workers commit after each task: `[space/project] description`
- Workers report `git status` and `git diff --stat` in completion messages
- Next-step suggestions documented in plan.md and completion message only (not escalations)
- Escalations reserved for blockers, decisions, scope questions

## Dashboard (2026-02-19)
- Orchestrator-resolved section below needs_human escalations in left column
- Override replaces resolution in-place (resolvedBy changes to "user")
- Cards compact by default, expandable for full context
- Override triggers heartbeat for orchestrator pickup

## Self-Improvement System (2026-02-19)
- Trigger: Weekly (Sunday 8pm) + on-demand (dashboard button + API)
- Engine: extract-metrics.mjs streams JSONL logs → compact metrics, then Claude Sonnet analyzes
- Suggestions: Review-only, surfaced as `improvement` escalations
- History saved as timestamped JSON snapshots in `~/.superbot2/analysis-history/`

## Packaging (2026-02-19)
- Install to ~/.superbot2-app/ (code), ~/.superbot2/ (runtime data)
- Curl-able install.sh, shell alias, build during setup, update subcommand

## Supercharge Platform
- Single marketplace with categories (not multiple separate ones)
- Custom marketplaces: users create own marketplace, select plugins, shareable link
- Agent-friendly APIs: well-documented, upload plugins, create users, create marketplaces
- Google Workspace: taylorwilsdon/google_workspace_mcp (1,400 stars, 136 tools)

## Backlog (user wants eventually)
1. Better memory system — daily summaries, improved persistence across cycles
2. Heartbeat audit — ensure heartbeat is exactly right, not noisy, actionable
3. User memory — USER.md profile, preferences, communication style
4. Identity — superbot2's identity/personality definition
5. Natural language hooks — write hooks in plain English, better enforcement of worker behaviors
