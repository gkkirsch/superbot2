import { useState, useEffect } from 'react'
import { Clock, ChevronDown } from 'lucide-react'
import { useSpaceSchedule } from '@/hooks/useSpaces'
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

export function SpaceScheduleSection({ slug }: { slug: string }) {
  const { data: schedule, isLoading } = useSpaceSchedule(slug)
  const [tomorrowExpanded, setTomorrowExpanded] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  if (isLoading) return <div className="h-12 rounded-lg bg-stone/5 animate-pulse" />

  if (!schedule || schedule.length === 0) return null

  const timeline = buildTimeline(schedule)
  const hasUpcoming = timeline.some(i => !i.isPast)
  const nextDay = !hasUpcoming ? buildNextDayTimeline(schedule) : null
  const pastItems = timeline.filter(i => i.isPast)
  const upcomingItems = timeline.filter(i => !i.isPast)

  if (timeline.length === 0 && !nextDay) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-3.5 w-3.5 text-stone/50" />
        <h2 className="text-xs text-stone uppercase tracking-wider">Schedule</h2>
      </div>
      <div className="space-y-1.5">
        {pastItems.map((item, idx) => (
          <div
            key={`past-${item.job.name}-${item.time}-${idx}`}
            className="flex items-center gap-3 px-3 py-1.5 rounded-lg"
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
          </div>
        ))}

        {pastItems.length > 0 && upcomingItems.length > 0 && (
          <div className="border-t border-stone/15" />
        )}

        {upcomingItems.map((item, idx) => (
          <div
            key={`upcoming-${item.job.name}-${item.time}-${idx}`}
            className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface/30"
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
          </div>
        ))}

        {nextDay && (
          <>
            <div className="flex items-center gap-2 py-1.5">
              <div className="flex-1 border-t border-stone/15" />
              <span className="text-[10px] text-stone/50 uppercase tracking-wider">{nextDay.dayLabel}</span>
              <div className="flex-1 border-t border-stone/15" />
            </div>
            {(tomorrowExpanded ? nextDay.items : nextDay.items.slice(0, 1)).map((item, idx) => (
              <div
                key={`next-${item.job.name}-${item.time}-${idx}`}
                className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface/30"
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
              </div>
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
    </section>
  )
}
