import { Puzzle, Loader2, Package, Wrench } from 'lucide-react'
import { useSpaceSkills, useCards } from '@/hooks/useSpaces'
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

interface SpaceSkillCardProps {
  card: CardDefinition
  space: string
}

function SpaceSkillCard({ card, space }: SpaceSkillCardProps) {
  const Renderer = getRendererOrDefault(card.renderer) || CardSkillSection
  return <Renderer card={card} space={space} />
}

function TypeBadge({ type }: { type: SpaceSkillInfo['type'] }) {
  if (type === 'plugin') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-violet-400/70 bg-violet-400/10 rounded px-1.5 py-0.5">
        <Package className="h-2.5 w-2.5" />
        plugin
      </span>
    )
  }
  if (type === 'project-skill') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-stone/50 bg-stone/10 rounded px-1.5 py-0.5">
        <Wrench className="h-2.5 w-2.5" />
        project
      </span>
    )
  }
  return null
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
        <Puzzle className="h-3.5 w-3.5 text-stone/50" />
        <h2 className="text-xs text-stone uppercase tracking-wider">Extensions</h2>
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
        <p className="text-sm text-stone/50">No extensions installed</p>
      ) : (
        <div className="space-y-3">
          {/* Space-level extensions — card style matching dashboard */}
          {spaceExtensions.map(ext => {
            const Icon = getSkillIcon(ext.icon)
            const card = cards?.find(c => c.skillId === ext.skillId)
            return (
              <div key={ext.skillId} className="rounded-lg border border-border-custom bg-surface/30 p-4">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-stone/60 shrink-0" />
                  <span className="font-heading text-lg text-parchment flex-1 min-w-0 truncate">{displayName(ext.name)}</span>
                  <TypeBadge type={ext.type} />
                </div>
                {card ? (
                  <div className="mt-2">
                    <SpaceSkillCard card={card} space={slug} />
                  </div>
                ) : ext.description ? (
                  <p className="text-xs text-stone/50 mt-1.5">{ext.description}</p>
                ) : null}
              </div>
            )
          })}

          {/* Project-level extensions — condensed */}
          {projectExtensions.length > 0 && (
            <div className="divide-y divide-border-custom">
              {projectExtensions.map(ext => {
                const Icon = getSkillIcon(ext.icon)
                return (
                  <div key={ext.skillId} className="flex items-center gap-2 py-1.5">
                    <Icon className="h-3.5 w-3.5 text-stone/40 shrink-0" />
                    <span className="text-xs text-parchment/80 flex-1 min-w-0 truncate">{displayName(ext.name)}</span>
                    <TypeBadge type={ext.type} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
