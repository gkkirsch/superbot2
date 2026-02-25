import { useState } from 'react'
import { MessageCircleQuestion, Clock, Activity, Plus, ListChecks, FolderKanban, BookOpen } from 'lucide-react'
import { SectionHeader } from '@/components/SectionHeader'
import { useHeartbeatConfig } from '@/hooks/useSpaces'
import { EscalationsSection } from '@/features/EscalationsSection'
import { OrchestratorResolvedSection } from '@/features/OrchestratorResolvedSection'
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
      <EscalationsSection />
    </section>
  )
}

function PulseDashboardSection() {
  const { data: hbConfig } = useHeartbeatConfig()
  const intervalMinutes = hbConfig?.intervalMinutes ?? 30
  return (
    <section className="group" data-section="pulse">
      <SectionHeader
        title="Pulse"
        icon={Activity}
        action={<span className="text-xs text-stone/60">heartbeat every {intervalMinutes}m</span>}
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
  'orchestrator-resolved': {
    id: 'orchestrator-resolved',
    Component: OrchestratorResolvedSection,
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
  leftColumn: ['escalations', 'orchestrator-resolved', 'recent-activity'],
  centerColumn: ['chat'],
  rightColumn: ['pulse', 'schedule', 'todos', 'knowledge', 'extensions'],
  hidden: ['spaces'],
}
