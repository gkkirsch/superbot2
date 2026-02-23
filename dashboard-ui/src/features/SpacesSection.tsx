import { Link } from 'react-router-dom'
import { useSpaces, useActiveWorkers } from '@/hooks/useSpaces'
import type { SpaceOverview, ActiveWorker } from '@/lib/types'

function WorkerIndicator({ workers }: { workers: ActiveWorker[] }) {
  if (workers.length === 0) return null
  const label = workers.length === 1 ? 'Worker active' : `${workers.length} workers`

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400/80">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      {label}
    </span>
  )
}

function SpaceCard({ space, workers }: { space: SpaceOverview; workers: ActiveWorker[] }) {
  const projectCount = space.projects.length
  const { completed, total } = space.taskCounts

  return (
    <Link
      to={`/spaces/${space.slug}`}
      className="flex items-center justify-between rounded-lg border border-border-custom bg-surface/40 px-4 py-3 transition-colors hover:border-sand/30 hover:bg-surface/60"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`h-2 w-2 rounded-full shrink-0 ${
          space.status === 'active' ? 'bg-moss' : 'bg-stone/40'
        }`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-parchment truncate">{space.name}</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-stone/60 truncate">
              {projectCount} {projectCount === 1 ? 'project' : 'projects'}
            </p>
            <WorkerIndicator workers={workers} />
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 ml-4">
        <p className="text-sm font-medium text-parchment tabular-nums">
          {completed}<span className="text-stone/40">/{total}</span>
        </p>
        <p className="text-xs text-stone/60">tasks done</p>
      </div>
    </Link>
  )
}

export function SpacesSection() {
  const { data: spaces, isLoading } = useSpaces()
  const { data: workers } = useActiveWorkers()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-surface/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!spaces || spaces.length === 0) {
    return (
      <div className="rounded-lg border border-border-custom bg-surface/50 py-6 text-center">
        <p className="text-sm text-stone">No spaces found</p>
      </div>
    )
  }

  const workersBySpace = (workers || []).reduce<Record<string, ActiveWorker[]>>((acc, w) => {
    if (!acc[w.space]) acc[w.space] = []
    acc[w.space].push(w)
    return acc
  }, {})

  return (
    <div className="space-y-2">
      {spaces.map((space) => (
        <SpaceCard key={space.slug} space={space} workers={workersBySpace[space.slug] || []} />
      ))}
    </div>
  )
}
