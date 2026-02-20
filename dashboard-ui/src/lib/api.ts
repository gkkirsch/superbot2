import type { SpaceOverview, SpaceDetail, Task, Escalation, ContextFile, ProjectDocument, ScheduleData, ScheduledJob, ActivityBucket, SkillInfo, AgentInfo, HookInfo, PluginInfo, MarketplaceInfo, PluginDetail, SkillDetail, AgentDetail, SessionSummary, SuperbotSkill, SuperbotSkillDetail, InboxMessage, DashboardConfig, TodoItem, PluginCredentialStatus } from './types'

export type { PluginDetail }

const API_BASE = '/api'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

// --- Context files ---

export async function fetchIdentity(): Promise<ContextFile> {
  return fetchJson<ContextFile>('/identity')
}

export async function fetchUser(): Promise<ContextFile> {
  return fetchJson<ContextFile>('/user')
}

export async function fetchMemory(): Promise<ContextFile> {
  return fetchJson<ContextFile>('/memory')
}

// --- Spaces ---

export async function fetchSpaces(): Promise<SpaceOverview[]> {
  const data = await fetchJson<{ spaces: SpaceOverview[] }>('/spaces')
  return data.spaces
}

export async function fetchSpace(slug: string): Promise<SpaceDetail> {
  return fetchJson<SpaceDetail>(`/spaces/${slug}`)
}

export async function fetchSpaceOverview(slug: string): Promise<{ content: string; exists: boolean }> {
  return fetchJson<{ content: string; exists: boolean }>(`/spaces/${slug}/overview`)
}

export async function fetchProjectTasks(slug: string, project: string): Promise<Task[]> {
  const data = await fetchJson<{ tasks: Task[] }>(`/spaces/${slug}/projects/${project}/tasks`)
  return data.tasks
}

export async function fetchProjectPlan(slug: string, project: string): Promise<ContextFile> {
  return fetchJson<ContextFile>(`/spaces/${slug}/projects/${project}/plan`)
}

export async function fetchProjectDocuments(slug: string, project: string): Promise<ProjectDocument[]> {
  const data = await fetchJson<{ documents: ProjectDocument[] }>(`/spaces/${slug}/projects/${project}/documents`)
  return data.documents
}

// --- Escalations ---

export async function fetchEscalations(status?: string, space?: string, type?: string): Promise<Escalation[]> {
  const qs = new URLSearchParams()
  if (status) qs.set('status', status)
  if (space) qs.set('space', space)
  if (type) qs.set('type', type)
  const qstr = qs.toString()
  const data = await fetchJson<{ escalations: Escalation[] }>(`/escalations${qstr ? `?${qstr}` : ''}`)
  return data.escalations
}

export async function resolveEscalation(id: string, resolution: string): Promise<Escalation> {
  const response = await fetch(`${API_BASE}/escalations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved', resolution }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export async function dismissEscalation(id: string): Promise<Escalation> {
  const response = await fetch(`${API_BASE}/escalations/${id}/dismiss`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export async function deleteEscalation(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/escalations/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function fetchSpaceEscalations(slug: string, status?: string): Promise<Escalation[]> {
  const qs = status ? `?status=${status}` : ''
  const data = await fetchJson<{ escalations: Escalation[] }>(`/spaces/${slug}/escalations${qs}`)
  return data.escalations
}

// --- Dev server management ---

export interface ServerStatus {
  running: boolean
  pid?: number
  startedAt?: string
  hasDevServer?: boolean
  hasDeploy?: boolean
  prodUrl?: string | null
  devUrl?: string | null
}

export async function fetchServerStatus(slug: string): Promise<ServerStatus> {
  return fetchJson<ServerStatus>(`/spaces/${slug}/server-status`)
}

export async function startServer(slug: string): Promise<{ status: string; pid?: number; command?: string; cwd?: string }> {
  const response = await fetch(`${API_BASE}/spaces/${slug}/start`, { method: 'POST' })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export async function stopServer(slug: string): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/spaces/${slug}/stop`, { method: 'POST' })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export async function deployServer(slug: string): Promise<{ status: string; pid?: number }> {
  const response = await fetch(`${API_BASE}/spaces/${slug}/deploy`, { method: 'POST' })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

// --- System status ---

export interface SystemStatus {
  heartbeatRunning: boolean
  schedulerRunning: boolean
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  return fetchJson<SystemStatus>('/status')
}

// --- Heartbeat config ---

export async function fetchHeartbeatConfig(): Promise<{ intervalMinutes: number }> {
  return fetchJson<{ intervalMinutes: number }>('/heartbeat')
}

export interface HeartbeatEntry {
  ts: string
  changed: boolean
}

export async function fetchHeartbeatActivity(): Promise<HeartbeatEntry[]> {
  const data = await fetchJson<{ activity: HeartbeatEntry[] }>('/heartbeat/activity')
  return data.activity
}

export async function updateHeartbeatInterval(intervalMinutes: number): Promise<{ intervalMinutes: number }> {
  const response = await fetch(`${API_BASE}/heartbeat`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervalMinutes }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

// --- Activity (JSONL transcript parsing) ---

export async function fetchActivity(hours = 24): Promise<ActivityBucket[]> {
  const data = await fetchJson<{ activity: ActivityBucket[] }>(`/activity?hours=${hours}`)
  return data.activity
}

// --- Schedule ---

export async function fetchSchedule(): Promise<ScheduleData> {
  return fetchJson<ScheduleData>('/schedule')
}

export async function addScheduleJob(job: ScheduledJob): Promise<{ schedule: ScheduledJob[] }> {
  const response = await fetch(`${API_BASE}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export async function deleteScheduleJob(name: string): Promise<{ schedule: ScheduledJob[] }> {
  const response = await fetch(`${API_BASE}/schedule/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

// --- Skills page ---

export async function fetchSkills(): Promise<SkillInfo[]> {
  const data = await fetchJson<{ skills: SkillInfo[] }>('/skills')
  return data.skills
}

export async function fetchAgents(): Promise<AgentInfo[]> {
  const data = await fetchJson<{ agents: AgentInfo[] }>('/agents')
  return data.agents
}

export async function fetchHooks(): Promise<HookInfo[]> {
  const data = await fetchJson<{ hooks: HookInfo[] }>('/hooks')
  return data.hooks
}

export async function fetchSkillDetail(id: string): Promise<SkillDetail> {
  return fetchJson<SkillDetail>(`/skills/${encodeURIComponent(id)}`)
}

export async function fetchSkillFile(id: string, filePath: string): Promise<string> {
  const data = await fetchJson<{ content: string }>(`/skills/${encodeURIComponent(id)}/files/${filePath}`)
  return data.content
}

export async function fetchAgentDetail(id: string): Promise<AgentDetail> {
  return fetchJson<AgentDetail>(`/agents/${encodeURIComponent(id)}`)
}

export async function deleteSkill(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/skills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function deleteAgent(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function deleteHook(event: string): Promise<void> {
  const response = await fetch(`${API_BASE}/hooks/${encodeURIComponent(event)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function fetchPlugins(): Promise<PluginInfo[]> {
  const data = await fetchJson<{ plugins: PluginInfo[] }>('/plugins')
  return data.plugins
}

export async function installPlugin(name: string): Promise<void> {
  const response = await fetch(`${API_BASE}/plugins/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function uninstallPlugin(name: string): Promise<void> {
  const response = await fetch(`${API_BASE}/plugins/uninstall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function enablePlugin(name: string): Promise<void> {
  const response = await fetch(`${API_BASE}/plugins/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function disablePlugin(name: string): Promise<void> {
  const response = await fetch(`${API_BASE}/plugins/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function fetchMarketplaces(): Promise<MarketplaceInfo[]> {
  const data = await fetchJson<{ marketplaces: MarketplaceInfo[] }>('/marketplaces')
  return data.marketplaces
}

export async function addMarketplace(url: string): Promise<void> {
  const response = await fetch(`${API_BASE}/marketplaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function fetchPluginDetail(name: string): Promise<PluginDetail> {
  return fetchJson<PluginDetail>(`/plugins/${encodeURIComponent(name)}/details`)
}

export async function fetchPluginFile(name: string, filePath: string): Promise<string> {
  const data = await fetchJson<{ content: string }>(`/plugins/${encodeURIComponent(name)}/files/${filePath}`)
  return data.content
}

export async function removeMarketplace(name: string): Promise<void> {
  const response = await fetch(`${API_BASE}/marketplaces/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function refreshMarketplaces(): Promise<void> {
  const response = await fetch(`${API_BASE}/marketplaces/refresh`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

// --- Plugin Credentials ---

export async function fetchPluginCredentials(name: string): Promise<PluginCredentialStatus> {
  return fetchJson<PluginCredentialStatus>(`/plugins/${encodeURIComponent(name)}/credentials`)
}

export async function savePluginCredential(name: string, key: string, value: string): Promise<{ ok: boolean }> {
  const response = await fetch(`${API_BASE}/plugins/${encodeURIComponent(name)}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export async function deletePluginCredential(name: string, key: string): Promise<{ ok: boolean }> {
  const response = await fetch(`${API_BASE}/plugins/${encodeURIComponent(name)}/credentials/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

// --- Session summaries ---

export async function fetchSessions(limit = 20): Promise<SessionSummary[]> {
  const data = await fetchJson<{ sessions: SessionSummary[] }>(`/sessions?limit=${limit}`)
  return data.sessions
}

export async function dismissSession(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

// --- Superbot skills ---

export async function fetchSuperbotSkills(): Promise<SuperbotSkill[]> {
  const data = await fetchJson<{ skills: SuperbotSkill[] }>('/superbot-skills')
  return data.skills
}

export async function fetchSuperbotSkillDetail(id: string): Promise<SuperbotSkillDetail> {
  return fetchJson<SuperbotSkillDetail>(`/superbot-skills/${encodeURIComponent(id)}`)
}

export async function fetchSuperbotSkillFile(id: string, filePath: string): Promise<string> {
  const data = await fetchJson<{ content: string }>(`/superbot-skills/${encodeURIComponent(id)}/files/${filePath}`)
  return data.content
}

export async function deleteSuperbotSkill(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/superbot-skills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}

export async function toggleSuperbotSkill(id: string): Promise<{ enabled: boolean }> {
  const response = await fetch(`${API_BASE}/superbot-skills/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export async function toggleHook(event: string): Promise<{ enabled: boolean }> {
  const response = await fetch(`${API_BASE}/hooks/${encodeURIComponent(event)}/toggle`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export interface HookTestResult {
  event: string
  command: string
  input: Record<string, unknown>
  result: {
    exitCode: number
    stdout: string
    stderr: string
    timedOut: boolean
  }
}

export async function testHook(event: string, input?: Record<string, unknown>): Promise<HookTestResult> {
  const response = await fetch(`${API_BASE}/hooks/${encodeURIComponent(event)}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ? { input } : {}),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

export async function toggleAgent(id: string): Promise<{ enabled: boolean }> {
  const response = await fetch(`${API_BASE}/agents/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

// --- All Tasks (cross-space) ---

export interface CrossSpaceTask extends Task {
  space: string
  spaceName: string
  project: string
}

export async function fetchAllTasks(params?: {
  status?: string
  space?: string
  project?: string
}): Promise<CrossSpaceTask[]> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.space) qs.set('space', params.space)
  if (params?.project) qs.set('project', params.project)
  const url = `/all-tasks${qs.toString() ? `?${qs}` : ''}`
  const data = await fetchJson<{ tasks: CrossSpaceTask[] }>(url)
  return data.tasks
}

// --- Messages to orchestrator ---

export async function fetchMessages(background = false): Promise<InboxMessage[]> {
  const url = background ? '/messages?background=true' : '/messages'
  const data = await fetchJson<{ messages: InboxMessage[] }>(url)
  return data.messages
}

export async function sendMessageToOrchestrator(text: string): Promise<{ ok: boolean }> {
  const response = await fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

// --- Self-Improvement ---

export interface SelfImprovementStatus {
  running: boolean
}

export interface AnalysisSnapshotSummary {
  id: string
  timestamp: string
  daysAnalyzed: number
  stats: {
    total: number
    byCategory: Record<string, number>
    byPriority: Record<string, number>
    escalationsCreated: number
    duplicatesSkipped: number
  }
}

export async function runSelfImprovement(days = 30): Promise<{ status: string; days: number }> {
  const response = await fetch(`${API_BASE}/self-improvement/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  })
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function fetchSelfImprovementStatus(): Promise<SelfImprovementStatus> {
  return fetchJson<SelfImprovementStatus>('/self-improvement/status')
}

export async function fetchAnalysisHistory(): Promise<AnalysisSnapshotSummary[]> {
  return fetchJson<AnalysisSnapshotSummary[]>('/self-improvement/history')
}

// --- Dashboard config ---

export async function fetchDashboardConfig(): Promise<DashboardConfig> {
  const data = await fetchJson<{ config: DashboardConfig }>('/dashboard-config')
  return data.config
}

export async function saveDashboardConfig(config: DashboardConfig): Promise<DashboardConfig> {
  const response = await fetch(`${API_BASE}/dashboard-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  const data = await response.json()
  return data.config
}

// --- Todos ---

export async function fetchTodos(): Promise<TodoItem[]> {
  const data = await fetchJson<{ todos: TodoItem[] }>('/todos')
  return data.todos
}

export async function addTodo(text: string): Promise<TodoItem> {
  const response = await fetch(`${API_BASE}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  const data = await response.json()
  return data.todo
}

export async function updateTodo(id: string, updates: { text?: string; completed?: boolean }): Promise<TodoItem> {
  const response = await fetch(`${API_BASE}/todos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  const data = await response.json()
  return data.todo
}

export async function deleteTodo(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/todos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
}
