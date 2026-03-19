import { useState } from 'react'
import { Target, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { useGoals } from '@/hooks/useSpaces'
import type { Goal } from '@/lib/types'

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-400' },
  completed: { bg: 'bg-moss/10', text: 'text-moss', dot: 'bg-moss' },
  paused: { bg: 'bg-sand/10', text: 'text-sand', dot: 'bg-sand' },
  abandoned: { bg: 'bg-stone/10', text: 'text-stone', dot: 'bg-stone' },
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

function GoalCard({ goal }: { goal: Goal }) {
  const style = STATUS_STYLES[goal.status] || STATUS_STYLES.active

  return (
    <div className={`rounded-lg border border-border-custom p-3 ${style.bg}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-parchment font-medium leading-snug">{goal.title}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {goal.space && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface text-stone/70 tracking-wider">
                {goal.space}
              </span>
            )}
            {goal.dueDate && <DueBadge dueDate={goal.dueDate} />}
          </div>
          {goal.progress && (
            <p className="text-[11px] text-stone/60 mt-1.5 leading-relaxed">{goal.progress}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function GoalSection() {
  const { data: goals, isLoading } = useGoals()
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

  const activeGoals = goals.filter(g => g.status === 'active' || g.status === 'paused')
  const completedGoals = goals.filter(g => g.status === 'completed' || g.status === 'abandoned')
  const displayGoals = showCompleted ? [...activeGoals, ...completedGoals] : activeGoals

  return (
    <div className="space-y-2">
      {displayGoals.map(goal => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
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
