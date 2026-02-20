import { useState, useCallback, useMemo } from 'react'
import { X, Loader2, Trash2, Webhook, Bot, Puzzle, ChevronRight, ChevronDown } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSuperbotSkills, useHooks, useAgents, useSkills, usePlugins } from '@/hooks/useSpaces'
import { fetchSuperbotSkillDetail, fetchSuperbotSkillFile, deleteSuperbotSkill, toggleSuperbotSkill, fetchSkillDetail, fetchSkillFile, toggleHook, toggleAgent, testHook } from '@/lib/api'
import type { HookTestResult } from '@/lib/api'
import { SkillDetailModal } from '@/components/SkillDetailModal'
import type { SuperbotSkill, SkillInfo, HookInfo, AgentInfo } from '@/lib/types'

function titleCase(name: string) {
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// --- Toggle switch ---

function Toggle({ enabled, onToggle, loading }: { enabled: boolean; onToggle: () => void; loading?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      disabled={loading}
      className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${enabled ? 'bg-moss' : 'bg-stone/30'} ${loading ? 'opacity-50' : ''}`}
      title={enabled ? 'Disable' : 'Enable'}
    >
      <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-parchment transition-transform ${enabled ? 'translate-x-[14px]' : ''}`} />
    </button>
  )
}

// --- Superbot Skill Detail Modal (wraps shared SkillDetailModal) ---

function SuperbotSkillModal({ skill, onClose }: { skill: SuperbotSkill; onClose: () => void }) {
  const [removing, setRemoving] = useState(false)
  const queryClient = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: () => toggleSuperbotSkill(skill.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superbot-skills'] })
    },
  })

  async function handleUninstall() {
    setRemoving(true)
    try {
      await deleteSuperbotSkill(skill.id)
      await queryClient.invalidateQueries({ queryKey: ['superbot-skills'] })
      onClose()
    } finally {
      setRemoving(false)
    }
  }

  const fetchDetail = useCallback((id: string) => fetchSuperbotSkillDetail(id), [])
  const fetchFile = useCallback((id: string, filePath: string) => fetchSuperbotSkillFile(id, filePath), [])

  return (
    <SkillDetailModal
      skill={skill}
      onClose={onClose}
      fetchDetail={fetchDetail}
      fetchFile={fetchFile}
      headerActions={
        <>
          <Toggle
            enabled={skill.enabled ?? true}
            onToggle={() => toggleMutation.mutate()}
            loading={toggleMutation.isPending}
          />
          <button
            onClick={handleUninstall}
            disabled={removing}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-ember/15 text-ember hover:bg-ember/25 transition-colors disabled:opacity-50"
          >
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {removing ? 'Removing...' : 'Uninstall'}
          </button>
        </>
      }
    />
  )
}

// --- Plugin Skill Detail Modal (for Claude Code skills from plugins) ---

function PluginSkillModal({ skill, onClose }: { skill: SkillInfo; onClose: () => void }) {
  const fetchDetailCb = useCallback((id: string) => fetchSkillDetail(id), [])
  const fetchFileCb = useCallback((id: string, filePath: string) => fetchSkillFile(id, filePath), [])

  return (
    <SkillDetailModal
      skill={skill}
      onClose={onClose}
      fetchDetail={fetchDetailCb}
      fetchFile={fetchFileCb}
    />
  )
}

// --- Hook Detail Modal ---

function HookDetailModal({ hook, onClose }: { hook: HookInfo; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [testResult, setTestResult] = useState<HookTestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const toggleMutation = useMutation({
    mutationFn: () => toggleHook(hook.event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hooks'] })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => testHook(hook.event),
    onSuccess: (result) => {
      setTestResult(result)
      setTestError(null)
    },
    onError: (err: Error) => {
      setTestError(err.message)
      setTestResult(null)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl text-parchment">{hook.event}</h2>
            <p className="text-sm text-stone mt-1">{hook.description}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <Toggle
              enabled={hook.enabled ?? true}
              onToggle={() => toggleMutation.mutate()}
              loading={toggleMutation.isPending}
            />
            <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <div className="rounded-lg bg-ink border border-border-custom p-4">
            <div className="space-y-2">
              <div className="flex gap-3">
                <span className="text-xs font-mono text-sand shrink-0 min-w-[80px]">event</span>
                <span className="text-xs text-parchment">{hook.event}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-xs font-mono text-sand shrink-0 min-w-[80px]">command</span>
                <span className="text-xs text-parchment font-mono break-all">{hook.command}</span>
              </div>
            </div>
          </div>

          {/* Test button */}
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="w-full text-xs text-parchment bg-ink border border-border-custom hover:border-sand/30 rounded-lg px-4 py-2.5 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {testMutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running test...</>
            ) : (
              <>Run Test</>
            )}
          </button>

          {/* Test error */}
          {testError && (
            <div className="rounded-lg bg-ember/10 border border-ember/20 px-4 py-3">
              <p className="text-xs text-ember">{testError}</p>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2 w-2 rounded-full ${testResult.result.exitCode === 0 ? 'bg-moss' : 'bg-ember'}`} />
                <span className="text-xs text-parchment font-medium">
                  Exit code: {testResult.result.exitCode}
                  {testResult.result.timedOut && ' (timed out)'}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${testResult.result.exitCode === 0 ? 'bg-moss/15 text-moss' : 'bg-ember/15 text-ember'}`}>
                  {testResult.result.exitCode === 0 ? 'PASS' : testResult.result.exitCode === 2 ? 'BLOCKED' : 'ERROR'}
                </span>
              </div>

              {testResult.result.stdout && (
                <div>
                  <span className="text-[10px] text-stone/60 uppercase tracking-wider">stdout</span>
                  <pre className="mt-1 rounded-lg bg-ink border border-border-custom p-3 text-xs text-parchment/80 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {testResult.result.stdout}
                  </pre>
                </div>
              )}

              {testResult.result.stderr && (
                <div>
                  <span className="text-[10px] text-stone/60 uppercase tracking-wider">stderr</span>
                  <pre className="mt-1 rounded-lg bg-ink border border-ember/15 p-3 text-xs text-ember/80 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {testResult.result.stderr}
                  </pre>
                </div>
              )}

              {!testResult.result.stdout && !testResult.result.stderr && (
                <p className="text-xs text-stone/50">No output</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Agent Detail Modal ---

function AgentDetailModal({ agent, onClose }: { agent: AgentInfo; onClose: () => void }) {
  const queryClient = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: () => toggleAgent(agent.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl text-parchment">{agent.name}</h2>
            {agent.description && <p className="text-sm text-stone mt-1">{agent.description}</p>}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-stone/60">model: {agent.model}</span>
              {agent.source && <span className="text-xs text-stone/60">source: {agent.source}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            {agent.source === 'user' && (
              <Toggle
                enabled={agent.enabled ?? true}
                onToggle={() => toggleMutation.mutate()}
                loading={toggleMutation.isPending}
              />
            )}
            <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="rounded-lg bg-ink border border-border-custom p-4">
            <div className="space-y-2">
              <div className="flex gap-3">
                <span className="text-xs font-mono text-sand shrink-0 min-w-[80px]">id</span>
                <span className="text-xs text-parchment font-mono">{agent.id}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-xs font-mono text-sand shrink-0 min-w-[80px]">model</span>
                <span className="text-xs text-parchment">{agent.model}</span>
              </div>
              {agent.pluginName && (
                <div className="flex gap-3">
                  <span className="text-xs font-mono text-sand shrink-0 min-w-[80px]">plugin</span>
                  <span className="text-xs text-parchment">{agent.pluginName}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Unified Extensions Section ---

type ExtensionTab = 'skills' | 'hooks' | 'agents'

export function DashboardExtensionsSection() {
  const { data: superbotSkills, isLoading: superbotLoading } = useSuperbotSkills()
  const { data: ccSkills } = useSkills()
  const { data: plugins } = usePlugins()
  const { data: hooks, isLoading: hooksLoading } = useHooks()
  const { data: agents, isLoading: agentsLoading } = useAgents()

  const [activeTab, setActiveTab] = useState<ExtensionTab>('skills')
  const [selectedSuperbotSkill, setSelectedSuperbotSkill] = useState<SuperbotSkill | null>(null)
  const [selectedPluginSkill, setSelectedPluginSkill] = useState<SkillInfo | null>(null)
  const [selectedHook, setSelectedHook] = useState<HookInfo | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null)
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set())

  const installedPluginsWithSkills = useMemo(() => {
    return plugins?.filter(p => p.installed && p.componentCounts && p.componentCounts.skills > 0) ?? []
  }, [plugins])

  const pluginSkillGroups = useMemo(() => {
    const groups = new Map<string, SkillInfo[]>()
    for (const s of (ccSkills ?? [])) {
      if (s.source === 'plugin' && s.pluginName) {
        const existing = groups.get(s.pluginName) || []
        existing.push(s)
        groups.set(s.pluginName, existing)
      }
    }
    return groups
  }, [ccSkills])

  const skillCount = (superbotSkills?.length ?? 0) + installedPluginsWithSkills.length
  const hookCount = hooks?.length ?? 0
  const agentCount = agents?.length ?? 0

  const tabs: { id: ExtensionTab; label: string; icon: typeof Webhook; count: number }[] = [
    { id: 'skills', label: 'Skills', icon: Puzzle, count: skillCount },
    { id: 'hooks', label: 'Hooks', icon: Webhook, count: hookCount },
    { id: 'agents', label: 'Agents', icon: Bot, count: agentCount },
  ]

  const visibleTabs = tabs.filter(t => t.count > 0 || (t.id === 'skills' && superbotLoading))

  // Auto-select first visible tab if current tab has no items
  const currentTab = visibleTabs.find(t => t.id === activeTab) ? activeTab : (visibleTabs[0]?.id ?? 'skills')

  const isLoading = superbotLoading || hooksLoading || agentsLoading

  if (!isLoading && skillCount === 0 && hookCount === 0 && agentCount === 0) {
    return (
      <div className="rounded-lg border border-border-custom bg-surface/50 py-6 text-center">
        <p className="text-sm text-stone">No extensions installed</p>
      </div>
    )
  }

  return (
    <>
      {/* Tab bar */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 mb-4">
          {visibleTabs.map(tab => {
            const Icon = tab.icon
            const isActive = tab.id === currentTab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-sand/15 text-sand border border-sand/30'
                    : 'text-stone/60 hover:text-stone hover:bg-ink/80 border border-transparent'
                }`}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
                <span className={`text-[10px] ${isActive ? 'text-sand/70' : 'text-stone/40'}`}>{tab.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Skills tab content */}
      {currentTab === 'skills' && (
        superbotLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-surface/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {superbotSkills?.map((skill) => (
              <button
                key={skill.id}
                onClick={() => setSelectedSuperbotSkill(skill)}
                className={`w-full text-left rounded-md border-l-2 border px-3 py-2 transition-colors cursor-pointer ${
                  skill.enabled === false
                    ? 'border-l-stone/30 border-stone/20 bg-stone/5 hover:bg-stone/10'
                    : 'border-l-moss border-moss/20 bg-moss/5 hover:bg-moss/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs font-medium truncate ${skill.enabled === false ? 'text-stone' : 'text-parchment'}`}>
                    {skill.name}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    {skill.enabled === false && <span className="text-[10px] text-stone/50">Disabled</span>}
                    <ChevronRight className="h-3 w-3 text-stone/40" />
                  </div>
                </div>
              </button>
            ))}

            {installedPluginsWithSkills.map(plugin => {
              const pluginSkills = pluginSkillGroups.get(plugin.name) ?? []
              const isExpanded = expandedPlugins.has(plugin.name)
              return (
                <div key={plugin.pluginId}>
                  <button
                    onClick={() => setExpandedPlugins(prev => {
                      const next = new Set(prev)
                      if (next.has(plugin.name)) next.delete(plugin.name)
                      else next.add(plugin.name)
                      return next
                    })}
                    className="w-full text-left rounded-md border border-moss/20 bg-moss/5 px-3 py-2 hover:bg-moss/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Puzzle className="h-3 w-3 text-moss/60 shrink-0" />
                        <span className="text-xs font-medium text-parchment truncate">{titleCase(plugin.name)}</span>
                        {pluginSkills.length > 0 && <span className="text-[10px] text-stone/50">({pluginSkills.length})</span>}
                      </div>
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3 text-stone/40 shrink-0" />
                        : <ChevronRight className="h-3 w-3 text-stone/40 shrink-0" />
                      }
                    </div>
                  </button>
                  {isExpanded && pluginSkills.length > 0 && (
                    <div className="ml-3 mt-1 space-y-1 border-l border-moss/15 pl-2">
                      {pluginSkills.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedPluginSkill(s)}
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
        )
      )}

      {/* Hooks tab content */}
      {currentTab === 'hooks' && (
        <div className="space-y-1.5">
          {hooks?.map((hook, i) => (
            <button
              key={`${hook.event}-${i}`}
              onClick={() => setSelectedHook(hook)}
              className={`w-full text-left rounded-md border-l-2 border px-3 py-2 transition-colors cursor-pointer ${
                hook.enabled === false
                  ? 'border-l-stone/30 border-stone/20 bg-stone/5 hover:bg-stone/10'
                  : 'border-l-moss border-moss/20 bg-moss/5 hover:bg-moss/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium truncate ${hook.enabled === false ? 'text-stone' : 'text-parchment'}`}>
                    {hook.event}
                  </p>
                  <p className="text-[10px] text-stone/60 mt-0.5 line-clamp-2">{hook.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {hook.enabled === false && <span className="text-[10px] text-stone/50">Disabled</span>}
                  <ChevronRight className="h-3 w-3 text-stone/40" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Agents tab content */}
      {currentTab === 'agents' && (
        <div className="space-y-1.5">
          {agents?.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className={`w-full text-left rounded-md border-l-2 border px-3 py-2 transition-colors cursor-pointer ${
                agent.enabled === false
                  ? 'border-l-stone/30 border-stone/20 bg-stone/5 hover:bg-stone/10'
                  : 'border-l-moss border-moss/20 bg-moss/5 hover:bg-moss/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs font-medium truncate ${agent.enabled === false ? 'text-stone' : 'text-parchment'}`}>
                  {agent.name}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  {agent.enabled === false && <span className="text-[10px] text-stone/50">Disabled</span>}
                  <ChevronRight className="h-3 w-3 text-stone/40" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modals */}
      {selectedSuperbotSkill && (
        <SuperbotSkillModal skill={selectedSuperbotSkill} onClose={() => setSelectedSuperbotSkill(null)} />
      )}
      {selectedPluginSkill && (
        <PluginSkillModal skill={selectedPluginSkill} onClose={() => setSelectedPluginSkill(null)} />
      )}
      {selectedHook && (
        <HookDetailModal hook={selectedHook} onClose={() => setSelectedHook(null)} />
      )}
      {selectedAgent && (
        <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </>
  )
}
