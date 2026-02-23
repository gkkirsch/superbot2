export interface ContextFile {
  content: string
  exists: boolean
}

export interface TaskCounts {
  pending: number
  in_progress: number
  completed: number
  total: number
}

export interface SpaceOverview {
  name: string
  slug: string
  status: string
  projects: string[]
  taskCounts: TaskCounts
  projectTaskCounts?: Record<string, TaskCounts>
  projectCreatedAt?: Record<string, string>
  escalationCount: number
  lastUpdated: string | null
  hasDevServer?: boolean
  hasDeploy?: boolean
  prodUrl?: string | null
}

export interface SpaceDetail {
  space: SpaceOverview
  overview: { content: string; exists: boolean }
  projects: string[]
}

export interface Task {
  id: string
  subject: string
  description: string
  acceptanceCriteria: string[]
  status: 'pending' | 'in_progress' | 'completed'
  assignedTo: string | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  labels: string[]
  blocks: string[]
  blockedBy: string[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  completionNotes: string | null
}

export interface ProjectDocument {
  name: string
  content: string
  exists: boolean
}

export interface EscalationAnswer {
  label: string
  description: string
}

export interface ScheduledJob {
  name: string
  time: string
  days?: string[]
  task: string
  space?: string
}

export interface ScheduleData {
  schedule: ScheduledJob[]
  lastRun: Record<string, string>
  schedulerRunning: boolean
}

export interface ActivityBucket {
  ts: string
  tools: number
  messages: number
  sessions: number
  skills: string[]
  subagents?: string[]
}

// --- Skills page types ---

export interface SkillInfo {
  id: string
  name: string
  description: string
  fileCount: number
  source?: 'user' | 'plugin'
  pluginId?: string
  pluginName?: string
  needsConfig?: boolean
}

export interface AgentInfo {
  id: string
  name: string
  description: string
  model: string
  source?: 'user' | 'plugin'
  pluginId?: string
  pluginName?: string
  enabled?: boolean
}

export interface HookInfo {
  event: string
  command: string
  description?: string
  enabled?: boolean
}

export interface ComponentCounts {
  commands: number
  skills: number
  agents: number
  hooks: number
}

export interface SkillDetail extends SkillInfo {
  fullContent: string
  files: string[]
}

export interface AgentDetail extends AgentInfo {
  fullContent: string
}

export interface PluginInfo {
  pluginId: string
  name: string
  description: string
  version?: string
  marketplaceName?: string
  installed: boolean
  enabled?: boolean
  componentCounts?: ComponentCounts | null
  keywords?: string[]
  hasUnconfiguredCredentials?: boolean
}

export interface CredentialDeclaration {
  key: string
  label: string
  description?: string
  required?: boolean
}

export interface PluginCredentialStatus {
  credentials: CredentialDeclaration[]
  configured: Record<string, boolean>
}

export interface MarketplaceInfo {
  name: string
  url: string
}

export interface PluginComponent {
  name: string
  file: string
}

export interface PluginDetail {
  pluginId: string
  name: string
  description: string
  version: string
  author: { name: string; email?: string } | null
  license: string
  repository: string
  components: {
    commands: PluginComponent[]
    agents: PluginComponent[]
    skills: PluginComponent[]
    hooks: PluginComponent[]
    mcpServers: PluginComponent[]
    lspServers: PluginComponent[]
  }
  files: string[]
  hasReadme: boolean
}

// --- Session summaries ---

export interface SessionSummary {
  id: string
  space: string
  project: string
  summary: string
  filesChanged: string[]
  completedAt: string
  worker?: string
}

// --- Superbot skills ---

export interface SuperbotSkill {
  id: string
  name: string
  description: string
  enabled?: boolean
}

export interface SuperbotSkillDetail extends SuperbotSkill {
  fullContent: string
  files: string[]
}

export interface InboxMessage {
  from: string
  to?: string
  text: string
  summary?: string
  timestamp: string
  read: boolean
  type?: string
  metadata?: Record<string, unknown>
}

export interface TodoNote {
  content: string
  createdAt: string
  author: string
}

export interface TodoItem {
  id: string
  text: string
  completed: boolean
  notes?: TodoNote[]
}

export interface ActiveWorker {
  name: string
  space: string
  project?: string | null
  runtimeSeconds?: number
  runtimeDisplay?: string
  agentId?: string
}

export interface DashboardConfig {
  leftColumn: string[]
  centerColumn: string[]
  rightColumn: string[]
  hidden: string[]
}

export interface KnowledgeFile {
  name: string
  path: string
}

export interface KnowledgeGroup {
  source: string
  label: string
  files: KnowledgeFile[]
}

export interface Escalation {
  id: string
  type: 'decision' | 'blocker' | 'question' | 'approval' | 'improvement' | 'agent_plan'
  space: string
  spaceName?: string
  project: string
  question: string
  context: string
  suggestedAnswers: EscalationAnswer[]
  priority: 'critical' | 'high' | 'medium' | 'low'
  blocksTask: string | null
  blocksProject: boolean
  escalatedBy: string
  status: 'untriaged' | 'needs_human' | 'resolved'
  resolution: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  acknowledgedAt?: string | null
  dismissedAt?: string | null
  createdAt: string
}
