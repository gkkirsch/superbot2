import { useSpaces, useActiveWorkers } from '@/hooks/useSpaces'
import { SpaceCard } from '@/features/SpaceCard'
import type { SpaceOverview as SpaceOverviewType, ActiveWorker } from '@/lib/types'

const statusOrder: Record<string, number> = {
  active: 0,
  in_progress: 0,
  planning: 1,
  pending: 1,
  archived: 2,
  completed: 2,
}

function groupByStatus(spaces: SpaceOverviewType[]): { label: string; spaces: SpaceOverviewType[] }[] {
  const groups: Record<string, SpaceOverviewType[]> = {}

  for (const space of spaces) {
    const status = (space.status || 'active').toLowerCase()
    const key = statusOrder[status] !== undefined ? status : 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(space)
  }

  const entries = Object.entries(groups)
  entries.sort(([a], [b]) => (statusOrder[a] ?? 99) - (statusOrder[b] ?? 99))

  return entries.map(([key, items]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' '),
    spaces: items,
  }))
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border-custom bg-[hsl(var(--card))] p-6 animate-pulse">
      <div className="h-5 w-2/3 rounded bg-stone/10 mb-3" />
      <div className="h-4 w-full rounded bg-stone/10 mb-2" />
      <div className="h-4 w-4/5 rounded bg-stone/10 mb-4" />
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-16 rounded-full bg-stone/10" />
        <div className="h-5 w-20 rounded-full bg-stone/10" />
      </div>
      <div className="h-3 w-1/2 rounded bg-stone/10" />
    </div>
  )
}

export function SpacesOverview() {
  const { data: spaces, isLoading, error } = useSpaces()
  const { data: workers } = useActiveWorkers()

  const workersBySpace = (workers || []).reduce<Record<string, ActiveWorker[]>>((acc, w) => {
    if (!acc[w.space]) acc[w.space] = []
    acc[w.space].push(w)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-10">
          <h1 className="font-heading text-4xl text-parchment">Spaces</h1>
        </header>

        {error && (
          <div className="rounded-lg border border-ember/30 bg-ember/5 px-6 py-4 text-ember">
            Failed to load spaces: {error.message}
          </div>
        )}

        {isLoading && (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mb-6 break-inside-avoid">
                <SkeletonCard />
              </div>
            ))}
          </div>
        )}

        {spaces && spaces.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-stone">
            <p className="font-heading text-lg mb-2">No spaces found</p>
            <p className="text-sm">Create a space to get started.</p>
          </div>
        )}

        {spaces && spaces.length > 0 && (
          <div className="space-y-10">
            {groupByStatus(spaces).map((group) => (
              <section key={group.label}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="font-heading text-lg text-parchment">
                    {group.label}
                  </h2>
                  <span className="text-xs text-stone bg-stone/10 rounded-full px-2 py-0.5">
                    {group.spaces.length}
                  </span>
                </div>
                <div className="columns-1 sm:columns-2 lg:columns-3 gap-6">
                  {group.spaces.map((space, i) => (
                    <div
                      key={space.slug}
                      className="mb-6 break-inside-avoid animate-fade-up"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <SpaceCard space={space} workers={workersBySpace[space.slug] || []} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
