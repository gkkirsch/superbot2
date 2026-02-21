import { useState, useMemo } from 'react'
import {
  MessageCircleQuestion, AlertTriangle, HelpCircle, ShieldCheck,
  Filter, CheckCircle2, Clock, Circle, Lightbulb, ClipboardList,
} from 'lucide-react'
import { useAllEscalations } from '@/hooks/useSpaces'
import { EscalationCard } from '@/features/EscalationCard'
import type { Escalation } from '@/lib/types'

type StatusFilter = 'all' | Escalation['status']
type TypeFilter = 'all' | Escalation['type']
type PriorityFilter = 'all' | Escalation['priority']

const statusIcon: Record<Escalation['status'], React.ReactNode> = {
  needs_human: <Clock className="h-3.5 w-3.5 text-sand" />,
  untriaged: <Circle className="h-3.5 w-3.5 text-stone" />,
  resolved: <CheckCircle2 className="h-3.5 w-3.5 text-moss" />,
}

const statusLabel: Record<string, string> = {
  all: 'All',
  needs_human: 'Needs Human',
  untriaged: 'Untriaged',
  resolved: 'Resolved',
}

const typeIcon: Record<Escalation['type'], React.ReactNode> = {
  decision: <MessageCircleQuestion className="h-3.5 w-3.5" />,
  blocker: <AlertTriangle className="h-3.5 w-3.5" />,
  question: <HelpCircle className="h-3.5 w-3.5" />,
  approval: <ShieldCheck className="h-3.5 w-3.5" />,
  improvement: <Lightbulb className="h-3.5 w-3.5" />,
  agent_plan: <ClipboardList className="h-3.5 w-3.5" />,
}

function SummaryStats({ escalations }: { escalations: Escalation[] }) {
  const needsHuman = escalations.filter(e => e.status === 'needs_human').length
  const untriaged = escalations.filter(e => e.status === 'untriaged').length
  const resolved = escalations.filter(e => e.status === 'resolved').length

  const stats = [
    { label: 'Needs Human', value: needsHuman, color: 'text-sand', icon: statusIcon.needs_human },
    { label: 'Untriaged', value: untriaged, color: 'text-stone', icon: statusIcon.untriaged },
    { label: 'Resolved', value: resolved, color: 'text-moss', icon: statusIcon.resolved },
  ]

  return (
    <div className="flex flex-wrap items-center gap-6 mb-6">
      {stats.map(s => (
        <div key={s.label} className="flex items-center gap-2">
          {s.icon}
          <span className={`font-heading text-2xl ${s.color}`}>{s.value}</span>
          <span className="text-xs text-stone">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

export function AllEscalations() {
  const { data: escalations, isLoading, error } = useAllEscalations()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [spaceFilter, setSpaceFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  const uniqueSpaces = useMemo(() => {
    if (!escalations) return []
    const set = new Set<string>()
    escalations.forEach(e => { if (e.space) set.add(e.space) })
    return Array.from(set).sort()
  }, [escalations])

  const filtered = useMemo(() => {
    if (!escalations) return []
    let result = [...escalations]
    if (statusFilter !== 'all') result = result.filter(e => e.status === statusFilter)
    if (typeFilter !== 'all') result = result.filter(e => e.type === typeFilter)
    if (priorityFilter !== 'all') result = result.filter(e => e.priority === priorityFilter)
    if (spaceFilter !== 'all') result = result.filter(e => e.space === spaceFilter)
    return result
  }, [escalations, statusFilter, typeFilter, priorityFilter, spaceFilter])

  const activeFilters = [statusFilter !== 'all', typeFilter !== 'all', priorityFilter !== 'all', spaceFilter !== 'all'].filter(Boolean).length

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-3xl text-parchment">All Escalations</h1>
          <span className="text-sm text-stone">
            {escalations?.length ?? 0} total across {uniqueSpaces.length} spaces
          </span>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-sand/5 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember">
            Failed to load escalations: {error.message}
          </div>
        )}

        {escalations && (
          <>
            <SummaryStats escalations={escalations} />

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Status filters */}
              {(['all', 'needs_human', 'untriaged', 'resolved'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-sand/20 text-sand'
                      : 'bg-stone/10 text-stone hover:text-parchment'
                  }`}
                >
                  {s !== 'all' && statusIcon[s]}
                  {statusLabel[s] ?? s}
                  {s === 'all'
                    ? ` (${escalations.length})`
                    : ` (${escalations.filter(e => e.status === s).length})`
                  }
                </button>
              ))}

              <div className="w-px h-5 bg-border-custom mx-1" />

              {/* More filters toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  showFilters || activeFilters > 1
                    ? 'bg-sand/20 text-sand'
                    : 'bg-stone/10 text-stone hover:text-parchment'
                }`}
              >
                <Filter className="h-3 w-3" />
                Filters
                {activeFilters > 1 && (
                  <span className="bg-sand text-ink rounded-full h-4 min-w-4 flex items-center justify-center text-[10px] font-bold px-1">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>

            {/* Extended filter row */}
            {showFilters && (
              <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-surface/30 border border-border-custom">
                {/* Type filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone uppercase tracking-wider">Type</span>
                  <div className="flex gap-1">
                    {(['all', 'decision', 'blocker', 'question', 'approval', 'improvement', 'agent_plan'] as TypeFilter[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          typeFilter === t
                            ? 'bg-sand/20 text-sand'
                            : 'bg-stone/10 text-stone hover:text-parchment'
                        }`}
                      >
                        {t !== 'all' && typeIcon[t]}
                        {t === 'all' ? 'All' : t === 'agent_plan' ? 'Plan' : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px h-5 bg-border-custom" />

                {/* Priority filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone uppercase tracking-wider">Priority</span>
                  <div className="flex gap-1">
                    {(['all', 'critical', 'high', 'medium', 'low'] as PriorityFilter[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setPriorityFilter(p)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          priorityFilter === p
                            ? 'bg-sand/20 text-sand'
                            : 'bg-stone/10 text-stone hover:text-parchment'
                        }`}
                      >
                        {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px h-5 bg-border-custom" />

                {/* Space filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone uppercase tracking-wider">Space</span>
                  <select
                    value={spaceFilter}
                    onChange={e => setSpaceFilter(e.target.value)}
                    className="bg-ink border border-border-custom rounded px-2 py-1 text-xs text-parchment focus:outline-none focus:border-sand/40"
                  >
                    <option value="all">All spaces</option>
                    {uniqueSpaces.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Clear filters */}
                {activeFilters > 0 && (
                  <button
                    onClick={() => {
                      setStatusFilter('all')
                      setTypeFilter('all')
                      setPriorityFilter('all')
                      setSpaceFilter('all')
                    }}
                    className="text-[10px] text-ember/60 hover:text-ember transition-colors ml-auto"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {/* Escalation list */}
            {filtered.length === 0 && (
              <div className="rounded-lg border border-border-custom bg-surface/50 py-12 text-center">
                <p className="text-sm text-stone">No escalations match your filters.</p>
              </div>
            )}

            {filtered.length > 0 && (
              <div className="space-y-3">
                {filtered.map(e => (
                  <EscalationCard key={e.id} escalation={e} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
