import { useState } from 'react'
import { Check, X, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useSchedule, useSystemStatus } from '@/hooks/useSpaces'
import { addScheduleJob, deleteScheduleJob } from '@/lib/api'
import type { ScheduledJob } from '@/lib/types'

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

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

export function ScheduleSection({ adding, setAdding }: { adding: boolean; setAdding: (v: boolean) => void }) {
  const { data, isLoading } = useSchedule()
  const queryClient = useQueryClient()
  const [newJob, setNewJob] = useState<ScheduledJob>({ name: '', time: '09:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'], task: '', space: '' })

  if (isLoading) {
    return <div className="h-20 rounded-lg bg-stone/5 animate-pulse" />
  }

  const schedule = data?.schedule || []
  const lastRun = data?.lastRun || {}

  const handleDelete = async (name: string) => {
    await deleteScheduleJob(name)
    queryClient.invalidateQueries({ queryKey: ['schedule'] })
  }

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
          <div key={job.name} className="rounded-lg border border-border-custom bg-surface/30 px-4 py-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-parchment text-sm">{job.name}</span>
                  <span className="text-xs font-mono text-sand">{job.time}</span>
                  {job.space && (
                    <span className="text-xs text-stone bg-stone/10 rounded px-1.5 py-0.5">{job.space}</span>
                  )}
                </div>
                <p className="text-xs text-stone mt-1">{job.task}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-stone/70">
                  <span>{days}</span>
                  {lastDate && <span>Last ran: {lastDate}</span>}
                </div>
              </div>
              <button
                onClick={() => handleDelete(job.name)}
                className="text-stone hover:text-ember transition-colors p-1 shrink-0"
                title="Delete job"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
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
    </div>
  )
}
