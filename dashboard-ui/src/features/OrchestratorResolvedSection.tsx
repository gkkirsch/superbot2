import { useState } from 'react'
import { Bot, ChevronDown, ChevronUp, Check, PenLine } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEscalations } from '@/hooks/useSpaces'
import { resolveEscalation, dismissEscalation } from '@/lib/api'
import { MarkdownContent } from '@/features/MarkdownContent'
import { SectionHeader } from '@/components/SectionHeader'
import type { Escalation } from '@/lib/types'

function OrchestratorResolvedCard({ escalation }: { escalation: Escalation }) {
  const [expanded, setExpanded] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const [overrideText, setOverrideText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: string }) =>
      resolveEscalation(id, resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalations'] })
      queryClient.invalidateQueries({ queryKey: ['space-escalations'] })
      setOverriding(false)
      setOverrideText('')
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissEscalation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalations'] })
    },
  })

  const handleOverride = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (overrideText.trim()) {
      setError(null)
      mutation.mutate({ id: escalation.id, resolution: overrideText.trim() })
    }
  }

  const resolvedDate = escalation.resolvedAt
    ? new Date(escalation.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="rounded-lg border border-stone/15 bg-surface/20 overflow-hidden transition-all duration-200 hover:border-stone/25 group/card">
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left cursor-pointer"
        role="button"
      >
        <Bot className="h-4 w-4 text-stone/50 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-parchment/90 leading-snug">{escalation.question}</p>
          <p className="text-xs text-moss/80 mt-1 line-clamp-1">{escalation.resolution}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {resolvedDate && <span className="text-[10px] text-stone/40">{resolvedDate}</span>}
          <button
            onClick={(e) => { e.stopPropagation(); dismissMutation.mutate(escalation.id) }}
            disabled={dismissMutation.isPending}
            className="text-stone/40 hover:text-sand/70 transition-colors p-1.5 shrink-0 rounded"
            title="Dismiss"
          >
            <Check className="h-4 w-4" />
          </button>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-stone/40" />
            : <ChevronDown className="h-3.5 w-3.5 text-stone/40" />
          }
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3.5 space-y-2.5 ml-7">
          {escalation.context && (
            <MarkdownContent content={escalation.context} className="text-stone/70" />
          )}

          {(escalation.suggestedAnswers ?? []).length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-stone/50 uppercase tracking-wider">Options were</span>
              {escalation.suggestedAnswers.map((a) => (
                <div key={a.label} className="text-xs text-stone/60 pl-2 border-l border-stone/10">
                  <span className="text-stone/80">{a.label}</span>
                  {a.description && <span className="text-stone/50"> — {a.description}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="pt-1 border-t border-stone/10">
            <div className="flex items-center gap-1.5 text-xs text-moss/70 mb-2">
              <Check className="h-3 w-3" />
              <span>Orchestrator decided: {escalation.resolution}</span>
            </div>

            {!overriding ? (
              <button
                onClick={(e) => { e.stopPropagation(); setOverriding(true) }}
                className="text-xs text-stone/50 hover:text-sand transition-colors flex items-center gap-1"
              >
                <PenLine className="h-3 w-3" />
                Override
              </button>
            ) : (
              <div className="rounded-md border border-sand/25 bg-surface/40 p-2.5 space-y-2">
                <textarea
                  value={overrideText}
                  onChange={(e) => setOverrideText(e.target.value)}
                  placeholder="Your decision..."
                  rows={2}
                  autoFocus
                  className="w-full bg-transparent text-sm text-parchment placeholder:text-stone/40 resize-none focus:outline-none leading-relaxed"
                />
                {error && (
                  <p className="text-xs text-ember">{error}</p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setOverriding(false); setOverrideText(''); setError(null) }}
                    className="text-xs text-stone/60 hover:text-stone px-2 py-1 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleOverride}
                    disabled={!overrideText.trim() || mutation.isPending}
                    className="text-xs text-ink bg-sand hover:bg-sand/90 px-3 py-1 rounded font-medium transition-colors disabled:opacity-40"
                  >
                    {mutation.isPending ? 'Saving...' : 'Override'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function OrchestratorResolvedSection() {
  const { data: resolved, isLoading } = useEscalations('resolved')
  const [showAll, setShowAll] = useState(false)

  const orchestratorResolved = (resolved ?? []).filter(e => e.resolvedBy === 'orchestrator' && !e.dismissedAt)

  const visible = showAll ? orchestratorResolved : orchestratorResolved.slice(0, 5)

  return (
    <section className="mt-8 group" data-section="orchestrator-resolved">
      <SectionHeader title="Orchestrator Decisions" icon={Bot} />
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-stone/5 animate-pulse" />
          ))}
        </div>
      ) : orchestratorResolved.length === 0 ? (
        <div className="rounded-lg border border-border-custom bg-surface/50 py-8 text-center">
          <Bot className="h-6 w-6 text-stone/20 mx-auto mb-2" />
          <p className="text-sm text-stone">No orchestrator decisions to review</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <OrchestratorResolvedCard key={e.id} escalation={e} />
          ))}
          {orchestratorResolved.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1 mx-auto"
            >
              {showAll ? 'Show fewer' : `Show all ${orchestratorResolved.length}`}
              {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
