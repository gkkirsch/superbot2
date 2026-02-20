import { Circle, Loader2, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const statusConfig: Record<string, { variant: 'stone' | 'sand' | 'moss'; label: string; icon: React.ReactNode }> = {
  pending: {
    variant: 'stone',
    label: 'Pending',
    icon: <Circle className="h-3 w-3" />,
  },
  in_progress: {
    variant: 'sand',
    label: 'In Progress',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    variant: 'moss',
    label: 'Completed',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  active: {
    variant: 'moss',
    label: 'Active',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  archived: {
    variant: 'stone',
    label: 'Archived',
    icon: <Circle className="h-3 w-3" />,
  },
}

const fallbackStatus = { variant: 'stone' as const, label: 'Unknown', icon: <Circle className="h-3 w-3" /> }

const priorityConfig: Record<string, { variant: 'ember' | 'sand' | 'stone' | 'outline'; label: string }> = {
  critical: { variant: 'ember', label: 'Critical' },
  high: { variant: 'sand', label: 'High' },
  medium: { variant: 'stone', label: 'Medium' },
  low: { variant: 'outline', label: 'Low' },
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? fallbackStatus
  return (
    <Badge variant={config.variant} className="gap-1">
      {config.icon}
      {config.label}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const config = priorityConfig[priority] ?? { variant: 'stone' as const, label: priority }
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  )
}
