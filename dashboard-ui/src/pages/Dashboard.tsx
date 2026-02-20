import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Settings, X, Plus, RotateCcw } from 'lucide-react'
import { useDashboardConfig } from '@/hooks/useSpaces'
import { SECTION_REGISTRY, DEFAULT_DASHBOARD_CONFIG } from '@/features/DashboardSections'
import { ChatSection } from '@/features/ChatSection'
import type { DashboardConfig } from '@/lib/types'

// Human-readable section names for UI
const SECTION_LABELS: Record<string, string> = {
  'escalations': 'Escalations',
  'orchestrator-resolved': 'Orchestrator Decisions',
  'recent-activity': 'Recent Activity',
  'pulse': 'Pulse',
  'schedule': 'Schedule',
  'extensions': 'Extensions',
}

// --- Sortable section item ---

function SortableSection({ id, isEditing, onHide }: {
  id: string
  isEditing: boolean
  onHide?: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const def = SECTION_REGISTRY[id]
  if (!def) return null

  return (
    <div ref={setNodeRef} style={style} className="relative group/section">
      {isEditing && (
        <>
          <div
            className="absolute -left-6 top-1 cursor-grab active:cursor-grabbing text-stone/40 hover:text-sand transition-colors z-10"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </div>
          <button
            onClick={() => onHide?.(id)}
            className="absolute -right-2 -top-2 z-10 rounded-full bg-surface border border-stone/20 p-1 text-stone/40 hover:text-ember hover:border-ember/30 transition-colors shadow-sm"
            title={`Hide ${SECTION_LABELS[id] || id}`}
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
      <def.Component />
    </div>
  )
}

// --- Drag overlay preview ---

function DragPreview({ id }: { id: string }) {
  return (
    <div className="opacity-80 rounded-lg border border-sand/30 bg-surface shadow-xl p-4 max-w-md">
      <div className="flex items-center gap-2">
        <GripVertical className="h-5 w-5 text-sand" />
        <span className="text-sm text-parchment font-heading">{SECTION_LABELS[id] || id}</span>
      </div>
    </div>
  )
}

// --- Droppable column ---

function DroppableColumn({ id, sectionIds, isEditing, onHide }: {
  id: string
  sectionIds: string[]
  isEditing: boolean
  onHide?: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`space-y-10 min-h-[100px] transition-colors duration-200 rounded-lg ${
        isEditing && isOver ? 'bg-sand/5 ring-1 ring-sand/20' : ''
      } ${isEditing && sectionIds.length === 0 ? 'border border-dashed border-stone/20 flex items-center justify-center' : ''}`}
    >
      {isEditing && sectionIds.length === 0 && (
        <p className="text-xs text-stone/40">Drop sections here</p>
      )}
      <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
        {sectionIds.map((sectionId) => (
          <SortableSection key={sectionId} id={sectionId} isEditing={isEditing} onHide={onHide} />
        ))}
      </SortableContext>
    </div>
  )
}

// --- Hidden sections tray ---

function HiddenSectionsTray({ hidden, onRestore }: {
  hidden: string[]
  onRestore: (id: string) => void
}) {
  if (hidden.length === 0) return null

  return (
    <div className="mt-8 rounded-lg border border-dashed border-stone/20 bg-surface/20 p-4">
      <h3 className="text-xs text-stone/60 uppercase tracking-wider mb-3">Hidden Sections</h3>
      <div className="flex flex-wrap gap-2">
        {hidden.map((id) => (
          <button
            key={id}
            onClick={() => onRestore(id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stone/20 bg-surface/50 text-xs text-stone hover:text-sand hover:border-sand/30 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {SECTION_LABELS[id] || id}
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Main Dashboard ---

export function Dashboard() {
  const { config, saveConfig } = useDashboardConfig()
  const [isEditing, setIsEditing] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Local layout state for drag operations (committed to server on drag end)
  const [localLayout, setLocalLayout] = useState<DashboardConfig | null>(null)
  const layout = localLayout || config || DEFAULT_DASHBOARD_CONFIG

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const findContainer = useCallback((id: string): 'leftColumn' | 'rightColumn' | null => {
    if (layout.leftColumn.includes(id)) return 'leftColumn'
    if (layout.rightColumn.includes(id)) return 'rightColumn'
    return null
  }, [layout])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    // Snapshot current layout for drag operations
    setLocalLayout({ ...layout })
  }, [layout])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeContainer = findContainer(activeId)
    let overContainer: 'leftColumn' | 'rightColumn' | null
    if (overId === 'leftColumn' || overId === 'rightColumn') {
      overContainer = overId
    } else {
      overContainer = findContainer(overId)
    }

    if (!activeContainer || !overContainer || activeContainer === overContainer) return

    setLocalLayout((prev) => {
      if (!prev) return prev
      const sourceItems = [...prev[activeContainer]]
      const destItems = [...prev[overContainer]]

      const activeIndex = sourceItems.indexOf(activeId)
      if (activeIndex === -1) return prev
      sourceItems.splice(activeIndex, 1)

      if (overId === overContainer) {
        destItems.push(activeId)
      } else {
        const overIndex = destItems.indexOf(overId)
        destItems.splice(overIndex >= 0 ? overIndex : destItems.length, 0, activeId)
      }

      return { ...prev, [activeContainer]: sourceItems, [overContainer]: destItems }
    })
  }, [findContainer])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) {
      setLocalLayout(null)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string

    const activeContainer = findContainer(activeId)
    let overContainer: 'leftColumn' | 'rightColumn' | null
    if (overId === 'leftColumn' || overId === 'rightColumn') {
      overContainer = overId
    } else {
      overContainer = findContainer(overId)
    }

    if (!activeContainer || !overContainer) {
      setLocalLayout(null)
      return
    }

    // Same container reorder
    if (activeContainer === overContainer && activeId !== overId) {
      setLocalLayout((prev) => {
        if (!prev) return prev
        const items = [...prev[activeContainer]]
        const oldIndex = items.indexOf(activeId)
        const newIndex = items.indexOf(overId)
        if (oldIndex === -1 || newIndex === -1) return prev
        const reordered = arrayMove(items, oldIndex, newIndex)
        return { ...prev, [activeContainer]: reordered }
      })
    }

    // Save the final layout
    setLocalLayout((prev) => {
      if (prev) {
        saveConfig(prev)
      }
      return null
    })
  }, [findContainer, saveConfig])

  const handleHideSection = useCallback((sectionId: string) => {
    const current = localLayout || config || DEFAULT_DASHBOARD_CONFIG
    const newConfig: DashboardConfig = {
      leftColumn: current.leftColumn.filter(id => id !== sectionId),
      rightColumn: current.rightColumn.filter(id => id !== sectionId),
      hidden: [...current.hidden.filter(id => id !== sectionId), sectionId],
    }
    saveConfig(newConfig)
    setLocalLayout(null)
  }, [localLayout, config, saveConfig])

  const handleRestoreSection = useCallback((sectionId: string) => {
    const current = localLayout || config || DEFAULT_DASHBOARD_CONFIG
    const newConfig: DashboardConfig = {
      leftColumn: current.leftColumn,
      rightColumn: [...current.rightColumn, sectionId],
      hidden: current.hidden.filter(id => id !== sectionId),
    }
    saveConfig(newConfig)
    setLocalLayout(null)
  }, [localLayout, config, saveConfig])

  const handleResetDefaults = useCallback(() => {
    saveConfig(DEFAULT_DASHBOARD_CONFIG)
    setLocalLayout(null)
  }, [saveConfig])

  const toggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev)
    setLocalLayout(null)
  }, [])

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-heading text-4xl text-parchment">superbot</h1>
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                onClick={handleResetDefaults}
                className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-stone hover:text-parchment border border-stone/20 hover:border-stone/30 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
            <button
              onClick={toggleEditing}
              className={`text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                isEditing
                  ? 'bg-sand text-ink font-medium'
                  : 'text-stone hover:text-sand border border-stone/20 hover:border-sand/30'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              {isEditing ? 'Done' : 'Customize'}
            </button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className={`grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_1fr] gap-8 ${isEditing ? 'pl-6' : ''}`}>
            {/* Left column */}
            <DroppableColumn id="leftColumn" sectionIds={layout.leftColumn} isEditing={isEditing} onHide={handleHideSection} />

            {/* Center column — Chat (always fixed) */}
            <div>
              <ChatSection />
            </div>

            {/* Right column */}
            <DroppableColumn id="rightColumn" sectionIds={layout.rightColumn} isEditing={isEditing} onHide={handleHideSection} />
          </div>

          <DragOverlay>
            {activeId ? <DragPreview id={activeId} /> : null}
          </DragOverlay>
        </DndContext>

        {/* Hidden sections tray — only visible in edit mode */}
        {isEditing && (
          <HiddenSectionsTray hidden={layout.hidden} onRestore={handleRestoreSection} />
        )}
      </div>
    </div>
  )
}
