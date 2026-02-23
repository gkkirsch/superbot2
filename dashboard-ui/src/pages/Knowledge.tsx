import { useState } from 'react'
import { BookOpen, Pencil, Trash2, Plus, Save, X, FileText, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useUser, useKnowledge, useSaveKnowledge, useDeleteKnowledge, useCreateKnowledge, useSaveUser } from '@/hooks/useSpaces'
import { fetchKnowledgeContent } from '@/lib/api'
import { MarkdownContent } from '@/features/MarkdownContent'
import type { KnowledgeGroup, KnowledgeFile as KnowledgeFileType } from '@/lib/types'

function UserSection() {
  const { data, isLoading } = useUser()
  const saveMutation = useSaveUser()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    setDraft(data?.content || '')
    setEditing(true)
  }

  const cancel = () => setEditing(false)

  const save = () => {
    saveMutation.mutate(draft, {
      onSuccess: () => setEditing(false),
    })
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg text-parchment">USER.md</h2>
        {!editing && data?.exists && (
          <button onClick={startEdit} className="text-xs text-stone hover:text-sand transition-colors inline-flex items-center gap-1">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border-custom bg-surface/30 p-4 space-y-2">
          <div className="h-4 w-3/4 rounded bg-surface/50 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-surface/50 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-surface/50 animate-pulse" />
        </div>
      ) : editing ? (
        <div className="rounded-lg border border-sand/30 bg-surface/30 p-4">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full h-64 bg-ink/50 text-parchment/90 text-sm font-mono rounded-lg border border-border-custom p-3 resize-y focus:outline-none focus:border-sand/50"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={save}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors disabled:opacity-50"
            >
              <Save className="h-3 w-3" /> {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button onClick={cancel} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone hover:text-parchment transition-colors">
              <X className="h-3 w-3" /> Cancel
            </button>
            {saveMutation.isError && <span className="text-xs text-red-400">Failed to save</span>}
          </div>
        </div>
      ) : data?.exists ? (
        <div className="rounded-lg border border-border-custom bg-surface/30 p-4 docs-content">
          <MarkdownContent content={data.content} className="text-sm text-stone" />
        </div>
      ) : (
        <div className="rounded-lg border border-border-custom bg-surface/30 p-4 text-center">
          <p className="text-sm text-stone/40">USER.md not found</p>
        </div>
      )}
    </section>
  )
}

function KnowledgeFileItem({ source, file }: { source: string; file: KnowledgeFileType }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-content', source, file.path],
    queryFn: () => fetchKnowledgeContent(source, file.path),
    enabled: expanded,
    staleTime: 60_000,
  })

  const saveMutation = useSaveKnowledge()
  const deleteMutation = useDeleteKnowledge()

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(data?.content || '')
    setEditing(true)
    setExpanded(true)
  }

  const cancelEdit = () => {
    setEditing(false)
  }

  const save = () => {
    saveMutation.mutate({ source, filename: file.path, content: draft }, {
      onSuccess: () => setEditing(false),
    })
  }

  const doDelete = () => {
    deleteMutation.mutate({ source, filename: file.path })
  }

  return (
    <div className="rounded-lg border border-border-custom bg-surface/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => { setExpanded(!expanded); setConfirmDelete(false) }}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          <ChevronRight className={`h-3.5 w-3.5 text-stone/40 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <FileText className="h-3.5 w-3.5 text-stone/40 shrink-0" />
          <span className="text-sm text-parchment/80 truncate">{file.name}</span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && (
            <button onClick={startEdit} className="p-1 text-stone/40 hover:text-sand transition-colors" title="Edit">
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {!confirmDelete ? (
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }} className="p-1 text-stone/40 hover:text-red-400 transition-colors" title="Delete">
              <Trash2 className="h-3 w-3" />
            </button>
          ) : (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button onClick={doDelete} disabled={deleteMutation.isPending} className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded bg-red-400/10">
                {deleteMutation.isPending ? '...' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-stone/40 hover:text-stone px-1.5 py-0.5">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-custom px-3 py-3">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-3/4 rounded bg-surface/50 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-surface/50 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-surface/50 animate-pulse" />
            </div>
          ) : editing ? (
            <div>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="w-full h-48 bg-ink/50 text-parchment/90 text-sm font-mono rounded-lg border border-border-custom p-3 resize-y focus:outline-none focus:border-sand/50"
              />
              <div className="flex items-center gap-2 mt-2">
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
          ) : data?.exists ? (
            <div className="docs-content max-h-96 overflow-y-auto">
              <MarkdownContent content={data.content} className="text-sm text-stone" />
            </div>
          ) : (
            <p className="text-xs text-stone/40">File not found</p>
          )}
        </div>
      )}
    </div>
  )
}

function KnowledgeGroupSection({ group }: { group: KnowledgeGroup }) {
  const [expanded, setExpanded] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newFilename, setNewFilename] = useState('')

  const createMutation = useCreateKnowledge()

  const handleCreate = () => {
    if (!newFilename.trim()) return
    createMutation.mutate({ source: group.source, filename: newFilename.trim() }, {
      onSuccess: () => {
        setNewFilename('')
        setCreating(false)
      },
    })
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2">
          <ChevronRight className={`h-4 w-4 text-stone/40 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <h3 className="font-heading text-base text-parchment">{group.label}</h3>
          <span className="text-xs text-stone/40">({group.files.length})</span>
        </button>
        <button
          onClick={() => { setCreating(!creating); setExpanded(true) }}
          className="text-xs text-stone hover:text-sand transition-colors inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> New file
        </button>
      </div>

      {expanded && (
        <div className="space-y-1.5 ml-2">
          {creating && (
            <div className="rounded-lg border border-sand/30 bg-surface/30 p-3 flex items-center gap-2">
              <input
                value={newFilename}
                onChange={e => setNewFilename(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
                placeholder="filename (without .md)"
                className="flex-1 bg-ink/50 text-parchment/90 text-sm rounded-lg border border-border-custom px-3 py-1.5 focus:outline-none focus:border-sand/50"
                autoFocus
              />
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending || !newFilename.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> {createMutation.isPending ? '...' : 'Create'}
              </button>
              <button onClick={() => setCreating(false)} className="p-1 text-stone hover:text-parchment transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
              {createMutation.isError && <span className="text-xs text-red-400">{(createMutation.error as Error)?.message || 'Failed'}</span>}
            </div>
          )}
          {group.files.map(file => (
            <KnowledgeFileItem key={file.path} source={group.source} file={file} />
          ))}
          {group.files.length === 0 && !creating && (
            <p className="text-xs text-stone/40 ml-6 py-2">No files</p>
          )}
        </div>
      )}
    </section>
  )
}

export function Knowledge() {
  const { data: groups, isLoading } = useKnowledge()

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center gap-2 mb-6">
          <BookOpen className="h-5 w-5 text-sand" />
          <h1 className="font-heading text-2xl text-parchment">Knowledge</h1>
        </div>

        <UserSection />

        <div className="border-t border-border-custom pt-6">
          <h2 className="font-heading text-lg text-parchment mb-4">Knowledge Files</h2>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-surface/50 animate-pulse" />
              ))}
            </div>
          ) : !groups || groups.length === 0 ? (
            <div className="rounded-lg border border-border-custom bg-surface/50 py-12 text-center">
              <BookOpen className="h-8 w-8 text-stone/20 mx-auto mb-3" />
              <p className="text-sm text-stone">No knowledge files found</p>
            </div>
          ) : (
            groups.map(group => (
              <KnowledgeGroupSection key={group.source} group={group} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
