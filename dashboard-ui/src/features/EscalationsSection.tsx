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
      <div className="rounded-lg border border-border-custom bg-surface/50 py-12 text-center">
        <MessageCircleQuestion className="h-8 w-8 text-stone/20 mx-auto mb-3" />
        <p className="text-sm text-stone">No escalations right now</p>
        <p className="text-xs text-stone/50 mt-1">When agents need your input, decisions will appear here.</p>
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
