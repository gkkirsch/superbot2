import { useState, useEffect, type ReactNode } from 'react'
import yaml from 'js-yaml'
import { Loader2, X, FileText, FolderOpen, File, Package } from 'lucide-react'
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

function FileIcon({ name, isDir }: { name: string; isDir: boolean }) {
  if (isDir) return <FolderOpen className="h-3.5 w-3.5 text-sand/50 shrink-0" />
  if (name.endsWith('.json')) return <Package className="h-3.5 w-3.5 text-stone/50 shrink-0" />
  if (name.endsWith('.md')) return <FileText className="h-3.5 w-3.5 text-stone/50 shrink-0" />
  return <File className="h-3.5 w-3.5 text-stone/50 shrink-0" />
}

export interface SkillDetailModalProps {
  skill: { id: string; name: string; description?: string }
  onClose: () => void
  fetchDetail: (id: string) => Promise<{ fullContent: string; files: string[]; fileTree?: { path: string; type: string }[] }>
  fetchFile: (id: string, filePath: string) => Promise<string>
  headerActions?: ReactNode
  belowHeader?: ReactNode
}

export function SkillDetailModal({ skill, onClose, fetchDetail, fetchFile, headerActions, belowHeader }: SkillDetailModalProps) {
  const [detail, setDetail] = useState<{ fullContent: string; files: string[]; fileTree?: { path: string; type: string }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string>('SKILL.md')
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)

  useEffect(() => {
    fetchDetail(skill.id)
      .then(d => {
        setDetail(d)
        // Auto-load SKILL.md content
        setFileLoading(true)
        fetchFile(skill.id, 'SKILL.md')
          .then(setFileContent)
          .catch(() => setFileContent('Failed to load file.'))
          .finally(() => setFileLoading(false))
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [skill.id, fetchDetail, fetchFile])

  function handleFileClick(filePath: string) {
    setSelectedFile(filePath)
    setFileContent(null)
    setFileLoading(true)
    fetchFile(skill.id, filePath)
      .then(setFileContent)
      .catch(() => setFileContent('Failed to load file.'))
      .finally(() => setFileLoading(false))
  }

  // Build display list: prefer fileTree (recursive), fall back to flat files
  const fileList = detail?.fileTree ?? detail?.files.map(f => ({ path: f, type: 'file' })) ?? []

  const isMarkdown = selectedFile.endsWith('.md')
  const parsed = fileContent && isMarkdown ? parseFrontmatter(fileContent) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border-custom rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border-custom shrink-0">
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

        {/* Optional content below header (e.g. credentials) */}
        {belowHeader && (
          <div className="px-6 py-3 border-b border-border-custom shrink-0">
            {belowHeader}
          </div>
        )}

        {/* Body: two-column layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-stone" />
            </div>
          ) : (
            <>
              {/* Left: File list */}
              <div className="w-52 shrink-0 border-r border-border-custom overflow-y-auto p-3">
                <p className="text-[10px] font-medium text-stone/50 uppercase tracking-wider mb-2 px-1">Files</p>
                <div className="space-y-0.5">
                  {fileList.map(f => {
                    const depth = f.path.split('/').length - 1
                    const name = f.path.split('/').pop() || f.path
                    const isDir = f.type === 'directory'
                    const isSelected = selectedFile === f.path
                    return (
                      <button
                        key={f.path}
                        onClick={() => !isDir && handleFileClick(f.path)}
                        disabled={isDir}
                        className={`w-full text-left flex items-center gap-1.5 py-1 px-1.5 rounded transition-colors ${
                          isSelected
                            ? 'bg-blue-500/15 text-blue-300'
                            : isDir
                              ? 'text-stone/50 cursor-default'
                              : 'text-parchment/70 hover:bg-ink/50 cursor-pointer'
                        }`}
                        style={{ paddingLeft: `${depth * 12 + 6}px` }}
                      >
                        <FileIcon name={name} isDir={isDir} />
                        <span className="text-xs truncate">{name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Right: Content viewer */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="text-xs text-stone/50 font-mono mb-3">{selectedFile}</div>
                {fileLoading ? (
                  <div className="flex items-center gap-2 text-stone">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : isMarkdown ? (
                  <>
                    {parsed?.frontmatter && <FrontmatterBlock data={parsed.frontmatter} />}
                    <div className="docs-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed?.body || fileContent || ''}</ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <pre className="text-xs text-parchment font-mono whitespace-pre-wrap rounded-lg bg-ink/50 border border-border-custom p-4">
                    {fileContent}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
