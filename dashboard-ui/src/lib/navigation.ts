import { Gauge, LayoutGrid, Blocks, BookOpen, Brain } from 'lucide-react'

export const topNavItems = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/spaces', label: 'Spaces', icon: LayoutGrid },
  { to: '/skills', label: 'Plugins', icon: Blocks },
  { to: '/knowledge', label: 'Knowledge', icon: Brain },
  { to: '/learn', label: 'Learn', icon: BookOpen },
]
