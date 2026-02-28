import { useState, useEffect } from 'react'
import { Check, X, Trash2, Clock, Plus, ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useSchedule } from '@/hooks/useSpaces'
import { addScheduleJob, deleteScheduleJob, updateScheduleJob } from '@/lib/api'
import type { ScheduledJob } from '@/lib/types'

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function toTitleCase(kebab: string): string {
  return kebab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function to12Hour(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24 || '--:--'
  const [hStr, mStr] = time24.split(':')
  let h = parseInt(hStr, 10)
  if (isNaN(h)) return time24
  const suffix = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${suffix}`
}

/** Get all times for a job, normalizing time vs times */
function getJobTimes(job: ScheduledJob): string[] {
  if (job.times && job.times.length > 0) return job.times
  if (job.time) return [job.time]
  return []
}

/** Parse HH:MM to minutes since midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

interface TimelineItem {
  job: ScheduledJob
  time: string
  minutes: number
  isPast: boolean
  isNext: boolean
}

const DAY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Deduplicate and sort time strings */
function dedupTimes(times: string[]): string[] {
  return [...new Set(times)].sort()
}

function buildTimeline(schedule: ScheduledJob[]): TimelineItem[] {
  const now = new Date()
  const nowDay = DAY_MAP[now.getDay()]
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const items: TimelineItem[] = []

  for (const job of schedule) {
    const activeDays = job.days && job.days.length > 0 && job.days.length < 7
      ? job.days
      : ALL_DAYS

    // Only show today's fire times
    if (!activeDays.includes(nowDay) && !activeDays.includes('*')) continue

    const times = getJobTimes(job)
    for (const time of times) {
      const minutes = timeToMinutes(time)
      items.push({
        job,
        time,
        minutes,
        isPast: minutes < nowMinutes,
        isNext: false,
      })
    }
  }

  // Sort chronologically
  items.sort((a, b) => a.minutes - b.minutes)

  // Mark the first non-past item as "up next"
  const nextIdx = items.findIndex(item => !item.isPast)
  if (nextIdx >= 0) {
    items[nextIdx].isNext = true
  }

  return items
}

const DEFAULT_VISIBLE = 3

function ScheduleEditModal({ job, onClose }: { job: ScheduledJob; onClose: () => void }) {
  const queryClient = useQueryClient()
  const jobTimes = getJobTimes(job)
  const [form, setForm] = useState<ScheduledJob & { _times: string[] }>({
    ...job,
    days: job.days ? [...job.days] : [],
    _times: jobTimes.length > 0 ? [...jobTimes] : ['09:00'],
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const originalName = job.name

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleDay = (day: string) => {
    const days = form.days || []
    setForm({ ...form, days: days.includes(day) ? days.filter(d => d !== day) : [...days, day] })
  }

  const updateTime = (idx: number, value: string) => {
    const newTimes = [...form._times]
    newTimes[idx] = value
    setForm({ ...form, _times: newTimes })
  }

  const addTime = () => {
    setForm({ ...form, _times: [...form._times, '12:00'] })
  }

  const removeTime = (idx: number) => {
    if (form._times.length <= 1) return
    setForm({ ...form, _times: form._times.filter((_, i) => i !== idx) })
  }

  const handleSave = async () => {
    if (!form.name || !form.task || form._times.length === 0) return
    setSaving(true)
    try {
      const toSave: ScheduledJob = {
        name: form.name,
        task: form.task,
      }
      if (form.space) toSave.space = form.space
      if (form.days && form.days.length > 0 && form.days.length < 7) toSave.days = form.days

      // Deduplicate and use times array if multiple, single time for backward compat
      const deduped = dedupTimes(form._times)
      if (deduped.length === 1) {
        toSave.time = deduped[0]
      } else {
        toSave.times = deduped
      }

      await updateScheduleJob(originalName, toSave)
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteScheduleJob(originalName)
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-lg flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0">
            <h2 className="font-heading text-xl text-parchment">{toTitleCase(originalName)}</h2>
            <p className="text-sm text-stone mt-1">Edit scheduled job</p>
          </div>
          <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors shrink-0 ml-4">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-stone mb-1.5">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
              className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment focus:outline-none focus:border-sand/50"
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1.5">Times</label>
            <div className="space-y-2">
              {form._times.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={e => updateTime(idx, e.target.value)}
                    className="flex-1 bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment focus:outline-none focus:border-sand/50"
                  />
                  {form._times.length > 1 && (
                    <button
                      onClick={() => removeTime(idx)}
                      className="p-1.5 text-stone hover:text-ember transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addTime}
                className="text-xs text-sand/60 hover:text-sand transition-colors inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add time
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-stone mb-1.5">Space (optional)</label>
            <input
              type="text"
              value={form.space || ''}
              onChange={e => setForm({ ...form, space: e.target.value })}
              className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50"
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1.5">Days</label>
            <div className="flex items-center gap-1">
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    (form.days || []).includes(day)
                      ? 'bg-sand/20 text-sand border border-sand/30'
                      : 'bg-ink text-stone border border-border-custom hover:border-stone/30'
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-stone mb-1.5">Task</label>
            <textarea
              value={form.task}
              onChange={e => setForm({ ...form, task: e.target.value })}
              rows={3}
              className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-6 pt-4 border-t border-border-custom">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-stone hover:text-ember transition-colors inline-flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-xs text-stone hover:text-parchment transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.task || form._times.length === 0}
              className="text-xs bg-sand/20 text-sand hover:bg-sand/30 px-3 py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ScheduleSection({ adding, setAdding }: { adding: boolean; setAdding: (v: boolean) => void }) {
  const { data, isLoading } = useSchedule()
  const queryClient = useQueryClient()
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [addingSaving, setAddingSaving] = useState(false)
  const [, setTick] = useState(0)
  const [newTimes, setNewTimes] = useState<string[]>(['09:00'])

  // Re-render every 60s so timeline "up next" and "past" states stay current
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])
  const [newJob, setNewJob] = useState<Omit<ScheduledJob, 'time' | 'times'> & { name: string; days: string[]; task: string; space: string }>({
    name: '', days: ['mon', 'tue', 'wed', 'thu', 'fri'], task: '', space: '',
  })

  if (isLoading) {
    return <div className="h-20 rounded-lg bg-stone/5 animate-pulse" />
  }

  const schedule = data?.schedule || []
  const timeline = buildTimeline(schedule)

  const visibleItems = expanded ? timeline : timeline.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = timeline.length - DEFAULT_VISIBLE

  const handleAdd = async () => {
    if (!newJob.name || newTimes.length === 0 || !newJob.task) return
    setAddingSaving(true)
    try {
      const job: ScheduledJob = {
        name: newJob.name,
        task: newJob.task,
      }
      if (newJob.space) job.space = newJob.space
      if (newJob.days.length > 0 && newJob.days.length < 7) job.days = newJob.days

      const deduped = dedupTimes(newTimes)
      if (deduped.length === 1) {
        job.time = deduped[0]
      } else {
        job.times = deduped
      }

      await addScheduleJob(job)
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
      setNewJob({ name: '', days: ['mon', 'tue', 'wed', 'thu', 'fri'], task: '', space: '' })
      setNewTimes(['09:00'])
      setAdding(false)
    } finally {
      setAddingSaving(false)
    }
  }

  const toggleDay = (day: string) => {
    const days = newJob.days || []
    setNewJob({ ...newJob, days: days.includes(day) ? days.filter(d => d !== day) : [...days, day] })
  }

  const addNewTime = () => setNewTimes([...newTimes, '12:00'])
  const removeNewTime = (idx: number) => {
    if (newTimes.length <= 1) return
    setNewTimes(newTimes.filter((_, i) => i !== idx))
  }
  const updateNewTime = (idx: number, value: string) => {
    const t = [...newTimes]
    t[idx] = value
    setNewTimes(t)
  }

  return (
    <div className="space-y-1">
      {timeline.length === 0 && !adding && (
        <div className="rounded-lg border border-border-custom bg-surface/50 py-4 flex items-center gap-2.5 px-4">
          <Clock className="h-4 w-4 text-stone/30 shrink-0" />
          <p className="text-xs text-stone/50">No scheduled jobs for today</p>
        </div>
      )}

      {/* Timeline items */}
      <div
        className="space-y-0.5 overflow-hidden transition-all duration-300 ease-in-out"
      >
        {visibleItems.map((item, idx) => (
          <button
            key={`${item.job.name}-${item.time}-${idx}`}
            onClick={() => setEditingJob(item.job)}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              item.isNext
                ? 'bg-blue-500/[0.08] border border-blue-500/20 hover:bg-blue-500/[0.12]'
                : item.isPast
                  ? 'bg-surface/20 hover:bg-surface/30'
                  : 'bg-surface/30 hover:bg-surface/50 border border-transparent'
            }`}
          >
            {/* Time indicator */}
            <div className="flex items-center gap-2 shrink-0 w-[80px]">
              {item.isNext && (
                <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0 animate-pulse" />
              )}
              {!item.isNext && (
                <span className={`h-2 w-2 rounded-full shrink-0 ${item.isPast ? 'bg-stone/20' : 'bg-stone/30'}`} />
              )}
              <span className={`text-xs font-mono tabular-nums ${
                item.isNext
                  ? 'text-blue-400 font-medium'
                  : item.isPast
                    ? 'text-stone/30 line-through'
                    : 'text-stone/60'
              }`}>
                {to12Hour(item.time)}
              </span>
            </div>

            {/* Job name */}
            <span className={`text-sm truncate ${
              item.isNext
                ? 'text-parchment font-medium'
                : item.isPast
                  ? 'text-stone/30'
                  : 'text-stone/70'
            }`}>
              {toTitleCase(item.job.name)}
            </span>

            {/* Next badge */}
            {item.isNext && (
              <span className="ml-auto text-[10px] font-medium text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded shrink-0">
                Next
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Show all toggle */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-center py-1.5 text-xs text-stone/50 hover:text-stone transition-colors flex items-center justify-center gap-1"
        >
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Show less' : `Show all ${timeline.length} scheduled`}
        </button>
      )}

      {/* Add new job form */}
      {adding && (
        <div className="rounded-lg border border-sand/30 bg-surface/50 p-4 space-y-3 mt-2">
          <input
            type="text"
            placeholder="Job name (e.g. morning-briefing)"
            value={newJob.name}
            onChange={e => setNewJob({ ...newJob, name: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
            className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50"
          />
          <div>
            <label className="block text-xs text-stone mb-1.5">Times</label>
            <div className="space-y-2">
              {newTimes.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={e => updateNewTime(idx, e.target.value)}
                    className="flex-1 bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment focus:outline-none focus:border-sand/50"
                  />
                  {newTimes.length > 1 && (
                    <button
                      onClick={() => removeNewTime(idx)}
                      className="p-1.5 text-stone hover:text-ember transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addNewTime}
                className="text-xs text-sand/60 hover:text-sand transition-colors inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add time
              </button>
            </div>
          </div>
          <input
            type="text"
            placeholder="Space (optional)"
            value={newJob.space}
            onChange={e => setNewJob({ ...newJob, space: e.target.value })}
            className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50"
          />
          <textarea
            placeholder="Task description"
            value={newJob.task}
            onChange={e => setNewJob({ ...newJob, task: e.target.value })}
            rows={2}
            className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50 resize-none"
          />
          <div className="flex items-center gap-1">
            {ALL_DAYS.map(day => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  (newJob.days || []).includes(day)
                    ? 'bg-sand/20 text-sand border border-sand/30'
                    : 'bg-ink text-stone border border-border-custom hover:border-stone/30'
                }`}
              >
                {DAY_LABELS[day]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => { setAdding(false); setNewTimes(['09:00']) }}
              className="text-xs text-stone hover:text-parchment transition-colors inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={addingSaving || !newJob.name || !newJob.task || newTimes.length === 0}
              className="text-xs text-sand hover:text-sand/80 transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="h-3 w-3" /> {addingSaving ? 'Adding...' : 'Add job'}
            </button>
          </div>
        </div>
      )}

      {editingJob && (
        <ScheduleEditModal job={editingJob} onClose={() => setEditingJob(null)} />
      )}
    </div>
  )
}
