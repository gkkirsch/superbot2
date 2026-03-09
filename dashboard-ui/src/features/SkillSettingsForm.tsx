import { useState, useEffect } from 'react'
import { Loader2, Check, X, Plus, Trash2 } from 'lucide-react'
import { useSkillSettings, useSaveSkillSettings } from '@/hooks/useSpaces'
import type { SettingsField } from '@/lib/types'

interface SkillSettingsFormProps {
  skillId: string
  onClose: () => void
}

function StringField({ field, value, onChange }: { field: SettingsField; value: string; onChange: (v: string) => void }) {
  if (field.enum) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface/50 text-parchment text-xs rounded-md px-2 py-1.5 border border-sand/20 focus:border-sand/40 focus:outline-none"
      >
        <option value="">Select...</option>
        {field.enum.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }
  if (field.multiline) {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={field.description}
        className="w-full bg-surface/50 text-parchment text-xs rounded-md p-2 border border-sand/20 focus:border-sand/40 focus:outline-none resize-none"
        rows={3}
      />
    )
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={field.description}
      className="w-full bg-surface/50 text-parchment text-xs rounded-md px-2 py-1.5 border border-sand/20 focus:border-sand/40 focus:outline-none"
    />
  )
}

function NumberField({ field, value, onChange }: { field: SettingsField; value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      min={field.min}
      max={field.max}
      placeholder={field.description}
      className="w-full bg-surface/50 text-parchment text-xs rounded-md px-2 py-1.5 border border-sand/20 focus:border-sand/40 focus:outline-none"
    />
  )
}

function BooleanField({ value, onChange }: { field: SettingsField; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-moss/40' : 'bg-surface'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-parchment transition-transform ${value ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function ArrayField({ field, value, onChange }: { field: SettingsField; value: string[]; onChange: (v: string[]) => void }) {
  const [newItem, setNewItem] = useState('')

  const handleAdd = () => {
    if (newItem.trim()) {
      onChange([...value, newItem.trim()])
      setNewItem('')
    }
  }

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-1.5">
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="flex-1 text-xs text-parchment bg-surface/50 rounded-md px-2 py-1 border border-sand/20 truncate">
            {item}
          </span>
          <button
            type="button"
            onClick={() => handleRemove(i)}
            className="p-0.5 text-stone/40 hover:text-ember transition-colors shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          placeholder={`Add ${field.items?.type || 'item'}...`}
          className="flex-1 bg-surface/50 text-parchment text-xs rounded-md px-2 py-1 border border-sand/20 focus:border-sand/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newItem.trim()}
          className="p-1 text-stone/40 hover:text-moss transition-colors disabled:opacity-30"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function SettingsFieldInput({ fieldKey, field, value, onChange }: {
  fieldKey: string
  field: SettingsField
  value: unknown
  onChange: (key: string, value: unknown) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-stone/50 uppercase tracking-wider">{field.label}</label>
        {field.required && <span className="text-[10px] text-ember/60">required</span>}
      </div>
      {field.description && (
        <p className="text-[10px] text-stone/40 mb-1.5">{field.description}</p>
      )}

      {field.type === 'string' && (
        <StringField field={field} value={String(value ?? '')} onChange={v => onChange(fieldKey, v)} />
      )}
      {field.type === 'number' && (
        <NumberField field={field} value={value as number | ''} onChange={v => onChange(fieldKey, v)} />
      )}
      {field.type === 'boolean' && (
        <BooleanField field={field} value={Boolean(value)} onChange={v => onChange(fieldKey, v)} />
      )}
      {field.type === 'array' && (
        <ArrayField field={field} value={Array.isArray(value) ? value : []} onChange={v => onChange(fieldKey, v)} />
      )}
    </div>
  )
}

export function SkillSettingsForm({ skillId, onClose }: SkillSettingsFormProps) {
  const { data, isLoading } = useSkillSettings(skillId)
  const saveMutation = useSaveSkillSettings()
  const [localValues, setLocalValues] = useState<Record<string, unknown>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data?.values) {
      setLocalValues(data.values)
    }
  }, [data?.values])

  const handleChange = (key: string, value: unknown) => {
    setLocalValues(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    saveMutation.mutate(
      { skillId, values: localValues },
      { onSuccess: () => setSaved(true) },
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-stone/40" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-xs text-stone/40 text-center py-4">No settings available</p>
  }

  const schemaEntries = Object.entries(data.schema)

  return (
    <div className="rounded-lg border border-border-custom bg-ink p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-parchment">Settings</h3>
        <button onClick={onClose} className="p-1 text-stone/40 hover:text-stone transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        {schemaEntries.map(([key, field]) => (
          <SettingsFieldInput
            key={key}
            fieldKey={key}
            field={field}
            value={localValues[key]}
            onChange={handleChange}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded bg-moss/20 text-moss hover:bg-moss/30 transition-colors disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : saved ? (
            <Check className="h-3 w-3" />
          ) : null}
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-[11px] font-medium rounded bg-surface text-stone hover:bg-surface/80 transition-colors"
        >
          Cancel
        </button>
        {saveMutation.isError && (
          <span className="text-[10px] text-ember">Save failed</span>
        )}
      </div>
    </div>
  )
}
