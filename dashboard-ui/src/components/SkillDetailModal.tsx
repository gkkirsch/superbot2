import { useState, useEffect, type ReactNode } from 'react'
import yaml from 'js-yaml'
import { Loader2, X, FileText, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function parseFrontmatter(raw: string): { frontmatter: Record<string, any> | null; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { frontmatter: null, body: raw }
  try {
    const fm = yaml.load(match[1]) as Record<string, any> | null
    return { frontmatter: fm || {}, body: raw.slice(match[0].length) }
  } catch {
    return { frontmatter: null, body: raw }
  }
}

function FrontmatterBlock({ data }: { data: Record<string, any> }) {
  return (
    <div className="rounded-lg bg-ink border border-border-custom p-4 mb-4">
      <div className="grid gap-2">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-3">
            <span className="text-xs font-mono text-sand shrink-0 min-w-[120px]">{key}</span>
            <span className="text-xs text-parchment">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FileViewer({ skillId, filePath, onBack, fetchFile }: {
  skillId: string
  filePath: string
  onBack: () => void
  fetchFile: (id: string, filePath: string) => Promise<string>
}) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchFile(skillId, filePath)
      .then(setContent)
      .catch(() => setContent('Failed to load file.'))
      .finally(() => setLoading(false))
  }, [skillId, filePath, fetchFile])

  const isMarkdown = filePath.endsWith('.md')
  const parsed = content && isMarkdown ? parseFrontmatter(content) : null

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-stone hover:text-parchment transition-colors mb-3 self-start"
      >
        <ChevronRight className="h-3 w-3 rotate-180" />
        Back
      </button>
      <div className="text-xs text-stone/60 font-mono mb-3">{filePath}</div>
      <div className="flex-1 overflow-auto rounded-lg bg-ink/50 border border-border-custom p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-stone">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : isMarkdown ? (
          <>
            {parsed?.frontmatter && <FrontmatterBlock data={parsed.frontmatter} />}
            <div className="docs-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed?.body || content || ''}</ReactMarkdown>
            </div>
          </>
        ) : (
          <pre className="text-xs text-parchment font-mono whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  )
}

export interface SkillDetailModalProps {
  skill: { id: string; name: string; description?: string }
  onClose: () => void
  fetchDetail: (id: string) => Promise<{ fullContent: string; files: string[] }>
  fetchFile: (id: string, filePath: string) => Promise<string>
  headerActions?: ReactNode
}

export function SkillDetailModal({ skill, onClose, fetchDetail, fetchFile, headerActions }: SkillDetailModalProps) {
  const [detail, setDetail] = useState<{ fullContent: string; files: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewingFile, setViewingFile] = useState<string | null>(null)

  useEffect(() => {
    fetchDetail(skill.id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [skill.id, fetchDetail])

  const parsed = detail?.fullContent ? parseFrontmatter(detail.fullContent) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom">
          <div className="min-w-0">
            <h2 className="font-heading text-xl text-parchment">{skill.name}</h2>
            {skill.description && <p className="text-sm text-stone mt-1">{skill.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {headerActions}
            <button onClick={onClose} className="p-2 text-stone hover:text-parchment transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-stone" />
            </div>
          ) : viewingFile ? (
            <FileViewer skillId={skill.id} filePath={viewingFile} onBack={() => setViewingFile(null)} fetchFile={fetchFile} />
          ) : (
            <div className="space-y-6">
              {parsed?.frontmatter && <FrontmatterBlock data={parsed.frontmatter} />}
              {parsed?.body && (
                <div className="docs-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.body}</ReactMarkdown>
                </div>
              )}

              {detail?.files && detail.files.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="h-3.5 w-3.5 text-stone/60" />
                    <span className="text-xs text-stone/60">Files ({detail.files.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5">
                    {detail.files.map(f => (
                      <button
                        key={f}
                        onClick={() => setViewingFile(f)}
                        className="text-left text-xs font-mono text-stone hover:text-parchment px-2 py-1 rounded hover:bg-ink/50 transition-colors truncate"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
