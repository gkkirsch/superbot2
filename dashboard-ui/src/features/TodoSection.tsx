import { useState } from 'react'
import { X, ChevronDown, ChevronUp, StickyNote, ClipboardList, Play } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTodos, useTodoResearch } from '@/hooks/useSpaces'
import { sendMessageToOrchestrator } from '@/lib/api'
import { MarkdownContent } from '@/features/MarkdownContent'
import type { Escalation, TodoNote } from '@/lib/types'

function findResearch(todoText: string, escalations: Escalation[]): Escalation | null {
  const lower = todoText.toLowerCase()
  const words = lower.split(/\s+/).filter(w => w.length > 3)

  let best: Escalation | null = null
  let bestScore = 0

  for (const esc of escalations) {
    const target = `${esc.question} ${esc.context}`.toLowerCase()
    let score = 0
    for (const word of words) {
      if (target.includes(word)) score++
    }
    // Require at least 2 matching words or 50% match
    const threshold = Math.max(2, Math.ceil(words.length * 0.4))
    if (score >= threshold && score > bestScore) {
      best = esc
      bestScore = score
    }
  }

  return best
}

interface TodoItemRowProps {
  todo: { id: string; text: string; completed: boolean; notes?: TodoNote[] }
  research: Escalation | null
  onToggle: () => void
  onRemove: () => void
  onWorkOn: () => void
  workPending?: boolean
  workSent?: boolean
}

function TodoItemRow({ todo, research, onToggle, onRemove, onWorkOn, workPending, workSent }: TodoItemRowProps) {
  const [expanded, setExpanded] = useState(false)
  const notes = todo.notes || []
  const hasExpandable = notes.length > 0 || !!research

  return (
    <div>
      <div className={`flex items-center gap-2 group rounded-lg px-2 py-1.5 transition-colors ${hasExpandable ? 'cursor-pointer hover:bg-surface/30' : 'hover:bg-surface/20'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className={todo.completed
            ? "h-4 w-4 shrink-0 rounded border border-sand/30 bg-sand/20 flex items-center justify-center transition-colors"
            : "h-4 w-4 shrink-0 rounded border border-stone/30 hover:border-sand/50 transition-colors"
          }
        >
          {todo.completed && (
            <svg className="h-2.5 w-2.5 text-sand/70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 6l3 3 5-5" />
            </svg>
          )}
        </button>
        <button
          onClick={() => hasExpandable && setExpanded(!expanded)}
          className={`flex-1 text-left leading-snug text-sm ${todo.completed ? 'text-stone/40 line-through' : 'text-parchment/90'}`}
        >
          {todo.text}
        </button>
        {hasExpandable && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-blue-400/50 hover:text-blue-400 transition-colors p-0.5"
            title={expanded ? 'Collapse' : 'Expand notes'}
          >
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />
            }
          </button>
        )}
        {!todo.completed && (
          <button
            onClick={(e) => { e.stopPropagation(); onWorkOn() }}
            disabled={workPending || workSent}
            className="opacity-0 group-hover:opacity-100 text-stone/40 hover:text-sand/70 disabled:opacity-50 transition-all px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1"
            title="Send to orchestrator"
          >
            <Play className="h-3 w-3" />
            <span>{workSent ? 'Sent' : 'Work on this'}</span>
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
        <div className="ml-8 mr-2 mb-2 mt-1 rounded-lg border border-blue-400/20 bg-blue-400/[0.03] overflow-hidden animate-fade-up" style={{ animationDuration: '0.2s' }}>
          <div className="px-3 py-2 space-y-2">
            {notes.map((note, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <StickyNote className="h-3 w-3 text-blue-400/50 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-parchment/80 leading-relaxed">{note.content}</p>
                  <p className="text-[10px] text-stone/40 mt-0.5">
                    {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {note.author && <span className="ml-1.5">{note.author}</span>}
                  </p>
                </div>
              </div>
            ))}
            {research && (
              <div className={notes.length > 0 ? 'pt-2 border-t border-blue-400/10' : ''}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ClipboardList className="h-3 w-3 text-sky-400/70" />
                  <span className="text-[10px] font-medium text-sky-400/70 uppercase tracking-wider">Research</span>
                  {research.space && (
                    <span className="text-[10px] font-mono text-stone/50 bg-stone/10 rounded-full px-1.5 py-0.5 ml-1">
                      {research.spaceName || research.space}
                    </span>
                  )}
                </div>
                <p className="text-xs text-parchment/80 font-medium mb-1.5">{research.question}</p>
                {research.context && (
                  <div className="max-h-64 overflow-y-auto">
                    <MarkdownContent content={research.context} className="text-stone/70" />
                  </div>
                )}
                {research.status === 'resolved' && research.resolution && (
                  <div className="mt-2 pt-2 border-t border-sky-400/10">
                    <span className="text-[10px] text-moss/70 font-medium">Resolution: </span>
                    <span className="text-xs text-stone/60">{research.resolution}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function TodoSection() {
  const { todos, isLoading, add, toggle, remove } = useTodos()
  const { data: agentPlans } = useTodoResearch()
  const [input, setInput] = useState('')
  const [sentTodoId, setSentTodoId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const workOnMutation = useMutation({
    mutationFn: (message: string) => sendMessageToOrchestrator(message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
  })

  const handleWorkOn = (todo: { id: string; text: string; notes?: TodoNote[] }) => {
    const notes = todo.notes || []
    let message = `Work on this: ${todo.text}`
    if (notes.length > 0) {
      message += `\n\nNote: ${notes.map(n => n.content).join('\n')}`
    }
    setSentTodoId(todo.id)
    workOnMutation.mutate(message)
    setTimeout(() => setSentTodoId(null), 2000)
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    add(input.trim())
    setInput('')
  }

  if (isLoading) return null

  const incomplete = todos.filter(t => !t.completed)
  const completed = todos.filter(t => t.completed)
  const plans = agentPlans || []

  return (
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
        <p className="text-xs text-stone/40 text-center py-2">No todos yet</p>
      )}

      <div className="space-y-0.5">
        {incomplete.map(todo => (
          <TodoItemRow
            key={todo.id}
            todo={todo}
            research={findResearch(todo.text, plans)}
            onToggle={() => toggle(todo)}
            onRemove={() => remove(todo.id)}
            onWorkOn={() => handleWorkOn(todo)}
            workPending={workOnMutation.isPending && sentTodoId === todo.id}
            workSent={!workOnMutation.isPending && sentTodoId === todo.id}
          />
        ))}
      </div>

      {completed.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t border-stone/10">
          {completed.map(todo => (
            <TodoItemRow
              key={todo.id}
              todo={todo}
              research={findResearch(todo.text, plans)}
              onToggle={() => toggle(todo)}
              onRemove={() => remove(todo.id)}
              onWorkOn={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}
