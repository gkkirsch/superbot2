import { useState, useMemo, useCallback, useRef } from 'react'
import {
  FileText, Search, Upload, Plus, X, Pencil, Trash2, MoreHorizontal,
  LayoutGrid, LayoutList, ChevronDown, Image, ChevronLeft, ChevronRight
} from 'lucide-react'
import {
  useUser, useKnowledge, useDeleteKnowledge,
  useCreateKnowledge, useUploadKnowledge, useUploads
} from '@/hooks/useSpaces'
import { getUploadUrl } from '@/lib/api'
import type { UploadFile } from '@/lib/api'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { FileIcon } from '@/features/KnowledgeFileViewer'
import { useFileViewer } from '@/contexts/FileViewerContext'
import type { KnowledgeGroup } from '@/lib/types'

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
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

// --- Lightbox ---

function Lightbox({ file, onClose, onPrev, onNext }: {
  file: UploadFile
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white p-2">
        <X className="h-6 w-6" />
      </button>
      {onPrev && (
        <button
          onClick={e => { e.stopPropagation(); onPrev() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-2 bg-black/40 rounded-full"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {onNext && (
        <button
          onClick={e => { e.stopPropagation(); onNext() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-2 bg-black/40 rounded-full"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
        <img
          src={getUploadUrl(file.name)}
          alt={file.name}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
        <div className="mt-3 text-center">
          <p className="text-sm text-white/80">{file.name}</p>
          <p className="text-xs text-white/40">{formatFileSize(file.size)} &middot; {formatFullDate(file.modifiedAt)}</p>
        </div>
      </div>
    </div>
  )
}

// --- Uploads Grid ---

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function UploadsGrid() {
  const PAGE_SIZE = 60
  const [page, setPage] = useState(0)
  const { data, isLoading } = useUploads(PAGE_SIZE, page * PAGE_SIZE)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const files = data?.files || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const imageFiles = useMemo(() => files.filter(f => f.isImage), [files])

  const openLightbox = (file: UploadFile) => {
    const idx = imageFiles.indexOf(file)
    setLightboxIdx(idx >= 0 ? idx : null)
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl bg-surface/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-border-custom bg-surface/30 py-16 text-center">
        <Image className="h-10 w-10 text-stone/15 mx-auto mb-3" />
        <p className="text-sm text-stone/40">No uploads yet</p>
        <p className="text-xs text-stone/25 mt-1">Screenshots and images from workers will appear here</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {files.map(file => (
          <button
            key={file.name}
            onClick={() => file.isImage ? openLightbox(file) : undefined}
            className="group relative flex flex-col rounded-xl border border-border-custom hover:border-stone/30 bg-surface/20 hover:bg-surface/40 transition-colors overflow-hidden text-left"
          >
            {file.isImage ? (
              <div className="aspect-square bg-ink/50 overflow-hidden">
                <img
                  src={getUploadUrl(file.name)}
                  alt={file.name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
              </div>
            ) : (
              <div className="aspect-square bg-ink/50 flex items-center justify-center">
                <FileText className="h-10 w-10 text-stone/20" />
              </div>
            )}
            <div className="px-3 py-2.5 min-w-0">
              <p className="text-xs text-parchment/70 truncate">{file.name}</p>
              <p className="text-[10px] text-stone/40 mt-0.5">
                {formatFileSize(file.size)} &middot; {formatDate(file.modifiedAt)}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs text-stone/60 hover:text-parchment disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 inline" /> Prev
          </button>
          <span className="text-xs text-stone/40">
            {page + 1} / {totalPages} ({total} files)
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs text-stone/60 hover:text-parchment disabled:opacity-30 transition-colors"
          >
            Next <ChevronRight className="h-4 w-4 inline" />
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && imageFiles[lightboxIdx] && (
        <Lightbox
          file={imageFiles[lightboxIdx]}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined}
          onNext={lightboxIdx < imageFiles.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : undefined}
        />
      )}
    </>
  )
}

// --- Main Page ---

export function Knowledge() {
  const { data: groups, isLoading } = useKnowledge()
  const { data: userData } = useUser()

  const [activeTab, setActiveTab] = useState<'library' | 'uploads'>('library')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const { openFile: openGlobalFile } = useFileViewer()

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false)
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ source: string; filename: string } | null>(null)

  const deleteMutation = useDeleteKnowledge()

  const openFile = (source: string, filename: string, isUser?: boolean) => {
    openGlobalFile({ source, filename, isUser })
  }

  const handleDelete = (source: string, filename: string) => {
    setDeleteTarget({ source, filename })
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget, {
      onSuccess: () => setDeleteTarget(null),
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
          <h1 className="font-heading text-2xl text-parchment">Library</h1>
          {activeTab === 'library' && (
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
          )}
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 border-b border-border-custom">
          <button
            onClick={() => setActiveTab('library')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'library'
                ? 'text-sand border-b-2 border-sand -mb-px'
                : 'text-stone/50 hover:text-parchment/70'
            }`}
          >
            Knowledge
          </button>
          <button
            onClick={() => setActiveTab('uploads')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'uploads'
                ? 'text-sand border-b-2 border-sand -mb-px'
                : 'text-stone/50 hover:text-parchment/70'
            }`}
          >
            Uploads
          </button>
        </div>

        {/* Search and Filter bar (library tab only) */}
        {activeTab === 'library' && (
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
        )}

        {/* Content */}
        {activeTab === 'library' ? (
          isLoading ? (
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
                        const dirPrefix = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''
                        return (
                          <div
                            key={file.path}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface/30 transition-colors group cursor-pointer"
                            onClick={() => openFile(group.source, file.path)}
                          >
                            <FileIcon filename={file.name} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-parchment/80 truncate block">{file.name}</span>
                              {dirPrefix && <span className="text-xs text-stone/40 truncate block">{dirPrefix}</span>}
                            </div>
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
                      {group.files.map(file => {
                        const dirPrefix = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''
                        return (
                          <button
                            key={file.path}
                            onClick={() => openFile(group.source, file.path)}
                            className="inline-flex flex-col items-center gap-2 p-4 rounded-xl border border-border-custom hover:border-stone/30 hover:bg-surface/20 transition-colors text-center w-28"
                            title={file.path}
                          >
                            <FileIcon filename={file.name} />
                            <div className="w-full min-w-0">
                              <span className="text-xs text-parchment/70 truncate block">{file.name}</span>
                              {dirPrefix && <span className="text-[10px] text-stone/40 truncate block">{dirPrefix}</span>}
                            </div>
                          </button>
                        )
                      })}
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
          )
        ) : (
          <UploadsGrid />
        )}
      </div>

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
