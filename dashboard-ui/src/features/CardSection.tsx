import { useState, type ComponentType } from 'react'
import {
  Check, X, PenLine, Loader2, ExternalLink, Pause, Play, Trash2, Plus,
  type LucideProps,
} from 'lucide-react'
import { useCards, useCardItems, useUpdateCardItem } from '@/hooks/useSpaces'
import { SkillSettingsForm } from '@/features/SkillSettingsForm'
import type { CardDefinition, CardItem, CardAction } from '@/lib/types'

// --- Icon registry ---

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  check: Check,
  x: X,
  'pen-line': PenLine,
  pause: Pause,
  play: Play,
  'trash-2': Trash2,
  plus: Plus,
  'external-link': ExternalLink,
}

function ActionIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return null
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon className={className} />
}

// --- Style mapping ---

const ACTION_STYLES: Record<string, string> = {
  primary: 'bg-moss/20 text-moss hover:bg-moss/30',
  danger: 'bg-ember/20 text-ember hover:bg-ember/30',
  secondary: 'bg-surface text-stone hover:bg-surface/80',
}

// --- Platform badge (kept for backward compat with social-media cards) ---

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

// --- Generic action button ---

interface ActionButtonProps {
  action: CardAction
  item: CardItem
  onAction: (itemId: string, update: Record<string, unknown>) => void
  onStartEdit: (field: string) => void
  isPending: boolean
}

function ActionButton({ action, item, onAction, onStartEdit, isPending }: ActionButtonProps) {
  // Check showWhen condition
  if (action.showWhen?.status) {
    const allowed = Array.isArray(action.showWhen.status)
      ? action.showWhen.status
      : [action.showWhen.status]
    if (!allowed.includes(item.status)) return null
  }

  const styleClass = ACTION_STYLES[action.style] || ACTION_STYLES.secondary

  const handleClick = () => {
    if (action.handler === 'set-status' && action.params?.status) {
      onAction(item.id, { status: action.params.status })
    } else if (action.handler === 'edit-field' && action.params?.field) {
      onStartEdit(action.params.field)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded transition-colors disabled:opacity-50 ${styleClass}`}
    >
      {isPending && action.handler === 'set-status'
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <ActionIcon name={action.icon} className="h-3 w-3" />
      }
      {action.label}
    </button>
  )
}

// --- Generic card item row ---

interface CardItemRowProps {
  item: CardItem
  card: CardDefinition
  onAction: (itemId: string, update: Record<string, unknown>) => void
  isPending: boolean
}

function CardItemRow({ item, card, onAction, isPending }: CardItemRowProps) {
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleStartEdit = (field: string) => {
    setEditValue(String(item[field] || ''))
    setEditingField(field)
  }

  const handleSaveEdit = () => {
    if (editingField && editValue.trim() && editValue !== String(item[editingField] || '')) {
      onAction(item.id, { [editingField]: editValue.trim() })
    }
    setEditingField(null)
  }

  const handleCancelEdit = () => {
    setEditingField(null)
    setEditValue('')
  }

  const statusColors: Record<string, string> = {
    pending: 'border-sand/20',
    approved: 'border-moss/30 bg-moss/[0.03]',
    rejected: 'border-ember/20 bg-ember/[0.03] opacity-50',
    completed: 'border-moss/30 bg-moss/[0.03]',
  }

  const bodyField = card.display.body
  const subtitleField = card.display.subtitle
  const metaField = card.display.meta

  // Determine which actions to show based on item status
  const defaultFilter = card.defaultFilter?.status || 'pending'
  const showActions = item.status === defaultFilter && !editingField

  return (
    <div className={`rounded-lg border p-3 transition-all ${statusColors[item.status] || 'border-border-custom'}`}>
      {/* Header: platform/title + subtitle + timestamp */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {item.platform && <PlatformBadge platform={item.platform} />}
          {subtitleField && !!item[subtitleField] && (
            <span className="text-xs text-stone/60 truncate">{String(item[subtitleField])}</span>
          )}
        </div>
        <span className="text-[10px] text-stone/40 shrink-0">{timeAgo(item.createdAt)}</span>
      </div>

      {/* Body: editable field or display */}
      {editingField === bodyField ? (
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
              onClick={handleCancelEdit}
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

      {/* Meta + post link */}
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

      {/* Generic actions */}
      {showActions && (
        <div className="flex items-center gap-1.5 pt-1">
          {card.actions.map(action => (
            <ActionButton
              key={action.id}
              action={action}
              item={item}
              onAction={onAction}
              onStartEdit={handleStartEdit}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* Status badge for non-default statuses */}
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

// --- Card skill section (default renderer) ---

interface CardSkillSectionProps {
  card: CardDefinition
  showSettings?: boolean
  onCloseSettings?: () => void
}

export function CardSkillSection({ card, showSettings, onCloseSettings }: CardSkillSectionProps) {
  const { data, isLoading } = useCardItems(card.skillId)
  const updateMutation = useUpdateCardItem()
  const [showResolved, setShowResolved] = useState(false)

  const items = data?.items || []
  const defaultStatus = card.defaultFilter?.status || 'pending'
  const pendingItems = items.filter(i => !i.status || i.status === defaultStatus)
  const resolvedItems = items.filter(i => i.status && i.status !== defaultStatus)

  const handleAction = (itemId: string, update: Record<string, unknown>) => {
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

  return (
    <div className="space-y-2">
      {/* Settings form (controlled by parent via SectionHeader gear icon) */}
      {showSettings && (
        <SkillSettingsForm skillId={card.skillId} onClose={onCloseSettings || (() => {})} />
      )}

      {pendingItems.length === 0 ? (
        <p className="text-xs text-stone/40 py-2 text-center">No items waiting for review</p>
      ) : (
        pendingItems.map(item => (
          <CardItemRow
            key={item.id}
            item={item}
            card={card}
            onAction={handleAction}
            isPending={updateMutation.isPending}
          />
        ))
      )}

      {/* Show resolved items toggle */}
      {resolvedItems.length > 0 && (
        <button
          onClick={() => setShowResolved(v => !v)}
          className="text-[11px] text-stone/40 hover:text-stone/60 transition-colors w-full text-center py-1"
        >
          {showResolved ? 'Hide' : 'Show'} {resolvedItems.length} resolved
        </button>
      )}
      {showResolved && resolvedItems.map(item => (
        <CardItemRow
          key={item.id}
          item={item}
          card={card}
          onAction={handleAction}
          isPending={updateMutation.isPending}
        />
      ))}
    </div>
  )
}

// --- Main card section (renders all non-custom-renderer cards) ---

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

  // Filter out goals (uses goal-tracker renderer) and any cards with custom renderers
  const filteredCards = cards?.filter(c => c.skillId !== 'goals' && (!c.renderer || c.renderer === 'default')) || []

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
