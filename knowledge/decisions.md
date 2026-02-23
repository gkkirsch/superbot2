# Decisions

## 2026-02-23

### Auto-triage rules system (2026-02-23)

User wants gradual, user-controlled orchestrator autonomy. Start conservative (everything escalates), build up auto-approval rules over time.

**Design**:
- Escalations get a new `suggestedAutoRule` field (optional, worker-proposed): plain English rule that would auto-resolve this type of question in the future
- Single rules file: `~/.superbot2/auto-triage-rules.md` — accumulates user-approved rules
- Dashboard shows `suggestedAutoRule` with "Add to auto-rules" button per escalation
- Orchestrator reads `auto-triage-rules.md` before triaging — if a rule matches → auto-resolve, otherwise → needs_human
- Start at 0 rules. User explicitly approves each pattern.

**Current policy (before this is built)**: Orchestrator should NOT auto-resolve escalations based on judgment or inference. Always promote to needs_human unless the answer is explicitly in knowledge files or came directly from a worker report.

Project created: meta/auto-triage-rules

### TaskOutput blocking bug — FIXED (2026-02-23)

**Root cause**: Space workers have `permissionMode: bypassPermissions` in their agent definition, but child subagents spawned via the Task tool do NOT inherit this. The Task tool's `mode` parameter must be set explicitly on every spawn. Without it, child agents use default permissions → permission prompt appears → user dismisses → TaskOutput fails → worker stuck.

**Fix**: Always pass `mode: "bypassPermissions"` on every Task tool call:
```
Task tool:
  subagent_type: "space-worker"  # or "code-reviewer", "Explore", etc.
  mode: "bypassPermissions"       # ← REQUIRED every time
  ...
```

**Files updated**: `~/.claude/agents/space-worker.md`, `~/.claude/skills/superbot-implementation/SKILL.md`, both orchestrator templates. Committed at 775f3c4.

**Also fixed**: `subagent_type: "superpowers:code-reviewer"` → `"code-reviewer"` (correct built-in type name).

### Stale worker detection and cleanup

The team config (`~/.claude/teams/superbot2/config.json`) does NOT reliably reflect actual running processes. Workers that finish or crash may not remove themselves. The real source of truth is the process list.

**How to check for stale workers (run at every heartbeat and before spawning new workers):**
```bash
ps aux | grep "claude" | grep "agent-id" | grep -v grep | awk '{for(i=1;i<=NF;i++) if($i=="--agent-id") print $(i+1)}' | sort
```

**What counts as stale:**
- Worker whose project is 100% done (check portfolio-status.sh)
- Worker with a `-2` or later suffix when the original is still running
- Worker named `*-planner` after the plan was created and tasks exist
- `domain-buyer`, `domain-buyer-2` or any worker not recognized from the current cycle
- Any worker running for 60+ minutes without a completion message

**Cleanup process:**
1. Run the ps command above to get the real active worker list
2. Run portfolio-status.sh to see which projects are done
3. For each worker whose project is done or is orphaned → `SendMessage shutdown_request`
4. Do NOT rely on team config alone — always cross-check with ps

**Orchestrator rule:** At every heartbeat, run both `ps aux | grep agent-id` and `portfolio-status.sh`. Shut down any worker whose project is 100% done. Never let workers linger past project completion.

**Long-running worker check-ins:** If a worker has been running 30+ minutes without sending a completion or status message, send a check-in message. At 60 minutes, stronger nudge. At 90 minutes, consider killing and re-spawning. Silence ≠ progress.

**Dashboard note:** The `/api/workers` endpoint reads team config — it will miss stale processes not in config. The ps-based check is the authoritative source for cleanup decisions.

### Social media: post approvals go through escalations (not chat)

All social media content requiring approval must be submitted as an `approval` escalation — not reported in a chat message to the orchestrator. The user reviews and resolves approvals in the dashboard escalations panel.

**Escalation subject format (with platform icon):**
- Facebook: `📘 Facebook — [brief description, e.g. "8 reply drafts for Professional Hosts group"]`
- X (Twitter): `🐦 X — [brief description, e.g. "12 reply drafts for Claude Code community"]`
- Instagram: `📸 Instagram — [brief description, e.g. "6 comment drafts for AI/tech accounts"]`

**How workers create a post approval escalation:**
```bash
bash ~/.superbot2/scripts/create-escalation.sh approval <space> <project> \
  "📘 Facebook — 8 reply drafts for Professional Hosts group" \
  --context "$(cat drafts-summary.md)" \
  --option "Approve all|Post all approved drafts with rate-limited timing" \
  --option "Review individually|I will mark approved: true/false in the drafts file" \
  --option "Reject — redraft|These drafts need rework before posting" \
  --priority high
```

**Context field must include:**
- Each draft numbered, with: target @handle, post excerpt (first 100 chars), proposed reply text
- Platform, group/account name, date scouted

**Orchestrator rule:** Do NOT re-surface post approval escalations as chat messages. Let the user find them in the dashboard. Only message the user if an approval has been sitting unresolved for 24+ hours.

### Social media: only engage RECENT posts (universal rule)
- **Always check the post date before engaging — skip anything older than 7 days**
- Ideally target posts from the last 24-48 hours (active conversations)
- Old posts (weeks, months, years) make engagement look like bot spam
- Facebook group feeds mix old and new — always check timestamps explicitly
- Sort by "Recent" not "Top/Hot" when browsing group feeds
- This applies to ALL platforms: Facebook (comments), X (replies), Instagram (comments)
- A previous Facebook session commented on posts from 2021 — this is the exact behavior to prevent

### Social media: never engage the same post twice (universal rule)
- **Before every comment, reply, or like — check the engagement log first**
- If the post ID/URL already exists in the log → SKIP, move to next post
- After engaging → immediately write post ID/URL to the log
- The log is a BLOCKLIST, not just a history — query it before every action
- This applies to ALL platforms: Facebook (comments), X (replies), Instagram (comments)
- Each space maintains its own engagement log — workers must read it at session start
- Duplicate engagement = account safety risk + looks like a bot

### Facebook account: comment as Kirschbaum Paige Garrett (not Tami Browning)
- Chrome is signed in as **Tami Browning** (account owner) — this is correct and expected
- The **commenting profile** must be switched to **Kirschbaum Paige Garrett**
- Facebook has TWO levels of profile: main account (top-right menu) AND group-level commenting profile
- At session start: click "Your profile" → verify "Kirschbaum Paige Garrett" → if Tami Browning, switch and RELOAD
- After reload, confirm group comment boxes show "Comment as Paige Garrett" not "Comment as Tami Browning"
- After ~6-8 comments, Facebook shows "Switch profiles to interact" modal — dismiss immediately and recheck commenting profile
- Hard session limit: ~6-8 comments before profile switching becomes persistent — plan short sessions
- This applies to ALL hostreply facebook-gtm workers, every session, without exception

### Chrome automation: one worker at a time
- Only ONE browser automation worker may use port 9222 (user's Chrome) at a time
- Multiple concurrent Chrome workers override each other and break all sessions
- Orchestrator must queue Chrome-dependent workers sequentially: spawn next only after current completes
- Projects that use Chrome: facebook-gtm, instagram-growth, x-authority/x-growth (any social media automation)
- Projects that do NOT need Chrome: hostaway-integration, dashboard-config, any codebase work
- When multiple Chrome workers are ready, prioritize by: Facebook GTM > Instagram > X authority

## 2026-02-17

### Scope boundary: supercharge vs meta
- **supercharge/platform-evolution** owns all website/UI changes (pack pages, creation tools, onboarding UX)
- **meta/skills-starter-pack** owns plugin content only (creating and publishing skills)
- Phase 4 pack UI from skills-starter-pack moved to platform-evolution

### kidsvids: video-search cancelled
- User explicitly cancelled the video-search feature: "I don't want the search feature anymore. remove it."
- No video titles, no search filtering

### kidsvids: design deferred
- User: "the website looks like shit. I will be adding a plugin for professional design later and then we can redesign."
- No design work until user adds professional design plugin

### supercharge: homepage approach
- Hybrid layout: packs prominently featured, plugins still browsable
- Not a full pack-first redesign, not a separate page

### supercharge: skill creation tooling
- In-browser AI chat that creates skills (medium complexity)
- Not a template wizard, not a full IDE

### meta: starter pack scope
- All three core skills (Professional Designer, TS Monorepo, Agent Browser)
- Plus additional skills: Facebook Navigator, Gmail, X.com, marketing
- Each group should be a pack on the supercharge website

## 2026-02-18

### supercharge: custom marketplaces
- Users with accounts can create their own marketplace and select plugins for it
- Minimal customization: name + description + plugin list only
- Shareable link only, no public directory
- New Marketplace model separate from Packs (Marketplace + MarketplacePlugin join table)
- Any published plugin can be added (full catalog access)
- Multiple marketplaces per user
- Simple form + checkbox catalog builder UX at /dashboard/marketplace

### supercharge: agent-friendly APIs
- User wants platform APIs to be agent-friendly: upload plugins, create users, create custom marketplaces, add plugins — all via well-documented APIs
- "Good APIs with good documentation. Agent friendly."
- This is a cross-cutting requirement for the supercharge platform

### meta: additional skill packs
- Substantial expansion of all 4 plugins (Facebook Navigator, Gmail, X.com, Marketing) — deep-dive, multiple commands, rich references, hooks, agents
- Keep current 3-pack split: Social Media (FB + X.com), Productivity (Gmail), Marketing (Marketing)
- Publish to production superchargeclaudecode.com
- Pack-install skill in superbot2 may no longer be needed (user uncertain about its value)

### meta: dev-workflow approach
- Bake verification, git status reporting, and commit steps into existing skills (superbot-implementation, verification-before-completion)
- Git status reported in worker completion messages
- Not new standalone skills, not orchestrator-level automation

### meta: packaging install location
- Install location: ~/.superbot2-app/ (sibling to ~/.superbot2/ runtime)
- Clean separation: ~/.superbot2/ is runtime data, ~/.superbot2-app/ is code
- Curl-able install.sh, shell alias, build during setup, update subcommand — all like original superbot

### kidsvids: redesign decisions
- Design direction: Clean & Modern with Color Pops (Apple-like simplicity, large thumbnails, whitespace, category colors)
- Video titles: Fetch via YouTube oEmbed API
- Category icons: Emoji picker
- Target device: Both desktop and tablet equally (fully responsive)
- Auto-play: Yes, auto-advance to next video
- Animations: Moderate (page transitions, card hovers, smooth loading)
- Admin scope: Full admin redesign too

### supercharge: marketplace MCP strategy
- taylorwilsdon/google_workspace_mcp chosen for Google Suite (1,400 stars, 136 tools, 12 services)
- User prefers CLI/skill approach over MCP server if possible
- Platform already supports MCP servers via .mcp.json in plugins natively

### supercharge: superbot2 platform account
- superbot2 account created on production: superbot2@superchargeclaudecode.com
- Used for programmatic plugin publishing via the agent-friendly APIs
- 4 plugins published (facebook-navigator, x-navigator, gmail, marketing) — status: PENDING_REVIEW, need admin approval
- This account can be reused for supercharge/plugin-publishing project tasks

## 2026-02-20

### kidsvids: category redesign complete (7/7)
- Removed all emojis, replaced with AI-generated flat/geometric images via nano-banana-pro
- DB: dropped emoji column, added image_url TEXT column
- Image gen endpoint: POST /api/categories/:id/generate-image
- Logo: generated with nano-banana-pro, black background, used in header + splash + login
- Dark mode: global via class="dark" on html element
- Full-bleed image cards with gradient overlay on home page

### kidsvids: deployed to Heroku
- Live URL: https://kidsvids-ab1387227172.herokuapp.com/
- Heroku app: kidsvids (Eco dyno, $5/mo)
- Database: Heroku Postgres Essential-0 ($5/mo)
- Image storage: Cloudinary (free starter)
- Image gen: Gemini API called directly from Node.js, GEMINI_API_KEY in Heroku config vars
- Sessions: connect-pg-simple (Postgres-backed)
- Deploy: git push heroku main
- Cost: ~$10/mo total

### kidsvids: deployment platform decision
- User initially wanted Cloudflare, switched to Heroku after learning serverless migration scope
- Heroku chosen for zero code changes, familiar platform, existing account

### kidsvids: onboarding complete (8/8)
- Full parent account system: email+password signup, separate 4-digit PIN for child-lock
- No email verification (email is just an identifier)
- Fresh start migration: wiped old PIN-only admin_settings
- Multi-page signup flow: Welcome → Signup → PIN Setup → Dashboard (not a wizard, separate full pages)
- Segmented 4-box PIN input with auto-advance, backspace nav, paste support
- PIN-first login with "Use email instead" fallback
- Pre-seeded "Kids Favorites" category with 10 hardcoded YouTube videos on account creation
- Existing sessions need cleanup on deploy (auth model changed)

## 2026-02-21

### hostreply: fully autonomous Facebook GTM
- User: "I don't want to commit any time, I want you to use the superbot browser and do it yourself."
- Full AI autonomy for Facebook group engagement — commenting, posting, DMing
- Uses superbot-browser skill (Chrome CDP on port 9222) with user's authenticated session
- AI drafts AND posts all content, no human review step
- Deploy blog posts first (`git push origin master`), then start engagement
- Start with top 3 groups by size, expand to all 5 once pattern established
- Compressed 1-week ramp: value-first commenting for a few days, then DMs to hosts posting about messaging pain
- Demo video: DM-only initially, share in groups only when replying to relevant threads
- This is a daily recurring task — superbot2 should run FB engagement every cycle

### consulting: deployed to Cloudflare Pages
- Live URL: https://garrett-consulting.pages.dev
- Cloudflare account: ibekidkirsch@gmail.com
- Deploy command: `cd /Users/gkkirsch/.superbot2/spaces/consulting/app && npx wrangler pages deploy . --project-name=garrett-consulting`
- Static site: index.html + favicon.svg + og-image.png
- Auth via Google OAuth through Chrome CDP — no manual tokens needed

### meta: custom space-worker agent definition
- Created `~/.claude/agents/space-worker.md` — custom agent definition for space workers
- Workers now spawn with `subagent_type: "space-worker"` instead of `"general-purpose"`
- Custom agents receive ONLY the agent body as system prompt (no default Claude Code system prompt)
- Eliminates ~3,000 tokens of irrelevant default prompt per worker (browser automation, plan mode, PR creation, memory management)
- Keeps essential instructions: tool usage, git safety, code quality, team communication
- `permissionMode: bypassPermissions` in frontmatter for autonomous operation
- Dev repo copy at `~/dev/superbot2/agents/space-worker.md`, installed via setup.sh

## 2026-02-22

### skill-creator: user decisions (all 7 resolved)
- **Location**: New dedicated page at /skill-creator (not a dashboard section)
- **Scope**: Full plugins (plugin.json + all components — skills, commands, agents, hooks, MCP servers)
- **Save destination**: ~/.superbot2/skills/ (local first, upload to marketplace separately — user changed from gkkirsch-claude-plugins)
- **Backend approach**: Claude CLI subprocess (claude -p) — NOT Agent SDK. Simpler architecture.
- **Tools**: No custom MCP tools needed — claude -p has native file read/write
- **Validation**: Structure validation + dry-run invocation (load into Claude Code and test)
- **Knowledge**: Layered — essential rules in system prompt, detailed spec in reference file

### supercharge: admin password reset endpoint
- Added POST /auth/reset-password — admin-only, no email needed
- Protected by X-Admin-Secret header (checked against ADMIN_SECRET env var)
- superbot2 account password reset to "superbot2"
- Deployed to Heroku v73

### supercharge: agent-friendly API docs page
- New project: supercharge/agent-docs
- 49 total API endpoints found across 10 route files, 38 were undocumented
- Building GET /api/agent-docs endpoint (returns structured markdown) + frontend page
- Worker actively implementing

### skill-creator: new space created
- Dedicated space for AI-assisted skill/plugin creation
- Dashboard chat interface with claude -p backend
- File upload support, testing, validation
- Saves to plugin format for marketplace publishing

