import { useState, useRef, useEffect } from 'react'
import { MessageCircleQuestion, Clock, Activity, Plus, ListChecks, FolderKanban, BookOpen, Zap, MoreHorizontal, Check, ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { SectionHeader } from '@/components/SectionHeader'
import { useHeartbeatConfig, useSystemStatus } from '@/hooks/useSpaces'
import { updateHeartbeatInterval } from '@/lib/api'
import { CombinedEscalationsSection } from '@/features/CombinedEscalationsSection'
import type { Filter } from '@/features/CombinedEscalationsSection'
import { AutoTriageRulesModal } from '@/components/AutoTriageRulesModal'
import { RecentActivitySection } from '@/features/RecentActivitySection'
import { ActivitySection } from '@/features/ActivitySection'
import { ScheduleSection } from '@/features/ScheduleSection'
import type { ScheduleViewMode } from '@/features/ScheduleSection'
import { DashboardExtensionsSection } from '@/features/SuperbotSkillsSection'
import { TodoSection } from '@/features/TodoSection'
import { SpacesSection } from '@/features/SpacesSection'
import { KnowledgeSection } from '@/features/KnowledgeSection'
import { ChatSection } from '@/features/ChatSection'
import type { DashboardConfig } from '@/lib/types'

// --- Section wrapper components ---
// Each wraps a section with its SectionHeader to be self-contained

function EscalationsDashboardSection() {
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
      <CombinedEscalationsSection filters={filters} />
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
      <ActivitySection />
    </section>
  )
}

const SCHEDULE_VIEWS: { value: ScheduleViewMode; label: string }[] = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'all-schedules', label: 'All Schedules' },
]

function ScheduleDashboardSection() {
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
        action={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAddingJob(!addingJob)}
              className="text-xs text-stone hover:text-sand transition-colors inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
            <div className="relative" ref={viewMenuRef}>
              <button
                onClick={e => { e.stopPropagation(); setShowViewMenu(v => !v) }}
                className={`px-1.5 py-0.5 rounded text-xs transition-colors inline-flex items-center gap-0.5 ${
                  showViewMenu ? 'text-sand bg-sand/10' : 'text-stone/50 hover:text-stone hover:bg-surface'
                }`}
              >
                {SCHEDULE_VIEWS.find(v => v.value === viewMode)?.label}
                <ChevronDown className="h-3 w-3" />
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
      <ScheduleSection adding={addingJob} setAdding={setAddingJob} viewMode={viewMode} />
    </section>
  )
}

function TodoDashboardSection() {
  const [showCompleted, setShowCompleted] = useState(false)
  return (
    <section className="group" data-section="todos">
      <SectionHeader
        title="Todos"
        icon={ListChecks}
        action={
          <button
            onClick={() => setShowCompleted(v => !v)}
            className="text-xs text-stone hover:text-sand transition-colors inline-flex items-center gap-1"
          >
            {showCompleted ? 'Hide completed' : 'Show completed'}
          </button>
        }
      />
      <TodoSection showCompleted={showCompleted} />
    </section>
  )
}

function KnowledgeDashboardSection() {
  return (
    <section className="group" data-section="knowledge">
      <SectionHeader title="Knowledge" icon={BookOpen} linkTo="/knowledge" />
      <KnowledgeSection />
    </section>
  )
}

function SpacesDashboardSection() {
  return (
    <section className="group" data-section="spaces">
      <SectionHeader title="Spaces" icon={FolderKanban} linkTo="/spaces" />
      <SpacesSection />
    </section>
  )
}

function ExtensionsDashboardSection() {
  return (
    <section className="group" data-section="extensions">
      <SectionHeader title="Plugins" icon={({ className }) => (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )} />
      <DashboardExtensionsSection />
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
  'knowledge': {
    id: 'knowledge',
    Component: KnowledgeDashboardSection,
  },
  'extensions': {
    id: 'extensions',
    Component: ExtensionsDashboardSection,
  },
  'spaces': {
    id: 'spaces',
    Component: SpacesDashboardSection,
  },
  'chat': {
    id: 'chat',
    Component: ChatSection,
  },
}

// --- Default layout ---

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  leftColumn: ['escalations', 'spaces'],
  centerColumn: ['chat'],
  rightColumn: ['pulse', 'schedule', 'todos', 'knowledge', 'extensions'],
  hidden: ['recent-activity'],
}
