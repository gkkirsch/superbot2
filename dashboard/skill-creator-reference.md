# Claude Code Plugin Specification Reference

This is the complete reference for all plugin file formats, fields, and options. Consult this when you need precise field names, value formats, or examples.

## plugin.json — Plugin Manifest

Location: `.claude-plugin/plugin.json`

```json
{
  "name": "plugin-slug",
  "version": "1.0.0",
  "description": "What this plugin does — max 1024 chars",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "keywords": ["keyword1", "keyword2", "pack:category"],
  "skills": ["./skills/skill-name"],
  "commands": "./commands/",
  "agents": "./agents/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

**Field rules**:
- `name`: Required. Kebab-case, lowercase letters/digits/hyphens, max 64 chars
- `version`: Semver format (e.g. "1.0.0")
- `description`: Max 1024 chars, no angle brackets
- `skills`: Array of relative paths to skill directories (starting with `./`)
- `commands`, `agents`, `hooks`, `mcpServers`: Relative paths starting with `./`
- Only include fields for components that exist in the plugin

## SKILL.md — Skill Definition

Location: `skills/<skill-name>/SKILL.md`

### Frontmatter (YAML between `---` delimiters)

```yaml
---
name: skill-name
description: >
  When to use this skill. Include specific trigger phrases and scenarios.
  Example: "Use when the user asks to format, lint, or prettify SQL queries,
  or when they paste raw SQL and want it cleaned up."
version: 1.0.0
credentials:
  - key: API_KEY_NAME
    label: "Human-readable label"
    description: "Where to get this credential and what it's used for"
    required: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
context: fork
agent: Explore
argument-hint: "[query or file path]"
disable-model-invocation: false
user-invocable: true
---
```

**Frontmatter fields**:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Kebab-case identifier, max 64 chars |
| `description` | Yes | When to trigger. Max 1024 chars. Be specific with scenarios |
| `version` | No | Semver, defaults to 1.0.0 |
| `credentials` | No | Array of credential declarations (see below) |
| `allowed-tools` | No | Comma-separated tool names the skill can use |
| `model` | No | Model override: `sonnet`, `opus`, `haiku` |
| `context` | No | `fork` = run in isolated subagent context |
| `agent` | No | Subagent type when context=fork: `Explore`, `general-purpose`, etc. |
| `argument-hint` | No | Autocomplete hint shown after `/skill-name` |
| `disable-model-invocation` | No | If true, skill only triggers via `/command`, never auto-invoked |
| `user-invocable` | No | If true, appears in `/` menu for manual invocation |

### String Substitution Variables

Skills can use these variables in the SKILL.md body. They are replaced with actual values before Claude processes the skill.

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments after the skill name (e.g., `/my-skill these are the arguments` → `these are the arguments`) |
| `$ARGUMENTS[N]` or `$N` | Positional argument by 0-based index (e.g., `$0` is the first argument) |
| `${CLAUDE_SESSION_ID}` | Current Claude Code session ID |
| `` !`command` `` | Shell preprocessing — the command runs and its stdout replaces the placeholder before Claude sees the skill body |

**Example usage in SKILL.md body:**

```markdown
Analyze the file at: $0

Session: ${CLAUDE_SESSION_ID}

Current git branch: !`git branch --show-current`
```

### context: fork — Isolated Execution

When a skill sets `context: fork` in its frontmatter, it runs in an isolated subagent rather than inline in the main conversation.

**When to use `context: fork`:**
- The skill does heavy or long-running work that shouldn't block the main conversation
- The skill is read-only research that doesn't need to edit the user's files
- You want the skill to run in an isolated context without polluting the main conversation

**When NOT to use fork:**
- The skill needs to edit files in the user's project — use default inline mode instead
- The skill needs to interact with the user via follow-up questions
- The skill is lightweight and should run in the main conversation

**Available `agent` types for fork:** `Explore` (fast, read-only), `Plan` (read-only, research), `general-purpose` (full tool access including file editing)

```yaml
# Example: a research skill that runs in a fast read-only subagent
context: fork
agent: Explore
```

### Body (after frontmatter)

The SKILL.md body contains the instructions Claude follows when the skill is invoked. Write clear, actionable instructions. Keep under 500 lines — use `references/` for detailed docs.

### Credential Declaration

```yaml
credentials:
  - key: OPENAI_API_KEY
    label: "OpenAI API Key"
    description: "Get from https://platform.openai.com/api-keys"
    required: true
  - key: WEBHOOK_URL
    label: "Webhook URL"
    description: "Optional webhook for notifications"
    required: false
```

Credentials are stored in the macOS Keychain:
- Service: `superbot2-plugin-credentials`
- Account: `<pluginName>/<key>`
- Retrieve: `security find-generic-password -s superbot2-plugin-credentials -a "plugin-name/KEY" -w`

## Command .md — Slash Commands

Location: `commands/<command-name>.md`

```yaml
---
description: "What the command does — shown in / menu"
allowed-tools: [Read, Write, Edit, Bash]
argument-hint: "[optional args]"
model: opus
skills: skill-name
---
```

The body contains the command's instructions. When `skills` is set, invoking the command also loads the named skill.

## Agent .md — Subagents

Location: `agents/<agent-name>.md`

```yaml
---
name: agent-name
description: "When Claude should automatically invoke this subagent"
model: sonnet
tools: [Read, Write, Bash]
memory: user
---
```

**Agent fields**:
- `model`: `inherit` | `sonnet` | `opus` | `haiku`
- `tools`: Restrict which tools the agent can use
- `memory`: `user` for persistent memory across invocations

The body contains the agent's system instructions.

## hooks.json — Event Hooks

Location: `hooks/hooks.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/scripts/handler.sh",
          "timeout": 600
        }]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/scripts/on-stop.sh",
          "timeout": 30
        }]
      }
    ]
  }
}
```

**Hook events**: PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, UserPromptSubmit, Notification, Stop, SubagentStart, SubagentStop, TeammateIdle, TaskCompleted, PreCompact, SessionStart, SessionEnd, ConfigChange

**Variables available in hook commands**:
- `${CLAUDE_PLUGIN_ROOT}` — absolute path to the plugin's root directory
- Hook stdin receives a JSON object with event-specific data

## .mcp.json — MCP Server Configuration

Location: `.mcp.json` (plugin root)

```json
{
  "mcpServers": {
    "server-name": {
      "command": "${CLAUDE_PLUGIN_ROOT}/bin/server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": {
        "API_KEY": "your-key-here"
      }
    }
  }
}
```

MCP servers provide custom tools to Claude. The server must implement the MCP protocol (stdio transport).

## settings.json — Default Settings

Location: `settings.json` (plugin root)

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)"],
    "deny": ["Bash(rm -rf *)"]
  }
}
```

## Validation Checklist

After creating a plugin, verify:

1. Directory exists at the draft output path specified in your system context
2. `.claude-plugin/plugin.json` exists and is valid JSON
3. `plugin.json` `name` matches the directory name
4. All paths in `plugin.json` start with `./` and point to existing files/directories
5. Each skill has a `SKILL.md` with valid YAML frontmatter
6. Frontmatter `name` is kebab-case, max 64 chars
7. Frontmatter `description` is max 1024 chars, no angle brackets
8. All referenced scripts are executable (`chmod +x`)
9. hooks.json is valid JSON if present
10. .mcp.json is valid JSON if present

## Example Patterns

### Pattern 1: Simple Reference Skill

A skill that provides guidance on a topic. No tools needed beyond reading.

```
my-skill/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── my-skill/
        ├── SKILL.md          # Core instructions
        └── references/
            └── detailed-guide.md  # In-depth reference
```

SKILL.md body tells Claude the key rules and says "Read references/detailed-guide.md for full details."

### Pattern 2: Agentic Workflow Skill

A skill that performs multi-step work using tools.

```
deploy-helper/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── deploy/
        ├── SKILL.md
        └── scripts/
            ├── check-prerequisites.sh
            └── deploy.sh
```

SKILL.md describes the deployment workflow step-by-step, referencing scripts to run.

### Pattern 3: Full Plugin with Commands + Hooks

A comprehensive plugin with multiple components.

```
code-quality/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── lint/
│       └── SKILL.md
├── commands/
│   ├── lint.md
│   └── format.md
├── hooks/
│   └── hooks.json       # Pre-commit linting hook
└── agents/
    └── reviewer.md      # Code review subagent
```

### Pattern 4: MCP Server Plugin

A plugin that adds custom tools via MCP.

```
database-tools/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── skills/
│   └── db-query/
│       └── SKILL.md
└── bin/
    └── mcp-server.js    # MCP server implementation
```

### Pattern 5: Standalone SKILL.md (Layer 1)

The simplest option — a single file with no plugin directory structure.

```
draft-root/
  SKILL.md
```

SKILL.md contains YAML frontmatter and instructions. No plugin.json needed.

## metadata.superbot -- Superbot-Enhanced Metadata

Location: Inside SKILL.md frontmatter, under the `metadata.superbot` key. This extends a Layer 2 plugin with dashboard integration, dependency management, and credential storage.

### Full Example

```yaml
---
name: my-tool-skill
description: >
  Use when the user asks to run my-tool commands.
  Triggers: "run my-tool", "use my-tool to analyze".
  NOT for: general shell commands.
version: 1.0.0
allowed-tools: Read, Bash

metadata:
  superbot:
    emoji: "wrench"
    icon: "wrench"
    scope: "global"
    requires:
      bins: ["my-binary"]
    install:
      - id: brew
        kind: brew
        formula: my-tap/my-binary
        bins: ["my-binary"]
        label: "Install via Homebrew"
      - id: manual
        kind: manual
        label: "Download from the website"
        url: "https://example.com/downloads"
    credentials:
      - key: MY_API_KEY
        label: "My Service API Key"
        description: "Get your key at example.com/api"
        required: true
---
```

### Fields

#### `emoji`

Display icon for the skill on the dashboard. Use a text description of the emoji (e.g., `"wrench"`, `"lock"`, `"rocket"`).

#### `icon`

Lucide icon name for dashboard display (e.g., `"megaphone"`, `"database"`, `"globe"`). Browse available icons at [lucide.dev](https://lucide.dev). This is separate from `emoji` — `icon` renders as an SVG icon in the dashboard UI.

#### `scope`

Controls where the skill stores its data. Values: `"space"` or `"global"` (default).

- `"global"` — skill data is stored in `~/.superbot2/skill-data/<skillId>/`, shared across all spaces
- `"space"` — skill data is stored per-space, isolating data between different workspaces

Use `"space"` when the skill manages data that is specific to a project or workspace (e.g., project-specific configs, local caches). Use `"global"` (or omit) when the skill's data should be shared everywhere (e.g., API integrations, cross-project tools).

#### `requires.bins`

Array of CLI binary names that must be present on `PATH` for the skill to function.

```yaml
requires:
  bins: ["gh", "jq"]
```

The dashboard checks for these binaries and shows a warning if any are missing.

#### `install`

Array of install options. Each option tells the user (or the dashboard) how to install the required binaries. Every install option has these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier for this install option |
| `kind` | Yes | Install method (see table below) |
| `label` | Yes | Human-readable label shown in the UI |
| `bins` | No | Which binaries this option installs |

**`kind` values:**

| kind | Use for | Extra fields |
|------|---------|-------------|
| `brew` | Homebrew formula or tap | `formula` (required) |
| `npm` | npm global package (`npm install -g`) | `package` (required) |
| `pip` | Python package (`pip install`) | `package` (required) |
| `script` | Custom install script | `command` (required) |
| `github-release` | Binary from GitHub releases | `url` (required) |
| `manual` | Manual instructions with a link | `url` (required) |

**Examples for each kind:**

```yaml
# Homebrew
- id: brew
  kind: brew
  formula: 1password-cli
  bins: ["op"]
  label: "Install 1Password CLI (Homebrew)"

# npm
- id: npm
  kind: npm
  package: prettier
  bins: ["prettier"]
  label: "Install via npm"

# pip
- id: pip
  kind: pip
  package: awscli
  bins: ["aws"]
  label: "Install via pip"

# Script
- id: script
  kind: script
  command: "curl -fsSL https://example.com/install.sh | sh"
  bins: ["my-tool"]
  label: "Install via script"

# GitHub release
- id: github
  kind: github-release
  url: "https://github.com/org/tool/releases"
  bins: ["tool"]
  label: "Download from GitHub releases"

# Manual
- id: manual
  kind: manual
  url: "https://example.com/docs/install"
  label: "See install instructions"
```

#### `credentials`

Array of API keys or tokens the skill needs. These are stored in the macOS Keychain and managed through the dashboard.

```yaml
credentials:
  - key: OPENAI_API_KEY
    label: "OpenAI API Key"
    description: "Get yours at platform.openai.com/api-keys"
    required: true
  - key: WEBHOOK_URL
    label: "Webhook URL"
    description: "Optional webhook for notifications"
    required: false
```

| Field | Required | Description |
|-------|----------|-------------|
| `key` | Yes | Environment variable name the skill will use |
| `label` | Yes | Human-readable label shown in the dashboard |
| `description` | No | Help text — where to get the credential |
| `required` | No | If true, dashboard shows a warning when missing. Defaults to false |

**Storage details:**
- Service: `superbot2-plugin-credentials`
- Account: `<pluginName>/<key>`
- Retrieve: `security find-generic-password -s superbot2-plugin-credentials -a "plugin-name/KEY" -w`

### When to Use metadata.superbot

Use it when a skill needs any of the following:
- An icon on the dashboard (`emoji`)
- External CLI binaries that must be installed (`requires.bins` + `install`)
- API keys or tokens from the user (`credentials`)

Both `requires`/`install` and `credentials` can coexist in the same skill -- for example, a skill that wraps a CLI tool and also needs an API key.

## Real-World Skill Examples

These are abbreviated examples of real working skills to illustrate common patterns.

### Example A: Dashboard Card Skill (social-media-approvals)

A skill that provides a dashboard card for reviewing and approving social media post drafts.

```yaml
---
name: social-media-approvals
description: >
  Use when queuing social media post drafts for human approval before
  publishing. Triggers: "queue post for approval", "draft social media post",
  "submit post for review". NOT for: direct posting without review.
version: 1.0.0
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
user-invocable: true
argument-hint: "[platform] [post content]"

metadata:
  superbot:
    emoji: "megaphone"
    icon: "megaphone"
    scope: "space"
---
```

**Body pattern:** Instructions for writing drafts to a `data.jsonl` file, one JSON object per line. Includes a `scripts/queue-post.sh` helper for appending entries. The dashboard card reads `data.jsonl` to render a review queue.

### Example B: Browser Automation Skill (superbot-browser)

A skill that automates a real Chrome profile via Chrome DevTools Protocol (CDP).

```yaml
---
name: superbot-browser
description: >
  Browser automation using the superbot2 Chrome profile via CDP. Use when you
  need to automate web interactions that require authenticated sessions.
  Triggers: "automate browser", "navigate to", "fill out form on",
  "take screenshot of page". NOT for: headless scraping without auth.
version: 1.0.0
allowed-tools: Bash, Read, Write
user-invocable: true
argument-hint: "[url or action]"
---
```

**Body pattern:** Instructions for connecting to Chrome on a specific CDP port, navigating pages, filling forms, clicking elements, and taking screenshots. Uses `Bash` to run CDP commands via a helper script.

### Example C: Simple Reference Skill (coding-standards)

A lightweight skill that provides coding guidelines — no scripts, no tools beyond reading.

```yaml
---
name: coding-standards
description: >
  Use when the user asks about coding standards, style guidelines, or best
  practices for this project. Triggers: "what are our coding standards",
  "style guide", "naming conventions". NOT for: linting or auto-formatting code.
version: 1.0.0
allowed-tools: Read
user-invocable: true
---
```

**Body pattern:** A concise set of rules (naming conventions, file structure, commit message format) in the SKILL.md body. Detailed language-specific guides live in `references/typescript.md`, `references/python.md`, etc., loaded on demand with "Read references/..." instructions.
