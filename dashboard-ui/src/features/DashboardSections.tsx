import { useState } from 'react'
import { MessageCircleQuestion, Clock, Activity, Plus } from 'lucide-react'
import { SectionHeader } from '@/components/SectionHeader'
import { EscalationsSection } from '@/features/EscalationsSection'
import { OrchestratorResolvedSection } from '@/features/OrchestratorResolvedSection'
import { RecentActivitySection } from '@/features/RecentActivitySection'
import { ActivitySection } from '@/features/ActivitySection'
import { ScheduleSection, SchedulerStatus } from '@/features/ScheduleSection'
import { DashboardExtensionsSection } from '@/features/SuperbotSkillsSection'
import type { DashboardConfig } from '@/lib/types'

// --- Section wrapper components ---
// Each wraps a section with its SectionHeader to be self-contained

function EscalationsDashboardSection() {
  return (
    <section data-section="escalations">
      <SectionHeader title="Escalations" icon={MessageCircleQuestion} />
      <EscalationsSection />
    </section>
  )
}

function PulseDashboardSection() {
  return (
    <section data-section="pulse">
      <SectionHeader title="Pulse" icon={Activity} />
      <ActivitySection />
    </section>
  )
}

function ScheduleDashboardSection() {
  const [addingJob, setAddingJob] = useState(false)

  return (
    <section data-section="schedule">
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
      <div className="space-y-3">
        <SchedulerStatus />
        <ScheduleSection adding={addingJob} setAdding={setAddingJob} />
      </div>
    </section>
  )
}

function ExtensionsDashboardSection() {
  return (
    <section data-section="extensions">
      <SectionHeader title="Extensions" icon={({ className }) => (
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
  'extensions': {
    id: 'extensions',
    Component: ExtensionsDashboardSection,
  },
}

// --- Default layout ---

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  leftColumn: ['escalations', 'orchestrator-resolved', 'recent-activity'],
  rightColumn: ['pulse', 'schedule', 'extensions'],
  hidden: [],
}
