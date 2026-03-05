import { useState } from 'react'
import { Check, X, PenLine, Loader2, ExternalLink } from 'lucide-react'
import { useCards, useCardItems, useUpdateCardItem } from '@/hooks/useSpaces'
import type { CardDefinition, CardItem } from '@/lib/types'

const PLATFORM_COLORS: Record<string, string> = {
  facebook: 'bg-blue-500/20 text-blue-400',
  x: 'bg-stone/20 text-parchment',
  twitter: 'bg-stone/20 text-parchment',
  instagram: 'bg-pink-500/20 text-pink-400',
  linkedin: 'bg-sky-500/20 text-sky-400',
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors = PLATFORM_COLORS[platform.toLowerCase()] || 'bg-stone/20 text-stone'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${colors}`}>
      {platform}
    </span>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface CardItemRowProps {
  item: CardItem
  card: CardDefinition
  onAction: (itemId: string, update: { status?: string; draft?: string }) => void
  isPending: boolean
}

function CardItemRow({ item, card, onAction, isPending }: CardItemRowProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.draft || '')

  const handleApprove = () => onAction(item.id, { status: 'approved' })
  const handleReject = () => onAction(item.id, { status: 'rejected' })
  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== item.draft) {
      onAction(item.id, { draft: editValue.trim() })
    }
    setEditing(false)
  }

  const statusColors: Record<string, string> = {
    pending: 'border-sand/20',
    approved: 'border-moss/30 bg-moss/[0.03]',
    rejected: 'border-ember/20 bg-ember/[0.03] opacity-50',
  }

  const bodyField = card.display.body
  const subtitleField = card.display.subtitle
  const metaField = card.display.meta

  return (
    <div className={`rounded-lg border p-3 transition-all ${statusColors[item.status] || 'border-border-custom'}`}>
      {/* Header: platform + target + timestamp */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {item.platform && <PlatformBadge platform={item.platform} />}
          {subtitleField && !!item[subtitleField] && (
            <span className="text-xs text-stone/60 truncate">{String(item[subtitleField])}</span>
          )}
        </div>
        <span className="text-[10px] text-stone/40 shrink-0">{timeAgo(item.createdAt)}</span>
      </div>

      {/* Body: draft text */}
      {editing ? (
        <div className="mb-2">
          <textarea
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="w-full bg-surface/50 text-parchment text-xs rounded-md p-2 border border-sand/20 focus:border-sand/40 focus:outline-none resize-none"
            rows={4}
            autoFocus
          />
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={handleSaveEdit}
              disabled={isPending}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-sand/20 text-sand hover:bg-sand/30 transition-colors"
            >
              <Check className="h-3 w-3" /> Save
            </button>
            <button
              onClick={() => { setEditValue(item.draft || ''); setEditing(false) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-surface text-stone hover:bg-surface/80 transition-colors"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-parchment/90 leading-relaxed mb-2 whitespace-pre-wrap">
          {bodyField ? String(item[bodyField] || '') : ''}
        </p>
      )}

      {/* Meta: excerpt + post link */}
      {(metaField && item[metaField]) || item.postUrl ? (
        <div className="flex items-start justify-between gap-2 mb-2">
          {metaField && !!item[metaField] && (
            <div className="text-[10px] text-stone/50 italic border-l-2 border-stone/20 pl-2 min-w-0">
              {String(item[metaField])}
            </div>
          )}
          {item.postUrl && (
            <a
              href={String(item.postUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[10px] text-stone/40 hover:text-sand transition-colors shrink-0"
            >
              View post <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      ) : null}

      {/* Context */}
      {item.context && (
        <div className="text-[10px] text-stone/40 mb-2">
          {item.context}
        </div>
      )}

      {/* Actions */}
      {item.status === 'pending' && !editing && (
        <div className="flex items-center gap-1.5 pt-1">
          {card.actions.map(action => {
            if (action.id === 'approve') return (
              <button
                key={action.id}
                onClick={handleApprove}
                disabled={isPending}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-moss/20 text-moss hover:bg-moss/30 transition-colors disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {action.label}
              </button>
            )
            if (action.id === 'reject') return (
              <button
                key={action.id}
                onClick={handleReject}
                disabled={isPending}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-ember/20 text-ember hover:bg-ember/30 transition-colors disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                {action.label}
              </button>
            )
            if (action.id === 'rewrite') return (
              <button
                key={action.id}
                onClick={() => { setEditValue(item.draft || ''); setEditing(true) }}
                disabled={isPending}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded bg-surface text-stone hover:bg-surface/80 transition-colors disabled:opacity-50"
              >
                <PenLine className="h-3 w-3" />
                {action.label}
              </button>
            )
            return null
          })}
        </div>
      )}

      {/* Status badge for non-pending */}
      {item.status === 'approved' && (
        <div className="flex items-center gap-1 text-[10px] text-moss">
          <Check className="h-3 w-3" /> Approved — queued for posting
        </div>
      )}
      {item.status === 'rejected' && (
        <div className="flex items-center gap-1 text-[10px] text-ember">
          <X className="h-3 w-3" /> Rejected
        </div>
      )}
    </div>
  )
}

function CardSkillSection({ card }: { card: CardDefinition }) {
  const { data, isLoading } = useCardItems(card.skillId)
  const updateMutation = useUpdateCardItem()
  const [showAll, setShowAll] = useState(false)

  const items = data?.items || []
  const pendingItems = items.filter(i => i.status === 'pending')
  const otherItems = items.filter(i => i.status !== 'pending')
  const displayItems = showAll ? [...pendingItems, ...otherItems] : pendingItems

  const handleAction = (itemId: string, update: { status?: string; draft?: string }) => {
    updateMutation.mutate({ skillId: card.skillId, itemId, update })
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="rounded-lg border border-border-custom p-3 animate-pulse">
            <div className="h-3 bg-surface rounded w-1/3 mb-2" />
            <div className="h-3 bg-surface rounded w-2/3 mb-1" />
            <div className="h-3 bg-surface rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-stone/40 py-2 text-center">No drafts waiting for review</p>
    )
  }

  return (
    <div className="space-y-2">
      {displayItems.map(item => (
        <CardItemRow
          key={item.id}
          item={item}
          card={card}
          onAction={handleAction}
          isPending={updateMutation.isPending}
        />
      ))}
      {otherItems.length > 0 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] text-stone/50 hover:text-stone transition-colors w-full text-center py-1"
        >
          {showAll ? 'Hide resolved' : `Show ${otherItems.length} resolved`}
        </button>
      )}
    </div>
  )
}

export function CardSection() {
  const { data: cards, isLoading } = useCards()

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-border-custom p-3 animate-pulse">
          <div className="h-3 bg-surface rounded w-1/2 mb-2" />
          <div className="h-3 bg-surface rounded w-3/4" />
        </div>
      </div>
    )
  }

  // Filter out goals — they have their own dedicated GoalSection
  const filteredCards = cards?.filter(c => c.skillId !== 'goals') || []

  if (filteredCards.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {filteredCards.map(card => (
        <CardSkillSection key={card.skillId} card={card} />
      ))}
    </div>
  )
}
