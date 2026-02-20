import { useSpaces } from '@/hooks/useSpaces'
import type { SpaceOverview } from '@/lib/types'

function ProjectPill({ name, counts }: {
  name: string
  counts?: { completed: number; total: number }
}) {
  const done = counts ? counts.completed === counts.total && counts.total > 0 : false
  const label = counts ? `${counts.completed}/${counts.total}` : '—'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
        done
          ? 'border-moss/25 bg-moss/10 text-parchment'
          : 'border-sand/20 bg-sand/5 text-parchment'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${done ? 'bg-moss' : 'bg-sand/60'}`} />
      {name}
      <span className={`text-[10px] ${done ? 'text-moss/70' : 'text-stone/50'}`}>{label}</span>
    </span>
  )
}

function SpaceRow({ space }: { space: SpaceOverview }) {
  const { projects, projectTaskCounts } = space

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-parchment">{space.name}</span>
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          space.status === 'active' ? 'bg-moss' : 'bg-stone/40'
        }`} />
      </div>
      {projects.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {projects.map((project) => {
            const counts = projectTaskCounts?.[project]
            return (
              <ProjectPill
                key={project}
                name={project}
                counts={counts ? { completed: counts.completed, total: counts.total } : undefined}
              />
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-stone/50">No projects</p>
      )}
    </div>
  )
}

export function SpacesSection() {
  const { data: spaces, isLoading } = useSpaces()

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-surface/50 animate-pulse" />
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
    <div className="space-y-4">
      {spaces.map((space) => (
        <SpaceRow key={space.slug} space={space} />
      ))}
    </div>
  )
}
