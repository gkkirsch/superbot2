import { RefreshCw, GitBranch, ExternalLink } from 'lucide-react'
import { useCardItems, useRefreshCardItems } from '@/hooks/useSpaces'
import type { CardDefinition, CardItem } from '@/lib/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `${days}d ago`
  const hours = Math.floor(diff / 3600000)
  if (hours > 0) return `${hours}h ago`
  const mins = Math.floor(diff / 60000)
  return `${mins}m ago`
}

function StatusDot({ ciStatus }: { ciStatus: string }) {
  if (ciStatus === 'failing') return <span className="h-2 w-2 rounded-full bg-ember shrink-0" title="Checks failing" />
  if (ciStatus === 'pending') return <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Checks pending" />
  if (ciStatus === 'passing') return <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="Checks passing" />
  return <span className="h-2 w-2 rounded-full bg-stone/30 shrink-0" title="No checks" />
}

function ReviewBadge({ decision }: { decision: string }) {
  if (!decision) return null
  const labels: Record<string, { text: string; className: string }> = {
    APPROVED: { text: 'Approved', className: 'text-emerald-400 bg-emerald-400/10' },
    CHANGES_REQUESTED: { text: 'Changes', className: 'text-ember bg-ember/10' },
    REVIEW_REQUIRED: { text: 'Review needed', className: 'text-amber-400 bg-amber-400/10' },
  }
  const badge = labels[decision]
  if (!badge) return null
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${badge.className}`}>{badge.text}</span>
}

export function GitHubPrsRenderer({ card }: { card: CardDefinition }) {
  const { data, isLoading } = useCardItems(card.skillId)
  const refreshMutation = useRefreshCardItems()

  const items = data?.items || []

  const handleRefresh = () => {
    refreshMutation.mutate(card.skillId)
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="rounded-lg border border-stone/10 bg-surface/40 px-3 py-2.5 animate-pulse">
            <div className="h-3 bg-surface rounded w-1/3 mb-2" />
            <div className="h-4 bg-surface rounded w-2/3 mb-1" />
            <div className="h-3 bg-surface rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Refresh bar */}
      <div className="flex items-center justify-end gap-2">
        {refreshMutation.isError && (
          <span className="text-[10px] text-ember">Refresh failed</span>
        )}
        <button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          className={`p-1 text-stone/50 hover:text-sand transition-colors rounded hover:bg-sand/10 ${refreshMutation.isPending ? 'animate-spin' : ''}`}
          title="Refresh PRs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-stone/50 py-2 text-center">No open pull requests</p>
      ) : (
        items.map((pr: CardItem) => (
          <a
            key={pr.id}
            href={String(pr.url || '')}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-stone/10 bg-surface/40 px-3 py-2.5 hover:border-sand/30 hover:bg-surface/60 transition-colors"
          >
            <div className="flex items-start gap-2">
              <StatusDot ciStatus={String(pr.ciStatus || 'none')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-stone/60">{String(pr.repo || '')}</span>
                  <span className="text-[10px] text-stone/40">#{String(pr.prNumber || '')}</span>
                  <ReviewBadge decision={String(pr.reviewDecision || '')} />
                </div>
                <p className="text-sm text-parchment truncate">{String(pr.title || '')}</p>
                <div className="flex items-center gap-2 mt-1">
                  <GitBranch className="h-3 w-3 text-stone/40" />
                  <span className="text-[11px] text-stone/50 truncate">{String(pr.branch || '')}</span>
                  <span className="text-[10px] text-stone/30 ml-auto shrink-0">{pr.createdAt ? timeAgo(pr.createdAt) : ''}</span>
                  <ExternalLink className="h-3 w-3 text-stone/30 shrink-0" />
                </div>
              </div>
            </div>
          </a>
        ))
      )}
    </div>
  )
}
