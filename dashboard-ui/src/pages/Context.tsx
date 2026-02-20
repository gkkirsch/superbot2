import { FileText } from 'lucide-react'
import { ContextSection } from '@/features/ContextSection'

export function Context() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-5 w-5 text-sand" />
          <h1 className="font-heading text-2xl text-parchment">Context</h1>
        </div>
        <ContextSection />
      </div>
    </div>
  )
}
