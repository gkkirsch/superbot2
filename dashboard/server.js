import express from 'express'
import { readdir, readFile, writeFile, appendFile, rename, mkdir, stat, rm, unlink, cp } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFile, execFileSync, spawn } from 'node:child_process'
import yaml from 'js-yaml'
import multer from 'multer'

const app = express()
const PORT = parseInt(process.env.SUPERBOT2_API_PORT || '3274', 10)
const SUPERBOT2_NAME = process.env.SUPERBOT2_NAME || 'superbot2'
const SUPERBOT_DIR = process.env.SUPERBOT2_HOME || join(homedir(), `.${SUPERBOT2_NAME}`)
const SPACES_DIR = join(SUPERBOT_DIR, 'spaces')
const ESCALATIONS_DIR = join(SUPERBOT_DIR, 'escalations')
const SESSIONS_DIR = join(SUPERBOT_DIR, 'sessions')
const SUPERBOT_SKILLS_DIR = join(import.meta.dirname, '..', 'skills')
const KNOWLEDGE_DIR = join(SUPERBOT_DIR, 'knowledge')
const TEAM_INBOXES_DIR = join(SUPERBOT_DIR, '.claude', 'teams', SUPERBOT2_NAME, 'inboxes')

app.use(express.json({ limit: '50mb' }))

// --- Helpers ---

async function readJsonFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function readMarkdownFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8')
    return { content, exists: true }
  } catch {
    return { content: '', exists: false }
  }
}

async function safeReaddir(dirPath) {
  try {
    return await readdir(dirPath)
  } catch {
    return []
  }
}

async function getProjectsForSpace(spaceDir) {
  const plansDir = join(spaceDir, 'plans')
  const entries = await safeReaddir(plansDir)
  const projects = []
  for (const entry of entries) {
    try {
      const s = await stat(join(plansDir, entry))
      if (s.isDirectory()) projects.push(entry)
    } catch { /* skip */ }
  }
  return projects
}

async function getTasksForProject(spaceDir, project) {
  const tasksDir = join(spaceDir, 'plans', project, 'tasks')
  const files = await safeReaddir(tasksDir)
  const tasks = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const task = await readJsonFile(join(tasksDir, file))
    if (task) tasks.push(task)
  }
  return tasks
}

async function getEscalationsFromDir(dirName) {
  const dir = join(ESCALATIONS_DIR, dirName)
  const files = await safeReaddir(dir)
  const escalations = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const esc = await readJsonFile(join(dir, file))
    if (esc) {
      // Override status to match directory (orchestrator may move files without updating the field)
      if (dirName === 'needs_human' || dirName === 'untriaged' || dirName === 'resolved') {
        esc.status = dirName
      }
      escalations.push(esc)
    }
  }
  return escalations
}

function getSpaceExtras(spaceJson) {
  let devUrl = null
  if (spaceJson.devServer) {
    devUrl = spaceJson.devServer.url || `http://localhost:${spaceJson.devServer.port || 5173}`
  }
  return {
    hasDevServer: !!spaceJson.devServer,
    hasDeploy: !!spaceJson.deploy,
    prodUrl: spaceJson.prodUrl || null,
    devUrl,
  }
}

function getLastUpdated(tasks) {
  if (tasks.length === 0) return null
  const dates = tasks
    .map(t => t.updatedAt || t.createdAt)
    .filter(Boolean)
    .map(d => new Date(d).getTime())
  if (dates.length === 0) return null
  return new Date(Math.max(...dates)).toISOString()
}

// --- Context file endpoints ---

app.get('/api/identity', async (_req, res) => {
  try {
    const result = await readMarkdownFile(join(SUPERBOT_DIR, 'IDENTITY.md'))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/user', async (_req, res) => {
  try {
    const result = await readMarkdownFile(join(SUPERBOT_DIR, 'USER.md'))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/memory', async (_req, res) => {
  try {
    const result = await readMarkdownFile(join(SUPERBOT_DIR, 'MEMORY.md'))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/orchestrator-prompt', async (_req, res) => {
  try {
    const template = await readMarkdownFile(join(SUPERBOT_DIR, 'templates', 'orchestrator-system-prompt-override.md'))
    const content = template.exists ? template.content : ''
    res.json({ content, exists: template.exists })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/worker-prompt', async (_req, res) => {
  try {
    const agentDef = await readMarkdownFile(join(homedir(), '.claude', 'agents', 'space-worker.md'))
    const content = agentDef.exists ? agentDef.content : ''
    res.json({ content, exists: agentDef.exists })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/spaces ---

app.get('/api/spaces', async (_req, res) => {
  try {
    const spaceSlugs = await safeReaddir(SPACES_DIR)
    const spaces = []

    for (const slug of spaceSlugs) {
      const spaceDir = join(SPACES_DIR, slug)
      try {
        const s = await stat(spaceDir)
        if (!s.isDirectory()) continue
      } catch { continue }

      const spaceJson = await readJsonFile(join(spaceDir, 'space.json'))
      if (!spaceJson) continue

      const projects = await getProjectsForSpace(spaceDir)

      // Aggregate tasks across all projects
      let pending = 0, in_progress = 0, completed = 0
      let allTasks = []
      const projectTaskCounts = {}
      const projectCreatedAt = {}
      for (const project of projects) {
        const tasks = await getTasksForProject(spaceDir, project)
        allTasks = allTasks.concat(tasks)
        let pp = 0, pip = 0, pc = 0
        for (const t of tasks) {
          if (t.status === 'pending') { pending++; pp++ }
          else if (t.status === 'in_progress') { in_progress++; pip++ }
          else if (t.status === 'completed') { completed++; pc++ }
        }
        projectTaskCounts[project] = { pending: pp, in_progress: pip, completed: pc, total: pp + pip + pc }
        // Project creation date: earliest task createdAt, or directory birthtime
        const taskDates = tasks.map(t => t.createdAt).filter(Boolean).sort()
        if (taskDates.length > 0) {
          projectCreatedAt[project] = taskDates[0]
        } else {
          try {
            const dirStat = await stat(join(spaceDir, 'plans', project))
            projectCreatedAt[project] = dirStat.birthtime.toISOString()
          } catch { /* skip */ }
        }
      }

      // Count escalations for this space (pending only)
      const pendingEsc = await getEscalationsFromDir('needs_human')
      const draftEsc = await getEscalationsFromDir('untriaged')
      const escalationCount = [...pendingEsc, ...draftEsc].filter(e => e.space === slug).length

      spaces.push({
        name: spaceJson.name,
        slug: spaceJson.slug || slug,
        status: spaceJson.status || 'active',
        projects,
        taskCounts: {
          pending,
          in_progress,
          completed,
          total: pending + in_progress + completed,
        },
        projectTaskCounts,
        projectCreatedAt,
        escalationCount,
        lastUpdated: getLastUpdated(allTasks),
        ...getSpaceExtras(spaceJson),
      })
    }

    res.json({ spaces })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/spaces/:slug ---

app.get('/api/spaces/:slug', async (req, res) => {
  try {
    const { slug } = req.params
    const spaceDir = join(SPACES_DIR, slug)

    if (!existsSync(spaceDir)) {
      return res.status(404).json({ error: 'Space not found' })
    }

    const spaceJson = await readJsonFile(join(spaceDir, 'space.json'))
    if (!spaceJson) {
      return res.status(404).json({ error: 'Space config not found' })
    }

    const projects = await getProjectsForSpace(spaceDir)
    const overview = await readMarkdownFile(join(spaceDir, 'OVERVIEW.md'))

    // Aggregate task counts
    let pending = 0, in_progress = 0, completed = 0
    let allTasks = []
    const projectTaskCounts = {}
    const projectCreatedAt = {}
    for (const project of projects) {
      const tasks = await getTasksForProject(spaceDir, project)
      // Tag each task with its project name for pendingTasks aggregation
      for (const t of tasks) t._project = project
      allTasks = allTasks.concat(tasks)
      let pp = 0, pip = 0, pc = 0
      for (const t of tasks) {
        if (t.status === 'pending') { pending++; pp++ }
        else if (t.status === 'in_progress') { in_progress++; pip++ }
        else if (t.status === 'completed') { completed++; pc++ }
      }
      projectTaskCounts[project] = { pending: pp, in_progress: pip, completed: pc, total: pp + pip + pc }
      // Project creation date: earliest task createdAt, or directory birthtime
      const taskDates = tasks.map(t => t.createdAt).filter(Boolean).sort()
      if (taskDates.length > 0) {
        projectCreatedAt[project] = taskDates[0]
      } else {
        try {
          const dirStat = await stat(join(spaceDir, 'plans', project))
          projectCreatedAt[project] = dirStat.birthtime.toISOString()
        } catch { /* skip */ }
      }
    }

    const pendingEsc = await getEscalationsFromDir('needs_human')
    const draftEsc = await getEscalationsFromDir('untriaged')
    const escalationCount = [...pendingEsc, ...draftEsc].filter(e => e.space === slug).length

    // Build pendingTasks: pending + in_progress tasks across all projects
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    const pendingTasks = allTasks
      .filter(t => t.status === 'pending' || t.status === 'in_progress')
      .sort((a, b) => {
        // in_progress first, then pending
        if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1
        // within same status, sort by priority
        const pa = priorityOrder[a.priority] ?? 2
        const pb = priorityOrder[b.priority] ?? 2
        if (pa !== pb) return pa - pb
        // then by createdAt asc
        return (a.createdAt || '').localeCompare(b.createdAt || '')
      })
      .map(t => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        project: t._project,
        priority: t.priority || 'medium',
        createdAt: t.createdAt || null,
      }))

    // Build knowledgeFiles for this space
    const spaceKnowledgeDir = join(spaceDir, 'knowledge')
    const knowledgeEntries = await safeReaddir(spaceKnowledgeDir)
    const knowledgeFiles = []
    for (const f of knowledgeEntries.filter(f => !f.startsWith('.')).sort()) {
      try {
        const s = await stat(join(spaceKnowledgeDir, f))
        if (s.isFile()) {
          knowledgeFiles.push({ name: f, path: f })
        }
      } catch { /* skip */ }
    }

    res.json({
      space: {
        name: spaceJson.name,
        slug: spaceJson.slug || slug,
        status: spaceJson.status || 'active',
        projects,
        taskCounts: {
          pending,
          in_progress,
          completed,
          total: pending + in_progress + completed,
        },
        projectTaskCounts,
        projectCreatedAt,
        escalationCount,
        lastUpdated: getLastUpdated(allTasks),
        ...getSpaceExtras(spaceJson),
      },
      overview,
      projects,
      pendingTasks,
      knowledgeFiles,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/spaces/:slug/overview ---

app.get('/api/spaces/:slug/overview', async (req, res) => {
  try {
    const { slug } = req.params
    const result = await readMarkdownFile(join(SPACES_DIR, slug, 'OVERVIEW.md'))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/spaces/:slug/projects/:project/tasks ---

app.get('/api/spaces/:slug/projects/:project/tasks', async (req, res) => {
  try {
    const { slug, project } = req.params
    const spaceDir = join(SPACES_DIR, slug)
    const tasks = await getTasksForProject(spaceDir, project)
    res.json({ tasks })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/spaces/:slug/projects/:project/plan ---

app.get('/api/spaces/:slug/projects/:project/plan', async (req, res) => {
  try {
    const { slug, project } = req.params
    const result = await readMarkdownFile(join(SPACES_DIR, slug, 'plans', project, 'plan.md'))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/spaces/:slug/projects/:project/documents ---

app.get('/api/spaces/:slug/projects/:project/documents', async (req, res) => {
  try {
    const { slug, project } = req.params
    const projectDir = join(SPACES_DIR, slug, 'plans', project)
    const files = await safeReaddir(projectDir)
    const docs = []
    for (const file of files) {
      if (!file.endsWith('.md') || file === 'plan.md') continue
      const content = await readMarkdownFile(join(projectDir, file))
      docs.push({ name: file, ...content })
    }
    res.json({ documents: docs })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/escalations ---

app.get('/api/escalations', async (req, res) => {
  try {
    const { status, space, type } = req.query

    let escalations = []

    if (status) {
      // Only load from the requested status directory
      escalations = await getEscalationsFromDir(status)
    } else {
      // Load from all directories
      const draft = await getEscalationsFromDir('untriaged')
      const pending = await getEscalationsFromDir('needs_human')
      const resolved = await getEscalationsFromDir('resolved')
      escalations = [...draft, ...pending, ...resolved]
    }

    if (space) {
      escalations = escalations.filter(e => e.space === space)
    }
    if (type) {
      escalations = escalations.filter(e => e.type === type)
    }

    // Enrich with space display names
    const spaceNameCache = {}
    for (const esc of escalations) {
      if (esc.space && !spaceNameCache[esc.space]) {
        const spaceJson = await readJsonFile(join(SPACES_DIR, esc.space, 'space.json'))
        spaceNameCache[esc.space] = spaceJson?.name || esc.space
      }
      if (esc.space) esc.spaceName = spaceNameCache[esc.space]
    }

    // Sort: pending first, then by createdAt descending
    escalations.sort((a, b) => {
      const statusOrder = { needs_human: 0, untriaged: 1, resolved: 2 }
      const oa = statusOrder[a.status] ?? 3
      const ob = statusOrder[b.status] ?? 3
      if (oa !== ob) return oa - ob
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    res.json({ escalations })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- PATCH /api/escalations/:id ---

app.patch('/api/escalations/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { resolution } = req.body
    const filename = `${id}.json`

    // Find the escalation in needs_human, untriaged, or resolved (for overrides)
    const dirs = ['needs_human', 'untriaged', 'resolved']
    let sourceDir = null
    let escalation = null

    for (const dir of dirs) {
      const filePath = join(ESCALATIONS_DIR, dir, filename)
      const data = await readJsonFile(filePath)
      if (data) {
        sourceDir = dir
        escalation = data
        break
      }
    }

    if (!escalation) {
      return res.status(404).json({ error: 'Escalation not found' })
    }

    // Update fields
    escalation.status = 'resolved'
    escalation.resolution = resolution
    escalation.resolvedBy = 'user'
    escalation.resolvedAt = new Date().toISOString()

    // Ensure resolved directory exists
    const resolvedDir = join(ESCALATIONS_DIR, 'resolved')
    await mkdir(resolvedDir, { recursive: true })

    // Write to resolved directory
    const resolvedPath = join(resolvedDir, filename)
    await writeFile(resolvedPath, JSON.stringify(escalation, null, 2), 'utf-8')

    // Remove from source directory (if not already in resolved)
    if (sourceDir !== 'resolved') {
      const sourcePath = join(ESCALATIONS_DIR, sourceDir, filename)
      try {
        const { unlink } = await import('node:fs/promises')
        await unlink(sourcePath)
      } catch { /* file may already be moved */ }
    }

    // Notify orchestrator immediately via team-lead inbox
    try {
      const inboxPath = join(TEAM_INBOXES_DIR, 'team-lead.json')
      const inbox = await readJsonFile(inboxPath) || []
      inbox.push({
        from: 'dashboard-user',
        type: 'escalations_resolved',
        text: `User resolved escalation "${escalation.question || id}" for ${escalation.space || 'unknown'}/${escalation.project || 'unknown'}. Check ~/.superbot2/escalations/resolved/ for answers and unblock any blocked workers.`,
        summary: `Escalation resolved for ${escalation.space || 'unknown'}/${escalation.project || 'unknown'}`,
        timestamp: new Date().toISOString(),
        read: false,
      })
      await writeFile(inboxPath, JSON.stringify(inbox, null, 2), 'utf-8')
    } catch (inboxErr) {
      console.error('Failed to notify orchestrator inbox:', inboxErr.message)
    }

    // Trigger heartbeat on every resolve so the orchestrator picks up the change
    const heartbeatScript = join(SUPERBOT_DIR, 'scripts', 'heartbeat-cron.sh')
    execFile('bash', [heartbeatScript], (err) => {
      if (err) console.error('heartbeat trigger failed:', err.message)
      else console.log(`heartbeat fired: escalation resolved for ${escalation.space}/${escalation.project}`)
    })

    res.json(escalation)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- POST /api/escalations/:id/dismiss ---

app.post('/api/escalations/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params
    const filename = `${id}.json`
    const filePath = join(ESCALATIONS_DIR, 'resolved', filename)
    const escalation = await readJsonFile(filePath)

    if (!escalation) {
      return res.status(404).json({ error: 'Resolved escalation not found' })
    }

    escalation.dismissedAt = new Date().toISOString()
    await writeFile(filePath, JSON.stringify(escalation, null, 2), 'utf-8')

    res.json(escalation)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- DELETE /api/escalations/:id ---

app.delete('/api/escalations/:id', async (req, res) => {
  try {
    const { id } = req.params
    const filename = `${id}.json`

    // Search all directories
    const dirs = ['needs_human', 'untriaged', 'resolved']
    let found = false

    for (const dir of dirs) {
      const filePath = join(ESCALATIONS_DIR, dir, filename)
      const data = await readJsonFile(filePath)
      if (data) {
        await unlink(filePath)
        found = true
        break
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Escalation not found' })
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/auto-triage-rules ---

app.get('/api/auto-triage-rules', async (req, res) => {
  try {
    const rulesFile = join(SUPERBOT_DIR, 'auto-triage-rules.jsonl')
    let content = ''
    try {
      const { readFile } = await import('node:fs/promises')
      content = await readFile(rulesFile, 'utf-8')
    } catch {
      return res.json({ rules: [] })
    }
    const rules = content
      .split('\n')
      .filter(line => line.trim())
      .map((line, index) => {
        try {
          return { ...JSON.parse(line), index }
        } catch {
          return null
        }
      })
      .filter(Boolean)
    res.json({ rules })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- DELETE /api/auto-triage-rules/:index ---

app.delete('/api/auto-triage-rules/:index', async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10)
    const rulesFile = join(SUPERBOT_DIR, 'auto-triage-rules.jsonl')
    const { readFile, writeFile } = await import('node:fs/promises')
    let content = ''
    try { content = await readFile(rulesFile, 'utf-8') } catch { /* empty */ }
    const lines = content.split('\n').filter(l => l.trim())
    if (idx < 0 || idx >= lines.length) {
      return res.status(404).json({ error: 'Rule not found' })
    }
    lines.splice(idx, 1)
    await writeFile(rulesFile, lines.join('\n') + (lines.length ? '\n' : ''), 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- PUT /api/auto-triage-rules/:index ---

app.put('/api/auto-triage-rules/:index', async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10)
    const { rule } = req.body
    if (!rule || typeof rule !== 'string' || !rule.trim()) {
      return res.status(400).json({ error: 'rule is required' })
    }
    const rulesFile = join(SUPERBOT_DIR, 'auto-triage-rules.jsonl')
    const { readFile, writeFile } = await import('node:fs/promises')
    let content = ''
    try { content = await readFile(rulesFile, 'utf-8') } catch { /* empty */ }
    const lines = content.split('\n').filter(l => l.trim())
    if (idx < 0 || idx >= lines.length) {
      return res.status(404).json({ error: 'Rule not found' })
    }
    const existing = JSON.parse(lines[idx])
    existing.rule = rule.trim()
    lines[idx] = JSON.stringify(existing)
    await writeFile(rulesFile, lines.join('\n') + '\n', 'utf-8')
    res.json({ ...existing, index: idx })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- POST /api/auto-triage-rules ---

app.post('/api/auto-triage-rules', async (req, res) => {
  try {
    const { rule, source, space, project } = req.body
    if (!rule || typeof rule !== 'string' || !rule.trim()) {
      return res.status(400).json({ error: 'rule is required and must be a non-empty string' })
    }

    const entry = {
      rule: rule.trim(),
      source: source || null,
      addedAt: new Date().toISOString(),
      space: space || null,
      project: project || null,
    }

    const rulesFile = join(SUPERBOT_DIR, 'auto-triage-rules.jsonl')
    const { appendFile } = await import('node:fs/promises')
    await appendFile(rulesFile, JSON.stringify(entry) + '\n', 'utf-8')

    res.json(entry)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/spaces/:slug/escalations ---

app.get('/api/spaces/:slug/escalations', async (req, res) => {
  try {
    const { slug } = req.params
    const { status } = req.query

    let escalations = []

    if (status) {
      escalations = await getEscalationsFromDir(status)
    } else {
      const draft = await getEscalationsFromDir('untriaged')
      const pending = await getEscalationsFromDir('needs_human')
      const resolved = await getEscalationsFromDir('resolved')
      escalations = [...draft, ...pending, ...resolved]
    }

    escalations = escalations.filter(e => e.space === slug)

    // Enrich with space display name
    const spaceJson = await readJsonFile(join(SPACES_DIR, slug, 'space.json'))
    const spaceName = spaceJson?.name || slug
    for (const esc of escalations) {
      esc.spaceName = spaceName
    }

    escalations.sort((a, b) => {
      const statusOrder = { needs_human: 0, untriaged: 1, resolved: 2 }
      const oa = statusOrder[a.status] ?? 3
      const ob = statusOrder[b.status] ?? 3
      if (oa !== ob) return oa - ob
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    res.json({ escalations })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- GET /api/all-tasks ---

app.get('/api/all-tasks', async (req, res) => {
  try {
    const { status, space, project: projectFilter } = req.query
    const spaceSlugs = await safeReaddir(SPACES_DIR)
    const tasks = []

    for (const slug of spaceSlugs) {
      if (space && slug !== space) continue

      const spaceDir = join(SPACES_DIR, slug)
      try {
        const s = await stat(spaceDir)
        if (!s.isDirectory()) continue
      } catch { continue }

      const spaceJson = await readJsonFile(join(spaceDir, 'space.json'))
      if (!spaceJson) continue

      const projects = await getProjectsForSpace(spaceDir)

      for (const project of projects) {
        if (projectFilter && project !== projectFilter) continue

        const projectTasks = await getTasksForProject(spaceDir, project)
        for (const task of projectTasks) {
          if (status && task.status !== status) continue
          tasks.push({
            ...task,
            space: slug,
            spaceName: spaceJson.name,
            project,
          })
        }
      }
    }

    res.json({ tasks })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Dev server process management ---

const runningProcesses = new Map() // slug -> { pid, command, cwd, startedAt }

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

app.post('/api/spaces/:slug/start', async (req, res) => {
  try {
    const { slug } = req.params
    const spaceDir = join(SPACES_DIR, slug)
    const spaceJson = await readJsonFile(join(spaceDir, 'space.json'))

    if (!spaceJson?.devServer) {
      return res.status(400).json({ error: 'No devServer configured for this space' })
    }

    // Check if already running
    const existing = runningProcesses.get(slug)
    if (existing && isProcessAlive(existing.pid)) {
      return res.json({ status: 'already_running', pid: existing.pid, startedAt: existing.startedAt })
    }

    const { command, cwd } = spaceJson.devServer
    const child = spawn(command, {
      cwd,
      detached: true,
      stdio: 'ignore',
      shell: true,
    })

    child.unref()

    runningProcesses.set(slug, {
      pid: child.pid,
      command,
      cwd,
      startedAt: new Date().toISOString(),
    })

    res.json({ status: 'started', pid: child.pid })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/spaces/:slug/deploy', async (req, res) => {
  try {
    const { slug } = req.params
    const spaceDir = join(SPACES_DIR, slug)
    const spaceJson = await readJsonFile(join(spaceDir, 'space.json'))

    if (!spaceJson?.deploy) {
      return res.status(400).json({ error: 'No deploy configured for this space' })
    }

    const { command, cwd } = spaceJson.deploy
    const child = spawn(command, {
      cwd,
      detached: true,
      stdio: 'ignore',
      shell: true,
    })

    child.unref()

    res.json({ status: 'deploying', pid: child.pid })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/spaces/:slug/stop', async (req, res) => {
  try {
    const { slug } = req.params
    const existing = runningProcesses.get(slug)

    if (!existing) {
      return res.status(404).json({ error: 'No running process found for this space' })
    }

    try {
      // Kill the process group (negative pid kills the group)
      process.kill(-existing.pid, 'SIGTERM')
    } catch {
      // Process may already be dead
    }

    runningProcesses.delete(slug)
    res.json({ status: 'stopped' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/spaces/:slug/server-status', async (req, res) => {
  try {
    const { slug } = req.params
    const spaceDir = join(SPACES_DIR, slug)
    const spaceJson = await readJsonFile(join(spaceDir, 'space.json'))
    const existing = runningProcesses.get(slug)

    const extras = getSpaceExtras(spaceJson || {})

    if (existing && isProcessAlive(existing.pid)) {
      res.json({ running: true, pid: existing.pid, startedAt: existing.startedAt, ...extras })
    } else {
      // Clean up stale entry
      if (existing) runningProcesses.delete(slug)
      res.json({ running: false, ...extras })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- System status ---

app.get('/api/status', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    let heartbeatRunning = false
    let schedulerRunning = false
    try { execSync('launchctl list com.superbot2.heartbeat', { stdio: 'pipe' }); heartbeatRunning = true } catch {}
    try { execSync('launchctl list com.superbot2.scheduler', { stdio: 'pipe' }); schedulerRunning = true } catch {}
    let imessageRunning = false
    try { execSync('pgrep -f imessage-watcher.sh', { stdio: 'pipe' }); imessageRunning = true } catch {}
    let telegramRunning = false
    try { execSync('pgrep -f telegram-watcher', { stdio: 'pipe' }); telegramRunning = true } catch {}
    res.json({ heartbeatRunning, schedulerRunning, imessageRunning, telegramRunning })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- iMessage integration ---

app.get('/api/imessage/status', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    const config = await readJsonFile(join(SUPERBOT_DIR, 'config.json'))
    const imessage = config?.imessage || {}

    let watcherRunning = false
    try { execSync('pgrep -f imessage-watcher.sh', { stdio: 'pipe' }); watcherRunning = true } catch {}

    let chatDbReadable = false
    try { execSync(`sqlite3 -readonly ${join(homedir(), 'Library/Messages/chat.db')} "SELECT 1;"`, { stdio: 'pipe' }); chatDbReadable = true } catch {}

    res.json({
      enabled: imessage.enabled ?? false,
      appleId: imessage.appleId || '',
      phoneNumber: imessage.phoneNumber || '',
      watcherRunning,
      chatDbReadable,
      configured: !!(imessage.appleId && imessage.appleId.length > 0),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/imessage/save', async (req, res) => {
  try {
    const { appleId, phoneNumber } = req.body
    const configPath = join(SUPERBOT_DIR, 'config.json')
    const config = await readJsonFile(configPath) || {}
    config.imessage = { ...config.imessage, enabled: true, appleId, phoneNumber }
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // Start watcher if not running
    const { execSync } = await import('node:child_process')
    let watcherRunning = false
    try { execSync('pgrep -f imessage-watcher.sh', { stdio: 'pipe' }); watcherRunning = true } catch {}

    if (!watcherRunning) {
      const logsDir = join(SUPERBOT_DIR, 'logs')
      if (!existsSync(logsDir)) await mkdir(logsDir, { recursive: true })
      const watcherLog = join(logsDir, 'imessage-watcher.log')
      const watcherScript = join(SUPERBOT_DIR, 'scripts', 'imessage-watcher.sh')
      const child = spawn('bash', [watcherScript], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      // Pipe output to log file — use { end: false } so the first stream to close
      // doesn't auto-close logStream before the other stream finishes writing
      const logStream = (await import('node:fs')).createWriteStream(watcherLog, { flags: 'a' })
      child.stdout.pipe(logStream, { end: false })
      child.stderr.pipe(logStream, { end: false })
      child.on('close', () => logStream.end())
      child.unref()
      watcherRunning = true
    }

    let chatDbReadable = false
    try { execSync(`sqlite3 -readonly ${join(homedir(), 'Library/Messages/chat.db')} "SELECT 1;"`, { stdio: 'pipe' }); chatDbReadable = true } catch {}

    res.json({
      enabled: true,
      appleId,
      phoneNumber,
      watcherRunning,
      chatDbReadable,
      configured: true,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/imessage/start', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    let watcherRunning = false
    try { execSync('pgrep -f imessage-watcher.sh', { stdio: 'pipe' }); watcherRunning = true } catch {}

    if (!watcherRunning) {
      const logsDir = join(SUPERBOT_DIR, 'logs')
      if (!existsSync(logsDir)) await mkdir(logsDir, { recursive: true })
      const watcherLog = join(logsDir, 'imessage-watcher.log')
      const watcherScript = join(SUPERBOT_DIR, 'scripts', 'imessage-watcher.sh')
      const child = spawn('bash', [watcherScript], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const logStream = (await import('node:fs')).createWriteStream(watcherLog, { flags: 'a' })
      child.stdout.pipe(logStream, { end: false })
      child.stderr.pipe(logStream, { end: false })
      child.on('close', () => logStream.end())
      child.unref()
    }

    res.json({ watcherRunning: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/imessage/stop', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    try { execSync('pkill -f imessage-watcher.sh', { stdio: 'pipe' }) } catch {}
    res.json({ watcherRunning: false })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/imessage/test', async (_req, res) => {
  try {
    const config = await readJsonFile(join(SUPERBOT_DIR, 'config.json'))
    const phone = config?.imessage?.phoneNumber
    if (!phone) return res.status(400).json({ sent: false, error: 'No phone number configured' })

    const sendScript = join(SUPERBOT_DIR, 'scripts', 'send-imessage.sh')
    const result = await new Promise((resolve) => {
      execFile('bash', [sendScript, phone, 'superbot2 test ✓'], { timeout: 15_000 }, (err, stdout, stderr) => {
        if (err) resolve({ sent: false, error: stderr || err.message })
        else resolve({ sent: true })
      })
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ sent: false, error: err.message })
  }
})

app.post('/api/imessage/reset', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    // Stop watcher
    try { execSync('pkill -f imessage-watcher.sh', { stdio: 'pipe' }) } catch {}

    // Clear config
    const configPath = join(SUPERBOT_DIR, 'config.json')
    const config = await readJsonFile(configPath) || {}
    config.imessage = { enabled: false, appleId: '', phoneNumber: '' }
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // Delete last-rowid file
    const rowidFile = join(SUPERBOT_DIR, 'imessage-last-rowid.txt')
    if (existsSync(rowidFile)) await unlink(rowidFile)

    res.json({ reset: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Telegram integration ---

app.get('/api/telegram/status', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    const config = await readJsonFile(join(SUPERBOT_DIR, 'config.json'))
    const telegram = config?.telegram || {}

    let watcherRunning = false
    try { execSync('pgrep -f telegram-watcher', { stdio: 'pipe' }); watcherRunning = true } catch {}

    res.json({
      enabled: telegram.enabled ?? false,
      botToken: telegram.botToken ? '***' + telegram.botToken.slice(-6) : '',
      chatId: telegram.chatId || '',
      watcherRunning,
      configured: !!(telegram.botToken && telegram.botToken.length > 0),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/telegram/save', async (req, res) => {
  try {
    const { botToken } = req.body
    if (!botToken || !botToken.trim()) {
      return res.status(400).json({ error: 'botToken is required' })
    }

    const configPath = join(SUPERBOT_DIR, 'config.json')
    const config = await readJsonFile(configPath) || {}
    config.telegram = { ...config.telegram, enabled: true, botToken: botToken.trim() }
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // Start watcher if not running
    const { execSync } = await import('node:child_process')
    let watcherRunning = false
    try { execSync('pgrep -f telegram-watcher', { stdio: 'pipe' }); watcherRunning = true } catch {}

    if (!watcherRunning) {
      const logsDir = join(SUPERBOT_DIR, 'logs')
      if (!existsSync(logsDir)) await mkdir(logsDir, { recursive: true })
      const watcherLog = join(logsDir, 'telegram-watcher.log')
      const watcherScript = join(import.meta.dirname, '..', 'scripts', 'telegram-watcher.mjs')
      const child = spawn('node', [watcherScript], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const logStream = (await import('node:fs')).createWriteStream(watcherLog, { flags: 'a' })
      child.stdout.pipe(logStream, { end: false })
      child.stderr.pipe(logStream, { end: false })
      child.on('close', () => logStream.end())
      child.unref()
      watcherRunning = true
    }

    res.json({
      enabled: true,
      botToken: '***' + botToken.trim().slice(-6),
      chatId: config.telegram.chatId || '',
      watcherRunning,
      configured: true,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/telegram/start', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    let watcherRunning = false
    try { execSync('pgrep -f telegram-watcher', { stdio: 'pipe' }); watcherRunning = true } catch {}

    if (!watcherRunning) {
      const logsDir = join(SUPERBOT_DIR, 'logs')
      if (!existsSync(logsDir)) await mkdir(logsDir, { recursive: true })
      const watcherLog = join(logsDir, 'telegram-watcher.log')
      const watcherScript = join(import.meta.dirname, '..', 'scripts', 'telegram-watcher.mjs')
      const child = spawn('node', [watcherScript], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const logStream = (await import('node:fs')).createWriteStream(watcherLog, { flags: 'a' })
      child.stdout.pipe(logStream, { end: false })
      child.stderr.pipe(logStream, { end: false })
      child.on('close', () => logStream.end())
      child.unref()
    }

    res.json({ watcherRunning: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/telegram/stop', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    try { execSync('pkill -f telegram-watcher', { stdio: 'pipe' }) } catch {}
    res.json({ watcherRunning: false })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/telegram/test', async (_req, res) => {
  try {
    const config = await readJsonFile(join(SUPERBOT_DIR, 'config.json'))
    const botToken = config?.telegram?.botToken
    const chatId = config?.telegram?.chatId

    if (!botToken) return res.status(400).json({ sent: false, error: 'No bot token configured' })
    if (!chatId) return res.status(400).json({ sent: false, error: 'No chat ID yet — send a message to your bot first' })

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: 'superbot2 test message' }),
    })

    const tgJson = await tgRes.json()
    if (tgJson.ok) {
      res.json({ sent: true })
    } else {
      res.json({ sent: false, error: tgJson.description || 'Unknown Telegram error' })
    }
  } catch (err) {
    res.status(500).json({ sent: false, error: err.message })
  }
})

// --- Browser (superbot2 Chrome profile) ---

app.get('/api/browser/status', async (_req, res) => {
  try {
    const profileDir = join(homedir(), '.superbot2', 'browser', 'Default')
    const configured = existsSync(profileDir)

    let running = false
    try {
      execFileSync('lsof', ['-i', ':9222'], { stdio: 'pipe' })
      running = true
    } catch {}

    let agentBrowserInstalled = false
    try {
      execFileSync('npx', ['agent-browser', '--version'], { stdio: 'pipe', timeout: 10000 })
      agentBrowserInstalled = true
    } catch {}

    res.json({ configured, running, agentBrowserInstalled })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/browser/setup', async (_req, res) => {
  try {
    // Run init.sh from the superbot-browser skill templates
    const initScript = join(SUPERBOT_DIR, '.claude', 'skills', 'superbot-browser', 'templates', 'init.sh')
    const setupOutput = await new Promise((resolve, reject) => {
      execFile('bash', [initScript], { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout)
      })
    })

    res.json({ success: true, output: setupOutput })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/browser/open', async (_req, res) => {
  try {
    // Run setup.sh from the superbot-browser skill templates (starts Chrome with CDP if not already running)
    const openScript = join(SUPERBOT_DIR, '.claude', 'skills', 'superbot-browser', 'templates', 'setup.sh')
    if (!existsSync(openScript)) {
      return res.status(404).json({ success: false, error: 'setup.sh not found. Run setup first.' })
    }

    await new Promise((resolve, reject) => {
      execFile('bash', [openScript], { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout)
      })
    })

    // Bring Chrome to front
    execFile('open', ['-a', 'Google Chrome'], { timeout: 5000 }, () => {})

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// --- Heartbeat config ---

app.get('/api/heartbeat', async (_req, res) => {
  try {
    const config = await readJsonFile(join(SUPERBOT_DIR, 'config.json'))
    res.json({ intervalMinutes: config?.heartbeat?.intervalMinutes ?? 30 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/heartbeat', async (req, res) => {
  try {
    const { intervalMinutes } = req.body
    const configPath = join(SUPERBOT_DIR, 'config.json')
    const config = await readJsonFile(configPath) || {}
    if (!config.heartbeat) config.heartbeat = {}
    config.heartbeat.intervalMinutes = intervalMinutes
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    res.json({ intervalMinutes })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/heartbeat/activity', async (_req, res) => {
  try {
    const activity = await readJsonFile(join(SUPERBOT_DIR, 'logs', 'heartbeat-activity.json'))
    res.json({ activity: activity || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Todos ---

const TODOS_FILE = join(SUPERBOT_DIR, 'todos.json')

async function readTodos() {
  const data = await readJsonFile(TODOS_FILE)
  if (!data) return []
  // Migrate: ensure every todo has a notes array
  return data.map(t => ({ ...t, notes: t.notes || [] }))
}

async function writeTodos(todos) {
  await writeFile(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf-8')
}

app.get('/api/todos', async (_req, res) => {
  try {
    const todos = await readTodos()
    res.json({ todos })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/todos', async (req, res) => {
  try {
    const { text } = req.body
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Missing or empty text' })
    }
    const todos = await readTodos()
    const newTodo = { id: Date.now().toString(), text: text.trim(), completed: false, notes: [] }
    todos.push(newTodo)
    await writeTodos(todos)
    res.json({ todo: newTodo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/todos/:id', async (req, res) => {
  try {
    const todos = await readTodos()
    const idx = todos.findIndex(t => t.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Todo not found' })
    const { text, completed } = req.body
    if (text !== undefined) todos[idx].text = text
    if (completed !== undefined) todos[idx].completed = completed
    await writeTodos(todos)
    res.json({ todo: todos[idx] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/todos/:id', async (req, res) => {
  try {
    const todos = await readTodos()
    const filtered = todos.filter(t => t.id !== req.params.id)
    if (filtered.length === todos.length) return res.status(404).json({ error: 'Todo not found' })
    await writeTodos(filtered)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Knowledge files ---

app.get('/api/knowledge', async (_req, res) => {
  try {
    const groups = []

    async function getFilesWithMeta(dirPath, prefix = '') {
      const entries = await safeReaddir(dirPath)
      const sorted = entries.filter(f => !f.startsWith('.')).sort()
      const result = []
      for (const f of sorted) {
        const fullPath = join(dirPath, f)
        const relPath = prefix ? `${prefix}/${f}` : f
        try {
          const s = await stat(fullPath)
          if (s.isDirectory()) {
            const nested = await getFilesWithMeta(fullPath, relPath)
            result.push(...nested)
          } else if (s.isFile()) {
            result.push({ name: f, path: relPath, lastModified: s.mtime.toISOString() })
          }
        } catch { /* skip */ }
      }
      return result
    }

    // Global knowledge
    const globalFiles = await getFilesWithMeta(KNOWLEDGE_DIR)
    if (globalFiles.length > 0) {
      groups.push({ source: 'global', label: 'Global', files: globalFiles })
    }

    // Per-space knowledge
    const spaceSlugs = await safeReaddir(SPACES_DIR)
    const sortedSlugs = spaceSlugs.sort()
    for (const slug of sortedSlugs) {
      try {
        const s = await stat(join(SPACES_DIR, slug))
        if (!s.isDirectory()) continue
      } catch { continue }

      const spaceKnowledgeDir = join(SPACES_DIR, slug, 'knowledge')
      const files = await getFilesWithMeta(spaceKnowledgeDir)
      if (files.length === 0) continue

      const spaceJson = await readJsonFile(join(SPACES_DIR, slug, 'space.json'))
      const label = spaceJson?.name || slug

      groups.push({ source: slug, label, files })
    }

    res.json({ groups })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/knowledge/:source/:filename', async (req, res) => {
  try {
    const { source, filename } = req.params
    const safeName = filename.replace(/\.\./g, '').replace(/[^a-zA-Z0-9_\-\.\/]/g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
    if (!safeName) return res.status(400).json({ error: 'Invalid filename' })

    let filePath
    if (source === 'global') {
      filePath = join(KNOWLEDGE_DIR, safeName)
    } else {
      const safeSource = source.replace(/[^a-zA-Z0-9_\-]/g, '')
      filePath = join(SPACES_DIR, safeSource, 'knowledge', safeName)
    }

    const result = await readMarkdownFile(filePath)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/knowledge/:source/:filename', async (req, res) => {
  try {
    const { source, filename } = req.params
    const { content } = req.body
    if (typeof content !== 'string') return res.status(400).json({ error: 'Missing content' })

    const safeName = filename.replace(/\.\./g, '').replace(/[^a-zA-Z0-9_\-\.\/]/g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
    if (!safeName) return res.status(400).json({ error: 'Invalid filename' })

    let filePath
    if (source === 'global') {
      filePath = join(KNOWLEDGE_DIR, safeName)
    } else {
      const safeSource = source.replace(/[^a-zA-Z0-9_\-]/g, '')
      filePath = join(SPACES_DIR, safeSource, 'knowledge', safeName)
    }

    // Ensure parent directory exists for nested paths
    const parentDir = filePath.substring(0, filePath.lastIndexOf('/'))
    await mkdir(parentDir, { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/knowledge/:source/:filename', async (req, res) => {
  try {
    const { source, filename } = req.params
    const safeName = filename.replace(/\.\./g, '').replace(/[^a-zA-Z0-9_\-\.\/]/g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
    if (!safeName) return res.status(400).json({ error: 'Invalid filename' })

    let filePath
    if (source === 'global') {
      filePath = join(KNOWLEDGE_DIR, safeName)
    } else {
      const safeSource = source.replace(/[^a-zA-Z0-9_\-]/g, '')
      filePath = join(SPACES_DIR, safeSource, 'knowledge', safeName)
    }

    await unlink(filePath)
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' })
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/knowledge/:source', async (req, res) => {
  try {
    const { source } = req.params
    const { filename, content } = req.body
    if (!filename || typeof filename !== 'string') return res.status(400).json({ error: 'Missing filename' })

    const safeName = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '')
    // Default to .md if no extension provided
    const fullName = safeName.includes('.') ? safeName : `${safeName}.md`

    let dirPath, filePath
    if (source === 'global') {
      dirPath = KNOWLEDGE_DIR
      filePath = join(KNOWLEDGE_DIR, fullName)
    } else {
      const safeSource = source.replace(/[^a-zA-Z0-9_\-]/g, '')
      dirPath = join(SPACES_DIR, safeSource, 'knowledge')
      filePath = join(dirPath, fullName)
    }

    if (existsSync(filePath)) return res.status(409).json({ error: 'File already exists' })

    await mkdir(dirPath, { recursive: true })
    await writeFile(filePath, content || '', 'utf-8')
    res.json({ ok: true, filename: fullName })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Upload file to knowledge directory
const knowledgeUpload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }) // 10MB limit
app.post('/api/knowledge/:source/upload', knowledgeUpload.single('file'), async (req, res) => {
  try {
    const { source } = req.params
    if (!req.file) return res.status(400).json({ error: 'No file provided' })

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '')
    if (!safeName) return res.status(400).json({ error: 'Invalid filename' })

    let dirPath, filePath
    if (source === 'global') {
      dirPath = KNOWLEDGE_DIR
      filePath = join(KNOWLEDGE_DIR, safeName)
    } else {
      const safeSource = source.replace(/[^a-zA-Z0-9_\-]/g, '')
      dirPath = join(SPACES_DIR, safeSource, 'knowledge')
      filePath = join(dirPath, safeName)
    }

    await mkdir(dirPath, { recursive: true })
    await writeFile(filePath, req.file.buffer)
    res.json({ ok: true, filename: safeName })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/user', async (req, res) => {
  try {
    const { content } = req.body
    if (typeof content !== 'string') return res.status(400).json({ error: 'Missing content' })
    await writeFile(join(SUPERBOT_DIR, 'USER.md'), content, 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Dashboard config ---

const DEFAULT_DASHBOARD_CONFIG = {
  leftColumn: ['workers', 'escalations', 'orchestrator-resolved', 'recent-activity'],
  centerColumn: ['chat'],
  rightColumn: ['pulse', 'schedule', 'todos', 'knowledge', 'extensions'],
  hidden: [],
}

const VALID_SECTION_IDS = ['escalations', 'orchestrator-resolved', 'recent-activity', 'pulse', 'schedule', 'todos', 'knowledge', 'extensions', 'spaces', 'chat', 'workers']

app.get('/api/dashboard-config', async (_req, res) => {
  try {
    const config = await readJsonFile(join(SUPERBOT_DIR, 'dashboard-config.json'))
    if (config && !config.centerColumn) {
      config.centerColumn = ['chat']
    }
    res.json({ config: config || DEFAULT_DASHBOARD_CONFIG })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/dashboard-config', async (req, res) => {
  try {
    const { config } = req.body
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid config object' })
    }
    const { leftColumn, centerColumn = [], rightColumn, hidden } = config
    if (!Array.isArray(leftColumn) || !Array.isArray(centerColumn) || !Array.isArray(rightColumn) || !Array.isArray(hidden)) {
      return res.status(400).json({ error: 'config must have leftColumn, centerColumn, rightColumn, and hidden arrays' })
    }
    const allIds = [...leftColumn, ...centerColumn, ...rightColumn, ...hidden]
    const invalidIds = allIds.filter(id => !VALID_SECTION_IDS.includes(id))
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: `Invalid section IDs: ${invalidIds.join(', ')}` })
    }
    const configPath = join(SUPERBOT_DIR, 'dashboard-config.json')
    await writeFile(configPath, JSON.stringify({ leftColumn, centerColumn, rightColumn, hidden }, null, 2), 'utf-8')
    res.json({ config: { leftColumn, centerColumn, rightColumn, hidden } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Activity (parsed from JSONL transcripts) ---

let activityCache = { data: null, fetchedAt: 0, hourBoundary: 0 }

app.get('/api/activity', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || '24', 10)
    const now = Date.now()
    const currentHourBoundary = now - (now % (60 * 60 * 1000))
    // Cache for 60 seconds, but also bust when the hour rolls over
    const cacheIsStale = !activityCache.data ||
      (now - activityCache.fetchedAt) >= 60_000 ||
      activityCache.hourBoundary !== currentHourBoundary
    if (!cacheIsStale && hours === 24) {
      return res.json({ activity: activityCache.data })
    }

    const scriptPath = join(import.meta.dirname, '..', 'scripts', 'parse-activity.mjs')
    const nodePath = process.execPath
    const result = await new Promise((resolve, reject) => {
      execFile(nodePath, [scriptPath, String(hours)], { timeout: 10_000 }, (err, stdout) => {
        if (err) return reject(err)
        resolve(stdout.trim())
      })
    })

    const activity = JSON.parse(result)
    if (hours === 24) {
      activityCache = { data: activity, fetchedAt: now, hourBoundary: currentHourBoundary }
    }
    res.json({ activity })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Schedule endpoints ---

app.get('/api/schedule', async (_req, res) => {
  try {
    const config = await readJsonFile(join(SUPERBOT_DIR, 'config.json'))
    const lastRun = await readJsonFile(join(SUPERBOT_DIR, 'schedule-last-run.json'))
    const schedule = config?.schedule || []

    // Check if scheduler launchd agent is loaded
    let schedulerRunning = false
    try {
      const { execSync } = await import('node:child_process')
      execSync('launchctl list com.superbot2.scheduler', { stdio: 'pipe' })
      schedulerRunning = true
    } catch { /* not loaded */ }

    res.json({ schedule, lastRun: lastRun || {}, schedulerRunning })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/schedule', async (req, res) => {
  try {
    const { schedule } = req.body
    const configPath = join(SUPERBOT_DIR, 'config.json')
    const config = await readJsonFile(configPath) || {}
    config.schedule = schedule
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    res.json({ schedule: config.schedule })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/schedule/:name', async (req, res) => {
  try {
    const { name } = req.params
    const configPath = join(SUPERBOT_DIR, 'config.json')
    const config = await readJsonFile(configPath) || {}
    config.schedule = (config.schedule || []).filter(j => j.name !== name)
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    res.json({ schedule: config.schedule })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/schedule', async (req, res) => {
  try {
    const job = req.body

    // Validate required fields
    if (!job.name || typeof job.name !== 'string') {
      return res.status(400).json({ error: 'name is required' })
    }
    const timePattern = /^\d{1,2}:\d{2}$/
    const hasTime = job.time && typeof job.time === 'string' && timePattern.test(job.time)
    const hasTimes = Array.isArray(job.times) && job.times.length > 0 && job.times.every(t => typeof t === 'string' && timePattern.test(t))
    if (!hasTime && !hasTimes) {
      return res.status(400).json({ error: 'time (HH:MM string) or times (HH:MM string[]) is required' })
    }
    if (!job.task || typeof job.task !== 'string') {
      return res.status(400).json({ error: 'task is required' })
    }

    const configPath = join(SUPERBOT_DIR, 'config.json')
    const config = await readJsonFile(configPath) || {}
    if (!config.schedule) config.schedule = []

    // Replace if same name exists, otherwise append
    const idx = config.schedule.findIndex(j => j.name === job.name)
    if (idx >= 0) {
      config.schedule[idx] = job
    } else {
      config.schedule.push(job)
    }

    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    res.json({ schedule: config.schedule })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Skills page endpoints ---

const CLAUDE_DIR = join(SUPERBOT_DIR, '.claude')
const PLUGINS_CACHE_DIR = join(CLAUDE_DIR, 'plugins', 'cache')

// Scan an installed plugin's cache dir for component counts & items
async function scanPluginComponents(installPath) {
  const counts = { commands: 0, skills: 0, agents: 0, hooks: 0 }
  const items = { commands: [], skills: [], agents: [], hooks: [] }

  // commands/*.md
  const cmds = await safeReaddir(join(installPath, 'commands'))
  for (const f of cmds) {
    if (f.endsWith('.md')) {
      counts.commands++
      items.commands.push(f.replace(/\.md$/, ''))
    }
  }

  // skills/*/SKILL.md
  const skillDirs = await safeReaddir(join(installPath, 'skills'))
  for (const d of skillDirs) {
    try {
      const s = await stat(join(installPath, 'skills', d))
      if (!s.isDirectory()) continue
      await stat(join(installPath, 'skills', d, 'SKILL.md'))
      counts.skills++
      items.skills.push(d)
    } catch { /* skip */ }
  }

  // agents/*.md
  const agentFiles = await safeReaddir(join(installPath, 'agents'))
  for (const f of agentFiles) {
    if (f.endsWith('.md')) {
      counts.agents++
      items.agents.push(f.replace(/\.md$/, ''))
    }
  }

  // hooks/ (non-scripts)
  const hookFiles = await safeReaddir(join(installPath, 'hooks'))
  for (const f of hookFiles) {
    if (f !== 'scripts') {
      counts.hooks++
      items.hooks.push(f)
    }
  }

  return { counts, items }
}

// Get all installed plugin dirs with their metadata
async function getInstalledPluginDirs() {
  const results = []
  const marketplaces = await safeReaddir(PLUGINS_CACHE_DIR)
  for (const marketplace of marketplaces) {
    const mDir = join(PLUGINS_CACHE_DIR, marketplace)
    try { if (!(await stat(mDir)).isDirectory()) continue } catch { continue }
    const pluginNames = await safeReaddir(mDir)
    for (const pluginName of pluginNames) {
      const pDir = join(mDir, pluginName)
      try { if (!(await stat(pDir)).isDirectory()) continue } catch { continue }
      const versions = await safeReaddir(pDir)
      for (const version of versions) {
        const vDir = join(pDir, version)
        try { if (!(await stat(vDir)).isDirectory()) continue } catch { continue }
        const pluginJson = await readJsonFile(join(vDir, '.claude-plugin', 'plugin.json'))
        results.push({
          installPath: vDir,
          pluginId: `${pluginName}@${marketplace}`,
          pluginName: pluginJson?.name || pluginName,
          marketplace,
        })
      }
    }
  }
  return results
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  try {
    return yaml.load(match[1]) || {}
  } catch {
    return {}
  }
}

// --- Plugin Credentials (macOS Keychain) ---

const KEYCHAIN_SERVICE = 'superbot2-plugin-credentials'

function keychainExec(args) {
  return new Promise((resolve, reject) => {
    execFile('security', args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      resolve(stdout.trim())
    })
  })
}

async function keychainSet(pluginName, key, value) {
  const account = `${pluginName}/${key}`
  await keychainExec(['add-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w', value, '-U'])
}

async function keychainGet(pluginName, key) {
  const account = `${pluginName}/${key}`
  try {
    return await keychainExec(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'])
  } catch {
    return null
  }
}

async function keychainDelete(pluginName, key) {
  const account = `${pluginName}/${key}`
  try {
    await keychainExec(['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account])
    return true
  } catch {
    return false
  }
}

async function keychainHas(pluginName, key) {
  return (await keychainGet(pluginName, key)) !== null
}

// Check if a CLI binary exists on the system
function checkBinExists(bin) {
  return new Promise((resolve) => {
    execFile('which', [bin], (err) => {
      resolve(!err)
    })
  })
}

// Read openclaw bin requirements from all SKILL.md files in a plugin
async function getPluginOpenclawBins(installPath) {
  const skillsDir = join(installPath, 'skills')
  const entries = await safeReaddir(skillsDir)
  const allRequired = []
  const allInstallOptions = []
  for (const entry of entries) {
    const skillMd = join(skillsDir, entry, 'SKILL.md')
    try {
      const content = await readFile(skillMd, 'utf-8')
      const fm = parseFrontmatter(content)
      const openclaw = fm.metadata?.openclaw
      if (!openclaw) continue
      const bins = openclaw.requires?.bins
      if (Array.isArray(bins)) {
        for (const bin of bins) {
          if (!allRequired.includes(bin)) allRequired.push(bin)
        }
      }
      const install = openclaw.install
      if (Array.isArray(install)) {
        for (const opt of install) {
          allInstallOptions.push(opt)
        }
      }
    } catch { /* skip */ }
  }
  if (allRequired.length === 0) return { missingBins: [] }
  const missingBins = []
  for (const bin of allRequired) {
    const exists = await checkBinExists(bin)
    if (!exists) {
      const installOpts = allInstallOptions
        .filter(o => Array.isArray(o.bins) ? o.bins.includes(bin) : false)
        .map(o => ({ id: o.id, kind: o.kind, formula: o.formula, label: o.label }))
      missingBins.push({ bin, installOptions: installOpts })
    }
  }
  return { missingBins }
}

// Read credential declarations from all SKILL.md files in a plugin, with plugin.json fallback
async function getPluginCredentials(installPath) {
  // Check SKILL.md frontmatter first (primary source)
  const skillsDir = join(installPath, 'skills')
  const entries = await safeReaddir(skillsDir)
  for (const entry of entries) {
    const skillMd = join(skillsDir, entry, 'SKILL.md')
    try {
      const content = await readFile(skillMd, 'utf-8')
      const fm = parseFrontmatter(content)
      // Support both metadata.credentials (correct) and top-level credentials (legacy)
      const creds = fm.metadata?.credentials ?? fm.credentials
      if (Array.isArray(creds) && creds.length > 0) {
        return creds
      }
    } catch { /* skip */ }
  }
  // Fallback: check plugin.json for credentials
  const pj = await readJsonFile(join(installPath, '.claude-plugin', 'plugin.json'))
  if (pj && Array.isArray(pj.credentials) && pj.credentials.length > 0) {
    return pj.credentials
  }
  return []
}

// GET /api/plugins/:name/credentials — list declared credentials with configured status
app.get('/api/plugins/:name/credentials', async (req, res) => {
  try {
    const pluginName = req.params.name
    const pluginDirs = await getInstalledPluginDirs()
    const pd = pluginDirs.find(p => p.pluginName === pluginName || p.pluginId === pluginName)
    if (!pd) return res.status(404).json({ error: 'Plugin not found' })

    const credentials = await getPluginCredentials(pd.installPath)
    const configured = {}
    for (const cred of credentials) {
      configured[cred.key] = await keychainHas(pd.pluginName, cred.key)
    }
    res.json({ credentials, configured })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Credential Validators ---
// Extensible map of credential key → validation function
// Each returns { valid: boolean, error?: string }

const CREDENTIAL_VALIDATORS = {
  GEMINI_API_KEY: async (value) => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}`
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (response.ok) return { valid: true }
      const body = await response.json().catch(() => ({}))
      const msg = body?.error?.message || `HTTP ${response.status}`
      return { valid: false, error: msg }
    } catch (err) {
      return { valid: false, error: err.message || 'Network error' }
    }
  },
}

// POST /api/plugins/:name/credentials — save a credential to Keychain, optionally validate
app.post('/api/plugins/:name/credentials', async (req, res) => {
  try {
    const pluginName = req.params.name
    const { key, value } = req.body
    if (!key || !value) return res.status(400).json({ error: 'key and value required' })

    const pluginDirs = await getInstalledPluginDirs()
    const pd = pluginDirs.find(p => p.pluginName === pluginName || p.pluginId === pluginName)
    if (!pd) return res.status(404).json({ error: 'Plugin not found' })

    await keychainSet(pd.pluginName, key, value)

    // Validate if a validator exists for this credential key
    const validator = CREDENTIAL_VALIDATORS[key]
    if (validator) {
      const validation = await validator(value)
      return res.json({ ok: true, validation })
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/plugins/:name/credentials/:key — remove from Keychain
app.delete('/api/plugins/:name/credentials/:key', async (req, res) => {
  try {
    const pluginName = req.params.name
    const { key } = req.params

    const pluginDirs = await getInstalledPluginDirs()
    const pd = pluginDirs.find(p => p.pluginName === pluginName || p.pluginId === pluginName)
    if (!pd) return res.status(404).json({ error: 'Plugin not found' })

    const deleted = await keychainDelete(pd.pluginName, key)
    res.json({ ok: deleted })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Self-Improvement ---

const ANALYSIS_HISTORY_DIR = join(SUPERBOT_DIR, 'analysis-history')
const SELF_IMPROVEMENT_SCRIPT = join(import.meta.dirname, '..', 'scripts', 'run-self-improvement.sh')
let selfImprovementRunning = false

app.post('/api/self-improvement/run', async (req, res) => {
  if (selfImprovementRunning) {
    return res.status(409).json({ error: 'Analysis already running' })
  }

  const days = req.body?.days || 30
  selfImprovementRunning = true

  res.status(202).json({ status: 'started', days })

  // Run asynchronously
  const child = spawn('bash', [SELF_IMPROVEMENT_SCRIPT, '--days', String(days)], {
    stdio: 'ignore',
    detached: true,
  })
  child.on('close', () => { selfImprovementRunning = false })
  child.on('error', () => { selfImprovementRunning = false })
  child.unref()
})

app.get('/api/self-improvement/status', async (_req, res) => {
  res.json({ running: selfImprovementRunning })
})

// ─── Orchestrator Restart ───

app.post('/api/orchestrator/restart', async (_req, res) => {
  try {
    const restartFlag = join(SUPERBOT_DIR, '.restart')
    await fs.writeFile(restartFlag, '')

    // Also directly kill the launcher process via saved PID file
    const launcherPidFile = join(SUPERBOT_DIR, '.launcher.pid')
    try {
      const pid = parseInt((await fs.readFile(launcherPidFile, 'utf8')).trim(), 10)
      if (pid && !isNaN(pid)) {
        // Send SIGTERM to the process group (kills claude child too)
        process.kill(pid, 'SIGTERM')
      }
    } catch (_pidErr) {
      // PID file doesn't exist or process already gone — flag file is enough
    }

    res.json({ success: true, message: 'Restart signal sent — orchestrator will restart momentarily' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/self-improvement/history', async (_req, res) => {
  try {
    const files = (await safeReaddir(ANALYSIS_HISTORY_DIR)).filter(f => f.endsWith('.json'))
    const snapshots = []
    for (const file of files.sort().reverse()) {
      const data = await readJsonFile(join(ANALYSIS_HISTORY_DIR, file))
      if (data) {
        snapshots.push({
          id: file.replace('.json', ''),
          timestamp: data.timestamp,
          daysAnalyzed: data.daysAnalyzed,
          stats: data.stats,
        })
      }
    }
    res.json(snapshots)
  } catch {
    res.json([])
  }
})

app.get('/api/self-improvement/history/:id', async (req, res) => {
  try {
    const data = await readJsonFile(join(ANALYSIS_HISTORY_DIR, `${req.params.id}.json`))
    if (!data) return res.status(404).json({ error: 'Snapshot not found' })
    res.json(data)
  } catch {
    res.status(404).json({ error: 'Snapshot not found' })
  }
})

// --- Skills ---

app.get('/api/skills', async (_req, res) => {
  try {
    const skills = []

    // User skills from ~/.claude/skills/
    const skillsDir = join(CLAUDE_DIR, 'skills')
    const entries = await safeReaddir(skillsDir)
    for (const entry of entries) {
      const entryPath = join(skillsDir, entry)
      try {
        const s = await stat(entryPath)
        if (!s.isDirectory()) continue
      } catch { continue }
      const skillMd = join(entryPath, 'SKILL.md')
      try {
        const content = await readFile(skillMd, 'utf-8')
        const fm = parseFrontmatter(content)
        const files = await safeReaddir(entryPath)
        skills.push({
          id: entry,
          name: fm.name || entry,
          description: fm.description || '',
          fileCount: files.length,
          source: 'user',
        })
      } catch { /* no SKILL.md, skip */ }
    }

    // Superbot2 system skills from ~/.superbot2/skills/
    const superbot2SkillsDir = join(SUPERBOT_DIR, 'skills')
    const sb2Entries = await safeReaddir(superbot2SkillsDir)
    const seenIds = new Set(skills.map(s => s.id))
    for (const entry of sb2Entries) {
      if (seenIds.has(entry)) continue
      const entryPath = join(superbot2SkillsDir, entry)
      try {
        const s = await stat(entryPath)
        if (!s.isDirectory()) continue
      } catch { continue }
      const skillMd = join(entryPath, 'SKILL.md')
      try {
        const content = await readFile(skillMd, 'utf-8')
        const fm = parseFrontmatter(content)
        const files = await safeReaddir(entryPath)
        skills.push({
          id: entry,
          name: fm.name || entry,
          description: fm.description || '',
          fileCount: files.length,
          source: 'superbot2',
        })
        seenIds.add(entry)
      } catch { /* no SKILL.md, skip */ }
    }

    // Global Claude Code skills from ~/.claude/skills/
    const globalClaudeSkillsDir = join(homedir(), '.claude', 'skills')
    if (globalClaudeSkillsDir !== skillsDir) {
      const globalEntries = await safeReaddir(globalClaudeSkillsDir)
      for (const entry of globalEntries) {
        if (seenIds.has(entry)) continue
        const entryPath = join(globalClaudeSkillsDir, entry)
        try {
          const s = await stat(entryPath)
          if (!s.isDirectory()) continue
        } catch { continue }
        const skillMd = join(entryPath, 'SKILL.md')
        try {
          const content = await readFile(skillMd, 'utf-8')
          const fm = parseFrontmatter(content)
          const files = await safeReaddir(entryPath)
          skills.push({
            id: entry,
            name: fm.name || entry,
            description: fm.description || '',
            fileCount: files.length,
            source: 'user',
          })
          seenIds.add(entry)
        } catch { /* no SKILL.md, skip */ }
      }
    }

    // Plugin-provided skills (with credential status)
    const pluginDirs = await getInstalledPluginDirs()
    // Pre-compute credential status per plugin
    const pluginCredentialStatus = new Map()
    for (const pd of pluginDirs) {
      const creds = await getPluginCredentials(pd.installPath)
      if (creds.length > 0) {
        let allConfigured = true
        for (const cred of creds) {
          if (!(await keychainHas(pd.pluginName, cred.key))) {
            allConfigured = false
            break
          }
        }
        pluginCredentialStatus.set(pd.pluginName, { credentials: creds, needsConfig: !allConfigured })
      }
    }

    for (const pd of pluginDirs) {
      const pluginSkillsDir = join(pd.installPath, 'skills')
      const skillEntries = await safeReaddir(pluginSkillsDir)
      for (const entry of skillEntries) {
        const entryPath = join(pluginSkillsDir, entry)
        try {
          const s = await stat(entryPath)
          if (!s.isDirectory()) continue
        } catch { continue }
        const skillMd = join(entryPath, 'SKILL.md')
        try {
          const content = await readFile(skillMd, 'utf-8')
          const fm = parseFrontmatter(content)
          const files = await safeReaddir(entryPath)
          const credStatus = pluginCredentialStatus.get(pd.pluginName)
          skills.push({
            id: `plugin:${pd.pluginId}:${entry}`,
            name: fm.name || entry,
            description: fm.description || '',
            fileCount: files.length,
            source: 'plugin',
            pluginId: pd.pluginId,
            pluginName: pd.pluginName,
            ...(credStatus?.needsConfig ? { needsConfig: true } : {}),
          })
        } catch { /* no SKILL.md, skip */ }
      }
    }

    res.json({ skills })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/agents', async (_req, res) => {
  try {
    const agents = []

    // User agents from ~/.claude/agents/
    const agentsDir = join(CLAUDE_DIR, 'agents')
    const files = await safeReaddir(agentsDir)
    for (const file of files) {
      const isDisabled = file.endsWith('.md.disabled')
      if (!file.endsWith('.md') && !isDisabled) continue
      try {
        const content = await readFile(join(agentsDir, file), 'utf-8')
        const fm = parseFrontmatter(content)
        const id = file.replace(/\.md(\.disabled)?$/, '')
        agents.push({
          id,
          name: fm.name || id,
          description: fm.description || '',
          model: fm.model || 'default',
          source: 'user',
          enabled: !isDisabled,
        })
      } catch { /* skip unreadable */ }
    }

    // Plugin-provided agents
    const pluginDirs = await getInstalledPluginDirs()
    for (const pd of pluginDirs) {
      const pluginAgentsDir = join(pd.installPath, 'agents')
      const agentFiles = await safeReaddir(pluginAgentsDir)
      for (const file of agentFiles) {
        if (!file.endsWith('.md')) continue
        try {
          const content = await readFile(join(pluginAgentsDir, file), 'utf-8')
          const fm = parseFrontmatter(content)
          agents.push({
            id: `plugin:${pd.pluginId}:${file.replace(/\.md$/, '')}`,
            name: fm.name || file.replace(/\.md$/, ''),
            description: fm.description || '',
            model: fm.model || 'default',
            source: 'plugin',
            pluginId: pd.pluginId,
            pluginName: pd.pluginName,
            enabled: true,
          })
        } catch { /* skip unreadable */ }
      }
    }

    res.json({ agents })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/agents/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params
    const agentsDir = join(CLAUDE_DIR, 'agents')
    const enabledPath = join(agentsDir, `${id}.md`)
    const disabledPath = join(agentsDir, `${id}.md.disabled`)
    if (existsSync(enabledPath)) {
      await rename(enabledPath, disabledPath)
      res.json({ enabled: false })
    } else if (existsSync(disabledPath)) {
      await rename(disabledPath, enabledPath)
      res.json({ enabled: true })
    } else {
      res.status(404).json({ error: 'Agent not found' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const HOOK_EVENT_DESCRIPTIONS = {
  PreToolUse: 'Runs before a tool is used, can approve or block the action',
  PostToolUse: 'Runs after a tool finishes, can inspect results',
  Notification: 'Runs when Claude sends a notification',
  Stop: 'Runs when Claude finishes a response',
  SubagentStop: 'Runs when a subagent finishes its response',
  TeammateIdle: 'Runs when a teammate agent goes idle between turns',
  TaskCompleted: 'Runs when a task is marked as completed',
  PreCompact: 'Runs before conversation context is compacted',
  PostCompact: 'Runs after conversation context is compacted',
}

// Human-readable descriptions for specific hook scripts
function describeHookCommand(event, command) {
  const cmd = command || ''
  // Match known superbot2 hook scripts
  if (cmd.includes('teammate-idle')) {
    return 'Enforces a checklist before workers go idle — verifies tasks are updated, knowledge is distilled, work is committed, and results are reported to the orchestrator'
  }
  if (cmd.includes('task-completed')) {
    return 'Enforces quality gates before a task can be marked done — checks acceptance criteria, verifies tests pass, and ensures completionNotes are written'
  }
  if (cmd.includes('pre-compact')) {
    return 'Notifies the dashboard chat when context compaction occurs — writes a system message to the dashboard inbox'
  }
  // Fallback to event-level description
  return HOOK_EVENT_DESCRIPTIONS[event] || `Fires on ${event}`
}

app.get('/api/hooks', async (_req, res) => {
  try {
    const settings = await readJsonFile(join(CLAUDE_DIR, 'settings.json'))
    const hooksObj = settings?.hooks || {}
    // Also check for disabled hooks
    const disabledHooks = await readJsonFile(join(SUPERBOT_DIR, 'disabled-hooks.json')) || {}
    const hooks = []
    for (const [event, configs] of Object.entries(hooksObj)) {
      for (const config of configs) {
        for (const hook of (config.hooks || [])) {
          hooks.push({
            event,
            command: hook.command || '',
            description: describeHookCommand(event, hook.command),
            enabled: true,
          })
        }
      }
    }
    // Include disabled hooks
    for (const [event, configs] of Object.entries(disabledHooks)) {
      for (const config of configs) {
        for (const hook of (config.hooks || [])) {
          hooks.push({
            event,
            command: hook.command || '',
            description: describeHookCommand(event, hook.command),
            enabled: false,
          })
        }
      }
    }
    res.json({ hooks })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/hooks/:event/toggle', async (req, res) => {
  try {
    const { event } = req.params
    const settingsPath = join(CLAUDE_DIR, 'settings.json')
    const disabledPath = join(SUPERBOT_DIR, 'disabled-hooks.json')
    const settings = await readJsonFile(settingsPath) || {}
    const disabled = await readJsonFile(disabledPath) || {}
    if (!settings.hooks) settings.hooks = {}

    if (settings.hooks[event]) {
      // Disable: move from settings to disabled store
      disabled[event] = settings.hooks[event]
      delete settings.hooks[event]
      await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      await writeFile(disabledPath, JSON.stringify(disabled, null, 2), 'utf-8')
      res.json({ enabled: false })
    } else if (disabled[event]) {
      // Enable: move from disabled store back to settings
      settings.hooks[event] = disabled[event]
      delete disabled[event]
      await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      await writeFile(disabledPath, JSON.stringify(disabled, null, 2), 'utf-8')
      res.json({ enabled: true })
    } else {
      res.status(404).json({ error: 'Hook event not found' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Hook test execution ---

const HOOK_TEST_INPUTS = {
  TeammateIdle: {
    teammate_name: 'test-worker',
    team_name: 'superbot2',
    cwd: join(homedir(), 'dev', 'superbot2'),
    transcript_path: '/tmp/test-transcript.jsonl',
  },
  TaskCompleted: {
    task_id: 'task-test-001',
    task_subject: 'Test task',
    task_description: 'This is a test task execution',
    teammate_name: 'test-worker',
    team_name: 'superbot2',
    cwd: join(homedir(), 'dev', 'superbot2'),
  },
  PreCompact: {
    session_id: 'test-session',
    transcript_path: '/tmp/test-transcript.jsonl',
    cwd: join(homedir(), 'dev', 'superbot2'),
    permission_mode: 'default',
    hook_event_name: 'PreCompact',
    trigger: 'manual',
  },
  PostCompact: {
    session_id: 'test-session',
    transcript_path: '/tmp/test-transcript.jsonl',
    cwd: join(homedir(), 'dev', 'superbot2'),
    permission_mode: 'default',
    hook_event_name: 'PostCompact',
    trigger: 'manual',
  },
  Stop: {
    session_id: 'test-session',
    cwd: join(homedir(), 'dev', 'superbot2'),
    stop_hook_active: true,
  },
  SubagentStop: {
    session_id: 'test-session',
    cwd: join(homedir(), 'dev', 'superbot2'),
  },
}

app.post('/api/hooks/:event/test', async (req, res) => {
  try {
    const { event } = req.params
    const settings = await readJsonFile(join(CLAUDE_DIR, 'settings.json'))
    const hookConfig = settings?.hooks?.[event]

    if (!hookConfig || !hookConfig[0]?.hooks?.[0]?.command) {
      return res.status(404).json({ error: `No hook found for event: ${event}` })
    }

    const command = hookConfig[0].hooks[0].command
    const testInput = req.body?.input || HOOK_TEST_INPUTS[event] || {}

    const result = await new Promise((resolve) => {
      const child = execFile('bash', ['-c', command], {
        timeout: 15_000,
        env: { ...process.env, HOOK_TEST: '1' },
      }, (err, stdout, stderr) => {
        resolve({
          exitCode: err?.code ?? 0,
          stdout: stdout || '',
          stderr: stderr || '',
          timedOut: err?.killed ?? false,
        })
      })

      // Send test input on stdin
      child.stdin?.write(JSON.stringify(testInput))
      child.stdin?.end()
    })

    res.json({ event, command, input: testInput, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Skill detail + files + delete ---

// Resolve a skill ID to its directory across all known skill locations
function resolveSkillDir(id) {
  const candidates = [
    join(CLAUDE_DIR, 'skills', id),
    join(SUPERBOT_DIR, 'skills', id),
    join(homedir(), '.claude', 'skills', id),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'SKILL.md'))) return dir
  }
  // Search plugin caches: both superbot2 and user ~/.claude
  const cacheDirs = [
    PLUGINS_CACHE_DIR,
    join(homedir(), '.claude', 'plugins', 'cache'),
  ]
  for (const cacheDir of cacheDirs) {
    if (!existsSync(cacheDir)) continue
    try {
      for (const marketplace of readdirSync(cacheDir)) {
        const marketDir = join(cacheDir, marketplace)
        // Direct match: plugin-name == skill id
        const pluginDir = join(marketDir, id)
        if (existsSync(pluginDir)) {
          const versions = readdirSync(pluginDir).filter(v => !v.startsWith('.')).sort().reverse()
          for (const version of versions) {
            const versionDir = join(pluginDir, version)
            if (existsSync(join(versionDir, '.claude-plugin', 'plugin.json'))) {
              return versionDir
            }
          }
        }
        // Nested match: skill is inside a multi-skill plugin
        const plugins = readdirSync(marketDir).filter(p => !p.startsWith('.'))
        for (const plugin of plugins) {
          if (plugin === id) continue // already checked above
          const pDir = join(marketDir, plugin)
          try {
            const vers = readdirSync(pDir).filter(v => !v.startsWith('.')).sort().reverse()
            for (const ver of vers) {
              const vDir = join(pDir, ver)
              if (existsSync(join(vDir, 'skills', id, 'SKILL.md'))) {
                return vDir
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  return null
}

app.get('/api/skills/:id', async (req, res) => {
  try {
    const { id } = req.params
    const skillDir = resolveSkillDir(id)
    if (!skillDir) return res.status(404).json({ error: 'Skill not found' })
    // SKILL.md may be at root (standalone) or nested in skills/{id}/ (plugin)
    let skillMd = join(skillDir, 'SKILL.md')
    if (!existsSync(skillMd)) {
      skillMd = join(skillDir, 'skills', id, 'SKILL.md')
    }
    const content = await readFile(skillMd, 'utf-8')
    const fm = parseFrontmatter(content)
    const files = await safeReaddir(skillDir)
    // Build recursive file tree
    async function listFilesRecursive(dir, prefix = '') {
      const results = []
      const entries = await safeReaddir(dir)
      for (const entry of entries) {
        if (entry.startsWith('.') && entry !== '.claude-plugin') continue
        const relPath = prefix ? `${prefix}/${entry}` : entry
        const fullPath = join(dir, entry)
        try {
          const s = await stat(fullPath)
          if (s.isDirectory()) {
            results.push({ path: relPath, type: 'directory' })
            const children = await listFilesRecursive(fullPath, relPath)
            results.push(...children)
          } else {
            results.push({ path: relPath, type: 'file' })
          }
        } catch { /* skip */ }
      }
      return results
    }
    const fileTree = await listFilesRecursive(skillDir)
    res.json({
      id,
      name: fm.name || id,
      description: fm.description || '',
      fullContent: content,
      files,
      fileTree,
    })
  } catch (err) {
    res.status(404).json({ error: 'Skill not found' })
  }
})

app.get('/api/skills/:id/files/{*filePath}', async (req, res) => {
  try {
    const { id } = req.params
    const filePath = Array.isArray(req.params.filePath) ? req.params.filePath.join('/') : req.params.filePath
    const skillDir = resolveSkillDir(id)
    if (!skillDir) return res.status(404).json({ error: 'Skill not found' })
    const fullPath = join(skillDir, filePath)
    const content = await readFile(fullPath, 'utf-8')
    res.json({ content })
  } catch (err) {
    res.status(404).json({ error: 'File not found' })
  }
})

app.delete('/api/skills/:id', async (req, res) => {
  try {
    const { id } = req.params
    // Only allow deleting from the user's own skill directory
    const skillDir = join(CLAUDE_DIR, 'skills', id)
    await rm(skillDir, { recursive: true, force: true })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Agent detail + delete ---

app.get('/api/agents/:id', async (req, res) => {
  try {
    const { id } = req.params
    const agentPath = join(CLAUDE_DIR, 'agents', `${id}.md`)
    const content = await readFile(agentPath, 'utf-8')
    const fm = parseFrontmatter(content)
    res.json({
      id,
      name: fm.name || id,
      description: fm.description || '',
      model: fm.model || 'default',
      fullContent: content,
    })
  } catch (err) {
    res.status(404).json({ error: 'Agent not found' })
  }
})

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const { id } = req.params
    const agentPath = join(CLAUDE_DIR, 'agents', `${id}.md`)
    await unlink(agentPath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Hook detail + delete ---

app.get('/api/hooks/:event', async (req, res) => {
  try {
    const { event } = req.params
    const settings = await readJsonFile(join(CLAUDE_DIR, 'settings.json'))
    const hooksObj = settings?.hooks || {}
    if (!hooksObj[event]) {
      return res.status(404).json({ error: 'Hook event not found' })
    }
    res.json({ event, hooks: hooksObj[event] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/hooks/:event', async (req, res) => {
  try {
    const { event } = req.params
    const settingsPath = join(CLAUDE_DIR, 'settings.json')
    const settings = await readJsonFile(settingsPath) || {}
    if (!settings.hooks || !settings.hooks[event]) {
      return res.status(404).json({ error: 'Hook event not found' })
    }
    delete settings.hooks[event]
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function runClaude(args) {
  return new Promise((resolve, reject) => {
    execFile('claude', args, { timeout: 30_000, env: { ...process.env, CLAUDE_CONFIG_DIR: CLAUDE_DIR } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      resolve(stdout.trim())
    })
  })
}

// Plugin metadata cache — stores component counts + keywords per plugin name
const pluginDetailCache = new Map()
const pluginMetaCache = new Map()

function parseComponentCounts(files) {
  const counts = { commands: 0, skills: 0, agents: 0, hooks: 0 }
  for (const file of files) {
    if (file.startsWith('commands/') && file.endsWith('.md')) counts.commands++
    else if (file.startsWith('skills/') && file.endsWith('SKILL.md')) counts.skills++
    else if (file.startsWith('agents/') && file.endsWith('.md')) counts.agents++
    else if (file.startsWith('hooks/') && !file.startsWith('hooks/scripts/')) counts.hooks++
  }
  return counts
}

async function fetchPluginMeta(name) {
  const now = Date.now()
  const cached = pluginMetaCache.get(name)
  if (cached && (now - cached.fetchedAt) < 600_000) return cached.data

  try {
    const response = await fetch(`https://superchargeclaudecode.com/api/plugins/${encodeURIComponent(name)}`)
    if (!response.ok) return null
    const plugin = await response.json()
    const files = plugin.files || []
    const componentCounts = parseComponentCounts(files)

    // Try to fetch plugin.json for keywords
    let keywords = []
    try {
      const pjResponse = await fetch(`https://superchargeclaudecode.com/api/plugins/${encodeURIComponent(name)}/.claude-plugin/plugin.json`, { redirect: 'follow' })
      if (pjResponse.ok) {
        const pj = await pjResponse.json()
        keywords = pj.keywords || []
      }
    } catch { /* no keywords */ }

    const meta = { componentCounts, keywords }
    pluginMetaCache.set(name, { data: meta, fetchedAt: now })
    return meta
  } catch {
    return null
  }
}

// Pre-fetch metadata for all plugins in background
let metaPreFetched = false

app.get('/api/plugins/:name/details', async (req, res) => {
  try {
    const { name } = req.params
    const now = Date.now()

    const cached = pluginDetailCache.get(name)
    if (cached && (now - cached.fetchedAt) < 600_000) {
      return res.json(cached.data)
    }

    const response = await fetch(`https://superchargeclaudecode.com/api/plugins/${encodeURIComponent(name)}`)
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Plugin not found' })
    }

    const plugin = await response.json()
    const files = plugin.files || []

    // Parse files list into component categories
    const components = { commands: [], agents: [], skills: [], hooks: [], mcpServers: [], lspServers: [] }

    for (const file of files) {
      if (file.startsWith('commands/') && file.endsWith('.md')) {
        components.commands.push({ name: file.replace('commands/', '').replace('.md', ''), file })
      } else if (file.startsWith('agents/') && file.endsWith('.md')) {
        components.agents.push({ name: file.replace('agents/', '').replace('.md', ''), file })
      } else if (file.startsWith('skills/') && file.endsWith('SKILL.md')) {
        const skillName = file.replace('skills/', '').replace('/SKILL.md', '')
        components.skills.push({ name: skillName, file })
      } else if (file.startsWith('hooks/') && !file.startsWith('hooks/scripts/')) {
        components.hooks.push({ name: file.replace('hooks/', ''), file })
      }
    }

    const detail = {
      pluginId: name,
      name: plugin.name || name,
      description: plugin.description || '',
      version: plugin.version || '',
      author: plugin.author || null,
      license: plugin.license || '',
      repository: plugin.repository || '',
      components,
      files,
      hasReadme: files.includes('README.md'),
      missingBins: [],
    }

    // For installed plugins, check for missing CLI bins
    try {
      const pluginDirs = await getInstalledPluginDirs()
      const pd = pluginDirs.find(p => p.pluginName === name || p.pluginId === name)
      if (pd) {
        const { missingBins } = await getPluginOpenclawBins(pd.installPath)
        detail.missingBins = missingBins
      }
    } catch { /* ignore */ }

    pluginDetailCache.set(name, { data: detail, fetchedAt: now })
    res.json(detail)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/plugins/:name/install-bin — run brew install for a missing CLI bin
app.post('/api/plugins/:name/install-bin', async (req, res) => {
  try {
    const { name } = req.params
    const { installId } = req.body
    if (!installId) return res.status(400).json({ error: 'installId required' })

    const pluginDirs = await getInstalledPluginDirs()
    const pd = pluginDirs.find(p => p.pluginName === name || p.pluginId === name)
    if (!pd) return res.status(404).json({ error: 'Plugin not found' })

    const { missingBins } = await getPluginOpenclawBins(pd.installPath)
    // Find the install option across all missing bins
    let installOpt = null
    for (const mb of missingBins) {
      const opt = mb.installOptions.find(o => o.id === installId)
      if (opt) { installOpt = opt; break }
    }
    if (!installOpt) return res.status(404).json({ error: `Install option "${installId}" not found` })

    if (installOpt.kind !== 'brew') {
      return res.json({ exitCode: 1, stdout: '', stderr: `Install kind "${installOpt.kind}" is not supported yet. Only "brew" is supported.` })
    }

    // Run brew install
    const result = await new Promise((resolve) => {
      execFile('brew', ['install', installOpt.formula], { timeout: 120_000 }, (err, stdout, stderr) => {
        resolve({ exitCode: err ? (err.code || 1) : 0, stdout: stdout || '', stderr: stderr || '' })
      })
    })

    // Invalidate the detail cache so the next fetch reflects the change
    pluginDetailCache.delete(name)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Proxy plugin file content from marketplace
app.get('/api/plugins/:name/files/{*filePath}', async (req, res) => {
  try {
    const { name } = req.params
    const filePath = Array.isArray(req.params.filePath) ? req.params.filePath.join('/') : req.params.filePath
    const url = `https://superchargeclaudecode.com/api/plugins/${encodeURIComponent(name)}/${filePath}`
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) {
      return res.status(response.status).json({ error: 'File not found' })
    }
    const content = await response.text()
    res.json({ content })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/plugins', async (_req, res) => {
  try {
    const output = await runClaude(['plugin', 'list', '--json', '--available'])
    const data = JSON.parse(output)

    // For installed plugins, scan cache dirs for component counts + get keywords + credential status
    const installed = []
    for (const p of (data.installed || [])) {
      const pid = p.pluginId || p.id
      const name = p.name || (pid ? pid.split('@')[0] : '')
      const installPath = p.installPath
      let componentCounts = null
      let keywords = []
      let localDescription = ''
      let hasUnconfiguredCredentials = false
      let hasMissingBins = false
      if (installPath) {
        try {
          const { counts } = await scanPluginComponents(installPath)
          componentCounts = counts
        } catch { /* ignore */ }
        // Read keywords + description from local plugin.json
        const pj = await readJsonFile(join(installPath, '.claude-plugin', 'plugin.json'))
        if (pj?.keywords) keywords = pj.keywords
        if (pj?.description && !p.description) localDescription = pj.description
        // Check credential status
        const creds = await getPluginCredentials(installPath)
        if (creds.length > 0) {
          for (const cred of creds) {
            if (!(await keychainHas(name, cred.key))) {
              hasUnconfiguredCredentials = true
              break
            }
          }
        }
        // Check for missing CLI bins
        try {
          const { missingBins } = await getPluginOpenclawBins(installPath)
          if (missingBins.length > 0) hasMissingBins = true
        } catch { /* ignore */ }
      }
      installed.push({
        ...p,
        pluginId: pid,
        name,
        description: p.description || localDescription || '',
        installed: true,
        componentCounts,
        keywords,
        ...(hasUnconfiguredCredentials ? { hasUnconfiguredCredentials: true } : {}),
        ...(hasMissingBins ? { hasMissingBins: true } : {}),
      })
    }

    // For available plugins, enrich with cached meta if available
    const available = (data.available || []).map(p => {
      const cached = pluginMetaCache.get(p.name)
      return {
        ...p,
        installed: false,
        componentCounts: cached?.data?.componentCounts || null,
        keywords: cached?.data?.keywords || [],
      }
    })

    const allPlugins = [...installed, ...available]
    res.json({ plugins: allPlugins })

    // Trigger background pre-fetch of metadata for available plugins (once)
    if (!metaPreFetched) {
      metaPreFetched = true
      const names = (data.available || []).map(p => p.name)
      // Fetch in batches of 5 to avoid overwhelming the API
      ;(async () => {
        for (let i = 0; i < names.length; i += 5) {
          const batch = names.slice(i, i + 5)
          await Promise.allSettled(batch.map(n => fetchPluginMeta(n)))
        }
      })()
    }
  } catch {
    res.json({ plugins: [] })
  }
})

app.post('/api/plugins/install', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    await runClaude(['plugin', 'install', name])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/plugins/uninstall', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    await runClaude(['plugin', 'uninstall', name])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/plugins/enable', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    await runClaude(['plugin', 'enable', name])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/plugins/disable', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    await runClaude(['plugin', 'disable', name])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/marketplaces', async (_req, res) => {
  try {
    const output = await runClaude(['plugin', 'marketplace', 'list', '--json'])
    const marketplaces = JSON.parse(output)
    res.json({ marketplaces: Array.isArray(marketplaces) ? marketplaces : [] })
  } catch {
    res.json({ marketplaces: [] })
  }
})

app.post('/api/marketplaces', async (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: 'url required' })
    await runClaude(['plugin', 'marketplace', 'add', url])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/marketplaces/:name', async (req, res) => {
  try {
    const { name } = req.params

    // Auto-uninstall all plugins installed from this marketplace before removing it
    const uninstalledPlugins = []
    const installedJsonPaths = [
      join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'),
      join(process.env.HOME, '.claude', 'plugins', 'installed_plugins.json'),
    ]
    for (const jsonPath of installedJsonPaths) {
      try {
        const raw = await readFile(jsonPath, 'utf-8')
        const data = JSON.parse(raw)
        const plugins = data.plugins || {}
        const keysToRemove = Object.keys(plugins).filter(k => k.endsWith(`@${name}`))
        if (keysToRemove.length > 0) {
          for (const key of keysToRemove) {
            const shortName = key.split('@')[0]
            // Try CLI uninstall first (handles all cleanup)
            try {
              await runClaude(['plugin', 'uninstall', shortName])
            } catch {
              // CLI failed — remove entry directly
              delete plugins[key]
            }
            if (!uninstalledPlugins.includes(shortName)) uninstalledPlugins.push(shortName)
          }
          // Re-read in case CLI modified the file, then ensure our keys are gone
          try {
            const freshRaw = await readFile(jsonPath, 'utf-8')
            const freshData = JSON.parse(freshRaw)
            let changed = false
            for (const key of keysToRemove) {
              if (freshData.plugins?.[key]) {
                delete freshData.plugins[key]
                changed = true
              }
            }
            if (changed) await writeFile(jsonPath, JSON.stringify(freshData, null, 2))
          } catch { /* ignore */ }
        }
      } catch { /* file doesn't exist or isn't valid JSON — skip */ }
    }
    // Clean up marketplace cache directory
    const marketplaceCacheDir = join(PLUGINS_CACHE_DIR, name)
    try { await rm(marketplaceCacheDir, { recursive: true, force: true }) } catch { /* ignore */ }

    await runClaude(['plugin', 'marketplace', 'remove', name])

    // Clear plugin caches so the UI reflects the changes
    pluginMetaCache.clear()
    pluginDetailCache.clear()
    metaPreFetched = false

    const count = uninstalledPlugins.length
    res.json({
      ok: true,
      uninstalledCount: count,
      uninstalledPlugins,
      message: count > 0
        ? `Marketplace removed. ${count} plugin${count !== 1 ? 's' : ''} uninstalled: ${uninstalledPlugins.join(', ')}`
        : 'Marketplace removed',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/marketplaces/refresh', async (_req, res) => {
  try {
    await runClaude(['plugin', 'marketplace', 'update'])
    // Clear caches so next /api/plugins call picks up new data
    pluginMetaCache.clear()
    pluginDetailCache.clear()
    metaPreFetched = false
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Session summaries ---

app.get('/api/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10)
    const spaceFilter = req.query.space || null
    const files = await safeReaddir(SESSIONS_DIR)
    const sessions = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const session = await readJsonFile(join(SESSIONS_DIR, file))
      if (!session) continue
      if (spaceFilter && session.space !== spaceFilter) continue
      sessions.push(session)
    }
    // Sort by timestamp descending (newest first)
    sessions.sort((a, b) => new Date(b.completedAt || b.timestamp || 0).getTime() - new Date(a.completedAt || a.timestamp || 0).getTime())
    res.json({ sessions: sessions.slice(0, limit) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params
    const filePath = join(SESSIONS_DIR, `${id}.json`)
    try {
      await unlink(filePath)
    } catch {
      return res.status(404).json({ error: 'Session not found' })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Superbot skills (from repo-relative skills/) ---

app.get('/api/superbot-skills', async (_req, res) => {
  try {
    const entries = await safeReaddir(SUPERBOT_SKILLS_DIR)
    const skills = []
    for (const entry of entries) {
      const entryPath = join(SUPERBOT_SKILLS_DIR, entry)
      try {
        const s = await stat(entryPath)
        if (!s.isDirectory()) continue
      } catch { continue }
      // Check for SKILL.md (enabled) or SKILL.md.disabled
      const skillMd = join(entryPath, 'SKILL.md')
      const skillMdDisabled = join(entryPath, 'SKILL.md.disabled')
      let content = null
      let enabled = true
      try {
        content = await readFile(skillMd, 'utf-8')
      } catch {
        try {
          content = await readFile(skillMdDisabled, 'utf-8')
          enabled = false
        } catch { continue }
      }
      const fm = parseFrontmatter(content)
      skills.push({
        id: entry,
        name: fm.name || entry,
        description: fm.description || '',
        enabled,
      })
    }
    res.json({ skills })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/superbot-skills/:id', async (req, res) => {
  try {
    const { id } = req.params
    const entryPath = join(SUPERBOT_SKILLS_DIR, id)
    let content = null
    let enabled = true
    try {
      content = await readFile(join(entryPath, 'SKILL.md'), 'utf-8')
    } catch {
      try {
        content = await readFile(join(entryPath, 'SKILL.md.disabled'), 'utf-8')
        enabled = false
      } catch {
        return res.status(404).json({ error: 'Skill not found' })
      }
    }
    const fm = parseFrontmatter(content)
    const files = await safeReaddir(entryPath)
    // Build recursive file tree
    async function listFilesRecursive(dir, prefix = '') {
      const results = []
      const entries = await safeReaddir(dir)
      for (const entry of entries) {
        if (entry.startsWith('.')) continue
        const relPath = prefix ? `${prefix}/${entry}` : entry
        const fullPath = join(dir, entry)
        try {
          const s = await stat(fullPath)
          if (s.isDirectory()) {
            results.push({ path: relPath, type: 'directory' })
            const children = await listFilesRecursive(fullPath, relPath)
            results.push(...children)
          } else {
            results.push({ path: relPath, type: 'file' })
          }
        } catch { /* skip */ }
      }
      return results
    }
    const fileTree = await listFilesRecursive(entryPath)
    res.json({
      id,
      name: fm.name || id,
      description: fm.description || '',
      fullContent: content,
      files,
      fileTree,
      enabled,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/superbot-skills/:id/files/{*filePath}', async (req, res) => {
  try {
    const { id } = req.params
    const filePath = Array.isArray(req.params.filePath) ? req.params.filePath.join('/') : req.params.filePath
    const fullPath = join(SUPERBOT_SKILLS_DIR, id, filePath)
    const content = await readFile(fullPath, 'utf-8')
    res.json({ content })
  } catch (err) {
    res.status(404).json({ error: 'File not found' })
  }
})

app.post('/api/superbot-skills/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params
    const entryPath = join(SUPERBOT_SKILLS_DIR, id)
    const enabledPath = join(entryPath, 'SKILL.md')
    const disabledPath = join(entryPath, 'SKILL.md.disabled')
    if (existsSync(enabledPath)) {
      await rename(enabledPath, disabledPath)
      res.json({ enabled: false })
    } else if (existsSync(disabledPath)) {
      await rename(disabledPath, enabledPath)
      res.json({ enabled: true })
    } else {
      res.status(404).json({ error: 'Skill not found' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/superbot-skills/:id', async (req, res) => {
  try {
    const { id } = req.params
    const skillDir = join(SUPERBOT_SKILLS_DIR, id)
    await rm(skillDir, { recursive: true, force: true })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Active workers ---

const TEAM_CONFIG_PATH = join(SUPERBOT_DIR, '.claude', 'teams', SUPERBOT2_NAME, 'config.json')

let _spaceSlugsCache = null
let _spaceSlugsTime = 0

async function getSpaceSlugs() {
  const now = Date.now()
  if (_spaceSlugsCache && now - _spaceSlugsTime < 60_000) return _spaceSlugsCache
  const entries = await safeReaddir(SPACES_DIR)
  // Sort longest-first so "x-authority" matches before "x" would
  _spaceSlugsCache = entries.sort((a, b) => b.length - a.length)
  _spaceSlugsTime = now
  return _spaceSlugsCache
}

async function extractSpaceFromWorkerName(name) {
  const slugs = await getSpaceSlugs()
  for (const slug of slugs) {
    if (name.startsWith(slug + '-') || name === slug) return slug
  }
  return null
}

function parseEtime(etime) {
  // ps etime formats: "MM:SS", "HH:MM:SS", "D-HH:MM:SS"
  const trimmed = etime.trim()
  let days = 0, hours = 0, minutes = 0, seconds = 0
  const dayMatch = trimmed.match(/^(\d+)-(.+)$/)
  const timePart = dayMatch ? dayMatch[2] : trimmed
  if (dayMatch) days = parseInt(dayMatch[1], 10)
  const parts = timePart.split(':').map(Number)
  if (parts.length === 3) { hours = parts[0]; minutes = parts[1]; seconds = parts[2] }
  else if (parts.length === 2) { minutes = parts[0]; seconds = parts[1] }
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

function formatRuntime(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours < 24) return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`
}

function extractProjectFromWorkerName(name, space) {
  if (!space) return null
  const remainder = name.slice(space.length + 1) // strip "<space>-"
  const projMatch = remainder.match(/^(.+?)-worker(?:-\d+)?$/)
  return projMatch ? projMatch[1] : null
}

app.get('/api/workers', async (_req, res) => {
  try {
    const { execSync } = await import('node:child_process')
    let psOutput = ''
    try {
      psOutput = execSync(
        'ps -eo pid,etime,args | grep "agent-type space-worker" | grep -v grep',
        { encoding: 'utf8', timeout: 5000 }
      )
    } catch {
      // grep returns exit code 1 when no matches
      return res.json({ workers: [] })
    }

    const workers = []
    for (const line of psOutput.trim().split('\n')) {
      if (!line.trim()) continue
      const nameMatch = line.match(/--agent-name\s+(\S+)/)
      const idMatch = line.match(/--agent-id\s+(\S+)/)
      // etime is the second field after pid
      const etimeMatch = line.trim().match(/^\d+\s+([\d:-]+)\s+/)
      if (!nameMatch) continue

      const name = nameMatch[1]
      const agentId = idMatch ? idMatch[1] : name
      const space = await extractSpaceFromWorkerName(name)
      const project = extractProjectFromWorkerName(name, space)
      const runtimeSeconds = etimeMatch ? parseEtime(etimeMatch[1]) : 0
      const runtimeDisplay = formatRuntime(runtimeSeconds)

      workers.push({ name, space: space || '', project, runtimeSeconds, runtimeDisplay, agentId })
    }

    res.json({ workers })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Compaction events ---

app.get('/api/compaction-events', async (_req, res) => {
  try {
    const eventsFile = join(SUPERBOT_DIR, 'compaction-events.jsonl')
    let events = []
    try {
      const content = await readFile(eventsFile, 'utf-8')
      events = content.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)
    } catch {
      // File doesn't exist yet — return empty
    }
    // Return last 50, most recent first
    events = events.slice(-50).reverse()
    res.json({ events })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Messages to orchestrator ---

function paginateMessages(sorted, limit, before) {
  let filtered = sorted
  if (before) {
    const beforeTime = new Date(before).getTime()
    filtered = sorted.filter(m => new Date(m.timestamp).getTime() < beforeTime)
  }
  const hasMore = filtered.length > limit
  const messages = filtered.slice(-limit)
  return { messages, hasMore }
}

app.get('/api/messages', async (req, res) => {
  try {
    const includeBackground = req.query.background === 'true'
    const limit = Math.min(parseInt(req.query.limit) || 50, 500)
    const before = req.query.before // ISO timestamp cursor for load-earlier

    const teamLeadInbox = await readJsonFile(join(TEAM_INBOXES_DIR, 'team-lead.json')) || []
    const dashUserInbox = await readJsonFile(join(TEAM_INBOXES_DIR, 'dashboard-user.json')) || []

    // User messages sent from dashboard
    const userMessages = teamLeadInbox.filter(m => m.from === 'dashboard-user')

    // Orchestrator replies to user
    const orchestratorReplies = dashUserInbox
      .filter(m => m.from === 'team-lead')
      .map(m => ({ ...m, to: 'dashboard-user' }))

    if (!includeBackground) {
      // Default: user↔orchestrator conversation + worker completion reports
      // Filters out: heartbeats, scheduled jobs, idle notifications, shutdown messages
      const workerReports = teamLeadInbox.filter(m => {
        if (m.from === 'dashboard-user') return false
        if (m.from === 'heartbeat' || m.type === 'heartbeat') return false
        if (m.from === 'scheduler' || m.type === 'scheduled_job') return false
        const text = (m.text || '').trim()
        if (text.startsWith('{')) {
          try {
            const parsed = JSON.parse(text)
            if (parsed.type) return false
          } catch { /* not JSON, keep it */ }
        }
        return true
      })

      const messages = [...userMessages, ...orchestratorReplies, ...workerReports]
      messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      const sliced = paginateMessages(messages, limit, before)
      return res.json(sliced)
    }

    // Background: everything from team-lead inbox + orchestrator outbound to all workers
    const bgFromInbox = teamLeadInbox.filter(m => m.from !== 'dashboard-user')

    const files = await readdir(TEAM_INBOXES_DIR)
    const workerFiles = files.filter(f => f.endsWith('.json') && f !== 'team-lead.json' && f !== 'dashboard-user.json')
    const outboundArrays = await Promise.all(workerFiles.map(async (file) => {
      try {
        const msgs = await readJsonFile(join(TEAM_INBOXES_DIR, file)) || []
        const workerName = file.replace('.json', '')
        return msgs.filter(m => m.from === 'team-lead').map(m => ({ ...m, to: workerName }))
      } catch { return [] }
    }))
    const outbound = outboundArrays.flat()

    const allMessages = [...userMessages, ...orchestratorReplies, ...bgFromInbox, ...outbound]
    allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    res.json(paginateMessages(allMessages, limit, before))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/messages', async (req, res) => {
  try {
    const { text, images } = req.body
    if ((!text || !text.trim()) && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'text or images required' })
    }

    // Save uploaded images to disk
    const imagePaths = []
    if (images && images.length > 0) {
      const uploadsDir = join(SUPERBOT_DIR, 'uploads')
      await mkdir(uploadsDir, { recursive: true })

      for (const img of images) {
        const ext = extname(img.name).toLowerCase() || '.png'
        if (!ALLOWED_IMAGE_EXTS.has(ext)) continue
        const ts = Date.now()
        const filename = `${ts}-${Math.random().toString(36).slice(2, 8)}${ext}`
        const filePath = join(uploadsDir, filename)
        const buffer = Buffer.from(img.data, 'base64')
        await writeFile(filePath, buffer)
        imagePaths.push(filePath)
      }
    }

    // Build message text with image paths appended
    let messageText = (text || '').trim()
    if (imagePaths.length > 0) {
      const pathsStr = imagePaths.join('\n')
      messageText = messageText ? `${messageText}\n${pathsStr}` : pathsStr
    }

    const inboxPath = join(TEAM_INBOXES_DIR, 'team-lead.json')
    const existing = await readJsonFile(inboxPath) || []

    existing.push({
      from: 'dashboard-user',
      text: messageText,
      timestamp: new Date().toISOString(),
      read: false,
    })

    await writeFile(inboxPath, JSON.stringify(existing, null, 2), 'utf-8')

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Image serving ---

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'])

const IMAGE_CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

app.get('/api/images', async (req, res) => {
  try {
    const imagePath = req.query.path
    if (!imagePath || typeof imagePath !== 'string') {
      return res.status(400).json({ error: 'path query parameter required' })
    }

    // Resolve ~ to homedir
    const resolved = resolve(
      imagePath.startsWith('~/') ? join(homedir(), imagePath.slice(1)) : imagePath
    )

    // Must be absolute
    if (!resolved.startsWith('/')) {
      return res.status(400).json({ error: 'Absolute path required' })
    }

    // Only serve image files
    const ext = extname(resolved).toLowerCase()
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      return res.status(403).json({ error: 'Not an allowed image type' })
    }

    // Check file exists and is a file
    try {
      const s = await stat(resolved)
      if (!s.isFile()) {
        return res.status(404).json({ error: 'Not a file' })
      }
    } catch {
      return res.status(404).json({ error: 'File not found' })
    }

    res.set('Content-Type', IMAGE_CONTENT_TYPES[ext])
    res.set('Cache-Control', 'public, max-age=300')
    const data = await readFile(resolved)
    res.send(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Updates ---

let updateCheckCache = { data: null, fetchedAt: 0 }

app.get('/api/updates/check', async (_req, res) => {
  try {
    const now = Date.now()
    if (updateCheckCache.data && (now - updateCheckCache.fetchedAt) < 300_000) {
      return res.json(updateCheckCache.data)
    }

    const repoDir = join(import.meta.dirname, '..')
    const { execSync } = await import('node:child_process')

    try {
      execSync('git fetch origin', { cwd: repoDir, stdio: 'pipe', timeout: 15_000 })
    } catch {
      return res.json({ available: false, error: 'Failed to fetch from origin' })
    }

    const currentCommit = execSync('git rev-parse HEAD', { cwd: repoDir, encoding: 'utf-8' }).trim()
    const latestCommit = execSync('git rev-parse origin/main', { cwd: repoDir, encoding: 'utf-8' }).trim()
    const behindBy = parseInt(execSync('git rev-list HEAD..origin/main --count', { cwd: repoDir, encoding: 'utf-8' }).trim(), 10)
    let latestMessage = ''
    if (behindBy > 0) {
      latestMessage = execSync('git log origin/main -1 --format=%s', { cwd: repoDir, encoding: 'utf-8' }).trim()
    }

    const result = {
      available: behindBy > 0,
      currentCommit,
      latestCommit,
      behindBy,
      latestMessage,
    }

    updateCheckCache = { data: result, fetchedAt: now }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/updates/run', async (_req, res) => {
  try {
    const repoDir = join(import.meta.dirname, '..')
    const scriptPath = join(repoDir, 'scripts', 'update.sh')
    const { execSync } = await import('node:child_process')

    const output = execSync(`bash "${scriptPath}"`, {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 120_000,
      env: {
        ...process.env,
        SUPERBOT2_HOME: SUPERBOT_DIR,
        SUPERBOT2_NAME,
      },
    })

    // Clear the update cache
    updateCheckCache = { data: null, fetchedAt: 0 }

    res.json({ ok: true, output })

    // Restart the server after responding so the process manager picks up new code
    setTimeout(() => process.exit(0), 2000)
  } catch (err) {
    res.status(500).json({ error: err.stderr || err.message })
  }
})

// --- Skill Creator ---

import { createInterface } from 'node:readline'

const SKILL_CREATOR_SESSIONS = new Map()
const SKILL_CREATOR_UPLOADS_DIR = join(SUPERBOT_DIR, 'uploads', 'skill-creator')
const SKILL_CREATOR_DRAFTS_DIR = join(SUPERBOT_DIR, 'skill-creator', 'drafts')
const SKILL_CREATOR_PROMPT_PATH = join(import.meta.dirname, 'skill-creator-prompt.md')
const SKILL_CREATOR_REFERENCE_PATH = join(import.meta.dirname, 'skill-creator-reference.md')
const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude`

// Chat history persistence — append-only JSONL per draft
async function appendDraftChatMessage(draftPath, message) {
  if (!draftPath) return
  const historyPath = join(draftPath, 'chat-history.jsonl')
  await appendFile(historyPath, JSON.stringify(message) + '\n')
}

async function readDraftChatHistory(draftPath) {
  const historyPath = join(draftPath, 'chat-history.jsonl')
  try {
    const raw = await readFile(historyPath, 'utf-8')
    return raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
}

// SSE stream endpoint
app.get('/api/skill-creator/stream', (req, res) => {
  const sessionId = req.query.sessionId
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(':connected\n\n')

  // Store SSE response for this session
  const existing = SKILL_CREATOR_SESSIONS.get(sessionId)
  if (existing) {
    existing.sseResponse = res
  } else {
    SKILL_CREATOR_SESSIONS.set(sessionId, { process: null, sseResponse: res, createdAt: Date.now() })
  }

  // Keepalive
  const heartbeat = setInterval(() => {
    res.write(':keepalive\n\n')
  }, 30000)

  res.on('close', () => {
    clearInterval(heartbeat)
    const session = SKILL_CREATOR_SESSIONS.get(sessionId)
    // Guard: only clean up if this is still our SSE response (reconnection race fix)
    if (session && session.sseResponse === res) {
      if (session.process) {
        try { session.process.kill() } catch {}
      }
      SKILL_CREATOR_SESSIONS.delete(sessionId)
    }
  })
})

// Create a new blank draft (skill or plugin) without starting a chat session
app.post('/api/skill-creator/new-draft', async (req, res) => {
  try {
    const { draftType } = req.body
    if (!draftType || !['skill', 'plugin'].includes(draftType)) {
      return res.status(400).json({ error: 'draftType must be "skill" or "plugin"' })
    }

    const draftName = `draft-${Date.now()}`
    const draftPath = join(SKILL_CREATOR_DRAFTS_DIR, draftName)
    await mkdir(draftPath, { recursive: true })

    if (draftType === 'plugin') {
      // Full plugin scaffold
      const pluginSlug = draftName
      await mkdir(join(draftPath, '.claude-plugin'), { recursive: true })
      await mkdir(join(draftPath, 'skills', pluginSlug), { recursive: true })

      const pluginJson = {
        name: pluginSlug,
        version: '1.0.0',
        description: '',
        author: { name: 'superbot2' },
        skills: [`./skills/${pluginSlug}`],
      }
      await writeFile(join(draftPath, '.claude-plugin', 'plugin.json'), JSON.stringify(pluginJson, null, 2))

      const skillMd = `---
name: ${pluginSlug}
description: >
  TODO: Describe when this skill should be triggered.
version: 1.0.0
user-invocable: true
---

# ${pluginSlug}

TODO: Add skill instructions here.
`
      await writeFile(join(draftPath, 'skills', pluginSlug, 'SKILL.md'), skillMd)

      const readmeMd = `# ${pluginSlug}

A Claude Code plugin.

## Installation

\`\`\`bash
claude plugin install ${pluginSlug}
\`\`\`
`
      await writeFile(join(draftPath, 'README.md'), readmeMd)
    } else {
      // Skill-only: just SKILL.md at root
      const skillMd = `---
name: ${draftName}
description: >
  Describe when to use this skill.
version: 1.0.0
---

# ${draftName}

What this skill does and how to use it.
`
      await writeFile(join(draftPath, 'SKILL.md'), skillMd)
    }

    const draftMetadata = {
      createdAt: new Date().toISOString(),
      status: 'incomplete',
      type: draftType,
    }
    await writeFile(join(draftPath, 'draft-metadata.json'), JSON.stringify(draftMetadata, null, 2))

    res.json({ ok: true, name: draftName, type: draftType })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Chat endpoint
app.post('/api/skill-creator/chat', async (req, res) => {
  try {
    const { message, sessionId, draftName: requestDraftName } = req.body
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
    if (!message || !message.trim()) return res.status(400).json({ error: 'message required' })

    let session = SKILL_CREATOR_SESSIONS.get(sessionId)
    if (!session) {
      return res.status(400).json({ error: 'No SSE connection. Connect to /api/skill-creator/stream first.' })
    }

    if (session.process) {
      // Existing process — send follow-up message via stdin
      session.process.stdin.write(JSON.stringify({
        type: 'user',
        message: { role: 'user', content: message.trim() }
      }) + '\n')
      // Persist user message to draft chat history
      if (session.draftPath) {
        appendDraftChatMessage(session.draftPath, { role: 'user', content: message.trim(), timestamp: Date.now() })
      }
      return res.json({ ok: true, action: 'message_sent' })
    }

    // Check if we should resume an existing draft's session
    let draftName, draftPath, claudeSessionId
    if (requestDraftName) {
      draftPath = join(SKILL_CREATOR_DRAFTS_DIR, requestDraftName)
      try {
        const metaRaw = await readFile(join(draftPath, 'draft-metadata.json'), 'utf-8')
        const meta = JSON.parse(metaRaw)
        claudeSessionId = meta.claudeSessionId || null
        draftName = requestDraftName
      } catch {
        // Draft doesn't exist or no metadata — fall through to create new
      }
    }

    if (!draftName) {
      // Create draft directory for this session with full plugin scaffold
      draftName = `draft-${Date.now()}`
      draftPath = join(SKILL_CREATOR_DRAFTS_DIR, draftName)
      await mkdir(draftPath, { recursive: true })

      // Scaffold default plugin structure
      const pluginSlug = draftName
      await mkdir(join(draftPath, '.claude-plugin'), { recursive: true })
      await mkdir(join(draftPath, 'skills', pluginSlug), { recursive: true })

      // plugin.json — pre-filled with name and empty description
      const pluginJson = {
        name: pluginSlug,
        version: '1.0.0',
        description: '',
        author: { name: 'superbot2' },
        skills: [`./skills/${pluginSlug}`],
      }
      await writeFile(join(draftPath, '.claude-plugin', 'plugin.json'), JSON.stringify(pluginJson, null, 2))

      // SKILL.md — minimal frontmatter template with credentials example
      const skillMd = `---
name: ${pluginSlug}
description: >
  TODO: Describe when this skill should be triggered.
version: 1.0.0
user-invocable: true
# metadata:
#   credentials:
#     - key: MY_API_KEY
#       label: "My Service API Key"
#       description: "Get your key at example.com"
#       required: true
---

# ${pluginSlug}

TODO: Add skill instructions here.
`
      await writeFile(join(draftPath, 'skills', pluginSlug, 'SKILL.md'), skillMd)

      // README.md
      const readmeMd = `# ${pluginSlug}

A Claude Code plugin.

## Installation

\`\`\`bash
claude plugin install ${pluginSlug}
\`\`\`
`
      await writeFile(join(draftPath, 'README.md'), readmeMd)

      // Write draft metadata
      const draftMetadata = {
        sessionId,
        createdAt: new Date().toISOString(),
        status: 'in_progress',
        type: 'plugin',
      }
      await writeFile(join(draftPath, 'draft-metadata.json'), JSON.stringify(draftMetadata, null, 2))

      // Notify frontend of draft creation
      if (session.sseResponse) {
        session.sseResponse.write(`data: ${JSON.stringify({ type: 'draft_created', name: draftName, path: draftPath, draftType: 'plugin' })}\n\n`)
      }
    } else {
      // Resuming existing draft — update metadata status
      try {
        const metaPath = join(draftPath, 'draft-metadata.json')
        const raw = await readFile(metaPath, 'utf-8')
        const meta = JSON.parse(raw)
        meta.status = 'in_progress'
        await writeFile(metaPath, JSON.stringify(meta, null, 2))
      } catch {}
      // Notify frontend which draft we're resuming
      if (session.sseResponse) {
        session.sseResponse.write(`data: ${JSON.stringify({ type: 'draft_created', name: draftName, path: draftPath, draftType: 'plugin' })}\n\n`)
      }
    }

    session.draftName = draftName
    session.draftPath = draftPath

    // Spawn claude -p process (absolute path — aliases don't work with spawn)
    const env = { ...process.env }
    delete env.CLAUDECODE // Must delete, not set to undefined
    const spawnArgs = [
      '-p',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--system-prompt', SKILL_CREATOR_PROMPT_PATH,
      '--append-system-prompt', `\n\nDraft output directory (create ALL plugin files here): ${draftPath}\n\nReference file path (read when you need detailed spec info): ${SKILL_CREATOR_REFERENCE_PATH}`,
      '--allowed-tools', 'Read,Write,Edit,Bash,Glob,Grep',
      '--permission-mode', 'bypassPermissions',
      '--model', 'sonnet'
    ]
    // Resume existing claude session if available
    if (claudeSessionId) {
      spawnArgs.push('--resume', claudeSessionId)
    }
    const child = spawn(CLAUDE_BIN, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    })

    session.process = child

    // Read stdout line by line and forward as SSE
    const rl = createInterface({ input: child.stdout })

    rl.on('line', (line) => {
      if (!line.trim()) return
      try {
        const event = JSON.parse(line)
        const sseRes = SKILL_CREATOR_SESSIONS.get(sessionId)?.sseResponse
        if (!sseRes) return

        // Capture claude session ID from init event and save to draft metadata
        if (event.type === 'system' && event.session_id) {
          const sess = SKILL_CREATOR_SESSIONS.get(sessionId)
          if (sess?.draftPath) {
            const metaPath = join(sess.draftPath, 'draft-metadata.json')
            readFile(metaPath, 'utf-8').then(raw => {
              const meta = JSON.parse(raw)
              meta.claudeSessionId = event.session_id
              return writeFile(metaPath, JSON.stringify(meta, null, 2))
            }).catch(() => {})
          }
        }

        if (event.type === 'stream_event') {
          // Token-level streaming events (wrapped in stream_event)
          const inner = event.event
          if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
            sseRes.write(`data: ${JSON.stringify({ type: 'text', text: inner.delta.text })}\n\n`)
          }
          if (inner?.type === 'content_block_start' && inner.content_block?.type === 'tool_use') {
            sseRes.write(`data: ${JSON.stringify({ type: 'tool_start', name: inner.content_block.name })}\n\n`)
          }
        } else if (event.type === 'assistant') {
          // Complete assistant message with content blocks
          const content = event.message?.content || []
          const textBlocks = content.filter(b => b.type === 'text').map(b => b.text).join('')
          const toolBlocks = content.filter(b => b.type === 'tool_use').map(b => ({
            name: b.name,
            input: b.input
          }))
          sseRes.write(`data: ${JSON.stringify({ type: 'assistant', text: textBlocks, tools: toolBlocks })}\n\n`)
          // Persist assistant message to draft chat history
          const sess = SKILL_CREATOR_SESSIONS.get(sessionId)
          if (sess?.draftPath && textBlocks.trim()) {
            appendDraftChatMessage(sess.draftPath, {
              role: 'assistant',
              content: textBlocks,
              tools: toolBlocks.length > 0 ? toolBlocks : undefined,
              timestamp: Date.now()
            })
          }
        } else if (event.type === 'result') {
          sseRes.write(`data: ${JSON.stringify({ type: 'result', subtype: event.subtype, cost: event.total_cost_usd, duration: event.duration_ms })}\n\n`)
        }
      } catch {
        // Skip unparseable lines
      }
    })

    // Handle stderr (claude logs)
    const stderrChunks = []
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()))

    child.on('exit', async (code) => {
      const sseRes = SKILL_CREATOR_SESSIONS.get(sessionId)?.sseResponse
      if (sseRes) {
        if (code !== 0) {
          const stderr = stderrChunks.join('')
          sseRes.write(`data: ${JSON.stringify({ type: 'error', message: `claude process exited with code ${code}`, stderr })}\n\n`)
        }
        sseRes.write(`data: ${JSON.stringify({ type: 'process_exit', code })}\n\n`)
      }
      const sess = SKILL_CREATOR_SESSIONS.get(sessionId)
      if (sess) {
        sess.process = null
        // Update draft metadata on process exit
        if (sess.draftPath) {
          try {
            const metaPath = join(sess.draftPath, 'draft-metadata.json')
            const raw = await readFile(metaPath, 'utf-8')
            const meta = JSON.parse(raw)
            if (meta.status === 'in_progress') {
              meta.status = code === 0 ? 'complete' : 'incomplete'
              meta.completedAt = new Date().toISOString()
              await writeFile(metaPath, JSON.stringify(meta, null, 2))
            }
          } catch {}
        }
      }
    })

    // Send the first message
    child.stdin.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: message.trim() }
    }) + '\n')

    // Persist user message to draft chat history
    appendDraftChatMessage(draftPath, { role: 'user', content: message.trim(), timestamp: Date.now() })

    res.json({ ok: true, action: 'process_spawned' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Infer draft type from directory structure
async function inferDraftType(draftPath) {
  try {
    await stat(join(draftPath, '.claude-plugin', 'plugin.json'))
    return 'plugin'
  } catch {
    return 'skill'
  }
}

// List all drafts
app.get('/api/skill-creator/drafts', async (req, res) => {
  try {
    await mkdir(SKILL_CREATOR_DRAFTS_DIR, { recursive: true })
    const entries = await readdir(SKILL_CREATOR_DRAFTS_DIR, { withFileTypes: true })
    const drafts = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const draftPath = join(SKILL_CREATOR_DRAFTS_DIR, entry.name)
      const metaPath = join(draftPath, 'draft-metadata.json')
      try {
        const raw = await readFile(metaPath, 'utf-8')
        const meta = JSON.parse(raw)
        // Ensure type field exists (infer for legacy drafts)
        if (!meta.type) {
          meta.type = await inferDraftType(draftPath)
        }
        drafts.push({ name: entry.name, ...meta })
      } catch {
        const type = await inferDraftType(draftPath)
        drafts.push({ name: entry.name, status: 'unknown', type })
      }
    }
    res.json({ ok: true, drafts })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get chat history for a draft
app.get('/api/skill-creator/drafts/:name/chat-history', async (req, res) => {
  try {
    const draftPath = resolve(SKILL_CREATOR_DRAFTS_DIR, req.params.name)
    if (!draftPath.startsWith(SKILL_CREATOR_DRAFTS_DIR + '/')) {
      return res.status(400).json({ error: 'Invalid draft name' })
    }
    const messages = await readDraftChatHistory(draftPath)
    res.json({ ok: true, messages })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// List files in a draft (recursive)
app.get('/api/skill-creator/drafts/:name/files', async (req, res) => {
  try {
    const draftPath = resolve(SKILL_CREATOR_DRAFTS_DIR, req.params.name)
    if (!draftPath.startsWith(SKILL_CREATOR_DRAFTS_DIR + '/')) {
      return res.status(400).json({ error: 'Invalid draft name' })
    }

    async function listFiles(dir, prefix = '') {
      const results = []
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return results
      }
      for (const entry of entries) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.name === 'draft-metadata.json' || entry.name === 'chat-history.jsonl') continue
        if (entry.isDirectory()) {
          results.push({ path: relPath, type: 'directory' })
          const children = await listFiles(join(dir, entry.name), relPath)
          results.push(...children)
        } else {
          results.push({ path: relPath, type: 'file' })
        }
      }
      return results
    }

    const files = await listFiles(draftPath)
    res.json({ ok: true, files })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Read a specific file from a draft
app.get('/api/skill-creator/drafts/:name/file/{*filePath}', async (req, res) => {
  try {
    const draftPath = resolve(SKILL_CREATOR_DRAFTS_DIR, req.params.name)
    if (!draftPath.startsWith(SKILL_CREATOR_DRAFTS_DIR + '/')) {
      return res.status(400).json({ error: 'Invalid draft name' })
    }
    const relPath = Array.isArray(req.params.filePath) ? req.params.filePath.join('/') : req.params.filePath
    const filePath = resolve(draftPath, relPath)
    if (!filePath.startsWith(draftPath + '/')) {
      return res.status(400).json({ error: 'Invalid file path' })
    }
    const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.tar', '.gz'])
    const ext = extname(filePath).toLowerCase()
    if (BINARY_EXTS.has(ext)) {
      const { size } = await stat(filePath)
      return res.json({ ok: true, binary: true, size })
    }
    const content = await readFile(filePath, 'utf-8')
    res.json({ ok: true, content })
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' })
    res.status(500).json({ error: err.message })
  }
})

// Update a file in a draft (text content)
app.put('/api/skill-creator/drafts/:name/file/{*filePath}', async (req, res) => {
  try {
    const draftPath = resolve(SKILL_CREATOR_DRAFTS_DIR, req.params.name)
    if (!draftPath.startsWith(SKILL_CREATOR_DRAFTS_DIR + '/')) {
      return res.status(400).json({ error: 'Invalid draft name' })
    }
    const relPath = Array.isArray(req.params.filePath) ? req.params.filePath.join('/') : req.params.filePath
    const filePath = resolve(draftPath, relPath)
    if (!filePath.startsWith(draftPath + '/')) {
      return res.status(400).json({ error: 'Invalid file path' })
    }
    const { content } = req.body
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content string required' })
    }
    await writeFile(filePath, content, 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Upload a file to a draft
app.post('/api/skill-creator/drafts/:name/files', async (req, res) => {
  try {
    const draftPath = resolve(SKILL_CREATOR_DRAFTS_DIR, req.params.name)
    if (!draftPath.startsWith(SKILL_CREATOR_DRAFTS_DIR + '/')) {
      return res.status(400).json({ error: 'Invalid draft name' })
    }
    const { files } = req.body
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array required' })
    }
    await mkdir(draftPath, { recursive: true })
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    const savedPaths = []
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const dest = resolve(draftPath, safeName)
      if (!dest.startsWith(draftPath + '/')) continue
      const buffer = Buffer.from(file.data, 'base64')
      if (buffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ error: `File ${file.name} exceeds 10MB limit` })
      }
      await writeFile(dest, buffer)
      savedPaths.push(safeName)
    }
    res.json({ ok: true, files: savedPaths })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Delete a draft
app.delete('/api/skill-creator/drafts/:name', async (req, res) => {
  try {
    const draftPath = resolve(SKILL_CREATOR_DRAFTS_DIR, req.params.name)
    if (!draftPath.startsWith(SKILL_CREATOR_DRAFTS_DIR + '/')) {
      return res.status(400).json({ error: 'Invalid draft name' })
    }
    await rm(draftPath, { recursive: true, force: true })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Validate a draft plugin structure
app.post('/api/skill-creator/drafts/:name/validate', async (req, res) => {
  try {
    const draftPath = resolve(SKILL_CREATOR_DRAFTS_DIR, req.params.name)
    if (!draftPath.startsWith(SKILL_CREATOR_DRAFTS_DIR + '/')) {
      return res.status(400).json({ error: 'Invalid draft name' })
    }

    try {
      await stat(draftPath)
    } catch {
      return res.status(404).json({ error: 'Draft not found' })
    }

    const errors = []
    const warnings = []
    const SEMVER_RE = /^\d+\.\d+\.\d+$/
    const VALID_HOOK_EVENTS = new Set([
      'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest',
      'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop',
      'TeammateIdle', 'TaskCompleted', 'PreCompact', 'SessionStart', 'SessionEnd', 'ConfigChange'
    ])

    // Determine draft type
    const draftType = await inferDraftType(draftPath)

    // --- Helper: validate a single SKILL.md frontmatter ---
    function validateSkillMdFrontmatter(raw, fmFile) {
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!fmMatch) {
        errors.push({ file: fmFile, field: null, message: 'No frontmatter found' })
        return
      }
      let fm
      try {
        fm = yaml.load(fmMatch[1])
      } catch (e) {
        errors.push({ file: fmFile, field: null, message: `Invalid YAML frontmatter: ${e.message}` })
        return
      }
      if (!fm || typeof fm !== 'object') {
        errors.push({ file: fmFile, field: null, message: 'Frontmatter is empty' })
        return
      }
      if (!fm.name) {
        errors.push({ file: fmFile, field: 'name', message: 'Required field missing' })
      }
      if (!fm.description) {
        errors.push({ file: fmFile, field: 'description', message: 'Required field missing' })
      } else if (typeof fm.description === 'string' && fm.description.trim().length < 20) {
        warnings.push({ file: fmFile, field: 'description', message: 'Description is very short' })
      }
      if (!fm.version) {
        warnings.push({ file: fmFile, field: 'version', message: 'Version not specified' })
      }
      // Validate credentials if present
      const credentials = fm.metadata?.credentials || fm.credentials
      if (credentials && Array.isArray(credentials)) {
        for (let i = 0; i < credentials.length; i++) {
          const cred = credentials[i]
          if (!cred.key) {
            errors.push({ file: fmFile, field: `credentials[${i}].key`, message: 'Credential missing required "key" field' })
          }
          if (!cred.label) {
            errors.push({ file: fmFile, field: `credentials[${i}].label`, message: 'Credential missing required "label" field' })
          }
        }
      }
    }

    if (draftType === 'skill') {
      // --- Skill-type validation: just needs root SKILL.md with name + description ---
      const rootSkillPath = join(draftPath, 'SKILL.md')
      try {
        const raw = await readFile(rootSkillPath, 'utf-8')
        validateSkillMdFrontmatter(raw, 'SKILL.md')
      } catch (e) {
        if (e.code === 'ENOENT') {
          errors.push({ file: 'SKILL.md', field: null, message: 'File missing — required for skill drafts' })
        } else {
          errors.push({ file: 'SKILL.md', field: null, message: `Read error: ${e.message}` })
        }
      }
    } else {
      // --- Plugin-type validation ---

      // Validate .claude-plugin/plugin.json
      const pluginJsonPath = join(draftPath, '.claude-plugin', 'plugin.json')
      let pluginJson = null
      try {
        const raw = await readFile(pluginJsonPath, 'utf-8')
        pluginJson = JSON.parse(raw)
      } catch (e) {
        if (e.code === 'ENOENT') {
          errors.push({ file: '.claude-plugin/plugin.json', field: null, message: 'File missing — required' })
        } else {
          errors.push({ file: '.claude-plugin/plugin.json', field: null, message: `Invalid JSON: ${e.message}` })
        }
      }

      if (pluginJson) {
        if (!pluginJson.name) {
          errors.push({ file: '.claude-plugin/plugin.json', field: 'name', message: 'Required field missing' })
        } else if (pluginJson.name !== req.params.name) {
          warnings.push({ file: '.claude-plugin/plugin.json', field: 'name', message: `Name "${pluginJson.name}" does not match draft directory "${req.params.name}"` })
        }
        if (!pluginJson.version) {
          errors.push({ file: '.claude-plugin/plugin.json', field: 'version', message: 'Required field missing' })
        } else if (!SEMVER_RE.test(pluginJson.version)) {
          errors.push({ file: '.claude-plugin/plugin.json', field: 'version', message: `Invalid semver: "${pluginJson.version}" (expected x.y.z)` })
        }
        if (!pluginJson.description && pluginJson.description !== '') {
          errors.push({ file: '.claude-plugin/plugin.json', field: 'description', message: 'Required field missing' })
        } else if (typeof pluginJson.description === 'string' && pluginJson.description.trim() === '') {
          warnings.push({ file: '.claude-plugin/plugin.json', field: 'description', message: 'Description is empty' })
        }
      }

      // Find SKILL.md files in skills/
      const skillsDir = join(draftPath, 'skills')
      let skillDirs = []
      try {
        const entries = await readdir(skillsDir, { withFileTypes: true })
        skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name)
      } catch {
        // skills/ dir may not exist
      }

      let foundSkillMd = false
      for (const skillDir of skillDirs) {
        const skillMdPath = join(skillsDir, skillDir, 'SKILL.md')
        try {
          const raw = await readFile(skillMdPath, 'utf-8')
          foundSkillMd = true
          validateSkillMdFrontmatter(raw, `skills/${skillDir}/SKILL.md`)
        } catch (e) {
          if (e.code !== 'ENOENT') {
            errors.push({ file: `skills/${skillDir}/SKILL.md`, field: null, message: `Read error: ${e.message}` })
          }
        }
      }

      if (!foundSkillMd) {
        errors.push({ file: 'skills/', field: null, message: 'No SKILL.md found — at least one skill is required' })
      }
    }

    // --- Validate commands/*.md (if any) ---
    const commandsDir = join(draftPath, 'commands')
    try {
      const entries = await readdir(commandsDir)
      for (const file of entries) {
        if (!file.endsWith('.md')) continue
        const cmdPath = join(commandsDir, file)
        const raw = await readFile(cmdPath, 'utf-8')
        const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        if (!fmMatch) {
          warnings.push({ file: `commands/${file}`, field: null, message: 'No frontmatter found' })
          continue
        }
        try {
          const fm = yaml.load(fmMatch[1])
          if (!fm || !fm.name) {
            errors.push({ file: `commands/${file}`, field: 'name', message: 'Required field missing in frontmatter' })
          }
        } catch (e) {
          errors.push({ file: `commands/${file}`, field: null, message: `Invalid YAML frontmatter: ${e.message}` })
        }
      }
    } catch {
      // commands/ dir may not exist — that's fine
    }

    // --- Validate agents/*.md (if any) ---
    const agentsDir = join(draftPath, 'agents')
    try {
      const entries = await readdir(agentsDir)
      for (const file of entries) {
        if (!file.endsWith('.md')) continue
        const agentPath = join(agentsDir, file)
        const raw = await readFile(agentPath, 'utf-8')
        const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        if (!fmMatch) {
          warnings.push({ file: `agents/${file}`, field: null, message: 'No frontmatter found' })
          continue
        }
        try {
          const fm = yaml.load(fmMatch[1])
          if (!fm || !fm.name) {
            errors.push({ file: `agents/${file}`, field: 'name', message: 'Required field missing in frontmatter' })
          }
          if (!fm || !fm.description) {
            errors.push({ file: `agents/${file}`, field: 'description', message: 'Required field missing in frontmatter' })
          }
        } catch (e) {
          errors.push({ file: `agents/${file}`, field: null, message: `Invalid YAML frontmatter: ${e.message}` })
        }
      }
    } catch {
      // agents/ dir may not exist — that's fine
    }

    // --- Validate hooks/hooks.json (if exists) ---
    const hooksPath = join(draftPath, 'hooks', 'hooks.json')
    try {
      const raw = await readFile(hooksPath, 'utf-8')
      let hooksJson
      try {
        hooksJson = JSON.parse(raw)
      } catch (e) {
        errors.push({ file: 'hooks/hooks.json', field: null, message: `Invalid JSON: ${e.message}` })
        hooksJson = null
      }
      if (hooksJson) {
        const hooks = hooksJson.hooks
        if (!hooks || typeof hooks !== 'object') {
          errors.push({ file: 'hooks/hooks.json', field: 'hooks', message: 'Missing or invalid "hooks" object' })
        } else {
          const eventKeys = Object.keys(hooks)
          if (eventKeys.length === 0) {
            errors.push({ file: 'hooks/hooks.json', field: 'hooks', message: 'Must have at least one hook event' })
          }
          const invalidKeys = eventKeys.filter(k => !VALID_HOOK_EVENTS.has(k))
          if (invalidKeys.length > 0) {
            warnings.push({ file: 'hooks/hooks.json', field: 'hooks', message: `Unknown hook event(s): ${invalidKeys.join(', ')}` })
          }
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        errors.push({ file: 'hooks/hooks.json', field: null, message: `Read error: ${e.message}` })
      }
    }

    res.json({ ok: true, valid: errors.length === 0, errors, warnings })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// My Skills — list installed plugins with author.name === 'superbot2'
app.get('/api/skill-creator/my-skills', async (req, res) => {
  try {
    const installedPluginsPath = join(process.env.HOME, '.claude', 'plugins', 'installed_plugins.json')
    let installedData
    try {
      const raw = await readFile(installedPluginsPath, 'utf-8')
      installedData = JSON.parse(raw)
    } catch {
      return res.json({ ok: true, skills: [] })
    }

    const plugins = installedData.plugins || {}
    const skills = []

    for (const [key, entries] of Object.entries(plugins)) {
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        const installPath = entry.installPath
        if (!installPath) continue
        try {
          const pluginJsonPath = join(installPath, '.claude-plugin', 'plugin.json')
          const pluginRaw = await readFile(pluginJsonPath, 'utf-8')
          const pluginJson = JSON.parse(pluginRaw)
          const authorName = typeof pluginJson.author === 'string' ? pluginJson.author : pluginJson.author?.name
          if (authorName === 'superbot2') {
            skills.push({
              name: pluginJson.name || key.split('@')[0],
              description: pluginJson.description || '',
              version: pluginJson.version || entry.version || '0.0.0',
              installPath,
              installedAt: entry.installedAt,
            })
          }
        } catch {
          // Skip plugins we can't read
        }
      }
    }

    res.json({ ok: true, skills })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Promote a draft to installed plugin
app.post('/api/skill-creator/promote', async (req, res) => {
  try {
    const { draftName } = req.body
    if (!draftName) return res.status(400).json({ error: 'draftName required' })

    const draftPath = resolve(SKILL_CREATOR_DRAFTS_DIR, draftName)
    if (!draftPath.startsWith(SKILL_CREATOR_DRAFTS_DIR + '/')) {
      return res.status(400).json({ error: 'Invalid draft name' })
    }

    // Check draft exists
    try {
      await stat(draftPath)
    } catch {
      return res.status(404).json({ error: 'Draft not found' })
    }

    // Read plugin.json from draft
    const pluginJsonPath = join(draftPath, '.claude-plugin', 'plugin.json')
    let pluginJson
    try {
      const raw = await readFile(pluginJsonPath, 'utf-8')
      pluginJson = JSON.parse(raw)
    } catch {
      return res.status(400).json({ error: 'Draft missing .claude-plugin/plugin.json — not a valid plugin' })
    }

    const pluginName = pluginJson.name
    if (!pluginName) {
      return res.status(400).json({ error: 'plugin.json missing name field' })
    }

    // Ensure author.name = 'superbot2'
    if (typeof pluginJson.author === 'string') {
      pluginJson.author = { name: 'superbot2' }
    } else if (!pluginJson.author) {
      pluginJson.author = { name: 'superbot2' }
    } else {
      pluginJson.author.name = 'superbot2'
    }
    await writeFile(pluginJsonPath, JSON.stringify(pluginJson, null, 2))

    // Run validation (informational — don't block on failure)
    let validationOutput = ''
    try {
      validationOutput = execFileSync(CLAUDE_BIN, ['plugin', 'validate', draftPath], { encoding: 'utf-8', timeout: 15000 })
    } catch (err) {
      validationOutput = err.stdout || err.stderr || err.message || 'Validation failed'
    }

    // Copy draft to cache location
    const version = pluginJson.version || '1.0.0'
    const cachePath = join(process.env.HOME, '.claude', 'plugins', 'cache', 'local', pluginName, version)
    await mkdir(cachePath, { recursive: true })

    // Recursive copy (safe, no shell involved)
    await cp(draftPath, cachePath, { recursive: true })
    // Remove draft-metadata.json from cache copy
    try { await rm(join(cachePath, 'draft-metadata.json'), { force: true }) } catch {}

    // Register in installed_plugins.json
    const installedPluginsPath = join(process.env.HOME, '.claude', 'plugins', 'installed_plugins.json')
    let installedData
    try {
      const raw = await readFile(installedPluginsPath, 'utf-8')
      installedData = JSON.parse(raw)
    } catch {
      installedData = { version: 2, plugins: {} }
    }

    const pluginKey = `${pluginName}@local`
    const now = new Date().toISOString()
    installedData.plugins[pluginKey] = [{
      scope: 'user',
      installPath: cachePath,
      version,
      installedAt: now,
      lastUpdated: now,
    }]
    await writeFile(installedPluginsPath, JSON.stringify(installedData, null, 2))

    // Update draft metadata
    const metaPath = join(draftPath, 'draft-metadata.json')
    try {
      const raw = await readFile(metaPath, 'utf-8')
      const meta = JSON.parse(raw)
      meta.status = 'promoted'
      meta.promotedAt = now
      meta.promotedName = pluginName
      await writeFile(metaPath, JSON.stringify(meta, null, 2))
    } catch {}

    res.json({
      ok: true,
      name: pluginName,
      installPath: cachePath,
      version,
      validation: validationOutput,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// File upload endpoint
app.post('/api/skill-creator/upload', async (req, res) => {
  try {
    const { sessionId, files } = req.body
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array required' })
    }

    const uploadDir = join(SKILL_CREATOR_UPLOADS_DIR, sessionId)
    await mkdir(uploadDir, { recursive: true })

    const ALLOWED_UPLOAD_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.md', '.json', '.yaml', '.yml', '.js', '.ts', '.py', '.sh'])
    const savedPaths = []

    for (const file of files) {
      const ext = extname(file.name).toLowerCase() || '.txt'
      if (!ALLOWED_UPLOAD_EXTS.has(ext)) continue
      const ts = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filename = `${ts}-${safeName}`
      const filePath = join(uploadDir, filename)
      const buffer = Buffer.from(file.data, 'base64')
      await writeFile(filePath, buffer)
      savedPaths.push(filePath)
    }

    res.json({ ok: true, paths: savedPaths })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Delete session endpoint
app.delete('/api/skill-creator/session/:sessionId', (req, res) => {
  const { sessionId } = req.params
  const session = SKILL_CREATOR_SESSIONS.get(sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found' })

  if (session.process) {
    try { session.process.kill() } catch {}
  }
  SKILL_CREATOR_SESSIONS.delete(sessionId)
  res.json({ ok: true })
})

// --- Static files (production only — skipped when vite dev server handles frontend) ---

const DEV_MODE = process.argv.includes('--no-static')

if (!DEV_MODE) {
  const DIST_DIR = resolve(import.meta.dirname, '..', 'dashboard-ui', 'dist')
  const INDEX_HTML = resolve(DIST_DIR, 'index.html')

  if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR))
  }

  // SPA fallback — only in production mode
  app.get('/{*path}', (_req, res) => {
    if (existsSync(INDEX_HTML)) {
      res.sendFile(INDEX_HTML, (err) => {
        if (err) {
          console.error('Failed to serve index.html:', err.message)
          res.status(503).send(`
            <html><body style="font-family: system-ui; max-width: 600px; margin: 80px auto; padding: 20px;">
              <h1>Dashboard Error</h1>
              <p>Failed to serve the dashboard UI: ${err.message}</p>
              <p>Try rebuilding: <code>cd ${import.meta.dirname.replace(/'/g, "\\'")}/../dashboard-ui && npm run build</code></p>
            </body></html>
          `)
        }
      })
    } else {
      res.status(503).send(`
        <html>
          <head><title>Dashboard Not Built</title></head>
          <body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 20px;">
            <h1>Dashboard UI Not Built</h1>
            <p>The dashboard server is running, but the UI hasn't been built yet.</p>
            <p>Run this command to build it:</p>
            <pre style="background: #f0f0f0; padding: 12px; border-radius: 6px;">cd ${import.meta.dirname.replace(/'/g, "\\'")}/../dashboard-ui && npm install && npm run build</pre>
            <p>Then refresh this page.</p>
            <hr>
            <p style="color: #666; font-size: 14px;">The API is still available at <code>/api/*</code> endpoints.</p>
          </body>
        </html>
      `)
    }
  })
} else {
  console.log('Dev mode: static file serving disabled (vite dev server handles frontend)')
}

// --- iMessage reply mirroring ---

const IMESSAGE_SENT_FILE = join(SUPERBOT_DIR, 'imessage-last-sent-idx.txt')

let imessageLastSentCount = 0

// Initialize last sent count from file
try {
  const saved = existsSync(IMESSAGE_SENT_FILE)
    ? parseInt(readFileSync(IMESSAGE_SENT_FILE, 'utf-8').trim(), 10)
    : 0
  imessageLastSentCount = isNaN(saved) ? 0 : saved
} catch {
  imessageLastSentCount = 0
}

const IMESSAGE_IMAGE_RE = /((?:~\/|\/)[^\s]+\.(?:png|jpe?g|gif|webp))/gi

function imessageExtractImagePaths(text) {
  IMESSAGE_IMAGE_RE.lastIndex = 0
  const paths = []
  let match
  while ((match = IMESSAGE_IMAGE_RE.exec(text)) !== null) {
    paths.push(match[1])
  }
  IMESSAGE_IMAGE_RE.lastIndex = 0
  return paths
}

function imessageStripImagePaths(text) {
  IMESSAGE_IMAGE_RE.lastIndex = 0
  return text.replace(IMESSAGE_IMAGE_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

function imessageResolveImagePath(p) {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

async function mirrorRepliesToImessage() {
  try {
    // Read config fresh each time
    const config = await readJsonFile(join(SUPERBOT_DIR, 'config.json'))
    if (!config?.imessage?.enabled || !config.imessage.appleId || config.imessage.appleId === 'YOUR_SUPERBOT2_APPLE_ID') {
      return
    }

    const dashUserInbox = await readJsonFile(join(TEAM_INBOXES_DIR, 'dashboard-user.json')) || []
    const orchestratorReplies = dashUserInbox.filter(m => m.from === 'team-lead')

    if (orchestratorReplies.length <= imessageLastSentCount) {
      return
    }

    const newReplies = orchestratorReplies.slice(imessageLastSentCount)
    const scriptsDir = join(import.meta.dirname, '..', 'scripts')

    for (const reply of newReplies) {
      const text = reply.text || reply.content || ''
      if (!text.trim()) continue

      // Send to user's phone number (not appleId — that would loop back internally)
      const recipient = config.imessage.phoneNumber || config.imessage.appleId

      // Check for image paths
      const imagePaths = imessageExtractImagePaths(text)
      const existingImages = []
      for (const p of imagePaths) {
        const resolved = imessageResolveImagePath(p)
        try {
          const s = await stat(resolved)
          if (s.isFile()) existingImages.push(resolved)
        } catch {
          // file doesn't exist, skip
        }
      }

      if (existingImages.length > 0) {
        // Send text portion first (if any), then images as attachments
        const textWithoutImages = imessageStripImagePaths(text)
        if (textWithoutImages) {
          const truncated = textWithoutImages.length > 2000 ? textWithoutImages.slice(0, 1997) + '...' : textWithoutImages
          spawn('bash', [join(scriptsDir, 'send-imessage.sh'), recipient, truncated], {
            stdio: 'ignore',
            detached: true
          }).unref()
        }

        // Send each image as a separate attachment
        for (const imgPath of existingImages) {
          spawn('bash', [join(scriptsDir, 'send-imessage-image.sh'), recipient, imgPath], {
            stdio: 'ignore',
            detached: true
          }).unref()
        }
      } else {
        // No images — send as text (original behavior)
        const truncated = text.length > 2000 ? text.slice(0, 1997) + '...' : text
        spawn('bash', [join(scriptsDir, 'send-imessage.sh'), recipient, truncated], {
          stdio: 'ignore',
          detached: true
        }).unref()
      }
    }

    imessageLastSentCount = orchestratorReplies.length
    await writeFile(IMESSAGE_SENT_FILE, String(imessageLastSentCount), 'utf-8')
  } catch (err) {
    // Silent fail — don't crash server for iMessage issues
    console.error('iMessage mirror error:', err.message)
  }
}

// Poll every 5 seconds for new orchestrator replies to mirror
setInterval(mirrorRepliesToImessage, 5000)

// --- Start ---

app.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`)
  console.log(`Reading from ${SUPERBOT_DIR}`)
})
