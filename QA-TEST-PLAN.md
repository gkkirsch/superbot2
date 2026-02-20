# Superbot v2 QA Test Plan

**Status**: In progress (tests 1-3 verified, 4+ require manual testing)

## Test Execution Environment

- Reset with: `bash ~/dev/superbot2/scripts/setup.sh`
- Launch orchestrator with: `bash ~/dev/superbot2/scripts/superbot2.sh`
- All tests run in interactive Claude Code sessions

---

## ✅ VERIFIED TESTS (Completed in prior sessions)

### Test 1: Boot Sequence
- **What**: Orchestrator reads guide, boots, reads files
- **How**: Launch, watch output
- **Expected**: Reads ORCHESTRATOR_GUIDE.md → reads knowledge/ → reads space.json → lists projects/escalations
- **Status**: ✅ PASSING

### Test 2: Portfolio Building
- **What**: Orchestrator builds a mental model of all spaces + projects + escalations
- **Expected**: Presents a summary view with decision count, pending escalations, project counts
- **Status**: ✅ PASSING (should not read codeDir or OVERVIEW.md)

### Test 3: Escalation Workflow (End-to-End)
- **What**: Space worker creates draft escalation → orchestrator reviews → user resolves → orchestrator finds resolution → spawns worker with resolution in briefing → worker implements
- **How**:
  1. Create auth/add-validation project with 3 tasks: (1) error format, (2) input validation, (3) rate limiting
  2. Orchestrator spawns auth/add-validation space worker
  3. Space worker completes (1) and (2), creates draft escalation for (3)
  4. Orchestrator reviews escalation, promotes to pending
  5. Simulate user resolution: `echo '{ "decision": "per-IP in-memory rate-limit" }' > ~/.superbot2/escalations/pending/esc-*.json`
  6. Orchestrator finds resolution, writes decision to global knowledge
  7. Orchestrator spawns new worker with resolution in briefing
  8. Worker implements rate limiting based on the decision
- **Expected**: All 10 tests pass, rate limiting code in codebase
- **Status**: ✅ PASSING

---

## ⏳ PENDING MANUAL TESTS (Test these yourself)

### Test 4: Space Worker Invokes Skills ⭐ **CRITICAL**
- **What**: When spawning a space worker for a new project with no plan.md, does it invoke `superbot-brainstorming` to create one?
- **How**:
  1. Reset: `bash ~/dev/superbot2/scripts/setup.sh`
  2. Launch orchestrator: `bash ~/dev/superbot2/scripts/superbot2.sh`
  3. Orchestrator should see empty `general` space with no projects
  4. It should prompt you: "No projects in general space. Would you like me to create one?"
  5. You say: "Create a project called 'homepage' for redesigning the landing page"
  6. Orchestrator spawns `general/homepage` space worker
  7. Worker reads guide, reads space files, sees no plan.md
  8. **Expected**: Worker invokes `superbot-brainstorming` skill before writing plan.md
  9. Watch for skill invocation in the session
- **How to verify**:
  - Look for `Skill(skill: "superbot-brainstorming")` in the session output
  - Or check `~/.claude/projects/<session-id>.jsonl` for Skill tool invocations
- **Passes if**: Worker creates a detailed project plan with acceptance criteria and task breakdown

### Test 5: Multi-Task Project (Research Required)
- **What**: Space worker spawns research subagents (Task tool with Explore type) when analyzing codebase
- **How**:
  1. Existing auth project, create new project: `auth/sdk-client`
  2. Project goal: "Add TypeScript SDK for auth API"
  3. Worker needs to understand existing API structure before planning
  4. **Expected**: Worker calls Task tool with `subagent_type: "Explore"` to analyze codebase
  5. Explore agent returns architecture findings
  6. Worker uses findings to plan SDK project
- **Passes if**: Plan references existing API patterns discovered by Explore agent

### Test 6: Project Progress Visibility
- **What**: Orchestrator tracks and displays project progress in morning briefing
- **How**:
  1. Auth project should have 3 tasks: error-format (completed), input-validation (completed), rate-limiting (completed)
  2. Launch orchestrator
  3. **Expected**: Orchestrator shows "auth/add-validation: 3/3 tasks complete (100%)"
  4. Should also list next available project or ask user for direction
- **Passes if**: Progress summary is accurate and guides user/orchestrator on what to do next

### Test 7: Knowledge Prevents Re-asking
- **What**: When user already answered a question in past, don't ask again
- **How**:
  1. Previous sessions: User resolved "use Redis for caching?" → decision: Redis
  2. New project: `api/cache-layer` needs caching decision
  3. **Expected**: Worker reads knowledge/decisions.md, sees Redis preference, implements without asking
  4. **Not expected**: Worker creates escalation for the same caching question
- **Passes if**: No redundant escalation, code uses Redis

### Test 8: Self-Generating Work (Proactivity)
- **What**: Orchestrator doesn't just execute tasks, it generates its own work
- **How**:
  1. Reset to empty state
  2. Launch orchestrator
  3. **Expected**: Orchestrator analyzes portfolio, identifies gaps or missing documentation
  4. Examples: "We haven't documented error handling patterns yet. Should I create an RFC for that?"
  5. Or: "Knowledge base is thin. Should I document the auth architecture?"
  6. Waits for user approval, then spawns self-directed project
- **Note**: This is speculative - may require hardcoding examples
- **Passes if**: Orchestrator suggests work beyond explicit tasks

### Test 9: Concurrent Projects (Team Scaling)
- **What**: Orchestrator spawns multiple space workers concurrently for different projects
- **How**:
  1. Multiple spaces with pending projects:
     - auth/add-2fa
     - api/cache-layer
     - docs/migration-guide
  2. Launch orchestrator
  3. **Expected**: Orchestrator spawns 3 teammates in parallel to work on all three
  4. All work in parallel (Claude Code agent teams supports this)
  5. Each completes independently
- **Passes if**: All 3 projects show progress updates in final summary

### Test 10: TeammateIdle Hook (Project Cleanup)
- **What**: Before space worker goes idle, it runs cleanup: update plan.md, create follow-ups, distill knowledge
- **How**:
  1. Space worker completes primary tasks for a project
  2. **Expected**: Hook fires, worker:
     - Updates plan.md with status
     - Creates follow-up tasks (if any)
     - Writes patterns/lessons to knowledge/
     - Reports final status
- **Passes if**: plan.md, knowledge/, and tasks/ are all up-to-date after worker finishes

### Test 11: SessionEnd Hook (Final Report)
- **What**: Orchestrator session end hook generates final summary
- **How**:
  1. Orchestrator completes a work cycle
  2. Manually exit the session (Ctrl+C)
  3. **Expected**: Hook fires, orchestrator:
     - Writes final summary to MEMORY.md
     - Archives resolved escalations
     - Prepares briefing for next session
- **Passes if**: MEMORY.md updated with session results, escalations archived

### Test 12: Daily Notes Observer
- **What**: Observer agent summarizes session into daily notes
- **How**:
  1. Run full work cycle: orchestrator → multiple space workers → projects complete
  2. Manually trigger observer: `bash ~/dev/superbot2/scripts/observer.sh`
  3. **Expected**: Observer reads session transcripts, extracts key events, appends to `daily/2026-02-16.md`
  4. Format: `- ~HH:MMam/pm Brief description`
  5. Examples: "Fixed auth validation bug", "Escalated rate-limit decision"
- **Passes if**: Daily notes capture project outcomes

### Test 13: Escalation Review by Orchestrator
- **What**: Orchestrator systematically reviews draft escalations from space workers
- **How**:
  1. Space worker creates draft escalation
  2. Multiple drafts accumulate: esc-auth-jwt.json, esc-api-cache.json, esc-docs-migration.json
  3. Orchestrator boot sequence reads all draft escalations
  4. **Expected**: Orchestrator:
     - Reviews each one for clarity and decision quality
     - Promotes high-quality ones to pending/ (user-facing)
     - Sends low-quality ones back to space with feedback
- **Passes if**: Escalations move to pending/ with clear reasoning

### Test 14: Escalation Triage (Priority)
- **What**: High-priority escalations surface to user immediately, low-priority ones batch together
- **How**:
  1. Multiple escalations in pending/: one marked "high", others "low"
  2. Orchestrator presentation order
  3. **Expected**: High-priority shown first, low-priority grouped
  4. Morning briefing emphasizes blockers over nice-to-haves
- **Passes if**: Priority-ordered presentation

### Test 15: Worker Error Recovery
- **What**: Space worker encounters an error, creates escalation instead of silently failing
- **How**:
  1. Create impossible task: "Add feature X which requires Y library that's GPL"
  2. Worker researches, hits blocker, creates "blocker" escalation
  3. **Expected**: Escalation to user: "GPL license conflict"
  4. User resolves: "Switch to MIT alternative" or "Skip feature"
  5. Orchestrator reads resolution, spawns worker with decision
- **Passes if**: Worker doesn't silently give up

### Test 16: Knowledge Cross-Pollination
- **What**: Patterns learned in one project become available to all projects
- **How**:
  1. Auth project establishes: "All endpoints use Zod validation"
  2. This gets written to auth/knowledge/patterns.md
  3. New API project: `api/users-service`
  4. **Expected**: Space worker reads global knowledge/, sees auth patterns
  5. Applies similar validation to API endpoints
  6. Writes "adopted auth pattern" to api/knowledge/patterns.md
- **Passes if**: Patterns are reused, knowledge accumulates

### Test 17: Orchestrator Context Refresh
- **What**: Orchestrator re-reads files periodically to notice new changes
- **How**:
  1. Orchestrator running, has built portfolio
  2. User manually creates new project: `mkdir -p ~/.superbot2/spaces/api/plans/new-feature`
  3. Orchestrator should notice in next cycle (or on explicit refresh)
  4. **Expected**: Orchestrator: "Found new project: api/new-feature. Should I work on it?"
- **Passes if**: New projects detected without orchestrator restart

### Test 18: Decision Context Persistence
- **What**: When user resolves an escalation, full context is preserved for the worker
- **How**:
  1. Escalation: "Use Redis or Memcached?"
  2. User picks: "Redis (we already have it in staging)"
  3. Orchestrator spawns worker with resolution
  4. **Expected**: Worker sees not just the decision ("Redis") but context ("already in staging")
  5. Worker implements with confidence
- **Passes if**: Context preserved, worker doesn't second-guess

### Test 19: Task Dependency Tracking
- **What**: If task A blocks task B, system prevents B from starting before A completes
- **How**:
  1. Create project with dependencies:
     - Task 1: "Setup database schema"
     - Task 2: "Add user endpoints" (depends on task 1)
  2. Worker should see task 2 is blocked
  3. **Expected**: Worker starts with task 1, completes, then unlocks task 2
- **Passes if**: Blocked tasks are skipped until dependencies resolve

### Test 20: Code Quality Checks
- **What**: Space worker runs tests/lint before declaring task complete
- **How**:
  1. Worker completes a code task
  2. Runs: `npm test` or `pytest` or similar
  3. **Expected**: Tests must pass before task marked complete
  4. If failing, escalates or creates follow-up task
- **Passes if**: Code quality verified before completion

### Test 21: Nested Project Structure
- **What**: Projects can have sub-projects or workflows
- **How**:
  1. Create project: `auth/oauth-integration`
  2. With sub-tasks/workflows:
     - Phase 1: Setup (3 tasks)
     - Phase 2: Implementation (5 tasks)
     - Phase 3: Testing (4 tasks)
  3. Worker understands the structure
  4. **Expected**: Worker completes phase by phase, updates plan.md per phase
- **Passes if**: Nested structure is clear and manageable

### Test 22: Automated Cron-Triggered Work
- **What**: Orchestrator can be triggered by cron to run a full work cycle
- **How**:
  1. Setup cron: `0 9 * * * bash ~/dev/superbot2/scripts/superbot2.sh`
  2. (Don't actually set this, but validate the script is designed for it)
  3. **Expected**: Script runs non-interactively with `claude -p --system-prompt`
  4. Completes work, generates briefing for tomorrow
- **Passes if**: Script runs end-to-end in non-interactive mode

### Test 23: Session Isolation
- **What**: Multiple space worker sessions don't interfere with each other
- **How**:
  1. Orchestrator spawns 2 concurrent space workers
  2. Both read/write to shared escalations/ and knowledge/
  3. **Expected**: No file conflicts, no data loss
  4. Both write successfully, nothing gets overwritten
- **Passes if**: Concurrent writes are safe

### Test 24: Memory/MEMORY.md Updates
- **What**: MEMORY.md stays up-to-date with key findings
- **How**:
  1. Run a full work cycle
  2. Check MEMORY.md
  3. **Expected**: Lists:
     - Total projects completed
     - Key decisions made
     - Blockers/escalations
     - Next priorities
  4. Is brief and scannable (max 50 lines)
- **Passes if**: MEMORY.md is accurate and useful

### Test 25: Escalation Archival
- **What**: Resolved escalations are moved to resolved/ for history
- **How**:
  1. Escalation in pending/, user resolves it
  2. Orchestrator processes resolution
  3. **Expected**: Escalation moves to resolved/
  4. Can still be read for context but doesn't clutter pending/
- **Passes if**: resolved/ contains old escalations

### Test 26: Error Format Standardization (Knowledge)
- **What**: Across all projects, error responses follow same format
- **How**:
  1. Auth project defines: `{ "error": "...", "code": "..." }`
  2. Documented in auth/knowledge/patterns.md
  3. New projects see this pattern
  4. **Expected**: API project uses identical error format
- **Passes if**: Error formats are consistent across projects

### Test 27: Retry Logic in Worker
- **What**: If a task fails the first time, worker retries or escalates
- **How**:
  1. Network error during implementation
  2. Worker catches error, retries (up to 3 times)
  3. If still failing, creates escalation: "Network issue during dependency install"
  4. **Expected**: No silent failures
- **Passes if**: Errors are handled gracefully

### Test 28: Space Worker Guide Followed
- **What**: Space workers follow the prescribed workflow from SPACE_WORKER_GUIDE.md
- **How**:
  1. Worker should:
     - Read guide on boot
     - Invoke TDD skill before implementation (via brainstorming)
     - Run tests before declaring completion
     - Update plan.md with status
     - Create escalations for blockers (don't work around them)
  2. **Expected**: All these behaviors visible in session
- **Passes if**: Guide is followed explicitly

### Test 29: Orchestrator Guide Followed
- **What**: Orchestrator follows ORCHESTRATOR_GUIDE.md
- **How**:
  1. Orchestrator should:
     - Build portfolio on boot
     - Review draft escalations
     - Promote high-quality escalations to pending
     - Spawn space workers for available projects
     - Create morning briefing
  2. **Expected**: All these behaviors visible
- **Passes if**: Guide is followed

### Test 30: API Endpoints for Dashboard (Future)
- **What**: If dashboard exists, orchestrator provides JSON endpoints
- **How**:
  1. GET `/api/portfolio` → list all spaces/projects/progress
  2. GET `/api/escalations/pending` → user-facing escalations
  3. POST `/api/escalations/{id}/resolve` → user submits resolution
  4. **Expected**: Dashboard can query and display work
- **Status**: Not implemented yet (marked as #4 in TODO)
- **Passes if**: Endpoints exist and return valid JSON

---

## Notes

- **Test 4 is critical**: The "space worker" naming change was specifically to fix the behavior where workers don't invoke skills. This test proves whether the fix worked.
- Tests 1-3 are already passing (verified in transcripts).
- Tests 5-30 are what you should manually test, starting with Test 4.
- If Test 4 fails (worker still doesn't invoke brainstorming), we need to revisit the agent prompting strategy.
- Tests 7, 16, 24 require setup from previous sessions (populated knowledge/decisions.md) to verify properly.

---

## Test Artifact Cleanup

After testing, clean up with:

```bash
rm -rf ~/.superbot2/spaces/general/plans/*
rm ~/.superbot2/escalations/draft/*.json
rm ~/.superbot2/escalations/pending/*.json
rm ~/.superbot2/escalations/resolved/*.json
```

Do NOT delete the `general/` space itself - that's the default.
