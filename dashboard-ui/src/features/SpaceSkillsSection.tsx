import { useState, useEffect } from 'react'
import { Plus, X, Puzzle, Loader2, Settings } from 'lucide-react'
import { useSpaceSkills, useSkillManifests, useAttachSkill, useDetachSkill, useCards } from '@/hooks/useSpaces'
import { getSkillIcon } from '@/lib/skillIcons'
import { getRendererOrDefault } from '@/features/cardRenderers'
import { CardSkillSection } from '@/features/CardSection'
import { SkillSettingsForm } from '@/features/SkillSettingsForm'
import '@/features/registerRenderers'
import type { CardDefinition } from '@/lib/types'

interface OnboardingData {
  skillId: string
  message?: string
  settings?: string[]
  schedule?: boolean
}

interface SpaceSkillCardProps {
  card: CardDefinition
  space: string
}

function SpaceSkillCard({ card, space }: SpaceSkillCardProps) {
  const Renderer = getRendererOrDefault(card.renderer) || CardSkillSection
  return <Renderer card={card} space={space} />
}

function OnboardingModal({ data, onClose }: { data: OnboardingData; onClose: () => void }) {
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0">
            <h2 className="font-heading text-xl text-parchment">Set Up Skill</h2>
            {data.message && (
              <p className="text-sm text-stone mt-1.5">{data.message}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors shrink-0 ml-4">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {!showSettings ? (
            <div className="space-y-3">
              {data.settings && data.settings.length > 0 && (
                <div className="flex items-start gap-2.5">
                  <Settings className="h-4 w-4 text-sand/60 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-parchment/80">Configure settings</p>
                    <p className="text-xs text-stone/50 mt-0.5">Set up platforms, accounts, voice guidelines, and content rules</p>
                  </div>
                </div>
              )}
              {data.schedule && (
                <div className="flex items-start gap-2.5">
                  <Settings className="h-4 w-4 text-sand/60 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-parchment/80">Review schedule</p>
                    <p className="text-xs text-stone/50 mt-0.5">This skill runs on a schedule — you can customize the timing</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <SkillSettingsForm skillId={data.skillId} onClose={() => { setShowSettings(false); onClose() }} />
          )}
        </div>

        {!showSettings && (
          <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-border-custom">
            <button
              onClick={onClose}
              className="text-xs text-stone hover:text-parchment transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs bg-sand/20 text-sand hover:bg-sand/30 px-3 py-1.5 rounded transition-colors"
            >
              Set Up Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface SpaceSkillsSectionProps {
  slug: string
}

export function SpaceSkillsSection({ slug }: SpaceSkillsSectionProps) {
  const { data: attached, isLoading } = useSpaceSkills(slug)
  const { data: allManifests } = useSkillManifests()
  const { data: cards } = useCards()
  const attachMut = useAttachSkill()
  const detachMut = useDetachSkill()
  const [showPicker, setShowPicker] = useState(false)
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null)

  // Space-scoped skills not yet attached
  const attachable = (allManifests ?? []).filter(
    m => m.scope === 'space' && !(attached ?? []).some(a => a.skillId === m.skillId)
  )

  function handleAttach(skillId: string) {
    attachMut.mutate({ slug, skillId }, {
      onSuccess: (data) => {
        if (data.onboarding?.available) {
          setOnboardingData({
            skillId,
            message: data.onboarding.message,
            settings: data.onboarding.settings,
            schedule: data.onboarding.schedule,
          })
        }
      },
    })
    setShowPicker(false)
  }

  function handleDetach(skillId: string) {
    detachMut.mutate({ slug, skillId })
    if (onboardingData?.skillId === skillId) setOnboardingData(null)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Puzzle className="h-3.5 w-3.5 text-stone/50" />
          <h2 className="text-xs text-stone uppercase tracking-wider">Skills</h2>
        </div>
        {attachable.length > 0 && (
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>

      {/* Picker dropdown */}
      {showPicker && attachable.length > 0 && (
        <div className="mb-3 rounded-lg border border-border-custom bg-surface/50 p-2 space-y-1">
          {attachable.map(skill => {
            const Icon = getSkillIcon(skill.icon)
            return (
              <button
                key={skill.skillId}
                onClick={() => handleAttach(skill.skillId)}
                disabled={attachMut.isPending}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-parchment hover:bg-surface/80 transition-colors disabled:opacity-50"
              >
                <Icon className="h-4 w-4 text-stone/60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{skill.name}</span>
                  {skill.description && (
                    <span className="ml-1.5 text-stone/50 text-xs">{skill.description}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Onboarding modal */}
      {onboardingData && (
        <OnboardingModal data={onboardingData} onClose={() => setOnboardingData(null)} />
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-stone/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-sm">Loading skills...</span>
        </div>
      ) : !attached || attached.length === 0 ? (
        <p className="text-sm text-stone/50">No skills attached</p>
      ) : (
        <div className="space-y-4">
          {attached.map(skill => {
            const Icon = getSkillIcon(skill.icon)
            const card = cards?.find(c => c.skillId === skill.skillId)
            return (
              <div key={skill.skillId}>
                {/* Skill header with name + detach */}
                <div className="flex items-center gap-2 mb-2 group">
                  <Icon className="h-4 w-4 text-stone/60 shrink-0" />
                  <span className="text-sm text-parchment font-medium flex-1">{skill.name}</span>
                  <button
                    onClick={() => handleDetach(skill.skillId)}
                    disabled={detachMut.isPending}
                    className="opacity-0 group-hover:opacity-100 text-stone/40 hover:text-red-400 transition-all disabled:opacity-50"
                    title="Detach skill"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Interactive card content */}
                {card ? (
                  <SpaceSkillCard card={card} space={slug} />
                ) : (
                  <p className="text-xs text-stone/40">{skill.description}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
