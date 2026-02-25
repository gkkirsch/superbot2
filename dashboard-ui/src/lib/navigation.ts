import { Gauge, LayoutGrid, Blocks, Library, BookOpen, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const topNavItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/spaces', label: 'Spaces', icon: LayoutGrid },
  { to: '/skills', label: 'Plugins', icon: Blocks },
  { to: '/knowledge', label: 'Knowledge', icon: Library },
]

export const docsNavItem: NavItem = { to: '/learn', label: 'Docs', icon: BookOpen }
