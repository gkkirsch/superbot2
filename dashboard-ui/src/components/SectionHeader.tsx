import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export function SectionHeader({ title, icon: Icon, linkTo, linkLabel, action }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  linkTo?: string
  linkLabel?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-sand" />
        <h2 className="font-heading text-xl text-parchment">{title}</h2>
      </div>
      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {action}
        {linkTo && (
          <Link to={linkTo} className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1">
            {linkLabel ?? 'View all'} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  )
}
