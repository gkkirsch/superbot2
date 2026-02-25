import { useState } from 'react'
import { MessageCircleQuestion, ChevronDown, ChevronUp } from 'lucide-react'
import { useEscalations } from '@/hooks/useSpaces'
import { EscalationCard } from '@/features/EscalationCard'
import { OrchestratorResolvedCard } from '@/features/OrchestratorResolvedSection'

type Filter = 'needs_review' | 'orchestrator'

function FilterPill({ active, onClick, label, count }: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${
        active
          ? 'bg-sand/15 text-sand'
          : 'text-stone/50 hover:text-stone border border-stone/20'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`text-[10px] px-1.5 rounded-full ${active ? 'bg-sand/20' : 'bg-stone/20 text-stone/60'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

export function CombinedEscalationsSection() {
  const [filters, setFilters] = useState<Set<Filter>>(new Set(['needs_review', 'orchestrator']))
  const [showAllNR, setShowAllNR] = useState(false)
  const [showAllOR, setShowAllOR] = useState(false)

  const { data: needsHuman = [], isLoading: loadingNH } = useEscalations('needs_human')
  const { data: resolved = [], isLoading: loadingRes } = useEscalations('resolved')
  const orchestratorResolved = resolved.filter(e => e.resolvedBy === 'orchestrator' && !e.dismissedAt)

  const toggle = (f: Filter) => {
    setFilters(prev => {
      const next = new Set(prev)
      if (next.has(f) && next.size > 1) next.delete(f)
      else next.add(f)
      return next
    })
  }

  const showNR = filters.has('needs_review')
  const showOR = filters.has('orchestrator')
  const isLoading = loadingNH || loadingRes

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex items-center gap-1.5">
        <FilterPill
          active={showNR}
          onClick={() => toggle('needs_review')}
          label="Needs Review"
          count={needsHuman.length}
        />
        <FilterPill
          active={showOR}
          onClick={() => toggle('orchestrator')}
          label="Auto-resolved"
          count={orchestratorResolved.length}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-12 rounded-lg bg-sand/5 animate-pulse" />)}
        </div>
      ) : (
        <>
          {showNR && (
            needsHuman.length === 0 ? (
              <div className="rounded-lg border border-border-custom bg-surface/50 py-4 flex items-center gap-2.5 px-4">
                <MessageCircleQuestion className="h-4 w-4 text-stone/30 shrink-0" />
                <p className="text-xs text-stone/50">No escalations right now</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(showAllNR ? needsHuman : needsHuman.slice(0, 7)).map(e => (
                  <EscalationCard key={e.id} escalation={e} />
                ))}
                {needsHuman.length > 7 && (
                  <button
                    onClick={() => setShowAllNR(!showAllNR)}
                    className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1 mx-auto"
                  >
                    {showAllNR ? 'Show fewer' : `Show all ${needsHuman.length}`}
                    {showAllNR ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            )
          )}

          {showOR && (
            orchestratorResolved.length === 0 ? (
              <div className="rounded-lg border border-border-custom bg-surface/50 py-4 flex items-center gap-2.5 px-4">
                <MessageCircleQuestion className="h-4 w-4 text-stone/30 shrink-0" />
                <p className="text-xs text-stone/50">No auto-resolved decisions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(showAllOR ? orchestratorResolved : orchestratorResolved.slice(0, 5)).map(e => (
                  <OrchestratorResolvedCard key={e.id} escalation={e} />
                ))}
                {orchestratorResolved.length > 5 && (
                  <button
                    onClick={() => setShowAllOR(!showAllOR)}
                    className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1 mx-auto"
                  >
                    {showAllOR ? 'Show fewer' : `Show all ${orchestratorResolved.length}`}
                    {showAllOR ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
