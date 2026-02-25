import { useState } from 'react'
import { MessageCircleQuestion, Clock, Activity, Plus, ListChecks, FolderKanban, BookOpen } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { SectionHeader } from '@/components/SectionHeader'
import { useHeartbeatConfig, useSystemStatus } from '@/hooks/useSpaces'
import { updateHeartbeatInterval } from '@/lib/api'
import { CombinedEscalationsSection } from '@/features/CombinedEscalationsSection'
import { RecentActivitySection } from '@/features/RecentActivitySection'
import { ActivitySection } from '@/features/ActivitySection'
import { ScheduleSection } from '@/features/ScheduleSection'
import { DashboardExtensionsSection } from '@/features/SuperbotSkillsSection'
import { TodoSection } from '@/features/TodoSection'
import { SpacesSection } from '@/features/SpacesSection'
import { KnowledgeSection } from '@/features/KnowledgeSection'
import { ChatSection } from '@/features/ChatSection'
import type { DashboardConfig } from '@/lib/types'

// --- Section wrapper components ---
// Each wraps a section with its SectionHeader to be self-contained

function EscalationsDashboardSection() {
  return (
    <section className="group" data-section="escalations">
      <SectionHeader title="Escalations" icon={MessageCircleQuestion} />
      <CombinedEscalationsSection />
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

function ScheduleDashboardSection() {
  const [addingJob, setAddingJob] = useState(false)

  return (
    <section className="group" data-section="schedule">
      <SectionHeader
        title="Schedule"
        icon={Clock}
        action={
          <button
            onClick={() => setAddingJob(!addingJob)}
            className="text-xs text-stone hover:text-sand transition-colors inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        }
      />
      <ScheduleSection adding={addingJob} setAdding={setAddingJob} />
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
  leftColumn: ['escalations', 'recent-activity'],
  centerColumn: ['chat'],
  rightColumn: ['pulse', 'schedule', 'todos', 'knowledge', 'extensions'],
  hidden: ['spaces'],
}
