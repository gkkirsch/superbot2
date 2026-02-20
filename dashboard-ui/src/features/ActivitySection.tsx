import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useSystemStatus, useHeartbeatConfig, useActivity } from '@/hooks/useSpaces'
import { updateHeartbeatInterval } from '@/lib/api'
import type { ActivityBucket } from '@/lib/types'

function ActivityGraph({ activity }: { activity: ActivityBucket[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const graphRef = useRef<HTMLDivElement>(null)

  if (activity.length === 0) {
    return <div className="text-xs text-stone/50 py-2">No activity yet</div>
  }

  const maxTools = Math.max(...activity.map(b => b.tools), 1)

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Fill in gaps so the graph shows idle periods
  const bucketMs = 30 * 60 * 1000
  const filled: (ActivityBucket | null)[] = []
  const first = new Date(activity[0].ts).getTime()
  const last = new Date(activity[activity.length - 1].ts).getTime()
  const bucketMap = new Map(activity.map(b => [new Date(b.ts).getTime(), b]))

  for (let t = first; t <= last; t += bucketMs) {
    filled.push(bucketMap.get(t) || null)
  }

  const hoveredBucket = hoveredIndex !== null ? filled[hoveredIndex] : null
  const tooltipLeftPct = hoveredIndex !== null ? ((hoveredIndex + 0.5) / filled.length) * 100 : 0
  const flipTooltip = tooltipLeftPct > 75

  const getTooltipStyle = (): React.CSSProperties => {
    if (hoveredIndex === null || !graphRef.current) return { display: 'none' }
    const rect = graphRef.current.getBoundingClientRect()
    const leftPct = (hoveredIndex + 0.5) / filled.length
    const left = rect.left + rect.width * leftPct
    // If the graph is near the top of the viewport, the tooltip above would
    // overlap or go behind the sticky navbar. Flip it below the graph instead.
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
        {filled.map((bucket, i) => {
          if (!bucket) {
            return (
              <div
                key={i}
                className="flex-1 min-w-[3px] max-w-[10px] h-[2px] rounded-t-sm bg-stone/10"
                onMouseEnter={() => setHoveredIndex(i)}
              />
            )
          }
          const pct = Math.max(8, (bucket.tools / maxTools) * 100)
          return (
            <div
              key={i}
              className="flex-1 min-w-[3px] max-w-[10px] rounded-t-sm bg-ember transition-colors hover:bg-ember/80"
              style={{ height: `${pct}%` }}
              onMouseEnter={() => setHoveredIndex(i)}
            />
          )
        })}
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
  const { data: status } = useSystemStatus()
  const { data: hbConfig } = useHeartbeatConfig()
  const { data: activity } = useActivity()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(true)
  const [editingInterval, setEditingInterval] = useState(false)
  const [intervalValue, setIntervalValue] = useState('')

  const heartbeatRunning = status?.heartbeatRunning ?? false
  const intervalMinutes = hbConfig?.intervalMinutes ?? 30

  const totalTools = (activity || []).reduce((sum, b) => sum + b.tools, 0)
  const peakSessions = Math.max(...(activity || []).map(b => b.sessions), 0)

  const handleSaveInterval = async () => {
    const val = parseInt(intervalValue, 10)
    if (val > 0) {
      await updateHeartbeatInterval(val)
      queryClient.invalidateQueries({ queryKey: ['heartbeat-config'] })
    }
    setEditingInterval(false)
  }

  return (
    <div className="space-y-3">
      {/* Heartbeat status */}
      <div
        onClick={() => !editingInterval && setExpanded(!expanded)}
        className="flex items-center justify-between cursor-pointer"
        role="button"
      >
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            {heartbeatRunning && (
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-ember/60 animate-ping" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${heartbeatRunning ? 'bg-ember' : 'bg-stone/30'}`} />
          </div>
          <span className="text-xs text-stone">heartbeat</span>
        </div>
        <div className="flex items-center gap-2">
          {editingInterval ? (
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              <input
                type="number"
                min="1"
                value={intervalValue}
                onChange={e => setIntervalValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveInterval()}
                className="w-14 bg-ink border border-border-custom rounded px-1.5 py-0.5 text-xs text-parchment text-center focus:outline-none focus:border-sand/50"
                autoFocus
              />
              <span className="text-xs text-stone">min</span>
              <button onClick={handleSaveInterval} className="text-xs text-sand hover:text-sand/80"><Check className="h-3 w-3" /></button>
              <button onClick={() => setEditingInterval(false)} className="text-xs text-stone hover:text-parchment"><X className="h-3 w-3" /></button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setIntervalValue(String(intervalMinutes)); setEditingInterval(true) }}
              className="text-xs text-stone hover:text-sand transition-colors"
            >
              every {intervalMinutes}m
            </button>
          )}
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-stone/40" />
            : <ChevronDown className="h-3.5 w-3.5 text-stone/40" />
          }
        </div>
      </div>

      {expanded && (
        <>
          {/* Activity graph */}
          <ActivityGraph activity={activity || []} />

          {/* Stats line */}
          <div className="flex items-center gap-4 text-[10px] text-stone/60">
            <span>{totalTools.toLocaleString()} tool calls</span>
            <span>peak {peakSessions} sessions</span>
            <span>last 24h</span>
          </div>
        </>
      )}
    </div>
  )
}
