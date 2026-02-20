import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import yaml from 'js-yaml'
import { Blocks, Sparkles, Bot, Webhook, Puzzle, Download, Trash2, Loader2, X, Terminal, BookOpen, Cpu, FileText, ChevronRight, ChevronDown, Search, Plus, Store, RefreshCw, Key, Check, AlertTriangle } from 'lucide-react'
import { useSkills, useAgents, useHooks, usePlugins, useMarketplaces, usePluginCredentials } from '@/hooks/useSpaces'
import { installPlugin, uninstallPlugin, enablePlugin, disablePlugin, fetchPluginDetail, fetchPluginFile, fetchSkillDetail, fetchSkillFile, fetchAgentDetail, deleteSkill, deleteAgent, deleteHook, addMarketplace, removeMarketplace, refreshMarketplaces, savePluginCredential, deletePluginCredential } from '@/lib/api'
import type { PluginInfo, PluginDetail, PluginComponent, SkillInfo, AgentInfo, HookInfo, AgentDetail, CredentialDeclaration } from '@/lib/types'
import { SkillDetailModal } from '@/components/SkillDetailModal'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function titleCase(name: string) {
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Map granular tags → broad categories for filtering
const TAG_TO_CATEGORY: Record<string, string> = {
  design: 'Design', ui: 'Design', ux: 'Design', css: 'Design', html: 'Design',
  frontend: 'Design', styles: 'Design', tailwind: 'Design', fonts: 'Design',
  colors: 'Design', 'color-palette': 'Design', typography: 'Design', theming: 'Design',
  aesthetic: 'Design', aesthetics: 'Design', shadcn: 'Design', components: 'Design',
  charts: 'Design', 'landing-page': 'Design', 'web-design': 'Design', ecommerce: 'Design',
  ai: 'AI', ml: 'AI', 'prompt-engineering': 'AI', rag: 'AI', chunking: 'AI',
  langchain: 'AI', agent: 'AI', agents: 'AI', anthropic: 'AI',
  debugging: 'Development', 'code-review': 'Development', tdd: 'Development',
  testing: 'Development', refactoring: 'Development', typescript: 'Development',
  react: 'Development', express: 'Development', prisma: 'Development',
  fullstack: 'Development', monorepo: 'Development', sdk: 'Development', scaffold: 'Development',
  images: 'Media', doodle: 'Media', illustrations: 'Media', 'line-art': 'Media', 'image-generation': 'Media',
  automation: 'Workflow', workflow: 'Workflow', workflows: 'Workflow',
  hooks: 'Workflow', mcp: 'Workflow', collaboration: 'Workflow', skills: 'Workflow',
  documentation: 'Docs', context: 'Docs', memory: 'Docs', persistence: 'Docs',
  security: 'Security', accessibility: 'Security', 'best-practices': 'Security',
}

// Infer category from plugin name and description when keywords are empty
const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/twitter|tweet|x[\s/-]research|x[\s/-]api|social.*(media|content)|engagement|posting/i, 'Social Media'],
  [/google.*(workspace|suite|docs|sheets|drive|gmail)|google-workspace/i, 'Google Suite'],
  [/seo|search engine|ranking|backlink|sitemap/i, 'Marketing'],
  [/email.*(sequence|campaign|drip|marketing|best.practices)|bounce.rate|deliverability/i, 'Marketing'],
  [/pricing|monetiz|conversion|a\/b.test|ab.test|cro|popup|overlay|modal/i, 'Marketing'],
  [/video|veo|avatar|talking.head|animation/i, 'Video'],
  [/scraping|scrape|crawl|extract.*data/i, 'Scraping'],
  [/browser.*auto|puppeteer|playwright|selenium|headless/i, 'Developer Tools'],
  [/pdf|document/i, 'Developer Tools'],
  [/skill.creator|scaffold|boilerplate|template/i, 'Developer Tools'],
  [/debug|test|lint|format|refactor|code.review/i, 'Developer Tools'],
]

function getPluginCategories(keywords: string[], name?: string, description?: string): string[] {
  const cats = new Set<string>()
  // Check keywords first
  for (const k of keywords) {
    const cat = TAG_TO_CATEGORY[k]
    if (cat) cats.add(cat)
  }
  // If no keyword matches, infer from name + description
  if (cats.size === 0 && (name || description)) {
    const text = `${name || ''} ${description || ''}`
    for (const [pattern, category] of CATEGORY_PATTERNS) {
      if (pattern.test(text)) {
        cats.add(category)
      }
    }
  }
  return Array.from(cats)
}

// --- Plugin Detail Modal (shared) ---

function ComponentList({ icon: Icon, label, items, onFileClick }: {
  icon: React.ElementType
  label: string
  items: PluginComponent[]
  onFileClick: (file: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-sand" />
        <span className="text-xs font-medium text-sand uppercase tracking-wider">{label}</span>
        <span className="text-xs text-stone">({items.length})</span>
      </div>
      <div className="space-y-1">
        {items.map(item => (
          <button
            key={item.file}
            onClick={() => onFileClick(item.file)}
            className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md bg-ink/50 hover:bg-ink transition-colors group"
          >
            <span className="text-sm text-parchment">{item.name}</span>
            <ChevronRight className="h-3 w-3 text-stone/40 group-hover:text-stone ml-auto" />
          </button>
        ))}
      </div>
    </div>
  )
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, any> | null; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { frontmatter: null, body: raw }
  try {
    const fm = yaml.load(match[1]) as Record<string, any> | null
    return { frontmatter: fm || {}, body: raw.slice(match[0].length) }
  } catch {
    return { frontmatter: null, body: raw }
  }
}

function FrontmatterBlock({ data }: { data: Record<string, any> }) {
  return (
    <div className="rounded-lg bg-ink border border-border-custom p-4 mb-4">
      <div className="grid gap-2">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-3">
            <span className="text-xs font-mono text-sand shrink-0 min-w-[120px]">{key}</span>
            <span className="text-xs text-parchment">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FileViewer({ pluginName, filePath, onBack }: { pluginName: string; filePath: string; onBack: () => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchPluginFile(pluginName, filePath)
      .then(setContent)
      .catch(() => setContent('Failed to load file.'))
      .finally(() => setLoading(false))
  }, [pluginName, filePath])

  const isMarkdown = filePath.endsWith('.md')
  const parsed = content && isMarkdown ? parseFrontmatter(content) : null

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-stone hover:text-parchment transition-colors mb-3 self-start"
      >
        <ChevronRight className="h-3 w-3 rotate-180" />
        Back
      </button>
      <div className="text-xs text-stone/60 font-mono mb-3">{filePath}</div>
      <div className="flex-1 overflow-auto rounded-lg bg-ink/50 border border-border-custom p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-stone">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : isMarkdown ? (
          <>
            {parsed?.frontmatter && <FrontmatterBlock data={parsed.frontmatter} />}
            <div className="docs-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed?.body || content || ''}</ReactMarkdown>
            </div>
          </>
        ) : (
          <pre className="text-xs text-parchment font-mono whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  )
}

// --- Skill Detail Modal (uses shared component) ---

function SkillsPageSkillDetailModal({ skill, onClose }: { skill: SkillInfo; onClose: () => void }) {
  const [removing, setRemoving] = useState(false)
  const queryClient = useQueryClient()

  async function handleUninstall() {
    setRemoving(true)
    try {
      await deleteSkill(skill.id)
      await queryClient.invalidateQueries({ queryKey: ['skills'] })
      onClose()
    } finally {
      setRemoving(false)
    }
  }

  const fetchDetailCb = useCallback((id: string) => fetchSkillDetail(id), [])
  const fetchFileCb = useCallback((id: string, filePath: string) => fetchSkillFile(id, filePath), [])

  return (
    <SkillDetailModal
      skill={skill}
      onClose={onClose}
      fetchDetail={fetchDetailCb}
      fetchFile={fetchFileCb}
      headerActions={
        <button
          onClick={handleUninstall}
          disabled={removing}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-ember/15 text-ember hover:bg-ember/25 transition-colors disabled:opacity-50"
        >
          {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {removing ? 'Removing...' : 'Uninstall'}
        </button>
      }
    />
  )
}

// --- Agent Detail Modal ---

function AgentDetailModal({ agent, onClose }: { agent: AgentInfo; onClose: () => void }) {
  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    fetchAgentDetail(agent.id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [agent.id])

  async function handleRemove() {
    setRemoving(true)
    try {
      await deleteAgent(agent.id)
      await queryClient.invalidateQueries({ queryKey: ['agents'] })
      onClose()
    } finally {
      setRemoving(false)
    }
  }

  const parsed = detail?.fullContent ? parseFrontmatter(detail.fullContent) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0">
            <h2 className="font-heading text-xl text-parchment">{agent.name}</h2>
            {agent.description && <p className="text-sm text-stone mt-1">{agent.description}</p>}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-stone/60">model: {agent.model}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-ember/15 text-ember hover:bg-ember/25 transition-colors disabled:opacity-50"
            >
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {removing ? 'Removing...' : 'Remove'}
            </button>
            <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-stone" />
            </div>
          ) : (
            <div className="space-y-6">
              {parsed?.frontmatter && <FrontmatterBlock data={parsed.frontmatter} />}
              {parsed?.body ? (
                <div className="docs-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.body}</ReactMarkdown>
                </div>
              ) : detail?.fullContent ? (
                <pre className="text-xs text-parchment font-mono whitespace-pre-wrap rounded-lg bg-ink/50 border border-border-custom p-4">{detail.fullContent}</pre>
              ) : (
                <p className="text-sm text-stone">No content available.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Hook Detail Modal ---

function HookDetailModal({ hook, onClose }: { hook: HookInfo; onClose: () => void }) {
  const [removing, setRemoving] = useState(false)
  const queryClient = useQueryClient()

  async function handleRemove() {
    setRemoving(true)
    try {
      await deleteHook(hook.event)
      await queryClient.invalidateQueries({ queryKey: ['hooks'] })
      onClose()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0">
            <h2 className="font-heading text-xl text-parchment">{hook.event}</h2>
            <p className="text-sm text-stone mt-1">Hook event</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-ember/15 text-ember hover:bg-ember/25 transition-colors disabled:opacity-50"
            >
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {removing ? 'Removing...' : 'Remove'}
            </button>
            <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-4">
            <div className="rounded-lg bg-ink border border-border-custom p-4">
              <div className="grid gap-2">
                <div className="flex gap-3">
                  <span className="text-xs font-mono text-sand shrink-0 min-w-[120px]">event</span>
                  <span className="text-xs text-parchment">{hook.event}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs font-mono text-sand shrink-0 min-w-[120px]">command</span>
                  <span className="text-xs text-parchment font-mono">{hook.command}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CredentialForm({ pluginName }: { pluginName: string }) {
  const { data: credStatus, refetch } = usePluginCredentials(pluginName)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback] = useState<Record<string, { type: 'saved' | 'validated' | 'invalid' | 'error'; message?: string } | null>>({})
  const queryClient = useQueryClient()

  if (!credStatus || credStatus.credentials.length === 0) return null

  async function handleSave(cred: CredentialDeclaration) {
    const val = values[cred.key]
    if (!val?.trim()) return
    setSaving(s => ({ ...s, [cred.key]: true }))
    setFeedback(f => ({ ...f, [cred.key]: null }))
    try {
      const result = await savePluginCredential(pluginName, cred.key, val.trim())
      if (result.validation) {
        if (result.validation.valid) {
          setFeedback(f => ({ ...f, [cred.key]: { type: 'validated' } }))
        } else {
          setFeedback(f => ({ ...f, [cred.key]: { type: 'invalid', message: result.validation!.error } }))
        }
      } else {
        setFeedback(f => ({ ...f, [cred.key]: { type: 'saved' } }))
      }
      setValues(v => ({ ...v, [cred.key]: '' }))
      refetch()
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      setTimeout(() => setFeedback(f => ({ ...f, [cred.key]: null })), 5000)
    } catch {
      setFeedback(f => ({ ...f, [cred.key]: { type: 'error' } }))
    } finally {
      setSaving(s => ({ ...s, [cred.key]: false }))
    }
  }

  async function handleDelete(cred: CredentialDeclaration) {
    setSaving(s => ({ ...s, [cred.key]: true }))
    try {
      await deletePluginCredential(pluginName, cred.key)
      refetch()
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    } catch {
      setFeedback(f => ({ ...f, [cred.key]: 'error' }))
    } finally {
      setSaving(s => ({ ...s, [cred.key]: false }))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Key className="h-3.5 w-3.5 text-sand" />
        <span className="text-xs font-medium text-parchment">Credentials</span>
      </div>
      {credStatus.credentials.map(cred => {
        const isConfigured = credStatus.configured[cred.key]
        return (
          <div key={cred.key} className="rounded-lg bg-ink border border-border-custom p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-parchment">{cred.label || cred.key}</span>
                {cred.required && <span className="text-[10px] text-ember/70">required</span>}
              </div>
              {isConfigured ? (
                <span className="flex items-center gap-1 text-[10px] text-green-400">
                  <Check className="h-3 w-3" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> Not configured
                </span>
              )}
            </div>
            {cred.description && <p className="text-[11px] text-stone mb-2">{cred.description}</p>}
            <div className="flex gap-2">
              <input
                type="password"
                value={values[cred.key] || ''}
                onChange={e => setValues(v => ({ ...v, [cred.key]: e.target.value }))}
                placeholder={isConfigured ? '••••••••' : 'Enter value...'}
                className="flex-1 px-2.5 py-1.5 text-xs bg-surface border border-border-custom rounded-md text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
              />
              <button
                onClick={() => handleSave(cred)}
                disabled={saving[cred.key] || !values[cred.key]?.trim()}
                className="px-3 py-1.5 text-xs rounded-md bg-sand/15 text-sand hover:bg-sand/25 transition-colors disabled:opacity-40"
              >
                {saving[cred.key] ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
              </button>
              {isConfigured && (
                <button
                  onClick={() => handleDelete(cred)}
                  disabled={saving[cred.key]}
                  className="px-2 py-1.5 text-xs rounded-md text-ember/70 hover:bg-ember/10 transition-colors disabled:opacity-40"
                >
                  Clear
                </button>
              )}
            </div>
            {feedback[cred.key]?.type === 'validated' && <p className="text-[10px] text-green-400 mt-1">Saved to Keychain — key verified</p>}
            {feedback[cred.key]?.type === 'saved' && <p className="text-[10px] text-green-400 mt-1">Saved to Keychain</p>}
            {feedback[cred.key]?.type === 'invalid' && <p className="text-[10px] text-amber-400 mt-1">Saved to Keychain — key appears invalid{feedback[cred.key]!.message ? `: ${feedback[cred.key]!.message}` : ''}</p>}
            {feedback[cred.key]?.type === 'error' && <p className="text-[10px] text-ember mt-1">Failed to save</p>}
          </div>
        )
      })}
    </div>
  )
}

function PluginDetailModal({ plugin, onClose }: { plugin: PluginInfo; onClose: () => void }) {
  const [detail, setDetail] = useState<PluginDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewingFile, setViewingFile] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [uninstalling, setUninstalling] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    fetchPluginDetail(plugin.name)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [plugin.name])

  async function handleInstall() {
    setInstalling(true)
    try {
      await installPlugin(plugin.pluginId)
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    } finally {
      setInstalling(false)
    }
  }

  async function handleUninstall() {
    setUninstalling(true)
    try {
      await uninstallPlugin(plugin.name)
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
      onClose()
    } finally {
      setUninstalling(false)
    }
  }

  const c = detail?.components

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0">
            <h2 className="font-heading text-xl text-parchment">{titleCase(plugin.name)}</h2>
            {plugin.description && <p className="text-sm text-stone mt-1">{plugin.description}</p>}
            <div className="flex items-center gap-3 mt-2">
              {plugin.version && <span className="text-xs text-stone/60">v{plugin.version}</span>}
              {detail?.author && <span className="text-xs text-stone/60">{detail.author.name}</span>}
              {detail?.license && <span className="text-xs text-stone/60">{detail.license}</span>}
            </div>
            {plugin.keywords && plugin.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {plugin.keywords.map(k => (
                  <span key={k} className="text-[10px] text-stone/60 bg-ink/60 px-1.5 py-0.5 rounded">{k}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {plugin.installed ? (
              <button
                onClick={handleUninstall}
                disabled={uninstalling}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-ember/15 text-ember hover:bg-ember/25 transition-colors disabled:opacity-50"
              >
                {uninstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {uninstalling ? 'Uninstalling...' : 'Uninstall'}
              </button>
            ) : (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-sand/15 text-sand hover:bg-sand/25 transition-colors disabled:opacity-50"
              >
                {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {installing ? 'Installing...' : 'Install'}
              </button>
            )}
            <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-stone" />
            </div>
          ) : viewingFile ? (
            <FileViewer pluginName={plugin.name} filePath={viewingFile} onBack={() => setViewingFile(null)} />
          ) : (
            <div className="space-y-6">
              {c && (c.commands.length > 0 || c.agents.length > 0 || c.skills.length > 0 || c.hooks.length > 0) ? (
                <div className="space-y-4">
                  <ComponentList icon={Terminal} label="Commands" items={c.commands} onFileClick={setViewingFile} />
                  <ComponentList icon={Bot} label="Agents" items={c.agents} onFileClick={setViewingFile} />
                  <ComponentList icon={Sparkles} label="Skills" items={c.skills} onFileClick={setViewingFile} />
                  <ComponentList icon={Webhook} label="Hooks" items={c.hooks} onFileClick={setViewingFile} />
                  <ComponentList icon={Cpu} label="MCP Servers" items={c.mcpServers} onFileClick={setViewingFile} />
                </div>
              ) : (
                <p className="text-sm text-stone">No component details available.</p>
              )}

              {plugin.installed && <CredentialForm pluginName={plugin.name} />}

              {detail?.hasReadme && (
                <button
                  onClick={() => setViewingFile('README.md')}
                  className="flex items-center gap-2 text-sm text-sand hover:text-sand/80 transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  View README
                </button>
              )}

              {detail?.files && detail.files.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="h-3.5 w-3.5 text-stone/60" />
                    <span className="text-xs text-stone/60">All files ({detail.files.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5">
                    {detail.files
                      .filter(f => !f.startsWith('.git') && !f.startsWith('.github'))
                      .map(f => (
                        <button
                          key={f}
                          onClick={() => setViewingFile(f)}
                          className="text-left text-xs font-mono text-stone hover:text-parchment px-2 py-1 rounded hover:bg-ink/50 transition-colors truncate"
                        >
                          {f}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Plugin Card (compact for available list) ---

function PluginCard({ plugin, onClick }: { plugin: PluginInfo; onClick: () => void }) {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  async function handleInstall(e: React.MouseEvent) {
    e.stopPropagation()
    setLoading(true)
    try {
      await installPlugin(plugin.pluginId)
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    } finally {
      setLoading(false)
    }
  }

  async function handleUninstall(e: React.MouseEvent) {
    e.stopPropagation()
    setLoading(true)
    try {
      await uninstallPlugin(plugin.name)
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    setLoading(true)
    try {
      if (plugin.enabled) {
        await disablePlugin(plugin.name)
      } else {
        await enablePlugin(plugin.name)
      }
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    } finally {
      setLoading(false)
    }
  }

  const cc = plugin.componentCounts

  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border-custom bg-surface/50 p-4 cursor-pointer hover:border-sand/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-parchment">{titleCase(plugin.name)}</p>
          <p className="text-xs text-stone mt-1 line-clamp-2">{plugin.description}</p>
          {cc && (cc.skills > 0 || cc.agents > 0 || cc.commands > 0 || cc.hooks > 0) && (
            <div className="flex items-center gap-2 mt-2">
              {cc.skills > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-stone/70">
                  <Sparkles className="h-2.5 w-2.5" />{cc.skills} skill{cc.skills > 1 ? 's' : ''}
                </span>
              )}
              {cc.agents > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-stone/70">
                  <Bot className="h-2.5 w-2.5" />{cc.agents} agent{cc.agents > 1 ? 's' : ''}
                </span>
              )}
              {cc.commands > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-stone/70">
                  <Terminal className="h-2.5 w-2.5" />{cc.commands} cmd{cc.commands > 1 ? 's' : ''}
                </span>
              )}
              {cc.hooks > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-stone/70">
                  <Webhook className="h-2.5 w-2.5" />{cc.hooks} hook{cc.hooks > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
          {plugin.marketplaceName && (
            <div className="flex items-center gap-1 mt-1.5">
              <Store className="h-2.5 w-2.5 text-stone/40" />
              <span className="text-[10px] text-stone/40">{plugin.marketplaceName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          {plugin.installed ? (
            <>
              <button
                onClick={handleToggle}
                disabled={loading}
                className={`relative w-9 h-5 rounded-full transition-colors ${plugin.enabled ? 'bg-moss' : 'bg-stone/30'}`}
                title={plugin.enabled ? 'Disable' : 'Enable'}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-parchment transition-transform ${plugin.enabled ? 'translate-x-4' : ''}`} />
              </button>
              <button
                onClick={handleUninstall}
                disabled={loading}
                className="p-1.5 text-stone hover:text-ember transition-colors disabled:opacity-50"
                title="Uninstall"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={handleInstall}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-sand/15 text-sand hover:bg-sand/25 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {loading ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Marketplace management ---

const SUPERCHARGE_MARKETPLACE_URL = 'https://superchargeclaudecode.com/api/marketplaces/supercharge-claude-code/marketplace.json'

function MarketplaceManager() {
  const { data: marketplaces, isLoading } = useMarketplaces()
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const queryClient = useQueryClient()

  // Auto-refresh marketplace data on mount
  useEffect(() => {
    let cancelled = false
    refreshMarketplaces()
      .then(() => {
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ['plugins'] })
          queryClient.invalidateQueries({ queryKey: ['marketplaces'] })
        }
      })
      .catch(() => {}) // silent — not critical
    return () => { cancelled = true }
  }, [queryClient])

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      await refreshMarketplaces()
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
      await queryClient.invalidateQueries({ queryKey: ['marketplaces'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh')
    } finally {
      setRefreshing(false)
    }
  }

  const hasSupercharge = marketplaces?.some(m =>
    m.url === SUPERCHARGE_MARKETPLACE_URL || m.name === 'supercharge-claude-code'
  ) ?? false

  async function doAdd(url: string) {
    setAdding(true)
    setError(null)
    try {
      await addMarketplace(url)
      await queryClient.invalidateQueries({ queryKey: ['marketplaces'] })
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
      setNewUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add marketplace')
    } finally {
      setAdding(false)
    }
  }

  async function handleAdd() {
    if (!newUrl.trim()) return
    await doAdd(newUrl.trim())
  }

  async function handleRemove(name: string) {
    setRemoving(name)
    setError(null)
    try {
      await removeMarketplace(name)
      await queryClient.invalidateQueries({ queryKey: ['marketplaces'] })
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove marketplace')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <Store className="h-3.5 w-3.5 text-sand" />
        <span className="text-xs font-medium text-sand uppercase tracking-wider">Marketplaces</span>
        {marketplaces && <span className="text-xs text-stone">({marketplaces.length})</span>}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="ml-auto p-1 text-stone hover:text-sand transition-colors disabled:opacity-50"
          title="Refresh marketplace plugins"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="h-8 rounded-md bg-surface/50 animate-pulse" />
      ) : marketplaces && marketplaces.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {marketplaces.map(m => (
            <div
              key={m.name}
              className="flex items-center justify-between gap-2 rounded-md border border-border-custom bg-surface/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-parchment truncate">{m.name}</p>
                <p className="text-[10px] text-stone/50 truncate">{m.url}</p>
              </div>
              <button
                onClick={() => handleRemove(m.name)}
                disabled={removing === m.name}
                className="p-1 text-stone hover:text-ember transition-colors disabled:opacity-50 shrink-0"
                title="Remove marketplace"
              >
                {removing === m.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Quick-add Supercharge marketplace */}
      {!isLoading && !hasSupercharge && (
        <button
          onClick={() => doAdd(SUPERCHARGE_MARKETPLACE_URL)}
          disabled={adding}
          className="w-full flex items-center gap-2 rounded-md border border-sand/20 bg-sand/5 px-3 py-2.5 mb-3 hover:bg-sand/10 transition-colors disabled:opacity-50 text-left"
        >
          <Store className="h-3.5 w-3.5 text-sand shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-parchment">Supercharge Claude Code</p>
            <p className="text-[10px] text-stone/50">Add the official plugin marketplace</p>
          </div>
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sand shrink-0" /> : <Plus className="h-3.5 w-3.5 text-sand shrink-0" />}
        </button>
      )}

      {error && (
        <p className="text-xs text-ember mb-2">{error}</p>
      )}

      <div className="flex gap-1.5">
        <input
          type="text"
          value={newUrl}
          onChange={e => { setNewUrl(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="https://example.com/marketplace.json"
          className="flex-1 min-w-0 bg-ink border border-border-custom rounded-md px-2.5 py-1.5 text-xs text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/50"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newUrl.trim()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-sand/15 text-sand hover:bg-sand/25 transition-colors disabled:opacity-50 shrink-0"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </button>
      </div>

      {!isLoading && (!marketplaces || marketplaces.length === 0) && !error && (
        <p className="text-[10px] text-stone/40 mt-1.5">Add a marketplace to browse and install plugins</p>
      )}
    </div>
  )
}

// --- Left sidebar: Installed ---

function InstalledSidebar() {
  const { data: skills, isLoading: skillsLoading } = useSkills()
  const { data: agents, isLoading: agentsLoading } = useAgents()
  const { data: hooks, isLoading: hooksLoading } = useHooks()
  const { data: plugins } = usePlugins()

  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null)
  const [selectedHook, setSelectedHook] = useState<HookInfo | null>(null)
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null)
  const [expandedPluginSkills, setExpandedPluginSkills] = useState<Set<string>>(new Set())
  const [expandedPluginAgents, setExpandedPluginAgents] = useState<Set<string>>(new Set())

  const installedPlugins = plugins?.filter(p => p.installed) ?? []

  // Split skills into user vs plugin-grouped
  const userSkills = useMemo(() => skills?.filter(s => s.source !== 'plugin') ?? [], [skills])
  const pluginSkillGroups = useMemo(() => {
    const groups = new Map<string, SkillInfo[]>()
    for (const s of (skills ?? [])) {
      if (s.source === 'plugin' && s.pluginName) {
        const existing = groups.get(s.pluginName) || []
        existing.push(s)
        groups.set(s.pluginName, existing)
      }
    }
    return groups
  }, [skills])

  // Split agents into user vs plugin-grouped
  const userAgents = useMemo(() => agents?.filter(a => a.source !== 'plugin') ?? [], [agents])
  const pluginAgentGroups = useMemo(() => {
    const groups = new Map<string, AgentInfo[]>()
    for (const a of (agents ?? [])) {
      if (a.source === 'plugin' && a.pluginName) {
        const existing = groups.get(a.pluginName) || []
        existing.push(a)
        groups.set(a.pluginName, existing)
      }
    }
    return groups
  }, [agents])

  return (
    <div className="space-y-6">
      {/* Marketplace management */}
      <MarketplaceManager />

      {/* Installed plugins */}
      {installedPlugins.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Puzzle className="h-3.5 w-3.5 text-moss" />
            <span className="text-xs font-medium text-moss uppercase tracking-wider">Installed Plugins</span>
            <span className="text-xs text-stone">({installedPlugins.length})</span>
          </div>
          <div className="space-y-1.5">
            {installedPlugins.map(p => (
              <button
                key={p.pluginId}
                onClick={() => setSelectedPlugin(p)}
                className="w-full text-left rounded-md border-l-2 border-l-moss border border-moss/20 bg-moss/5 px-3 py-2 flex items-center justify-between gap-2 hover:bg-moss/10 transition-colors cursor-pointer"
              >
                <span className="text-xs font-medium text-parchment truncate">{titleCase(p.name || p.pluginId)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {p.hasUnconfiguredCredentials && (
                    <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Needs configuration" />
                  )}
                  <span className="text-[10px] text-moss/70">Installed</span>
                  <ChevronRight className="h-3 w-3 text-stone/40" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="h-3.5 w-3.5 text-moss" />
          <span className="text-xs font-medium text-moss uppercase tracking-wider">Skills</span>
          {skills && <span className="text-xs text-stone">({skills.length})</span>}
        </div>
        {skillsLoading ? (
          <div className="space-y-1.5">
            {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-md bg-surface/50 animate-pulse" />)}
          </div>
        ) : skills?.length === 0 ? (
          <p className="text-xs text-stone">No skills installed.</p>
        ) : (
          <div className="space-y-1.5">
            {/* User-created skills (not from plugins) */}
            {userSkills.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSkill(s)}
                className="w-full text-left rounded-md border-l-2 border-l-moss border border-moss/20 bg-moss/5 px-3 py-2 hover:bg-moss/10 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-parchment truncate">{s.name}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-moss/70">Installed</span>
                    <ChevronRight className="h-3 w-3 text-stone/40" />
                  </div>
                </div>
              </button>
            ))}
            {/* Plugin-provided skills, grouped by plugin */}
            {Array.from(pluginSkillGroups.entries()).map(([pluginName, pluginSkills]) => {
              const isExpanded = expandedPluginSkills.has(pluginName)
              const groupNeedsConfig = pluginSkills.some(s => s.needsConfig)
              return (
                <div key={pluginName}>
                  <button
                    onClick={() => setExpandedPluginSkills(prev => {
                      const next = new Set(prev)
                      if (next.has(pluginName)) next.delete(pluginName)
                      else next.add(pluginName)
                      return next
                    })}
                    className="w-full text-left rounded-md border border-moss/20 bg-moss/5 px-3 py-2 hover:bg-moss/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Puzzle className="h-3 w-3 text-moss/60 shrink-0" />
                        <span className="text-xs font-medium text-parchment truncate">{titleCase(pluginName)}</span>
                        <span className="text-[10px] text-stone/50">({pluginSkills.length})</span>
                        {groupNeedsConfig && <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Needs configuration" />}
                      </div>
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3 text-stone/40 shrink-0" />
                        : <ChevronRight className="h-3 w-3 text-stone/40 shrink-0" />
                      }
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="ml-3 mt-1 space-y-1 border-l border-moss/15 pl-2">
                      {pluginSkills.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSkill(s)}
                          className="w-full text-left rounded-md bg-moss/5 px-3 py-1.5 hover:bg-moss/10 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-parchment truncate">{s.name}</p>
                            <ChevronRight className="h-3 w-3 text-stone/40 shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Agents */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Bot className="h-3.5 w-3.5 text-moss" />
          <span className="text-xs font-medium text-moss uppercase tracking-wider">Agents</span>
          {agents && <span className="text-xs text-stone">({agents.length})</span>}
        </div>
        {agentsLoading ? (
          <div className="h-10 rounded-md bg-surface/50 animate-pulse" />
        ) : agents?.length === 0 ? (
          <p className="text-xs text-stone">No agents configured.</p>
        ) : (
          <div className="space-y-1.5">
            {/* User-created agents */}
            {userAgents.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a)}
                className="w-full text-left rounded-md border-l-2 border-l-moss border border-moss/20 bg-moss/5 px-3 py-2 hover:bg-moss/10 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-parchment truncate">{a.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-moss/70">Installed</span>
                    <ChevronRight className="h-3 w-3 text-stone/40" />
                  </div>
                </div>
              </button>
            ))}
            {/* Plugin-provided agents, grouped by plugin */}
            {Array.from(pluginAgentGroups.entries()).map(([pluginName, pluginAgents]) => {
              const isExpanded = expandedPluginAgents.has(pluginName)
              return (
                <div key={pluginName}>
                  <button
                    onClick={() => setExpandedPluginAgents(prev => {
                      const next = new Set(prev)
                      if (next.has(pluginName)) next.delete(pluginName)
                      else next.add(pluginName)
                      return next
                    })}
                    className="w-full text-left rounded-md border border-moss/20 bg-moss/5 px-3 py-2 hover:bg-moss/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Puzzle className="h-3 w-3 text-moss/60 shrink-0" />
                        <span className="text-xs font-medium text-parchment truncate">{titleCase(pluginName)}</span>
                        <span className="text-[10px] text-stone/50">({pluginAgents.length})</span>
                      </div>
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3 text-stone/40 shrink-0" />
                        : <ChevronRight className="h-3 w-3 text-stone/40 shrink-0" />
                      }
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="ml-3 mt-1 space-y-1 border-l border-moss/15 pl-2">
                      {pluginAgents.map(a => (
                        <button
                          key={a.id}
                          onClick={() => setSelectedAgent(a)}
                          className="w-full text-left rounded-md bg-moss/5 px-3 py-1.5 hover:bg-moss/10 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-parchment truncate">{a.name}</span>
                            <ChevronRight className="h-3 w-3 text-stone/40 shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Hooks */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Webhook className="h-3.5 w-3.5 text-moss" />
          <span className="text-xs font-medium text-moss uppercase tracking-wider">Hooks</span>
          {hooks && <span className="text-xs text-stone">({hooks.length})</span>}
        </div>
        {hooksLoading ? (
          <div className="h-10 rounded-md bg-surface/50 animate-pulse" />
        ) : hooks?.length === 0 ? (
          <p className="text-xs text-stone">No hooks configured.</p>
        ) : (
          <div className="space-y-1.5">
            {hooks?.map((h, i) => (
              <button
                key={`${h.event}-${i}`}
                onClick={() => setSelectedHook(h)}
                className="w-full text-left rounded-md border-l-2 border-l-moss border border-moss/20 bg-moss/5 px-3 py-2 flex items-center justify-between gap-2 hover:bg-moss/10 transition-colors cursor-pointer"
              >
                <p className="text-xs font-medium text-parchment truncate">{h.event}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-moss/70">Installed</span>
                  <ChevronRight className="h-3 w-3 text-stone/40" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedSkill && <SkillsPageSkillDetailModal skill={selectedSkill} onClose={() => setSelectedSkill(null)} />}
      {selectedAgent && <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}
      {selectedHook && <HookDetailModal hook={selectedHook} onClose={() => setSelectedHook(null)} />}
      {selectedPlugin && <PluginDetailModal plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />}
    </div>
  )
}

// --- Right column: Browse plugins ---

function BrowsePlugins() {
  const { data: plugins, isLoading } = usePlugins()
  const [search, setSearch] = useState('')
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeMarketplace, setActiveMarketplace] = useState<string | null>(null)

  const available = plugins?.filter(p => !p.installed) ?? []
  const installed = plugins?.filter(p => p.installed) ?? []

  // Collect all unique marketplace names
  const allMarketplaces = useMemo(() => {
    const set = new Set<string>()
    for (const p of available) {
      if (p.marketplaceName) set.add(p.marketplaceName)
    }
    return Array.from(set).sort()
  }, [available])

  // Derive broad categories from tags
  const allCategories = useMemo(() => {
    const catSet = new Set<string>()
    for (const p of available) {
      for (const cat of getPluginCategories(p.keywords || [], p.name, p.description)) {
        catSet.add(cat)
      }
    }
    return Array.from(catSet).sort()
  }, [available])

  const filtered = useMemo(() => {
    let result = available
    if (activeMarketplace) {
      result = result.filter(p => p.marketplaceName === activeMarketplace)
    }
    if (activeCategory) {
      result = result.filter(p => {
        const cats = getPluginCategories(p.keywords || [], p.name, p.description)
        return cats.includes(activeCategory)
      })
    }
    const q = search.toLowerCase()
    if (q) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.keywords || []).some(k => k.toLowerCase().includes(q))
      )
    }
    return result
  }, [available, search, activeCategory, activeMarketplace])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-sand" />
          <h2 className="font-heading text-lg text-parchment">Browse Skills / Plugins</h2>
          <span className="text-xs text-stone bg-surface px-2 py-0.5 rounded-full">{available.length}</span>
        </div>
        {installed.length > 0 && (
          <span className="text-xs text-moss">{installed.length} installed</span>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone/50" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search plugins..."
          className="w-full bg-surface border border-border-custom rounded-lg pl-9 pr-3 py-2 text-sm text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/50"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone/40 hover:text-stone"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Marketplace filter */}
      {allMarketplaces.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setActiveMarketplace(null)}
            className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
              !activeMarketplace
                ? 'bg-sand/15 text-sand border border-sand/30'
                : 'bg-ink/60 text-stone/60 hover:text-stone hover:bg-ink/80 border border-transparent'
            }`}
          >
            All sources
          </button>
          {allMarketplaces.map(m => (
            <button
              key={m}
              onClick={() => setActiveMarketplace(activeMarketplace === m ? null : m)}
              className={`text-[11px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                activeMarketplace === m
                  ? 'bg-sand/15 text-sand border border-sand/30'
                  : 'bg-ink/60 text-stone/60 hover:text-stone hover:bg-ink/80 border border-transparent'
              }`}
            >
              <Store className="h-2.5 w-2.5" />
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Category filter */}
      {allCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setActiveCategory(null)}
            className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
              !activeCategory
                ? 'bg-sand/15 text-sand border border-sand/30'
                : 'bg-ink/60 text-stone/60 hover:text-stone hover:bg-ink/80 border border-transparent'
            }`}
          >
            All
          </button>
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                activeCategory === cat
                  ? 'bg-sand/15 text-sand border border-sand/30'
                  : 'bg-ink/60 text-stone/60 hover:text-stone hover:bg-ink/80 border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-24 rounded-lg bg-surface/50 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone py-8 text-center">
          {search ? `No plugins matching "${search}"` : 'No plugins available.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(p => (
            <PluginCard key={p.pluginId} plugin={p} onClick={() => setSelectedPlugin(p)} />
          ))}
        </div>
      )}

      {selectedPlugin && (
        <PluginDetailModal plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />
      )}
    </div>
  )
}

// --- Page ---

export function Skills() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center gap-2 mb-8">
          <Blocks className="h-5 w-5 text-sand" />
          <h1 className="font-heading text-2xl text-parchment">Skills</h1>
        </div>
        <div className="flex gap-8">
          {/* Left sidebar — 1/3 */}
          <div className="w-72 shrink-0 hidden md:block">
            <InstalledSidebar />
          </div>
          {/* Right column — 2/3 */}
          <div className="flex-1 min-w-0">
            <BrowsePlugins />
          </div>
        </div>
      </div>
    </div>
  )
}
