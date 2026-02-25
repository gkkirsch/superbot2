import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useActivity, useActiveWorkers } from '@/hooks/useSpaces'
import type { ActivityBucket } from '@/lib/types'

function ActivityGraph({ activity }: { activity: ActivityBucket[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const graphRef = useRef<HTMLDivElement>(null)

  // Backend always returns 24 hourly buckets; pad if somehow fewer
  const bars: ActivityBucket[] = activity.length >= 24 ? activity : [
    ...Array.from({ length: 24 - activity.length }, (_, i) => ({
      ts: new Date(Date.now() - (24 - i) * 3600000).toISOString(),
      tools: 0, messages: 0, sessions: 0, skills: [] as string[], subagents: [] as string[],
    })),
    ...activity,
  ]

  const maxTools = Math.max(...bars.map(b => b.tools), 1)

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const hoveredBucket = hoveredIndex !== null ? bars[hoveredIndex] : null
  const tooltipLeftPct = hoveredIndex !== null ? ((hoveredIndex + 0.5) / bars.length) * 100 : 0
  const flipTooltip = tooltipLeftPct > 75

  const getTooltipStyle = (): React.CSSProperties => {
    if (hoveredIndex === null || !graphRef.current) return { display: 'none' }
    const rect = graphRef.current.getBoundingClientRect()
    const leftPct = (hoveredIndex + 0.5) / bars.length
    const left = rect.left + rect.width * leftPct
    const showBelow = rect.top < 160
    return {
      position: 'fixed',
      top: showBelow ? rect.bottom + 8 : rect.top - 8,
      left,
      transform: `translate(${flipTooltip ? '-90%' : '-10%'}, ${showBelow ? '0%' : '-100%'})`,
      zIndex: 99999,
      pointerEvents: 'none' as const,
    }
  }

  return (
    <div className="relative" ref={graphRef} onMouseLeave={() => setHoveredIndex(null)}>
      <div className="flex items-end gap-px h-14">
        {bars.map((bucket, i) => {
          const hasActivity = bucket.tools > 0
          const pct = hasActivity ? Math.max(8, (bucket.tools / maxTools) * 100) : 0
          return (
            <div
              key={i}
              className={`flex-1 min-w-[2px] rounded-t-sm transition-colors ${
                hasActivity ? 'bg-ember hover:bg-ember/80' : 'bg-stone/10'
              }`}
              style={{ height: hasActivity ? `${pct}%` : '2px' }}
              onMouseEnter={() => setHoveredIndex(i)}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-stone-500 mt-0.5">
        <span>24h ago</span>
        <span>now</span>
      </div>

      {hoveredIndex !== null && hoveredBucket && createPortal(
        <div style={getTooltipStyle()}>
          <div className="rounded-lg border border-border-custom bg-surface px-3 py-2 shadow-lg min-w-[160px]">
            <div className="text-xs font-medium text-parchment">{formatTime(hoveredBucket.ts)}</div>
            <div className="mt-1.5 space-y-0.5 text-[11px]">
              <div className="flex justify-between gap-4">
                <span className="text-stone">Tool calls</span>
                <span className="text-parchment">{hoveredBucket.tools}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-stone">Messages</span>
                <span className="text-parchment">{hoveredBucket.messages}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-stone">Sessions</span>
                <span className="text-parchment">{hoveredBucket.sessions}</span>
              </div>
            </div>
            {hoveredBucket.skills && hoveredBucket.skills.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-border-custom">
                <div className="text-[10px] text-stone mb-1">Skills</div>
                {hoveredBucket.skills.map((s) => (
                  <div key={s} className="text-[10px] text-sand truncate">{s}</div>
                ))}
              </div>
            )}
            {hoveredBucket.subagents && hoveredBucket.subagents.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-border-custom">
                <div className="text-[10px] text-stone mb-1">Subagents</div>
                {hoveredBucket.subagents.map((s) => (
                  <div key={s} className="text-[10px] text-moss truncate">{s}</div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export function ActivitySection() {
  const { data: activity } = useActivity()
  const { data: workers } = useActiveWorkers()

  return (
    <div className="space-y-3">
      <ActivityGraph activity={activity || []} />

      {workers && workers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {workers.map((w) => (
            <Link
              key={w.agentId || w.name}
              to={`/spaces/${w.space}${w.project ? '/' + w.project : ''}`}
              className="inline-flex items-center gap-1 rounded-full bg-stone/10 px-2 py-0.5 text-[10px] text-stone/70 hover:text-sand hover:bg-stone/20 transition-colors"
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="max-w-[120px] truncate">{w.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
