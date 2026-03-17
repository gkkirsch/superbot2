import { useState, useCallback } from 'react'
import { Blocks, Loader2, ChevronDown } from 'lucide-react'
import { useSpaceSkills, useCards, useCardItems } from '@/hooks/useSpaces'
import { getSkillIcon } from '@/lib/skillIcons'
import { getRendererOrDefault } from '@/features/cardRenderers'
import { CardSkillSection } from '@/features/CardSection'
import '@/features/registerRenderers'
import type { CardDefinition } from '@/lib/types'
import type { SpaceSkillInfo } from '@/lib/api'

function displayName(name: string) {
  // Strip plugin prefix (e.g., "host-ai:agent-config" → "agent-config")
  const base = name.includes(':') ? name.split(':').pop()! : name
  return base
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bApi\b/g, 'API')
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bDb\b/g, 'DB')
}

function useCollapsedState(key: string, defaultExpanded = false): [boolean, () => void] {
  const storageKey = `space-skill-collapsed:${key}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) return stored === 'true'
    } catch { /* private browsing */ }
    return !defaultExpanded
  })
  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(storageKey, String(next)) } catch {}
      return next
    })
  }, [storageKey])
  return [collapsed, toggle]
}

function CollapsibleContent({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
      <div className="overflow-hidden">
        {children}
      </div>
    </div>
  )
}

interface SpaceSkillCardProps {
  card: CardDefinition
  space: string
}

function SpaceSkillCard({ card, space }: SpaceSkillCardProps) {
  const Renderer = getRendererOrDefault(card.renderer) || CardSkillSection
  return <Renderer card={card} space={space} />
}

/** Space-level extension rendered like a dashboard SingleCardSection */
function SpaceLevelExtension({ ext, card, slug }: { ext: SpaceSkillInfo; card?: CardDefinition; slug: string }) {
  const [collapsed, toggle] = useCollapsedState(`${slug}:${ext.skillId}`)
  const Icon = getSkillIcon(ext.icon)
  const { data } = useCardItems(card?.skillId ?? '')
  const defaultStatus = card?.defaultFilter?.status || 'pending'
  const itemCount = card ? (data?.items?.filter(i => !i.status || i.status === defaultStatus).length ?? 0) : 0

  return (
    <section className="group">
      <div
        className={`flex items-center justify-between transition-[margin] duration-300 ${collapsed ? 'mb-1' : 'mb-4'} cursor-pointer select-none`}
        onClick={toggle}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon className="h-5 w-5 text-sand shrink-0" />
          <h2 className="font-heading text-xl text-parchment truncate">{displayName(ext.name)}</h2>
          {collapsed && itemCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-sand/15 text-sand/80 leading-none shrink-0">{itemCount}</span>
          )}
          <ChevronDown className={`h-4 w-4 text-stone/50 transition-transform duration-300 shrink-0 ${!collapsed ? 'rotate-180' : ''}`} />
        </div>
      </div>
      <CollapsibleContent collapsed={collapsed}>
        {card ? (
          <SpaceSkillCard card={card} space={slug} />
        ) : ext.description ? (
          <p className="text-xs text-stone/50">{ext.description}</p>
        ) : null}
      </CollapsibleContent>
    </section>
  )
}

/** Project-level extension — title only, expandable */
function ProjectLevelExtension({ ext }: { ext: SpaceSkillInfo }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = !!ext.description

  return (
    <div>
      <button
        onClick={hasDetail ? () => setExpanded(v => !v) : undefined}
        className={`w-full text-left py-1.5 text-xs text-parchment/80 truncate ${hasDetail ? 'hover:text-parchment cursor-pointer' : ''} transition-colors`}
      >
        {displayName(ext.name)}
      </button>
      {expanded && ext.description && (
        <p className="text-[11px] text-stone/50 pb-1.5 leading-relaxed">{ext.description}</p>
      )}
    </div>
  )
}

interface SpaceSkillsSectionProps {
  slug: string
}

export function SpaceSkillsSection({ slug }: SpaceSkillsSectionProps) {
  const { data: extensions, isLoading } = useSpaceSkills(slug)
  const { data: cards } = useCards()

  const spaceExtensions = extensions?.filter(e => e.type !== 'project-skill') ?? []
  const projectExtensions = extensions?.filter(e => e.type === 'project-skill') ?? []

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Blocks className="h-3.5 w-3.5 text-stone/50" />
        <h2 className="text-xs text-stone uppercase tracking-wider">Plugins</h2>
        {extensions && extensions.length > 0 && (
          <span className="text-[10px] text-stone/40">{extensions.length}</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-stone/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-sm">Scanning...</span>
        </div>
      ) : !extensions || extensions.length === 0 ? (
        <p className="text-sm text-stone/50">No plugins installed</p>
      ) : (
        <div className="space-y-8">
          {/* Space-level — dashboard-style collapsible sections */}
          {spaceExtensions.map(ext => {
            const card = cards?.find(c => c.skillId === ext.skillId)
            return (
              <SpaceLevelExtension key={ext.skillId} ext={ext} card={card} slug={slug} />
            )
          })}

          {/* Project-level — condensed title-only list */}
          {projectExtensions.length > 0 && (
            <div className="divide-y divide-border-custom">
              {projectExtensions.map(ext => (
                <ProjectLevelExtension key={ext.skillId} ext={ext} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
