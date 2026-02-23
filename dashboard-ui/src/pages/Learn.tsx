import { useState } from 'react'
import { BookOpen, ChevronRight, Menu, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Concept {
  id: string
  title: string
  content: string
}

const concepts: Concept[] = [
  {
    id: 'orchestrator',
    title: 'Orchestrator',
    content: `# Orchestrator

The orchestrator is superbot2's AI team lead. It's a persistent Claude session that manages your entire portfolio of projects.

## What It Does

- **Reads your portfolio** — scans all spaces, projects, tasks, and escalations to understand the current state of work
- **Decides what to do** — prioritizes work, identifies blocked projects, and determines which tasks need attention
- **Spawns workers** — launches AI agent teammates to execute specific projects (coding, research, social media, etc.)
- **Triages escalations** — reviews blockers and decisions from workers, resolves what it can, and promotes the rest to you
- **Updates memory** — writes to global knowledge files so future sessions retain important context

## How It Works

The orchestrator runs as a Claude Code session with the \`team-lead\` agent definition. It wakes up when triggered by the heartbeat (cron schedule) or when you send it a message through the dashboard chat.

When it wakes up, it follows a structured workflow:
1. Read the heartbeat summary (what changed since last check)
2. Triage new escalations
3. Check on active workers
4. Spawn new workers for unblocked projects
5. Update knowledge and go idle

## What You'd Typically Do

You rarely interact with the orchestrator directly. Instead, you:
- Send it messages through the dashboard chat ("start working on X", "what's the status of Y?")
- Resolve escalations it promotes to you
- Review its decisions in the knowledge files

The orchestrator is designed to be autonomous — it makes routine decisions on its own and only asks you about things that genuinely need human judgment.`,
  },
  {
    id: 'spaces',
    title: 'Spaces',
    content: `# Spaces

Spaces are project containers — the top-level organizational unit in superbot2. Each space represents a distinct area of work.

## What They Contain

Each space has:
- **A name and slug** — e.g., "Kid Videos" with slug \`kidsvids\`
- **An optional codebase directory** — links the space to a local code repo (e.g., \`~/dev/my-project\`)
- **An optional dev server** — configuration for running a local development server (command, port, working directory)
- **Projects** — scoped units of work within the space
- **Knowledge files** — conventions, patterns, and decisions specific to this space

## Where They Live

Spaces are stored at \`~/.superbot2/spaces/<slug>/\`. Each space directory contains:
\`\`\`
~/.superbot2/spaces/kidsvids/
├── space.json          # Space metadata (name, codeDir, devServer)
├── OVERVIEW.md         # What this space is about
├── knowledge/          # Space-specific knowledge files
│   ├── conventions.md
│   ├── patterns.md
│   └── decisions.md
└── plans/              # Projects within this space
    └── my-project/
        ├── plan.md
        └── tasks/
\`\`\`

## What You'd Typically Do

- **Create a space** for each major area of work (a product, a client, a side project)
- **Link it to a codebase** if there's a code repository associated with it
- **Configure a dev server** if the space has a web app that needs a running server
- **View space status** in the dashboard — task counts, active workers, escalations`,
  },
  {
    id: 'projects',
    title: 'Projects',
    content: `# Projects

Projects are scoped units of work within a space. They represent a specific goal or feature being worked on.

## What They Contain

Each project has:
- **plan.md** — the project plan: goal, approach, what done looks like, and decisions made
- **tasks/** — individual task files (JSON) with subjects, descriptions, acceptance criteria, and status
- **Knowledge** — inherits from the parent space's knowledge files

## Project Lifecycle

1. **Planning** — the orchestrator (or a brainstorming skill) creates the project plan and tasks
2. **Execution** — workers are spawned to work on tasks, one project at a time
3. **Completion** — all tasks are done, plan.md gets a "Next Steps" section, worker reports back

## Task Structure

Each task has:
- **Subject** — what needs to be done
- **Description** — detailed context and requirements
- **Acceptance criteria** — specific conditions that must be met
- **Priority** — critical, high, medium, or low
- **Status** — pending, in_progress, or completed
- **Dependencies** — tasks can block or be blocked by other tasks

## What You'd Typically Do

- **Review project plans** when the orchestrator creates them
- **Track progress** in the dashboard — see task counts and status
- **Resolve escalations** when workers hit blockers or need decisions
- **Review completed work** — check plan.md's "Next Steps" for follow-up items`,
  },
  {
    id: 'workers',
    title: 'Workers',
    content: `# Workers (Teammates)

Workers are AI agents spawned by the orchestrator to do actual work. Each worker gets assigned one project and works on it autonomously.

## What They Do

Workers handle a wide range of tasks:
- **Coding** — implementing features, fixing bugs, writing tests
- **Research** — exploring APIs, evaluating libraries, investigating issues
- **Content** — writing documentation, social media posts, marketing copy
- **Operations** — setting up infrastructure, configuring services

## How They Work

1. The orchestrator spawns a worker with a briefing (which space, which project, what to focus on)
2. The worker reads the space's knowledge files, project plan, and tasks
3. It picks tasks in priority order and executes them one by one
4. For each task: reads the description → does the work → verifies acceptance criteria → commits → moves to next
5. When blocked, it creates an escalation and moves to the next unblocked task
6. When done, it reports back to the orchestrator with a summary

## Worker Discipline

Workers follow strict conventions:
- **Test-driven development** — write the test first, then the code
- **Verification before completion** — run the verification command and read output before claiming success
- **Knowledge distillation** — write patterns, conventions, and decisions to knowledge files
- **Git commits** — one commit per completed task with the format \`[space/project] description\`

## What You'd Typically Do

- **Monitor active workers** in the dashboard (Workers section shows running workers with runtime)
- **Review their output** — completed tasks, commits, knowledge updates
- **Resolve their escalations** — workers create escalations when they need human input`,
  },
  {
    id: 'heartbeat',
    title: 'Heartbeat',
    content: `# Heartbeat

The heartbeat is a scheduled pulse that wakes the orchestrator. Think of it as the orchestrator's alarm clock — it ensures the system stays active even when you're not interacting with it.

## What the Heartbeat Message Contains

When the heartbeat script (\`heartbeat-cron.sh\`) fires, it collects system state and builds a structured message with these sections:

| Section | What It Reports |
|---|---|
| **Triage These Escalations** | New untriaged escalations in \`escalations/untriaged/\` — type, question, which project they block |
| **Resolved Escalations — Spawn Workers** | Recently resolved but unconsumed escalations — projects that can resume work |
| **Projects Ready for Work** | Projects with pending tasks, no active worker, and no blocking escalations — includes task subjects and priorities |
| **Still Blocked** | Projects blocked by \`needs_human\` escalations waiting on user input |
| **Needs Planning** | Projects with resolved escalations but no tasks created yet (need brainstorming) |
| **Escalations Waiting on User** | \`needs_human\` escalations the orchestrator promoted — type, priority, blocking status |
| **Running Workers** | Live process list from \`ps\` — every Claude agent with an \`--agent-id\` flag |
| **Review Knowledge Changes** | Per-file change tracking (NEW or UPDATED) with section headings for context |
| **Previously Reviewed** | Acknowledged items collapsed into a summary — no action needed unless state changed |

Each section only appears when it has items. The message starts with a one-line summary of actions (e.g., "TRIAGE: 2 new untriaged escalation(s), READY: 1 project(s) with pending tasks").

## Orchestrator Sequence When a Heartbeat Fires

When the orchestrator receives a heartbeat, it follows this sequence:

1. **Run portfolio status** — executes \`portfolio-status.sh\` to get the full picture of all spaces, projects, task counts, and escalations
2. **Shut down stale workers** — cross-references the Running Workers list with portfolio status (see Stale Worker Criteria below)
3. **Triage escalations** — reads each file in \`escalations/untriaged/\`:
   - First checks auto-triage rules (\`auto-triage-rules.jsonl\`) for automatic resolution
   - Then attempts manual resolution from explicit knowledge sources only
   - Promotes to \`needs_human\` if unsure (the default and safe path)
4. **Spawn workers** — for projects that are ready (pending tasks, no blocker, no active worker), spawns a space worker with a briefing
5. **Peek at todos** — reads \`todos.json\` and writes planning nudge notes on actionable items (does NOT create projects or escalations from todos)
6. **Report to dashboard** — sends a summary message to \`dashboard-user\` covering what was found and what action was taken

## Stale Worker Criteria

The orchestrator identifies stale workers during heartbeat processing. A worker is considered stale when any of these apply:

- **Project 100% done** — all tasks in the worker's project are marked completed
- **Duplicate suffix** — a worker with a \`-2\` or later suffix when the original (unsuffixed) worker is still running
- **Planner finished** — a planner worker whose project already has \`plan.md\` and tasks created
- **Silent 60+ minutes** — any worker running 60+ minutes without sending a completion or status message

## Check-in Thresholds for Silent Workers

The orchestrator uses escalating nudges for workers that haven't reported back:

| Runtime Without Update | Action |
|---|---|
| **30+ minutes** | Send a check-in message asking for status |
| **60+ minutes** | Stronger nudge — demand a progress update |
| **90+ minutes** | Consider killing the worker and re-spawning a fresh one |

These thresholds help catch workers that are stuck in loops, lost context, or are otherwise unproductive.

## Deduplication

The heartbeat avoids repeating itself through two mechanisms:

- **Fingerprinting** — computes an MD5 hash of all escalation files, knowledge files, task files, and memory. If the fingerprint matches the last run, no message is sent.
- **Inbox dedup** — if there's already an unread heartbeat message in the orchestrator's inbox, the script skips sending another one (saves the fingerprint but doesn't message).
- **Per-file knowledge hashes** — tracks individual file hashes in \`.heartbeat-knowledge-hashes\` so it can report exactly which files are NEW vs UPDATED, rather than just "knowledge changed."
- **Acknowledgment** — the orchestrator marks items as acknowledged after processing them. Acknowledged items appear in a collapsed "Previously Reviewed" section on subsequent heartbeats.

## Schedule Configuration

The heartbeat interval is set in \`~/.superbot2/config.json\`:

\`\`\`json
{
  "heartbeat": { "intervalMinutes": 30 }
}
\`\`\`

The scheduler daemon checks this config every 60 seconds. When the interval has elapsed since the last heartbeat, it runs \`heartbeat-cron.sh\`, which collects state and drops a message in the orchestrator's inbox.

The heartbeat is independent of scheduled jobs (which have their own \`schedule\` array in the same config file). Scheduled jobs fire at specific times; the heartbeat fires on an interval.

## What You'd Typically Do

The heartbeat is fully automatic — you don't interact with it directly. You can:
- **View the Pulse section** in the dashboard to see the last heartbeat time and whether changes were detected
- **Adjust the interval** in \`config.json\` (e.g., 15 minutes for more active monitoring, 60 for lighter usage)
- **Check heartbeat logs** at \`~/.superbot2/logs/heartbeat.log\` for diagnostics
- **View activity history** at \`~/.superbot2/logs/heartbeat-activity.json\` — tracks the last 48 heartbeat runs with timestamps and whether changes were detected`,
  },
  {
    id: 'scheduler',
    title: 'Scheduler',
    content: `# Scheduler

The scheduler is superbot2's cron job system. It runs tasks on a defined schedule, from heartbeats to custom recurring work.

## How Jobs Are Defined

Jobs are configured in \`~/.superbot2/config.json\` under the \`scheduler\` section:

\`\`\`json
{
  "scheduler": {
    "jobs": [
      {
        "name": "heartbeat",
        "time": "*/30 * * * *",
        "days": ["mon", "tue", "wed", "thu", "fri"],
        "task": "Run heartbeat check"
      },
      {
        "name": "weekly-review",
        "time": "0 20 * * 0",
        "days": ["sun"],
        "task": "Run self-improvement analysis"
      }
    ]
  }
}
\`\`\`

Each job has:
- **name** — identifier for the job
- **time** — cron expression for when to run
- **days** — which days of the week (optional, defaults to every day)
- **task** — description of what to do when the job fires

## How It Works

When a scheduled job is due, the scheduler drops a message in the orchestrator's inbox with the task description. The orchestrator then decides how to handle it — it might spawn a worker, run a script, or handle it directly.

## What You'd Typically Do

- **View scheduled jobs** in the dashboard's Schedule section
- **Edit config.json** to add, remove, or adjust job schedules
- **Check execution history** to see when jobs last ran`,
  },
  {
    id: 'todos',
    title: 'Todos',
    content: `# Todos

Todos are rough ideas you're thinking about. They're not tasks, not projects — just notes for things you might want to do someday.

## How They Work

Todos live in \`~/.superbot2/todos.json\` as a simple list:
- Each todo has **text** (what the idea is) and a **completed** flag
- The orchestrator reads your todos during heartbeat cycles and adds **planning nudges** — notes suggesting how the idea could be turned into a project

## Planning Nudges

When the orchestrator sees a new or updated todo, it may add a note like:
- "This could be a project in the kidsvids space — would need X, Y, Z"
- "Similar to what we did in project A — consider reusing that approach"

These nudges appear as blue annotation cards below each todo in the dashboard.

## Todo vs Task vs Project

| | Todo | Task | Project |
|---|---|---|---|
| **Scope** | Rough idea | Specific action | Scoped goal |
| **Where** | todos.json | space/project/tasks/ | space/plans/project/ |
| **Who works on it** | Nobody (yet) | A worker | A worker |
| **Structure** | Free text + notes | Subject, criteria, status | Plan, tasks, knowledge |

## What You'd Typically Do

- **Add todos** in the dashboard when you have an idea
- **Review planning nudges** the orchestrator adds
- **Promote to a project** when you're ready to act on an idea (tell the orchestrator via chat)`,
  },
  {
    id: 'escalations',
    title: 'Escalations',
    content: `# Escalations

Escalations are how workers ask for help. When a worker hits something it can't resolve on its own — a blocker, a decision, or a question — it creates an escalation.

## Types

| Type | When Used |
|---|---|
| **decision** | Worker needs you to choose between options (e.g., "Should we use PostgreSQL or SQLite?") |
| **blocker** | Worker is stuck and can't proceed (e.g., "API credentials are missing") |
| **question** | Worker needs clarification (e.g., "Should this also handle edge case X?") |
| **approval** | Worker needs sign-off before proceeding (e.g., "Plan ready for review") |
| **improvement** | System suggests a process improvement (from self-improvement analysis) |
| **agent_plan** | Orchestrator-generated project plan awaiting user review |

## Lifecycle

1. **Worker creates** an escalation with a question, context, and suggested options
2. **Orchestrator triages** — resolves if the answer is known, or promotes to \`needs_human\`
3. **You resolve** \`needs_human\` escalations in the dashboard
4. **Worker continues** — picks up the resolution on its next cycle

## Escalation Structure

Each escalation includes:
- **Question** — what needs to be decided
- **Context** — why this matters and relevant background
- **Options** — 2-4 concrete choices with tradeoffs
- **Priority** — critical, high, medium, low
- **Suggested auto-triage rule** — a plain English rule for handling similar future escalations

## What You'd Typically Do

- **Review escalations** in the dashboard's Escalations section
- **Resolve them** by selecting an option or writing a custom resolution
- **Override orchestrator resolutions** if the orchestrator got something wrong
- **Add auto-triage rules** so similar escalations get resolved automatically next time`,
  },
  {
    id: 'auto-triage',
    title: 'Auto-triage Rules',
    content: `# Auto-triage Rules

Auto-triage rules let the orchestrator automatically resolve certain escalations without human intervention. They're plain English rules that the orchestrator matches against incoming escalations.

## How They Work

1. When a worker creates an escalation, it includes a **suggested auto-triage rule**
2. When you resolve that escalation in the dashboard, you see an "Add to auto-rules" button
3. Clicking it saves the rule to \`~/.superbot2/auto-triage-rules.jsonl\`
4. On future triage cycles, the orchestrator reads all rules and auto-resolves matching escalations

## Rule Format

Rules are stored as JSONL (one JSON object per line):
\`\`\`json
{"rule": "Always use PostgreSQL for new database projects", "source": "esc-123", "addedAt": "2026-02-20T10:00:00Z", "space": "meta"}
\`\`\`

## Matching

The orchestrator uses its own judgment to match rules — it reads the rule as plain English and decides if it applies to the current escalation. When it auto-resolves, the resolution notes: "Auto-resolved per rule: <rule text>".

## What You'd Typically Do

- **Let rules accumulate naturally** — as you resolve escalations, add rules for patterns you see repeating
- **Review the rules list** in the dashboard to see what's been automated
- **The system gets smarter over time** — fewer escalations need your attention as rules build up`,
  },
  {
    id: 'dev-servers',
    title: 'Dev Servers',
    content: `# Dev Servers

Each space can have a dev server configuration for running a local development server. The dashboard shows running dev servers and lets you start/stop them.

## Configuration

Dev servers are configured in each space's \`space.json\`:
\`\`\`json
{
  "name": "My App",
  "devServer": {
    "command": "npm run dev",
    "port": 5173,
    "cwd": "/Users/you/dev/my-app"
  }
}
\`\`\`

- **command** — the shell command to start the dev server
- **port** — which port the server runs on
- **cwd** — the working directory (defaults to the space's code directory)

## Port Auto-assignment

When creating a new space with \`create-space.sh --dev-server\`, the script automatically picks the next available port starting from 5173 by scanning all existing space configurations.

## What You'd Typically Do

- **Configure dev servers** when setting up a space with a web app
- **Start/stop servers** from the dashboard
- **Workers use dev servers** — when a worker needs to test a web app, it references the space's dev server configuration`,
  },
  {
    id: 'default-stack',
    title: 'Default Stack',
    content: `# Default Stack

When superbot2 creates a new web project, it uses a standard technology stack. This ensures consistency across projects and lets workers reuse knowledge from one project to another.

## The Stack

| Layer | Technology |
|---|---|
| **Frontend framework** | React |
| **Build tool** | Vite |
| **Styling** | Tailwind CSS v4 |
| **UI components** | shadcn/ui |
| **Icons** | Lucide |
| **Backend** | Express |
| **Validation** | Zod |
| **Language** | TypeScript |
| **Database** | PostgreSQL |

## Scaffolding

New web projects are scaffolded using the \`web-project-setup\` skill, which:
- Creates the Vite + React project structure
- Configures Tailwind CSS v4
- Sets up shadcn/ui components
- Creates the Express backend with standard middleware
- Configures TypeScript for both frontend and backend

## Why This Stack

- **React + Vite** — fast development with HMR, widely supported
- **Tailwind v4** — utility-first CSS, great for AI-generated code (explicit classes)
- **shadcn/ui** — copy-paste components, no vendor lock-in
- **Express** — simple, flexible, well-documented
- **TypeScript** — catches errors early, better for AI code generation
- **PostgreSQL** — production-ready, feature-rich relational database

## What You'd Typically Do

- **Use the default stack** for new web projects — it's pre-configured and workers know it well
- **Customize as needed** — the stack is a starting point, not a constraint
- **Override for specific projects** — some spaces may use different technologies (e.g., a Python project)`,
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    content: `# Knowledge

Knowledge files are how superbot2 remembers things across sessions. They're markdown files containing conventions, patterns, decisions, and research findings.

## Two Levels

### Global Knowledge
Stored at \`~/.superbot2/knowledge/\`. Managed by the orchestrator. Contains cross-cutting information that applies to all spaces:
- System-wide conventions
- User preferences (in USER.md)
- Shared patterns and decisions

### Space Knowledge
Stored at \`~/.superbot2/spaces/<slug>/knowledge/\`. Managed by workers. Contains space-specific information:
- **conventions.md** — coding conventions, naming patterns, style rules
- **patterns.md** — recurring implementation patterns, architecture notes
- **decisions.md** — key decisions made and their rationale
- **research.md** — API docs, library evaluations, findings
- Topic-specific files (e.g., \`stripe-api.md\`, \`auth-flow.md\`)

## How Workers Use Knowledge

When a worker starts a session:
1. It reads all knowledge files in the space's \`knowledge/\` directory
2. It uses this context to make better decisions and follow established patterns
3. As it works, it writes new findings back to knowledge files
4. The next worker session starts with all accumulated knowledge

## Why It Matters

Workers are stateless — each session starts fresh. Knowledge files ARE their memory. Without them, every session would start from zero, rediscovering the same things.

## What You'd Typically Do

- **Review knowledge files** in the dashboard's Knowledge section
- **Let workers build knowledge naturally** — they write as they discover
- **Edit knowledge files** if you spot errors or want to add context
- **Trust the accumulation** — over time, knowledge files become a rich project reference`,
  },
  {
    id: 'skills',
    title: 'Skills',
    content: `# Skills

Skills are reusable Claude Code capabilities — think of them as specialized "slash commands" that workers and users can invoke.

## How They Work

Skills are markdown files installed at \`~/.claude/skills/\`. Each skill has:
- **SKILL.md** — the skill definition with YAML frontmatter (name, description, version) and markdown body (the actual prompt/instructions)
- **references/** — optional supporting documentation the skill can reference

When a worker invokes a skill (e.g., \`superbot-brainstorming\`), Claude Code loads the SKILL.md and follows its instructions.

## Key Built-in Skills

| Skill | Purpose |
|---|---|
| **superbot-brainstorming** | Plans new projects — explores codebase, creates escalation questions, writes plan.md and tasks |
| **superbot-browser** | Chrome automation via CDP — uses the user's authenticated browser session |
| **web-project-setup** | Scaffolds a new web project with the default stack |
| **superbot-implementation** | Dispatches parallel subagents for multi-task projects with two-stage review |
| **verification-before-completion** | Ensures workers run and read verification commands before claiming success |
| **test-driven-development** | Enforces write-test-first discipline |
| **systematic-debugging** | Structured debugging approach — find root cause before fixing |

## Plugins

Skills can also come from plugins installed via the marketplace. Plugins are packages that bundle skills, commands, agents, and hooks together. You can browse and install plugins from the Skills tab.

## What You'd Typically Do

- **Browse installed skills** in the Skills tab
- **Install plugins** from the marketplace for new capabilities
- **Create custom skills** using the Skill Creator tab
- **Configure credentials** for plugins that need API keys (stored in macOS Keychain)`,
  },
]

export function Learn() {
  const [activeId, setActiveId] = useState(concepts[0].id)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const activeConcept = concepts.find(c => c.id === activeId) ?? concepts[0]

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <BookOpen className="h-5 w-5 text-sand" />
          <h1 className="font-heading text-2xl text-parchment">Learn</h1>
          <span className="text-sm text-stone ml-2">How superbot2 works</span>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-border-custom bg-surface/50 text-sm text-parchment"
        >
          {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          {activeConcept.title}
        </button>

        <div className="flex gap-8">
          {/* Left sidebar */}
          <nav className={`w-56 shrink-0 ${sidebarOpen ? 'block' : 'hidden'} md:block`}>
            <div className="sticky top-24 space-y-0.5">
              {concepts.map(concept => (
                <button
                  key={concept.id}
                  onClick={() => { setActiveId(concept.id); setSidebarOpen(false) }}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeId === concept.id
                      ? 'bg-sand/10 text-sand border-l-2 border-sand'
                      : 'text-stone hover:text-parchment hover:bg-surface/50'
                  }`}
                >
                  {activeId === concept.id && <ChevronRight className="h-3 w-3 shrink-0" />}
                  <span className={activeId !== concept.id ? 'ml-5' : ''}>{concept.title}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Right content area */}
          <div className="flex-1 min-w-0">
            <div className="docs-content max-w-3xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {activeConcept.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
