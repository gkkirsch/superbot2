---
name: superbot-implementation
description: "Use when executing an project plan with multiple independent tasks. Dispatches a fresh subagent per task with two-stage review (spec compliance, then code quality)."
---

# Superbot Implementation

Execute an project's plan by dispatching a fresh subagent per task, with two-stage review after each.

**Core principle:** Fresh subagent per task + spec review + quality review = high quality, no context pollution.

## When to Use

Use when:
- You have a plan.md with multiple tasks
- Tasks are mostly independent
- You want quality gates between tasks

Don't use when:
- Tasks are tightly coupled (do them yourself sequentially)
- Only 1-2 small tasks (just do them directly)

## The Process

### 1. Read Plan and Tasks

Read your project's `plan.md` and all task JSON files. Extract full task descriptions. You'll paste these into subagent prompts - don't make subagents read files.

### 2. Per Task Loop

For each task (in priority/dependency order):

**a. Update task status**
Set `status: "in_progress"` in the task JSON file.

**b. Dispatch implementer subagent**

```
Task tool:
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  description: "Implement: <task subject>"
  prompt: |
    You are implementing a task for the <space>/<project> project.

    ## Task
    <FULL TEXT of task description and acceptance criteria - paste it, don't reference files>

    ## Context
    <Where this fits, dependencies, architectural context>

    ## Working Directory
    <code directory path>

    ## Before You Begin
    If anything is unclear about the requirements, approach, or dependencies - ask now.

    ## Your Job
    1. Implement exactly what the task specifies
    2. Write tests (TDD: test first, watch it fail, minimal code to pass)
    3. Verify: run the build/test command, read the full output, confirm it passes. No "should work" — evidence before assertions.
    4. Commit your work with message format: `[<space>/<project>] <what you did>`
    5. Self-review: check completeness, quality, YAGNI
    6. Report back with:
       - What you implemented
       - Tests written/passing
       - Files changed (list them)
       - Git status output (run `git status` and `git diff --stat`)
       - Any concerns
```

If the implementer asks questions, answer them clearly.

**c. Dispatch spec reviewer subagent**

```
Task tool:
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  description: "Spec review: <task subject>"
  prompt: |
    You are reviewing whether an implementation matches its specification.

    ## What Was Requested
    <FULL TEXT of task requirements and acceptance criteria>

    ## What Implementer Claims They Built
    <From implementer's report>

    ## Your Job
    Do NOT trust the report. Read the actual code and verify:
    - Missing requirements: did they implement everything requested?
    - Extra work: did they build things that weren't requested?
    - Misunderstandings: did they solve the wrong problem?

    Report:
    - Pass: spec compliant (everything matches after code inspection)
    - Fail: list specifically what's missing or extra, with file:line references
```

If spec review fails, have the implementer fix issues and re-review.

**d. Dispatch code quality reviewer**

Only after spec review passes.

```
Task tool:
  subagent_type: "code-reviewer"
  mode: "bypassPermissions"
  description: "Quality review: <task subject>"
  prompt: |
    Review the implementation of <what was built>.
    Requirements: <acceptance criteria>
    Base SHA: <commit before task>
    Head SHA: <current commit>
```

If quality review finds Critical/Important issues, have the implementer fix and re-review.

**e. Update task as completed**

Set `status: "completed"`, `completedAt`, and `completionNotes` in the task JSON.

### 3. After All Tasks

- Update `plan.md` with what was accomplished
- Update space `knowledge/` with any new patterns or conventions discovered
- Report to orchestrator, including:
  - Tasks completed and what was done
  - Git status: run `git status` and `git diff --stat` in the working directory and include the output
  - Any uncommitted changes and why
  - What needs deploying

## Key Rules

- Never make subagents read plan files - paste full task text into the prompt
- Don't skip spec review even if implementation "looks right"
- Don't start quality review before spec review passes
- One task at a time - don't parallelize implementer subagents (they'd conflict)
- Fix review issues before moving to next task
- If a subagent fails, dispatch a new one with specific fix instructions
