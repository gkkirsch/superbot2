import { useState, useEffect, useCallback } from 'react'

interface UpdateInfo {
  available: boolean
  currentCommit?: string
  latestCommit?: string
  behindBy?: number
  latestMessage?: string
  error?: string
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkForUpdates = useCallback(async () => {
    try {
      const res = await fetch('/api/updates/check')
      if (res.ok) {
        const data = await res.json()
        setUpdate(data)
        if (data.available) setDismissed(false)
      }
    } catch {
      // Silently fail — don't bother the user
    }
  }, [])

  useEffect(() => {
    checkForUpdates()
    const interval = setInterval(checkForUpdates, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [checkForUpdates])

  const runUpdate = async () => {
    setUpdating(true)
    setError(null)
    try {
      const res = await fetch('/api/updates/run', { method: 'POST' })
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => window.location.reload(), 3000)
      } else {
        const data = await res.json()
        setError(data.error || 'Update failed')
        setUpdating(false)
      }
    } catch {
      // Network error most likely means the server restarted after a successful update
      setSuccess(true)
      setTimeout(() => window.location.reload(), 5000)
    }
  }

  if (!update?.available || dismissed) return null

  if (success) {
    return (
      <div className="bg-green-600 text-white px-4 py-2 text-center text-sm">
        Updated! Refreshing...
      </div>
    )
  }

  return (
    <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm">
      <span>
        Update available{update.behindBy && update.behindBy > 1 ? ` (${update.behindBy} commits behind)` : ''}: {update.latestMessage}
      </span>
      <button
        onClick={runUpdate}
        disabled={updating}
        className="bg-white text-indigo-700 px-3 py-0.5 rounded text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
      >
        {updating ? (
          <span className="flex items-center gap-1">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Updating...
          </span>
        ) : 'Update'}
      </button>
      {error && <span className="text-red-200 text-xs">{error}</span>}
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 text-indigo-200 hover:text-white"
        aria-label="Dismiss"
      >
        &#x2715;
      </button>
    </div>
  )
}
