import { useState } from 'react'
import { GitBranch, ExternalLink, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react'
import { useCardItems } from '@/hooks/useSpaces'
import type { CardDefinition, CardItem } from '@/lib/types'

interface PRComment {
  id: number
  author: string
  avatarUrl: string
  body: string
  createdAt: string
}

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

function parseComments(raw: unknown): PRComment[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function CommentSection({ comments }: { comments: PRComment[] }) {
  const [expanded, setExpanded] = useState(false)
  if (comments.length === 0) return null

  return (
    <div className="mt-2 border-t border-stone/10 pt-2">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded) }}
        className="flex items-center gap-1.5 text-[11px] text-stone/50 hover:text-sand transition-colors w-full"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <MessageSquare className="h-3 w-3" />
        <span>{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md bg-ink/30 px-2.5 py-2 text-xs">
              <div className="flex items-center gap-2 mb-1">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt={c.author} className="h-4 w-4 rounded-full" />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-stone/20 flex items-center justify-center text-[8px] text-stone/60">
                    {c.author?.[0]?.toUpperCase() || '?'}
                  </span>
                )}
                <span className="font-medium text-parchment/80">{c.author}</span>
                <span className="text-[10px] text-stone/40 ml-auto">{c.createdAt ? timeAgo(c.createdAt) : ''}</span>
              </div>
              <p className="text-stone/70 whitespace-pre-wrap break-words line-clamp-4">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function GitHubPrsRenderer({ card }: { card: CardDefinition }) {
  const { data, isLoading } = useCardItems(card.skillId)

  const items = data?.items || []

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
      {items.length === 0 ? (
        <p className="text-xs text-stone/50 py-2 text-center">No open pull requests</p>
      ) : (
        items.map((pr: CardItem) => {
          const comments = parseComments(pr.comments)
          return (
            <div
              key={pr.id}
              className="rounded-lg border border-stone/10 bg-surface/40 px-3 py-2.5 hover:border-sand/30 hover:bg-surface/60 transition-colors"
            >
              <a
                href={String(pr.url || '')}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
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
              <CommentSection comments={comments} />
            </div>
          )
        })
      )}
    </div>
  )
}
