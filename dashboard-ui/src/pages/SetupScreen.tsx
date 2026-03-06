import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'

interface SetupCheck {
  id: string
  label: string
  found: boolean
  hint: string
}

interface SuperbotAPI {
  getSetupStatus: () => Promise<{ complete: boolean; checks: SetupCheck[] }>
  completeSetup: () => Promise<{ ok: boolean }>
  rerunSetupChecks: () => Promise<{ checks: SetupCheck[] }>
}

function getSuperbot(): SuperbotAPI | null {
  return (window as unknown as { superbot?: SuperbotAPI }).superbot ?? null
}

export function SetupScreen({ onComplete }: { onComplete: () => void }) {
  const [checks, setChecks] = useState<SetupCheck[] | null>(null)
  const [checking, setChecking] = useState(true)

  const runChecks = useCallback(async () => {
    const api = getSuperbot()
    if (!api) {
      // Not in Electron — skip setup
      onComplete()
      return
    }
    setChecking(true)
    try {
      const { complete, checks: results } = await api.getSetupStatus()
      if (complete) {
        onComplete()
        return
      }
      setChecks(results)
      // If all pass, auto-proceed after a short delay
      if (results.every(c => c.found)) {
        await api.completeSetup()
        setTimeout(onComplete, 1500)
      }
    } catch (err) {
      console.warn('Setup check failed:', err)
      onComplete() // Don't block on errors
    } finally {
      setChecking(false)
    }
  }, [onComplete])

  useEffect(() => { runChecks() }, [runChecks])

  const handleRecheck = async () => {
    const api = getSuperbot()
    if (!api) return
    setChecking(true)
    try {
      const { checks: results } = await api.rerunSetupChecks()
      setChecks(results)
      if (results.every(c => c.found)) {
        await api.completeSetup()
        setTimeout(onComplete, 1000)
      }
    } finally {
      setChecking(false)
    }
  }

  const handleLaunch = async () => {
    const api = getSuperbot()
    if (api) await api.completeSetup()
    onComplete()
  }

  const allPassed = checks?.every(c => c.found) ?? false

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <img src="/superbot-logo.png" alt="Superbot2" className="h-8 mx-auto mb-4" />
          <p className="text-sm text-stone/60">Checking your environment...</p>
        </div>

        {/* Checks list */}
        <div className="space-y-3 mb-8">
          {checks === null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 text-sand animate-spin" />
            </div>
          ) : (
            checks.map(check => (
              <div
                key={check.id}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
                  check.found
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : 'border-ember/20 bg-ember/5'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {check.found ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-ember" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-parchment">{check.label}</div>
                  {!check.found && (
                    <div className="text-xs text-stone/60 mt-1 font-mono">{check.hint}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        {checks !== null && (
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={handleRecheck}
              disabled={checking}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-stone hover:text-parchment border border-stone/20 hover:border-stone/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
              Re-check
            </button>
            <button
              onClick={handleLaunch}
              className={`inline-flex items-center gap-1.5 px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                allPassed
                  ? 'bg-sand text-ink hover:bg-sand/90'
                  : 'bg-stone/20 text-parchment/70 hover:bg-stone/30'
              }`}
            >
              {allPassed ? 'Launch Superbot2' : 'Continue anyway'}
            </button>
          </div>
        )}

        {allPassed && !checking && (
          <p className="text-center text-xs text-stone/40 mt-4">All checks passed — launching automatically...</p>
        )}
      </div>
    </div>
  )
}
