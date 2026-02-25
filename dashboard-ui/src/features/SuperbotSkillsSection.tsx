import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Trash2, Webhook, Bot, Puzzle, ChevronRight, ChevronDown, Cable, CheckCircle2, XCircle, ArrowRight, ArrowLeft } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSuperbotSkills, useHooks, useAgents, useSkills, usePlugins } from '@/hooks/useSpaces'
import { fetchSuperbotSkillDetail, fetchSuperbotSkillFile, deleteSuperbotSkill, toggleSuperbotSkill, fetchSkillDetail, fetchSkillFile, toggleHook, toggleAgent, testHook, getIMessageStatus, saveIMessageConfig, startIMessageWatcher, stopIMessageWatcher, testIMessage } from '@/lib/api'
import type { HookTestResult, IMessageStatus } from '@/lib/api'
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

// --- iMessage Setup Modal ---

export function IMessageSetupModal({ onClose, onComplete }: { onClose: () => void; onComplete: (status: IMessageStatus) => void }) {
  const [step, setStep] = useState(1)
  const [appleId, setAppleId] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ sent: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<IMessageStatus | null>(null)

  async function handleSave() {
    setSaving(true)
    try {
      const result = await saveIMessageConfig(appleId, phoneNumber)
      setStatus(result)
      setStep(4)
      onComplete(result)
    } catch {
      // stay on current step
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testIMessage()
      setTestResult(result)
    } catch (err) {
      setTestResult({ sent: false, error: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl text-parchment">Set Up iMessage</h2>
            <p className="text-sm text-stone mt-1">Step {step} of 4</p>
          </div>
          <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs text-sand mb-1.5">superbot2 Apple ID email</label>
                <input
                  type="email"
                  value={appleId}
                  onChange={e => setAppleId(e.target.value)}
                  placeholder="superbot@example.com"
                  className="w-full rounded-lg bg-ink border border-border-custom px-3 py-2 text-sm text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
                />
              </div>
              <p className="text-xs text-stone/60">Create a dedicated Apple ID at appleid.apple.com — this is the address people will text to reach superbot2.</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!appleId.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-sand/15 text-sand hover:bg-sand/25 transition-colors disabled:opacity-40"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-xs text-sand mb-1.5">Your phone number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="+18015551234"
                  className="w-full rounded-lg bg-ink border border-border-custom px-3 py-2 text-sm text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
                />
              </div>
              <p className="text-xs text-stone/60">Replies from superbot2 will be sent to this number.</p>
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md text-stone hover:text-parchment transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!phoneNumber.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-sand/15 text-sand hover:bg-sand/25 transition-colors disabled:opacity-40"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="rounded-lg bg-ink border border-border-custom p-4 space-y-3">
                <p className="text-sm text-parchment font-medium">Sign into Messages.app</p>
                <ol className="text-xs text-stone space-y-2 list-decimal list-inside">
                  <li>Open <span className="text-parchment">Messages.app</span> on this Mac</li>
                  <li>Go to <span className="text-parchment">Settings → iMessage</span></li>
                  <li>Sign in with <span className="text-sand">{appleId}</span></li>
                  <li>Enable &ldquo;Enable Messages in iCloud&rdquo;</li>
                </ol>
              </div>
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md text-stone hover:text-parchment transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-moss/20 text-moss hover:bg-moss/30 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save & Enable <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="flex items-center gap-2 text-moss">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">iMessage bridge is active</span>
              </div>

              <button
                onClick={handleTest}
                disabled={testing}
                className="w-full text-xs text-parchment bg-ink border border-border-custom hover:border-sand/30 rounded-lg px-4 py-2.5 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {testing ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending test...</>
                ) : (
                  <>Send Test Message</>
                )}
              </button>

              {testResult && (
                <div className={`rounded-lg px-4 py-3 text-xs ${testResult.sent ? 'bg-moss/10 border border-moss/20 text-moss' : 'bg-ember/10 border border-ember/20 text-ember'}`}>
                  {testResult.sent ? 'Test message sent successfully!' : `Failed: ${testResult.error}`}
                </div>
              )}

              <div className="rounded-lg bg-ink border border-border-custom p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {status?.chatDbReadable ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-moss" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-ember" />
                  )}
                  <span className="text-xs text-parchment">Full Disk Access</span>
                </div>
                {!status?.chatDbReadable && (
                  <p className="text-xs text-stone/60">
                    Grant Full Disk Access to your terminal in System Settings → Privacy & Security → Full Disk Access, then restart your terminal and run: <span className="text-sand font-mono">superbot2 imessage-setup</span>
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm rounded-md bg-sand/15 text-sand hover:bg-sand/25 transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// --- iMessage Integration Card ---

export function IMessageIntegration() {
  const [status, setStatus] = useState<IMessageStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  if (loading) {
    return <div className="h-8 rounded-md bg-surface/50 animate-pulse" />
  }

  const isConfigured = status?.configured
  const isOnline = status?.watcherRunning

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border-custom bg-surface/50 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-parchment truncate">iMessage</p>
          <p className="text-[10px] text-stone/50 truncate flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${isOnline ? 'bg-moss' : 'bg-stone/40'}`} />
            {!isConfigured ? 'Not configured' : isOnline ? 'Online' : 'Offline'}
          </p>
        </div>
        {!isConfigured ? (
          <button
            onClick={() => setShowSetup(true)}
            className="p-1 text-stone hover:text-sand transition-colors shrink-0"
            title="Set up iMessage"
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        ) : isOnline ? (
          <button
            onClick={handleStop}
            disabled={actionLoading !== null}
            className="px-2 py-0.5 text-[10px] rounded bg-ink border border-border-custom text-stone hover:text-parchment transition-colors disabled:opacity-50 shrink-0"
          >
            {actionLoading === 'stop' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Stop'}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={actionLoading !== null}
            className="px-2 py-0.5 text-[10px] rounded bg-moss/15 border border-moss/25 text-moss hover:bg-moss/25 transition-colors disabled:opacity-50 shrink-0"
          >
            {actionLoading === 'start' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Start'}
          </button>
        )}
      </div>

      {showSetup && (
        <IMessageSetupModal
          onClose={() => { setShowSetup(false); fetchStatus() }}
          onComplete={(s) => setStatus(s)}
        />
      )}
    </>
  )
}

// --- Unified Plugins Section ---

type ExtensionTab = 'skills' | 'hooks' | 'agents' | 'integrations'

export function DashboardExtensionsSection() {
  const { data: superbotSkills, isLoading: superbotLoading } = useSuperbotSkills()
  const { data: ccSkills } = useSkills()
  const { data: plugins } = usePlugins()
  const { data: hooks } = useHooks()
  const { data: agents } = useAgents()

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

  const tabs: { id: ExtensionTab; label: string; icon: typeof Webhook; count: number; alwaysShow?: boolean }[] = [
    { id: 'skills', label: 'Skills', icon: Puzzle, count: skillCount },
    { id: 'hooks', label: 'Hooks', icon: Webhook, count: hookCount },
    { id: 'agents', label: 'Agents', icon: Bot, count: agentCount },
    { id: 'integrations', label: 'Integrations', icon: Cable, count: 1, alwaysShow: true },
  ]

  const visibleTabs = tabs.filter(t => t.count > 0 || t.alwaysShow || (t.id === 'skills' && superbotLoading))

  // Auto-select first visible tab if current tab has no items
  const currentTab = visibleTabs.find(t => t.id === activeTab) ? activeTab : (visibleTabs[0]?.id ?? 'skills')

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
                {!tab.alwaysShow && <span className={`text-[10px] ${isActive ? 'text-sand/70' : 'text-stone/40'}`}>{tab.count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Skills tab content */}
      {currentTab === 'skills' && (
        superbotLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-7 w-20 rounded-full bg-surface/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {superbotSkills?.map((skill) => (
              <button
                key={skill.id}
                onClick={() => setSelectedSuperbotSkill(skill)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer border ${
                  skill.enabled === false
                    ? 'border-stone/20 bg-stone/5 text-stone hover:bg-stone/10'
                    : 'border-moss/25 bg-moss/10 text-parchment hover:bg-moss/20'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${skill.enabled === false ? 'bg-stone/40' : 'bg-moss'}`} />
                {skill.name}
              </button>
            ))}

            {installedPluginsWithSkills.map(plugin => {
              const pluginSkills = pluginSkillGroups.get(plugin.name) ?? []
              const isExpanded = expandedPlugins.has(plugin.name)
              return (
                <div key={plugin.pluginId} className="contents">
                  <button
                    onClick={() => setExpandedPlugins(prev => {
                      const next = new Set(prev)
                      if (next.has(plugin.name)) next.delete(plugin.name)
                      else next.add(plugin.name)
                      return next
                    })}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border border-moss/25 bg-moss/10 text-parchment hover:bg-moss/20 transition-colors cursor-pointer"
                  >
                    <Puzzle className="h-3 w-3 text-moss/60 shrink-0" />
                    {titleCase(plugin.name)}
                    {pluginSkills.length > 0 && <span className="text-[10px] text-stone/50">{pluginSkills.length}</span>}
                    {plugin.hasUnconfiguredCredentials && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" title="Needs configuration" />}
                    {isExpanded
                      ? <ChevronDown className="h-3 w-3 text-stone/40 shrink-0" />
                      : <ChevronRight className="h-3 w-3 text-stone/40 shrink-0" />
                    }
                  </button>
                  {isExpanded && pluginSkills.length > 0 && (
                    <div className="w-full flex flex-wrap gap-1.5 pl-4">
                      {pluginSkills.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedPluginSkill(s)}
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] border border-moss/15 bg-moss/5 text-parchment/80 hover:bg-moss/15 transition-colors cursor-pointer"
                        >
                          <span className="h-1 w-1 rounded-full bg-moss/50 shrink-0" />
                          {s.name}
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
        <div className="flex flex-wrap gap-2">
          {hooks?.map((hook, i) => (
            <button
              key={`${hook.event}-${i}`}
              onClick={() => setSelectedHook(hook)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer border ${
                hook.enabled === false
                  ? 'border-stone/20 bg-stone/5 text-stone hover:bg-stone/10'
                  : 'border-moss/25 bg-moss/10 text-parchment hover:bg-moss/20'
              }`}
              title={hook.description}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${hook.enabled === false ? 'bg-stone/40' : 'bg-moss'}`} />
              {hook.event}
            </button>
          ))}
        </div>
      )}

      {/* Agents tab content */}
      {currentTab === 'agents' && (
        <div className="flex flex-wrap gap-2">
          {agents?.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer border ${
                agent.enabled === false
                  ? 'border-stone/20 bg-stone/5 text-stone hover:bg-stone/10'
                  : 'border-moss/25 bg-moss/10 text-parchment hover:bg-moss/20'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${agent.enabled === false ? 'bg-stone/40' : 'bg-moss'}`} />
              {agent.name}
            </button>
          ))}
        </div>
      )}

      {/* Integrations tab content */}
      {currentTab === 'integrations' && (
        <IMessageIntegration />
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
