import { useState } from 'react'
import { X } from 'lucide-react'
import { useTodos } from '@/hooks/useSpaces'

export function TodoSection() {
  const { todos, isLoading, add, toggle, remove } = useTodos()
  const [input, setInput] = useState('')

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    add(input.trim())
    setInput('')
  }

  if (isLoading) return null

  const incomplete = todos.filter(t => !t.completed)
  const completed = todos.filter(t => t.completed)

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
          <div key={todo.id} className="flex items-center gap-2 group rounded-lg px-2 py-1.5 hover:bg-surface/20 transition-colors">
            <button
              onClick={() => toggle(todo)}
              className="h-4 w-4 shrink-0 rounded border border-stone/30 hover:border-sand/50 transition-colors"
            />
            <span className="flex-1 text-sm text-parchment/90 leading-snug">{todo.text}</span>
            <button
              onClick={() => remove(todo.id)}
              className="opacity-0 group-hover:opacity-100 text-stone/40 hover:text-red-400/70 transition-all p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {completed.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t border-stone/10">
          {completed.map(todo => (
            <div key={todo.id} className="flex items-center gap-2 group rounded-lg px-2 py-1.5 hover:bg-surface/20 transition-colors">
              <button
                onClick={() => toggle(todo)}
                className="h-4 w-4 shrink-0 rounded border border-sand/30 bg-sand/20 flex items-center justify-center transition-colors"
              >
                <svg className="h-2.5 w-2.5 text-sand/70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              </button>
              <span className="flex-1 text-sm text-stone/40 line-through leading-snug">{todo.text}</span>
              <button
                onClick={() => remove(todo.id)}
                className="opacity-0 group-hover:opacity-100 text-stone/40 hover:text-red-400/70 transition-all p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
