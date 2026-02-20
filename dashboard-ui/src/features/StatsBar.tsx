interface StatsBarProps {
  pending: number
  inProgress: number
  completed: number
}

export function StatsBar({ pending, inProgress, completed }: StatsBarProps) {
  return (
    <div className="flex items-center gap-3 text-xs text-stone">
      {pending > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-stone" />
          {pending} pending
        </span>
      )}
      {inProgress > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-sand" />
          {inProgress} active
        </span>
      )}
      {completed > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-moss" />
          {completed} done
        </span>
      )}
      {pending === 0 && inProgress === 0 && completed === 0 && (
        <span className="text-stone/50">No tasks</span>
      )}
    </div>
  )
}
