import { Gauge, LayoutGrid, FileText, Blocks } from 'lucide-react'

export const topNavItems = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/spaces', label: 'Spaces', icon: LayoutGrid },
  { to: '/skills', label: 'Skills', icon: Blocks },
  { to: '/context', label: 'Context', icon: FileText },
]
