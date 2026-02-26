import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import yaml from 'js-yaml'
import { Blocks, Sparkles, Bot, Webhook, Puzzle, Download, Trash2, Loader2, X, Terminal, BookOpen, Cpu, FileText, ChevronRight, Search, Plus, Store, RefreshCw, Key, Check, AlertTriangle, Wrench, ArrowRight, Cable, MessageSquare, Send, Chrome } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePlugins, useMarketplaces, usePluginCredentials } from '@/hooks/useSpaces'
import { installPlugin, uninstallPlugin, fetchPluginDetail, fetchPluginFile, addMarketplace, removeMarketplace, refreshMarketplaces, savePluginCredential, deletePluginCredential, installPluginBin, getIMessageStatus, startIMessageWatcher, stopIMessageWatcher, getTelegramStatus, startTelegramWatcher, stopTelegramWatcher, getBrowserStatus, setupBrowser, openBrowser } from '@/lib/api'
import type { IMessageStatus, TelegramStatus, BrowserStatus } from '@/lib/api'
import type { PluginInfo, PluginDetail, PluginComponent, CredentialDeclaration, MissingBin } from '@/lib/types'
import { IMessageSetupModal, TelegramSetupModal } from '@/features/SuperbotSkillsSection'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function titleCase(name: string) {
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
      setFeedback(f => ({ ...f, [cred.key]: { type: 'error' } }))
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

function MissingBinsWarning({ pluginName, missingBins }: { pluginName: string; missingBins: MissingBin[] }) {
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [output, setOutput] = useState<{ exitCode: number; stdout: string; stderr: string } | null>(null)
  const queryClient = useQueryClient()

  if (missingBins.length === 0) return null

  async function handleInstall(installId: string) {
    setInstallingId(installId)
    setOutput(null)
    try {
      const result = await installPluginBin(pluginName, installId)
      setOutput(result)
      if (result.exitCode === 0) {
        queryClient.invalidateQueries({ queryKey: ['plugins'] })
      }
    } catch {
      setOutput({ exitCode: 1, stdout: '', stderr: 'Failed to run install command' })
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {missingBins.map(mb => (
        <div key={mb.bin} className="rounded-lg bg-amber-400/10 border border-amber-400/30 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              This plugin requires <code className="font-mono bg-amber-400/15 px-1 py-0.5 rounded">{mb.bin}</code> to be installed.
            </p>
          </div>
          {mb.installOptions.map(opt => (
            <div key={opt.id} className="flex items-center gap-2 mt-2">
              <code className="text-[11px] font-mono text-parchment/80 bg-ink/80 px-2 py-1 rounded flex-1 truncate">
                brew install {opt.formula}
              </code>
              <button
                onClick={() => handleInstall(opt.id)}
                disabled={installingId !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 transition-colors disabled:opacity-50 shrink-0"
              >
                {installingId === opt.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {installingId === opt.id ? 'Installing...' : 'Run Install'}
              </button>
            </div>
          ))}
        </div>
      ))}
      {output && (
        <pre className="text-[11px] font-mono bg-ink border border-border-custom rounded-lg p-3 max-h-40 overflow-auto whitespace-pre-wrap">
          <span className={output.exitCode === 0 ? 'text-moss' : 'text-ember'}>
            {output.exitCode === 0 ? 'Success' : `Exit code: ${output.exitCode}`}
          </span>
          {'\n'}
          {output.stdout && <span className="text-parchment/70">{output.stdout}</span>}
          {output.stderr && <span className="text-ember/70">{output.stderr}</span>}
        </pre>
      )}
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
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
              {plugin.installed && plugin.hasUnconfiguredCredentials && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-400/10 border border-amber-400/30 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300">This plugin requires API credentials to function. Configure them below.</p>
                </div>
              )}

              {plugin.installed && <CredentialForm pluginName={plugin.name} />}

              {plugin.installed && detail?.missingBins && detail.missingBins.length > 0 && (
                <MissingBinsWarning pluginName={plugin.name} missingBins={detail.missingBins} />
              )}

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
    </div>,
    document.body
  )
}

// --- Plugin Card (detailed card for browse list) ---

function PluginCard({ plugin, onClick, showInstalledBadge }: { plugin: PluginInfo; onClick: () => void; showInstalledBadge?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left rounded-lg border p-4 transition-colors cursor-pointer ${
        plugin.installed
          ? 'border-moss/30 bg-moss/5 hover:bg-moss/10'
          : 'border-border-custom bg-surface/50 hover:border-sand/30 hover:bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-parchment leading-tight mb-1.5">{titleCase(plugin.name)}</h3>
          {plugin.installed && (plugin.hasUnconfiguredCredentials || plugin.hasMissingBins) && (
            <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0 mb-1" title="Needs configuration" />
          )}
        </div>
        {showInstalledBadge && plugin.installed && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-moss bg-moss/15 border border-moss/25 rounded-full px-2 py-0.5">
            <Check className="h-2.5 w-2.5" />
            Installed
          </span>
        )}
      </div>
      {plugin.description && (
        <p className="text-xs text-stone line-clamp-1">{plugin.description}</p>
      )}
    </button>
  )
}

// --- Marketplace management ---

const SUPERCHARGE_MARKETPLACE_URL = 'https://superchargeclaudecode.com/api/marketplaces/superbot-marketplace/marketplace.json'

function MarketplaceManager() {
  const { data: marketplaces, isLoading } = useMarketplaces()
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
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
    m.url === SUPERCHARGE_MARKETPLACE_URL || m.name === 'superbot-marketplace'
  ) ?? false

  // Auto-add the Supercharge marketplace on first load if not already present
  const autoAddedRef = useRef(false)
  useEffect(() => {
    if (!isLoading && !hasSupercharge && !autoAddedRef.current) {
      autoAddedRef.current = true
      doAdd(SUPERCHARGE_MARKETPLACE_URL)
    }
  }, [isLoading, hasSupercharge])

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
    setInfo(null)
    try {
      const result = await removeMarketplace(name)
      await queryClient.invalidateQueries({ queryKey: ['marketplaces'] })
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
      if (result.uninstalledCount > 0) {
        setInfo(`${result.uninstalledCount} plugin${result.uninstalledCount !== 1 ? 's' : ''} uninstalled`)
      }
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

      {/* Quick-add Supercharge marketplace (fallback if auto-add failed) */}
      {!isLoading && !hasSupercharge && (
        <button
          onClick={() => doAdd(SUPERCHARGE_MARKETPLACE_URL)}
          disabled={adding}
          className="w-full flex items-center gap-2 rounded-md border border-sand/20 bg-sand/5 px-3 py-2.5 mb-3 hover:bg-sand/10 transition-colors disabled:opacity-50 text-left"
        >
          <Store className="h-3.5 w-3.5 text-sand shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-parchment">Superbot Marketplace</p>
            <p className="text-[10px] text-stone/50">Add the official plugin marketplace</p>
          </div>
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sand shrink-0" /> : <Plus className="h-3.5 w-3.5 text-sand shrink-0" />}
        </button>
      )}

      {error && (
        <p className="text-xs text-ember mb-2">{error}</p>
      )}
      {info && (
        <p className="text-xs text-moss mb-2">{info}</p>
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

// --- Right column: Browse plugins ---

function BrowsePlugins() {
  const { data: plugins, isLoading } = usePlugins()
  const { data: marketplaces } = useMarketplaces()
  const [search, setSearch] = useState('')
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null)
  const [activeMarketplace, setActiveMarketplace] = useState<string | null>(null)
  const [showMarketplaceModal, setShowMarketplaceModal] = useState(false)

  const marketplaceCount = marketplaces?.length ?? 0

  const allPlugins = plugins ?? []

  // Collect all unique marketplace names
  const allMarketplaces = useMemo(() => {
    const set = new Set<string>()
    for (const p of allPlugins) {
      if (p.marketplaceName) set.add(p.marketplaceName)
    }
    return Array.from(set).sort()
  }, [allPlugins])

  const filtered = useMemo(() => {
    let result = allPlugins
    if (activeMarketplace) {
      result = result.filter(p => p.marketplaceName === activeMarketplace)
    }
    const q = search.toLowerCase()
    if (q) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.keywords || []).some(k => k.toLowerCase().includes(q))
      )
    }
    // Sort: installed first, then alphabetical
    return result.sort((a, b) => {
      if (a.installed && !b.installed) return -1
      if (!a.installed && b.installed) return 1
      return a.name.localeCompare(b.name)
    })
  }, [allPlugins, search, activeMarketplace])

  const installedCount = allPlugins.filter(p => p.installed).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-sand" />
          <h2 className="font-heading text-lg text-parchment">Browse Plugins</h2>
          <span className="text-xs text-stone bg-surface px-2 py-0.5 rounded-full">{allPlugins.length}</span>
        </div>
        <div className="flex items-center gap-3">
          {installedCount > 0 && (
            <span className="text-xs text-moss">{installedCount} installed</span>
          )}
          <button
            onClick={() => setShowMarketplaceModal(true)}
            className="flex items-center gap-1.5 text-xs text-stone hover:text-parchment transition-colors"
          >
            <Store className="h-3.5 w-3.5" />
            <span>Marketplace</span>
            {marketplaceCount > 0 && (
              <span className="text-[10px] bg-surface text-stone px-1.5 py-0.5 rounded-full">{marketplaceCount}</span>
            )}
          </button>
        </div>
      </div>
      {showMarketplaceModal && <MarketplaceModal onClose={() => setShowMarketplaceModal(false)} />}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone/50" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search plugins..."
          autoComplete="off"
          readOnly={!!selectedPlugin}
          tabIndex={selectedPlugin ? -1 : 0}
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
        <div className="flex flex-wrap gap-1.5 mb-4">
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

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-28 rounded-lg bg-surface/50 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone py-8 text-center">
          {search ? `No plugins matching "${search}"` : 'No plugins available.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => (
            <PluginCard key={p.pluginId} plugin={p} onClick={() => setSelectedPlugin(p)} showInstalledBadge />
          ))}
        </div>
      )}

      {selectedPlugin && (
        <PluginDetailModal plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />
      )}
    </div>
  )
}

// --- iMessage Integration Card ---

function IMessageCard() {
  const [status, setStatus] = useState<IMessageStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)

  async function fetchStatus() {
    try {
      const s = await getIMessageStatus()
      setStatus(s)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  async function handleStart() {
    setActionLoading('start')
    try {
      await startIMessageWatcher()
      await fetchStatus()
    } finally { setActionLoading(null) }
  }

  async function handleStop() {
    setActionLoading('stop')
    try {
      await stopIMessageWatcher()
      await fetchStatus()
    } finally { setActionLoading(null) }
  }

  const isConfigured = status?.configured
  const isOnline = status?.watcherRunning

  return (
    <div className="rounded-xl border border-border-custom bg-surface/50 p-5 flex items-start gap-4 hover:border-sand/20 transition-colors">
      <div className={`rounded-lg p-2.5 shrink-0 ${isOnline ? 'bg-moss/10' : 'bg-surface'}`}>
        <MessageSquare className={`h-5 w-5 ${isOnline ? 'text-moss' : 'text-stone/60'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-parchment">iMessage</h3>
          {!loading && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
              isOnline
                ? 'text-moss bg-moss/15'
                : isConfigured
                  ? 'text-stone bg-stone/10'
                  : 'text-stone/50 bg-stone/5'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-moss' : 'bg-stone/40'}`} />
              {!isConfigured ? 'Not set up' : isOnline ? 'Online' : 'Offline'}
            </span>
          )}
        </div>
        <p className="text-xs text-stone leading-relaxed mb-3">
          {isConfigured
            ? 'Receive and respond to messages via iMessage bridge.'
            : 'Connect iMessage to receive and respond to texts.'}
        </p>
        {loading ? (
          <div className="h-7 w-16 rounded-md bg-surface animate-pulse" />
        ) : !isConfigured ? (
          <button
            onClick={() => setShowSetup(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-sand/15 border border-sand/25 text-sand hover:bg-sand/25 transition-colors"
          >
            Configure <ArrowRight className="h-3 w-3" />
          </button>
        ) : isOnline ? (
          <button
            onClick={handleStop}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-ink border border-border-custom text-stone hover:text-parchment hover:border-stone/30 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'stop' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Stop Watcher'}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-moss/15 border border-moss/25 text-moss hover:bg-moss/25 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'start' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Start Watcher'}
          </button>
        )}
      </div>
      {showSetup && (
        <IMessageSetupModal
          onClose={() => { setShowSetup(false); fetchStatus() }}
          onComplete={(s) => { setStatus(s); setShowSetup(false) }}
        />
      )}
    </div>
  )
}

// --- Telegram Integration Card ---

function TelegramCard() {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)

  async function fetchStatus() {
    try {
      const s = await getTelegramStatus()
      setStatus(s)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  async function handleStart() {
    setActionLoading('start')
    try {
      await startTelegramWatcher()
      await fetchStatus()
    } finally { setActionLoading(null) }
  }

  async function handleStop() {
    setActionLoading('stop')
    try {
      await stopTelegramWatcher()
      await fetchStatus()
    } finally { setActionLoading(null) }
  }

  const isConfigured = status?.configured
  const isOnline = status?.watcherRunning

  return (
    <div className="rounded-xl border border-border-custom bg-surface/50 p-5 flex items-start gap-4 hover:border-sand/20 transition-colors">
      <div className={`rounded-lg p-2.5 shrink-0 ${isOnline ? 'bg-moss/10' : 'bg-surface'}`}>
        <Send className={`h-5 w-5 ${isOnline ? 'text-moss' : 'text-stone/60'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-parchment">Telegram</h3>
          {!loading && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
              isOnline
                ? 'text-moss bg-moss/15'
                : isConfigured
                  ? 'text-stone bg-stone/10'
                  : 'text-stone/50 bg-stone/5'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-moss' : 'bg-stone/40'}`} />
              {!isConfigured ? 'Not set up' : isOnline ? 'Online' : 'Offline'}
            </span>
          )}
        </div>
        <p className="text-xs text-stone leading-relaxed mb-3">
          {isConfigured
            ? 'Chat, manage escalations, and check status via Telegram.'
            : 'Connect a Telegram bot for chat and escalation management.'}
        </p>
        {loading ? (
          <div className="h-7 w-16 rounded-md bg-surface animate-pulse" />
        ) : !isConfigured ? (
          <button
            onClick={() => setShowSetup(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-sand/15 border border-sand/25 text-sand hover:bg-sand/25 transition-colors"
          >
            Configure <ArrowRight className="h-3 w-3" />
          </button>
        ) : isOnline ? (
          <button
            onClick={handleStop}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-ink border border-border-custom text-stone hover:text-parchment hover:border-stone/30 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'stop' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Stop Watcher'}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-moss/15 border border-moss/25 text-moss hover:bg-moss/25 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'start' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Start Watcher'}
          </button>
        )}
      </div>
      {showSetup && (
        <TelegramSetupModal
          onClose={() => { setShowSetup(false); fetchStatus() }}
          onComplete={(s) => { setStatus(s); setShowSetup(false) }}
        />
      )}
    </div>
  )
}

// --- Marketplace Modal ---

function MarketplaceModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border-custom shrink-0">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-sand" />
            <h2 className="font-heading text-xl text-parchment">Marketplaces</h2>
          </div>
          <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <MarketplaceManager />
        </div>
      </div>
    </div>,
    document.body
  )
}

// --- Browser Integration Card ---

function BrowserCard() {
  const [status, setStatus] = useState<BrowserStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function fetchStatus() {
    try {
      const s = await getBrowserStatus()
      setStatus(s)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 5000)
      return () => clearTimeout(t)
    }
  }, [feedback])

  async function handleSetup() {
    setActionLoading('setup')
    setFeedback(null)
    try {
      const result = await setupBrowser()
      if (result.success) {
        setFeedback({ type: 'success', message: 'Browser set up successfully' })
        await fetchStatus()
      } else {
        setFeedback({ type: 'error', message: result.error || 'Setup failed' })
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Setup failed' })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleOpen() {
    setActionLoading('open')
    setFeedback(null)
    try {
      const result = await openBrowser()
      if (result.success) {
        setFeedback({ type: 'success', message: 'Browser opened' })
        // Re-check status after a short delay for port 9222 to come up
        setTimeout(() => fetchStatus(), 3000)
      } else {
        setFeedback({ type: 'error', message: result.error || 'Failed to open' })
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to open' })
    } finally {
      setActionLoading(null)
    }
  }

  const isConfigured = status?.configured
  const isRunning = status?.running

  return (
    <div className="rounded-xl border border-border-custom bg-surface/50 p-5 flex items-start gap-4 hover:border-sand/20 transition-colors">
      <div className={`rounded-lg p-2.5 shrink-0 ${isRunning ? 'bg-emerald-600/10' : 'bg-surface'}`}>
        <Chrome className={`h-5 w-5 ${isRunning ? 'text-emerald-600' : 'text-stone/60'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-parchment">Browser</h3>
          {!loading && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
              isRunning
                ? 'text-emerald-600 bg-emerald-600/15'
                : isConfigured
                  ? 'text-stone bg-stone/10'
                  : 'text-stone/50 bg-stone/5'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-emerald-600' : 'bg-stone/40'}`} />
              {!isConfigured ? 'Not set up' : isRunning ? 'Running' : 'Ready'}
            </span>
          )}
        </div>
        <p className="text-xs text-stone leading-relaxed mb-3">
          {isConfigured
            ? 'Dedicated Chrome profile for browser automation via CDP.'
            : 'Set up a dedicated Chrome profile for automated browsing.'}
        </p>
        {feedback && (
          <p className={`text-xs mb-2 ${feedback.type === 'success' ? 'text-moss' : 'text-red-400'}`}>
            {feedback.message}
          </p>
        )}
        {loading ? (
          <div className="h-7 w-16 rounded-md bg-surface animate-pulse" />
        ) : !isConfigured ? (
          <button
            onClick={handleSetup}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600/15 border border-emerald-600/25 text-emerald-600 hover:bg-emerald-600/25 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'setup' ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Setup <ArrowRight className="h-3 w-3" /></>}
          </button>
        ) : isRunning ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" /> CDP on port 9222
          </span>
        ) : (
          <button
            onClick={handleOpen}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600/15 border border-emerald-600/25 text-emerald-600 hover:bg-emerald-600/25 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'open' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Open Browser'}
          </button>
        )}
      </div>
    </div>
  )
}

// --- Integrations Row ---

function IntegrationsRow() {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Cable className="h-4 w-4 text-sand" />
        <h2 className="font-heading text-lg text-parchment">Integrations</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BrowserCard />
        <IMessageCard />
        <TelegramCard />
      </div>
    </div>
  )
}

// --- Page ---

export function Skills() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Blocks className="h-5 w-5 text-sand" />
            <h1 className="font-heading text-2xl text-parchment">Plugins</h1>
          </div>
        </div>

        {/* Integrations row */}
        <IntegrationsRow />

        {/* Build a Plugin callout */}
        <div className="mb-8 rounded-xl border border-sand/15 bg-gradient-to-r from-sand/[0.06] to-transparent p-5 flex items-center justify-between gap-6">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="rounded-lg bg-sand/10 p-2 shrink-0">
              <Wrench className="h-5 w-5 text-sand" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-parchment mb-1">Build a Plugin</h3>
              <p className="text-xs text-stone leading-relaxed">Create custom skills, commands, and agents for Claude Code. Publish to the marketplace.</p>
            </div>
          </div>
          <Link
            to="/skill-creator"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-sand/15 text-sand hover:bg-sand/25 transition-colors shrink-0"
          >
            Create Plugin <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Plugin browse grid */}
        <BrowsePlugins />
      </div>
    </div>
  )
}
