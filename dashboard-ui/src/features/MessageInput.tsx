import { useState } from 'react'
import { Send } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { sendMessageToOrchestrator } from '@/lib/api'

export function MessageInput() {
  const [text, setText] = useState('')
  const [_sent, setSent] = useState(false)

  const mutation = useMutation({
    mutationFn: (message: string) => sendMessageToOrchestrator(message),
    onSuccess: () => {
      setText('')
      setSent(true)
      setTimeout(() => setSent(false), 2000)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim() && !mutation.isPending) {
      mutation.mutate(text.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message the orchestrator..."
        className="flex-1 bg-ink border border-border-custom rounded-lg px-3 py-2 text-sm text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/50 transition-colors"
      />
      <button
        type="submit"
        disabled={!text.trim() || mutation.isPending}
        className="shrink-0 p-2 rounded-lg text-stone hover:text-sand hover:bg-sand/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Send message"
      >
        <Send className="h-4 w-4" />
      </button>
      {mutation.isError && (
        <span className="text-xs text-ember shrink-0">Failed</span>
      )}
    </form>
  )
}
