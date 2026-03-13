import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown, ChevronUp, StickyNote, Lightbulb, ArrowUpRight } from 'lucide-react'
import { useBacklog } from '@/hooks/useSpaces'
import type { TodoNote, BacklogItem } from '@/lib/types'

interface BacklogItemRowProps {
  item: BacklogItem
  onToggle: () => void
  onRemove: () => void
  onPromote: () => void
  onEdit: (newText: string) => void
}

function BacklogItemRow({ item, onToggle, onRemove, onPromote, onEdit }: BacklogItemRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.text)
  const editRef = useRef<HTMLInputElement>(null)
  const notes = item.notes || []
  const hasExpandable = notes.length > 0 || !item.completed

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editing])

  function commitEdit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== item.text) {
      onEdit(trimmed)
    } else {
      setEditValue(item.text)
    }
    setEditing(false)
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { setEditValue(item.text); setEditing(false) }
  }

  return (
    <div>
      <div className={`flex items-center gap-2 group rounded-lg px-2 py-1.5 transition-colors ${hasExpandable && !editing ? 'cursor-pointer hover:bg-surface/30' : 'hover:bg-surface/20'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className={item.completed
            ? "h-4 w-4 shrink-0 rounded border border-sand/30 bg-sand/20 flex items-center justify-center transition-colors"
            : "h-4 w-4 shrink-0 rounded border border-stone/30 hover:border-sand/50 transition-colors"
          }
        >
          {item.completed && (
            <svg className="h-2.5 w-2.5 text-sand/70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 6l3 3 5-5" />
            </svg>
          )}
        </button>
        {editing ? (
          <input
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleEditKeyDown}
            className="flex-1 bg-surface/50 border border-sand/30 rounded px-1.5 py-0.5 text-sm text-parchment focus:outline-none focus:border-sand/60"
          />
        ) : (
          <button
            onClick={(e) => {
              if (!item.completed) { e.stopPropagation(); setEditing(true) }
              else if (hasExpandable) setExpanded(!expanded)
            }}
            onDoubleClick={() => !item.completed && setEditing(true)}
            className={`flex-1 text-left leading-snug text-sm ${item.completed ? 'text-stone/40 line-through' : 'text-parchment/90'}`}
          >
            {item.text}
          </button>
        )}
        {hasExpandable && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-sand/40 hover:text-sand/70 transition-colors p-0.5"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />
            }
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="opacity-0 group-hover:opacity-100 text-stone/40 hover:text-red-400/70 transition-all p-0.5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && hasExpandable && (
        <div className="ml-8 mr-2 mb-2 mt-1 rounded-lg border border-amber-400/20 bg-amber-400/[0.03] overflow-hidden animate-fade-up" style={{ animationDuration: '0.2s' }}>
          <div className="px-3 py-2 space-y-2">
            {notes.map((note: TodoNote, i: number) => (
              <div key={i} className="flex items-start gap-1.5">
                <StickyNote className="h-3 w-3 text-amber-400/50 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-parchment/80 leading-relaxed">{note.content}</p>
                  <p className="text-[10px] text-stone/40 mt-0.5">
                    {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {note.author && <span className="ml-1.5">{note.author}</span>}
                  </p>
                </div>
              </div>
            ))}
            {!item.completed && (
              <div className="pt-2 border-t border-amber-400/10 flex justify-end">
                <button
                  onClick={onPromote}
                  className="text-stone/50 hover:text-sand/80 transition-colors px-2 py-1 rounded text-[10px] flex items-center gap-1 hover:bg-sand/10"
                  title="Promote to project"
                >
                  <ArrowUpRight className="h-3 w-3" />
                  <span>Promote to Project</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function BacklogSection({ slug }: { slug: string }) {
  const { items, isLoading, add, toggle, remove, updateText, promote } = useBacklog(slug)
  const [input, setInput] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    add(input.trim())
    setInput('')
  }

  if (isLoading) return null

  const incomplete = items.filter(i => !i.completed)
  const completed = items.filter(i => i.completed)

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-3.5 w-3.5 text-stone/50" />
        <h2 className="text-xs text-stone uppercase tracking-wider">Todo</h2>
      </div>

      <div className="space-y-2">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a todo..."
            className="flex-1 bg-surface/30 border border-stone/15 rounded-lg px-3 py-1.5 text-sm text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sand/15 text-sand hover:bg-sand/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </form>

        {incomplete.length === 0 && completed.length === 0 && (
          <div className="rounded-lg border border-border-custom bg-surface/50 py-4 flex items-center gap-2.5 px-4">
            <Lightbulb className="h-4 w-4 text-stone/30 shrink-0" />
            <p className="text-xs text-stone/50">No todo items</p>
          </div>
        )}

        <div className="space-y-0.5">
          {incomplete.map(item => (
            <BacklogItemRow
              key={item.id}
              item={item}
              onToggle={() => toggle(item)}
              onRemove={() => remove(item.id)}
              onPromote={() => promote(item.id)}
              onEdit={(newText) => updateText({ id: item.id, text: newText })}
            />
          ))}
        </div>

        {completed.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-1 text-[10px] text-stone/50 hover:text-stone/70 transition-colors"
            >
              {showCompleted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {completed.length} completed
            </button>
            {showCompleted && (
              <div className="space-y-0.5 pt-1 border-t border-stone/10 mt-1">
                {completed.map(item => (
                  <BacklogItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggle(item)}
                    onRemove={() => remove(item.id)}
                    onPromote={() => {}}
                    onEdit={(newText) => updateText({ id: item.id, text: newText })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
