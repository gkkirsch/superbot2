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

1. Directory exists at `~/.superbot2/skills/<plugin-name>/`
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
