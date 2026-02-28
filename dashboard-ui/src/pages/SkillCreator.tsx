import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, Paperclip, FileText, Wand2, Wifi, WifiOff, Loader2, Plus, FolderOpen, Check, Upload, File, Package, Save, Pencil, AlertTriangle, RefreshCw, CheckCircle, XCircle, ChevronDown, FlaskConical, Play, Square } from 'lucide-react'
import { MarkdownContent } from '@/features/MarkdownContent'
import { Sheet, SheetHeader, SheetBody } from '@/components/ui/sheet'
import yaml from 'js-yaml'

// --- Types ---

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tools?: { name: string; input: Record<string, unknown> }[]
  timestamp: number
}

interface AttachedFile {
  file: File
  preview: string
}

const ACCEPTED_FILE_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/markdown',
  'application/json',
  'text/yaml', 'application/x-yaml',
  'text/javascript', 'application/javascript',
  'text/x-python',
  'application/x-sh',
]

const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.json,.yaml,.yml,.js,.ts,.py,.sh'

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_FILE_TYPES.includes(file.type)) return true
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.md', '.json', '.yaml', '.yml', '.js', '.ts', '.py', '.sh'].includes(ext)
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01'
  return `$${cost.toFixed(2)}`
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  try {
    const parsed = yaml.load(match[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

// --- Tool Activity ---

function toolDisplayName(name: string): string {
  const map: Record<string, string> = {
    Read: 'Reading file',
    Write: 'Writing file',
    Edit: 'Editing file',
    Bash: 'Running command',
    Glob: 'Finding files',
    Grep: 'Searching code',
  }
  return map[name] || name
}

function ToolIndicator({ tools }: { tools: { name: string; input: Record<string, unknown> }[] }) {
  if (tools.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {tools.map((tool, i) => {
        const detail = tool.input?.file_path || tool.input?.pattern || tool.input?.command || ''
        const shortDetail = typeof detail === 'string' && detail.length > 60
          ? '...' + detail.slice(-57)
          : detail
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface/50 text-[10px] text-stone/70"
          >
            <span className="text-sand/60">{toolDisplayName(tool.name)}</span>
            {shortDetail && <span className="text-stone/45 truncate max-w-[200px]">{String(shortDetail)}</span>}
          </span>
        )
      })}
    </div>
  )
}

// --- Bubbles ---

function UserBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%]">
        <div className="rounded-2xl rounded-br-md px-4 py-2.5 bg-[rgba(180,160,120,0.15)] overflow-hidden min-w-0">
          <p className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">
            {msg.content}
          </p>
        </div>
        <span className="text-[10px] text-stone/50 block text-right mt-1 mr-1">
          {formatTime(msg.timestamp)}
        </span>
      </div>
    </div>
  )
}

function AssistantBubble({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = msg.content.length > 500

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] overflow-hidden">
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">plugin creator</span>
        <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden min-w-0 w-full">
          {isLong && !expanded ? (
            <>
              <div className="max-h-64 overflow-hidden">
                <MarkdownContent content={msg.content} className="text-parchment/80" />
              </div>
              <button onClick={() => setExpanded(true)} className="text-xs text-stone/50 mt-1.5 hover:text-stone/70">
                Show more
              </button>
            </>
          ) : (
            <>
              <MarkdownContent content={msg.content} className="text-parchment/80" />
              {isLong && (
                <button onClick={() => setExpanded(false)} className="text-xs text-stone/50 mt-1.5 hover:text-stone/70">
                  Show less
                </button>
              )}
            </>
          )}
        </div>
        {msg.tools && msg.tools.length > 0 && <ToolIndicator tools={msg.tools} />}
        <span className="text-[10px] text-stone/50 block mt-1 ml-1">
          {formatTime(msg.timestamp)}
        </span>
      </div>
    </div>
  )
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] overflow-hidden">
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">plugin creator</span>
        <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden min-w-0 w-full">
          <MarkdownContent content={text} className="text-parchment/80" />
          <span className="inline-block w-1.5 h-4 bg-sand/50 animate-pulse ml-0.5 align-text-bottom" />
        </div>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div>
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">plugin creator</span>
        <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-[rgba(120,140,160,0.12)]">
          <div className="flex gap-1.5 items-center">
            <span className="typing-dot" />
            <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
            <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Image Lightbox ---

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-parchment/70 hover:text-parchment transition-colors">
        <X className="h-6 w-6" />
      </button>
      <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-lg" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

// --- My Skills Sidebar ---

interface InstalledSkill {
  name: string
  description: string
  version: string
  installPath: string
}

interface DraftSkill {
  name: string
  sessionId?: string
  createdAt: string
  status: string
  type?: 'plugin' | 'skill'
}

interface ValidationIssue {
  file: string
  field: string | null
  message: string
}

interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

function MySkillsSidebar({ onNewDraft, refreshKey, selectedDraft, onSelectDraft }: {
  onNewDraft: (type: 'plugin' | 'skill') => void
  refreshKey: number
  selectedDraft: string | null
  onSelectDraft: (name: string) => void
}) {
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [drafts, setDrafts] = useState<DraftSkill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchAll() {
      try {
        const [skillsRes, draftsRes] = await Promise.all([
          fetch('/api/skill-creator/my-skills'),
          fetch('/api/skill-creator/drafts')
        ])
        const [skillsData, draftsData] = await Promise.all([
          skillsRes.json(),
          draftsRes.json()
        ])
        if (!cancelled) {
          if (skillsData.ok) setSkills(skillsData.skills)
          if (draftsData.ok) setDrafts(draftsData.drafts)
        }
      } catch {}
      if (!cancelled) setLoading(false)
    }
    fetchAll()

    // Poll every 30s
    const interval = setInterval(fetchAll, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [refreshKey])

  const hasContent = skills.length > 0 || drafts.length > 0

  return (
    <div className="w-60 shrink-0 border-r border-border-custom bg-ink/40 flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-medium text-stone/60 uppercase tracking-wider">My Plugins</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 text-stone/40 animate-spin" />
          </div>
        ) : !hasContent ? (
          <div className="flex items-center justify-center py-8 text-center px-2">
            <p className="text-xs text-stone/40">No plugins yet — create your first one!</p>
          </div>
        ) : (
          <>
            {drafts.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-medium text-stone/40 uppercase tracking-wider px-3 mb-1">Drafts</p>
                <div className="space-y-0.5">
                  {drafts.map(draft => {
                    const isSelected = selectedDraft === draft.name
                    const isPlugin = draft.type === 'plugin'
                    return (
                      <button
                        key={draft.name}
                        onClick={() => onSelectDraft(draft.name)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-500/15 border border-blue-500/30'
                            : 'hover:bg-surface/40 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm truncate ${isSelected ? 'text-blue-300' : 'text-parchment'}`}>{draft.name}</p>
                          <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded ${
                            isPlugin
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-purple-500/20 text-purple-400'
                          }`}>
                            {isPlugin ? 'Plugin' : 'Skill'}
                          </span>
                        </div>
                        <p className="text-xs text-stone/60 mt-0.5">{draft.status === 'complete' ? 'Ready to promote' : draft.status}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {skills.length > 0 && (
              <div>
                {drafts.length > 0 && (
                  <p className="text-[10px] font-medium text-stone/40 uppercase tracking-wider px-3 mb-1">Installed</p>
                )}
                <div className="space-y-0.5">
                  {skills.map(skill => (
                    <div key={skill.name} className="px-3 py-2 rounded-lg hover:bg-surface/40 transition-colors cursor-default">
                      <p className="text-sm text-parchment truncate">{skill.name}</p>
                      <p className="text-xs text-stone/60 line-clamp-2 mt-0.5">{skill.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-3 pb-3 pt-2">
        <NewDraftDropdown onNewDraft={onNewDraft} />
      </div>
    </div>
  )
}

function NewDraftDropdown({ onNewDraft }: { onNewDraft: (type: 'plugin' | 'skill') => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-border-custom text-stone/50 hover:text-parchment hover:border-stone/30 transition-colors flex items-center justify-center gap-1.5 text-xs"
      >
        <Plus className="h-3.5 w-3.5" />
        New
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-ink border border-border-custom rounded-lg shadow-xl overflow-hidden z-10">
          <button
            onClick={() => { setOpen(false); onNewDraft('plugin') }}
            className="w-full text-left px-3 py-2 text-xs text-parchment/80 hover:bg-surface/40 transition-colors flex items-center gap-2"
          >
            <Package className="h-3.5 w-3.5 text-blue-400" />
            <div>
              <span className="font-medium">New Plugin</span>
              <p className="text-[10px] text-stone/50 mt-0.5">Full package with plugin.json + skills/</p>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); onNewDraft('skill') }}
            className="w-full text-left px-3 py-2 text-xs text-parchment/80 hover:bg-surface/40 transition-colors flex items-center gap-2 border-t border-border-custom"
          >
            <FileText className="h-3.5 w-3.5 text-purple-400" />
            <div>
              <span className="font-medium">New Skill</span>
              <p className="text-[10px] text-stone/50 mt-0.5">Standalone SKILL.md file</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

// --- Skill Tester ---

interface TesterSkill {
  id: string
  name: string
  description: string
}

function SkillTester() {
  const [expanded, setExpanded] = useState(false)
  const [skills, setSkills] = useState<TesterSkill[]>([])
  const [selectedSkill, setSelectedSkill] = useState('')
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const outputRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Fetch available skills on mount
  useEffect(() => {
    fetch('/api/skill-tester/skills')
      .then(r => r.json())
      .then(data => { if (data.ok) setSkills(data.skills) })
      .catch(() => {})
  }, [])

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const handleRun = async () => {
    if (!selectedSkill || !prompt.trim() || status === 'running') return

    setOutput('')
    setStatus('running')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/skill-tester/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName: selectedSkill, prompt: prompt.trim() }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        setStatus('error')
        setOutput('Failed to connect to skill tester')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'chunk') {
              setOutput(prev => prev + data.text)
            } else if (data.type === 'done') {
              setStatus('done')
            } else if (data.type === 'error') {
              setStatus('error')
              setOutput(prev => prev + '\n\n--- Error ---\n' + data.message)
            }
          } catch {}
        }
      }

      // If stream ended without a 'done' event
      setStatus(prev => prev === 'running' ? 'done' : prev)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus('error')
        setOutput(prev => prev + '\n\nConnection error')
      }
    }
  }

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort()
    setStatus('done')
  }

  const handleClear = () => {
    if (abortRef.current) abortRef.current.abort()
    setOutput('')
    setStatus('idle')
  }

  return (
    <div className="border-t border-border-custom shrink-0">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-stone/60 hover:text-parchment transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" />
          <span className="uppercase tracking-wider">Test a Skill</span>
        </div>
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Skill selector */}
          <select
            value={selectedSkill}
            onChange={e => setSelectedSkill(e.target.value)}
            className="w-full text-xs bg-ink/50 text-parchment border border-border-custom rounded-lg px-2 py-1.5 focus:outline-none focus:border-sand/50"
          >
            <option value="">Select a skill...</option>
            {skills.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Prompt input */}
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ask the skill something..."
            rows={3}
            className="w-full text-xs bg-ink/50 text-parchment border border-border-custom rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-sand/50 placeholder:text-stone/30"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun()
            }}
          />

          {/* Actions row */}
          <div className="flex items-center gap-2">
            {status === 'running' ? (
              <button
                onClick={handleStop}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-ember/20 text-ember rounded-lg hover:bg-ember/30 transition-colors"
              >
                <Square className="h-3 w-3" /> Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!selectedSkill || !prompt.trim()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Play className="h-3 w-3" /> Run
              </button>
            )}
            {output && (
              <button
                onClick={handleClear}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-stone/50 hover:text-parchment transition-colors"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            {/* Status indicator */}
            <span className={`text-[10px] ml-auto ${
              status === 'running' ? 'text-sand/70' :
              status === 'done' ? 'text-moss/70' :
              status === 'error' ? 'text-ember/70' :
              'text-stone/40'
            }`}>
              {status === 'running' && <><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Running...</>}
              {status === 'done' && 'Done'}
              {status === 'error' && 'Error'}
            </span>
          </div>

          {/* Output area */}
          {output && (
            <div
              ref={outputRef}
              className="max-h-64 overflow-y-auto rounded-lg bg-ink/80 border border-border-custom p-2.5 text-xs text-parchment/80 font-mono whitespace-pre-wrap break-words"
            >
              {output}
              {status === 'running' && (
                <span className="inline-block w-1.5 h-3.5 bg-sand/50 animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Main Component ---

export function SkillCreator() {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [totalCost, setTotalCost] = useState(0)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [, setDraftFiles] = useState<{ path: string; type: string }[]>([])
  const [isPromoting, setIsPromoting] = useState(false)
  const [promoteStatus, setPromoteStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [selectedDraft, setSelectedDraft] = useState<string | null>(() => {
    try { return localStorage.getItem('skill-creator-selected-draft') } catch { return null }
  })
  const [selectedDraftFiles, setSelectedDraftFiles] = useState<{ path: string; type: string }[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [frontmatter, setFrontmatter] = useState<Record<string, unknown> | null>(null)
  const [isDraftDragging, setIsDraftDragging] = useState(false)
  const [draftUploading, setDraftUploading] = useState(false)
  const [fileSheetOpen, setFileSheetOpen] = useState(false)
  const [fileEditing, setFileEditing] = useState(false)
  const [fileDraft, setFileDraft] = useState('')
  const [fileSaving, setFileSaving] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [validationExpanded, setValidationExpanded] = useState(false)
  const [selectedDraftType, setSelectedDraftType] = useState<'plugin' | 'skill' | null>(null)
  const [pluginMeta, setPluginMeta] = useState<{ name: string; version: string; description: string; author: string } | null>(null)
  const [pluginMetaSaving, setPluginMetaSaving] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftFileInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const initialScrollDoneRef = useRef(false)
  const pendingToolsRef = useRef<{ name: string; input: Record<string, unknown> }[]>([])
  const draftMessagesRef = useRef<Map<string, Message[]>>(new Map())
  const sessionIdRef = useRef(sessionId)
  const selectedDraftRef = useRef(selectedDraft)
  const messagesRef = useRef(messages)

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
  }, [])

  // Keep refs in sync with state (avoids stale closures in callbacks)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  useEffect(() => { selectedDraftRef.current = selectedDraft }, [selectedDraft])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Persist selectedDraft to localStorage
  useEffect(() => {
    try {
      if (selectedDraft) {
        localStorage.setItem('skill-creator-selected-draft', selectedDraft)
      } else {
        localStorage.removeItem('skill-creator-selected-draft')
      }
    } catch { /* ignore */ }
  }, [selectedDraft])

  // Restore chat history on mount when a persisted draft exists
  useEffect(() => {
    if (!selectedDraft) return
    let cancelled = false
    async function restore() {
      try {
        const res = await fetch(`/api/skill-creator/drafts/${selectedDraft}/chat-history`)
        const data = await res.json()
        if (!cancelled && data.ok && data.messages.length > 0) {
          setMessages(data.messages.map((m: { role: string; content: string; tools?: { name: string; input: Record<string, unknown> }[]; timestamp: number }) => ({
            id: crypto.randomUUID(),
            ...m,
          })))
        }
      } catch { /* draft may have been deleted */ }
    }
    restore()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only on mount

  // Auto-scroll on new messages and streaming
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return
    if (!initialScrollDoneRef.current && messages.length > 0) {
      initialScrollDoneRef.current = true
      scrollToBottom()
      return
    }
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150
    if (nearBottom) scrollToBottom()
  }, [messages, streamingText, scrollToBottom])

  // SSE connection
  useEffect(() => {
    const es = new EventSource(`/api/skill-creator/stream?sessionId=${sessionId}`)
    eventSourceRef.current = es

    es.onopen = () => setIsConnected(true)

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'text') {
          setStreamingText(prev => prev + data.text)
          setIsProcessing(true)
        } else if (data.type === 'tool_start') {
          // Collect tool activity during streaming
          pendingToolsRef.current = [...pendingToolsRef.current, { name: data.name, input: {} }]
          setIsProcessing(true)
        } else if (data.type === 'assistant') {
          // Complete assistant message — finalize any streaming text and add tools
          setStreamingText(prev => {
            const finalText = data.text || prev
            const tools = data.tools || pendingToolsRef.current
            pendingToolsRef.current = []
            if (finalText.trim()) {
              setMessages(msgs => [...msgs, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: finalText,
                tools: tools.length > 0 ? tools : undefined,
                timestamp: Date.now(),
              }])
            }
            return ''
          })
        } else if (data.type === 'result') {
          // Turn complete — finalize any remaining streaming text
          setStreamingText(prev => {
            if (prev.trim()) {
              const tools = pendingToolsRef.current
              pendingToolsRef.current = []
              setMessages(msgs => [...msgs, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: prev,
                tools: tools.length > 0 ? tools : undefined,
                timestamp: Date.now(),
              }])
            }
            return ''
          })
          if (data.cost) setTotalCost(prev => prev + data.cost)
          setIsProcessing(false)
        } else if (data.type === 'error') {
          setError(data.message || 'An error occurred')
          setIsProcessing(false)
        } else if (data.type === 'draft_created') {
          setDraftName(data.name)
          setDraftFiles([])
          setPromoteStatus('idle')
        } else if (data.type === 'process_exit') {
          if (data.code !== 0) {
            setError(`Agent process exited with code ${data.code}`)
          }
          setIsProcessing(false)
        }
      } catch {
        // Skip unparseable events
      }
    }

    es.onerror = () => {
      setIsConnected(false)
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [sessionId])

  // File handling
  const addFiles = useCallback((files: File[]) => {
    const valid = files.filter(isAcceptedFile)
    if (valid.length === 0) return
    const newFiles = valid.map(file => ({
      file,
      preview: isImageFile(file) ? URL.createObjectURL(file) : '',
    }))
    setAttachedFiles(prev => [...prev, ...newFiles])
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
      e.target.value = ''
    }
  }, [addFiles])

  // Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file && isAcceptedFile(file)) files.push(file)
        }
      }
      if (files.length > 0) addFiles(files)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [addFiles])

  // Poll draft files when a draft is active
  useEffect(() => {
    if (!draftName) return
    let cancelled = false
    async function fetchFiles() {
      try {
        const res = await fetch(`/api/skill-creator/drafts/${draftName}/files`)
        const data = await res.json()
        if (!cancelled && data.ok) setDraftFiles(data.files)
      } catch {}
    }
    fetchFiles()
    const interval = setInterval(fetchFiles, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [draftName, isProcessing])

  // Promote draft
  const handlePromote = useCallback(async () => {
    const promoteName = selectedDraft || draftName
    if (!promoteName || isPromoting) return
    setIsPromoting(true)
    setPromoteStatus('idle')
    try {
      const res = await fetch('/api/skill-creator/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftName: promoteName }),
      })
      const data = await res.json()
      if (data.ok) {
        setPromoteStatus('success')
        setSkillsRefreshKey(k => k + 1)
      } else {
        setPromoteStatus('error')
        setError(data.error || 'Promote failed')
      }
    } catch {
      setPromoteStatus('error')
      setError('Failed to promote draft')
    }
    setIsPromoting(false)
  }, [selectedDraft, draftName, isPromoting])

  // Send message
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const value = inputRef.current?.value.trim()
    if ((!value && attachedFiles.length === 0) || isProcessing) return

    setError(null)

    // Upload files first if any
    let uploadedPaths: string[] = []
    if (attachedFiles.length > 0) {
      try {
        const fileData = await Promise.all(
          attachedFiles.map(async ({ file }) => ({
            name: file.name,
            data: await fileToBase64(file),
          }))
        )
        const uploadRes = await fetch('/api/skill-creator/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, files: fileData }),
        })
        const uploadResult = await uploadRes.json()
        if (uploadResult.ok) {
          uploadedPaths = uploadResult.paths
        }
      } catch (err) {
        setError('Failed to upload files')
        return
      }
    }

    // Build message text with file paths
    let messageText = value || ''
    if (uploadedPaths.length > 0) {
      const pathList = uploadedPaths.map(p => `Uploaded file: ${p}`).join('\n')
      messageText = messageText ? `${messageText}\n\n${pathList}` : pathList
    }

    // Add user message to display
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: value || (uploadedPaths.length > 0 ? `[${uploadedPaths.length} file${uploadedPaths.length > 1 ? 's' : ''} attached]` : ''),
      timestamp: Date.now(),
    }])

    // Clear input
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.style.height = 'auto'
    }
    setAttachedFiles(prev => {
      prev.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview) })
      return []
    })
    setIsProcessing(true)

    // Send to backend
    try {
      const res = await fetch('/api/skill-creator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, sessionId, draftName: selectedDraft || draftName || undefined }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to send message')
        setIsProcessing(false)
      }
    } catch {
      setError('Failed to connect to server')
      setIsProcessing(false)
    }
  }, [attachedFiles, isProcessing, sessionId, selectedDraft, draftName])

  // New session
  const handleNewSession = useCallback(async () => {
    // Kill existing session
    try {
      await fetch(`/api/skill-creator/session/${sessionId}`, { method: 'DELETE' })
    } catch { /* ignore */ }

    // Clean up
    eventSourceRef.current?.close()
    setMessages([])
    setStreamingText('')
    setTotalCost(0)
    setIsProcessing(false)
    setError(null)
    pendingToolsRef.current = []
    initialScrollDoneRef.current = false
    setAttachedFiles(prev => {
      prev.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview) })
      return []
    })
    setDraftName(null)
    setDraftFiles([])
    setPromoteStatus('idle')

    // New session
    setSessionId(crypto.randomUUID())
  }, [sessionId])

  // Create a new blank draft (skill or plugin) without starting a chat
  const handleNewDraft = useCallback(async (draftType: 'plugin' | 'skill') => {
    try {
      const res = await fetch('/api/skill-creator/new-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftType }),
      })
      const data = await res.json()
      if (data.ok) {
        setSkillsRefreshKey(k => k + 1)
        setSelectedDraft(data.name)
        setSelectedDraftType(draftType)
      } else {
        setError(data.error || 'Failed to create draft')
      }
    } catch {
      setError('Failed to create draft')
    }
  }, [])

  // When chat creates a draft, auto-select it
  useEffect(() => {
    if (draftName && !selectedDraft) {
      setSelectedDraft(draftName)
    }
  }, [draftName, selectedDraft])

  // Select a draft from sidebar — saves current messages, resets session, loads new draft's history
  const handleSelectDraft = useCallback(async (name: string) => {
    const currentDraft = selectedDraftRef.current
    const isDeselecting = currentDraft === name

    // Save current messages for the current draft
    if (currentDraft && messagesRef.current.length > 0) {
      draftMessagesRef.current.set(currentDraft, [...messagesRef.current])
    }

    // Reset file/panel state
    setSelectedFile(null)
    setFileContent(null)
    setFrontmatter(null)
    setPromoteStatus('idle')
    setFileSheetOpen(false)
    setFileEditing(false)
    setValidation(null)
    setValidationExpanded(false)
    setSelectedDraftType(null)
    setPluginMeta(null)

    if (isDeselecting) {
      setSelectedDraft(null)
      return
    }

    setSelectedDraft(name)

    // Reset chat state
    setStreamingText('')
    setIsProcessing(false)
    setError(null)
    pendingToolsRef.current = []
    initialScrollDoneRef.current = false

    // Kill existing session process
    try {
      await fetch(`/api/skill-creator/session/${sessionIdRef.current}`, { method: 'DELETE' })
    } catch { /* ignore */ }
    eventSourceRef.current?.close()

    // Load messages from in-memory cache or fetch from backend
    const cached = draftMessagesRef.current.get(name)
    if (cached && cached.length > 0) {
      setMessages(cached)
    } else {
      try {
        const res = await fetch(`/api/skill-creator/drafts/${name}/chat-history`)
        const data = await res.json()
        if (data.ok && data.messages.length > 0) {
          setMessages(data.messages.map((m: { role: string; content: string; tools?: { name: string; input: Record<string, unknown> }[]; timestamp: number }) => ({
            id: crypto.randomUUID(),
            ...m,
          })))
        } else {
          setMessages([])
        }
      } catch {
        setMessages([])
      }
    }

    // New SSE session for this draft
    setSessionId(crypto.randomUUID())
  }, [])

  // Fetch files for the selected draft
  useEffect(() => {
    const activeDraft = selectedDraft
    if (!activeDraft) {
      setSelectedDraftFiles([])
      setFrontmatter(null)
      setSelectedDraftType(null)
      setPluginMeta(null)
      return
    }
    let cancelled = false
    async function fetchFiles() {
      try {
        const res = await fetch(`/api/skill-creator/drafts/${activeDraft}/files`)
        const data = await res.json()
        if (!cancelled && data.ok) {
          setSelectedDraftFiles(data.files)

          // Detect type from file structure
          const hasPluginJson = data.files.some((f: { path: string }) => f.path === '.claude-plugin/plugin.json')
          const hasRootSkillMd = data.files.some((f: { path: string }) => f.path === 'SKILL.md')
          const detectedType = hasPluginJson ? 'plugin' : 'skill'
          if (!cancelled) setSelectedDraftType(detectedType)

          // For skill type: fetch root SKILL.md frontmatter
          // For plugin type: fetch SKILL.md from skills/ subdirectory
          if (hasRootSkillMd) {
            try {
              const skillRes = await fetch(`/api/skill-creator/drafts/${activeDraft}/file/SKILL.md`)
              const skillData = await skillRes.json()
              if (!cancelled && skillData.ok) {
                setFrontmatter(parseFrontmatter(skillData.content))
              }
            } catch {}
          } else {
            // Look for first SKILL.md in skills/ subdirectories
            const skillFile = data.files.find((f: { path: string }) => f.path.startsWith('skills/') && f.path.endsWith('/SKILL.md'))
            if (skillFile) {
              try {
                const skillRes = await fetch(`/api/skill-creator/drafts/${activeDraft}/file/${skillFile.path}`)
                const skillData = await skillRes.json()
                if (!cancelled && skillData.ok) {
                  setFrontmatter(parseFrontmatter(skillData.content))
                }
              } catch {}
            } else {
              if (!cancelled) setFrontmatter(null)
            }
          }

          // For plugin type: fetch plugin.json metadata
          if (hasPluginJson) {
            try {
              const pjRes = await fetch(`/api/skill-creator/drafts/${activeDraft}/file/.claude-plugin/plugin.json`)
              const pjData = await pjRes.json()
              if (!cancelled && pjData.ok) {
                const pj = JSON.parse(pjData.content)
                setPluginMeta({
                  name: pj.name || '',
                  version: pj.version || '',
                  description: pj.description || '',
                  author: typeof pj.author === 'string' ? pj.author : pj.author?.name || '',
                })
              }
            } catch {}
          } else {
            if (!cancelled) setPluginMeta(null)
          }
        }
      } catch {}
    }
    fetchFiles()
    const interval = setInterval(fetchFiles, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selectedDraft])

  // Fetch file content when a file is clicked — opens sliding tray
  const handleFileClick = useCallback(async (filePath: string) => {
    if (!selectedDraft) return
    setSelectedFile(filePath)
    setFileContent(null)
    setFileEditing(false)
    setFileSheetOpen(true)
    setFileLoading(true)
    try {
      const res = await fetch(`/api/skill-creator/drafts/${selectedDraft}/file/${filePath}`)
      const data = await res.json()
      if (data.ok && data.binary) setFileContent(`[Binary file — ${(data.size / 1024).toFixed(1)} KB]`)
      else if (data.ok) setFileContent(data.content)
      else setFileContent(`Error: ${data.error}`)
    } catch {
      setFileContent('Failed to load file')
    }
    setFileLoading(false)
  }, [selectedDraft])

  const closeFileSheet = useCallback(() => {
    setFileSheetOpen(false)
    setFileEditing(false)
  }, [])


  // Upload files to the selected draft
  const handleDraftUpload = useCallback(async (files: File[]) => {
    if (!selectedDraft || files.length === 0) return
    setDraftUploading(true)
    try {
      const fileData = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          data: await fileToBase64(file),
        }))
      )
      const res = await fetch(`/api/skill-creator/drafts/${selectedDraft}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileData }),
      })
      const result = await res.json()
      if (!result.ok) setError(result.error || 'Upload failed')
    } catch {
      setError('Failed to upload files to draft')
    }
    setDraftUploading(false)
  }, [selectedDraft])

  const handleDraftDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDraftDragging(false)
    handleDraftUpload(Array.from(e.dataTransfer.files))
  }, [handleDraftUpload])

  const handleDraftFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleDraftUpload(Array.from(e.target.files))
      e.target.value = ''
    }
  }, [handleDraftUpload])

  // Validate a draft
  const runValidation = useCallback(async (draft: string) => {
    setValidating(true)
    try {
      const res = await fetch(`/api/skill-creator/drafts/${draft}/validate`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setValidation({ valid: data.valid, errors: data.errors, warnings: data.warnings })
        if (!data.valid) setValidationExpanded(true)
      }
    } catch {
      // silently fail
    }
    setValidating(false)
  }, [])

  // Auto-validate when draft is selected
  useEffect(() => {
    if (selectedDraft) {
      runValidation(selectedDraft)
    } else {
      setValidation(null)
      setValidationExpanded(false)
    }
  }, [selectedDraft, runValidation])

  // Save plugin.json metadata
  const handlePluginMetaSave = useCallback(async () => {
    if (!selectedDraft || !pluginMeta) return
    setPluginMetaSaving(true)
    try {
      const readRes = await fetch(`/api/skill-creator/drafts/${selectedDraft}/file/.claude-plugin/plugin.json`)
      const readData = await readRes.json()
      if (readData.ok) {
        const pj = JSON.parse(readData.content)
        pj.version = pluginMeta.version
        pj.description = pluginMeta.description
        if (pluginMeta.author) {
          pj.author = typeof pj.author === 'object' ? { ...pj.author, name: pluginMeta.author } : pluginMeta.author
        }
        const saveRes = await fetch(`/api/skill-creator/drafts/${selectedDraft}/file/.claude-plugin/plugin.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: JSON.stringify(pj, null, 2) }),
        })
        const saveData = await saveRes.json()
        if (saveData.ok) {
          runValidation(selectedDraft)
        } else {
          setError(saveData.error || 'Save failed')
        }
      }
    } catch {
      setError('Failed to save plugin.json')
    }
    setPluginMetaSaving(false)
  }, [selectedDraft, pluginMeta, runValidation])

  // Re-validate after file save
  const handleFileSaveWithValidation = useCallback(async () => {
    if (!selectedDraft || !selectedFile) return
    setFileSaving(true)
    try {
      const res = await fetch(`/api/skill-creator/drafts/${selectedDraft}/file/${selectedFile}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fileDraft }),
      })
      const data = await res.json()
      if (data.ok) {
        setFileContent(fileDraft)
        setFileEditing(false)
        runValidation(selectedDraft)
      } else {
        setError(data.error || 'Save failed')
      }
    } catch {
      setError('Failed to save file')
    }
    setFileSaving(false)
  }, [selectedDraft, selectedFile, fileDraft, runValidation])

  // Memoize empty state check
  const isEmpty = messages.length === 0 && !streamingText

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header — full width */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-border-custom">
        <div className="flex items-center gap-3">
          <Wand2 className="h-5 w-5 text-sand" />
          <h1 className="font-heading text-xl text-parchment">Plugin Creator</h1>
        </div>
        <div className="flex items-center gap-3">
          {totalCost > 0 && (
            <span className="text-[11px] text-stone/60 font-mono">{formatCost(totalCost)}</span>
          )}
          <span className={`flex items-center gap-1 text-[10px] ${isConnected ? 'text-moss/70' : 'text-ember/60'}`}>
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          <button
            onClick={handleNewSession}
            className="px-3 py-1.5 rounded-lg text-xs text-stone hover:text-parchment hover:bg-surface/40 border border-border-custom transition-colors"
          >
            New Session
          </button>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left column — My Skills sidebar */}
        <MySkillsSidebar onNewDraft={handleNewDraft} refreshKey={skillsRefreshKey} selectedDraft={selectedDraft} onSelectDraft={handleSelectDraft} />

        {/* Center column — Chat */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Chat messages */}
          <div className="flex-1 min-h-0 flex flex-col p-4">
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto rounded-xl bg-ink/60 p-4 space-y-4 min-h-0"
            >
              {isEmpty ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    <Wand2 className="h-10 w-10 text-stone/25 mx-auto mb-3" />
                    <p className="text-sm text-stone/50 mb-1">Describe the plugin you want to create</p>
                    <p className="text-xs text-stone/35">
                      Upload reference files, paste examples, or just describe what you need.
                      The agent will scaffold, write, and validate the complete plugin.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map(msg => (
                    msg.role === 'user'
                      ? <UserBubble key={msg.id} msg={msg} />
                      : <AssistantBubble key={msg.id} msg={msg} />
                  ))}
                  {streamingText && <StreamingBubble text={streamingText} />}
                  {isProcessing && !streamingText && <TypingIndicator />}
                </>
              )}
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-ember/10 border border-ember/20 flex items-center justify-between">
              <span className="text-xs text-ember/80">{error}</span>
              <button onClick={() => setError(null)} className="text-ember/50 hover:text-ember/70">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Attached files indicator */}
          {attachedFiles.length > 0 && (
            <div className="mx-4 mb-2 flex flex-wrap gap-1.5">
              {attachedFiles.map((f, i) => (
                <div key={i} className="relative group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface/50 border border-border-custom">
                  {f.preview ? (
                    <img src={f.preview} alt={f.file.name} className="h-5 w-5 object-cover rounded" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-stone/50" />
                  )}
                  <span className="text-[11px] text-parchment/70 truncate max-w-[120px]">{f.file.name}</span>
                  <button
                    onClick={() => {
                      setAttachedFiles(prev => {
                        if (prev[i].preview) URL.revokeObjectURL(prev[i].preview)
                        return prev.filter((_, idx) => idx !== i)
                      })
                    }}
                    className="p-0.5 rounded text-stone/40 hover:text-parchment hover:bg-surface/80 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input area */}
          <form onSubmit={handleSubmit} className="px-4 pb-4 flex items-end gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 p-2.5 rounded-xl text-stone hover:text-parchment hover:bg-surface/40 transition-colors"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              ref={inputRef}
              rows={3}
              placeholder="Describe a plugin to create..."
              className="flex-1 bg-ink/80 border border-border-custom rounded-xl px-4 py-2.5 text-sm text-parchment placeholder:text-stone/45 focus:outline-none focus:border-stone/30 transition-colors resize-none overflow-y-auto max-h-32 no-scrollbar"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              onInput={(e) => {
                const target = e.currentTarget
                target.style.height = 'auto'
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`
              }}
            />
            <button
              type="submit"
              disabled={isProcessing}
              className="shrink-0 p-2.5 rounded-xl text-stone hover:text-parchment hover:bg-surface/40 transition-colors disabled:opacity-25"
              title={isProcessing ? 'Agent is working...' : 'Send message'}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>

        {/* Right column — Draft browser */}
        <div className="w-80 shrink-0 border-l border-border-custom bg-ink/40 flex flex-col">
          {/* Draft browser section */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-3 pt-3 pb-1.5">
              <h2 className="text-xs font-medium text-stone/60 uppercase tracking-wider">
                {selectedDraft ? selectedDraft : 'Draft Files'}
              </h2>
            </div>

            {!selectedDraft ? (
              <div className="flex-1 flex items-center justify-center px-4">
                <p className="text-xs text-stone/40 text-center">Select a draft from the sidebar to browse its files</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Plugin.json metadata card (plugin type only) */}
                {selectedDraftType === 'plugin' && pluginMeta && (
                  <div className="mx-3 mb-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Package className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-[10px] font-medium text-blue-400 uppercase tracking-wider">plugin.json</span>
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <label className="text-[10px] text-stone/50 block mb-0.5">Name</label>
                        <p className="text-xs text-parchment/60 font-mono bg-surface/20 rounded px-1.5 py-1">{pluginMeta.name}</p>
                      </div>
                      <div>
                        <label className="text-[10px] text-stone/50 block mb-0.5">Version</label>
                        <input
                          type="text"
                          value={pluginMeta.version}
                          onChange={e => setPluginMeta(prev => prev ? { ...prev, version: e.target.value } : prev)}
                          className="w-full text-xs text-parchment font-mono bg-surface/20 rounded px-1.5 py-1 border border-border-custom focus:outline-none focus:border-blue-500/40"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-stone/50 block mb-0.5">Description</label>
                        <textarea
                          value={pluginMeta.description}
                          onChange={e => setPluginMeta(prev => prev ? { ...prev, description: e.target.value } : prev)}
                          rows={2}
                          className="w-full text-xs text-parchment font-mono bg-surface/20 rounded px-1.5 py-1 border border-border-custom focus:outline-none focus:border-blue-500/40 resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-stone/50 block mb-0.5">Author <span className="text-stone/30">(optional)</span></label>
                        <input
                          type="text"
                          value={pluginMeta.author}
                          onChange={e => setPluginMeta(prev => prev ? { ...prev, author: e.target.value } : prev)}
                          className="w-full text-xs text-parchment font-mono bg-surface/20 rounded px-1.5 py-1 border border-border-custom focus:outline-none focus:border-blue-500/40"
                        />
                      </div>
                      <button
                        onClick={handlePluginMetaSave}
                        disabled={pluginMetaSaving}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                      >
                        <Save className="h-3 w-3" /> {pluginMetaSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Frontmatter card (skill type only) */}
                {selectedDraftType !== 'plugin' && frontmatter && (
                  <div className="mx-3 mb-2 p-2.5 rounded-lg bg-surface/30 border border-border-custom">
                    {!!frontmatter.name && (
                      <p className="text-sm font-medium text-parchment mb-1">{String(frontmatter.name)}</p>
                    )}
                    {!!frontmatter.description && (
                      <p className="text-xs text-stone/60 mb-1.5 line-clamp-3">{String(frontmatter.description).trim()}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {!!frontmatter.model && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-mono">{String(frontmatter.model)}</span>
                      )}
                      {Array.isArray(frontmatter.tools) && frontmatter.tools.map((t: string) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-mono">{t}</span>
                      ))}
                    </div>
                    {Object.entries(frontmatter).filter(([k]) => !['name', 'description', 'model', 'tools'].includes(k)).map(([key, val]) => (
                      <div key={key} className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-[10px] text-stone/50 font-mono shrink-0">{key}:</span>
                        <span className="text-[10px] text-parchment/70 font-mono truncate">
                          {Array.isArray(val)
                            ? val.some(v => typeof v === 'object' && v !== null)
                              ? <span className="text-stone/40">[...]</span>
                              : val.join(', ')
                            : typeof val === 'object' && val !== null
                              ? <span className="text-stone/40">{'{...'+'}'}</span>
                              : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Validation status */}
                <div className="mx-3 mb-2">
                  {validating ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface/30 border border-border-custom">
                      <Loader2 className="h-3.5 w-3.5 text-stone/50 animate-spin" />
                      <span className="text-xs text-stone/50">Validating...</span>
                    </div>
                  ) : validation ? (
                    <div className={`rounded-lg border ${validation.valid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                      <div className="flex items-center justify-between px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {validation.valid ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="text-xs font-medium text-emerald-400">Valid {selectedDraftType || 'plugin'}</span>
                            </>
                          ) : (
                            <button
                              onClick={() => setValidationExpanded(prev => !prev)}
                              className="flex items-center gap-1.5 cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5 text-red-400" />
                              <span className="text-xs font-medium text-red-400">
                                {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
                              </span>
                              {validation.warnings.length > 0 && (
                                <span className="text-xs text-amber-400">
                                  {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => selectedDraft && runValidation(selectedDraft)}
                          className="p-1 rounded text-stone/40 hover:text-parchment hover:bg-surface/40 transition-colors"
                          title="Re-validate"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      </div>
                      {!validation.valid && validationExpanded && (
                        <div className="px-2.5 pb-2 space-y-1">
                          {validation.errors.map((err, i) => (
                            <div key={`e-${i}`} className="flex items-start gap-1.5 text-[11px]">
                              <XCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                              <span className="text-red-300/80">
                                <span className="text-red-400/60 font-mono">{err.file}{err.field ? `: ${err.field}` : ''}</span>
                                {' — '}{err.message}
                              </span>
                            </div>
                          ))}
                          {validation.warnings.map((warn, i) => (
                            <div key={`w-${i}`} className="flex items-start gap-1.5 text-[11px]">
                              <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                              <span className="text-amber-300/80">
                                <span className="text-amber-400/60 font-mono">{warn.file}{warn.field ? `: ${warn.field}` : ''}</span>
                                {' — '}{warn.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {validation.valid && validation.warnings.length > 0 && (
                        <div className="px-2.5 pb-2 space-y-1">
                          {validation.warnings.map((warn, i) => (
                            <div key={`w-${i}`} className="flex items-start gap-1.5 text-[11px]">
                              <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                              <span className="text-amber-300/80">
                                <span className="text-amber-400/60 font-mono">{warn.file}{warn.field ? `: ${warn.field}` : ''}</span>
                                {' — '}{warn.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* File list */}
                <div className="flex-1 overflow-y-auto px-3 min-h-0">
                  {selectedDraftFiles.length === 0 ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 text-stone/40 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {selectedDraftFiles.map(f => {
                        const depth = f.path.split('/').length - 1
                        const name = f.path.split('/').pop() || f.path
                        const isDir = f.type === 'directory'
                        const isSelected = selectedFile === f.path
                        const IconComponent = isDir ? FolderOpen : name.endsWith('.json') ? Package : name.endsWith('.md') ? FileText : File
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
                                  : 'text-parchment/70 hover:bg-surface/40 cursor-pointer'
                            }`}
                            style={{ paddingLeft: `${depth * 12 + 6}px` }}
                          >
                            <IconComponent className={`h-3.5 w-3.5 shrink-0 ${isDir ? 'text-sand/50' : isSelected ? 'text-blue-300' : 'text-stone/50'}`} />
                            <span className="text-xs truncate">{name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Upload zone for draft */}
                <div className="shrink-0 px-3 pb-2 pt-1">
                  <input
                    ref={draftFileInputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    multiple
                    onChange={handleDraftFileSelect}
                    className="hidden"
                  />
                  <div
                    onDragEnter={(e) => { e.preventDefault(); setIsDraftDragging(true) }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={(e) => { e.preventDefault(); setIsDraftDragging(false) }}
                    onDrop={handleDraftDrop}
                    onClick={() => draftFileInputRef.current?.click()}
                    className={`p-2 border-2 border-dashed rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      isDraftDragging ? 'border-blue-500/50 bg-blue-500/5' : 'border-border-custom hover:border-stone/30'
                    }`}
                  >
                    {draftUploading ? (
                      <Loader2 className="h-3 w-3 text-stone/40 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3 text-stone/40" />
                    )}
                    <span className="text-[11px] text-stone/50">
                      {draftUploading ? 'Uploading...' : 'Drop files here or click to upload'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Promote button */}
            <div className="px-3 pb-3 pt-1 shrink-0">
              <button
                onClick={handlePromote}
                disabled={!selectedDraft || selectedDraftFiles.length === 0 || isPromoting || promoteStatus === 'success'}
                className={`w-full px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  promoteStatus === 'success'
                    ? 'bg-moss/20 text-moss border border-moss/30'
                    : 'bg-surface/60 text-parchment hover:bg-surface/80 border border-border-custom disabled:opacity-30 disabled:cursor-not-allowed'
                }`}
              >
                {isPromoting ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Promoting...</>
                ) : promoteStatus === 'success' ? (
                  <><Check className="h-3.5 w-3.5" /> Promoted!</>
                ) : (
                  'Promote to Installed'
                )}
              </button>
            </div>
          </div>

          {/* Skill Tester */}
          <SkillTester />
        </div>
      </div>

      {/* File viewer Sheet */}
      {selectedFile && (
        <Sheet open={fileSheetOpen} onOpenChange={v => { if (!v) closeFileSheet() }}>
          <SheetHeader>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <File className="h-4 w-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-parchment truncate">{selectedFile}</h3>
                {selectedDraft && (
                  <p className="text-xs text-stone/50">{selectedDraft}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!fileEditing && fileContent && !fileContent.startsWith('[Binary file') && (
                <button
                  onClick={() => { setFileDraft(fileContent || ''); setFileEditing(true) }}
                  className="p-1.5 rounded-md text-stone/50 hover:text-sand hover:bg-sand/10 transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={closeFileSheet}
                className="p-1.5 rounded-md text-stone/50 hover:text-parchment hover:bg-surface/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>
          <SheetBody className="flex flex-col h-[calc(100vh-65px)]">
            {fileLoading ? (
              <div className="space-y-3 py-4">
                <div className="h-4 w-3/4 rounded bg-surface/50 animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-surface/50 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-surface/50 animate-pulse" />
              </div>
            ) : fileEditing ? (
              <div className="flex flex-col flex-1">
                <textarea
                  value={fileDraft}
                  onChange={e => setFileDraft(e.target.value)}
                  className="flex-1 bg-ink/50 text-parchment/90 text-sm font-mono rounded-lg border border-border-custom p-3 resize-none focus:outline-none focus:border-sand/50"
                />
                <div className="flex items-center gap-2 mt-3 shrink-0">
                  <button
                    onClick={handleFileSaveWithValidation}
                    disabled={fileSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors disabled:opacity-50"
                  >
                    <Save className="h-3 w-3" /> {fileSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setFileEditing(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone hover:text-parchment transition-colors"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <pre className="text-sm text-parchment/80 font-mono whitespace-pre-wrap break-words">{fileContent}</pre>
            )}
          </SheetBody>
        </Sheet>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Preview" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}
