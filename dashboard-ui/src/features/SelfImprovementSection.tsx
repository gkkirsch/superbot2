import { useState } from 'react'
import { Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { runSelfImprovement, fetchSelfImprovementStatus, fetchAnalysisHistory } from '@/lib/api'

export function SelfImprovementSection() {
  const [justCompleted, setJustCompleted] = useState(false)
  const queryClient = useQueryClient()

  const { data: status } = useQuery({
    queryKey: ['self-improvement-status'],
    queryFn: fetchSelfImprovementStatus,
    refetchInterval: (query) => query.state.data?.running ? 3000 : 30000,
  })

  const { data: history } = useQuery({
    queryKey: ['self-improvement-history'],
    queryFn: fetchAnalysisHistory,
    refetchInterval: status?.running ? 5000 : 60000,
  })

  const mutation = useMutation({
    mutationFn: () => runSelfImprovement(30),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['self-improvement-status'] })
      // Poll more frequently while running
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['self-improvement-status'] })
      }, 2000)
    },
  })

  // Detect when analysis finishes
  const prevRunning = status?.running
  if (prevRunning === false && mutation.isSuccess && !justCompleted) {
    setJustCompleted(true)
    queryClient.invalidateQueries({ queryKey: ['self-improvement-history'] })
    queryClient.invalidateQueries({ queryKey: ['escalations'] })
    setTimeout(() => setJustCompleted(false), 10000)
  }

  const isRunning = status?.running || false
  const latestRun = history?.[0]

  return (
    <div className="space-y-3">
      {/* Run button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setJustCompleted(false)
            mutation.mutate()
          }}
          disabled={isRunning}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            isRunning
              ? 'bg-stone/20 text-stone/50 cursor-not-allowed'
              : 'bg-sand/10 text-sand hover:bg-sand/20'
          }`}
        >
          {isRunning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run Analysis
            </>
          )}
        </button>

        {justCompleted && (
          <span className="inline-flex items-center gap-1 text-xs text-moss">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Done — check escalations
          </span>
        )}

        {mutation.isError && (
          <span className="inline-flex items-center gap-1 text-xs text-ember">
            <AlertCircle className="h-3.5 w-3.5" />
            Failed to start
          </span>
        )}
      </div>

      {/* Latest run info */}
      {latestRun && (
        <div className="bg-stone/5 border border-stone/10 rounded-md p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone/70">
              Last run: {new Date(latestRun.timestamp).toLocaleDateString()} ({latestRun.daysAnalyzed}d window)
            </span>
            <span className="text-xs text-parchment/80">
              {latestRun.stats.total} suggestions
            </span>
          </div>
          {latestRun.stats.byPriority && (
            <div className="flex gap-3 mt-1.5">
              {latestRun.stats.byPriority.critical && (
                <span className="text-xs text-ember">{latestRun.stats.byPriority.critical} critical</span>
              )}
              {latestRun.stats.byPriority.high && (
                <span className="text-xs text-sand">{latestRun.stats.byPriority.high} high</span>
              )}
              {latestRun.stats.byPriority.medium && (
                <span className="text-xs text-stone/70">{latestRun.stats.byPriority.medium} medium</span>
              )}
              {latestRun.stats.byPriority.low && (
                <span className="text-xs text-stone/50">{latestRun.stats.byPriority.low} low</span>
              )}
            </div>
          )}
          <div className="mt-1.5">
            <Link
              to="/escalations?type=improvement"
              className="text-xs text-sand/70 hover:text-sand transition-colors"
            >
              View improvement suggestions →
            </Link>
          </div>
        </div>
      )}

      {/* History count */}
      {history && history.length > 1 && (
        <p className="text-xs text-stone/40">
          {history.length} analysis runs on record
        </p>
      )}
    </div>
  )
}
