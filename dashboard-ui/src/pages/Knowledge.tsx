import { useState, useMemo, useCallback, useRef } from 'react'
import {
  FileText, Search, Upload, Plus, X, Pencil, Trash2, Save, MoreHorizontal,
  LayoutGrid, LayoutList, User, ChevronDown, File, Braces
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  useUser, useKnowledge, useSaveKnowledge, useDeleteKnowledge,
  useCreateKnowledge, useSaveUser, useUploadKnowledge
} from '@/hooks/useSpaces'
import { fetchKnowledgeContent } from '@/lib/api'
import { MarkdownContent } from '@/features/MarkdownContent'
import { Sheet, SheetHeader, SheetBody } from '@/components/ui/sheet'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/dialog'
import type { KnowledgeGroup } from '@/lib/types'

// --- File icon helpers ---

type FileIconStyle = { bg: string; text: string; icon: React.ReactNode }

function getFileIconStyle(filename: string): FileIconStyle {
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

function FileIcon({ filename, isUser }: { filename: string; isUser?: boolean }) {
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

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatDateFull(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// --- Row menu ---

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (ref.current && !ref.current.contains(document.activeElement)) {
        setOpen(false)
      }
    }, 100)
  }, [])

  return (
    <div ref={ref} className="relative" onBlur={handleBlur}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open) }}
        className="p-1.5 rounded-md text-stone/40 hover:text-parchment hover:bg-surface/50 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border-custom bg-surface shadow-xl z-10 py-1">
          <button
            onClick={e => { e.stopPropagation(); onEdit(); setOpen(false) }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-parchment/80 hover:bg-sand/10 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); setOpen(false) }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

// --- File viewer Sheet ---

interface FileViewerProps {
  open: boolean
  onClose: () => void
  source: string
  filename: string
  isUser?: boolean
}

function FileViewer({ open, onClose, source, filename, isUser }: FileViewerProps) {
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

// --- Upload Dialog ---

interface UploadDialogProps {
  open: boolean
  onClose: () => void
  groups: KnowledgeGroup[]
}

function UploadDialog({ open, onClose, groups }: UploadDialogProps) {
  const [source, setSource] = useState('global')
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadKnowledge()

  const reset = () => {
    setSelectedFile(null)
    setSource('global')
    setDragOver(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) setSelectedFile(file)
  }

  const handleUpload = () => {
    if (!selectedFile) return
    uploadMutation.mutate({ source, file: selectedFile }, {
      onSuccess: () => handleClose(),
    })
  }

  const sources = useMemo(() => {
    const items = [{ value: 'global', label: 'Global' }]
    groups.forEach(g => {
      if (g.source !== 'global') {
        items.push({ value: g.source, label: g.label })
      }
    })
    return items
  }, [groups])

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogHeader>
        <h3 className="text-sm font-medium text-parchment">Upload File</h3>
      </DialogHeader>
      <DialogBody>
        <div className="mb-4">
          <label className="text-xs text-stone/60 mb-1 block">Destination</label>
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            className="w-full bg-ink/50 text-parchment/90 text-sm rounded-lg border border-border-custom px-3 py-2 focus:outline-none focus:border-sand/50 appearance-none"
          >
            {sources.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl py-8 px-4 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-sand/60 bg-sand/5' : 'border-border-custom hover:border-stone/40'
          }`}
        >
          <Upload className="h-8 w-8 text-stone/30 mx-auto mb-2" />
          {selectedFile ? (
            <p className="text-sm text-parchment/80">{selectedFile.name} <span className="text-stone/40">({(selectedFile.size / 1024).toFixed(1)} KB)</span></p>
          ) : (
            <>
              <p className="text-sm text-stone/60">Drop a file here or click to browse</p>
              <p className="text-xs text-stone/30 mt-1">Any file type accepted</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) setSelectedFile(file)
            }}
          />
        </div>
        {uploadMutation.isError && (
          <p className="text-xs text-red-400 mt-2">Upload failed. Please try again.</p>
        )}
      </DialogBody>
      <DialogFooter>
        <button onClick={handleClose} className="px-3 py-1.5 text-xs text-stone hover:text-parchment transition-colors">
          Cancel
        </button>
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploadMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors disabled:opacity-50"
        >
          <Upload className="h-3 w-3" /> {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

// --- New File Dialog ---

interface NewFileDialogProps {
  open: boolean
  onClose: () => void
  groups: KnowledgeGroup[]
}

function NewFileDialog({ open, onClose, groups }: NewFileDialogProps) {
  const [source, setSource] = useState('global')
  const [filename, setFilename] = useState('')
  const createMutation = useCreateKnowledge()

  const reset = () => {
    setFilename('')
    setSource('global')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreate = () => {
    if (!filename.trim()) return
    createMutation.mutate({ source, filename: filename.trim() }, {
      onSuccess: () => handleClose(),
    })
  }

  const sources = useMemo(() => {
    const items = [{ value: 'global', label: 'Global' }]
    groups.forEach(g => {
      if (g.source !== 'global') {
        items.push({ value: g.source, label: g.label })
      }
    })
    return items
  }, [groups])

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogHeader>
        <h3 className="text-sm font-medium text-parchment">New File</h3>
      </DialogHeader>
      <DialogBody>
        <div className="mb-4">
          <label className="text-xs text-stone/60 mb-1 block">Destination</label>
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            className="w-full bg-ink/50 text-parchment/90 text-sm rounded-lg border border-border-custom px-3 py-2 focus:outline-none focus:border-sand/50 appearance-none"
          >
            {sources.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-stone/60 mb-1 block">Filename</label>
          <input
            value={filename}
            onChange={e => setFilename(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder="e.g. my-notes.md"
            className="w-full bg-ink/50 text-parchment/90 text-sm rounded-lg border border-border-custom px-3 py-2 focus:outline-none focus:border-sand/50"
            autoFocus
          />
          <p className="text-xs text-stone/30 mt-1">Defaults to .md if no extension provided</p>
        </div>
        {createMutation.isError && (
          <p className="text-xs text-red-400 mt-2">{(createMutation.error as Error)?.message || 'Failed to create'}</p>
        )}
      </DialogBody>
      <DialogFooter>
        <button onClick={handleClose} className="px-3 py-1.5 text-xs text-stone hover:text-parchment transition-colors">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!filename.trim() || createMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> {createMutation.isPending ? 'Creating...' : 'Create'}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

// --- Delete confirmation Dialog ---

function DeleteDialog({ open, onClose, filename, onConfirm, isPending }: {
  open: boolean
  onClose: () => void
  filename: string
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogHeader>
        <h3 className="text-sm font-medium text-parchment">Delete File</h3>
      </DialogHeader>
      <DialogBody>
        <p className="text-sm text-stone">Are you sure you want to delete <span className="text-parchment font-medium">{filename}</span>? This action cannot be undone.</p>
      </DialogBody>
      <DialogFooter>
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-stone hover:text-parchment transition-colors">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-400/20 text-red-400 rounded-lg hover:bg-red-400/30 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" /> {isPending ? 'Deleting...' : 'Delete'}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

// --- Main Page ---

export function Knowledge() {
  const { data: groups, isLoading } = useKnowledge()
  const { data: userData } = useUser()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  // Sheet state
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFile, setViewerFile] = useState<{ source: string; filename: string; isUser?: boolean } | null>(null)

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false)
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ source: string; filename: string } | null>(null)

  const deleteMutation = useDeleteKnowledge()

  const openFile = (source: string, filename: string, isUser?: boolean) => {
    setViewerFile({ source, filename, isUser })
    setViewerOpen(true)
  }

  const handleDelete = (source: string, filename: string) => {
    setDeleteTarget({ source, filename })
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget, {
      onSuccess: () => {
        setDeleteTarget(null)
        if (viewerFile?.source === deleteTarget.source && viewerFile?.filename === deleteTarget.filename) {
          setViewerOpen(false)
        }
      },
    })
  }

  // Build flat list for USER.md + all knowledge groups
  const allGroups = useMemo(() => {
    if (!groups) return []

    let filtered = groups
    if (filter !== 'all') {
      filtered = groups.filter(g => g.source === filter)
    }

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered
        .map(g => ({
          ...g,
          files: g.files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)),
        }))
        .filter(g => g.files.length > 0)
    }

    return filtered
  }, [groups, filter, search])

  // Compute the latest date per group (for the header date)
  function groupDate(g: KnowledgeGroup): string {
    if (!g.files.length) return ''
    const dates = g.files.map(f => f.lastModified).filter(Boolean) as string[]
    if (!dates.length) return ''
    const latest = dates.sort().pop()!
    return formatDate(latest)
  }

  // Determine if USER.md should show (only when filter is 'all' or 'global')
  const showUser = userData?.exists && (filter === 'all' || filter === 'global') &&
    (!search.trim() || 'user.md'.includes(search.toLowerCase()))

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-2xl text-parchment">Knowledge</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'text-sand bg-sand/10' : 'text-stone/40 hover:text-parchment'}`}
              title="List view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'text-sand bg-sand/10' : 'text-stone/40 hover:text-parchment'}`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <div className="w-px h-5 bg-border-custom mx-1" />
            <button
              onClick={() => setNewFileOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface/50 text-parchment/80 rounded-lg hover:bg-surface transition-colors border border-border-custom"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors"
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
          </div>
        </div>

        {/* Search and Filter bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="appearance-none bg-surface/50 text-parchment/80 text-sm rounded-lg border border-border-custom pl-3 pr-8 py-2 focus:outline-none focus:border-sand/50"
            >
              <option value="all">All</option>
              <option value="global">Global</option>
              {groups?.filter(g => g.source !== 'global').map(g => (
                <option key={g.source} value={g.source}>{g.label}</option>
              ))}
            </select>
            <ChevronDown className="h-3.5 w-3.5 text-stone/40 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-stone/30 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full bg-surface/50 text-parchment/80 text-sm rounded-lg border border-border-custom pl-9 pr-3 py-2 focus:outline-none focus:border-sand/50 placeholder:text-stone/30"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone/30 hover:text-parchment"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-surface/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* USER.md */}
            {showUser && (filter === 'all' || filter === 'global') && (
              <div>
                {viewMode === 'list' ? (
                  <button
                    onClick={() => openFile('global', 'USER.md', true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface/30 transition-colors group text-left"
                  >
                    <FileIcon filename="USER.md" isUser />
                    <span className="text-sm text-parchment/80 flex-1 truncate">USER.md</span>
                    <span className="text-xs text-stone/30 shrink-0">User Profile</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openFile('global', 'USER.md', true)}
                    className="inline-flex flex-col items-center gap-2 p-4 rounded-xl border border-border-custom hover:border-stone/30 hover:bg-surface/20 transition-colors text-center w-28"
                  >
                    <FileIcon filename="USER.md" isUser />
                    <span className="text-xs text-parchment/70 truncate w-full">USER.md</span>
                  </button>
                )}
              </div>
            )}

            {/* Knowledge groups */}
            {allGroups.map(group => (
              <div key={group.source}>
                {/* Group header */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-px flex-1 bg-border-custom" />
                  <span className="text-xs font-medium text-stone/50 uppercase tracking-wider">{group.label}</span>
                  <span className="text-xs text-stone/30">{groupDate(group)}</span>
                  <div className="h-px flex-1 bg-border-custom" />
                </div>

                {viewMode === 'list' ? (
                  /* List view */
                  <div>
                    {group.files.map(file => {
                      const dirPrefix = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : ''
                      return (
                        <div
                          key={file.path}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface/30 transition-colors group cursor-pointer"
                          onClick={() => openFile(group.source, file.path)}
                        >
                          <FileIcon filename={file.name} />
                          <span className="text-sm flex-1 truncate">
                            {dirPrefix && <span className="text-stone/40">{dirPrefix}</span>}
                            <span className="text-parchment/80">{file.name}</span>
                          </span>
                          <span className="text-xs text-stone/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{formatDate(file.lastModified)}</span>
                          <RowMenu
                            onEdit={() => openFile(group.source, file.path)}
                            onDelete={() => handleDelete(group.source, file.path)}
                          />
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* Grid view */
                  <div className="flex flex-wrap gap-3">
                    {group.files.map(file => (
                      <button
                        key={file.path}
                        onClick={() => openFile(group.source, file.path)}
                        className="inline-flex flex-col items-center gap-2 p-4 rounded-xl border border-border-custom hover:border-stone/30 hover:bg-surface/20 transition-colors text-center w-28"
                        title={file.path}
                      >
                        <FileIcon filename={file.name} />
                        <span className="text-xs text-parchment/70 truncate w-full">{file.path.includes('/') ? file.path : file.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Empty state */}
            {!showUser && allGroups.length === 0 && (
              <div className="rounded-xl border border-border-custom bg-surface/30 py-16 text-center">
                <FileText className="h-10 w-10 text-stone/15 mx-auto mb-3" />
                <p className="text-sm text-stone/40">
                  {search ? 'No files match your search' : 'No knowledge files found'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* File viewer Sheet */}
      {viewerFile && (
        <FileViewer
          open={viewerOpen}
          onClose={() => { setViewerOpen(false); setViewerFile(null) }}
          source={viewerFile.source}
          filename={viewerFile.filename}
          isUser={viewerFile.isUser}
        />
      )}

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        groups={groups || []}
      />

      {/* New File Dialog */}
      <NewFileDialog
        open={newFileOpen}
        onClose={() => setNewFileOpen(false)}
        groups={groups || []}
      />

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <DeleteDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          filename={deleteTarget.filename}
          onConfirm={confirmDelete}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
