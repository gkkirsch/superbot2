import { useState } from 'react'
import { FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { TaskList } from '@/features/TaskList'
import { useProjectPlan, useProjectDocuments } from '@/hooks/useSpaces'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

function PlanSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-3/4 rounded bg-stone/10 animate-pulse" />
      <div className="h-4 w-full rounded bg-stone/10 animate-pulse" />
      <div className="h-4 w-2/3 rounded bg-stone/10 animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-stone/10 animate-pulse" />
    </div>
  )
}

function DocumentItem({ name, content }: { name: string; content: string }) {
  const [open, setOpen] = useState(false)
  const displayName = name.replace(/\.md$/, '').replace(/[-_]/g, ' ')

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left hover:bg-surface/50 transition-colors">
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-stone shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-stone shrink-0" />
        }
        <FileText className="h-3.5 w-3.5 text-sand/60 shrink-0" />
        <span className="text-sm text-parchment capitalize">{displayName}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-9 mr-3 mb-3 rounded-md bg-surface/30 p-4 max-h-[400px] overflow-auto">
          <MarkdownRenderer content={content} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ProjectView({ slug, project }: { slug: string; project: string }) {
  const { data: plan, isLoading: planLoading } = useProjectPlan(slug, project)
  const { data: documents, isLoading: docsLoading } = useProjectDocuments(slug, project)

  const hasPlan = plan?.exists && plan.content
  const hasDocs = documents && documents.length > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column: Plan + Documents */}
      <div className="space-y-6 min-w-0">
        {/* Plan */}
        <div>
          <h3 className="font-heading text-sm text-stone uppercase tracking-wider mb-3">Plan</h3>
          {planLoading ? (
            <div className="rounded-lg border border-border-custom bg-surface/30 p-5">
              <PlanSkeleton />
            </div>
          ) : hasPlan ? (
            <div className="rounded-lg border border-border-custom bg-surface/30 p-5 max-h-[500px] overflow-auto">
              <MarkdownRenderer content={plan.content} />
            </div>
          ) : (
            <div className="rounded-lg border border-border-custom bg-surface/20 py-8 text-center">
              <p className="text-sm text-stone/50">No plan yet</p>
            </div>
          )}
        </div>

        {/* Documents */}
        {(docsLoading || hasDocs) && (
          <div>
            <h3 className="font-heading text-sm text-stone uppercase tracking-wider mb-3">Documents</h3>
            {docsLoading ? (
              <div className="space-y-2">
                <div className="h-10 rounded bg-stone/5 animate-pulse" />
                <div className="h-10 rounded bg-stone/5 animate-pulse" />
              </div>
            ) : (
              <div className="rounded-lg border border-border-custom overflow-hidden divide-y divide-border-custom">
                {documents!.map((doc) => (
                  <DocumentItem key={doc.name} name={doc.name} content={doc.content} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right column: Tasks */}
      <div className="min-w-0">
        <h3 className="font-heading text-sm text-stone uppercase tracking-wider mb-3">Tasks</h3>
        <TaskList slug={slug} project={project} />
      </div>
    </div>
  )
}
