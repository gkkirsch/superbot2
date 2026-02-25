import { useState } from 'react'
import { MessageCircleQuestion, ChevronDown, ChevronUp } from 'lucide-react'
import { useEscalations } from '@/hooks/useSpaces'
import { EscalationCard } from '@/features/EscalationCard'

export function EscalationsSection() {
  const { data: escalations, isLoading } = useEscalations('needs_human')
  const [showAll, setShowAll] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-sand/5 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!escalations || escalations.length === 0) {
    return (
      <div className="rounded-lg border border-border-custom bg-surface/50 py-4 flex items-center gap-2.5 px-4">
        <MessageCircleQuestion className="h-4 w-4 text-stone/30 shrink-0" />
        <p className="text-xs text-stone/50">No escalations right now</p>
      </div>
    )
  }

  const visible = showAll ? escalations : escalations.slice(0, 7)

  return (
    <div className="space-y-3">
      {visible.map((e) => (
        <EscalationCard key={e.id} escalation={e} />
      ))}
      {escalations.length > 7 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1 mx-auto"
        >
          {showAll ? 'Show fewer' : `Show all ${escalations.length} escalations`}
          {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}
