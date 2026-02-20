import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Circle, Loader2, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, ArrowUpDown, Hash,
  Clock, Filter, FolderOpen, User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PriorityBadge } from '@/features/TaskBadge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { useAllTasks } from '@/hooks/useSpaces'
import type { Task } from '@/lib/types'
import type { CrossSpaceTask } from '@/lib/api'

// --- Helpers ---

function timeAgo(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function taskAgeBorder(task: Task): string {
  if (task.status === 'completed') return ''
  const ageMs = Date.now() - new Date(task.createdAt).getTime()
  const days = ageMs / (1000 * 60 * 60 * 24)
  if (days > 3) return 'border-l-2 border-l-ember/60'
  if (days > 1) return 'border-l-2 border-l-sand/60'
  return 'border-l-2 border-l-moss/40'
}

const statusIcon: Record<Task['status'], React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-stone" />,
  in_progress: <Loader2 className="h-4 w-4 text-sand animate-spin" />,
  completed: <CheckCircle2 className="h-4 w-4 text-moss" />,
}

type SortField = 'priority' | 'space' | 'age' | 'project'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | Task['status']
type PriorityFilter = 'all' | Task['priority']

const priorityRank: Record<Task['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

// --- Task row ---

function TaskRow({ task }: { task: CrossSpaceTask }) {
  const [open, setOpen] = useState(false)
  const isBlocked = (task.blockedBy ?? []).length > 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`border-b border-border-custom last:border-b-0 ${taskAgeBorder(task)}`}>
        <CollapsibleTrigger className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface/50 transition-colors">
          <span className="shrink-0">{statusIcon[task.status]}</span>

          <Link
            to={`/spaces/${task.space}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 shrink-0 text-xs text-sand/70 hover:text-sand transition-colors"
            title={task.spaceName}
          >
            <Hash className="h-3 w-3" />
            <span className="max-w-[80px] truncate">{task.space}</span>
          </Link>

          <span className="flex items-center gap-1 shrink-0 text-xs text-stone/50" title={`Project: ${task.project}`}>
            <FolderOpen className="h-3 w-3" />
            <span className="max-w-[80px] truncate">{task.project}</span>
          </span>

          <span className="flex-1 min-w-0">
            <span className="text-sm text-parchment truncate block">
              {task.subject}
            </span>
          </span>

          {task.assignedTo && (
            <span className="flex items-center gap-1 text-xs text-sand/60 shrink-0 hidden sm:flex" title={`Assigned to ${task.assignedTo}`}>
              <User className="h-3 w-3" />
              <span className="max-w-[80px] truncate">{task.assignedTo}</span>
            </span>
          )}

          {isBlocked && (
            <span className="flex items-center gap-1 text-xs text-ember/70 shrink-0">
              <AlertTriangle className="h-3 w-3" />
              <span className="hidden sm:inline">Blocked</span>
            </span>
          )}

          <PriorityBadge priority={task.priority} />

          <span className="text-[10px] text-stone/50 shrink-0 hidden sm:inline font-mono">
            {timeAgo(task.createdAt)}
          </span>

          {open
            ? <ChevronDown className="h-4 w-4 text-stone shrink-0" />
            : <ChevronRight className="h-4 w-4 text-stone shrink-0" />
          }
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pl-11 space-y-2">
            {task.description ? (
              <p className="text-sm text-stone whitespace-pre-wrap">{task.description}</p>
            ) : (
              <p className="text-sm text-stone/40 italic">No description</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/spaces/${task.space}`}
                className="text-xs text-sand hover:text-sand/80 transition-colors"
              >
                View in {task.spaceName} →
              </Link>

              {(task.labels ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(task.labels ?? []).map((label) => (
                    <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {isBlocked && (
              <p className="text-xs text-ember/70">
                Blocked by: {(task.blockedBy ?? []).join(', ')}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// --- Summary stats ---

function SummaryStats({ tasks }: { tasks: CrossSpaceTask[] }) {
  const pending = tasks.filter((t) => t.status === 'pending').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const completed = tasks.filter((t) => t.status === 'completed').length

  const staleTasks = tasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const oldestStale = staleTasks[0]
  const oldestAge = oldestStale
    ? Math.floor((Date.now() - new Date(oldestStale.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  const stats = [
    { label: 'Pending', value: pending, color: 'text-stone' },
    { label: 'In Progress', value: inProgress, color: 'text-sand' },
    { label: 'Completed', value: completed, color: 'text-moss' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-6 mb-6">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className={`font-heading text-2xl ${s.color}`}>{s.value}</span>
          <span className="text-xs text-stone">{s.label}</span>
        </div>
      ))}
      {oldestStale && oldestAge > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <Clock className={`h-3.5 w-3.5 ${oldestAge > 3 ? 'text-ember' : oldestAge > 1 ? 'text-sand' : 'text-stone'}`} />
          <span className="text-stone">
            Oldest open: <span className={oldestAge > 3 ? 'text-ember' : 'text-stone'}>{oldestAge}d</span>
            {' '}in {oldestStale.spaceName}
          </span>
        </div>
      )}
    </div>
  )
}

// --- Main component ---

export function AllTasks() {
  const { data: tasks, isLoading, error } = useAllTasks()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [spaceFilter, setSpaceFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('priority')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showFilters, setShowFilters] = useState(false)

  const uniqueSpaces = useMemo(() => {
    if (!tasks) return []
    const map = new Map<string, string>()
    tasks.forEach((t) => map.set(t.space, t.spaceName))
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [tasks])

  const filtered = useMemo(() => {
    if (!tasks) return []
    let result = [...tasks]
    if (statusFilter !== 'all') result = result.filter((t) => t.status === statusFilter)
    if (priorityFilter !== 'all') result = result.filter((t) => t.priority === priorityFilter)
    if (spaceFilter !== 'all') result = result.filter((t) => t.space === spaceFilter)

    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'priority':
          cmp = (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4)
          break
        case 'space':
          cmp = a.spaceName.localeCompare(b.spaceName)
          break
        case 'age':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'project':
          cmp = a.project.localeCompare(b.project)
          break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return result
  }, [tasks, statusFilter, priorityFilter, spaceFilter, sortField, sortDir])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const activeFilters = [statusFilter !== 'all', priorityFilter !== 'all', spaceFilter !== 'all'].filter(Boolean).length

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-3xl text-parchment">All Tasks</h1>
          <span className="text-sm text-stone">
            {tasks?.length ?? 0} tasks across {uniqueSpaces.length} spaces
          </span>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-stone/5 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember">
            Failed to load tasks: {error.message}
          </div>
        )}

        {tasks && (
          <>
            <SummaryStats tasks={tasks} />

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(['all', 'pending', 'in_progress', 'completed'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-sand/20 text-sand'
                      : 'bg-stone/10 text-stone hover:text-parchment'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                  {s === 'all'
                    ? ` (${tasks.length})`
                    : ` (${tasks.filter((t) => t.status === s).length})`
                  }
                </button>
              ))}

              <div className="w-px h-5 bg-border-custom mx-1" />

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  showFilters || activeFilters > 1
                    ? 'bg-sand/20 text-sand'
                    : 'bg-stone/10 text-stone hover:text-parchment'
                }`}
              >
                <Filter className="h-3 w-3" />
                Filters
                {activeFilters > 1 && (
                  <span className="bg-sand text-ink rounded-full h-4 min-w-4 flex items-center justify-center text-[10px] font-bold px-1">
                    {activeFilters}
                  </span>
                )}
              </button>

              <div className="flex-1" />

              {/* Sort buttons */}
              <div className="flex items-center gap-1">
                {([
                  { field: 'priority' as SortField, label: 'Priority' },
                  { field: 'space' as SortField, label: 'Space' },
                  { field: 'project' as SortField, label: 'Project' },
                  { field: 'age' as SortField, label: 'Age' },
                ]).map(({ field, label }) => (
                  <button
                    key={field}
                    onClick={() => toggleSort(field)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                      sortField === field
                        ? 'bg-sand/15 text-sand'
                        : 'text-stone/60 hover:text-stone'
                    }`}
                  >
                    {label}
                    {sortField === field && (
                      <ArrowUpDown className="h-2.5 w-2.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Extended filter row */}
            {showFilters && (
              <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-surface/30 border border-border-custom">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone uppercase tracking-wider">Priority</span>
                  <div className="flex gap-1">
                    {(['all', 'critical', 'high', 'medium', 'low'] as PriorityFilter[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPriorityFilter(p)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          priorityFilter === p
                            ? 'bg-sand/20 text-sand'
                            : 'bg-stone/10 text-stone hover:text-parchment'
                        }`}
                      >
                        {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px h-5 bg-border-custom" />

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone uppercase tracking-wider">Space</span>
                  <select
                    value={spaceFilter}
                    onChange={(e) => setSpaceFilter(e.target.value)}
                    className="bg-ink border border-border-custom rounded px-2 py-1 text-xs text-parchment focus:outline-none focus:border-sand/40"
                  >
                    <option value="all">All spaces</option>
                    {uniqueSpaces.map(([slug, name]) => (
                      <option key={slug} value={slug}>{name}</option>
                    ))}
                  </select>
                </div>

                {activeFilters > 0 && (
                  <button
                    onClick={() => {
                      setStatusFilter('all')
                      setPriorityFilter('all')
                      setSpaceFilter('all')
                    }}
                    className="text-[10px] text-ember/60 hover:text-ember transition-colors ml-auto"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {/* Task list */}
            {filtered.length === 0 && (
              <div className="rounded-lg border border-border-custom bg-surface/50 py-12 text-center">
                <p className="text-sm text-stone">No tasks match your filters.</p>
              </div>
            )}

            {filtered.length > 0 && (
              <div className="rounded-lg border border-border-custom overflow-hidden">
                {filtered.map((task) => (
                  <TaskRow key={`${task.space}-${task.project}-${task.id}`} task={task} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
