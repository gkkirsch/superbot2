import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ProjectView } from '@/features/ProjectView'
import { useSpace } from '@/hooks/useSpaces'

function ProjectSkeleton() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="h-4 w-32 rounded bg-stone/10 animate-pulse mb-6" />
        <div className="h-8 w-1/3 rounded bg-stone/10 animate-pulse mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="h-4 w-20 rounded bg-stone/10 animate-pulse" />
            <div className="h-64 rounded-lg bg-stone/5 animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-4 w-20 rounded bg-stone/10 animate-pulse" />
            <div className="h-12 rounded bg-stone/5 animate-pulse" />
            <div className="h-12 rounded bg-stone/5 animate-pulse" />
            <div className="h-12 rounded bg-stone/5 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProjectDetail() {
  const { slug, project } = useParams<{ slug: string; project: string }>()
  const { data, isLoading } = useSpace(slug ?? '')

  if (isLoading) return <ProjectSkeleton />

  const spaceName = data?.space.name ?? slug

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <Link
          to={`/spaces/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-sand transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {spaceName}
        </Link>

        <h1 className="font-heading text-2xl text-parchment mb-8">{project}</h1>

        <ProjectView slug={slug ?? ''} project={project ?? ''} />
      </div>
    </div>
  )
}
