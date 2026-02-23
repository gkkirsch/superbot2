# System Prompt Research: Append vs Replace

## Current State

### How the Orchestrator Launches

File: `/Users/gkkirsch/.superbot2/scripts/superbot2.sh`

The orchestrator is launched with `--system-prompt`, which **already replaces** the default Claude Code system prompt entirely:

```bash
CLAUDE_ARGS=(
    --system-prompt "$PROMPT"
    --session-id "$SESSION_ID"
    --team-name superbot2
    --agent-name team-lead
    --agent-id team-lead@superbot2
    --dangerously-skip-permissions
)
```

The prompt is assembled from the template at `~/.superbot2/templates/orchestrator-system-prompt-override.md` plus substituted identity, user, memory, the orchestrator guide, knowledge files, space configs, and escalations.

**The orchestrator is already in replace mode. This is working correctly.**

### How Space Workers Launch

Space workers are spawned via the **Task tool** with `subagent_type: "general-purpose"`. This is where the problem is. Built-in agent types (`general-purpose`, `Explore`, `Plan`, `Bash`) receive the **full default Claude Code system prompt** plus whatever is in the `prompt` parameter.

The default Claude Code system prompt includes extensive sections that are irrelevant or overly restrictive for automated space workers:
- Browser automation safety rules (~60 lines)
- Chrome extension tab management instructions
- Alert/dialog avoidance rules
- Interactive user conversation patterns
- Auto memory directory management
- Extensive "executing actions with care" warnings
- Plan mode guidance

**This is the source of the problem: space workers inherit the full default system prompt and there's no way to control it via the Task tool.**

---

## Claude Code System Prompt Flags

| Flag | Behavior | Available For |
|------|----------|---------------|
| `--system-prompt` | **REPLACES** default prompt entirely | CLI launch only |
| `--system-prompt-file` | **REPLACES** with file contents | CLI launch only (print mode) |
| `--append-system-prompt` | **APPENDS** to default prompt | CLI launch only |
| `--append-system-prompt-file` | **APPENDS** file contents | CLI launch only |

There is no `--system-prompt-mode` flag. The mode is determined by which flag you use.

**Critical limitation**: These flags only work for the top-level `claude` CLI invocation. They cannot be used for subagents spawned via the Task tool.

---

## Custom Agent Definitions (The Solution)

Custom agents defined in `.claude/agents/*.md` have a different behavior from built-in agent types:

> "The body becomes the system prompt that guides the subagent's behavior. Subagents receive only this system prompt (plus basic environment details like working directory), not the full Claude Code system prompt."

### How Custom Agents Work

1. Create a markdown file in `~/.claude/agents/` (user-level) or `.claude/agents/` (project-level)
2. Add frontmatter with configuration
3. The markdown body becomes the **complete system prompt** for the subagent
4. Spawn it via `Task tool` with `subagent_type: "your-agent-name"`

### Available Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (lowercase + hyphens) |
| `description` | Yes | When to delegate to this agent |
| `tools` | No | Array of allowed tools; inherits all if omitted |
| `disallowedTools` | No | Tools to deny |
| `model` | No | `sonnet`, `opus`, `haiku`, or `inherit` |
| `permissionMode` | No | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | No | Maximum agentic turns |
| `skills` | No | Skills to preload |
| `mcpServers` | No | MCP servers available |
| `hooks` | No | Lifecycle hooks scoped to agent |
| `memory` | No | Persistent memory scope |
| `background` | No | Run as background task |
| `isolation` | No | Set to `worktree` for isolated git worktree |

### Existing Custom Agent

There is already one custom agent: `~/.claude/agents/code-reviewer.md`. This serves as a reference for the format.

---

## Default Claude Code System Prompt Analysis

The default system prompt (observed from a running `general-purpose` subagent) contains these sections:

### ESSENTIAL to replicate in custom agent prompt

These sections contain instructions that are critical for correct tool usage and safe operation:

1. **Tool Usage Instructions** (~15 lines)
   - Use Read instead of cat/head/tail
   - Use Edit instead of sed/awk
   - Use Write instead of echo/heredoc
   - Use Glob instead of find
   - Use Grep instead of grep/rg
   - Reserve Bash for system commands only

2. **Git Safety Protocol** (~25 lines)
   - Never force push, reset --hard, etc.
   - Always create new commits (don't amend)
   - Stage specific files (not `git add -A`)
   - HEREDOC format for commit messages
   - Co-Authored-By line

3. **Core Task Execution Guidance** (~10 lines)
   - Read code before modifying
   - Don't create unnecessary files
   - Avoid over-engineering
   - Don't add features beyond what was asked

4. **Security Awareness** (~5 lines)
   - Avoid command injection, XSS, SQL injection
   - Fix insecure code immediately

5. **Teammate Communication** (~5 lines)
   - Use SendMessage tool
   - Plain text output not visible to team

### SAFE TO DROP for space workers

These sections add significant token overhead with little or no value for automated workers:

1. **Browser Automation Safety** (~60 lines)
   - GIF recording instructions
   - Console log debugging
   - Alert/dialog avoidance
   - Tab context management
   - "Avoid rabbit holes and loops"

2. **"Executing Actions with Care"** (~30 lines)
   - Extensive warnings about reversibility
   - Lists of risky actions requiring confirmation
   - Not relevant when running with `--dangerously-skip-permissions`

3. **Auto Memory Management** (~20 lines)
   - MEMORY.md file management
   - Guidelines for what to save
   - Workers have their own knowledge system

4. **Interactive User Communication** (~10 lines)
   - Tone and style for human conversation
   - Emoji guidance
   - Link format guidance
   - Workers communicate via SendMessage/escalations, not direct user chat

5. **Plan Mode Instructions** (~15 lines)
   - EnterPlanMode guidance
   - Workers have their own brainstorming skill

6. **PR Creation Protocol** (~25 lines)
   - Detailed PR workflow
   - Workers don't create PRs

7. **Skill/Slash Command Instructions** (~10 lines)
   - Available skills listing
   - The skills reminders are injected anyway via system-reminder tags

### Estimated Token Savings

- Default system prompt: ~4,000-5,000 tokens
- Essential content to keep: ~1,000-1,500 tokens
- Potential savings: **~3,000-3,500 tokens per space worker session**

---

## Recommended Approach

### Option A: Custom Agent Definition (Recommended)

Create `~/.claude/agents/space-worker.md` with:
- Lean system prompt containing only essential tool/git/safety instructions
- The space worker guide content
- Frontmatter with appropriate tools and permissions

Then change the orchestrator to spawn workers with `subagent_type: "space-worker"` instead of `"general-purpose"`.

**Pros:**
- Eliminates ~3,000 tokens of irrelevant default prompt per worker
- Keeps full team communication (SendMessage, TaskUpdate, etc.)
- Maintains Task tool integration
- Easy to iterate on the prompt
- Uses existing Claude Code infrastructure

**Cons:**
- Need to verify that "basic environment details" injected by Claude Code don't re-add the dropped sections
- Need to explicitly include essential tool usage instructions since they won't be inherited
- Must maintain the custom prompt as Claude Code updates

### Option B: Separate `claude` Processes (Alternative)

Launch space workers as separate `claude` CLI processes with `--system-prompt` instead of using the Task tool.

**Pros:**
- Complete control over system prompt
- Guaranteed no default prompt leakage

**Cons:**
- Loses team communication (SendMessage, TaskUpdate, inbox delivery)
- Loses automatic teammate management (idle detection, shutdown)
- Much more complex process management
- Would need a custom communication layer (file-based IPC or similar)

### Option C: Hybrid (Fallback)

Use custom agent for the system prompt, but if testing reveals Claude Code still injects unwanted sections, fall back to separate processes for workers that need minimal prompts.

---

## Implementation Plan for Option A

### Step 1: Create the Custom Agent

Create `~/.claude/agents/space-worker.md` with frontmatter:

```yaml
---
name: space-worker
description: Use this agent for superbot2 space workers that execute project tasks
model: inherit
---
```

### Step 2: Write the Lean System Prompt Body

The body should include (in order):

1. **Identity**: "You are a space worker for superbot2..."
2. **Tool Usage** (essential): Use Read/Write/Edit/Glob/Grep instead of bash equivalents
3. **Git Safety** (essential): Commit protocol, no force push, HEREDOC format
4. **Code Quality** (essential): No over-engineering, security awareness
5. **Team Communication** (essential): SendMessage for teammate communication
6. **Placeholder for space-specific context**: The orchestrator's Task tool `prompt` parameter will include the full space worker prompt with briefing, project details, etc.

### Step 3: Update the Orchestrator

Change the Task tool spawning call from:
```
subagent_type: "general-purpose"
```
to:
```
subagent_type: "space-worker"
```

### Step 4: Test and Verify

1. Spawn a test worker and have it report its system prompt length or content
2. Verify browser automation rules are NOT present
3. Verify tool usage still works correctly
4. Verify team communication (SendMessage) still works
5. Verify git operations follow the safety protocol

---

## Key Files Referenced

| File | Purpose |
|------|---------|
| `~/.superbot2/scripts/superbot2.sh` | Orchestrator launcher (uses `--system-prompt`) |
| `~/.superbot2/templates/orchestrator-system-prompt-override.md` | Orchestrator system prompt template |
| `~/.superbot2/templates/space-worker-prompt.md` | Space worker prompt template (substituted per session) |
| `~/.superbot2/ORCHESTRATOR_GUIDE.md` | Orchestrator behavior guide (appended to prompt) |
| `~/.superbot2/SPACE_WORKER_GUIDE.md` | Space worker behavior guide (read by workers) |
| `~/.claude/settings.json` | Global settings (hooks, plugins) |
| `~/.claude/settings.local.json` | Local settings (hooks) |
| `~/.claude/agents/code-reviewer.md` | Existing custom agent (reference for format) |

## Open Questions

1. **What "basic environment details" does Claude Code inject for custom agents?** The docs say "plus basic environment details like working directory" but it's unclear exactly what this includes. Need to test.
2. **Do custom agents lose access to skills?** The `skills` frontmatter field suggests they can be preloaded, but need to verify skills like `superbot-brainstorming` work correctly.
3. **Does `permissionMode: "bypassPermissions"` work in the frontmatter?** This would eliminate permission prompts for the worker (currently handled by `--dangerously-skip-permissions` on the orchestrator).
4. **Does the `mode` parameter in the Task tool override the agent's `permissionMode`?** Need to test interaction between these.
