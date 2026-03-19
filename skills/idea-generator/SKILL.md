---
name: idea-generator
description: >
  Structured creative ideation for new projects, revenue streams, skills, content, and growth strategies.
  Uses SCAMPER, cross-pollination, "what if" starters, and gap analysis frameworks.
  Triggers: "generate ideas", "brainstorm", "what should we build", "creative session", "new ideas",
  "idea generation", "ideation", "revenue ideas", "growth ideas", "what's next".
  NOT for: project planning (use superbot-brainstorming), task execution, implementation.
version: 1.0.0
argument-hint: "[focus-area]  # e.g. revenue, content, skills, growth, or a space name"
allowed-tools: Read, Grep, Glob, Bash, WebSearch, WebFetch, Write

metadata:
  superbot:
    emoji: "💡"
---

# Idea Generator

Generate actionable ideas using structured creativity frameworks. Every idea should be concrete enough to become a task.

## Step 1: Gather Context

Before generating ideas, build a picture of what exists and what's happening.

```bash
# Current portfolio — what spaces, projects, and products exist
bash ~/.superbot2/scripts/portfolio-status.sh 2>/dev/null || echo "Portfolio status unavailable"
```

Read these files for strategic context:

- `~/.superbot2/knowledge/decisions.md` — what's been decided, current direction
- `~/.superbot2/knowledge/reflections.md` — core directive, what's working, what's not
- `~/.superbot2/knowledge/references.md` — existing URLs, services, accounts

```bash
# List all spaces and their configs
for config in ~/.superbot2/spaces/*/space.json; do
  echo "=== $(basename $(dirname $config)) ==="
  cat "$config" 2>/dev/null
  echo ""
done
```

Scan for focus area if `$ARGUMENTS` is provided:
- If it names a space (e.g., "hostreply", "supercharge"), read that space's knowledge/ directory
- If it names a category (e.g., "revenue", "content", "skills", "growth"), weight frameworks toward that category
- If empty, run all frameworks broadly

## Step 2: Research What's Trending

Use WebSearch to scan for current opportunities. Run 2-3 searches based on the focus area.

**Default searches (no focus area):**
- `"AI agent" monetization indie hacker 2026` — what people are building and selling
- `"Claude Code" OR "AI coding" new tools plugins 2026` — adjacent ecosystem
- `site:news.ycombinator.com AI agent SaaS` — what HN is excited about

**Revenue focus:**
- `AI SaaS pricing models indie hacker revenue 2026`
- `"passive income" AI automation tools 2026`

**Content focus:**
- `AI content creator strategy growing audience 2026`
- `developer content marketing what works 2026`

**Skills/tools focus:**
- `"Claude Code" OR "AI coding assistant" plugins extensions marketplace 2026`
- `developer tools people wish existed 2026`

**Growth focus:**
- `AI startup growth strategy zero to 1000 users 2026`
- `indie hacker distribution channels 2026`

Summarize the 3-5 most relevant trends or opportunities you find.

## Step 3: Run the Frameworks

### Framework 1: SCAMPER

Take existing assets (products, skills, spaces, content, expertise) and systematically apply each lens:

| Lens | Question | Apply to... |
|------|----------|-------------|
| **S**ubstitute | What if we replaced X with Y? | A component, dependency, pricing model, audience, platform |
| **C**ombine | What if we merged product A with approach B? | Two existing products, a skill + a market, a tool + a content format |
| **A**dapt | What works in industry X that we could apply? | Patterns from trending searches, competitor moves, adjacent markets |
| **M**odify | What if we changed the scale, price, audience? | Pricing tiers, target market, feature scope, delivery format |
| re-**P**urpose | What existing knowledge/code could serve a new market? | Skills, codebases, expertise, content, automations |
| **E**liminate | What if we removed the middleman/complexity? | Steps in a workflow, features nobody uses, manual processes |
| **R**everse | What if the customer came to us instead? | Inbound vs outbound, self-service vs sales, pull vs push |

For each lens, generate 1-2 ideas by applying it to the actual portfolio. Reference specific products, skills, or spaces.

### Framework 2: Cross-Pollination

Look at adjacent spaces for inspiration:

1. **Indie hackers building with AI agents** — What are they monetizing? What niches are underserved?
2. **Competitors and adjacent tools** — What are Cursor, Windsurf, Cline, Aider doing that we could do better or differently?
3. **Pain points on X/HN/Reddit** — What do developers and business owners complain about that we could solve with our existing capabilities?
4. **Business models from other industries** — What works in e-commerce, education, media, or consulting that we haven't tried?

Generate 2-3 ideas from cross-pollination.

### Framework 3: "What If" Starters

Generate 10 "what if" questions about the portfolio. These should be provocative, not safe.

Templates:
- "What if [product] was a [different business model]?"
- "What if we sold [expertise] as [new format]?"
- "What if [manual process] was fully automated?"
- "What if we targeted [completely different audience] with [existing tool]?"
- "What if [free thing] was the paid thing and [paid thing] was free?"
- "What if we built [competitor's feature] but for [our niche]?"
- "What if [skill] could [unexpected capability]?"
- "What if we open-sourced [X] and monetized [Y]?"
- "What if every [recurring task] generated [content/data/leads]?"
- "What if [internal tool] was a product?"

Pick the 2-3 most promising "what if" questions and flesh them into concrete ideas.

### Framework 4: Gap Analysis

Look at what's missing:

| Gap type | Question |
|----------|----------|
| **Skills** | What skills don't we have that would unlock new capabilities? |
| **Revenue** | What revenue streams are we ignoring or under-investing in? |
| **Content** | What content formats haven't we tried? (video, newsletter, course, podcast, templates) |
| **Audience** | Who could use our tools that we're not reaching? |
| **Automation** | What do we still do manually that could be automated? |
| **Data** | What data are we generating but not using? |

Generate 2-3 ideas from gaps found.

## Step 4: Score and Rank

For each idea generated across all frameworks, score it:

| Field | Format |
|-------|--------|
| **Title** | Short, memorable name |
| **Description** | One sentence — what is it and why it matters |
| **Framework** | Which framework generated it (SCAMPER-S, Cross-Pollination, What-If, Gap) |
| **Effort** | `quick win` (< 1 day) / `medium` (1-5 days) / `big build` (1+ weeks) |
| **Revenue potential** | `direct` (charges money) / `indirect` (leads to money) / `audience growth` (builds reach) |
| **Next step** | One concrete action to move this forward |

## Step 5: Write Output

Compile the top 5-10 ideas (best mix of effort vs. impact) into a structured output.

Save to the appropriate location based on context:
- If run from a space worker: `<space>/knowledge/ideas-<date>.md`
- If run from orchestrator/general: `~/.superbot2/knowledge/ideas-<date>.md`

Use this format:

```markdown
# Ideas — [Focus Area or "General"] — [Date]

## Trends Spotted
- [trend 1]
- [trend 2]
- [trend 3]

## Top Ideas

### 1. [Title]
- **Description**: [one sentence]
- **Framework**: [which framework]
- **Effort**: [quick win / medium / big build]
- **Revenue**: [direct / indirect / audience growth]
- **Next step**: [concrete action]

### 2. [Title]
...
```

After writing the file, print a summary of the top 3 ideas to the console.
