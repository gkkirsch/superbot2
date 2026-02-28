import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, Lightbulb } from 'lucide-react'

const TIPS = [
  // Spaces
  "Spaces are how superbot organizes your work. Each space maps to a project or domain — software, social media, consulting, etc.",
  "Create a space for any ongoing area of work: bash ~/.superbot2/scripts/create-space.sh <slug> '<name>'",
  "Spaces with websites get a Dev Server button — click it to open the local dev server directly from the dashboard.",
  "Each space has an OVERVIEW.md — workers read this first. Keep it up to date so workers understand the context.",
  "Space knowledge files live in ~/.superbot2/spaces/<slug>/knowledge/ — workers read these for domain context.",

  // Projects & Tasks
  "Projects are chunks of work within a space. Workers execute one project at a time.",
  "Tasks are the atomic units. Workers pick them up, execute them, and mark them complete.",
  "The portfolio status script shows all spaces, projects, and pending tasks: bash ~/.superbot2/scripts/portfolio-status.sh",
  "Add a quick task to an existing project: bash ~/.superbot2/scripts/create-task.sh <space> <project> '<subject>'",

  // Todos
  "Todos are rough ideas — not projects. Add them when you're thinking about something, orchestrator will add planning notes.",
  "The orchestrator reads todos at every heartbeat and adds thinking notes as blue annotation cards.",
  "Todos with notes from the orchestrator show suggested approaches, tradeoffs, and open questions.",
  "Mark a todo complete when it's been turned into a real project or is no longer relevant.",

  // Escalations
  "Escalations are how workers ask for your input. They show up in the dashboard for you to resolve.",
  "Types of escalations: decision (a fork in the road), question (missing info), approval (content to review), agent_plan (a plan ready for review).",
  "Social media drafts always come as approval escalations — one per draft. Approve, rewrite, or skip each one.",
  "Tell superbot to escalate specific things: 'escalate an approval for every blog post draft before publishing'",
  "Unresolved escalations block workers from continuing — resolve them to unblock progress.",
  "The orchestrator triages escalations: it resolves what it knows, promotes the rest to needs_human.",
  "Auto-triage rules let you automate escalation resolution. Add rules in Settings → Auto-Triage Rules.",
  "Auto-triage rules are plain English: 'Always approve Heroku deploy plans' — start with 1-2 narrow rules.",
  "Acknowledged escalations move to a 'Previously Reviewed' section so your active list stays clean.",

  // Schedule
  "The schedule runs jobs automatically at set times — no manual triggering needed.",
  "Jobs can run at multiple times per day: use times: ['08:00', '14:00', '20:00'] in config.json instead of separate entries.",
  "The timeline view shows today's jobs: past items are faded, upcoming items are normal.",
  "Switch to 'All Schedules' view in the dropdown to see every job regardless of day.",
  "If today's schedule is empty, the timeline shows tomorrow's first job so it's never blank.",
  "Edit any schedule entry directly in the dashboard — click the pencil icon on a schedule row.",
  "The schedule supports day filters: ['mon','tue','wed','thu','fri'] for weekdays only, ['*'] for every day.",

  // Heartbeat
  "The heartbeat fires every 30 minutes — the orchestrator checks the portfolio, triages escalations, spawns workers.",
  "Every heartbeat, the orchestrator looks for unblocked pending work and spawns workers automatically.",
  "You can adjust the heartbeat interval in ~/.superbot2/config.json → heartbeat.intervalMinutes.",
  "The Pulse graph shows heartbeat activity — each spike is a worker turn.",

  // Chat
  "Chat with superbot directly in the dashboard — it's the orchestrator responding.",
  "Tell superbot what to do next: 'start the instagram-gtm project' or 'draft a blog post about X'",
  "Ask superbot for a status update: 'what's currently running?' or 'what's blocked?'",
  "Ask superbot to escalate specific things: 'create an escalation for every social media draft you write'",

  // Workers
  "Workers are AI agents that execute project tasks autonomously. The orchestrator spawns them.",
  "Each worker gets a briefing with the project plan and tasks — they work through it and report back.",
  "Workers read space knowledge files at the start of every session — keep knowledge up to date.",
  "Workers can use the superbot-browser skill to automate browser interactions using your Chrome profile.",

  // Browser Automation
  "Superbot uses your real Chrome profile via CDP — it sees all your logged-in sessions.",
  "Start Chrome with --remote-debugging-port=9222 to enable browser automation.",
  "Log into accounts in Chrome normally and superbot can use them — no credential sharing needed.",
  "Browser automation works for: social media posting, Heroku deploys, Cloudflare, GitHub, Google, and more.",
  "Sign into accounts in Chrome once, and superbot can use them forever — sessions persist.",

  // Plugins & Skills
  "Plugins extend Claude Code with new capabilities — install from the marketplace or build your own.",
  "Skills are reusable prompt workflows inside a plugin — invoked with /skill-name or via the Skill tool.",
  "The difference: skills are prompt workflows, agents are specialized AI workers with tool restrictions, MCP servers are external tool integrations.",
  "Browse the marketplace at superchargeclaudecode.com — 85+ plugins available.",
  "Add a custom marketplace: claude plugin marketplace add <url> — supports any GitHub-hosted plugin registry.",
  "Install a plugin: claude plugin install <name>@<marketplace> — it loads automatically in every session.",
  "Plugin credentials (API keys) are stored in macOS Keychain — set them in the Plugins section of the dashboard.",
  "Skills vs plugins: a skill is a single workflow file (SKILL.md), a plugin is a full package that can contain multiple skills, agents, and hooks.",

  // Skill Creator
  "Use the Skill Creator to build custom plugins without writing code — just describe what you want.",
  "Skill Creator is at /skill-creator — it uses Claude to generate the SKILL.md and plugin structure.",
  "Finished skills save to ~/.superbot2/skills/ and can be uploaded to the marketplace.",
  "Good skills to build: anything you do repeatedly that could be automated or templated.",

  // Knowledge
  "Global knowledge lives in ~/.superbot2/knowledge/ — the orchestrator reads it for triage decisions.",
  "Space knowledge lives in ~/.superbot2/spaces/<slug>/knowledge/ — workers read it for project context.",
  "Add a knowledge file anytime: workers reference it in every future session for that space.",
  "Knowledge files are markdown — write them like internal docs. Include decisions, conventions, gotchas.",
  "The orchestrator builds knowledge over time from worker reports — it learns your patterns.",

  // Dashboard Customization
  "Drag and drop sections to reorder them — click the grid icon to enter edit mode.",
  "Hide sections you don't use — toggle visibility per section in edit mode.",
  "The dashboard has a compact mode — fewer cards, denser layout for smaller screens.",
  "The Pulse graph shows the last 24 hours of activity by default.",

  // Claude Code Tips
  "Claude Code has 3 modes: interactive (chat), print mode (claude -p), and agent mode (claude --agent).",
  "claude -p 'query' is non-interactive — great for scripting. Pipe stdin: cat file | claude -p 'explain'",
  "Use --permission-mode plan to let Claude explore without making changes — safe for research.",
  "Custom agents (.claude/agents/*.md) get only their markdown body as system prompt — 3000+ fewer tokens than default.",
  "Hooks run at lifecycle points: PreToolUse (block commands), PostToolUse (lint after edits), Stop (force continuation).",
  "The --append-system-prompt flag adds to defaults. --system-prompt replaces everything — know the difference.",
  "Name your sessions with /rename my-feature — resume later with claude -r my-feature",
  "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50 triggers context compaction at 50% instead of 95% — better quality longer.",
  "CLAUDE.md files load automatically into every session — put project conventions there.",
  ".claude/rules/*.md supports path-specific frontmatter: rules only apply when working on matching files.",
  "The Agent SDK (@anthropic-ai/claude-agent-sdk) gives you Claude Code as a library — same tools, programmatic.",
  "Use --max-budget-usd 2.00 --max-turns 10 in CI to hard-cap cost and runaway agents.",
  "Background subagents (run_in_background: true) can't use MCP tools — pre-approve permissions before launch.",
  "Shift+Tab cycles permission modes: Normal → Auto-Accept → Plan. Ctrl+B backgrounds a running task.",
  "The Stop hook can force Claude to keep working: return {ok: false, reason: '...'} to block completion.",

  // Accounts to Follow on X
  "Follow @alexalbert__ (Anthropic dev relations) for Claude Code updates and tips straight from the team.",
  "Follow @AnthropicAI for official Claude releases, safety research, and company news.",
  "Follow @bcherny (Claude Code team) for behind-the-scenes Claude Code development.",
  "Follow @darioamodei and @DanielaAmodei for Anthropic's direction and AI safety thinking.",
  "Follow @ch402 (Chris Olah) for deep interpretability research from inside Anthropic.",
  "Follow @janleike for AI safety research — joined Anthropic from OpenAI, posts prolifically.",
  "The Claude Code GitHub (github.com/anthropics/claude-code) has release notes, issues, and community tips.",

  // Agent Teams
  "Agent teams let multiple Claude Code sessions coordinate via shared task lists and messaging.",
  "Teams share a task list at ~/.claude/tasks/<team-name>/ — any agent can claim and update tasks.",
  "Use SendMessage to communicate between agents — plain text output is NOT visible to teammates.",
  "The orchestrator is the team lead — it spawns workers, assigns tasks, and triages their escalations.",
  "Workers go idle between turns — send them a message to wake them up, idle ≠ done.",

  // Things to Ask Superbot to Do
  "Ask superbot to run a social media engagement session: 'run a Facebook GTM session for hostreply'",
  "Ask superbot to build a feature: 'add a search bar to the kidsvids app'",
  "Ask superbot to research: 'research the top 5 Airbnb host communities on Facebook'",
  "Ask superbot to draft content: 'write 5 tweet drafts about the new Claude Code features'",
  "Ask superbot to deploy: 'deploy the hostreply app to Heroku'",
  "Ask superbot to monitor: 'check if Anthropic posted anything new in the last 6 hours'",
  "Tell superbot to create a new space: 'create a space for my consulting website'",
  "Ask superbot to explain what's blocked: 'what's blocked and why?'",
]

// Shuffle on mount so it doesn't always start the same way
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const INTERVAL_MS = 8000

export function TipsRotator() {
  const [shuffled] = useState(() => shuffle(TIPS))
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advance = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      setIndex((i) => (i + 1) % shuffled.length)
      setVisible(true)
    }, 300)
  }, [shuffled.length])

  useEffect(() => {
    timerRef.current = setInterval(advance, INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [advance])

  const handleNext = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    advance()
    timerRef.current = setInterval(advance, INTERVAL_MS)
  }

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <Lightbulb className="h-3.5 w-3.5 text-sand shrink-0" />
      <span
        className="text-xs text-parchment/50 truncate transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        title={shuffled[index]}
      >
        {shuffled[index]}
      </span>
      <button
        onClick={handleNext}
        className="shrink-0 text-stone hover:text-sand transition-colors"
        title="Next tip"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
