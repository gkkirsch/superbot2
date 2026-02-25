import { Gauge, LayoutGrid, Blocks, Library, BookOpen } from 'lucide-react'

export const topNavItems = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/spaces', label: 'Spaces', icon: LayoutGrid },
  { to: '/skills', label: 'Plugins', icon: Blocks },
  { to: '/knowledge', label: 'Knowledge', icon: Library },
]

export const docsNavItem = { to: '/learn', label: 'Docs', icon: BookOpen }
