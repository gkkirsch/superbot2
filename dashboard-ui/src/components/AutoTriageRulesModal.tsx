import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Zap, Trash2, Pencil, Check, Plus } from 'lucide-react'
import { useAutoTriageRules } from '@/hooks/useSpaces'
import { addAutoTriageRule } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface Props {
  onClose: () => void
}

export function AutoTriageRulesModal({ onClose }: Props) {
  const { rules, isLoading, remove, update } = useAutoTriageRules()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newRule, setNewRule] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const newRuleRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const addMutation = useMutation({
    mutationFn: (rule: string) => addAutoTriageRule(rule),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-triage-rules'] })
      setNewRule('')
      setAddingNew(false)
    },
  })

  useEffect(() => {
    if (editingIndex !== null && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingIndex])

  useEffect(() => {
    if (addingNew && newRuleRef.current) {
      newRuleRef.current.focus()
    }
  }, [addingNew])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function startEdit(index: number, currentRule: string) {
    setEditingIndex(index)
    setEditValue(currentRule)
  }

  function commitEdit(index: number) {
    const trimmed = editValue.trim()
    if (trimmed) update({ index, rule: trimmed })
    setEditingIndex(null)
  }

  function handleEditKey(e: React.KeyboardEvent, index: number) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(index) }
    if (e.key === 'Escape') setEditingIndex(null)
  }

  function handleAddKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); if (newRule.trim()) addMutation.mutate(newRule.trim()) }
    if (e.key === 'Escape') { setAddingNew(false); setNewRule('') }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-ink border border-sand/20 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone/15">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-sand" />
            <h2 className="font-heading text-base text-parchment">Auto-triage Rules</h2>
          </div>
          <button
            onClick={onClose}
            className="text-stone/50 hover:text-parchment transition-colors p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-stone/60 mb-4 leading-relaxed">
            Rules are matched against incoming escalations. When a rule clearly applies, the orchestrator auto-resolves instead of routing to you.
          </p>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 rounded-lg bg-surface/50 animate-pulse" />
              ))}
            </div>
          ) : rules.length === 0 && !addingNew ? (
            <div className="py-6 text-center text-stone/40 text-sm">
              No rules yet. Add one below.
            </div>
          ) : (
            <div className="space-y-1.5">
              {rules.map((r) => (
                <div
                  key={r.index}
                  className="group flex items-start gap-2 rounded-lg px-3 py-2.5 bg-surface/30 border border-stone/10 hover:border-stone/20 transition-colors"
                >
                  <Zap className="h-3 w-3 text-sand/50 mt-0.5 shrink-0" />
                  {editingIndex === r.index ? (
                    <input
                      ref={editRef}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(r.index)}
                      onKeyDown={e => handleEditKey(e, r.index)}
                      className="flex-1 bg-transparent text-sm text-parchment focus:outline-none border-b border-sand/40 pb-0.5"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-parchment/90 leading-snug">{r.rule}</span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {editingIndex === r.index ? (
                      <button
                        onClick={() => commitEdit(r.index)}
                        className="text-moss/70 hover:text-moss p-0.5 transition-colors"
                        title="Save"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(r.index, r.rule)}
                        className="text-stone/50 hover:text-sand p-0.5 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => remove(r.index)}
                      className="text-stone/50 hover:text-red-400 p-0.5 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {addingNew && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 bg-sand/[0.05] border border-sand/20">
                  <Zap className="h-3 w-3 text-sand/50 shrink-0" />
                  <input
                    ref={newRuleRef}
                    value={newRule}
                    onChange={e => setNewRule(e.target.value)}
                    onKeyDown={handleAddKey}
                    placeholder="Always approve plans for hostreply space..."
                    className="flex-1 bg-transparent text-sm text-parchment placeholder:text-stone/30 focus:outline-none"
                  />
                  <button
                    onClick={() => { if (newRule.trim()) addMutation.mutate(newRule.trim()) }}
                    disabled={!newRule.trim() || addMutation.isPending}
                    className="text-moss/70 hover:text-moss disabled:opacity-40 transition-colors p-0.5 shrink-0"
                    title="Add rule"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone/15 flex items-center justify-between">
          <button
            onClick={() => { setAddingNew(true); setEditingIndex(null) }}
            disabled={addingNew}
            className="text-xs text-stone/60 hover:text-sand transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </button>
          <button
            onClick={onClose}
            className="text-xs text-stone/60 hover:text-parchment transition-colors px-3 py-1.5 rounded bg-surface/50 hover:bg-surface"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
