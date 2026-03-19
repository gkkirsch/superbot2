---
name: claude-code-deep-dive
description: >
  Systematically analyze the Claude Code CLI source to find undocumented features,
  interesting patterns, and generate tweet-worthy technical insights.
  Triggers: "analyze claude code", "find undocumented features", "deep dive CLI source",
  "claude code internals", "what's hidden in claude code", "reverse engineer claude code",
  "deep dive hooks", "deep dive agents", "deep dive tools", "deep dive skills".
  NOT for: using Claude Code features (use claude-code-guide), building with the API
  (use claude-developer-platform), general CLI help.
allowed-tools: Read, Grep, Glob, Bash, Write
argument-hint: "[focus area]  # e.g. /claude-code-deep-dive hooks, agents, tools, env vars, skills"
metadata:
  superbot:
    emoji: "🔬"
---

# Claude Code Deep Dive — Source Analysis

Analyze the Claude Code CLI source bundle to find undocumented features, interesting patterns, and generate tweet-worthy technical insights.

## Focus Area

$ARGUMENTS

If no focus area was provided, do a general sweep across all pattern categories below.

If a focus area was provided, concentrate your search on that area but still note anything interesting you encounter.

## Step 1: Locate the CLI Source

The CLI source is a single minified JavaScript bundle. Find it:

```bash
# Primary location (asdf Node.js)
CLI_SOURCE="$HOME/.asdf/installs/nodejs/20.9.0/lib/node_modules/@anthropic-ai/claude-code/cli.js"

# Fallback: find it dynamically
if [ ! -f "$CLI_SOURCE" ]; then
  CLI_SOURCE=$(find "$HOME/.asdf" "$HOME/.nvm" "/usr/local/lib" "/opt/homebrew/lib" \
    -name "cli.js" -path "*/@anthropic-ai/claude-code/*" 2>/dev/null | head -1)
fi

# Last resort: resolve from the claude binary
if [ ! -f "$CLI_SOURCE" ]; then
  CLAUDE_BIN=$(which claude 2>/dev/null)
  if [ -n "$CLAUDE_BIN" ]; then
    CLAUDE_REAL=$(readlink -f "$CLAUDE_BIN" 2>/dev/null || realpath "$CLAUDE_BIN" 2>/dev/null)
    CLI_SOURCE="$(dirname "$CLAUDE_REAL")/../lib/node_modules/@anthropic-ai/claude-code/cli.js"
  fi
fi

echo "CLI source: $CLI_SOURCE"
wc -c "$CLI_SOURCE"  # Should be ~12MB
```

Store the path for all subsequent searches. If you cannot find it, report the failure and stop.

## Step 2: Search for Patterns

Use Grep against the CLI source file. The file is minified, so search for string literals and function signatures, not formatted code.

### Pattern Categories

Search these categories (all categories for general sweep, or focus on the relevant one):

#### Skills & Commands (`Nj()` registrations)
```
Nj({name:"           — skill/command registration
disableModelInvocation  — skills that can't auto-trigger
userInvocable           — skills visible in / menu
isEnabled               — feature-flagged skills
```
Look for: new skills not in the known list, changed registration parameters, new feature flags.

**Known skills** (from previous research): simplify, batch, debug, claude-developer-platform, claude-in-chrome, keybindings-help, skillify (dead), verifier (dead), settings-help (dead).

#### Hook Events
```
"PreToolUse"          — hook event names as strings
"PostToolUse"
"SessionStart"
"Stop"
hookEvent             — hook dispatching code
type:"command"        — hook type definitions
type:"prompt"
type:"agent"
type:"http"
```
Look for: new hook events, new hook types, changed hook behavior, undocumented hook input fields.

**Known hook events** (17): SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, PostToolUseFailure, Notification, SubagentStart, SubagentStop, Stop, TeammateIdle, TaskCompleted, ConfigChange, WorktreeCreate, WorktreeRemove, PreCompact, SessionEnd.

#### Tool Definitions
```
toolName:"            — tool registration
"Read","Edit","Write" — tool names in allowlists
disallowedTools       — tool restrictions
```
Look for: new tools, changed tool capabilities, undocumented tool parameters.

#### Environment Variables
```
CLAUDE_CODE_          — env var prefix
CLAUDE_               — broader prefix
process.env.          — all env var reads
ANTHROPIC_            — API-related vars
```
Look for: undocumented env vars, feature flags controlled by env vars, debug modes.

**Known env vars**: ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX, CLAUDE_CODE_USE_FOUNDRY, CLAUDE_CODE_MAX_OUTPUT_TOKENS, CLAUDE_CODE_EFFORT_LEVEL, MAX_THINKING_TOKENS, CLAUDE_CODE_DISABLE_AUTO_MEMORY, ENABLE_CLAUDEAI_MCP_SERVERS, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, DISABLE_AUTOUPDATER, CLAUDECODE, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS.

#### Hidden Flags & CLI Options
```
"--                   — CLI flag definitions
option("              — commander.js option registration
addOption(            — option definitions
.choices(             — enum flag values
```
Look for: undocumented CLI flags, hidden options, debug switches.

#### Agent System
```
subagent_type         — agent type routing
"Explore"             — built-in agent names
"general-purpose"
agentDefinition       — agent file loading
.claude/agents/       — agent path references
permissionMode        — agent permission handling
```
Look for: new agent types, changed agent behavior, undocumented agent features.

#### Feature Flags
```
featureFlag(          — feature flag checks
statsig               — feature flag service
"tengu_               — known flag prefix
```
Look for: unreleased features behind flags, flag names that hint at upcoming capabilities.

#### Error Messages & Internal Strings
```
"deprecated"          — deprecated features
"experimental"        — experimental features
"internal"            — internal-only features
"TODO"                — unfinished work
"HACK"                — workarounds
```

#### MCP & Plugin System
```
mcpServers            — MCP configuration
"stdio","sse"         — transport types
pluginManifest        — plugin system
".claude-plugin"      — plugin detection
marketplace           — plugin marketplace
```
Look for: new MCP transport types, plugin system changes, marketplace features.

## Step 3: Analyze Findings

For each interesting finding:

1. **Read the surrounding context** — use the Read tool with offset/limit to get ~100 lines around the match. The code is minified, so look for string literals, function boundaries (closing braces, semicolons), and nearby identifiers.

2. **De-minify mentally** — trace the logic:
   - String literals tell you what it does ("error: ...", "usage: ...")
   - Nearby function calls tell you how it works
   - Conditional checks (`if`, `?`, `&&`) reveal when it activates
   - Object keys tell you the data shape

3. **Cross-reference** — check if this feature:
   - Is documented in Claude Code docs
   - Appears in the existing expertise knowledge at `~/.superbot2/knowledge/claude-code-expertise.md`
   - Was mentioned in changelogs or GitHub issues
   - Has related code elsewhere in the bundle

4. **Classify the finding**:
   - **New feature**: not in docs or knowledge base
   - **Changed behavior**: differs from documented/known behavior
   - **Hidden option**: exists but not exposed in help/docs
   - **Dead code**: defined but not reachable
   - **Upcoming**: behind a feature flag

## Step 4: Generate Output

For each finding, produce a structured entry:

```markdown
### Finding: [Short Title]

**Category**: [skills | hooks | tools | env-vars | flags | agents | feature-flags | mcp | internal]
**Status**: [new | changed | hidden | dead-code | upcoming]
**Source location**: cli.js line ~[N] (byte offset ~[N])

**What was found**:
[2-3 sentences describing the feature/behavior/pattern]

**Why it matters**:
[1-2 sentences on practical value — who cares and why]

**Evidence**:
```
[relevant code snippet, de-minified if possible]
```

**Tweet draft**:
[A tweet-ready insight following these rules:
- Casual, specific, technical but accessible
- First word capitalized, rest follows natural casing
- No em-dashes (use commas, periods, or parentheses instead)
- Include a concrete detail or number
- 280 chars max
- Suggest a screenshot/code snippet to pair with it]

**Screenshot suggestion**: [what to screenshot or what code to show]
```

## Step 5: Save Findings

Write all findings to the knowledge directory of the invoking space. Use the path pattern:

```
knowledge/claude-code-deep-dive-[date].md
```

If the file already exists, append new findings rather than overwriting.

Also update `~/.superbot2/knowledge/claude-code-expertise.md` if you found something that should be in the permanent knowledge base (new env vars, new hook events, new skills, etc.). Add to the appropriate section rather than appending to the end.

## Step 6: Summary

End with a summary:

```markdown
## Deep Dive Summary

**Focus**: [area searched or "general sweep"]
**CLI version**: [version string if found in the bundle]
**Patterns searched**: [N]
**Findings**: [N total] ([N] new, [N] changed, [N] hidden, [N] dead-code, [N] upcoming)
**Tweet-ready insights**: [N]

### Top 3 Most Interesting Findings
1. [one-liner]
2. [one-liner]
3. [one-liner]
```

## Tips for Effective Analysis

- The CLI source is ~12MB of minified JS. Use Grep with specific patterns rather than trying to read the whole thing.
- String literals are your best friend in minified code. Search for user-facing strings like error messages, help text, and option names.
- When you find something interesting, read 200+ lines of context. Minified code packs a lot into each line.
- Compare findings against the known patterns listed above. The value is in finding what's NEW or CHANGED.
- Feature flags (especially the `tengu_` prefix) often reveal upcoming features before they're announced.
- Dead code (functions defined but never called, or registrations that return void) hints at features in development.
- The `Nj()` function is the universal skill registration entry point. Any new call to it means a new skill.
