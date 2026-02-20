import { useState } from 'react'
import { Check, X, Trash2, Clock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useSchedule, useSystemStatus } from '@/hooks/useSpaces'
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
  const [hStr, mStr] = time24.split(':')
  let h = parseInt(hStr, 10)
  const suffix = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${suffix}`
}

export function SchedulerStatus() {
  const { data } = useSystemStatus()
  const running = data?.schedulerRunning ?? false
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        {running && (
          <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-moss/60 animate-ping" />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${running ? 'bg-moss' : 'bg-stone/30'}`} />
      </div>
      <span className="text-xs text-stone">{running ? 'Running' : 'Stopped'}</span>
    </div>
  )
}

function ScheduleEditModal({ job, onClose }: { job: ScheduledJob; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ScheduledJob>({ ...job, days: job.days ? [...job.days] : [] })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const originalName = job.name

  const toggleDay = (day: string) => {
    const days = form.days || []
    setForm({ ...form, days: days.includes(day) ? days.filter(d => d !== day) : [...days, day] })
  }

  const handleSave = async () => {
    if (!form.name || !form.task) return
    setSaving(true)
    try {
      const toSave = { ...form }
      if (!toSave.space) delete (toSave as Partial<ScheduledJob>).space
      if (!toSave.days || toSave.days.length === 0 || toSave.days.length === 7) delete (toSave as Partial<ScheduledJob>).days
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
      <div className="absolute inset-0 bg-black/60" />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone mb-1.5">Time</label>
              <input
                type="time"
                value={form.time}
                onChange={e => setForm({ ...form, time: e.target.value })}
                className="w-full bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment focus:outline-none focus:border-sand/50"
              />
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
              disabled={saving || !form.name || !form.task}
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
  const [newJob, setNewJob] = useState<ScheduledJob>({ name: '', time: '09:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'], task: '', space: '' })

  if (isLoading) {
    return <div className="h-20 rounded-lg bg-stone/5 animate-pulse" />
  }

  const schedule = data?.schedule || []
  const lastRun = data?.lastRun || {}

  const handleAdd = async () => {
    if (!newJob.name || !newJob.time || !newJob.task) return
    const job = { ...newJob }
    if (!job.space) delete (job as Partial<ScheduledJob>).space
    if (!job.days || job.days.length === 0 || job.days.length === 7) delete (job as Partial<ScheduledJob>).days
    await addScheduleJob(job)
    queryClient.invalidateQueries({ queryKey: ['schedule'] })
    setNewJob({ name: '', time: '09:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'], task: '', space: '' })
    setAdding(false)
  }

  const toggleDay = (day: string) => {
    const days = newJob.days || []
    setNewJob({ ...newJob, days: days.includes(day) ? days.filter(d => d !== day) : [...days, day] })
  }

  return (
    <div className="space-y-3">
      {schedule.length === 0 && !adding && (
        <div className="rounded-lg border border-border-custom bg-surface/50 py-8 text-center">
          <p className="text-sm text-stone">No scheduled jobs yet.</p>
        </div>
      )}

      {schedule.map((job) => {
        const lastKey = lastRun[job.name]
        const lastDate = lastKey ? lastKey.split(':').slice(1).join(':') : null
        const days = job.days && job.days.length > 0 && job.days.length < 7
          ? job.days.map(d => DAY_LABELS[d] || d).join(', ')
          : 'Every day'

        return (
          <button
            key={job.name}
            onClick={() => setEditingJob(job)}
            className="w-full text-left rounded-lg border border-border-custom bg-surface/30 px-4 py-3 hover:border-sand/30 hover:bg-surface/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-parchment text-sm">{toTitleCase(job.name)}</span>
                {job.space && (
                  <span className="text-xs text-stone bg-stone/10 rounded px-1.5 py-0.5">{job.space}</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sand text-xs shrink-0 ml-3">
                <Clock className="h-3 w-3" />
                <span>{to12Hour(job.time)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-stone/70">
              <span>{days}</span>
              {lastDate && <span>Last ran: {lastDate}</span>}
            </div>
          </button>
        )
      })}

      {/* Add new job form */}
      {adding && (
        <div className="rounded-lg border border-sand/30 bg-surface/50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Job name (e.g. morning-briefing)"
              value={newJob.name}
              onChange={e => setNewJob({ ...newJob, name: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
              className="col-span-2 bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50"
            />
            <input
              type="time"
              value={newJob.time}
              onChange={e => setNewJob({ ...newJob, time: e.target.value })}
              className="bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment focus:outline-none focus:border-sand/50"
            />
            <input
              type="text"
              placeholder="Space (optional)"
              value={newJob.space}
              onChange={e => setNewJob({ ...newJob, space: e.target.value })}
              className="bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50"
            />
            <textarea
              placeholder="Task description"
              value={newJob.task}
              onChange={e => setNewJob({ ...newJob, task: e.target.value })}
              rows={2}
              className="col-span-2 bg-ink border border-border-custom rounded px-3 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:border-sand/50 resize-none"
            />
          </div>
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
              onClick={() => setAdding(false)}
              className="text-xs text-stone hover:text-parchment transition-colors inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newJob.name || !newJob.task}
              className="text-xs text-sand hover:text-sand/80 transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="h-3 w-3" /> Add job
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
