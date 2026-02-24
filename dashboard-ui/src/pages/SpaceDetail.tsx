import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FolderOpen, ArrowRight, MessageCircleQuestion, Play, Square, Loader2, Rocket, ExternalLink, Check, Clock } from 'lucide-react'
import { StatusBadge } from '@/features/TaskBadge'
import { StatsBar } from '@/features/StatsBar'
import { EscalationCard } from '@/features/EscalationCard'
import { useSpace, useSpaceEscalations, useServerStatus, useSessions } from '@/hooks/useSpaces'
import { startServer, stopServer, deployServer } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="h-4 w-24 rounded bg-stone/10 animate-pulse mb-6" />
        <div className="h-8 w-2/3 rounded bg-stone/10 animate-pulse mb-3" />
        <div className="h-4 w-1/2 rounded bg-stone/10 animate-pulse mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg bg-stone/5 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function SpaceActions({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data: status } = useServerStatus(slug, true)
  const [devLoading, setDevLoading] = useState(false)
  const [deployLoading, setDeployLoading] = useState(false)

  const running = status?.running ?? false
  const hasDevServer = status?.hasDevServer ?? false
  const hasDeploy = status?.hasDeploy ?? false
  const prodUrl = status?.prodUrl
  const devUrl = status?.devUrl

  async function handleDevToggle() {
    setDevLoading(true)
    try {
      if (running) {
        await stopServer(slug)
      } else {
        await startServer(slug)
      }
      queryClient.invalidateQueries({ queryKey: ['server-status', slug] })
    } catch (err) {
      console.error('Server toggle failed:', err)
    } finally {
      setDevLoading(false)
    }
  }

  async function handleDeploy() {
    setDeployLoading(true)
    try {
      await deployServer(slug)
    } catch (err) {
      console.error('Deploy failed:', err)
    } finally {
      setDeployLoading(false)
    }
  }

  if (!hasDevServer && !hasDeploy && !prodUrl) return null

  return (
    <div className="flex items-center gap-2">
      {hasDevServer && (
        <button
          onClick={handleDevToggle}
          disabled={devLoading}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            running
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
          } disabled:opacity-50`}
        >
          {devLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : running ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {devLoading ? (running ? 'Stopping...' : 'Starting...') : running ? 'Stop Server' : 'Start Dev Server'}
        </button>
      )}
      {running && devUrl && (
        <a
          href={devUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {devUrl.replace(/^https?:\/\//, '')}
        </a>
      )}
      {hasDeploy && (
        <button
          onClick={handleDeploy}
          disabled={deployLoading}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 disabled:opacity-50"
        >
          {deployLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Rocket className="h-3.5 w-3.5" />
          )}
          {deployLoading ? 'Deploying...' : 'Ship to Prod'}
        </button>
      )}
      {prodUrl && (
        <a
          href={prodUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/30"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Production
        </a>
      )}
    </div>
  )
}

export function SpaceDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error } = useSpace(slug ?? '')
  const { data: escalations } = useSpaceEscalations(slug ?? '')
  const { data: sessions } = useSessions(5, slug)

  if (isLoading) return <DetailSkeleton />

  if (error || !data) {
    return (
      <div className="min-h-screen bg-ink">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <Link
            to="/spaces"
            className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-sand transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Spaces
          </Link>
          <div className="py-20 text-center">
            <h2 className="font-heading text-xl text-parchment mb-2">Space not found</h2>
            <p className="text-sm text-stone">
              {error ? error.message : `No space found with slug "${slug}".`}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const space = data.space
  const projects = data.projects ?? []
  const pendingEscalations = (escalations ?? []).filter(e => e.status === 'needs_human')

  // Strip leading heading that duplicates the space name
  let overviewText = data.overview.exists ? data.overview.content.trim() : ''
  const headingMatch = overviewText.match(/^#\s+(.+)\n?/)
  if (headingMatch) {
    overviewText = overviewText.slice(headingMatch[0].length).trim()
  }

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          to="/spaces"
          className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-sand transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Spaces
        </Link>

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-start justify-between mb-2">
            <h1 className="font-heading text-3xl text-parchment">{space.name}</h1>
            <SpaceActions slug={slug ?? ''} />
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <StatusBadge status={space.status} />
            <StatsBar
              pending={space.taskCounts.pending}
              inProgress={space.taskCounts.in_progress}
              completed={space.taskCounts.completed}
            />
          </div>
          {overviewText && (
            <p className="text-sm text-stone leading-relaxed">{overviewText}</p>
          )}
        </header>

        {/* Projects */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="h-4 w-4 text-sand" />
            <h2 className="font-heading text-lg text-parchment">Projects</h2>
          </div>
          {projects.length === 0 ? (
            <div className="rounded-lg border border-border-custom bg-surface/20 py-8 text-center">
              <p className="text-sm text-stone/50">No projects yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border-custom">
              {[...projects]
                .sort((a, b) => {
                  const ca = space.projectTaskCounts?.[a]
                  const cb = space.projectTaskCounts?.[b]
                  const doneA = ca ? (ca.completed >= ca.total ? 1 : 0) : 0
                  const doneB = cb ? (cb.completed >= cb.total ? 1 : 0) : 0
                  if (doneA !== doneB) return doneA - doneB
                  const activeA = ca ? ca.pending + ca.in_progress : 0
                  const activeB = cb ? cb.pending + cb.in_progress : 0
                  return activeB - activeA
                })
                .map((project) => {
                  const counts = space.projectTaskCounts?.[project]
                  const allDone = counts && counts.total > 0 && counts.completed >= counts.total
                  return (
                    <div
                      key={project}
                      className="flex items-center justify-between px-0 py-2 text-sm hover:text-sand cursor-pointer transition-colors"
                      onClick={() => navigate(`/spaces/${slug}/${project}`)}
                    >
                      <span className="text-parchment">
                        <ArrowRight className="inline h-3 w-3 mr-2 text-stone/40" />
                        {project}
                      </span>
                      <span className="text-stone/60 text-xs tabular-nums">
                        {counts ? (
                          allDone ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              {counts.completed}/{counts.total} <Check className="h-3 w-3" />
                            </span>
                          ) : (
                            <>{counts.completed}/{counts.total}</>
                          )
                        ) : (
                          'pending'
                        )}
                      </span>
                    </div>
                  )
                })}
            </div>
          )}
        </section>

        {/* Recent Sessions */}
        {sessions && sessions.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs text-stone uppercase tracking-wider mb-3">Recent Sessions</h2>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-start gap-3 text-sm py-1">
                  <span className="text-stone/50 text-xs whitespace-nowrap mt-0.5">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {relativeTime(s.completedAt)}
                  </span>
                  <span className="text-parchment/80 line-clamp-1 flex-1">
                    {s.summary.length > 120 ? s.summary.slice(0, 120) + '...' : s.summary}
                  </span>
                  {s.worker && (
                    <span className="text-stone/40 text-xs whitespace-nowrap">{s.worker}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Escalations */}
        {pendingEscalations.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircleQuestion className="h-4 w-4 text-sand" />
              <h2 className="font-heading text-lg text-parchment">
                Escalations
                <span className="ml-2 text-sm font-normal text-stone">
                  ({pendingEscalations.length})
                </span>
              </h2>
            </div>
            <div className="space-y-3">
              {(escalations ?? []).map((e) => (
                <EscalationCard key={e.id} escalation={e} showSpace={false} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
