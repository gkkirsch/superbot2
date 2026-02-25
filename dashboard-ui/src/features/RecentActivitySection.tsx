import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, FileText, FolderOpen } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSessions } from '@/hooks/useSpaces'
import { dismissSession } from '@/lib/api'
import { SectionHeader } from '@/components/SectionHeader'
import type { SessionSummary } from '@/lib/types'

function cleanSummary(summary: string, space: string, project: string): string {
  const trimmed = summary.trim()
  // Detect raw JSON that leaked into the summary field
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"{')) {
    return `Worker completed work on ${space}/${project}`
  }
  return summary
}

function SessionCard({ session, onDismiss }: { session: SessionSummary; onDismiss: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)

  const completedDate = new Date(session.completedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const completedTime = new Date(session.completedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="rounded-lg border border-stone/15 bg-surface/20 overflow-hidden transition-all duration-200 hover:border-stone/25 group/card">
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-3 py-2 text-left cursor-pointer"
        role="button"
      >
        <FolderOpen className="h-4 w-4 text-sand/60 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-sand/80 font-medium">{session.space}/{session.project}</span>
          </div>
          <p className={`text-xs text-parchment/90 leading-snug mt-0.5${expanded ? '' : ' line-clamp-2'}`}>{cleanSummary(session.summary, session.space, session.project)}</p>
          {!expanded && session.filesChanged.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <FileText className="h-3 w-3 text-stone/40" />
              <span className="text-[10px] text-stone/50">{session.filesChanged.length} file{session.filesChanged.length !== 1 ? 's' : ''} changed</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className="text-[10px] text-stone/40 whitespace-nowrap">{completedDate} {completedTime}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(session.id) }}
            className="text-stone/40 hover:text-sand/70 transition-colors p-1.5 shrink-0 rounded"
            title="Mark as read"
          >
            <Check className="h-4 w-4" />
          </button>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-stone/40" />
            : <ChevronDown className="h-3.5 w-3.5 text-stone/40" />
          }
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3.5 space-y-2.5 ml-7">
          {session.filesChanged.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[10px] text-stone/50 uppercase tracking-wider">Files changed</span>
              {session.filesChanged.map((file) => (
                <div key={file} className="text-xs text-stone/60 font-mono truncate pl-2 border-l border-stone/10">
                  {file}
                </div>
              ))}
            </div>
          )}
          {session.worker && (
            <div className="mt-2 text-[10px] text-stone/40">Worker: {session.worker}</div>
          )}
        </div>
      )}
    </div>
  )
}

export function RecentActivitySection() {
  const { data: sessions, isLoading } = useSessions(10)
  const [showAll, setShowAll] = useState(false)
  const queryClient = useQueryClient()

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const visible = showAll ? (sessions ?? []) : (sessions ?? []).slice(0, 5)

  return (
    <section className="mt-8" data-section="recent-activity">
      <SectionHeader title="Recent Activity" icon={FolderOpen} />
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-stone/5 animate-pulse" />
          ))}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <div className="rounded-lg border border-border-custom bg-surface/50 py-8 text-center">
          <FolderOpen className="h-6 w-6 text-stone/20 mx-auto mb-2" />
          <p className="text-sm text-stone">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDismiss={(id) => dismissMutation.mutate(id)}
            />
          ))}
          {sessions.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1 mx-auto"
            >
              {showAll ? 'Show fewer' : `Show all ${sessions.length}`}
              {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
