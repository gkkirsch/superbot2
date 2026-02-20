# Superbot2 QA Test Plan

Run each test manually. Check the box when it passes.

## Setup & Boot

- [ ] **Clean install**: `rm -rf ~/.superbot2 && bash scripts/setup.sh` creates all dirs, files, hooks, skills
- [ ] **Idempotent setup**: Running setup twice doesn't overwrite USER.md, IDENTITY.md, MEMORY.md, knowledge files
- [ ] **Hooks format**: No settings errors on launch (hooks use correct new format)
- [ ] **Boot sequence**: Orchestrator reads all 6 boot files with absolute paths (no `~` globs failing)
- [ ] **Orchestrator stays light**: Does NOT read app/, OVERVIEW.md, space knowledge, or plan.md

## Portfolio View

- [ ] **Empty state**: With no spaces or only the general space (empty), orchestrator reports nothing to do and waits
- [ ] **Space discovery**: Add a space manually (`spaces/myapp/space.json`), reboot, orchestrator sees it
- [ ] **Task counting**: Orchestrator counts tasks by status without reading task descriptions
- [ ] **Multiple spaces**: Orchestrator builds portfolio view across 2+ spaces

## Space Worker Spawning

- [ ] **Correct prompt assembly**: Orchestrator reads `templates/space-worker-prompt.md`, substitutes {{SPACE}}, {{PROJECT}}, {{BRIEFING}}
- [ ] **Absolute paths in prompt**: Space worker gets paths like `/Users/.../` not `~/...`
- [ ] **Worker reads guide first**: Space worker reads SPACE_WORKER_GUIDE.md before doing anything
- [ ] **Worker stays in scope**: Only modifies files in `~/.superbot2/spaces/<space>/`
- [ ] **One project per worker**: Orchestrator doesn't ask a worker to handle multiple projects

## New Project Flow

- [ ] **Empty project triggers planning**: Space worker sees empty `plans/<project>/` and creates plan.md + tasks
- [ ] **Brainstorming skill invoked**: Worker calls `superbot-brainstorming` skill for new projects (not just winging it)
- [ ] **Tasks created with correct schema**: Timestamp IDs, acceptanceCriteria, priority, status=pending
- [ ] **Plan.md written**: Has goals, approach, what done looks like

## Task Execution

- [ ] **Task pickup order**: Worker picks tasks from briefing first, then by priority, then by what unblocks most
- [ ] **Status updates on disk**: Worker sets task to in_progress before starting, completed when done
- [ ] **completionNotes written**: Task JSON has completionNotes describing what was done
- [ ] **TDD skill used**: Worker invokes `test-driven-development` skill for implementation tasks
- [ ] **Verification skill used**: Worker invokes `verification-before-completion` before claiming done
- [ ] **Code review dispatched**: Worker spawns `superpowers:code-reviewer` subagent for significant work

## Escalation System

- [ ] **Draft creation**: Worker writes valid escalation JSON to `escalations/draft/` when hitting a decision it can't make
- [ ] **Worker continues after escalation**: Doesn't stop, moves to next unblocked task
- [ ] **Orchestrator reviews drafts**: Reads draft escalations during cycle
- [ ] **Orchestrator resolves what it can**: Uses global knowledge / cross-space context to resolve
- [ ] **Orchestrator promotes what it can't**: Moves unresolvable escalations to `pending/`
- [ ] **Resolution triggers re-spawn**: After user resolves an escalation, orchestrator spawns worker with resolution in briefing
- [ ] **Resolution distilled to knowledge**: Decision gets written to knowledge/decisions.md

## Knowledge System

- [ ] **Space knowledge written**: Worker writes conventions/patterns/decisions to `spaces/<space>/knowledge/`
- [ ] **Knowledge prevents re-asking**: Worker checks knowledge before creating escalation
- [ ] **Global knowledge promotion**: Orchestrator promotes cross-space patterns to global `knowledge/`
- [ ] **Worker reads knowledge on boot**: Worker reads all files in `spaces/<space>/knowledge/` before starting work

## Hooks Enforcement

- [ ] **TeammateIdle blocks incomplete workers**: Worker can't go idle with in_progress tasks, no plan update, no report
- [ ] **TeammateIdle allows clean idle**: Worker passes all checks and goes idle cleanly
- [ ] **TaskCompleted blocks missing notes**: Task can't be completed without completionNotes
- [ ] **Pre-shutdown blocks unreviewed drafts**: Orchestrator can't shut down with unreviewed draft escalations
- [ ] **Pre-shutdown blocks orphaned tasks**: Orchestrator can't shut down with in_progress tasks

## Worker Reporting

- [ ] **SendMessage to team-lead**: Worker sends summary to orchestrator before going idle
- [ ] **Summary includes**: Tasks completed, new tasks created, escalations, plan status, blockers

## Orchestrator Cycle

- [ ] **Proactive work generation**: Orchestrator identifies gaps (space with goals but no project, completed project needing next phase)
- [ ] **Self-triggering loop**: After worker finishes, orchestrator checks for more work and spawns again
- [ ] **Morning briefing format**: Orchestrator generates decisions/blockers/questions/approvals format

## Edge Cases

- [ ] **No spaces**: Orchestrator boots with empty `spaces/` dir without crashing
- [ ] **No tasks in project**: Worker handles project with plan but no tasks
- [ ] **All tasks blocked**: Worker creates escalations for all blockers, reports, goes idle
- [ ] **Worker doesn't spawn sub-teams**: Worker does NOT call TeamCreate or spawn its own teammates
