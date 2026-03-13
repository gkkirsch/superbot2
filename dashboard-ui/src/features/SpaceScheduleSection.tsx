import { useState } from 'react'
import { Clock, Plus } from 'lucide-react'
import { ScheduleSection } from '@/features/ScheduleSection'

export function SpaceScheduleSection({ slug }: { slug: string }) {
  const [adding, setAdding] = useState(false)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-stone/50" />
          <h2 className="text-xs text-stone uppercase tracking-wider">Schedule</h2>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-stone hover:text-sand transition-colors flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      <ScheduleSection adding={adding} setAdding={setAdding} space={slug} />
    </section>
  )
}
