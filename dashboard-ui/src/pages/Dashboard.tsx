import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Check, X, Plus, RotateCcw } from 'lucide-react'
import { useDashboardConfig } from '@/hooks/useSpaces'
import { SECTION_REGISTRY, DEFAULT_DASHBOARD_CONFIG } from '@/features/DashboardSections'
import type { DashboardConfig } from '@/lib/types'

type ColumnId = 'leftColumn' | 'rightColumn'

// Human-readable section names for UI
const SECTION_LABELS: Record<string, string> = {
  'workers': 'Workers',
  'escalations': 'Escalations',
  'orchestrator-resolved': 'Orchestrator Decisions',
  'recent-activity': 'Recent Activity',
  'pulse': 'Pulse',
  'schedule': 'Schedule',
  'cards': 'Social Drafts',
  'goals': 'Goals',
  'chat': 'Chat',
  'tips': 'Tips',
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
            className="absolute -left-6 top-[0.375rem] cursor-grab active:cursor-grabbing text-stone/40 hover:text-sand transition-colors z-10"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </div>
          <button
            onClick={() => onHide?.(id)}
            className="absolute -right-2 top-[0.375rem] z-10 rounded-full bg-surface border border-stone/20 p-1 text-stone/40 hover:text-ember hover:border-ember/30 transition-colors shadow-sm"
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
      className={`space-y-10 min-h-[60px] min-w-0 py-2 transition-colors duration-200 rounded-lg ${
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

// Migrate old 3-column configs to 2-column layout (chat=left, sections=right)
function migrateConfig(config: DashboardConfig): DashboardConfig {
  if (!config.centerColumn || config.centerColumn.length === 0) return config
  // Collect all items from all columns
  const allItems = [...config.leftColumn, ...config.centerColumn, ...config.rightColumn]
  // Chat goes to leftColumn (wider), everything else to rightColumn (narrower)
  const chatItems = allItems.filter(id => id === 'chat')
  const sectionItems = allItems.filter(id => id !== 'chat')
  return {
    leftColumn: chatItems,
    centerColumn: [],
    rightColumn: sectionItems,
    hidden: config.hidden,
  }
}

// --- Main Dashboard ---

export function Dashboard() {
  const { config, saveConfig, saveError } = useDashboardConfig()
  const [isEditing, setIsEditing] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Local layout state for drag operations (committed to server on drag end)
  const [localLayout, setLocalLayout] = useState<DashboardConfig | null>(null)
  const pendingSave = useRef(false)

  // Clear localLayout once the server confirms the save (config updates via onSuccess)
  useEffect(() => {
    if (pendingSave.current && config) {
      pendingSave.current = false
      setLocalLayout(null)
    }
  }, [config])

  const resolvedConfig = useMemo(() => {
    if (!config) return null
    return migrateConfig(config)
  }, [config])
  const baseLayout = localLayout || resolvedConfig || DEFAULT_DASHBOARD_CONFIG

  // Auto-discover new sections not yet in the saved config
  const layout = useMemo(() => {
    const allKnown = new Set([...baseLayout.leftColumn, ...(baseLayout.centerColumn || []), ...baseLayout.rightColumn, ...baseLayout.hidden])
    const newSections = Object.keys(SECTION_REGISTRY).filter(id => !allKnown.has(id))
    if (newSections.length === 0) return baseLayout
    return { ...baseLayout, hidden: [...baseLayout.hidden, ...newSections] }
  }, [baseLayout])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  // Only rightColumn participates in DnD
  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    const columnContainers = args.droppableContainers.filter(
      (container) => container.id === 'rightColumn'
    )
    const columnPointerCollisions = pointerWithin({ ...args, droppableContainers: columnContainers })

    if (columnPointerCollisions.length > 0) {
      const columnItems = layout.rightColumn || []
      const filtered = args.droppableContainers.filter(
        (container) => container.id === 'rightColumn' || columnItems.includes(container.id as string)
      )
      if (filtered.length > 0) {
        return closestCenter({ ...args, droppableContainers: filtered })
      }
      return columnPointerCollisions
    }

    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
    const rectCollisions = rectIntersection(args)
    if (rectCollisions.length > 0) return rectCollisions
    return closestCenter(args)
  }, [layout])

  const findContainerIn = (config: DashboardConfig, id: string): ColumnId | null => {
    if (config.rightColumn.includes(id)) return 'rightColumn'
    return null
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setLocalLayout({ ...layout })
  }, [layout])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeItemId = active.id as string
    const overId = over.id as string

    setLocalLayout((prev) => {
      const current = prev || layout

      const activeContainer = findContainerIn(current, activeItemId)
      let overContainer: ColumnId | null
      if (overId === 'rightColumn') {
        overContainer = overId
      } else {
        overContainer = findContainerIn(current, overId)
      }

      if (!activeContainer || !overContainer || activeContainer === overContainer) return current

      const sourceItems = [...current[activeContainer]]
      const destItems = [...current[overContainer]]

      const activeIndex = sourceItems.indexOf(activeItemId)
      if (activeIndex === -1) return current
      sourceItems.splice(activeIndex, 1)

      if (overId === overContainer) {
        destItems.push(activeItemId)
      } else {
        const overIndex = destItems.indexOf(overId)
        destItems.splice(overIndex >= 0 ? overIndex : destItems.length, 0, activeItemId)
      }

      return { ...current, [activeContainer]: sourceItems, [overContainer]: destItems }
    })
  }, [layout])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) {
      setLocalLayout(null)
      return
    }

    const activeItemId = active.id as string
    const overId = over.id as string

    setLocalLayout((prev) => {
      const current = prev || layout

      const activeContainer = findContainerIn(current, activeItemId)
      let overContainer: ColumnId | null
      if (overId === 'rightColumn') {
        overContainer = overId
      } else {
        overContainer = findContainerIn(current, overId)
      }

      if (!activeContainer || !overContainer) {
        return null
      }

      let finalLayout = current
      if (activeContainer === overContainer && activeItemId !== overId) {
        const items = [...current[activeContainer]]
        const oldIndex = items.indexOf(activeItemId)
        const newIndex = items.indexOf(overId)
        if (oldIndex !== -1 && newIndex !== -1) {
          finalLayout = { ...current, [activeContainer]: arrayMove(items, oldIndex, newIndex) }
        }
      }

      pendingSave.current = true
      saveConfig(finalLayout)
      return finalLayout
    })
  }, [layout, saveConfig])

  const handleHideSection = useCallback((sectionId: string) => {
    const current = localLayout || config || DEFAULT_DASHBOARD_CONFIG
    const newConfig: DashboardConfig = {
      leftColumn: current.leftColumn.filter(id => id !== sectionId),
      centerColumn: [],
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
      centerColumn: [],
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
      <div className="mx-auto max-w-[1600px] px-6">
        {saveError && (
          <p className="text-xs text-ember mb-2">Failed to save layout: {saveError.message}</p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[4fr_1fr] gap-8">
            {/* Left column — chat (wider, sticky full-height) */}
            <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden min-w-0">
              {layout.leftColumn.map((sectionId) => {
                const def = SECTION_REGISTRY[sectionId]
                if (!def) return null
                return <def.Component key={sectionId} />
              })}
            </div>

            {/* Right column — sections (narrower, scrollable, draggable) */}
            <div className="min-w-[280px] pt-8">
              {/* Hidden sections toolbar — shown only when editing */}
              {isEditing && layout.hidden.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-6">
                  <span className="text-xs text-stone/70 uppercase tracking-wider">Hidden:</span>
                  {layout.hidden.map((id) => (
                    <button
                      key={id}
                      onClick={() => handleRestoreSection(id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-stone/40 bg-surface/60 text-xs text-parchment/70 hover:text-sand hover:border-sand/50 hover:bg-surface transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      {SECTION_LABELS[id] || id}
                    </button>
                  ))}
                </div>
              )}

              <DroppableColumn id="rightColumn" sectionIds={layout.rightColumn} isEditing={isEditing} onHide={handleHideSection} />

              {/* Section controls — bottom of right column */}
              <div className="flex items-center gap-2 mt-8 pb-6 justify-end">
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
                  className={`inline-flex items-center justify-center p-1.5 rounded-md transition-all ${
                    isEditing
                      ? 'bg-sand text-ink'
                      : 'text-stone hover:text-sand border border-stone/20 hover:border-sand/30'
                  }`}
                  title={isEditing ? 'Done' : 'Customize layout'}
                >
                  {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeId ? <DragPreview id={activeId} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
