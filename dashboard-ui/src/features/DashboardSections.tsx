import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircleQuestion, Clock, Activity, Plus, ListChecks, Zap, MoreHorizontal, Check, Lightbulb } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { SectionHeader } from '@/components/SectionHeader'
import { useHeartbeatConfig, useSystemStatus, useEscalations, useTodos, useCards, useCardItems } from '@/hooks/useSpaces'
import { updateHeartbeatInterval } from '@/lib/api'
import { CombinedEscalationsSection } from '@/features/CombinedEscalationsSection'
import type { Filter } from '@/features/CombinedEscalationsSection'
import { AutoTriageRulesModal } from '@/components/AutoTriageRulesModal'
import { RecentActivitySection } from '@/features/RecentActivitySection'
import { ActivitySection } from '@/features/ActivitySection'
import { ScheduleSection } from '@/features/ScheduleSection'
import type { ScheduleViewMode } from '@/features/ScheduleSection'
import { TodoSection } from '@/features/TodoSection'
import { ChatSection } from '@/features/ChatSection'
import { CardSkillSection } from '@/features/CardSection'
import { getRendererOrDefault } from '@/features/cardRenderers'
import { GoalSection } from '@/features/GoalSection'
import { LatestFilesSection } from '@/features/LatestFilesSection'
import { TipsRotator } from '@/features/TipsRotator'
import { Send, Target, FileCode, Settings } from 'lucide-react'
// Register all built-in card renderers on import
import '@/features/registerRenderers'
import type { DashboardConfig } from '@/lib/types'

// --- Collapse state hook + animated wrapper ---

function useCollapsedState(sectionId: string, defaultExpanded = false): [boolean, () => void] {
  const key = `dashboard-collapsed:${sectionId}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) return stored === 'true'
    } catch { /* SSR or private browsing */ }
    return !defaultExpanded
  })
  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(key, String(next)) } catch {}
      return next
    })
  }, [key])
  return [collapsed, toggle]
}

function CollapsibleContent({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
      <div className="overflow-hidden">
        {children}
      </div>
    </div>
  )
}

// --- Section wrapper components ---
// Each wraps a section with its SectionHeader to be self-contained

function EscalationsDashboardSection() {
  const [collapsed, toggle] = useCollapsedState('escalations')
  const { data: escalations } = useEscalations()
  const needsReviewCount = escalations?.filter(e => !e.resolvedAt).length ?? 0
  const [filter, setFilter] = useState<'all' | 'needs_review' | 'orchestrator'>('all')
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const filters: Set<Filter> = filter === 'all'
    ? new Set(['needs_review', 'orchestrator'])
    : new Set([filter])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false)
      }
    }
    if (showFilterMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterMenu])

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'needs_review', label: 'Needs Review' },
    { value: 'orchestrator', label: 'Auto-resolved' },
  ] as const

  return (
    <section className="group" data-section="escalations">
      <SectionHeader
        title="Escalations"
        icon={MessageCircleQuestion}
        collapsed={collapsed}
        onToggle={toggle}
        badge={needsReviewCount}
        action={
          <div className="flex items-center gap-1">
            <button
              onClick={e => { e.stopPropagation(); setShowRulesModal(true) }}
              className="p-1 text-stone/50 hover:text-sand transition-colors rounded hover:bg-sand/10"
              title="Auto-triage rules"
            >
              <Zap className="h-3.5 w-3.5" />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={e => { e.stopPropagation(); setShowFilterMenu(v => !v) }}
                className={`p-1 rounded transition-colors ${showFilterMenu || filter !== 'all' ? 'text-sand bg-sand/10' : 'text-stone/50 hover:text-stone hover:bg-surface'}`}
                title="Filter escalations"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {showFilterMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-ink border border-border-custom rounded-lg shadow-lg py-1 min-w-[140px]">
                  {filterOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={e => { e.stopPropagation(); setFilter(opt.value); setShowFilterMenu(false) }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-surface transition-colors text-left"
                    >
                      <span className={filter === opt.value ? 'text-sand' : 'text-stone'}>{opt.label}</span>
                      {filter === opt.value && <Check className="h-3 w-3 text-sand" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
      />
      <CollapsibleContent collapsed={collapsed}>
        <CombinedEscalationsSection filters={filters} />
      </CollapsibleContent>
      {showRulesModal && <AutoTriageRulesModal onClose={() => setShowRulesModal(false)} />}
    </section>
  )
}

const HEARTBEAT_INTERVALS = [
  { value: 30, label: '30m' },
  { value: 60, label: '1hr' },
  { value: 120, label: '2hr' },
  { value: 1440, label: '24hr' },
]

function PulseDashboardSection() {
  const [collapsed, toggle] = useCollapsedState('pulse', true)
  const { data: hbConfig } = useHeartbeatConfig()
  const { data: status } = useSystemStatus()
  const queryClient = useQueryClient()
  const intervalMinutes = hbConfig?.intervalMinutes ?? 30
  const heartbeatRunning = status?.heartbeatRunning ?? false

  const handleIntervalChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value)
    await updateHeartbeatInterval(val)
    queryClient.invalidateQueries({ queryKey: ['heartbeat-config'] })
  }

  return (
    <section className="group" data-section="pulse">
      <SectionHeader
        title="Pulse"
        icon={Activity}
        collapsed={collapsed}
        onToggle={toggle}
        action={
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${heartbeatRunning ? 'bg-ember' : 'bg-stone/30'}`} />
            <span className="text-xs text-stone/60">heartbeat every</span>
            <select
              value={intervalMinutes}
              onChange={handleIntervalChange}
              onClick={e => e.stopPropagation()}
              className="bg-ink text-xs text-stone/60 focus:outline-none cursor-pointer hover:text-stone transition-colors border-0 appearance-none"
            >
              {HEARTBEAT_INTERVALS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        }
      />
      <CollapsibleContent collapsed={collapsed}>
        <ActivitySection />
      </CollapsibleContent>
    </section>
  )
}

const SCHEDULE_VIEWS: { value: ScheduleViewMode; label: string }[] = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'all-schedules', label: 'All Schedules' },
]

function ScheduleDashboardSection() {
  const [collapsed, toggle] = useCollapsedState('schedule')
  const [addingJob, setAddingJob] = useState(false)
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('timeline')
  const [showViewMenu, setShowViewMenu] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setShowViewMenu(false)
      }
    }
    if (showViewMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showViewMenu])

  return (
    <section className="group" data-section="schedule">
      <SectionHeader
        title="Schedule"
        icon={Clock}
        collapsed={collapsed}
        onToggle={toggle}
        action={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAddingJob(!addingJob)}
              className="p-1 text-stone/50 hover:text-sand transition-colors rounded hover:bg-sand/10"
              title="Add job"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <div className="relative" ref={viewMenuRef}>
              <button
                onClick={e => { e.stopPropagation(); setShowViewMenu(v => !v) }}
                className={`p-1 rounded transition-colors ${showViewMenu || viewMode !== 'timeline' ? 'text-sand bg-sand/10' : 'text-stone/50 hover:text-stone hover:bg-surface'}`}
                title="Schedule view"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {showViewMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-ink border border-border-custom rounded-lg shadow-lg py-1 min-w-[140px]">
                  {SCHEDULE_VIEWS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={e => { e.stopPropagation(); setViewMode(opt.value); setShowViewMenu(false) }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-surface transition-colors text-left"
                    >
                      <span className={viewMode === opt.value ? 'text-sand' : 'text-stone'}>{opt.label}</span>
                      {viewMode === opt.value && <Check className="h-3 w-3 text-sand" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
      />
      <CollapsibleContent collapsed={collapsed}>
        <ScheduleSection adding={addingJob} setAdding={setAddingJob} viewMode={viewMode} />
      </CollapsibleContent>
    </section>
  )
}

function TodoDashboardSection() {
  const [collapsed, toggle] = useCollapsedState('todos')
  const [showCompleted, setShowCompleted] = useState(false)
  const { todos } = useTodos()
  const incompleteTodoCount = todos?.filter(t => !t.completed).length ?? 0
  return (
    <section className="group" data-section="todos">
      <SectionHeader
        title="Todos"
        icon={ListChecks}
        collapsed={collapsed}
        onToggle={toggle}
        badge={incompleteTodoCount}
        action={
          <button
            onClick={() => setShowCompleted(v => !v)}
            className="text-xs text-stone hover:text-sand transition-colors inline-flex items-center gap-1"
          >
            {showCompleted ? 'Hide completed' : 'Show completed'}
          </button>
        }
      />
      <CollapsibleContent collapsed={collapsed}>
        <TodoSection showCompleted={showCompleted} />
      </CollapsibleContent>
    </section>
  )
}

function SingleCardSection({ card }: { card: import('@/lib/types').CardDefinition }) {
  const [collapsed, toggle] = useCollapsedState(`card:${card.skillId}`)
  const [showSettings, setShowSettings] = useState(false)
  const { data } = useCardItems(card.skillId)
  const defaultStatus = card.defaultFilter?.status || 'pending'
  const itemCount = data?.items?.filter(i => !i.status || i.status === defaultStatus).length ?? 0
  const Renderer = getRendererOrDefault(card.renderer) || CardSkillSection

  return (
    <section className="group" data-section={`card:${card.skillId}`}>
      <SectionHeader
        title={card.name}
        icon={Send}
        collapsed={collapsed}
        onToggle={toggle}
        badge={itemCount}
        action={card.hasSettings ? (
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`p-1 rounded transition-colors ${showSettings ? 'text-sand bg-sand/10' : 'text-stone/40 hover:text-stone'}`}
            title="Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        ) : undefined}
      />
      <CollapsibleContent collapsed={collapsed}>
        <Renderer card={card} showSettings={showSettings} onCloseSettings={() => setShowSettings(false)} />
      </CollapsibleContent>
    </section>
  )
}

function CardsDashboardSection() {
  const { data: cards, isLoading } = useCards()
  // Show all cards except goals (which has its own section)
  const pluginCards = cards?.filter(c => c.skillId !== 'goals') || []

  if (!isLoading && pluginCards.length === 0) return null

  return (
    <div className="space-y-10">
      {pluginCards.map(card => (
        <SingleCardSection key={card.skillId} card={card} />
      ))}
    </div>
  )
}

function GoalsDashboardSection() {
  const [collapsed, toggle] = useCollapsedState('goals')
  const { data: goalCards } = useCards()
  const goalCard = goalCards?.find(c => c.skillId === 'goals')
  const { data: goalData } = useCardItems(goalCard?.skillId || '')
  const activeGoalCount = goalData?.items?.filter(i => i.status !== 'completed').length ?? 0
  return (
    <section className="group" data-section="goals">
      <SectionHeader title="Goals" icon={Target} collapsed={collapsed} onToggle={toggle} badge={activeGoalCount} />
      <CollapsibleContent collapsed={collapsed}>
        <GoalSection />
      </CollapsibleContent>
    </section>
  )
}

function LatestFilesDashboardSection() {
  const [collapsed, toggle] = useCollapsedState('latest-files')
  return (
    <section className="group" data-section="latest-files">
      <SectionHeader title="Latest Files" icon={FileCode} collapsed={collapsed} onToggle={toggle} />
      <CollapsibleContent collapsed={collapsed}>
        <LatestFilesSection />
      </CollapsibleContent>
    </section>
  )
}

function TipsDashboardSection() {
  const [collapsed, toggle] = useCollapsedState('tips')
  return (
    <section className="group" data-section="tips">
      <SectionHeader title="Tips" icon={Lightbulb} collapsed={collapsed} onToggle={toggle} />
      <CollapsibleContent collapsed={collapsed}>
        <TipsRotator />
      </CollapsibleContent>
    </section>
  )
}

// --- Section registry ---

export interface SectionDef {
  id: string
  Component: React.ComponentType
}

export const SECTION_REGISTRY: Record<string, SectionDef> = {
  'escalations': {
    id: 'escalations',
    Component: EscalationsDashboardSection,
  },
  'recent-activity': {
    id: 'recent-activity',
    Component: RecentActivitySection,
  },
  'pulse': {
    id: 'pulse',
    Component: PulseDashboardSection,
  },
  'schedule': {
    id: 'schedule',
    Component: ScheduleDashboardSection,
  },
  'todos': {
    id: 'todos',
    Component: TodoDashboardSection,
  },
'cards': {
    id: 'cards',
    Component: CardsDashboardSection,
  },
  'goals': {
    id: 'goals',
    Component: GoalsDashboardSection,
  },
  'latest-files': {
    id: 'latest-files',
    Component: LatestFilesDashboardSection,
  },
  'chat': {
    id: 'chat',
    Component: ChatSection,
  },
  'tips': {
    id: 'tips',
    Component: TipsDashboardSection,
  },
}

// --- Default layout ---

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  leftColumn: ['chat'],
  centerColumn: [],
  rightColumn: ['pulse', 'goals', 'cards', 'escalations', 'latest-files', 'schedule', 'todos'],
  hidden: ['recent-activity', 'tips'],
}
