import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, Paperclip, FileText, Wand2, Wifi, WifiOff, Loader2, Plus, FolderOpen, Check, Upload, File, Package } from 'lucide-react'
import { MarkdownContent } from '@/features/MarkdownContent'

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
  const lines = match[1].split('\n')
  const result: Record<string, unknown> = {}
  let currentKey = ''
  let currentList: string[] | null = null
  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w.-]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      if (currentKey && currentList) {
        result[currentKey] = currentList
        currentList = null
      }
      const [, key, value] = kvMatch
      if (value.trim() === '') {
        currentKey = key
        currentList = []
      } else {
        result[key] = value.trim()
        currentKey = key
      }
    } else if (currentList !== null) {
      const itemMatch = line.match(/^\s+-\s+(.*)$/)
      if (itemMatch) {
        currentList.push(itemMatch[1].trim())
      }
    }
  }
  if (currentKey && currentList) {
    result[currentKey] = currentList
  }
  return Object.keys(result).length > 0 ? result : null
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
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">skill creator</span>
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
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">skill creator</span>
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
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">skill creator</span>
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
  sessionId: string
  createdAt: string
  status: string
}

function MySkillsSidebar({ onNewSkill, refreshKey, selectedDraft, onSelectDraft }: {
  onNewSkill: () => void
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
        <h2 className="text-xs font-medium text-stone/60 uppercase tracking-wider">My Skills</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 text-stone/40 animate-spin" />
          </div>
        ) : !hasContent ? (
          <div className="flex items-center justify-center py-8 text-center px-2">
            <p className="text-xs text-stone/40">No skills yet — create your first one!</p>
          </div>
        ) : (
          <>
            {drafts.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-medium text-stone/40 uppercase tracking-wider px-3 mb-1">Drafts</p>
                <div className="space-y-0.5">
                  {drafts.map(draft => {
                    const isSelected = selectedDraft === draft.name
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
                          <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">draft</span>
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
        <button
          onClick={onNewSkill}
          className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-border-custom text-stone/50 hover:text-parchment hover:border-stone/30 transition-colors flex items-center justify-center gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          New Skill
        </button>
      </div>
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
  const [isDragging, setIsDragging] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [, setDraftFiles] = useState<{ path: string; type: string }[]>([])
  const [isPromoting, setIsPromoting] = useState(false)
  const [promoteStatus, setPromoteStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null)
  const [selectedDraftFiles, setSelectedDraftFiles] = useState<{ path: string; type: string }[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [frontmatter, setFrontmatter] = useState<Record<string, unknown> | null>(null)
  const [isDraftDragging, setIsDraftDragging] = useState(false)
  const [draftUploading, setDraftUploading] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftFileInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const dragCounterRef = useRef(0)
  const initialScrollDoneRef = useRef(false)
  const pendingToolsRef = useRef<{ name: string; input: Record<string, unknown> }[]>([])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
  }, [])

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

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => {
      if (prev[index].preview) URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  // Drag-and-drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

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
        body: JSON.stringify({ message: messageText, sessionId }),
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
  }, [attachedFiles, isProcessing, sessionId])

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

  // When chat creates a draft, auto-select it
  useEffect(() => {
    if (draftName && !selectedDraft) {
      setSelectedDraft(draftName)
    }
  }, [draftName, selectedDraft])

  // Select a draft from sidebar
  const handleSelectDraft = useCallback((name: string) => {
    setSelectedDraft(prev => prev === name ? null : name)
    setSelectedFile(null)
    setFileContent(null)
    setFrontmatter(null)
    setPromoteStatus('idle')
  }, [])

  // Fetch files for the selected draft
  useEffect(() => {
    const activeDraft = selectedDraft
    if (!activeDraft) {
      setSelectedDraftFiles([])
      setFrontmatter(null)
      return
    }
    let cancelled = false
    async function fetchFiles() {
      try {
        const res = await fetch(`/api/skill-creator/drafts/${activeDraft}/files`)
        const data = await res.json()
        if (!cancelled && data.ok) {
          setSelectedDraftFiles(data.files)
          // Auto-fetch SKILL.md frontmatter if it exists
          const hasSkillMd = data.files.some((f: { path: string }) => f.path === 'SKILL.md')
          if (hasSkillMd) {
            try {
              const skillRes = await fetch(`/api/skill-creator/drafts/${activeDraft}/file/SKILL.md`)
              const skillData = await skillRes.json()
              if (!cancelled && skillData.ok) {
                const fm = parseFrontmatter(skillData.content)
                setFrontmatter(fm)
              }
            } catch {}
          } else {
            if (!cancelled) setFrontmatter(null)
          }
        }
      } catch {}
    }
    fetchFiles()
    const interval = setInterval(fetchFiles, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selectedDraft])

  // Fetch file content when a file is clicked
  const handleFileClick = useCallback(async (filePath: string) => {
    if (!selectedDraft) return
    if (selectedFile === filePath) {
      setSelectedFile(null)
      setFileContent(null)
      return
    }
    setSelectedFile(filePath)
    setFileContent(null)
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
  }, [selectedDraft, selectedFile])

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

  // Memoize empty state check
  const isEmpty = messages.length === 0 && !streamingText

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header — full width */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-border-custom">
        <div className="flex items-center gap-3">
          <Wand2 className="h-5 w-5 text-sand" />
          <h1 className="font-heading text-xl text-parchment">Skill Creator</h1>
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
            New Plugin
          </button>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left column — My Skills sidebar */}
        <MySkillsSidebar onNewSkill={handleNewSession} refreshKey={skillsRefreshKey} selectedDraft={selectedDraft} onSelectDraft={handleSelectDraft} />

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

        {/* Right column — Draft browser + Chat attachments */}
        <div className="w-80 shrink-0 border-l border-border-custom bg-ink/40 flex flex-col">
          {/* Chat attachment drop zone */}
          <div
            className="shrink-0"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className={`m-3 mb-1 p-2.5 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 transition-colors ${
              isDragging ? 'border-sand/50 bg-sand/5' : 'border-border-custom'
            }`}>
              <Upload className="h-3.5 w-3.5 text-stone/40" />
              <p className="text-[11px] text-stone/50">
                {isDragging ? 'Drop to attach to chat' : 'Drop files to attach to chat'}
              </p>
            </div>
            {attachedFiles.length > 0 && (
              <div className="mx-3 mb-1 flex flex-wrap gap-1.5">
                {attachedFiles.map((f, i) => (
                  <div key={i} className="relative group">
                    {f.preview ? (
                      <button onClick={() => setLightboxSrc(f.preview)}>
                        <img src={f.preview} alt={f.file.name} className="h-8 w-8 object-cover rounded border border-border-custom" />
                      </button>
                    ) : (
                      <div className="h-8 w-8 flex items-center justify-center rounded border border-border-custom bg-ink/40">
                        <FileText className="h-3 w-3 text-stone/60" />
                      </div>
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute -top-1 -right-1 bg-ink border border-border-custom rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2 w-2 text-stone/70" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border-custom mx-3" />

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
                {/* Frontmatter card */}
                {frontmatter && (
                  <div className="mx-3 mb-2 p-2.5 rounded-lg bg-surface/30 border border-border-custom">
                    {!!frontmatter.name && (
                      <p className="text-sm font-medium text-parchment mb-1">{String(frontmatter.name)}</p>
                    )}
                    {!!frontmatter.description && (
                      <p className="text-xs text-stone/60 mb-1.5">{String(frontmatter.description)}</p>
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
                          {Array.isArray(val) ? val.join(', ') : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

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

                {/* File content viewer */}
                {selectedFile && (
                  <div className="border-t border-border-custom mx-3 mt-1" />
                )}
                {selectedFile && (
                  <div className="shrink-0 max-h-[40%] overflow-y-auto px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-stone/50 font-mono truncate">{selectedFile}</span>
                      <button onClick={() => { setSelectedFile(null); setFileContent(null) }} className="text-stone/40 hover:text-stone/60">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {fileLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-3.5 w-3.5 text-stone/40 animate-spin" />
                      </div>
                    ) : (
                      <pre className="text-[11px] text-parchment/70 font-mono whitespace-pre-wrap break-words bg-ink/60 rounded p-2 max-h-60 overflow-y-auto">
                        {fileContent}
                      </pre>
                    )}
                  </div>
                )}

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
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Preview" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}
