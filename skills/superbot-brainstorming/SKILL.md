---
name: superbot-brainstorming
description: "Use when a space worker needs to design a new project. Explores the codebase, makes decisions it can, escalates what it can't, then writes plan.md and creates tasks."
---

# Superbot Project Planning

## Overview

Design a project plan autonomously. You are a space worker - there is no one to have a conversation with. You explore the codebase, make the decisions you can, escalate the ones you can't, write plan.md, and create tasks.

## The Process

### 1. Understand the Context

- Read the space's OVERVIEW.md and existing knowledge files
- Read global knowledge (conventions, decisions, preferences)
- Explore the current codebase state (files, structure, dependencies, recent commits)
- Read the spawn briefing for what the orchestrator wants

### 2. Explore Approaches

- Identify 2-3 approaches with trade-offs
- Pick the best one based on existing conventions, codebase patterns, and simplicity
- Document your reasoning in the plan

### 3. Generate Escalation Questions

You MUST always create multiple escalation questions about the project. Even if you think you know the answer, the user needs to confirm key decisions before you proceed.

Aim for 3-8 questions depending on the project's complexity. Base your questions on what you learned from exploring the codebase and context. Each question should be a `decision` or `question` type escalation with 2-4 concrete options.

Create ALL escalations at once using the scaffold script:
```bash
bash ~/.superbot2/scripts/create-escalation.sh <type> <space> <project> "<question>" \
  --context "why this matters" \
  --option "Option A|Tradeoffs of A" \
  --option "Option B|Tradeoffs of B" \
  --priority high \
  --blocks-project
```

Types: `decision`, `blocker`, `question`, `approval`

Additional flags:
- `--blocks-task "path/to/task.json"` - if this blocks a specific task
- `--blocks-project` - if this blocks the entire project

Mark all escalations as `--blocks-project` so the project cannot proceed until the user answers them.

### 4. Stop and Wait

After creating all escalations:
- Do NOT write plan.md
- Do NOT create tasks
- Report to the orchestrator that the project is blocked on escalations
- Stop and go idle

You will be resumed after the user resolves the escalations. Only then should you proceed with writing the plan and creating tasks.

### 5. Write the Plan (only after escalations are resolved)

Only run this step when you are resumed and all escalations have been resolved.

Write to the project's `plan.md`:
- **Goal**: What we're building and why
- **Approach**: What we chose and why (reference alternatives considered)
- **What done looks like**: Clear success criteria
- **Decisions made**: Summarize the resolved escalation answers

Keep it concise. No fluff.

### 6. Create Tasks (only after plan is written)

Use the scaffold script to create tasks:
```bash
bash ~/.superbot2/scripts/create-task.sh <space> <project> "<subject>" \
  --description "what needs to be done" \
  --criteria "criterion 1" \
  --criteria "criterion 2" \
  --priority high
```
- Start executing the first task

## Key Principles

- **Always ask questions** - Every project needs user input. Create 3-8 escalation questions before doing anything else.
- **No back-and-forth** - Gather all your questions, create all escalations at once, then stop
- **YAGNI ruthlessly** - Cut anything that isn't essential
- **Escalations are blockers** - Do not proceed with the plan until all escalations are resolved
- **Options, not open-ended** - Every question should have 2-4 concrete options with tradeoffs
