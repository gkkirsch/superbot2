import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, Paperclip, FileText, Wand2, Wifi, WifiOff, Loader2, Plus, FolderOpen, Check, Upload, File, Package, Save, Pencil, AlertTriangle, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronLeft, ChevronRight, FlaskConical, Play, Square, MessageSquare, Wrench } from 'lucide-react'
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

function MySkillsSidebar({ onNewDraft, refreshKey, selectedSkill, onSelectSkill }: {
  onNewDraft: (type: 'plugin' | 'skill') => void
  refreshKey: number
  selectedSkill: TesterSkill | null
  onSelectSkill: (skill: TesterSkill) => void
}) {
  const [activeTab, setActiveTab] = useState<'drafts' | 'active'>('drafts')
  const [skills, setSkills] = useState<TesterSkill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchSkills() {
      setLoading(true)
      try {
        const res = await fetch(`/api/skill-tester/skills?source=${activeTab}`)
        const data = await res.json()
        if (!cancelled && data.ok) setSkills(data.skills)
      } catch {}
      if (!cancelled) setLoading(false)
    }
    fetchSkills()
    const interval = setInterval(fetchSkills, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [activeTab, refreshKey])

  return (
    <div className="w-60 shrink-0 border-r border-border-custom bg-ink/40 flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-medium text-stone/60 uppercase tracking-wider">My Skills</h2>
      </div>

      {/* Drafts / Active tabs */}
      <div className="flex gap-1 px-3 pb-2">
        {(['drafts', 'active'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'bg-sand/15 text-sand border border-sand/30'
                : 'text-stone/60 hover:text-stone hover:bg-ink/80 border border-transparent'
            }`}
          >
            {tab === 'drafts' ? 'Drafts' : 'Active'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 text-stone/40 animate-spin" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-center px-2">
            <p className="text-xs text-stone/40">
              {activeTab === 'drafts' ? 'No drafts yet — create your first one!' : 'No active skills installed'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {skills.map(skill => {
              const isSelected = selectedSkill?.id === skill.id && selectedSkill?.source === skill.source
              return (
                <button
                  key={skill.id}
                  onClick={() => onSelectSkill(skill)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500/15 border border-blue-500/30'
                      : 'hover:bg-surface/40 border border-transparent'
                  }`}
                >
                  <p className={`text-sm truncate ${isSelected ? 'text-blue-300' : 'text-parchment'}`}>{skill.name}</p>
                  {skill.description && (
                    <p className="text-xs text-stone/60 mt-0.5 line-clamp-2">{skill.description}</p>
                  )}
                </button>
              )
            })}
          </div>
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
  source: 'drafts' | 'active'
}

interface SkillFileEntry {
  path: string
  content: string
}

function SkillFileViewer({ skill }: { skill: TesterSkill }) {
  const [files, setFiles] = useState<SkillFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchFiles() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/skill-tester/skill-files?name=${encodeURIComponent(skill.id)}&source=${skill.source}`)
        const data = await res.json()
        if (!cancelled) {
          if (data.error) {
            setError(data.error)
          } else {
            setFiles(data.files || [])
            setActiveFile(data.files?.[0]?.path || null)
          }
        }
      } catch {
        if (!cancelled) setError('Failed to load skill files')
      }
      if (!cancelled) setLoading(false)
    }
    fetchFiles()
    return () => { cancelled = true }
  }, [skill.id, skill.source])

  const activeContent = files.find(f => f.path === activeFile)?.content || ''

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-stone/40 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-ember/70">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* Skill name + source badge */}
      <div className="px-5 py-3 border-b border-border-custom flex items-center gap-3 shrink-0">
        <h2 className="text-sm font-medium text-parchment">{skill.name}</h2>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
          skill.source === 'active'
            ? 'bg-moss/15 text-moss border border-moss/30'
            : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
        }`}>
          {skill.source === 'active' ? 'Active' : 'Draft'}
        </span>
      </div>

      {/* File tabs */}
      <div className="flex overflow-x-auto border-b border-border-custom shrink-0 bg-ink/30 px-2 no-scrollbar">
        {files.map(f => (
          <button
            key={f.path}
            onClick={() => setActiveFile(f.path)}
            className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors ${
              activeFile === f.path
                ? 'border-sand text-parchment'
                : 'border-transparent text-stone/60 hover:text-stone hover:border-stone/30'
            }`}
          >
            {f.path}
          </button>
        ))}
      </div>

      {/* File content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <pre className="text-sm text-parchment/80 font-mono whitespace-pre-wrap break-words bg-ink/80 rounded-lg border border-border-custom p-4 min-h-full">
          <code>{activeContent}</code>
        </pre>
      </div>
    </div>
  )
}

// --- Skill Chat (AI assistant via claude -p) ---

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

function SkillChat({ selectedSkill }: { selectedSkill: TesterSkill | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [showRefresh, setShowRefresh] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll on new messages / streaming
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    setStreamText('')
    setShowRefresh(false)

    const controller = new AbortController()
    abortRef.current = controller

    // Build history (last 20 messages for context window)
    const historyMsgs = [...messages, userMsg].slice(-20).map(m => ({ role: m.role, content: m.content }))

    try {
      const response = await fetch('/api/skill-creator/chat-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          skillName: selectedSkill?.id,
          source: selectedSkill?.source,
          history: historyMsgs.slice(0, -1), // exclude current message (it's the `message` param)
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        setStreaming(false)
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Failed to connect to chat backend.' }])
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

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
              accumulated += data.text
              setStreamText(accumulated)
            } else if (data.type === 'done') {
              // Finalize
            } else if (data.type === 'error') {
              accumulated += '\n\n---\nError: ' + data.message
              setStreamText(accumulated)
            }
          } catch {}
        }
      }

      // Finalize the assistant message
      if (accumulated.trim()) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: accumulated }])
        // Check if assistant likely created/modified files
        const lower = accumulated.toLowerCase()
        if (lower.includes('created') || lower.includes('wrote') || lower.includes('saved') || lower.includes('updated') || lower.includes('modified') || lower.includes('skill.md')) {
          setShowRefresh(true)
        }
      }
      setStreamText('')
      setStreaming(false)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Connection error.' }])
      }
      setStreamText('')
      setStreaming(false)
    }
  }, [input, streaming, messages, selectedSkill])

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort()
    if (streamText.trim()) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: streamText + '\n\n*(stopped)*' }])
    }
    setStreamText('')
    setStreaming(false)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !streaming ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <MessageSquare className="h-8 w-8 text-stone/20 mx-auto mb-2" />
              <p className="text-sm text-stone/50 mb-1">Chat with AI to create skills</p>
              <p className="text-xs text-stone/35">
                {selectedSkill
                  ? `Context: ${selectedSkill.name} (${selectedSkill.source})`
                  : 'Select a skill for context, or start fresh'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 overflow-hidden ${
                  msg.role === 'user'
                    ? 'rounded-br-md bg-[rgba(180,160,120,0.15)]'
                    : 'rounded-bl-md bg-[rgba(120,140,160,0.12)]'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{msg.content}</p>
                  ) : (
                    <MarkdownContent content={msg.content} className="text-parchment/80" />
                  )}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden">
                  {streamText ? (
                    <>
                      <MarkdownContent content={streamText} className="text-parchment/80" />
                      <span className="inline-block w-1.5 h-4 bg-sand/50 animate-pulse ml-0.5 align-text-bottom" />
                    </>
                  ) : (
                    <div className="flex gap-1.5 items-center py-1">
                      <span className="text-xs text-stone/50">Thinking...</span>
                      <Loader2 className="h-3 w-3 text-stone/40 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            )}
            {showRefresh && !streaming && (
              <div className="flex justify-center">
                <button
                  onClick={() => { setShowRefresh(false); window.dispatchEvent(new CustomEvent('skill-files-refresh')) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" /> Refresh files
                </button>
              </div>
            )}
          </>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border-custom">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about skill creation..."
            rows={2}
            className="flex-1 bg-ink/80 border border-border-custom rounded-xl px-4 py-2.5 text-sm text-parchment placeholder:text-stone/45 focus:outline-none focus:border-stone/30 transition-colors resize-none overflow-y-auto max-h-32 no-scrollbar"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSend()
              }
            }}
            onInput={e => {
              const target = e.currentTarget
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`
            }}
          />
          {streaming ? (
            <button
              onClick={handleStop}
              className="shrink-0 p-2.5 rounded-xl text-ember hover:bg-ember/10 transition-colors"
              title="Stop"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 p-2.5 rounded-xl text-stone hover:text-parchment hover:bg-surface/40 transition-colors disabled:opacity-25"
              title="Send (Cmd+Enter)"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-stone/30 mt-1.5 ml-1">Cmd+Enter to send</p>
      </div>
    </div>
  )
}

type OutputSegment =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; tool: string; input: string }
  | { type: 'tool_result'; tool: string; success: boolean }

function SkillTester({ selectedSkill }: { selectedSkill: TesterSkill | null }) {
  const [prompt, setPrompt] = useState('')
  const [segments, setSegments] = useState<OutputSegment[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [skillStatus, setSkillStatus] = useState<{ status: string; skillName?: string; message?: string; path?: string } | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [segments])

  const handleRun = async () => {
    if (!selectedSkill || !prompt.trim() || status === 'running') return

    setSegments([])
    setStatus('running')
    setSkillStatus(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/skill-tester/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName: selectedSkill.id, prompt: prompt.trim(), source: selectedSkill.source }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        setStatus('error')
        setSegments([{ type: 'text', text: 'Failed to connect to skill tester' }])
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
            if (data.type === 'skill_status') {
              setSkillStatus(data)
            } else if (data.type === 'chunk') {
              // Append text to last text segment, or create new one
              setSegments(prev => {
                const last = prev[prev.length - 1]
                if (last && last.type === 'text') {
                  return [...prev.slice(0, -1), { type: 'text', text: last.text + data.text }]
                }
                return [...prev, { type: 'text', text: data.text }]
              })
            } else if (data.type === 'tool_call') {
              setSegments(prev => [...prev, { type: 'tool_call', tool: data.tool, input: data.input }])
            } else if (data.type === 'tool_result') {
              setSegments(prev => [...prev, { type: 'tool_result', tool: data.tool, success: data.success }])
            } else if (data.type === 'done') {
              setStatus('done')
            } else if (data.type === 'error') {
              setStatus('error')
              setSegments(prev => [...prev, { type: 'text', text: '\n\n--- Error ---\n' + data.message }])
            }
          } catch {}
        }
      }

      // If stream ended without a 'done' event
      setStatus(prev => prev === 'running' ? 'done' : prev)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus('error')
        setSegments(prev => [...prev, { type: 'text', text: '\n\nConnection error' }])
      }
    }
  }

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort()
    setStatus('done')
  }

  const handleClear = () => {
    if (abortRef.current) abortRef.current.abort()
    setSegments([])
    setSkillStatus(null)
    setStatus('idle')
  }

  const hasOutput = segments.length > 0

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      {/* Selected skill indicator */}
      <div className="shrink-0 px-1">
        {selectedSkill ? (
          <p className="text-xs text-stone/70">
            Testing: <span className="text-parchment font-medium">{selectedSkill.name}</span>
            <span className="text-stone/40 ml-1.5">({selectedSkill.source})</span>
          </p>
        ) : (
          <p className="text-xs text-stone/40">Select a skill from the sidebar to test</p>
        )}
      </div>

      {/* Prompt input */}
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Ask the skill something..."
        rows={4}
        className="w-full text-sm bg-ink/50 text-parchment border border-border-custom rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-sand/50 placeholder:text-stone/30 shrink-0"
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun()
        }}
      />

      {/* Actions row */}
      <div className="flex items-center gap-2 shrink-0">
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
        {hasOutput && (
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
      <div
        ref={outputRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-lg bg-ink/80 border border-border-custom p-3 text-sm text-parchment/80 font-mono whitespace-pre-wrap break-words"
      >
        {hasOutput || skillStatus || status === 'running' ? (
          <>
            {/* Skill load status — compact line at top */}
            {status === 'running' && !skillStatus && (
              <div className="text-[10px] text-stone/40 mb-1.5 flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                <span>loading...</span>
              </div>
            )}
            {skillStatus?.status === 'loaded' && (
              <div className="text-[10px] text-moss/50 mb-1.5 flex items-center gap-1">
                <Check className="h-2.5 w-2.5" />
                <span>{skillStatus.skillName} loaded</span>
              </div>
            )}
            {skillStatus?.status === 'not_found' && (
              <div className="text-[10px] text-ember/60 mb-1.5 flex items-center gap-1">
                <XCircle className="h-2.5 w-2.5" />
                <span>not found: {skillStatus.message?.split(': ')[1]}</span>
              </div>
            )}
            {skillStatus?.status === 'no_skill_md' && (
              <div className="text-[10px] text-sand/50 mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-2.5 w-2.5" />
                <span>SKILL.md missing</span>
              </div>
            )}
            {skillStatus?.status === 'not_loaded' && (
              <div className="text-[10px] text-ember/60 mb-1.5 flex items-center gap-1">
                <XCircle className="h-2.5 w-2.5" />
                <span>skill not loaded</span>
              </div>
            )}
            {/* Output segments — text chunks interleaved with tool call annotations */}
            {segments.map((seg, i) => {
              if (seg.type === 'text') {
                return <span key={i}>{seg.text}</span>
              }
              if (seg.type === 'tool_call') {
                return (
                  <div key={i} className="my-1.5 pl-2 border-l-2 border-sand/20 text-[11px] text-sand/60 font-mono flex items-start gap-1.5">
                    <Wrench className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{seg.tool}(<span className="text-sand/40">{seg.input}</span>)</span>
                  </div>
                )
              }
              if (seg.type === 'tool_result') {
                return (
                  <div key={i} className="my-1 pl-2 border-l-2 border-sand/20 text-[10px] font-mono flex items-center gap-1.5">
                    {seg.success ? (
                      <span className="text-moss/50"><Check className="h-2.5 w-2.5 inline mr-0.5" />{seg.tool} done</span>
                    ) : (
                      <span className="text-ember/50"><XCircle className="h-2.5 w-2.5 inline mr-0.5" />{seg.tool} failed</span>
                    )}
                  </div>
                )
              }
              return null
            })}
            {status === 'running' && (
              <span className="inline-block w-1.5 h-3.5 bg-sand/50 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FlaskConical className="h-8 w-8 text-stone/20 mx-auto mb-2" />
              {selectedSkill ? (
                <>
                  <p className="text-xs text-stone/40">Enter a prompt to test {selectedSkill.name}</p>
                  <p className="text-[10px] text-stone/30 mt-1">Ctrl+Enter to run</p>
                </>
              ) : (
                <p className="text-xs text-stone/40">Select a skill from the sidebar to test</p>
              )}
            </div>
          </div>
        )}
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
  const [selectedSkill, setSelectedSkill] = useState<TesterSkill | null>(null)
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
  const [activePanel, setActivePanel] = useState<'chat' | 'files' | 'test'>('chat')
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
  const selectedSkillRef = useRef(selectedSkill)
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
  useEffect(() => { selectedSkillRef.current = selectedSkill }, [selectedSkill])
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
        setSelectedSkill({ id: data.name, name: data.name, description: '', source: 'drafts' })
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
      if (!selectedSkill) {
        setSelectedSkill({ id: draftName, name: draftName, description: '', source: 'drafts' })
      }
    }
  }, [draftName, selectedDraft, selectedSkill])

  // Select a skill from the sidebar — handles both drafts and active skills
  const handleSelectSkill = useCallback(async (skill: TesterSkill) => {
    const currentSkill = selectedSkillRef.current
    const isDeselecting = currentSkill?.id === skill.id && currentSkill?.source === skill.source

    // Save current draft messages
    const currentDraft = selectedDraftRef.current
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
      setSelectedSkill(null)
      setSelectedDraft(null)
      return
    }

    setSelectedSkill(skill)

    if (skill.source === 'drafts') {
      setSelectedDraft(skill.id)

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
      const cached = draftMessagesRef.current.get(skill.id)
      if (cached && cached.length > 0) {
        setMessages(cached)
      } else {
        try {
          const res = await fetch(`/api/skill-creator/drafts/${skill.id}/chat-history`)
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
    } else {
      // Active skill — clear draft state
      setSelectedDraft(null)
    }
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

      {/* Accordion layout — 3 panels: Chat, Files, Test */}
      <div className="flex-1 flex min-h-0">
        {/* Left column — My Skills sidebar */}
        <MySkillsSidebar onNewDraft={handleNewDraft} refreshKey={skillsRefreshKey} selectedSkill={selectedSkill} onSelectSkill={handleSelectSkill} />

        {/* Chat panel */}
        <div className={`transition-all duration-300 overflow-hidden ${activePanel === 'chat' ? 'flex-1 flex flex-col min-w-0' : 'w-12 shrink-0'}`}>
          {activePanel === 'chat' ? (
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border-custom shrink-0">
                <MessageSquare className="h-4 w-4 text-sand" />
                <h2 className="text-sm font-medium text-parchment">Chat</h2>
                {selectedSkill && (
                  <span className="text-xs text-stone/50 ml-1">
                    — {selectedSkill.name}
                  </span>
                )}
              </div>
              <SkillChat selectedSkill={selectedSkill} />
            </div>
          ) : (
            <button
              onClick={() => setActivePanel('chat')}
              className="w-12 h-full border-r border-border-custom bg-ink/40 flex flex-col items-center justify-center gap-3 hover:bg-surface/30 transition-colors cursor-pointer group"
            >
              <MessageSquare className="h-3.5 w-3.5 text-stone/40 group-hover:text-sand transition-colors" />
              <span className="text-[10px] text-stone/50 uppercase tracking-wider group-hover:text-parchment transition-colors" style={{ writingMode: 'vertical-lr' }}>Chat</span>
              <ChevronRight className="h-4 w-4 text-stone/40 group-hover:text-parchment transition-colors" />
            </button>
          )}
        </div>

        {/* Files panel */}
        <div className={`transition-all duration-300 overflow-hidden border-l border-border-custom ${activePanel === 'files' ? 'flex-1 flex min-w-0' : 'w-12 shrink-0'}`}>
          {activePanel === 'files' ? (
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border-custom shrink-0">
                <FileText className="h-4 w-4 text-sand" />
                <h2 className="text-sm font-medium text-parchment">Files</h2>
              </div>
              {selectedSkill ? (
                <SkillFileViewer skill={selectedSkill} />
              ) : (
                <div className="flex-1 flex items-center justify-center px-4">
                  <div className="text-center">
                    <FileText className="h-8 w-8 text-stone/20 mx-auto mb-2" />
                    <p className="text-xs text-stone/40">Select a skill from the sidebar to view its files</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setActivePanel('files')}
              className="w-12 h-full bg-ink/40 flex flex-col items-center justify-center gap-3 hover:bg-surface/30 transition-colors cursor-pointer group"
            >
              <FileText className="h-3.5 w-3.5 text-stone/40 group-hover:text-sand transition-colors" />
              <span className="text-[10px] text-stone/50 uppercase tracking-wider group-hover:text-parchment transition-colors" style={{ writingMode: 'vertical-lr' }}>Files</span>
              <ChevronLeft className="h-4 w-4 text-stone/40 group-hover:text-parchment transition-colors" />
            </button>
          )}
        </div>

        {/* Test panel */}
        <div className={`transition-all duration-300 overflow-hidden border-l border-border-custom ${activePanel === 'test' ? 'flex-1' : 'w-12 shrink-0'}`}>
          {activePanel === 'test' ? (
            <div className="flex flex-col h-full min-w-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border-custom shrink-0">
                <Play className="h-4 w-4 text-sand" />
                <h2 className="text-sm font-medium text-parchment">Test</h2>
              </div>
              <SkillTester selectedSkill={selectedSkill} />
            </div>
          ) : (
            <button
              onClick={() => setActivePanel('test')}
              className="w-12 h-full bg-ink/40 flex flex-col items-center justify-center gap-3 hover:bg-surface/30 transition-colors cursor-pointer group"
            >
              <Play className="h-3.5 w-3.5 text-stone/40 group-hover:text-sand transition-colors" />
              <span className="text-[10px] text-stone/50 uppercase tracking-wider group-hover:text-parchment transition-colors" style={{ writingMode: 'vertical-lr' }}>Test</span>
              <ChevronLeft className="h-4 w-4 text-stone/40 group-hover:text-parchment transition-colors" />
            </button>
          )}
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
