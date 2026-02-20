import { useSpaces } from '@/hooks/useSpaces'
import type { SpaceOverview } from '@/lib/types'

function SpaceCard({ space }: { space: SpaceOverview }) {
  const projectCount = space.projects.length
  const { completed, total } = space.taskCounts

  return (
    <div className="flex items-center justify-between rounded-lg border border-border-custom bg-surface/40 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`h-2 w-2 rounded-full shrink-0 ${
          space.status === 'active' ? 'bg-moss' : 'bg-stone/40'
        }`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-parchment truncate">{space.name}</p>
          <p className="text-xs text-stone/60 truncate">
            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0 ml-4">
        <p className="text-sm font-medium text-parchment tabular-nums">
          {completed}<span className="text-stone/40">/{total}</span>
        </p>
        <p className="text-xs text-stone/60">tasks done</p>
      </div>
    </div>
  )
}

export function SpacesSection() {
  const { data: spaces, isLoading } = useSpaces()

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

  return (
    <div className="space-y-2">
      {spaces.map((space) => (
        <SpaceCard key={space.slug} space={space} />
      ))}
    </div>
  )
}
