import { useState } from 'react'
import { ChevronRight, FileText, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useKnowledge } from '@/hooks/useSpaces'
import { fetchKnowledgeContent } from '@/lib/api'
import { MarkdownContent } from '@/features/MarkdownContent'
import type { KnowledgeGroup } from '@/lib/types'

function FileItem({ source, file }: { source: string; file: { name: string; path: string } }) {
  const [expanded, setExpanded] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-content', source, file.path],
    queryFn: () => fetchKnowledgeContent(source, file.path),
    enabled: expanded,
    staleTime: 60_000,
  })

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface/60 rounded transition-colors"
      >
        <FileText className="h-3 w-3 text-stone/40 shrink-0" />
        <span className="text-xs truncate">
          <span className="text-parchment/80">{file.name}</span>
          {file.path.includes('/') && <span className="text-stone/40 ml-1">{file.path.substring(0, file.path.lastIndexOf('/'))}</span>}
        </span>
      </button>
      {expanded && (
        <div className="mx-3 mb-2 mt-1 rounded-lg border border-border-custom bg-surface/30 p-3 max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-3/4 rounded bg-surface/50 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-surface/50 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-surface/50 animate-pulse" />
            </div>
          ) : data?.exists ? (
            <MarkdownContent content={data.content} />
          ) : (
            <p className="text-xs text-stone/40">File not found</p>
          )}
        </div>
      )}
    </div>
  )
}

function GroupItem({ group }: { group: KnowledgeGroup }) {
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
        <div className="mt-1 ml-2">
          {group.files.map((file) => (
            <FileItem key={file.path} source={group.source} file={file} />
          ))}
        </div>
      )}
    </div>
  )
}

export function KnowledgeSection() {
  const { data: groups, isLoading } = useKnowledge()

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
      <div className="rounded-lg border border-border-custom bg-surface/50 py-12 text-center">
        <BookOpen className="h-8 w-8 text-stone/20 mx-auto mb-3" />
        <p className="text-sm text-stone">No knowledge files found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <GroupItem key={group.source} group={group} />
      ))}
      <Link
        to="/knowledge"
        className="block text-center text-xs text-stone hover:text-sand transition-colors py-2"
      >
        View all &rarr;
      </Link>
    </div>
  )
}
