import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown } from 'lucide-react'

export function SectionHeader({ title, icon: Icon, linkTo, linkLabel, action, collapsed, onToggle }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  linkTo?: string
  linkLabel?: string
  action?: React.ReactNode
  collapsed?: boolean
  onToggle?: () => void
}) {
  const isCollapsible = onToggle !== undefined

  return (
    <div
      className={`flex items-center justify-between transition-[margin] duration-300 ${isCollapsible ? (collapsed ? 'mb-1' : 'mb-4') : 'mb-4'} ${isCollapsible ? 'cursor-pointer select-none' : ''}`}
      onClick={isCollapsible ? onToggle : undefined}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-sand" />
        <h2 className="font-heading text-xl text-parchment">{title}</h2>
        {isCollapsible && (
          <ChevronDown className={`h-4 w-4 text-stone/50 transition-transform duration-300 ${!collapsed ? 'rotate-180' : ''}`} />
        )}
      </div>
      <div
        className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        onClick={isCollapsible ? (e: React.MouseEvent) => e.stopPropagation() : undefined}
      >
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
