import { useNavigate } from 'react-router-dom'
import { FolderOpen } from 'lucide-react'
import { StatusBadge } from '@/features/TaskBadge'
import { StatsBar } from '@/features/StatsBar'

import type { SpaceOverview, ActiveWorker } from '@/lib/types'

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

interface SpaceCardProps {
  space: SpaceOverview
  variant?: 'compact' | 'full'
  style?: React.CSSProperties
  workers?: ActiveWorker[]
}

function WorkerIndicator({ workers }: { workers: ActiveWorker[] }) {
  if (!workers || workers.length === 0) return null
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

export function SpaceCard({ space, variant = 'full', style, workers = [] }: SpaceCardProps) {
  const navigate = useNavigate()

  if (variant === 'compact') {
    return (
      <div
        className="cursor-pointer rounded-lg border border-border-custom bg-surface/30 px-4 py-3 transition-all duration-200 hover:border-sand/40"
        onClick={() => navigate(`/spaces/${space.slug}`)}
        style={style}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-sm text-parchment truncate">{space.name}</span>
            <WorkerIndicator workers={workers} />
          </div>
          <span className="text-[11px] text-stone/50 shrink-0">{timeAgo(space.lastUpdated)}</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex-1">
            <StatsBar
              pending={space.taskCounts.pending}
              inProgress={space.taskCounts.in_progress}
              completed={space.taskCounts.completed}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-stone/60 shrink-0">
            {space.projects.length > 0 && (
              <span>{space.projects.length} project{space.projects.length !== 1 ? 's' : ''}</span>
            )}
            {space.escalationCount > 0 && (
              <span className="text-sand">{space.escalationCount} esc</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="cursor-pointer rounded-lg border border-border-custom bg-surface/30 p-5 transition-all duration-200 hover:border-sand/40 hover:-translate-y-0.5"
      onClick={() => navigate(`/spaces/${space.slug}`)}
      style={style}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-heading text-lg text-parchment truncate">{space.name}</h3>
        <StatusBadge status={space.status} />
      </div>

      <div className="flex items-center gap-2 mb-3">
        {space.projects.length > 0 && (
          <span className="text-xs text-stone">
            {space.projects.length} project{space.projects.length !== 1 ? 's' : ''}
          </span>
        )}
        {space.escalationCount > 0 && (
          <span className="text-xs text-sand">
            {space.escalationCount} escalation{space.escalationCount !== 1 ? 's' : ''}
          </span>
        )}
        <WorkerIndicator workers={workers} />
      </div>

      {space.projects.length > 1 && space.projectTaskCounts && (
        <div className="space-y-1.5 mb-3">
          {space.projects.map((project) => {
            const counts = space.projectTaskCounts![project]
            if (!counts || counts.total === 0) return null
            return (
              <div key={project} className="flex items-center gap-2">
                <FolderOpen className="h-3 w-3 shrink-0 text-stone/60" />
                <span className="truncate text-xs text-stone/80 min-w-0 max-w-[120px]" title={project}>
                  {project}
                </span>
                <div className="flex-1">
                  <StatsBar
                    pending={counts.pending}
                    inProgress={counts.in_progress}
                    completed={counts.completed}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border-custom">
        <StatsBar
          pending={space.taskCounts.pending}
          inProgress={space.taskCounts.in_progress}
          completed={space.taskCounts.completed}
        />
        <span className="text-xs text-stone/50">{timeAgo(space.lastUpdated)}</span>
      </div>
    </div>
  )
}
