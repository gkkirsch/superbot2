import { useState } from 'react'
import { Check, Pause, PenLine, Loader2, Play } from 'lucide-react'
import { useCards, useCardItems, useUpdateCardItem } from '@/hooks/useSpaces'
import type { CardItem } from '@/lib/types'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-sky-500/20', text: 'text-sky-400', label: 'Active' },
  completed: { bg: 'bg-moss/20', text: 'text-moss', label: 'Completed' },
  paused: { bg: 'bg-sand/20', text: 'text-sand', label: 'Paused' },
  abandoned: { bg: 'bg-stone/20', text: 'text-stone', label: 'Abandoned' },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.active
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

function SpaceBadge({ space }: { space: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-surface text-stone/70 tracking-wider">
      {space}
    </span>
  )
}

interface GoalItemProps {
  item: CardItem
  onAction: (itemId: string, update: Record<string, unknown>) => void
  isPending: boolean
}

function GoalItem({ item, onAction, isPending }: GoalItemProps) {
  const [editing, setEditing] = useState(false)
  const [editNotes, setEditNotes] = useState(item.notes || '')
  const [editProgress, setEditProgress] = useState(item.progress || '')

  const handleComplete = () => onAction(item.id, { status: 'completed' })
  const handlePause = () => onAction(item.id, { status: 'paused' })
  const handleResume = () => onAction(item.id, { status: 'active' })

  const handleSaveEdit = () => {
    const updates: Record<string, unknown> = {}
    if (editNotes !== (item.notes || '')) updates.notes = editNotes
    if (editProgress !== (item.progress || '')) updates.progress = editProgress
    if (Object.keys(updates).length > 0) {
      onAction(item.id, updates)
    }
    setEditing(false)
  }

  const borderColor = item.status === 'completed'
    ? 'border-moss/30 bg-moss/[0.03]'
    : item.status === 'paused'
      ? 'border-sand/20 bg-sand/[0.02]'
      : item.status === 'abandoned'
        ? 'border-stone/20 opacity-50'
        : 'border-border-custom'

  return (
    <div className={`rounded-lg border p-3 transition-all ${borderColor}`}>
      {/* Title */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm text-parchment font-medium leading-snug">{item.title || ''}</p>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <StatusBadge status={item.status} />
        {item.space && <SpaceBadge space={item.space} />}
        {item.progress && (
          <span className="text-[10px] text-stone/60">{item.progress}</span>
        )}
        {item.dueDate && (
          <span className="text-[10px] text-stone/50">due {item.dueDate}</span>
        )}
      </div>

      {/* Notes */}
      {editing ? (
        <div className="mb-2 space-y-2">
          <div>
            <label className="text-[10px] text-stone/50 uppercase tracking-wider block mb-1">Progress</label>
            <input
              value={editProgress}
              onChange={e => setEditProgress(e.target.value)}
              placeholder="e.g. 3/10 or 75%"
              className="w-full bg-surface/50 text-parchment text-xs rounded-md px-2 py-1.5 border border-sand/20 focus:border-sand/40 focus:outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] text-stone/50 uppercase tracking-wider block mb-1">Notes</label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Add context or notes..."
              className="w-full bg-surface/50 text-parchment text-xs rounded-md p-2 border border-sand/20 focus:border-sand/40 focus:outline-none resize-none"
              rows={3}
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handleSaveEdit}
              disabled={isPending}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-sand/20 text-sand hover:bg-sand/30 transition-colors"
            >
              <Check className="h-3 w-3" /> Save
            </button>
            <button
              onClick={() => { setEditNotes(item.notes || ''); setEditProgress(item.progress || ''); setEditing(false) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-surface text-stone hover:bg-surface/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        item.notes && (
          <p className="text-xs text-stone/60 leading-relaxed mb-2">{item.notes}</p>
        )
      )}

      {/* Actions */}
      {item.status === 'active' && !editing && (
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={handleComplete}
            disabled={isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-moss/20 text-moss hover:bg-moss/30 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Complete
          </button>
          <button
            onClick={handlePause}
            disabled={isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-surface text-stone hover:bg-surface/80 transition-colors disabled:opacity-50"
          >
            <Pause className="h-3 w-3" />
            Pause
          </button>
          <button
            onClick={() => { setEditNotes(item.notes || ''); setEditProgress(item.progress || ''); setEditing(true) }}
            disabled={isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-surface text-stone hover:bg-surface/80 transition-colors disabled:opacity-50"
          >
            <PenLine className="h-3 w-3" />
            Update
          </button>
        </div>
      )}

      {item.status === 'paused' && !editing && (
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={handleResume}
            disabled={isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Resume
          </button>
          <button
            onClick={() => { setEditNotes(item.notes || ''); setEditProgress(item.progress || ''); setEditing(true) }}
            disabled={isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-surface text-stone hover:bg-surface/80 transition-colors disabled:opacity-50"
          >
            <PenLine className="h-3 w-3" />
            Update
          </button>
        </div>
      )}

      {/* Status badge for completed */}
      {item.status === 'completed' && !editing && (
        <div className="flex items-center gap-1 text-[10px] text-moss pt-1">
          <Check className="h-3 w-3" /> Completed
        </div>
      )}
    </div>
  )
}

export function GoalSection() {
  const { data: cards, isLoading: cardsLoading } = useCards()
  const goalCard = cards?.find(c => c.skillId === 'goals')
  const { data, isLoading: itemsLoading } = useCardItems(goalCard?.skillId || '')
  const updateMutation = useUpdateCardItem()
  const [showCompleted, setShowCompleted] = useState(false)

  const isLoading = cardsLoading || (goalCard && itemsLoading)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="rounded-lg border border-border-custom p-3 animate-pulse">
            <div className="h-3.5 bg-surface rounded w-2/3 mb-2" />
            <div className="h-3 bg-surface rounded w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  if (!goalCard) {
    return <p className="text-xs text-stone/40 py-2 text-center">No goals configured</p>
  }

  const items = data?.items || []
  const activeItems = items.filter(i => i.status === 'active' || i.status === 'paused')
  const completedItems = items.filter(i => i.status === 'completed' || i.status === 'abandoned')
  const displayItems = showCompleted ? [...activeItems, ...completedItems] : activeItems

  const handleAction = (itemId: string, update: Record<string, unknown>) => {
    updateMutation.mutate({ skillId: goalCard.skillId, itemId, update })
  }

  if (items.length === 0) {
    return <p className="text-xs text-stone/40 py-2 text-center">No goals yet</p>
  }

  return (
    <div className="space-y-2">
      {displayItems.map(item => (
        <GoalItem
          key={item.id}
          item={item}
          onAction={handleAction}
          isPending={updateMutation.isPending}
        />
      ))}
      {completedItems.length > 0 && (
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="text-[10px] text-stone/50 hover:text-stone transition-colors w-full text-center py-1"
        >
          {showCompleted ? 'Hide completed' : `Show ${completedItems.length} completed`}
        </button>
      )}
    </div>
  )
}
