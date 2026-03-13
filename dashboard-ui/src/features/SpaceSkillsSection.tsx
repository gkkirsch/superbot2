import { useState } from 'react'
import { Plus, X, Puzzle, Loader2, Settings } from 'lucide-react'
import { useSpaceSkills, useSkillManifests, useAttachSkill, useDetachSkill } from '@/hooks/useSpaces'
import { getSkillIcon } from '@/lib/skillIcons'

interface SpaceSkillsSectionProps {
  slug: string
}

export function SpaceSkillsSection({ slug }: SpaceSkillsSectionProps) {
  const { data: attached, isLoading } = useSpaceSkills(slug)
  const { data: allManifests } = useSkillManifests()
  const attachMut = useAttachSkill()
  const detachMut = useDetachSkill()
  const [showPicker, setShowPicker] = useState(false)
  const [onboardingSkillId, setOnboardingSkillId] = useState<string | null>(null)

  // Space-scoped skills not yet attached
  const attachable = (allManifests ?? []).filter(
    m => m.scope === 'space' && !(attached ?? []).some(a => a.skillId === m.skillId)
  )

  function handleAttach(skillId: string) {
    attachMut.mutate({ slug, skillId }, {
      onSuccess: (data) => {
        if (data.onboarding?.available) {
          setOnboardingSkillId(skillId)
        }
      },
    })
    setShowPicker(false)
  }

  function handleDetach(skillId: string) {
    detachMut.mutate({ slug, skillId })
    if (onboardingSkillId === skillId) setOnboardingSkillId(null)
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

      {/* Onboarding hint — shown after attaching a skill that has onboarding */}
      {onboardingSkillId && (
        <div className="mb-3 rounded-lg border border-sand/20 bg-sand/5 px-3 py-2 flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-sand/60 shrink-0" />
          <span className="text-xs text-sand/80 flex-1">
            This skill has setup options. Configure it in settings.
          </span>
          <button
            onClick={() => setOnboardingSkillId(null)}
            className="text-stone/40 hover:text-stone transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-stone/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-sm">Loading skills...</span>
        </div>
      ) : !attached || attached.length === 0 ? (
        <p className="text-sm text-stone/50">No skills attached</p>
      ) : (
        <div className="divide-y divide-border-custom">
          {attached.map(skill => {
            const Icon = getSkillIcon(skill.icon)
            return (
              <div key={skill.skillId} className="flex items-center gap-2 py-2 group">
                <Icon className="h-4 w-4 text-stone/60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-parchment">{skill.name}</span>
                  {skill.description && (
                    <span className="ml-1.5 text-xs text-stone/50">{skill.description}</span>
                  )}
                </div>
                <button
                  onClick={() => handleDetach(skill.skillId)}
                  disabled={detachMut.isPending}
                  className="opacity-0 group-hover:opacity-100 text-stone/40 hover:text-red-400 transition-all disabled:opacity-50"
                  title="Detach skill"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
