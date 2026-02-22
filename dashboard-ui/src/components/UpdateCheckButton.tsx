import { useState, useCallback } from 'react'
import { ArrowDownCircle, Check, Loader2 } from 'lucide-react'

type Status = 'idle' | 'checking' | 'available' | 'up-to-date'

interface UpdateInfo {
  available: boolean
  behindBy?: number
  latestMessage?: string
}

export function UpdateCheckButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [updating, setUpdating] = useState(false)

  const checkForUpdates = useCallback(async () => {
    if (status === 'checking') return
    setStatus('checking')
    try {
      const res = await fetch('/api/updates/check')
      if (res.ok) {
        const data = await res.json()
        setUpdate(data)
        if (data.available) {
          setStatus('available')
        } else {
          setStatus('up-to-date')
          setTimeout(() => setStatus('idle'), 3000)
        }
      } else {
        setStatus('idle')
      }
    } catch {
      setStatus('idle')
    }
  }, [status])

  const runUpdate = async () => {
    setUpdating(true)
    try {
      const res = await fetch('/api/updates/run', { method: 'POST' })
      if (res.ok) {
        setTimeout(() => window.location.reload(), 3000)
      } else {
        setUpdating(false)
        setStatus('idle')
      }
    } catch {
      setUpdating(false)
      setStatus('idle')
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
      {/* Tooltip / popup for available update */}
      {status === 'available' && update?.available && !updating && (
        <button
          onClick={runUpdate}
          className="bg-zinc-800 text-zinc-200 text-xs px-3 py-1.5 rounded-lg shadow-lg border border-zinc-700 hover:bg-zinc-700 transition-colors animate-in fade-in slide-in-from-right-2"
        >
          Update available — click to update
        </button>
      )}

      {updating && (
        <span className="bg-zinc-800 text-zinc-400 text-xs px-3 py-1.5 rounded-lg shadow-lg border border-zinc-700">
          Updating...
        </span>
      )}

      {status === 'up-to-date' && (
        <span className="text-zinc-500 text-xs animate-in fade-in">
          Up to date
        </span>
      )}

      {/* Main icon button */}
      <button
        onClick={checkForUpdates}
        disabled={status === 'checking' || updating}
        className="relative p-1.5 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        title="Check for updates"
      >
        {status === 'checking' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : status === 'up-to-date' ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <ArrowDownCircle className="w-4 h-4" />
        )}

        {/* Dot indicator when update is available */}
        {status === 'available' && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-500 rounded-full" />
        )}
      </button>
    </div>
  )
}
