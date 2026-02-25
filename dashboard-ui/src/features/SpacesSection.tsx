import { Link } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useSpaces } from '@/hooks/useSpaces'

export function SpacesSection() {
  const { data: spaces, isLoading } = useSpaces()

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-lg bg-surface/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!spaces || spaces.length === 0) {
    return (
      <div className="rounded-lg border border-border-custom bg-surface/50 py-4 flex items-center gap-2.5 px-4">
        <FolderKanban className="h-4 w-4 text-stone/30 shrink-0" />
        <p className="text-xs text-stone/50">No spaces found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {spaces.map((space) => (
        <Link
          key={space.slug}
          to={`/spaces/${space.slug}`}
          className="rounded-lg border border-border-custom bg-surface/40 px-4 py-2 text-sm font-medium text-parchment transition-colors hover:border-sand/30 hover:bg-surface/60"
        >
          {space.name}
        </Link>
      ))}
    </div>
  )
}
