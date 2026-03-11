import { useState } from 'react'
import { FileText, RefreshCw, GitCommit } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLatestFiles } from '@/hooks/useSpaces'
import type { LatestFile } from '@/lib/api'

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays === 1) return '1d ago'
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function FileRow({ file }: { file: LatestFile }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-surface/30 transition-colors group/row">
      <FileText className="h-3.5 w-3.5 text-stone/40 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-parchment/90 font-mono truncate">{file.filename}</span>
          <span className="text-[10px] text-sand/60 shrink-0">{file.spaceName}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <GitCommit className="h-2.5 w-2.5 text-stone/30 shrink-0" />
          <span className="text-[10px] text-stone/50 truncate">{file.commitMessage}</span>
        </div>
      </div>
      <span className="text-[10px] text-stone/40 shrink-0 mt-0.5">{timeAgo(file.modifiedAt)}</span>
    </div>
  )
}

export function LatestFilesSection() {
  const { data: files, isLoading } = useLatestFiles()
  const [showAll, setShowAll] = useState(false)
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    queryClient.invalidateQueries({ queryKey: ['latest-files'] }).then(() => {
      setTimeout(() => setRefreshing(false), 600)
    })
  }

  const visible = showAll ? (files ?? []) : (files ?? []).slice(0, 10)

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-stone/5 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!files || files.length === 0) {
    return (
      <div className="rounded-lg border border-border-custom bg-surface/50 py-4 flex items-center gap-2.5 px-4">
        <FileText className="h-4 w-4 text-stone/30 shrink-0" />
        <p className="text-xs text-stone/50">No recent file changes found</p>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-0.5">
        {visible.map((file, i) => (
          <FileRow key={`${file.space}:${file.path}:${i}`} file={file} />
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        {files.length > 10 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] text-stone/50 hover:text-sand transition-colors"
          >
            {showAll ? 'Show fewer' : `Show all ${files.length}`}
          </button>
        )}
        <button
          onClick={handleRefresh}
          className="text-stone/40 hover:text-sand transition-colors p-1 rounded ml-auto"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  )
}
