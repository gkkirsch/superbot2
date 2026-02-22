import express from 'express'
import { readdir, readFile, writeFile, rename, mkdir, stat, rm, unlink } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFile, spawn } from 'node:child_process'
import yaml from 'js-yaml'

const app = express()
const PORT = 3274
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
    res.json({ heartbeatRunning, schedulerRunning })
  } catch (err) {
    res.status(500).json({ error: err.message })
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

const DEFAULT_TODOS = [
  { id: '1', text: 'Better memory/daily summaries', completed: false },
  { id: '2', text: 'Heartbeat audit', completed: false },
  { id: '3', text: 'User memory/profile', completed: false },
  { id: '4', text: 'Identity', completed: false },
  { id: '5', text: 'Natural language hooks/enforcement', completed: false },
]

async function readTodos() {
  const data = await readJsonFile(TODOS_FILE)
  return data || DEFAULT_TODOS
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
    const newTodo = { id: Date.now().toString(), text: text.trim(), completed: false }
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

    // Global knowledge
    const globalFiles = await safeReaddir(KNOWLEDGE_DIR)
    const globalMd = globalFiles.filter(f => f.endsWith('.md')).sort()
    if (globalMd.length > 0) {
      groups.push({
        source: 'global',
        label: 'Global',
        files: globalMd.map(f => ({ name: f.replace(/\.md$/, ''), path: f })),
      })
    }

    // Per-space knowledge
    const spaceSlugs = await safeReaddir(SPACES_DIR)
    const sortedSlugs = spaceSlugs.sort()
    for (const slug of sortedSlugs) {
      const spaceKnowledgeDir = join(SPACES_DIR, slug, 'knowledge')
      const files = await safeReaddir(spaceKnowledgeDir)
      const mdFiles = files.filter(f => f.endsWith('.md')).sort()
      if (mdFiles.length === 0) continue

      // Check it's actually a directory
      try {
        const s = await stat(join(SPACES_DIR, slug))
        if (!s.isDirectory()) continue
      } catch { continue }

      const spaceJson = await readJsonFile(join(SPACES_DIR, slug, 'space.json'))
      const label = spaceJson?.name || slug

      groups.push({
        source: slug,
        label,
        files: mdFiles.map(f => ({ name: f.replace(/\.md$/, ''), path: f })),
      })
    }

    res.json({ groups })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/knowledge/:source/:filename', async (req, res) => {
  try {
    const { source, filename } = req.params
    // Sanitize filename to prevent path traversal
    const safeName = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '')
    if (!safeName.endsWith('.md')) {
      return res.status(400).json({ error: 'Only .md files supported' })
    }

    let filePath
    if (source === 'global') {
      filePath = join(KNOWLEDGE_DIR, safeName)
    } else {
      // Per-space knowledge
      const safeSource = source.replace(/[^a-zA-Z0-9_\-]/g, '')
      filePath = join(SPACES_DIR, safeSource, 'knowledge', safeName)
    }

    const result = await readMarkdownFile(filePath)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Dashboard config ---

const DEFAULT_DASHBOARD_CONFIG = {
  leftColumn: ['escalations', 'orchestrator-resolved', 'recent-activity'],
  centerColumn: ['chat'],
  rightColumn: ['pulse', 'schedule', 'todos', 'knowledge', 'extensions'],
  hidden: [],
}

const VALID_SECTION_IDS = ['escalations', 'orchestrator-resolved', 'recent-activity', 'pulse', 'schedule', 'todos', 'knowledge', 'extensions', 'spaces', 'chat']

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

let activityCache = { data: null, fetchedAt: 0 }

app.get('/api/activity', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || '24', 10)
    const now = Date.now()
    // Cache for 60 seconds to avoid hammering the filesystem
    if (activityCache.data && (now - activityCache.fetchedAt) < 60_000 && hours === 24) {
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
      activityCache = { data: activity, fetchedAt: now }
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
      if (Array.isArray(fm.credentials) && fm.credentials.length > 0) {
        return fm.credentials
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

app.get('/api/skills/:id', async (req, res) => {
  try {
    const { id } = req.params
    const skillDir = join(CLAUDE_DIR, 'skills', id)
    const skillMd = join(skillDir, 'SKILL.md')
    const content = await readFile(skillMd, 'utf-8')
    const fm = parseFrontmatter(content)
    const files = await safeReaddir(skillDir)
    res.json({
      id,
      name: fm.name || id,
      description: fm.description || '',
      fullContent: content,
      files,
    })
  } catch (err) {
    res.status(404).json({ error: 'Skill not found' })
  }
})

app.get('/api/skills/:id/files/{*filePath}', async (req, res) => {
  try {
    const { id } = req.params
    const filePath = Array.isArray(req.params.filePath) ? req.params.filePath.join('/') : req.params.filePath
    const fullPath = join(CLAUDE_DIR, 'skills', id, filePath)
    const content = await readFile(fullPath, 'utf-8')
    res.json({ content })
  } catch (err) {
    res.status(404).json({ error: 'File not found' })
  }
})

app.delete('/api/skills/:id', async (req, res) => {
  try {
    const { id } = req.params
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
    }

    pluginDetailCache.set(name, { data: detail, fetchedAt: now })
    res.json(detail)
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
      let hasUnconfiguredCredentials = false
      if (installPath) {
        try {
          const { counts } = await scanPluginComponents(installPath)
          componentCounts = counts
        } catch { /* ignore */ }
        // Read keywords from local plugin.json
        const pj = await readJsonFile(join(installPath, '.claude-plugin', 'plugin.json'))
        if (pj?.keywords) keywords = pj.keywords
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
      }
      installed.push({
        ...p,
        pluginId: pid,
        name,
        description: p.description || '',
        installed: true,
        componentCounts,
        keywords,
        ...(hasUnconfiguredCredentials ? { hasUnconfiguredCredentials: true } : {}),
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
    await runClaude(['plugin', 'marketplace', 'remove', name])
    res.json({ ok: true })
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
    const files = await safeReaddir(SESSIONS_DIR)
    const sessions = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const session = await readJsonFile(join(SESSIONS_DIR, file))
      if (session) sessions.push(session)
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
    res.json({
      id,
      name: fm.name || id,
      description: fm.description || '',
      fullContent: content,
      files,
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

// --- Messages to orchestrator ---

app.get('/api/messages', async (req, res) => {
  try {
    const includeBackground = req.query.background === 'true'

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
      return res.json({ messages })
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

    res.json({ messages: allMessages })
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

// --- Static files (production) ---

const DIST_DIR = resolve(import.meta.dirname, '..', 'dashboard-ui', 'dist')
const INDEX_HTML = resolve(DIST_DIR, 'index.html')

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))

  // SPA fallback (Express 5 wildcard syntax)
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
}

// --- Start ---

app.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`)
  console.log(`Reading from ${SUPERBOT_DIR}`)
})
