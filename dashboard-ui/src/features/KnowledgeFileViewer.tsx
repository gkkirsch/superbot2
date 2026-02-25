import { useState } from 'react'
import { FileText, File, Braces, User, Pencil, Trash2, Save, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useSaveKnowledge, useDeleteKnowledge, useSaveUser } from '@/hooks/useSpaces'
import { fetchKnowledgeContent } from '@/lib/api'
import { MarkdownContent } from '@/features/MarkdownContent'
import { Sheet, SheetHeader, SheetBody } from '@/components/ui/sheet'

// --- File icon helpers ---

type FileIconStyle = { bg: string; text: string; icon: React.ReactNode }

export function getFileIconStyle(filename: string): FileIconStyle {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'md':
      return { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: <FileText className="h-4 w-4" /> }
    case 'txt':
      return { bg: 'bg-stone/20', text: 'text-stone', icon: <FileText className="h-4 w-4" /> }
    case 'json':
      return { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: <Braces className="h-4 w-4" /> }
    case 'csv':
      return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: <FileText className="h-4 w-4" /> }
    case 'pdf':
      return { bg: 'bg-red-500/20', text: 'text-red-400', icon: <FileText className="h-4 w-4" /> }
    default:
      return { bg: 'bg-stone/20', text: 'text-stone/60', icon: <File className="h-4 w-4" /> }
  }
}

export function FileIcon({ filename, isUser }: { filename: string; isUser?: boolean }) {
  if (isUser) {
    return (
      <div className="h-8 w-8 rounded-lg bg-sand/20 flex items-center justify-center shrink-0">
        <User className="h-4 w-4 text-sand" />
      </div>
    )
  }
  const style = getFileIconStyle(filename)
  return (
    <div className={`h-8 w-8 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}>
      <span className={style.text}>{style.icon}</span>
    </div>
  )
}

function formatDateFull(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// --- File viewer Sheet ---

export interface FileViewerProps {
  open: boolean
  onClose: () => void
  source: string
  filename: string
  isUser?: boolean
}

export function FileViewer({ open, onClose, source, filename, isUser }: FileViewerProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: isUser ? ['context', 'user'] : ['knowledge-content', source, filename],
    queryFn: isUser
      ? () => fetch('/api/user').then(r => r.json())
      : () => fetchKnowledgeContent(source, filename),
    enabled: open,
    staleTime: 30_000,
  })

  const saveMutation = isUser ? useSaveUser() : useSaveKnowledge()
  const deleteMutation = useDeleteKnowledge()

  const startEdit = () => {
    setDraft(data?.content || '')
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const save = () => {
    if (isUser) {
      ;(saveMutation as ReturnType<typeof useSaveUser>).mutate(draft, {
        onSuccess: () => setEditing(false),
      })
    } else {
      ;(saveMutation as ReturnType<typeof useSaveKnowledge>).mutate(
        { source, filename, content: draft },
        { onSuccess: () => setEditing(false) }
      )
    }
  }

  const handleDelete = () => {
    if (!isUser) {
      deleteMutation.mutate({ source, filename }, { onSuccess: onClose })
    }
  }

  const isMd = filename.endsWith('.md')

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) { setEditing(false); onClose() } }}>
      <SheetHeader>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <FileIcon filename={filename} isUser={isUser} />
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-parchment truncate">{filename}</h3>
            {data?.lastModified && (
              <p className="text-xs text-stone/50">Last modified: {formatDateFull(data.lastModified)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && (
            <button onClick={startEdit} className="p-1.5 rounded-md text-stone/50 hover:text-sand hover:bg-sand/10 transition-colors" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {!isUser && (
            <button onClick={handleDelete} className="p-1.5 rounded-md text-stone/50 hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => { setEditing(false); onClose() }} className="p-1.5 rounded-md text-stone/50 hover:text-parchment hover:bg-surface/50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </SheetHeader>
      <SheetBody className="flex flex-col h-[calc(100vh-65px)]">
        {isLoading ? (
          <div className="space-y-3 py-4">
            <div className="h-4 w-3/4 rounded bg-surface/50 animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-surface/50 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-surface/50 animate-pulse" />
          </div>
        ) : editing ? (
          <div className="flex flex-col flex-1">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="flex-1 bg-ink/50 text-parchment/90 text-sm font-mono rounded-lg border border-border-custom p-3 resize-none focus:outline-none focus:border-sand/50"
            />
            <div className="flex items-center gap-2 mt-3 shrink-0">
              <button
                onClick={save}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors disabled:opacity-50"
              >
                <Save className="h-3 w-3" /> {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button onClick={cancelEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone hover:text-parchment transition-colors">
                <X className="h-3 w-3" /> Cancel
              </button>
              {saveMutation.isError && <span className="text-xs text-red-400">Failed to save</span>}
            </div>
          </div>
        ) : data?.exists !== false ? (
          <div className={isMd ? 'docs-content' : ''}>
            {isMd ? (
              <MarkdownContent content={data?.content || ''} className="text-sm text-stone" />
            ) : (
              <pre className="text-sm text-parchment/80 font-mono whitespace-pre-wrap break-words">{data?.content || ''}</pre>
            )}
          </div>
        ) : (
          <p className="text-sm text-stone/40 py-4">File not found</p>
        )}
      </SheetBody>
    </Sheet>
  )
}
