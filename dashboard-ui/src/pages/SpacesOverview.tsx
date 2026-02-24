import { useState, useMemo } from 'react'
import { useSpaces, useActiveWorkers, useSessions } from '@/hooks/useSpaces'
import { StatusBadge } from '@/features/TaskBadge'
import { ExternalLink, CheckCircle2 } from 'lucide-react'
import type { SpaceOverview as SpaceOverviewType, ActiveWorker, SessionSummary, TaskCounts } from '@/lib/types'

function timeAgo(dateString: string | null): string {
  if (!dateString) return 'never'
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const seconds = Math.floor((now - then) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function WorkerDot({ workers }: { workers: ActiveWorker[] }) {
  if (!workers || workers.length === 0) return null
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  )
}

function sortSpaces(spaces: SpaceOverviewType[]): SpaceOverviewType[] {
  return [...spaces].sort((a, b) => {
    // Active/in_progress first
    const statusOrder: Record<string, number> = { active: 0, in_progress: 0, planning: 1, pending: 1, archived: 2, completed: 2 }
    const aOrder = statusOrder[(a.status || 'active').toLowerCase()] ?? 99
    const bOrder = statusOrder[(b.status || 'active').toLowerCase()] ?? 99
    if (aOrder !== bOrder) return aOrder - bOrder
    // Then by incomplete tasks desc
    const aIncomplete = a.taskCounts.total - a.taskCounts.completed
    const bIncomplete = b.taskCounts.total - b.taskCounts.completed
    if (bIncomplete !== aIncomplete) return bIncomplete - aIncomplete
    return b.taskCounts.total - a.taskCounts.total
  })
}

function pickDefaultSpace(spaces: SpaceOverviewType[]): string {
  const sorted = sortSpaces(spaces)
  return sorted[0]?.slug || ''
}

interface SpaceListItemProps {
  space: SpaceOverviewType
  selected: boolean
  workers: ActiveWorker[]
  onClick: () => void
}

function SpaceListItem({ space, selected, workers, onClick }: SpaceListItemProps) {
  const isActive = (space.status || 'active').toLowerCase() === 'active' || space.status === 'in_progress'
  const done = space.taskCounts.completed
  const total = space.taskCounts.total

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-md transition-all duration-150 ${
        selected
          ? 'bg-surface/50 border border-sand/40'
          : 'border border-transparent hover:bg-surface/20'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isActive ? 'bg-ember' : 'bg-stone/40'}`} />
        <span className={`text-sm truncate ${selected ? 'text-parchment font-medium' : 'text-stone'}`}>
          {space.name}
        </span>
        <WorkerDot workers={workers} />
        <span className="ml-auto text-[10px] text-stone/40 shrink-0 tabular-nums">
          {total > 0 ? `${done}/${total}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-0.5 pl-3.5">
        <span className="text-[10px] text-stone/40">{timeAgo(space.lastUpdated)}</span>
        {space.escalationCount > 0 && (
          <span className="text-[10px] text-sand">{space.escalationCount} esc</span>
        )}
      </div>
    </button>
  )
}

interface ProjectRowProps {
  name: string
  counts: TaskCounts
}

function ProjectRow({ name, counts }: ProjectRowProps) {
  const allDone = counts.total > 0 && counts.completed === counts.total
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm text-stone/80 truncate min-w-0 flex-1" title={name}>
        {name}
      </span>
      {allDone ? (
        <span className="flex items-center gap-1 text-xs text-moss shrink-0">
          <CheckCircle2 className="h-3 w-3" />
          complete
        </span>
      ) : (
        <span className="text-xs text-stone/50 tabular-nums shrink-0">
          {counts.completed}/{counts.total} done
        </span>
      )}
    </div>
  )
}

interface SessionRowProps {
  session: SessionSummary
}

function SessionRow({ session }: SessionRowProps) {
  const summary = session.summary?.length > 100
    ? session.summary.slice(0, 100) + '...'
    : session.summary || 'No summary'

  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-[11px] text-stone/40 shrink-0 w-14 text-right tabular-nums">
        {timeAgo(session.completedAt)}
      </span>
      <span className="text-sm text-stone/70 min-w-0 flex-1">{summary}</span>
      {session.worker && (
        <span className="text-[10px] text-stone/30 shrink-0">{session.worker}</span>
      )}
    </div>
  )
}

function SpaceDetail({ space, workers }: { space: SpaceOverviewType; workers: ActiveWorker[] }) {
  const { data: sessions } = useSessions(5, space.slug)

  const projects = useMemo(() => {
    if (!space.projectTaskCounts) return []
    return [...space.projects]
      .map((p) => ({ name: p, counts: space.projectTaskCounts![p] || { pending: 0, in_progress: 0, completed: 0, total: 0 } }))
      .sort((a, b) => {
        const aIncomplete = a.counts.total - a.counts.completed
        const bIncomplete = b.counts.total - b.counts.completed
        if (bIncomplete !== aIncomplete) return bIncomplete - aIncomplete
        return b.counts.total - a.counts.total
      })
  }, [space.projects, space.projectTaskCounts])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-heading text-2xl text-parchment">{space.name}</h2>
        <StatusBadge status={space.status} />
        {workers.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400/80">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            {workers.length === 1 ? 'Worker active' : `${workers.length} workers`}
          </span>
        )}
      </div>

      {/* Links row */}
      {(space.devUrl || space.prodUrl) && (
        <div className="flex items-center gap-2">
          {space.devUrl && (
            <a
              href={space.devUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-surface/40 px-2.5 py-1 text-xs text-sand hover:bg-surface/60 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              dev :{new URL(space.devUrl).port || ''}
            </a>
          )}
          {space.prodUrl && (
            <a
              href={space.prodUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-surface/40 px-2.5 py-1 text-xs text-sand hover:bg-surface/60 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              prod
            </a>
          )}
        </div>
      )}

      {/* Projects */}
      <section>
        <h3 className="text-xs text-stone uppercase tracking-wider mb-2">Projects</h3>
        {projects.length === 0 ? (
          <p className="text-sm text-stone/40">No projects</p>
        ) : (
          <div className="divide-y divide-border-custom">
            {projects.map(({ name, counts }) => (
              <ProjectRow key={name} name={name} counts={counts} />
            ))}
          </div>
        )}
      </section>

      {/* Recent Sessions */}
      <section>
        <h3 className="text-xs text-stone uppercase tracking-wider mb-2">Recent Sessions</h3>
        {!sessions || sessions.length === 0 ? (
          <p className="text-sm text-stone/40">No recent sessions</p>
        ) : (
          <div className="divide-y divide-border-custom">
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        )}
      </section>

      {/* Escalations */}
      {space.escalationCount > 0 && (
        <section>
          <h3 className="text-xs text-stone uppercase tracking-wider mb-2">Escalations</h3>
          <p className="text-sm text-sand">{space.escalationCount} pending escalation{space.escalationCount !== 1 ? 's' : ''}</p>
        </section>
      )}
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-md bg-surface/20 animate-pulse h-14" />
      ))}
    </div>
  )
}

function SkeletonDetail() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-7 w-1/3 rounded bg-stone/10" />
      <div className="h-4 w-1/2 rounded bg-stone/10" />
      <div className="h-40 rounded bg-stone/10" />
    </div>
  )
}

export function SpacesOverview() {
  const { data: spaces, isLoading, error } = useSpaces()
  const { data: workers } = useActiveWorkers()
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const workersBySpace = useMemo(() => {
    return (workers || []).reduce<Record<string, ActiveWorker[]>>((acc, w) => {
      if (!acc[w.space]) acc[w.space] = []
      acc[w.space].push(w)
      return acc
    }, {})
  }, [workers])

  const sortedSpaces = useMemo(() => spaces ? sortSpaces(spaces) : [], [spaces])

  // Auto-select default when spaces load
  const activeSlug = selectedSlug && sortedSpaces.find(s => s.slug === selectedSlug)
    ? selectedSlug
    : (sortedSpaces.length > 0 ? pickDefaultSpace(sortedSpaces) : null)

  const selectedSpace = sortedSpaces.find(s => s.slug === activeSlug) || null

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-6">
          <h1 className="font-heading text-4xl text-parchment">Spaces</h1>
        </header>

        {error && (
          <div className="rounded-lg border border-ember/30 bg-ember/5 px-6 py-4 text-ember">
            Failed to load spaces: {error.message}
          </div>
        )}

        {isLoading && (
          <div className="flex gap-6">
            <div className="w-[280px] shrink-0">
              <SkeletonList />
            </div>
            <div className="flex-1 min-w-0">
              <SkeletonDetail />
            </div>
          </div>
        )}

        {spaces && spaces.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-stone">
            <p className="font-heading text-lg mb-2">No spaces found</p>
            <p className="text-sm">Create a space to get started.</p>
          </div>
        )}

        {sortedSpaces.length > 0 && (
          <>
            {/* Two-pane layout for lg+ */}
            <div className="hidden lg:flex gap-6">
              {/* Left pane - space list */}
              <div className="w-[280px] shrink-0">
                <div className="sticky top-6 rounded-lg bg-surface/20 border border-border-custom overflow-hidden">
                  <div className="max-h-[calc(100vh-160px)] overflow-y-auto p-2 space-y-0.5">
                    {sortedSpaces.map((space) => (
                      <SpaceListItem
                        key={space.slug}
                        space={space}
                        selected={space.slug === activeSlug}
                        workers={workersBySpace[space.slug] || []}
                        onClick={() => setSelectedSlug(space.slug)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Right pane - detail */}
              <div className="flex-1 min-w-0">
                <div className="rounded-lg border border-border-custom bg-surface/30 p-6">
                  {selectedSpace ? (
                    <SpaceDetail space={selectedSpace} workers={workersBySpace[selectedSpace.slug] || []} />
                  ) : (
                    <p className="text-stone/50">Select a space</p>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile/tablet: stacked list only */}
            <div className="lg:hidden space-y-2">
              {sortedSpaces.map((space) => {
                const isSelected = space.slug === activeSlug
                return (
                  <div key={space.slug}>
                    <SpaceListItem
                      space={space}
                      selected={isSelected}
                      workers={workersBySpace[space.slug] || []}
                      onClick={() => setSelectedSlug(isSelected ? null : space.slug)}
                    />
                    {isSelected && selectedSpace && (
                      <div className="mt-2 ml-2 rounded-lg border border-border-custom bg-surface/30 p-4">
                        <SpaceDetail space={selectedSpace} workers={workersBySpace[selectedSpace.slug] || []} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
