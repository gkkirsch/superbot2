import { useState, useEffect } from 'react'
import { Clock, ChevronDown, Plus, X, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useSpaceSchedule } from '@/hooks/useSpaces'
import { addSpaceScheduleJob, deleteSpaceScheduleJob, updateSpaceScheduleJob } from '@/lib/api'
import type { ScheduledJob } from '@/lib/types'

const DAY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
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

function getJobTimes(job: ScheduledJob): string[] {
  if (job.times && job.times.length > 0) return job.times
  if (job.time) return [job.time]
  return []
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function dedupTimes(times: string[]): string[] {
  return [...new Set(times)].sort()
}

interface TimelineItem {
  job: ScheduledJob
  time: string
  minutes: number
  isPast: boolean
  isNext: boolean
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

    if (!activeDays.includes(nowDay) && !activeDays.includes('*')) continue

    for (const time of getJobTimes(job)) {
      items.push({
        job,
        time,
        minutes: timeToMinutes(time),
        isPast: timeToMinutes(time) < nowMinutes,
        isNext: false,
      })
    }
  }

  items.sort((a, b) => a.minutes - b.minutes)
  const nextIdx = items.findIndex(item => !item.isPast)
  if (nextIdx >= 0) items[nextIdx].isNext = true

  return items
}

function buildNextDayTimeline(schedule: ScheduledJob[]): { dayLabel: string; items: TimelineItem[] } | null {
  const todayIndex = new Date().getDay()

  for (let offset = 1; offset <= 7; offset++) {
    const futureDay = DAY_MAP[(todayIndex + offset) % 7]
    const items: TimelineItem[] = []

    for (const job of schedule) {
      const activeDays = job.days && job.days.length > 0 && job.days.length < 7
        ? job.days
        : ALL_DAYS

      if (!activeDays.includes(futureDay) && !activeDays.includes('*')) continue

      for (const time of getJobTimes(job)) {
        items.push({ job, time, minutes: timeToMinutes(time), isPast: false, isNext: false })
      }
    }

    if (items.length > 0) {
      items.sort((a, b) => a.minutes - b.minutes)
      items[0].isNext = true
      return { dayLabel: offset === 1 ? 'Tomorrow' : DAY_LABELS[futureDay], items }
    }
  }

  return null
}

// --- Edit modal ---

function SpaceScheduleEditModal({ job, slug, onClose }: { job: ScheduledJob; slug: string; onClose: () => void }) {
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
      const toSave: ScheduledJob = { name: form.name, task: form.task }
      if (form.days && form.days.length > 0 && form.days.length < 7) toSave.days = form.days
      const deduped = dedupTimes(form._times)
      if (deduped.length === 1) {
        toSave.time = deduped[0]
      } else {
        toSave.times = deduped
      }
      await updateSpaceScheduleJob(slug, originalName, toSave)
      queryClient.invalidateQueries({ queryKey: ['space-schedule', slug] })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteSpaceScheduleJob(slug, originalName)
      queryClient.invalidateQueries({ queryKey: ['space-schedule', slug] })
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

// --- Add modal ---

function SpaceScheduleAddModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    task: '',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'] as string[],
    _times: ['09:00'] as string[],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleDay = (day: string) => {
    const days = form.days
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
      const job: ScheduledJob = { name: form.name, task: form.task }
      if (form.days.length > 0 && form.days.length < 7) job.days = form.days
      const deduped = dedupTimes(form._times)
      if (deduped.length === 1) {
        job.time = deduped[0]
      } else {
        job.times = deduped
      }
      await addSpaceScheduleJob(slug, job)
      queryClient.invalidateQueries({ queryKey: ['space-schedule', slug] })
      onClose()
    } finally {
      setSaving(false)
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
            <h2 className="font-heading text-xl text-parchment">New Scheduled Job</h2>
            <p className="text-sm text-stone mt-1">Add a job to this space's schedule</p>
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
              placeholder="e.g. morning-briefing"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
              className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50"
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
            <label className="block text-xs text-stone mb-1.5">Days</label>
            <div className="flex items-center gap-1">
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    form.days.includes(day)
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
              placeholder="What should this job do?"
              value={form.task}
              onChange={e => setForm({ ...form, task: e.target.value })}
              rows={3}
              className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-border-custom">
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
            {saving ? 'Adding...' : 'Add job'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Main section ---

export function SpaceScheduleSection({ slug }: { slug: string }) {
  const { data: schedule, isLoading } = useSpaceSchedule(slug)
  const [tomorrowExpanded, setTomorrowExpanded] = useState(false)
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null)
  const [adding, setAdding] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  if (isLoading) return <div className="h-12 rounded-lg bg-stone/5 animate-pulse" />

  const jobs = schedule || []
  const timeline = buildTimeline(jobs)
  const hasUpcoming = timeline.some(i => !i.isPast)
  const nextDay = !hasUpcoming ? buildNextDayTimeline(jobs) : null
  const pastItems = timeline.filter(i => i.isPast)
  const upcomingItems = timeline.filter(i => !i.isPast)

  const isEmpty = timeline.length === 0 && !nextDay && jobs.length === 0

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-stone/50" />
          <h2 className="text-xs text-stone uppercase tracking-wider">Schedule</h2>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>

      {isEmpty ? (
        <p className="text-sm text-stone/50">No scheduled jobs</p>
      ) : (
        <div className="space-y-1.5">
          {pastItems.map((item, idx) => (
            <button
              key={`past-${item.job.name}-${item.time}-${idx}`}
              onClick={() => setEditingJob(item.job)}
              className="w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-surface/30 transition-colors"
            >
              <div className="flex items-center gap-2 shrink-0 w-[80px]">
                <span className="text-stone/40 text-[10px] shrink-0 leading-none">&#10003;</span>
                <span className="text-xs font-mono tabular-nums text-stone/40">
                  {to12Hour(item.time)}
                </span>
              </div>
              <span className="text-sm truncate text-stone/40">
                {toTitleCase(item.job.name.replace(/^skill:/, '').replace(/^plugin__/, ''))}
              </span>
            </button>
          ))}

          {pastItems.length > 0 && upcomingItems.length > 0 && (
            <div className="border-t border-stone/15" />
          )}

          {upcomingItems.map((item, idx) => (
            <button
              key={`upcoming-${item.job.name}-${item.time}-${idx}`}
              onClick={() => setEditingJob(item.job)}
              className="w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface/30 hover:bg-surface/50 transition-colors"
            >
              <div className="flex items-center gap-2 shrink-0 w-[80px]">
                <span className="h-2 w-2 rounded-full shrink-0 bg-stone/30" />
                <span className="text-xs font-mono tabular-nums text-stone/60">
                  {to12Hour(item.time)}
                </span>
              </div>
              <span className="text-sm truncate text-stone/70">
                {toTitleCase(item.job.name.replace(/^skill:/, '').replace(/^plugin__/, ''))}
              </span>
            </button>
          ))}

          {/* Show jobs that don't fire today but exist in the schedule */}
          {timeline.length === 0 && jobs.length > 0 && !nextDay && (
            <div className="space-y-1.5">
              {jobs.map(job => (
                <button
                  key={job.name}
                  onClick={() => setEditingJob(job)}
                  className="w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface/30 hover:bg-surface/50 transition-colors"
                >
                  <div className="flex items-center gap-2 shrink-0 w-[80px]">
                    <span className="h-2 w-2 rounded-full shrink-0 bg-stone/30" />
                    <span className="text-xs font-mono tabular-nums text-stone/60">
                      {to12Hour(getJobTimes(job)[0] || '')}
                    </span>
                  </div>
                  <span className="text-sm truncate text-stone/70">
                    {toTitleCase(job.name.replace(/^skill:/, '').replace(/^plugin__/, ''))}
                  </span>
                </button>
              ))}
            </div>
          )}

          {nextDay && (
            <>
              <div className="flex items-center gap-2 py-1.5">
                <div className="flex-1 border-t border-stone/15" />
                <span className="text-[10px] text-stone/50 uppercase tracking-wider">{nextDay.dayLabel}</span>
                <div className="flex-1 border-t border-stone/15" />
              </div>
              {(tomorrowExpanded ? nextDay.items : nextDay.items.slice(0, 1)).map((item, idx) => (
                <button
                  key={`next-${item.job.name}-${item.time}-${idx}`}
                  onClick={() => setEditingJob(item.job)}
                  className="w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface/30 hover:bg-surface/50 transition-colors"
                >
                  <div className="flex items-center gap-2 shrink-0 w-[80px]">
                    <span className="h-2 w-2 rounded-full shrink-0 bg-stone/30" />
                    <span className="text-xs font-mono tabular-nums text-stone/60">
                      {to12Hour(item.time)}
                    </span>
                  </div>
                  <span className="text-sm truncate text-stone/70">
                    {toTitleCase(item.job.name.replace(/^skill:/, '').replace(/^plugin__/, ''))}
                  </span>
                </button>
              ))}
              {nextDay.items.length > 1 && (
                <button
                  onClick={() => setTomorrowExpanded(v => !v)}
                  className="w-full text-center py-1 text-xs text-stone/50 hover:text-stone transition-colors flex items-center justify-center gap-1"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${tomorrowExpanded ? 'rotate-180' : ''}`} />
                  {tomorrowExpanded ? 'Show less' : `Show all ${nextDay.items.length} for ${nextDay.dayLabel.toLowerCase()}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {adding && (
        <SpaceScheduleAddModal slug={slug} onClose={() => setAdding(false)} />
      )}

      {editingJob && (
        <SpaceScheduleEditModal job={editingJob} slug={slug} onClose={() => setEditingJob(null)} />
      )}
    </section>
  )
}
