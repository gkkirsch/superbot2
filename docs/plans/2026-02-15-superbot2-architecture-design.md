# Superbot v2 Architecture Design

## Problem Statement

Superbot v1 has a working orchestrator/worker pattern but suffers from:
- **Lack of initiative**: Only works when cron fires or user directs it
- **Communication gaps**: Workers can't ask questions mid-task, guess wrong or block entirely
- **Context gaps**: Orchestrator too thin to generate work, workers too isolated to see bigger picture
- **Project management gaps**: Flat task lists, no decomposition, weak dependency tracking, no progress visibility
- **Custom infrastructure**: Bash-orchestrated workers reimplements what Claude Code now provides natively

## Design Goals

1. **Proactiveness**: System identifies and generates work, not just executes explicit tasks
2. **Feedback loops**: Tiered escalation system - agents decide what they can, escalate what they can't
3. **Unblocking**: Nothing silently gets stuck. Blockers surface to the right level and resolution triggers work immediately
4. **Autonomy**: One cron trigger can result in hours of continuous work across spaces
5. **Native tooling**: Built on Claude Code agent teams, not custom bash orchestration

---

## Core Architecture

### Two-Tier Agent Hierarchy

```
ORCHESTRATOR (team lead, persistent session)
  │
  │ spawns as teammates (Claude Code agent teams)
  │
  ├── Space Lead: auth / jwt-refresh
  ├── Space Lead: auth / sso-support
  └── Space Lead: api / rate-limiting
        │
        │ spawns as subagents (Task tool, Explore type)
        │
        └── Research subagents (read-only codebase analysis)
```

- **Orchestrator** = persistent, always-on, portfolio manager + work generator
- **Space leads** = teammates, fresh each spawn, project manager + implementer for one initiative
- **Research agents** = Explore subagents, read-only, used by space leads for codebase analysis

Space leads do the work themselves. No separate worker tier. They plan, code, test, document, and update project state.

### Key Principles

- Intelligence flows up, context flows down
- Each tier decides what it can, escalates what it can't
- Files are memory, spawn briefings are attention
- Hooks enforce project management discipline
- The system learns from every resolved escalation

### What Changed from v1

| v1 | v2 |
|---|---|
| Custom bash orchestration | Claude Code native agent teams |
| Three tiers (orchestrator → worker) | Two tiers (orchestrator → space lead) |
| Workers fire-and-forget | Space leads do full project management |
| Decisions block until dashboard | Escalation system with tiered resolution |
| Timer-only proactivity | Self-generating work + escalation triggers |
| Flat task list | Initiatives with nested plans + tasks |
| No learning system | Knowledge distilled from every session |

---

## File Structure & State Management

```
~/.superbot2/
  config.json                          # Global config
  IDENTITY.md                          # Bot personality
  USER.md                              # User profile & preferences
  MEMORY.md                            # Global quick-reference index

  knowledge/                           # Global learned knowledge
    conventions.md                     # Cross-project conventions
    preferences.md                     # User workflow preferences
    decisions.md                       # Cross-project decisions

  escalations/                         # Unified escalation system
    draft/                             # Space leads write here
      esc-001.json
    pending/                           # Orchestrator promotes here (user-facing)
      esc-002.json
    resolved/                          # Moved here on resolution
      esc-001.json

  daily/                               # Daily notes (observer output)
    2026-02-15.md

  spaces/
    auth/
      space.json                       # Space metadata (name, status, codeDir)
      OVERVIEW.md                      # Space-level goals, what this project is

      knowledge/                       # Space-specific knowledge
        conventions.md                 # "JWT with RS256, always use Zod"
        decisions.md                   # Resolved decisions distilled
        patterns.md                    # "Endpoints follow this structure"

      plans/
        jwt-refresh/                   # One initiative
          plan.md                      # Goals, current state, what's next
          tasks/
            .highwatermark
            1.json
            2.json
        sso-support/                   # Another initiative
          plan.md
          tasks/
            1.json

    api/
      space.json
      OVERVIEW.md
      knowledge/
      plans/
        rate-limiting/
          plan.md
          tasks/
```

### State Ownership

- **Orchestrator reads**: everything (global view)
- **Orchestrator writes**: global knowledge/, escalations/ (review drafts, promote to pending), MEMORY.md, daily/
- **Space leads read**: their space's files + global knowledge/
- **Space leads write**: their initiative's plan.md + tasks/, space knowledge/, escalations/draft/

### Task Structure

```json
{
  "id": 1,
  "subject": "Implement refresh token endpoint",
  "description": "Create POST /auth/refresh that validates refresh token and returns new access token",
  "acceptanceCriteria": [
    "Endpoint returns new access token given valid refresh token",
    "Invalid refresh tokens return 401",
    "Tests cover happy path and error cases"
  ],
  "status": "pending",
  "priority": "high",
  "labels": ["implementation"],
  "blocks": [3],
  "blockedBy": [],
  "plan": "jwt-refresh",
  "createdAt": "2026-02-15T10:00:00Z",
  "updatedAt": "2026-02-15T10:00:00Z",
  "completedAt": null,
  "completionNotes": null
}
```

Key additions over v1: `acceptanceCriteria`, `completionNotes`, and `plan` linking.

### Two Task Systems

| System | Purpose | Lifecycle |
|---|---|---|
| **Agent team tasks** | Session coordination between orchestrator and teammates | Ephemeral, dies with team session |
| **Space initiative tasks** | Persistent project backlog with priorities and dependencies | Persistent on disk, survives across sessions |

Agent team tasks are the coordination glue. Space tasks are the real project management layer.

---

## Escalation System

### Escalation Types

| Type | Example | What user does |
|---|---|---|
| **Decision** | "Should we use Redis or Memcached?" | Picks an option |
| **Blocker** | "Need the staging API key" | Provides what's needed |
| **Question** | "Should login support SSO?" | Answers the question |
| **Approval** | "Plan ready - 7 tasks, proceed?" | Approves or redirects |

### Escalation Schema

```json
{
  "id": "esc-001",
  "type": "decision",
  "space": "auth",
  "initiative": "jwt-refresh",
  "question": "Should we use Redis or Memcached for token blacklisting?",
  "context": "Token refresh needs a blacklist mechanism. Redis is persistent and shared across instances. Memcached is simpler but volatile.",
  "suggestedAnswers": [
    { "label": "Redis", "description": "Persistent, shared across instances, handles restarts" },
    { "label": "Memcached", "description": "Simpler, faster, no persistence needed" }
  ],
  "escalatedBy": "auth-lead",
  "escalationPath": ["auth-lead"],
  "priority": "high",
  "blocksTask": "auth/plans/jwt-refresh/tasks/4.json",
  "blocksInitiative": false,
  "createdAt": "2026-02-15T03:00:00Z",
  "status": "draft",
  "resolution": null,
  "resolvedBy": null,
  "resolvedAt": null
}
```

### Escalation Lifecycle

```
Space lead hits something it can't decide
  → Writes to escalations/draft/
  → Continues working on other unblocked tasks

Orchestrator reviews draft:
  → Can resolve itself → resolves, notifies space lead
  → Can't resolve → moves to escalations/pending/

User sees it in morning briefing (dashboard or Slack)
  → Resolves in dashboard

All escalations cleared for initiative
  → Triggers orchestrator to spawn space lead
  → Space lead reads resolution, continues work
  → Resolution distilled into knowledge/decisions.md
```

### Decision-Making Framework (Tiered)

**Space lead decides (just do it + document):**
- Implementation details (naming, structure, patterns)
- Following established conventions in knowledge/
- Bug fixes with clear root cause
- Test strategy within existing patterns

**Escalate to orchestrator (draft escalation):**
- New dependencies or tools
- Patterns that contradict existing conventions
- Work that might affect other spaces
- Scope questions ("should this also handle X?")

**Escalate to user (orchestrator promotes to pending):**
- Direction changes
- New initiatives / major scope expansion
- Tradeoffs with no clear winner
- Anything requiring access/credentials/accounts

### Morning Briefing Format

```
DECISIONS (2)
  [auth / jwt-refresh] Redis or Memcached for token blacklisting?
    Suggested: Redis (persistent, shared across instances)
    Blocks: task #4 "Implement token blacklist"

  [api / rate-limiting] Per-user or per-IP rate limiting?
    Suggested: Per-user (matches auth patterns)
    Blocks: task #2 "Add rate limit middleware"

BLOCKERS (1)
  [auth / sso-support] Need OAuth client credentials for Google
    Blocks: entire initiative

QUESTIONS (1)
  [api / user-endpoints] Should admin users bypass rate limiting?
    Blocks: task #5 "Add admin role handling"

APPROVALS (1)
  [auth / jwt-refresh] Plan complete - 7 tasks, ready to start?
    View plan details
```

---

## Knowledge & Learning System

### Three Sources of Knowledge

| Source | What it captures | Who writes it |
|---|---|---|
| Resolved escalations | "We chose Redis because..." | Space lead distills after resolution |
| Work patterns | "All endpoints use {data, error} envelope" | Space lead discovers during implementation |
| User preferences | "User prefers minimal logging" | Orchestrator learns from interactions |

### Two Levels of Storage

**Global** (`~/.superbot2/knowledge/`):
- `conventions.md` - applies everywhere ("always TypeScript, Zod for validation")
- `preferences.md` - how the user likes to work
- `decisions.md` - cross-project decisions

**Space-level** (`~/.superbot2/spaces/{slug}/knowledge/`):
- `conventions.md` - project-specific patterns
- `decisions.md` - resolved decisions for this project
- `patterns.md` - code patterns discovered

### How Knowledge Prevents Re-asking

Space leads always check knowledge/ before creating an escalation. If the answer is already there, no escalation needed.

### Knowledge Lifecycle

```
Something learned (decision resolved, pattern discovered)
  → Space lead writes to space knowledge/ (enforced by TeammateIdle hook)
  → Orchestrator reviews: is this global?
    → Yes → promotes to global knowledge/
    → No → stays at space level
```

---

## Orchestrator Behavior

The orchestrator's job: **generate work, assign work, review work.**

### Each Cycle

```
1. ORIENT
   - Read global state (MEMORY, knowledge/, escalations/)
   - Scan all spaces: space.json, OVERVIEW.md
   - For each space, scan initiatives: plan.md summary + task counts
   - Build portfolio view

2. CHECK TRIGGERS
   - Any escalations just resolved? → spawn space lead to continue
   - Any initiatives fully unblocked? → spawn space lead
   - Scheduled jobs due? → handle or spawn

3. GENERATE WORK (the proactivity engine)
   - Space has no active initiative but OVERVIEW lists goals → create initiative
   - Initiative has stale tasks (pending > N days) → escalate or reprioritize
   - Space knowledge is thin → flag for documentation pass
   - Cross-space conflict detected → escalate
   - Tests failing in a space → create fix initiative

4. ASSIGN WORK
   - Spawn space leads as teammates for highest priority work
   - Write targeted spawn briefing (see below)

5. MONITOR
   - Process teammate messages as they come in
   - Review draft escalations (resolve or promote to pending/)
   - When space lead finishes → check if more work in that space
   - Self-trigger: go back to step 2
```

### Spawn Briefing

The orchestrator's main output. Gives a fresh space lead everything it needs:

```
Auth space, jwt-refresh initiative. 3/5 tasks done.
Decision resolved: use Redis for token blacklisting.
Task #4 (implement blacklist) is now unblocked.
Focus on tasks #4 and #5.
Global convention: always use Zod for validation.
Space convention: all endpoints return {data, error} envelope.
```

### Self-Triggering Loop

One cron trigger can result in hours of continuous work:

```
Spawn space lead for auth/jwt-refresh
  → auth-lead finishes, reports back
  → Orchestrator reviews results
  → auth/jwt-refresh has more tasks → spawn again
  → OR api/rate-limiting is higher priority → spawn there
  → OR nothing unblocked → idle until next trigger
```

---

## Space Lead Behavior

### Boot Sequence (orient fast)

```
1. READ BRIEFING from orchestrator's spawn prompt
2. LOAD CONTEXT
   - space.json + OVERVIEW.md
   - plans/{initiative}/plan.md
   - plans/{initiative}/tasks/
   - knowledge/ (space + global)
   - Resolved escalations for this initiative
3. ORIENT: Is plan still valid? Anything changed?
4. WORK
```

### Working Patterns

| Situation | What the space lead does |
|---|---|
| New initiative, no plan | Explore codebase (subagents), write plan.md, break into tasks |
| Plan exists, tasks pending | Pick highest priority unblocked task, execute |
| Task requires research | Spawn Explore subagent, read results, proceed |
| Discovers unplanned work | Create new task, link to initiative, continue current work |
| Hits a decision it can make | Make it, document in knowledge/decisions.md |
| Hits a decision it can't | Write draft escalation, move to next unblocked task |
| All tasks blocked | Create escalations for all blockers, report to orchestrator, go idle |
| All tasks done | Update plan.md as complete, report to orchestrator, go idle |

### Key Behavior: Don't Stop on Blockers

Space leads escalate blockers and move to the next unblocked task. They only go idle when there's genuinely nothing left to do.

### Reporting Back to Orchestrator

Via SendMessage when going idle:

```
Summary: Completed tasks #4, #5. Created 2 new tasks (#8, #9) for error handling.
Updated knowledge: "All endpoints return {data, error} envelope"
Draft escalation: need user input on SSO provider choice
Plan status: 5/7 tasks complete, 2 new tasks added
```

---

## Hooks & Enforcement

### TeammateIdle Hook (space lead checklist before stopping)

Exit 2 = keep working. Exit 0 = allow idle.

Checks:
1. Did you update task statuses on disk?
2. Did you create follow-up tasks for discovered work?
3. Did you update plan.md with current state?
4. Did you distill learnings to knowledge/?
5. Did you report results back to orchestrator?
6. Did you create escalations for blockers?

### TaskCompleted Hook

Exit 2 = reject completion. Exit 0 = allow.

Checks:
1. Does the task have completionNotes?
2. Are acceptance criteria addressed?

### Orchestrator Pre-Shutdown Hook

Exit 2 = block shutdown. Exit 0 = allow.

Checks:
1. Any unreviewed draft escalations? → review them first
2. Any orphaned in_progress tasks? → update status
3. Any unprocessed teammate results? → review them

---

## Triggers & Scheduling

### Three Trigger Types

**Scheduled (cron):**
- Every N minutes → heartbeat script
- Clean stale sessions, run observer, triage for unblocked work
- Morning briefing generation (once daily)
- Fingerprint-based dedup: skip if nothing changed since last trigger

**Self-triggered (orchestrator loop):**
- Space lead finishes → orchestrator checks for more work
- Continuous until nothing is unblocked

**Escalations cleared:**
- User resolves escalations → dashboard detects all clear for initiative
- Writes trigger → orchestrator spawns space lead

### Fingerprint Dedup

```bash
FINGERPRINT=$(cat \
  ~/.superbot2/escalations/pending/*.json \
  ~/.superbot2/spaces/*/plans/*/tasks/*.json \
  2>/dev/null | md5)

if [[ "$FINGERPRINT" == "$LAST_FINGERPRINT" ]]; then
  exit 0  # Nothing changed, skip
fi
```

---

## Scope

### In Scope for v2

| Component | Description |
|---|---|
| Orchestrator prompt | System instructions for team lead behavior |
| Space lead prompt | Template with initiative-aware boot sequence |
| File structure | Full ~/.superbot2/ layout |
| Escalation system | draft → pending → resolved lifecycle |
| Knowledge system | Global + space-level learning |
| Initiative/plan structure | plans/ with nested tasks/ |
| Hooks | TeammateIdle, TaskCompleted, pre-shutdown |
| Heartbeat script | Cron trigger with fingerprint dedup |
| Spawn briefing generation | Orchestrator writes targeted context |
| Dashboard API | Serve escalations, portfolio view, resolve endpoint |

### Deferred

| Item | Why |
|---|---|
| Slack integration | Get core loop working first |
| Dashboard UI | API first, build UI after |
| Daily observer | Nice to have, not critical path |
| Scheduler (cron jobs) | Focus on core work loop first |
| Metrics/analytics | Instrument after patterns stabilize |
| Multiple concurrent space leads | Start with one at a time, scale up |

### Reused from v1

- File-based state pattern
- Heartbeat fingerprinting concept
- Space/codeDir mapping
- Config.json structure (adapted)
- Dashboard Express server pattern (adapted)

---

## Open Questions

1. **Prompt delivery mechanism**: How to inject space lead behavioral instructions when using agent teams (not claude -p). Options: CLAUDE.md, .claude/agents/ definitions, hooks, spawn prompt, or combination.
2. **Concurrent space leads**: Start with one at a time or support multiple from the start?
3. **Dashboard tech**: Keep Express + React or simplify?
4. **Config migration**: How to migrate v1 configs to v2 structure?
