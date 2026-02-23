import { useState, useRef } from 'react'
import { MessageCircleQuestion, ChevronDown, ChevronUp, Check, CheckCircle2, PenLine, AlertTriangle, HelpCircle, ShieldCheck, Trash2, Lightbulb, ClipboardList, Zap } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveEscalation, deleteEscalation, addAutoTriageRule } from '@/lib/api'
import { MarkdownContent } from '@/features/MarkdownContent'
import type { Escalation } from '@/lib/types'

const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  decision: { icon: <MessageCircleQuestion className="h-4 w-4" />, color: 'text-sand' },
  blocker: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-ember' },
  question: { icon: <HelpCircle className="h-4 w-4" />, color: 'text-parchment' },
  approval: { icon: <ShieldCheck className="h-4 w-4" />, color: 'text-moss' },
  improvement: { icon: <Lightbulb className="h-4 w-4" />, color: 'text-amber-400' },
  agent_plan: { icon: <ClipboardList className="h-4 w-4" />, color: 'text-sky-400' },
}


interface EscalationCardProps {
  escalation: Escalation
  showSpace?: boolean
}

export function EscalationCard({ escalation, showSpace = true }: EscalationCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customText, setCustomText] = useState('')
  const customInputRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: string }) =>
      resolveEscalation(id, resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalations'] })
      queryClient.invalidateQueries({ queryKey: ['space-escalations'] })
      setResolving(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEscalation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalations'] })
      queryClient.invalidateQueries({ queryKey: ['space-escalations'] })
    },
  })

  const [ruleAdded, setRuleAdded] = useState(false)
  const [ruleError, setRuleError] = useState<string | null>(null)

  const autoRuleMutation = useMutation({
    mutationFn: () => addAutoTriageRule(
      escalation.suggestedAutoRule!,
      escalation.id,
      escalation.space,
      escalation.project,
    ),
    onSuccess: () => {
      setRuleAdded(true)
      setRuleError(null)
    },
    onError: (err: Error) => {
      setRuleError(err.message)
    },
  })

  const handleResolve = (label: string) => {
    setResolving(true)
    mutation.mutate({ id: escalation.id, resolution: label })
  }

  const typeInfo = typeConfig[escalation.type] ?? typeConfig.question

  return (
    <div className="rounded-lg border border-sand/20 bg-sand/[0.03] overflow-hidden transition-all duration-200 hover:border-sand/35">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left group"
      >
        <span className={`shrink-0 mt-0.5 ${typeInfo.color}`}>{typeInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {showSpace && escalation.space && (
              <span className="text-[10px] font-mono text-stone bg-stone/10 rounded-full px-2 py-0.5">
                {escalation.spaceName || escalation.space}
              </span>
            )}
            {escalation.project && (
              <span className="text-[10px] font-mono text-stone/60">
                {escalation.project}
              </span>
            )}
            {escalation.blocksProject && (
              <span className="text-[10px] text-ember">
                blocks project
              </span>
            )}
            {escalation.acknowledgedAt && (
              <span className="text-[10px] text-moss/70 bg-moss/10 rounded-full px-1.5 py-0.5">
                acknowledged
              </span>
            )}
          </div>
          <p className="text-sm text-parchment font-medium leading-snug">
            {escalation.question}
          </p>
        </div>
        <div className="shrink-0 mt-0.5">
          {expanded
            ? <ChevronUp className="h-4 w-4 text-stone/50 group-hover:text-stone" />
            : <ChevronDown className="h-4 w-4 text-stone/50 group-hover:text-stone" />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 animate-fade-up" style={{ animationDuration: '0.2s' }}>
          {escalation.context && (
            <MarkdownContent content={escalation.context} className="text-stone/80 ml-7" />
          )}
          {escalation.status === 'needs_human' && (
            <div className="ml-7 space-y-2">
              {(escalation.suggestedAnswers ?? []).map((answer) => (
                <button
                  key={answer.label}
                  onClick={() => handleResolve(answer.label)}
                  disabled={resolving}
                  className="w-full text-left rounded-md border border-border-custom bg-surface/50 px-3 py-2.5 transition-all duration-150 hover:border-sand/40 hover:bg-surface group/answer disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border border-stone/30 shrink-0 flex items-center justify-center group-hover/answer:border-sand/60 transition-colors">
                      <Check className="h-2.5 w-2.5 text-sand opacity-0 group-hover/answer:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-sm text-parchment font-medium">{answer.label}</span>
                  </div>
                  {answer.description && (
                    <p className="text-xs text-stone/70 mt-1 ml-6">{answer.description}</p>
                  )}
                </button>
              ))}

              {!showCustom ? (
                <button
                  onClick={() => {
                    setShowCustom(true)
                    setTimeout(() => customInputRef.current?.focus(), 50)
                  }}
                  className="w-full text-left rounded-md border border-dashed border-stone/20 px-3 py-2.5 transition-all duration-150 hover:border-sand/30 hover:bg-surface/30 group/custom"
                >
                  <div className="flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-stone/40 group-hover/custom:text-sand/60 transition-colors" />
                    <span className="text-sm text-stone/50 group-hover/custom:text-stone/80 transition-colors">Custom response...</span>
                  </div>
                </button>
              ) : (
                <div className="rounded-md border border-sand/30 bg-surface/50 p-3 space-y-2">
                  <textarea
                    ref={customInputRef}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Type your response..."
                    rows={2}
                    className="w-full bg-transparent text-sm text-parchment placeholder:text-stone/40 resize-none focus:outline-none leading-relaxed"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setShowCustom(false); setCustomText('') }}
                      className="text-xs text-stone/60 hover:text-stone px-2 py-1 rounded transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { if (customText.trim()) handleResolve(customText.trim()) }}
                      disabled={!customText.trim() || resolving}
                      className="text-xs text-ink bg-sand hover:bg-sand/90 px-3 py-1 rounded font-medium transition-colors disabled:opacity-40"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              )}

              {/* Delete action */}
              <div className="flex items-center pt-1 border-t border-border-custom mt-2">
                <button
                  onClick={() => deleteMutation.mutate(escalation.id)}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-stone/60 hover:text-ember transition-colors flex items-center gap-1 disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {escalation.status === 'resolved' && (
        <div className="px-4 pb-3 ml-7 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-moss">
            <CheckCircle2 className="h-3 w-3" />
            <span>Resolved: {escalation.resolution}</span>
          </div>
          {escalation.suggestedAutoRule && !ruleAdded && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => autoRuleMutation.mutate()}
                disabled={autoRuleMutation.isPending}
                className="text-xs text-sand/70 hover:text-sand transition-colors flex items-center gap-1 disabled:opacity-40"
              >
                <Zap className="h-3 w-3" />
                Add to auto-rules
              </button>
              {ruleError && (
                <span className="text-xs text-ember">{ruleError}</span>
              )}
            </div>
          )}
          {ruleAdded && (
            <div className="flex items-center gap-1 text-xs text-moss/70">
              <Zap className="h-3 w-3" />
              <span>Rule added</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
