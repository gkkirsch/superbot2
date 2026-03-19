import { useState } from 'react'
import { Check, Pause, PenLine, Loader2, Play, Trash2, Plus, X, Target, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { useCardItems, useSpaceCardItems, useUpdateCardItem, useDeleteCardItem, useCreateCardItem, useSpaces, useGoals } from '@/hooks/useSpaces'
import type { CardDefinition, CardItem, Goal } from '@/lib/types'

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-400' },
  completed: { bg: 'bg-moss/10', text: 'text-moss', dot: 'bg-moss' },
  paused: { bg: 'bg-sand/10', text: 'text-sand', dot: 'bg-sand' },
  abandoned: { bg: 'bg-stone/10', text: 'text-stone', dot: 'bg-stone' },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.active
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  )
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  const due = new Date(dateStr)
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function DueBadge({ dueDate }: { dueDate: string }) {
  const days = daysUntil(dueDate)
  const isOverdue = days < 0
  const isUrgent = days >= 0 && days <= 7
  const color = isOverdue ? 'text-ember' : isUrgent ? 'text-sand' : 'text-stone/50'
  const label = isOverdue
    ? `${Math.abs(days)}d overdue`
    : days === 0
      ? 'Due today'
      : `${days}d left`

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${color}`}>
      <Calendar className="h-3 w-3" />
      {label}
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
  onDelete: (itemId: string) => void
  isPending: boolean
}

function GoalItem({ item, onAction, onDelete, isPending }: GoalItemProps) {
  const [editing, setEditing] = useState(false)
  const [editNotes, setEditNotes] = useState(item.notes || '')
  const [editProgress, setEditProgress] = useState(item.progress || '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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

  const handleDelete = () => {
    if (confirmingDelete) {
      onDelete(item.id)
      setConfirmingDelete(false)
    } else {
      setConfirmingDelete(true)
    }
  }

  const borderColor = item.status === 'completed'
    ? 'border-moss/30 bg-moss/[0.03]'
    : item.status === 'paused'
      ? 'border-sand/20 bg-sand/[0.02]'
      : item.status === 'abandoned'
        ? 'border-stone/20 opacity-50'
        : 'border-border-custom'

  return (
    <div className={`group/goal rounded-lg border p-3 transition-all ${borderColor}`}>
      {/* Title + Delete */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm text-parchment font-medium leading-snug">{item.title || ''}</p>
        {confirmingDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="p-0.5 text-stone/40 hover:text-stone transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="p-1 text-stone/30 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover/goal:opacity-100 focus:opacity-100"
            title="Delete goal"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <StatusBadge status={item.status} />
        {!!item.space && <SpaceBadge space={String(item.space)} />}
        {!!item.progress && (
          <span className="text-[10px] text-stone/60">{String(item.progress)}</span>
        )}
        {!!item.dueDate && (
          <span className="text-[10px] text-stone/50">due {String(item.dueDate)}</span>
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

function AddGoalForm({ onSubmit, isPending, space }: { onSubmit: (goal: Record<string, unknown>) => void; isPending: boolean; space?: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selectedSpace, setSelectedSpace] = useState(space || '')
  const { data: spaces } = useSpaces()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const id = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    onSubmit({
      id,
      title: title.trim(),
      status: 'active',
      progress: '',
      dueDate: dueDate.trim(),
      notes: notes.trim(),
      space: selectedSpace,
    })
    setTitle('')
    setNotes('')
    setDueDate('')
    setSelectedSpace(space || '')
    setOpen(false)
  }

  const spaceOptions = spaces || []

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-dashed border-border-custom text-stone/50 hover:text-parchment hover:border-stone/40 transition-colors w-full justify-center"
      >
        <Plus className="h-3.5 w-3.5" />
        Add goal
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border-custom p-3 space-y-2">
      <div>
        <label className="text-[10px] text-stone/50 uppercase tracking-wider block mb-1">Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What do you want to achieve?"
          className="w-full bg-surface/50 text-parchment text-xs rounded-md px-2 py-1.5 border border-sand/20 focus:border-sand/40 focus:outline-none"
          autoFocus
          required
        />
      </div>
      {!space && spaceOptions.length > 0 && (
        <div>
          <label className="text-[10px] text-stone/50 uppercase tracking-wider block mb-1">Space</label>
          <select
            value={selectedSpace}
            onChange={e => setSelectedSpace(e.target.value)}
            className="w-full bg-surface/50 text-parchment text-xs rounded-md px-2 py-1.5 border border-sand/20 focus:border-sand/40 focus:outline-none"
          >
            <option value="">Select a space</option>
            {spaceOptions.map(s => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="text-[10px] text-stone/50 uppercase tracking-wider block mb-1">Notes <span className="normal-case">(optional)</span></label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add context or details..."
          className="w-full bg-surface/50 text-parchment text-xs rounded-md p-2 border border-sand/20 focus:border-sand/40 focus:outline-none resize-none"
          rows={2}
        />
      </div>
      <div>
        <label className="text-[10px] text-stone/50 uppercase tracking-wider block mb-1">Due date <span className="normal-case">(optional)</span></label>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="bg-surface/50 text-parchment text-xs rounded-md px-2 py-1.5 border border-sand/20 focus:border-sand/40 focus:outline-none"
        />
      </div>
      <div className="flex gap-1.5 pt-1">
        <button
          type="submit"
          disabled={isPending || !title.trim()}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add goal
        </button>
        <button
          type="button"
          onClick={() => { setTitle(''); setNotes(''); setDueDate(''); setSelectedSpace(space || ''); setOpen(false) }}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-surface text-stone hover:bg-surface/80 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// Renderer interface: accepts a CardDefinition from the registry
export function GoalRenderer({ card, space }: { card: CardDefinition; space?: string }) {
  const globalQuery = useCardItems(space ? '' : card.skillId)
  const spaceQuery = useSpaceCardItems(space ? card.skillId : '', space ?? '')
  const { data, isLoading } = space ? spaceQuery : globalQuery
  const updateMutation = useUpdateCardItem()
  const deleteMutation = useDeleteCardItem()
  const createMutation = useCreateCardItem()
  const [showCompleted, setShowCompleted] = useState(false)

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

  const items = data?.items || []
  const activeItems = items.filter(i => i.status === 'active' || i.status === 'paused')
  const completedItems = items.filter(i => i.status === 'completed' || i.status === 'abandoned')
  const displayItems = showCompleted ? [...activeItems, ...completedItems] : activeItems

  const handleAction = (itemId: string, update: Record<string, unknown>) => {
    updateMutation.mutate({ skillId: card.skillId, itemId, update })
  }

  const handleDelete = (itemId: string) => {
    deleteMutation.mutate({ skillId: card.skillId, itemId })
  }

  const handleCreate = (goal: Record<string, unknown>) => {
    createMutation.mutate({ skillId: card.skillId, item: goal })
  }

  return (
    <div className="space-y-2">
      {displayItems.map(item => (
        <GoalItem
          key={item.id}
          item={item}
          onAction={handleAction}
          onDelete={handleDelete}
          isPending={updateMutation.isPending || deleteMutation.isPending}
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
      <AddGoalForm onSubmit={handleCreate} isPending={createMutation.isPending} space={space} />
    </div>
  )
}

// Color palette for space badges — deterministic per space name
const SPACE_COLORS = [
  { bg: 'bg-sky-500/15', text: 'text-sky-400', dot: 'bg-sky-400' },
  { bg: 'bg-violet-500/15', text: 'text-violet-400', dot: 'bg-violet-400' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400', dot: 'bg-rose-400' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400', dot: 'bg-fuchsia-400' },
  { bg: 'bg-lime-500/15', text: 'text-lime-400', dot: 'bg-lime-400' },
]

function spaceColor(space: string) {
  let hash = 0
  for (let i = 0; i < space.length; i++) hash = ((hash << 5) - hash + space.charCodeAt(i)) | 0
  return SPACE_COLORS[Math.abs(hash) % SPACE_COLORS.length]
}

function ColoredSpaceBadge({ space }: { space: string }) {
  const c = spaceColor(space)
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wider ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {space}
    </span>
  )
}

const COLLAPSED_LIMIT = 3
const PROGRESS_TRUNCATE = 120

// GoalCard: compact read-only card for the aggregated cross-space goals view
function GoalCard({ goal }: { goal: Goal }) {
  const style = STATUS_STYLES[goal.status] || STATUS_STYLES.active
  const [progressExpanded, setProgressExpanded] = useState(false)
  const progressLong = (goal.progress?.length ?? 0) > PROGRESS_TRUNCATE

  return (
    <div className={`rounded-lg border border-border-custom p-3 ${style.bg}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-parchment font-medium leading-snug">{goal.title}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {goal.space && <ColoredSpaceBadge space={goal.space} />}
            {goal.dueDate ? (
              <DueBadge dueDate={goal.dueDate} />
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-stone/40">
                <Calendar className="h-3 w-3" />
                No deadline
              </span>
            )}
          </div>
          {goal.progress && (
            <div className="mt-1.5">
              <p className="text-[11px] text-stone/60 leading-relaxed">
                {progressLong && !progressExpanded
                  ? goal.progress.slice(0, PROGRESS_TRUNCATE) + '...'
                  : goal.progress}
              </p>
              {progressLong && (
                <button
                  onClick={() => setProgressExpanded(!progressExpanded)}
                  className="text-[10px] text-stone/40 hover:text-stone/60 transition-colors mt-0.5"
                >
                  {progressExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Sort: overdue first, then soonest due date, no-deadline last
function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    const now = Date.now()
    const aOverdue = a.dueDate ? new Date(a.dueDate).getTime() < now : false
    const bOverdue = b.dueDate ? new Date(b.dueDate).getTime() < now : false
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return 0
  })
}

// GoalSection: aggregated cross-space goals view (used by GoalsDashboardSection)
export function GoalSection() {
  const { data: goals, isLoading } = useGoals()
  const [expanded, setExpanded] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="rounded-lg border border-border-custom p-3 animate-pulse">
            <div className="flex items-start gap-2">
              <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-surface" />
              <div className="flex-1">
                <div className="h-3.5 bg-surface rounded w-2/3 mb-2" />
                <div className="h-3 bg-surface rounded w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!goals || goals.length === 0) {
    return (
      <div className="text-center py-4">
        <Target className="h-5 w-5 text-stone/30 mx-auto mb-1.5" />
        <p className="text-xs text-stone/40">No goals yet</p>
      </div>
    )
  }

  const activeGoals = sortGoals(goals.filter(g => g.status === 'active' || g.status === 'paused'))
  const completedGoals = goals.filter(g => g.status === 'completed' || g.status === 'abandoned')

  const visibleActive = expanded ? activeGoals : activeGoals.slice(0, COLLAPSED_LIMIT)
  const hiddenCount = activeGoals.length - COLLAPSED_LIMIT
  const displayGoals = showCompleted ? [...visibleActive, ...completedGoals] : visibleActive

  return (
    <div className="space-y-2">
      {displayGoals.map(goal => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center justify-center gap-1 text-[10px] text-stone/50 hover:text-stone transition-colors w-full py-1"
        >
          <ChevronDown className="h-3 w-3" />
          Show {hiddenCount} more goal{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}
      {expanded && activeGoals.length > COLLAPSED_LIMIT && (
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center justify-center gap-1 text-[10px] text-stone/50 hover:text-stone transition-colors w-full py-1"
        >
          <ChevronUp className="h-3 w-3" />
          Show less
        </button>
      )}
      {completedGoals.length > 0 && (
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center justify-center gap-1 text-[10px] text-stone/50 hover:text-stone transition-colors w-full py-1"
        >
          {showCompleted ? (
            <><ChevronUp className="h-3 w-3" /> Hide completed</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> Show {completedGoals.length} completed</>
          )}
        </button>
      )}
    </div>
  )
}
