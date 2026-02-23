import { Link } from 'react-router-dom'
import { useActiveWorkers } from '@/hooks/useSpaces'
import type { ActiveWorker } from '@/lib/types'

function WorkerRow({ worker }: { worker: ActiveWorker }) {
  const to = worker.space
    ? worker.project ? `/spaces/${worker.space}/${worker.project}` : `/spaces/${worker.space}`
    : '/spaces'

  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg border border-border-custom bg-surface/40 px-4 py-3 transition-colors hover:border-sand/30 hover:bg-surface/60"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-parchment truncate">{worker.name}</p>
          <div className="flex items-center gap-2">
            {worker.space && (
              <span className="inline-flex items-center rounded-md bg-sand/10 px-1.5 py-0.5 text-[10px] text-sand/80">
                {worker.space}
                {worker.project && <span className="text-stone/50"> / {worker.project}</span>}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 ml-4">
        <p className="text-sm font-medium text-parchment tabular-nums">
          {worker.runtimeDisplay || '0s'}
        </p>
        <p className="text-xs text-stone/60">runtime</p>
      </div>
    </Link>
  )
}

export function WorkersSection() {
  const { data: workers, isLoading } = useActiveWorkers()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-surface/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!workers || workers.length === 0) {
    return (
      <div className="rounded-lg border border-border-custom bg-surface/50 py-6 text-center">
        <p className="text-sm text-stone">No active workers</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {workers.map((worker) => (
        <WorkerRow key={worker.agentId || worker.name} worker={worker} />
      ))}
    </div>
  )
}
