import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FolderOpen, ArrowRight, MessageCircleQuestion, Play, Square, Loader2, Rocket, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { StatusBadge } from '@/features/TaskBadge'
import { StatsBar } from '@/features/StatsBar'
import { EscalationCard } from '@/features/EscalationCard'
import { useSpace, useSpaceEscalations, useServerStatus } from '@/hooks/useSpaces'
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

function ProjectCard({ slug, project, counts, createdAt }: {
  slug: string
  project: string
  counts?: { pending: number; in_progress: number; completed: number; total: number }
  createdAt?: string
}) {
  const navigate = useNavigate()

  return (
    <Card
      className="cursor-pointer border-border-custom transition-all duration-200 hover:border-sand/40 hover:-translate-y-0.5"
      onClick={() => navigate(`/spaces/${slug}/${project}`)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-base text-parchment flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-sand/60" />
          {project}
        </CardTitle>
        {createdAt && (
          <span className="text-xs text-stone/60">
            Created {new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
      </CardHeader>
      <CardFooter className="flex items-center justify-between pt-0">
        {counts ? (
          <StatsBar
            pending={counts.pending}
            inProgress={counts.in_progress}
            completed={counts.completed}
          />
        ) : (
          <span className="text-xs text-stone/50">No tasks</span>
        )}
        <ArrowRight className="h-3.5 w-3.5 text-stone/40" />
      </CardFooter>
    </Card>
  )
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
  const { data, isLoading, error } = useSpace(slug ?? '')
  const { data: escalations } = useSpaceEscalations(slug ?? '')

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
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-sand transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project}
                  slug={slug ?? ''}
                  project={project}
                  counts={space.projectTaskCounts?.[project]}
                  createdAt={space.projectCreatedAt?.[project]}
                />
              ))}
            </div>
          )}
        </section>

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
