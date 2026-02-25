import { useState } from 'react'
import { ChevronRight, BookOpen } from 'lucide-react'
import { useKnowledge } from '@/hooks/useSpaces'
import { FileIcon, FileViewer } from '@/features/KnowledgeFileViewer'
import type { KnowledgeGroup } from '@/lib/types'

function GroupItem({ group, onOpenFile }: { group: KnowledgeGroup; onOpenFile: (source: string, path: string) => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg border border-border-custom bg-surface/40 hover:border-sand/30 hover:bg-surface/60 transition-colors"
      >
        <ChevronRight className={`h-3.5 w-3.5 text-stone/40 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className="text-sm text-parchment font-medium truncate">{group.label}</span>
        <span className="text-xs text-stone/40 ml-auto shrink-0">({group.files.length})</span>
      </button>
      {expanded && (
        <div className="mt-1">
          {group.files.map((file) => {
            const dirPrefix = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''
            return (
              <div
                key={file.path}
                onClick={() => onOpenFile(group.source, file.path)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface/30 transition-colors cursor-pointer"
              >
                <FileIcon filename={file.name} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-parchment/80 truncate block">{file.name}</span>
                  {dirPrefix && <span className="text-xs text-stone/40 truncate block">{dirPrefix}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function KnowledgeSection() {
  const { data: groups, isLoading } = useKnowledge()

  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFile, setViewerFile] = useState<{ source: string; filename: string } | null>(null)

  const openFile = (source: string, filename: string) => {
    setViewerFile({ source, filename })
    setViewerOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-surface/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="rounded-lg border border-border-custom bg-surface/50 py-4 flex items-center gap-2.5 px-4">
        <BookOpen className="h-4 w-4 text-stone/30 shrink-0" />
        <p className="text-xs text-stone/50">No knowledge files found</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {groups.map((group) => (
          <GroupItem key={group.source} group={group} onOpenFile={openFile} />
        ))}
      </div>

      {viewerFile && (
        <FileViewer
          open={viewerOpen}
          onClose={() => { setViewerOpen(false); setViewerFile(null) }}
          source={viewerFile.source}
          filename={viewerFile.filename}
        />
      )}
    </>
  )
}
