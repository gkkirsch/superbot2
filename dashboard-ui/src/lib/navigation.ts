import { Gauge, LayoutGrid, FileText, Blocks, Wand2 } from 'lucide-react'

export const topNavItems = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/spaces', label: 'Spaces', icon: LayoutGrid },
  { to: '/skills', label: 'Skills', icon: Blocks },
  { to: '/skill-creator', label: 'Create', icon: Wand2 },
  { to: '/context', label: 'Context', icon: FileText },
]
