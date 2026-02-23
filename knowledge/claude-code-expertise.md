# Claude Code Deep Expertise

> Written from the perspective of someone who ships real projects with Claude Code daily.
> Last updated: 2026-02-22

---

## 1. CLI Flags & Modes — The Complete Reference

### The Big Three Modes

Claude Code runs in three modes. Understanding these is table-stakes:

1. **Interactive mode** (`claude`) — the REPL you use daily. Full UI, permission prompts, session persistence.
2. **Print mode** (`claude -p "query"`) — non-interactive, single-shot. Outputs the result and exits. This is the workhorse for scripting, CI/CD, and the Agent SDK.
3. **Agent mode** (`claude --agent my-agent`) — starts Claude with a custom agent definition as the primary persona.

### Every Flag That Matters (Ranked by Usefulness)

#### Tier 1: Use These Daily

| Flag | What It Does | Pro Tip |
|------|-------------|---------|
| `-p, --print` | Non-interactive mode. Query → response → exit. | Pipe stdin: `cat file \| claude -p "explain"`. This is how you script Claude Code. |
| `-c, --continue` | Resume last conversation in current directory. | `claude -c -p "now fix the tests"` for multi-step scripts. |
| `-r, --resume <id\|name>` | Resume a specific session by ID or name. | Name your sessions with `/rename auth-refactor`, resume with `claude -r auth-refactor`. |
| `--model <model>` | Set model for the session. Accepts aliases (`sonnet`, `opus`, `haiku`) or full IDs. | `claude --model haiku` for fast research. `claude --model opus` for complex architecture. |
| `--permission-mode <mode>` | Set permission mode at launch. | `plan` for safe read-only exploration. `bypassPermissions` for automation. |
| `--dangerously-skip-permissions` | Skip ALL permission prompts. | Required for fully autonomous agents. Use in CI/CD and automation only. |
| `--output-format <fmt>` | Control output: `text`, `json`, `stream-json`. | `stream-json` for real-time streaming in web UIs. `json` for programmatic parsing. |
| `--max-turns <n>` | Limit agentic turns (print mode only). | Prevents runaway agents. Set to 3-5 for focused tasks, 20+ for complex ones. |

#### Tier 2: Power User Essentials

| Flag | What It Does | Pro Tip |
|------|-------------|---------|
| `--append-system-prompt` | Add to the default system prompt (keeps all defaults). | Safest way to customize behavior. `claude --append-system-prompt "Always use TypeScript"` |
| `--system-prompt` | REPLACE the entire system prompt. | Gives total control but drops all defaults. Use for custom agents/automation only. |
| `--system-prompt-file` | Replace system prompt from a file (print mode only). | Better for version control: `claude -p --system-prompt-file ./prompt.txt "query"` |
| `--allowedTools` | Tools that execute without permission prompts. | `"Bash(git log *)" "Bash(git diff *)" "Read"` — granular permission control. |
| `--disallowedTools` | Remove tools entirely from the model's context. | `"Write" "Edit"` makes a read-only agent. Different from permission — tool is invisible. |
| `--tools` | Restrict available tools entirely. | `--tools "Bash,Edit,Read"` — only these tools exist. `""` disables all. |
| `--worktree, -w` | Start in an isolated git worktree. | `claude -w feature-auth` — each session gets its own branch and files. Game-changer for parallel work. |
| `--add-dir` | Add extra directories to Claude's scope. | `claude --add-dir ../shared-lib ../docs` — work across repos. |
| `--agent` | Start with a custom agent as the main persona. | `claude --agent code-reviewer` — the agent's markdown body becomes the system prompt. |
| `--agents` | Define agents inline via JSON (session-only). | Quick testing without creating files. See format in CLI reference. |

#### Tier 3: CI/CD & Automation

| Flag | What It Does | Pro Tip |
|------|-------------|---------|
| `--max-budget-usd` | Spending cap in dollars (print mode). | `--max-budget-usd 5.00` — hard stop when budget is reached. |
| `--fallback-model` | Auto-fallback when primary model is overloaded (print mode). | `--fallback-model sonnet` — keeps CI running during peak load. |
| `--no-session-persistence` | Don't save sessions to disk (print mode). | For ephemeral CI jobs that don't need resumability. |
| `--include-partial-messages` | Include streaming chunks in output (print + stream-json). | Needed for real-time UIs. Get partial assistant text as it's generated. |
| `--input-format stream-json` | Multi-turn input via JSON stream on stdin. | For programmatic multi-turn conversations in print mode. |
| `--json-schema` | Get structured output matching a JSON Schema (print mode). | `--json-schema '{"type":"object","properties":{...}}'` — validated structured output. |
| `--mcp-config` | Load MCP servers from a JSON file. | `--mcp-config ./mcp.json` — reproducible MCP setup for CI. |
| `--strict-mcp-config` | ONLY use MCP from --mcp-config, ignore all others. | Prevents project configs from injecting unexpected MCP servers. |
| `--from-pr <number>` | Resume sessions linked to a GitHub PR. | Sessions auto-link when you `gh pr create`. `claude --from-pr 123` to pick up where you left off. |
| `--fork-session` | Create new session ID when resuming. | `claude --resume abc123 --fork-session` — branch the conversation without modifying the original. |
| `--verbose` | Full turn-by-turn logging. | Essential for debugging CI failures. Shows tool calls, results, reasoning. |
| `--debug` | Debug mode with category filtering. | `claude --debug "api,hooks"` or `claude --debug "!statsig,!file"` (exclude categories). |

#### Tier 4: Multi-Agent Coordination

| Flag | What It Does | Pro Tip |
|------|-------------|---------|
| `--session-id` | Use a specific UUID for the session. | Must be valid UUID. For deterministic session management in automation. |
| `--team-name` | Set team name for agent coordination. | Creates shared task lists at `~/.claude/tasks/{team-name}/`. |
| `--agent-name` | Human-readable agent name within a team. | Used for `SendMessage` targeting. `claude --agent-name researcher` |
| `--agent-id` | Unique agent identifier within a team. | Format: `name@team`. `claude --agent-id researcher@my-project` |
| `--teammate-mode` | How teammates display: `auto`, `in-process`, `tmux`. | `tmux` shows each agent in a tmux pane. Requires tmux installed. |

### System Prompt Flags — Know the Difference

| Flag | Behavior | Modes |
|------|----------|-------|
| `--system-prompt` | **REPLACES** entire default prompt | Interactive + Print |
| `--system-prompt-file` | **REPLACES** with file contents | Print only |
| `--append-system-prompt` | **APPENDS** to default prompt | Interactive + Print |
| `--append-system-prompt-file` | **APPENDS** file contents | Print only |

**Key insight**: `--system-prompt` drops ALL default Claude Code behavior — tool usage instructions, git safety, code quality guidance, everything. Only use when you know what you're doing (custom agents, CI pipelines). For most cases, `--append-system-prompt` is what you want.

**Gotcha**: `--system-prompt` and `--system-prompt-file` are mutually exclusive. The append flags can combine with either replacement flag.

### Environment Variables

| Variable | What It Does |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for authentication |
| `CLAUDE_MODEL` | Default model override |
| `CLAUDE_CODE_USE_BEDROCK=1` | Use Amazon Bedrock as provider |
| `CLAUDE_CODE_USE_VERTEX=1` | Use Google Vertex AI as provider |
| `CLAUDE_CODE_USE_FOUNDRY=1` | Use Microsoft Azure AI Foundry |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Override max output tokens |
| `CLAUDE_CODE_EFFORT_LEVEL` | Thinking depth: `low`, `medium`, `high` (Opus 4.6 only) |
| `MAX_THINKING_TOKENS` | Limit thinking token budget. Set to 0 to disable thinking entirely. |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | `1` = disable, `0` = force enable auto memory |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | `1` = disable background subagent tasks |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Override auto-compaction threshold (default ~95%). Set to `50` for aggressive compaction. |
| `DISABLE_AUTOUPDATER` | Disable automatic version updates |
| `CLAUDECODE` | Set automatically by Claude Code. **Blocks nested sessions** — this is a gotcha. |

### Output Format Details

**`--output-format text`** (default): Plain text response. Just the answer.

**`--output-format json`**: JSON array of all messages with metadata (cost, duration, token usage).

**`--output-format stream-json`**: Newline-delimited JSON objects emitted in real-time. Each object is valid JSON, but the entire stream is NOT valid JSON if concatenated. This is what you want for real-time UIs (SSE, WebSockets).

With `--include-partial-messages`, stream-json includes partial assistant text as it streams, not just complete tool calls.

---

## 2. Hooks System — The Real Power Feature

Hooks are user-defined commands that run at specific lifecycle points. They're what separate Claude Code from a dumb chat interface. If you're not using hooks, you're leaving half the product on the table.

### Hook Events (All 17)

| Event | When | Can Block? | Practical Use |
|-------|------|-----------|---------------|
| `SessionStart` | Session begins/resumes | No | Load dev context, set env vars |
| `UserPromptSubmit` | Before processing user prompt | Yes | Validate prompts, add context |
| `PreToolUse` | Before tool executes | Yes | Block dangerous commands, modify input |
| `PermissionRequest` | Permission dialog appears | Yes | Auto-approve/deny programmatically |
| `PostToolUse` | After tool succeeds | No* | Lint after edits, run tests |
| `PostToolUseFailure` | After tool fails | No | Log failures, add debug context |
| `Notification` | Desktop notification fires | No | Custom notification routing |
| `SubagentStart` | Subagent spawned | No | Inject context into subagents |
| `SubagentStop` | Subagent finishes | Yes | Verify subagent output quality |
| `Stop` | Claude finishes responding | Yes | Force Claude to keep working |
| `TeammateIdle` | Team agent goes idle | Yes | Enforce quality gates |
| `TaskCompleted` | Task marked complete | Yes | Verify acceptance criteria met |
| `ConfigChange` | Settings file changes | Yes | Audit config changes |
| `WorktreeCreate` | Worktree being created | Yes | Custom VCS (SVN, Perforce) |
| `WorktreeRemove` | Worktree being removed | No | Custom cleanup |
| `PreCompact` | Before context compaction | No | Log what's being compacted |
| `SessionEnd` | Session terminates | No | Cleanup, stats logging |

### Hook Configuration Format

Hooks live in settings files (`.claude/settings.json`, `~/.claude/settings.json`, or `.claude/settings.local.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/validate-bash.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Hook Types

1. **Command hooks** (`type: "command"`) — run a shell script. Get JSON on stdin, communicate via exit codes + stdout JSON.
2. **Prompt hooks** (`type: "prompt"`) — send a prompt to a fast Claude model. Returns `{"ok": true/false, "reason": "..."}`.
3. **Agent hooks** (`type: "agent"`) — spawn a multi-turn subagent with tool access to verify conditions.

### Exit Codes (Critical to Understand)

- **Exit 0**: Success. Proceed. Parse stdout for JSON output.
- **Exit 2**: Blocking error. Block the action. stderr feeds back as error message.
- **Any other code**: Non-blocking error. Continue, show in verbose mode.

### Matcher Patterns

Matchers are regex strings that filter when hooks fire:

| Event | What Matcher Filters | Examples |
|-------|---------------------|----------|
| PreToolUse, PostToolUse | Tool name | `Bash`, `Edit\|Write`, `mcp__.*` |
| SessionStart | How session started | `startup`, `resume` |
| SessionEnd | Why session ended | `clear`, `logout` |
| Notification | Notification type | `permission_prompt`, `idle_prompt` |
| SubagentStart/Stop | Agent type | `Explore`, `code-reviewer` |
| PreCompact | Trigger type | `manual`, `auto` |

Use `"*"`, `""`, or omit matcher entirely to match everything.

### The 5 Most Useful Hook Patterns

**1. Block dangerous commands:**
```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command' < /dev/stdin)
if echo "$COMMAND" | grep -q 'rm -rf'; then
  echo "Blocked: destructive command" >&2
  exit 2
fi
exit 0
```

**2. Auto-lint after file changes (PostToolUse on Edit|Write):**
```bash
#!/bin/bash
FILE_PATH=$(jq -r '.tool_input.file_path' < /dev/stdin)
if [[ "$FILE_PATH" == *.ts || "$FILE_PATH" == *.js ]]; then
  npx eslint --fix "$FILE_PATH" 2>&1
fi
exit 0
```

**3. Force Claude to continue (Stop hook):**
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if all tasks are complete: $ARGUMENTS. Respond {\"ok\": true} if done, {\"ok\": false, \"reason\": \"...\"} if more work needed."
          }
        ]
      }
    ]
  }
}
```

**4. Desktop notifications (Notification hook):**
```bash
osascript -e 'display notification "Claude needs attention" with title "Claude Code"'
```

**5. Enforce task quality gates (TaskCompleted):**
```bash
#!/bin/bash
if ! npm test 2>&1; then
  echo "Tests failing. Fix before completing task." >&2
  exit 2
fi
exit 0
```

### Async Hooks

Add `"async": true` to run hooks in the background without blocking Claude:

```json
{
  "type": "command",
  "command": "./run-tests.sh",
  "async": true,
  "timeout": 300
}
```

The result is delivered on the next conversation turn. Perfect for slow test suites.

### Hook Special Variables

- `$CLAUDE_PROJECT_DIR` — project root directory
- `${CLAUDE_PLUGIN_ROOT}` — plugin root (for plugin hooks)
- `$CLAUDE_ENV_FILE` — file path for persisting env vars (SessionStart only)
- `$CLAUDE_CODE_REMOTE` — set to `"true"` in web environments

### Gotcha: Hooks Snapshot at Session Start

Hooks are captured at startup. Mid-session edits to settings files don't take effect until you restart or review in `/hooks`. This is a security feature, not a bug.

---

## 3. Memory & Context — How Claude Remembers

### Memory Hierarchy (Load Order)

| Level | Location | Scope | Shared? |
|-------|----------|-------|---------|
| Managed policy | `/Library/Application Support/ClaudeCode/CLAUDE.md` | Org-wide | All users |
| User memory | `~/.claude/CLAUDE.md` | All projects | Just you |
| User rules | `~/.claude/rules/*.md` | All projects | Just you |
| Project memory | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Current project | Team (git) |
| Project rules | `./.claude/rules/*.md` | Current project | Team (git) |
| Local memory | `./CLAUDE.local.md` | Current project | Just you (gitignored) |
| Auto memory | `~/.claude/projects/<project>/memory/` | Per project | Just you |

**Key insight**: CLAUDE.md files in parent directories are loaded recursively up to (not including) root. CLAUDE.md files in child directories load on-demand when Claude reads files there.

### The @ Import Syntax

CLAUDE.md files can import other files:

```markdown
See @README for project overview and @package.json for npm commands.
Additional instructions: @docs/coding-standards.md
Home directory import: @~/.claude/my-project-rules.md
```

- Relative paths resolve from the file containing the import, not cwd
- Max depth: 5 hops of recursive imports
- Not evaluated inside code blocks/spans
- First-time imports show an approval dialog

### Auto Memory

Claude automatically saves learnings to `~/.claude/projects/<project>/memory/`:

```
memory/
├── MEMORY.md          # Index, first 200 lines loaded at startup
├── debugging.md       # Topic-specific detailed notes
├── api-conventions.md
└── ...
```

Only the first 200 lines of MEMORY.md are loaded. Claude reads topic files on demand. Force enable with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0`.

### .claude/rules/ — Modular Project Instructions

Organize instructions into focused files instead of one huge CLAUDE.md:

```
.claude/rules/
├── code-style.md    # Loaded unconditionally
├── testing.md
├── api-design.md
└── frontend/
    └── react.md     # Can have path-specific frontmatter
```

Path-scoped rules with frontmatter:

```yaml
---
paths:
  - "src/api/**/*.ts"
  - "src/**/*.{ts,tsx}"
---
# API Development Rules
- All endpoints must include input validation
```

### /init — Bootstrap Project Memory

Run `/init` to auto-generate a CLAUDE.md for your project. It scans the codebase and creates initial instructions with build commands, patterns, and conventions.

### Context Window Management

- `/compact` manually compacts conversation context
- Auto-compact triggers at ~95% capacity (override with `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`)
- Compaction summarizes older conversation turns to free space
- CLAUDE.md files are NOT compacted — they persist across compactions

---

## 4. MCP Servers — External Tool Integration

### Configuration Locations

| Location | Scope | Format |
|----------|-------|--------|
| `.mcp.json` (project root) | Project | JSON with `mcpServers` key |
| `~/.claude/settings.json` | User | Under `mcpServers` key |
| `--mcp-config ./file.json` | Session | CLI flag |

### Server Types

- **stdio**: Local process, communicates via stdin/stdout (most common)
- **sse**: Server-Sent Events over HTTP
- **streamable-http**: HTTP with streaming

### Configuration Format

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    }
  }
}
```

### Tool Naming Convention

MCP tools appear as: `mcp__<server-name>__<tool-name>`

Example: `mcp__github__search_repositories`, `mcp__filesystem__read_file`

### Most Useful MCP Servers (Community Consensus)

| Server | Stars | Use Case | Verdict |
|--------|-------|----------|---------|
| **Context7** | High | Up-to-date library docs | Essential for coding with docs |
| **GitHub** | High | Repo operations, PR management | Built into Claude Code already |
| **Playwright** | High | Browser automation | Great for testing |
| **PostgreSQL/SQLite** | Medium | Direct DB access | Useful for data work |
| **Filesystem** | Medium | Expanded file access | Claude already has file tools |
| **Brave Search** | Medium | Web search | Claude already has WebSearch |

### MCP vs Skills vs Custom Agents — Decision Matrix

| Need | Use |
|------|-----|
| External API/service integration | MCP server |
| Reusable prompt/workflow | Skill |
| Specialized AI behavior with tool restrictions | Custom agent |
| Automated lifecycle hook | Hook |

### MCP in Custom Agents

Agents can reference pre-configured MCP servers by name or define them inline:

```yaml
---
name: db-analyst
mcpServers:
  - postgres  # reference by name
  - name: custom-server
    command: npx
    args: ["-y", "my-mcp-server"]
---
```

---

## 5. Custom Agents — Your Secret Weapon

Custom agents defined in `.claude/agents/*.md` are the most underutilized Claude Code feature. They give you specialized AI workers with custom prompts, tool restrictions, and independent permissions.

### Why Custom Agents Matter

**Key insight**: Custom agents receive ONLY their markdown body as the system prompt — NOT the full default Claude Code system prompt. This means:
1. ~3,000+ fewer tokens of irrelevant instructions
2. Total control over the agent's behavior
3. Faster, more focused execution

### Agent File Format

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices. Use proactively after code changes.
tools: Read, Glob, Grep, Bash
model: sonnet
permissionMode: bypassPermissions
maxTurns: 20
---

You are a senior code reviewer. Analyze code and provide actionable feedback.

When invoked:
1. Run git diff to see recent changes
2. Focus on modified files
3. Provide feedback organized by priority
```

### All Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique ID (lowercase + hyphens) |
| `description` | Yes | When Claude should delegate to this agent. Include "use proactively" for auto-delegation. |
| `tools` | No | Allowlist of tools. Omit = inherit all. `Task(worker, researcher)` restricts subagent spawning. |
| `disallowedTools` | No | Denylist — removed from inherited/specified tools |
| `model` | No | `sonnet`, `opus`, `haiku`, or `inherit` (default) |
| `permissionMode` | No | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | No | Max agentic turns before stopping |
| `skills` | No | Skills to preload into agent's context (full content injected, not just available) |
| `mcpServers` | No | MCP servers available to this agent |
| `hooks` | No | Lifecycle hooks scoped to this agent |
| `memory` | No | Persistent memory scope: `user`, `project`, or `local` |
| `background` | No | Always run as background task |
| `isolation` | No | `worktree` for isolated git worktree |

### Agent Scope Priority (Highest Wins)

1. `--agents` CLI flag (session only)
2. `.claude/agents/` (project, commit to git)
3. `~/.claude/agents/` (user, all projects)
4. Plugin agents (installed plugins)

### Persistent Agent Memory

Give agents memory that survives across sessions:

```yaml
---
name: code-reviewer
memory: user
---
```

Creates `~/.claude/agent-memory/code-reviewer/` with a `MEMORY.md` entrypoint. First 200 lines loaded at agent start. Agent can read/write memory files to build knowledge over time.

### Real-World Agent Patterns

**Read-only researcher**: `tools: Read, Glob, Grep` + `model: haiku` — fast, cheap codebase exploration.

**Locked-down worker**: `tools: Read, Edit, Write, Bash` + `permissionMode: bypassPermissions` + `hooks` that validate commands — autonomous but safe.

**Domain expert**: Preload skills with detailed domain knowledge, restrict to relevant tools.

**Parallel worker**: `isolation: worktree` + `background: true` — runs in its own git worktree without blocking.

---

## 6. Multi-Agent Workflows — Scaling Claude Code

### Built-in Agent Types

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| `Explore` | Haiku | Read-only | Fast codebase search (specify thoroughness: quick/medium/very thorough) |
| `Plan` | Inherit | Read-only | Research for plan mode |
| `general-purpose` | Inherit | All | Complex multi-step tasks |
| `Bash` | Inherit | Bash only | Terminal commands in separate context |
| `Claude Code Guide` | Haiku | Read-only | Questions about Claude Code features |

### Spawning Subagents (Task Tool)

```
Task tool:
  subagent_type: "code-reviewer"  # or built-in type
  description: "Review auth changes"
  prompt: "Review the authentication module changes..."
  model: "sonnet"  # optional override
  run_in_background: true  # non-blocking
  isolation: "worktree"  # isolated git copy
```

**Key constraint**: Subagents CANNOT spawn other subagents. No nesting. If you need delegation chains, use skills or chain from the main conversation.

### Agent Teams (Experimental)

Agent teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings or env. They coordinate full Claude Code sessions (not subagents) through shared task lists and mailboxes.

```
TeamCreate → TaskCreate → Task (spawn agents) → SendMessage → TaskUpdate
```

Teams create shared task lists at `~/.claude/tasks/{team-name}/` and team configs at `~/.claude/teams/{team-name}/config.json`.

Agents communicate via `SendMessage` with types: `message` (DM), `broadcast` (all), `shutdown_request`.

**Display modes**: `in-process` (default, single terminal, Shift+Down to cycle), `tmux` (split panes), or `iTerm2` (tabs). Set via `--teammate-mode` or `"teammateMode"` in settings.

**Known bug**: `TaskOutput(block=true)` hangs with multiple simultaneous background agents (GitHub #17540, #20236). Workaround: spawn parallel agents in a single message without `run_in_background`.

### Foreground vs Background Agents

- **Foreground**: Blocks main conversation. Permission prompts pass through to user. Use for critical tasks.
- **Background**: Runs concurrently. Permissions must be pre-approved before launch. MCP tools unavailable. Use for independent work.

Press **Ctrl+B** to background a running foreground task.

### Worktree Isolation for Parallel Work

```bash
claude -w feature-auth   # Creates .claude/worktrees/feature-auth/
claude -w bugfix-123      # Independent worktree with its own branch
```

Each worktree has its own files and branch. Auto-cleanup on exit (removed if no changes, prompted if changes exist). Add `.claude/worktrees/` to `.gitignore`.

---

## 7. The Agent SDK — Programmatic Claude Code

The Claude Agent SDK gives you Claude Code as a library. Same tools, same agent loop, but programmable.

### Packages

- **TypeScript**: `npm install @anthropic-ai/claude-agent-sdk`
- **Python**: `pip install claude-agent-sdk`

### Basic Usage

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "bypassPermissions"
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Key SDK Options

```typescript
{
  prompt: string,
  options: {
    allowedTools: string[],        // Tool allowlist
    disallowedTools: string[],     // Tool denylist
    permissionMode: string,        // Permission mode
    model: string,                 // Model override
    resume: string,                // Session ID to resume
    maxTurns: number,              // Turn limit
    mcpServers: {},                // MCP server configs
    agents: {},                    // Inline agent definitions
    hooks: {},                     // Lifecycle hooks (callback functions)
    sandbox: {},                   // Command sandboxing
    settingSources: string[],      // Which settings to load
    plugins: string[],             // Plugin directories
  }
}
```

### SDK Hooks (Different from CLI Hooks)

SDK hooks use JavaScript/Python callbacks instead of shell commands:

```typescript
const logFileChange = async (input) => {
  const filePath = input.tool_input?.file_path ?? "unknown";
  await appendFile("./audit.log", `${new Date().toISOString()}: modified ${filePath}\n`);
  return {};
};

for await (const message of query({
  prompt: "Refactor utils.py",
  options: {
    hooks: {
      PostToolUse: [{ matcher: "Edit|Write", hooks: [logFileChange] }]
    }
  }
})) { ... }
```

### Session Management via SDK

```typescript
let sessionId;

// First query — capture session ID
for await (const msg of query({ prompt: "Read the auth module", options: { allowedTools: ["Read", "Glob"] } })) {
  if (msg.type === "system" && msg.subtype === "init") sessionId = msg.session_id;
}

// Resume with full context
for await (const msg of query({ prompt: "Now find all callers", options: { resume: sessionId } })) {
  if ("result" in msg) console.log(msg.result);
}
```

### SDK vs CLI — When to Use Each

| Use Case | Best Choice |
|----------|-------------|
| Interactive development | CLI |
| CI/CD pipelines | SDK |
| Custom applications | SDK |
| One-off tasks | CLI |
| Production automation | SDK |

---

## 8. Skills & Plugins — Extending Claude Code

### Plugin Structure

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json         # Manifest
├── skills/
│   └── skill-name/
│       ├── SKILL.md        # Skill definition (YAML frontmatter + markdown)
│       └── references/     # Supporting docs
├── commands/
│   └── command.md          # User-facing slash commands
├── agents/
│   └── agent.md            # Agent definitions
├── hooks/
│   └── hooks.json          # Lifecycle hooks
└── templates/              # Script templates
```

### SKILL.md Format

```yaml
---
name: test-driven-development
description: >
  Use when implementing features or fixing bugs.
  Write the test first, watch it fail, write minimal code to pass.
version: 1.0.0
argument-hint: "[feature-name]"           # Shown in autocomplete
disable-model-invocation: true            # Prevent auto-invocation; user must type /name
user-invocable: false                     # Hide from / menu; only Claude can invoke
allowed-tools: Read, Grep, Glob, Bash     # Tools available without per-use approval
model: sonnet                             # Model override when active
context: fork                            # Run in forked subagent context
agent: Explore                            # Which subagent to use with context: fork
credentials:
  - key: MY_API_KEY
    label: "My Service API Key"
    description: "Get your key at example.com"
    required: true
hooks:                                    # Skill-scoped lifecycle hooks
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
---

# Test-Driven Development

When implementing any feature:
1. Write the failing test first
2. Run and confirm failure
3. Write minimal code to pass
...
```

**String substitutions available in skill content:**

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments after the skill name |
| `$ARGUMENTS[N]` or `$N` | Positional argument by 0-based index |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `` !`command` `` | Shell preprocessing — output replaces placeholder before Claude sees it |

### Plugin Commands

```bash
claude plugin install <name>@<marketplace>    # Install from marketplace
claude plugin install <name> --scope project  # Install to project settings
claude plugin list                            # List installed
claude plugin remove <name>                   # Remove plugin
claude plugin enable <name>                   # Enable without reinstalling
claude plugin disable <name>                  # Disable without removing
claude plugin update <name>                   # Update to latest
claude plugin validate .                      # Validate plugin structure
```

**Marketplace management:**
```bash
/plugin marketplace add anthropics/claude-code          # Official GitHub format
/plugin marketplace add https://gitlab.com/co/plugins.git#v1.0  # Specific tag
/plugin marketplace list
/plugin marketplace update <name>
/plugin marketplace remove <name>
```

**Official marketplace**: 52+ plugins including LSP for 11 languages, dev workflow tools, security plugins, and integrations (GitHub, Slack, Stripe, Supabase, Figma, Vercel, Linear, Notion, Sentry, Firebase, PostHog).

**Plugin caching gotcha**: Installed plugins are copied to `~/.claude/plugins/cache/`. Paths referencing files outside the plugin dir (`../shared-utils`) will break. Always use `${CLAUDE_PLUGIN_ROOT}` for paths.

### Invoking Skills

Skills are invoked via the Skill tool or slash commands:

```
/tdd              # Invoke the test-driven-development skill
Skill tool: skill = "test-driven-development"
```

### Skills in Settings

Skills live in `.claude/skills/` and auto-load when the skill is invoked.

### Plugin Extras

**LSP servers** (`.lsp.json` in plugin root): Provide real-time code intelligence — diagnostics after edits, go-to-definition, find-references:
```json
{ "go": { "command": "gopls", "args": ["serve"], "extensionToLanguage": { ".go": "go" } } }
```

**Default agent** (`settings.json` in plugin root): A plugin can activate a specific agent as the main thread:
```json
{ "agent": "security-reviewer" }
```

**Running skills in subagent context**: Use `context: fork` to run a skill in an isolated subagent instead of the main conversation:
```yaml
---
name: deep-research
context: fork
agent: Explore    # Options: Explore, Plan, general-purpose, or custom agent name
---
```

### Key Insight: Skills vs Agents vs MCP

- **Skills** = reusable prompts that run in the CURRENT context (or forked subagent with `context: fork`). Good for workflows, processes, domain knowledge.
- **Agents** = isolated workers with their OWN context and tool restrictions. Good for delegation.
- **MCP** = external tools/services. Good for integrating databases, APIs, browsers.
- **Hooks** = automated lifecycle actions. Good for enforcement, validation, notifications.

---

## 9. Advanced Patterns & Power User Techniques

### Pattern 1: Claude Code in CI/CD

```yaml
# .github/workflows/review.yml
name: Claude Code Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Claude Code
        run: curl -fsSL https://claude.ai/install.sh | bash
      - name: Review PR
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p --dangerously-skip-permissions \
            --max-turns 10 --max-budget-usd 2.00 \
            --output-format json \
            "Review the changes in this PR. Focus on security, correctness, and test coverage."
```

### Pattern 2: Pipe Claude into Your Workflow

```bash
# Explain build errors
cat build-error.txt | claude -p "explain the root cause" > diagnosis.txt

# Generate commit messages
git diff --staged | claude -p "write a concise commit message for these changes"

# Custom linter
claude -p 'look at changes vs main, report typos. filename:line on one line, issue on next.'

# Generate test cases
cat src/auth.ts | claude -p "generate edge case test scenarios for this module" > test-cases.md
```

### Pattern 3: Multi-Step Implementation Pipeline

```
1. Plan: claude --permission-mode plan "Design the auth system"
2. Implement: claude "Implement the plan" (interactive, verify each step)
3. Review: Dispatch code-reviewer subagent
4. Test: Run test suite via hooks
5. Commit: /commit-push-pr
```

### Pattern 4: Self-Reviewing Agents

Use a Stop hook with a prompt-based evaluator:

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "agent",
        "prompt": "Verify the implementation is complete. Check: 1) all tests pass 2) no TODOs remain 3) code follows project conventions. $ARGUMENTS",
        "timeout": 120
      }]
    }]
  }
}
```

### Pattern 5: Environment Setup via SessionStart Hooks

```bash
#!/bin/bash
# .claude/hooks/setup-env.sh
if [ -n "$CLAUDE_ENV_FILE" ]; then
  source ~/.nvm/nvm.sh
  nvm use 20

  ENV_BEFORE=$(export -p | sort)
  # Your setup commands here
  ENV_AFTER=$(export -p | sort)
  comm -13 <(echo "$ENV_BEFORE") <(echo "$ENV_AFTER") >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

### Pattern 6: Structured Output for Automation

```bash
claude -p --json-schema '{
  "type": "object",
  "properties": {
    "bugs": { "type": "array", "items": { "type": "object", "properties": {
      "file": {"type": "string"}, "line": {"type": "number"}, "severity": {"type": "string"}, "description": {"type": "string"}
    }}}
  }
}' "Find bugs in the auth module"
```

---

## 10. Known Gotchas & Undocumented Behavior

### The CLAUDECODE Environment Variable Trap

When Claude Code launches, it sets `CLAUDECODE=true` in the environment. This **blocks nested Claude Code sessions**. If you're spawning `claude` from within a Claude Code session (e.g., via Bash tool), you need to unset this or use the Task tool instead.

### stdin.end() in Print Mode

When using `-p` mode programmatically, you MUST call `stdin.end()` after writing input, or Claude will hang waiting for more input. This catches people building Node.js wrappers.

### Permission Inheritance in Subagents

- Subagents inherit the parent's permission context
- If parent uses `bypassPermissions`, this takes precedence and cannot be overridden by the subagent
- Background subagents must pre-approve permissions before launch — they auto-deny anything not pre-approved
- MCP tools are NOT available in background subagents

### Custom Agents Drop Default System Prompt

When you use `subagent_type: "my-custom-agent"`, the agent receives ONLY its markdown body as the system prompt. It does NOT get the default Claude Code system prompt. This means if you don't include tool usage instructions (Use Read instead of cat, etc.), the agent won't follow them.

### Settings Snapshot at Startup

Hooks are captured at session start. Edits to settings files during a session are detected and flagged for review, but don't auto-apply. This prevents malicious mid-session hook injection.

### Context Window Compaction

- Auto-compact at ~95% capacity
- Compaction summarizes older turns
- CLAUDE.md files are NOT compacted — they stay in context forever
- Subagent transcripts are independent of main session compaction
- Override threshold: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50`

### Shell Profile Interference with Hooks

If your shell profile (.zshrc, .bashrc) prints text on startup, it interferes with hook JSON parsing. Hook stdout must be ONLY the JSON object. Redirect profile output or use `--norc` in your hook scripts.

### File Size Limits

Read tool: up to 2000 lines by default, 2000 char line truncation. Use `offset` and `limit` for large files. PDFs: max 20 pages per request.

### Model Availability

- `opus` = Claude Opus 4.6 (most capable, slowest)
- `sonnet` = Claude Sonnet 4.6 (balanced)
- `haiku` = Claude Haiku 4.5 (fastest, cheapest)
- Models are aliases — actual IDs are `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`

### The --debug Flag Categories

`claude --debug "api,hooks"` — show only these categories. `claude --debug "!statsig,!file"` — show everything except these. Useful for narrowing verbose output.

### Thinking Mode Nuances

- Opus 4.6 uses adaptive reasoning (effort level, not fixed budget)
- Other models use fixed budget up to 31,999 tokens
- `MAX_THINKING_TOKENS=0` disables thinking on any model
- Phrases like "think hard" or "ultrathink" are NOT special — they're just prompt text
- Thinking tokens cost money even though Claude 4 models show summarized thinking
- Toggle with Option+T (Mac) or Alt+T

### Keyboard Shortcuts

- `Shift+Tab` — cycle permission modes (Normal → Auto-Accept → Plan)
- `Ctrl+O` — toggle verbose mode (see thinking, hook output)
- `Ctrl+B` — background a running task
- `Ctrl+G` — open plan in text editor
- `Option+T` / `Alt+T` — toggle thinking mode

---

## 11. Interactive Mode Features

### Slash Commands

| Command | What It Does |
|---------|-------------|
| `/compact` | Manually compact context |
| `/memory` | Open memory file selector |
| `/init` | Bootstrap CLAUDE.md for project |
| `/hooks` | Interactive hooks manager |
| `/agents` | Manage subagents |
| `/model` | Switch model/configure effort |
| `/resume` | Switch to a different session |
| `/rename` | Name current session |
| `/config` | Toggle global settings |
| `/statusline` | Configure status line |
| `/bug` | Report a bug |
| `/help` | Get help |

### @ References

- `@src/auth.ts` — include file contents in conversation
- `@src/components/` — include directory listing
- `@github:repos/owner/repo/issues` — MCP resource reference

### Session Picker Shortcuts

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate sessions |
| `→/←` | Expand/collapse groups |
| `P` | Preview session |
| `R` | Rename session |
| `/` | Search/filter |
| `A` | Toggle all projects |
| `B` | Filter by current branch |

---

## 12. X Reply Cheat Sheet — 20 Tweet-Worthy Insights

Use these to reply to Claude Code threads like a genuine expert:

1. **"Most people use --append-system-prompt when they should use --system-prompt. The append version keeps all default behavior. The replace version drops EVERYTHING — tool instructions, git safety, all of it. Know the difference."**

2. **"The real power of Claude Code isn't the chat. It's hooks. A PreToolUse hook that validates Bash commands + a Stop hook that checks test results = an agent that can't ship broken code."**

3. **"Custom agents (.claude/agents/*.md) get ONLY their markdown body as the system prompt — NOT the default 4K token Claude Code prompt. That's 3,000+ tokens saved per agent invocation. And you control everything."**

4. **"If you're not using --worktree, you're doing parallel work wrong. `claude -w feature-auth` gives you an isolated git branch and directory. Two agents, two worktrees, no conflicts."**

5. **"Pro tip: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50` triggers compaction at 50% context instead of 95%. Your agent maintains better quality longer because it compacts before context gets stale."**

6. **"The CLAUDECODE env var blocks nested sessions. If your Bash tool spawns `claude`, it'll fail silently. Use the Task tool for agent-in-agent patterns, not raw CLI calls."**

7. **"--json-schema in print mode gives you VALIDATED structured output. `claude -p --json-schema '{...}' 'find bugs'` returns JSON that matches your schema or errors. No more parsing freeform text."**

8. **"Stop using -p for everything. Use the Agent SDK (`@anthropic-ai/claude-agent-sdk`). Same tools, same agent loop, but with proper TypeScript types, streaming, sessions, and programmatic hooks. It's what CI/CD should use."**

9. **"Hook types most people don't know about: `type: 'prompt'` sends your hook to a fast Claude model for evaluation. `type: 'agent'` spawns a multi-turn subagent with tool access. No shell scripts needed."**

10. **"The --max-budget-usd flag is your CI safety net. `claude -p --max-budget-usd 2.00 --max-turns 10 'review this PR'` — hard stops on both cost AND turns. No runaway agents in your pipeline."**

11. **"Subagent persistent memory is criminally underused. Add `memory: user` to your agent frontmatter and it builds up institutional knowledge across sessions. Your code reviewer gets better every time."**

12. **"TaskCompleted hooks let you enforce quality gates: `exit 2` if tests fail = the task literally cannot be marked done. Combine with TeammateIdle hooks to prevent agents from stopping prematurely."**

13. **"CLAUDE.md import syntax: `@docs/coding-standards.md` in your CLAUDE.md loads that file into context. Max 5 levels deep. The @ in CLAUDE.md is NOT the same as @ in the chat prompt."**

14. **".claude/rules/*.md with path-specific frontmatter: `paths: ['src/api/**/*.ts']` means those rules only apply when Claude works on matching files. Scoped instructions without prompt bloat."**

15. **"For multi-turn scripting: `claude -c -p 'fix the tests'` continues the last session in print mode. Chain multiple -c -p calls for a scripted multi-step workflow. Each call gets full conversation history."**

16. **"The SessionStart hook has a superpower: CLAUDE_ENV_FILE. Write `export` statements to it and they persist for ALL subsequent Bash commands in the session. Perfect for nvm, conda, virtualenvs."**

17. **"--fallback-model sonnet in CI means your pipeline doesn't break during Opus overload. Primary model tries first, fallback kicks in automatically. Zero code changes needed."**

18. **"PreToolUse hooks can MODIFY tool input, not just block it. Return `updatedInput` in your JSON to rewrite the Bash command before it executes. Auto-add --dry-run, inject env vars, sanitize paths."**

19. **"Background subagents (run_in_background: true) can't use MCP tools and must pre-approve all permissions before launch. This catches people who try to use Playwright MCP in background agents."**

20. **"The Explore agent uses Haiku for speed. It's read-only and can't edit files. Specify thoroughness in your prompt: 'quick' for focused lookups, 'very thorough' for comprehensive analysis. Costs pennies."**

---

## Sources

- [Claude Code Docs](https://code.claude.com/docs/en/overview)
- [CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Memory Docs](https://code.claude.com/docs/en/memory)
- [Subagents Docs](https://code.claude.com/docs/en/sub-agents)
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Common Workflows](https://code.claude.com/docs/en/common-workflows)
- [Claude Code GitHub](https://github.com/anthropics/claude-code)
- Internal superbot2 research: `system-prompt-research.md`, `plugin-authoring.md`
