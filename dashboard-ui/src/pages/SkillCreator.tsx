import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, FileText, Wand2, Wifi, WifiOff, Loader2, Plus, Upload, Package, Save, RefreshCw, ChevronDown, ChevronRight, FlaskConical, Play, Square, MessageSquare, Trash2, Terminal, Globe, FolderOpen } from 'lucide-react'
import { MarkdownContent } from '@/features/MarkdownContent'
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

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_FILE_TYPES.includes(file.type)) return true
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.md', '.json', '.yaml', '.yml', '.js', '.ts', '.py', '.sh'].includes(ext)
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
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
    Skill: 'Skill invoked',
  }
  return map[name] || name
}

function ToolIndicator({ tools }: { tools: { name: string; input: Record<string, unknown> }[] }) {
  if (tools.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {tools.map((tool, i) => {
        const isSkill = tool.name === 'Skill'
        const detail = isSkill
          ? (tool.input?.skill || '')
          : (tool.input?.file_path || tool.input?.pattern || tool.input?.command || '')
        const shortDetail = typeof detail === 'string' && detail.length > 60
          ? '...' + detail.slice(-57)
          : detail
        if (isSkill) {
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-xs font-medium text-emerald-300"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              <span>Skill invoked</span>
              {shortDetail && <span className="text-emerald-400/70 font-normal">{String(shortDetail)}</span>}
            </span>
          )
        }
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

// --- My Skills Sidebar (now used as dropdown content) ---

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
    <div className="w-72 flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2">
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
              {activeTab === 'drafts' ? 'No drafts yet -- create your first one!' : 'No active skills installed'}
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
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm truncate ${isSelected ? 'text-blue-300' : 'text-parchment'}`}>{skill.name}</p>
                    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      skill.source === 'drafts'
                        ? 'bg-amber-500/15 text-amber-400/80'
                        : 'bg-emerald-500/15 text-emerald-400/80'
                    }`}>
                      {skill.source === 'drafts' ? 'Draft' : 'Active'}
                    </span>
                  </div>
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

function SkillFileViewer({ skill, onPromote, isPromoting }: { skill: TesterSkill; onPromote?: () => void; isPromoting?: boolean }) {
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
        {skill.source === 'drafts' && onPromote && (
          <button
            onClick={onPromote}
            disabled={isPromoting}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-moss/15 text-moss border border-moss/30 hover:bg-moss/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copy this draft to ~/.superbot2/skills/ and make it active"
          >
            <Upload className="h-3 w-3" />
            {isPromoting ? 'Promoting...' : 'Promote to Active'}
          </button>
        )}
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
              if (e.key === 'Enter' && !e.shiftKey) {
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
              title="Send (Enter)"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-stone/30 mt-1.5 ml-1">Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  )
}

interface TestMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tools?: { name: string; input: Record<string, unknown> }[]
}

function getTestStorageKey(skill: TesterSkill): string {
  return `skill-test-${skill.source}-${skill.id}`
}

function loadPersistedTestMessages(skill: TesterSkill): TestMessage[] {
  try {
    const raw = localStorage.getItem(getTestStorageKey(skill))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch { /* ignore corrupt data */ }
  return []
}

function saveTestMessages(skill: TesterSkill, messages: TestMessage[]) {
  try {
    localStorage.setItem(getTestStorageKey(skill), JSON.stringify(messages))
  } catch { /* ignore quota errors */ }
}

function clearTestMessages(skill: TesterSkill) {
  try {
    localStorage.removeItem(getTestStorageKey(skill))
  } catch { /* ignore */ }
}

function SkillTester({ selectedSkill }: { selectedSkill: TesterSkill | null }) {
  const [testSessionId, setTestSessionId] = useState<string | null>(null)
  const [testMessages, setTestMessages] = useState<TestMessage[]>(() =>
    selectedSkill ? loadPersistedTestMessages(selectedSkill) : []
  )
  const [testStreamText, setTestStreamText] = useState('')
  const [testInput, setTestInput] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'starting' | 'ready' | 'processing' | 'error'>('idle')
  const [testSkillName, setTestSkillName] = useState<string | null>(null)
  const testChatRef = useRef<HTMLDivElement>(null)
  const testInputRef = useRef<HTMLTextAreaElement>(null)
  const testEventSourceRef = useRef<EventSource | null>(null)
  const testPendingToolsRef = useRef<{ name: string; input: Record<string, unknown> }[]>([])
  const testStreamTextRef = useRef('')
  const testSessionIdRef = useRef(testSessionId)
  const testMessagesSkillRef = useRef<TesterSkill | null>(selectedSkill)

  useEffect(() => { testSessionIdRef.current = testSessionId }, [testSessionId])

  // Load persisted messages when skill changes
  useEffect(() => {
    testMessagesSkillRef.current = selectedSkill
    if (selectedSkill) {
      const persisted = loadPersistedTestMessages(selectedSkill)
      setTestMessages(persisted)
    } else {
      setTestMessages([])
    }
  }, [selectedSkill?.id, selectedSkill?.source])

  // Persist test messages to localStorage (only when messages change, not on skill switch)
  useEffect(() => {
    const skill = testMessagesSkillRef.current
    if (skill && testMessages.length > 0) {
      saveTestMessages(skill, testMessages)
    }
  }, [testMessages])

  // Auto-scroll test chat
  useEffect(() => {
    const el = testChatRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (nearBottom) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [testMessages, testStreamText])

  // Clean up test session on unmount or when skill changes
  useEffect(() => {
    return () => {
      const sid = testSessionIdRef.current
      if (sid) {
        testEventSourceRef.current?.close()
        testEventSourceRef.current = null
        fetch(`/api/skill-creator/test/${sid}`, { method: 'DELETE' }).catch(() => {})
        setTestSessionId(null)
        setTestStreamText('')
        setTestSkillName(null)
        setTestStatus('idle')
      }
    }
  }, [selectedSkill?.id])

  // Start a new isolated test session
  const startTestSession = useCallback(async () => {
    if (!selectedSkill) return

    // Clean up any existing test session
    if (testSessionIdRef.current) {
      testEventSourceRef.current?.close()
      fetch(`/api/skill-creator/test/${testSessionIdRef.current}`, { method: 'DELETE' }).catch(() => {})
    }

    setTestStatus('starting')
    // Don't clear messages -- keep persisted history
    testStreamTextRef.current = ''
    setTestStreamText('')
    testPendingToolsRef.current = []

    try {
      const res = await fetch('/api/skill-creator/test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftName: selectedSkill.id, source: selectedSkill.source }),
      })
      const data = await res.json()
      if (!data.ok) {
        setTestStatus('error')
        setTestMessages([{ id: crypto.randomUUID(), role: 'system', content: `Failed to start: ${data.error}` }])
        return
      }

      setTestSessionId(data.testSessionId)
      setTestSkillName(data.skillName)

      // Connect SSE
      const es = new EventSource(`/api/skill-creator/test/stream?testSessionId=${data.testSessionId}`)
      testEventSourceRef.current = es

      es.onopen = () => setTestStatus('ready')

      es.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data)
          if (d.type === 'text') {
            testStreamTextRef.current += d.text
            setTestStreamText(testStreamTextRef.current)
          } else if (d.type === 'tool_start') {
            testPendingToolsRef.current = [...testPendingToolsRef.current, { name: d.name, input: {} }]
            // Prominent skill invocation banner
            if (d.name === 'Skill') {
              setTestMessages(msgs => [...msgs, {
                id: crypto.randomUUID(),
                role: 'system',
                content: '__skill_invoked__',
              }])
            }
          } else if (d.type === 'assistant') {
            if (d.text && d.text.trim()) {
              testStreamTextRef.current = d.text
              setTestStreamText(d.text)
            }
            if (d.tools) {
              testPendingToolsRef.current = d.tools
            }
          } else if (d.type === 'result') {
            const text = testStreamTextRef.current
            testPendingToolsRef.current = []
            testStreamTextRef.current = ''
            setTestStreamText('')
            if (text.trim()) {
              setTestMessages(msgs => {
                const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
                if (lastAssistant && lastAssistant.content === text) return msgs
                return [...msgs, {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: text,
                }]
              })
            }
            setTestStatus('ready')
          } else if (d.type === 'error') {
            setTestMessages(msgs => [...msgs, { id: crypto.randomUUID(), role: 'system', content: `Error: ${d.message}` }])
            setTestStatus('ready')
          } else if (d.type === 'process_exit') {
            if (d.code !== 0) {
              setTestMessages(msgs => [...msgs, { id: crypto.randomUUID(), role: 'system', content: `Process exited with code ${d.code}` }])
            }
            setTestStatus('ready')
          }
        } catch {}
      }

      es.onerror = () => {
        // SSE will auto-reconnect
      }
    } catch {
      setTestStatus('error')
      setTestMessages([{ id: crypto.randomUUID(), role: 'system', content: 'Failed to connect to test server' }])
    }
  }, [selectedSkill])

  // Send a test message
  const handleTestSend = useCallback(async () => {
    const text = testInput.trim()
    if (!text || !testSessionId || testStatus === 'processing') return

    setTestMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }])
    setTestInput('')
    setTestStatus('processing')
    testStreamTextRef.current = ''
    setTestStreamText('')
    testPendingToolsRef.current = []

    try {
      const res = await fetch('/api/skill-creator/test/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testSessionId, message: text }),
      })
      if (!res.ok) {
        const err = await res.json()
        setTestMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Send failed: ${err.error}` }])
        setTestStatus('ready')
      }
    } catch {
      setTestMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: 'Failed to send message' }])
      setTestStatus('ready')
    }
  }, [testInput, testSessionId, testStatus])

  // Close the test session -- keeps message history persisted
  const closeTestSession = useCallback(() => {
    if (testSessionId) {
      testEventSourceRef.current?.close()
      testEventSourceRef.current = null
      fetch(`/api/skill-creator/test/${testSessionId}`, { method: 'DELETE' }).catch(() => {})
    }
    setTestSessionId(null)
    setTestStreamText('')
    setTestSkillName(null)
    setTestStatus('idle')
    testPendingToolsRef.current = []
  }, [testSessionId])

  // Clear persisted chat history
  const clearTestHistory = useCallback(() => {
    if (selectedSkill) {
      clearTestMessages(selectedSkill)
    }
    setTestMessages([])
  }, [selectedSkill])

  // No skill selected -- empty state
  if (!selectedSkill) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FlaskConical className="h-8 w-8 text-stone/20 mx-auto mb-2" />
          <p className="text-xs text-stone/40">Select a skill to test</p>
        </div>
      </div>
    )
  }

  // Idle -- show start button (and persisted messages if any)
  if (testStatus === 'idle') {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {testMessages.length > 0 ? (
          <>
            {/* Header with clear button */}
            <div className="px-4 py-2.5 border-b border-border-custom shrink-0 flex items-center justify-between">
              <div>
                <p className="text-xs text-parchment/80">
                  Previous: <span className="font-medium">{selectedSkill.name}</span>
                  <span className="text-stone/40 ml-1">(session ended)</span>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearTestHistory}
                  className="p-1.5 rounded-md text-stone/50 hover:text-ember hover:bg-ember/10 transition-colors"
                  title="Clear chat history"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Persisted messages */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {testMessages.map(msg => {
                if (msg.role === 'system') {
                  if (msg.content === '__skill_invoked__') {
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                          <FlaskConical className="h-4 w-4 text-emerald-400" />
                          <span className="text-sm font-semibold text-emerald-300">Skill Invoked</span>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-[10px] text-stone/40 bg-surface/30 px-2 py-0.5 rounded-full">{msg.content}</span>
                    </div>
                  )
                }
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[75%]">
                        <div className="rounded-2xl rounded-br-md px-4 py-2.5 bg-[rgba(180,160,120,0.15)]">
                          <p className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[85%] overflow-hidden">
                      <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">test session</span>
                      <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden min-w-0 w-full">
                        <MarkdownContent content={msg.content} className="text-parchment/80" />
                      </div>
                      {msg.tools && msg.tools.length > 0 && <ToolIndicator tools={msg.tools} />}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Start new session button */}
            <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border-custom flex justify-center">
              <button
                onClick={startTestSession}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors border border-sand/20"
              >
                <Play className="h-3.5 w-3.5" /> Resume Test Session
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FlaskConical className="h-8 w-8 text-stone/20 mx-auto mb-3" />
              <div className="flex items-center justify-center gap-2 mb-1">
                <p className="text-sm text-parchment/80">{selectedSkill.name}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                  selectedSkill.source === 'drafts'
                    ? 'bg-amber-500/15 text-amber-400/80'
                    : 'bg-emerald-500/15 text-emerald-400/80'
                }`}>
                  {selectedSkill.source === 'drafts' ? 'Draft' : 'Active'}
                </span>
              </div>
              <p className="text-xs text-stone/40 mb-4">Spin up an isolated Claude session with only this skill loaded</p>
              <button
                onClick={startTestSession}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition-colors border border-sand/20"
              >
                <Play className="h-3.5 w-3.5" /> Start Test Session
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Starting -- loading state
  if (testStatus === 'starting') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 text-sand/50 animate-spin mx-auto mb-3" />
          <p className="text-xs text-stone/50">Starting isolated test session...</p>
        </div>
      </div>
    )
  }

  // Active test session -- chat UI
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border-custom shrink-0 flex items-center justify-between">
        <div>
          <p className="text-xs text-parchment/80">
            Testing: <span className="font-medium">{testSkillName}</span>
            <span className="text-stone/40 ml-1">(isolated)</span>
          </p>
          <p className="text-[10px] text-stone/40">Type a trigger phrase to test if the skill fires correctly</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearTestHistory}
            className="p-1.5 rounded-md text-stone/50 hover:text-ember hover:bg-ember/10 transition-colors"
            title="Clear chat history"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={closeTestSession}
            className="p-1.5 rounded-md text-stone/50 hover:text-parchment hover:bg-surface/50 transition-colors"
            title="Close test session"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={testChatRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {testMessages.length === 0 && !testStreamText ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <FlaskConical className="h-7 w-7 text-stone/20 mx-auto mb-2" />
              <p className="text-xs text-stone/50">Session ready. Type a trigger phrase below.</p>
              <p className="text-[10px] text-stone/30 mt-1">The skill is discoverable but not pre-injected</p>
            </div>
          </div>
        ) : (
          <>
            {testMessages.map(msg => {
              if (msg.role === 'system') {
                if (msg.content === '__skill_invoked__') {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                        <FlaskConical className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm font-semibold text-emerald-300">Skill Invoked</span>
                        {testSkillName && <span className="text-xs text-emerald-400/60">{testSkillName}</span>}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-[10px] text-stone/40 bg-surface/30 px-2 py-0.5 rounded-full">{msg.content}</span>
                  </div>
                )
              }
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[75%]">
                      <div className="rounded-2xl rounded-br-md px-4 py-2.5 bg-[rgba(180,160,120,0.15)]">
                        <p className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                )
              }
              // assistant
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[85%] overflow-hidden">
                    <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">test session</span>
                    <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden min-w-0 w-full">
                      <MarkdownContent content={msg.content} className="text-parchment/80" />
                    </div>
                    {msg.tools && msg.tools.length > 0 && <ToolIndicator tools={msg.tools} />}
                  </div>
                </div>
              )
            })}
            {testStreamText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] overflow-hidden">
                  <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">test session</span>
                  <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden min-w-0 w-full">
                    <MarkdownContent content={testStreamText} className="text-parchment/80" />
                    <span className="inline-block w-1.5 h-4 bg-sand/50 animate-pulse ml-0.5 align-text-bottom" />
                  </div>
                </div>
              </div>
            )}
            {testStatus === 'processing' && !testStreamText && (
              <div className="flex justify-start">
                <div>
                  <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">test session</span>
                  <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-[rgba(120,140,160,0.12)]">
                    <div className="flex gap-1.5 items-center">
                      <span className="typing-dot" />
                      <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                      <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border-custom">
        <div className="flex items-end gap-2">
          <textarea
            ref={testInputRef}
            value={testInput}
            onChange={e => setTestInput(e.target.value)}
            placeholder="Type a trigger phrase..."
            rows={2}
            disabled={testStatus !== 'ready'}
            className="flex-1 bg-ink/80 border border-border-custom rounded-xl px-4 py-2.5 text-sm text-parchment placeholder:text-stone/45 focus:outline-none focus:border-stone/30 transition-colors resize-none overflow-y-auto max-h-32 no-scrollbar disabled:opacity-50"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleTestSend()
              }
            }}
            onInput={e => {
              const target = e.currentTarget
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`
            }}
          />
          {testStatus === 'processing' ? (
            <button
              className="shrink-0 p-2.5 rounded-xl text-stone/30 cursor-not-allowed"
              disabled
              title="Processing..."
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </button>
          ) : (
            <button
              onClick={handleTestSend}
              disabled={!testInput.trim() || testStatus !== 'ready'}
              className="shrink-0 p-2.5 rounded-xl text-stone hover:text-parchment hover:bg-surface/40 transition-colors disabled:opacity-25"
              title="Send (Enter)"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-stone/30 mt-1.5 ml-1">Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  )
}

// --- Collapsible File Tree ---

function FileTree({ files, onFileClick }: {
  files: { path: string; type: string }[]
  onFileClick: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  if (files.length === 0) {
    return (
      <div className="px-3 py-2 border-t border-border-custom">
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="flex items-center gap-1.5 text-xs text-stone/50 hover:text-stone transition-colors w-full"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <FolderOpen className="h-3 w-3" />
          <span>Files</span>
        </button>
        {expanded && (
          <p className="text-[10px] text-stone/30 ml-5 mt-1">No files yet</p>
        )}
      </div>
    )
  }

  return (
    <div className="border-t border-border-custom">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-1.5 text-xs text-stone/60 hover:text-stone transition-colors w-full px-3 py-2"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <FolderOpen className="h-3 w-3" />
        <span>Files</span>
        <span className="text-[10px] text-stone/30 ml-auto">{files.length}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
          {files.map(f => (
            <button
              key={f.path}
              onClick={() => onFileClick(f.path)}
              className="w-full text-left px-3 py-1 rounded-md text-xs text-parchment/70 hover:text-parchment hover:bg-surface/30 transition-colors truncate flex items-center gap-1.5"
            >
              <FileText className="h-3 w-3 text-stone/40 shrink-0" />
              {f.path}
            </button>
          ))}
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
  const [, setAttachedFiles] = useState<AttachedFile[]>([])
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [, setError] = useState<string | null>(null)
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [, setDraftFiles] = useState<{ path: string; type: string }[]>([])
  const [isPromoting, setIsPromoting] = useState(false)
  const [, setPromoteStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [selectedDraft, setSelectedDraft] = useState<string | null>(() => {
    try { return localStorage.getItem('skill-creator-selected-draft') } catch { return null }
  })
  const [selectedSkill, setSelectedSkill] = useState<TesterSkill | null>(null)
  const [selectedDraftFiles, setSelectedDraftFiles] = useState<{ path: string; type: string }[]>([])
  const [, setFrontmatter] = useState<Record<string, unknown> | null>(null)
  const [, setValidation] = useState<ValidationResult | null>(null)
  const [, setValidating] = useState(false)
  const [, setValidationExpanded] = useState(false)
  const [, setSelectedDraftType] = useState<'plugin' | 'skill' | null>(null)
  const [, setPluginMeta] = useState<{ name: string; version: string; description: string; author: string } | null>(null)

  // Two-panel tab state
  const [leftTab, setLeftTab] = useState<'chat' | 'files'>('chat')
  const [rightTab, setRightTab] = useState<'test' | 'console' | 'files' | 'web'>('test')

  // Skills dropdown popover
  const [skillsDropdownOpen, setSkillsDropdownOpen] = useState(false)
  const skillsDropdownRef = useRef<HTMLDivElement>(null)

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

  // Close skills dropdown when clicking outside
  useEffect(() => {
    if (!skillsDropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (skillsDropdownRef.current && !skillsDropdownRef.current.contains(e.target as Node)) {
        setSkillsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [skillsDropdownOpen])

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
          // Complete assistant message -- finalize any streaming text and add tools
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
          // Turn complete -- finalize any remaining streaming text
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
        setSkillsDropdownOpen(false)
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

  // Select a skill from the sidebar -- handles both drafts and active skills
  const handleSelectSkill = useCallback(async (skill: TesterSkill) => {
    const currentSkill = selectedSkillRef.current
    const isDeselecting = currentSkill?.id === skill.id && currentSkill?.source === skill.source

    // Save current draft messages
    const currentDraft = selectedDraftRef.current
    if (currentDraft && messagesRef.current.length > 0) {
      draftMessagesRef.current.set(currentDraft, [...messagesRef.current])
    }

    // Reset state
    setFrontmatter(null)
    setPromoteStatus('idle')
    setValidation(null)
    setValidationExpanded(false)
    setSelectedDraftType(null)
    setPluginMeta(null)

    if (isDeselecting) {
      setSelectedSkill(null)
      setSelectedDraft(null)
      setSkillsDropdownOpen(false)
      return
    }

    setSelectedSkill(skill)
    setSkillsDropdownOpen(false)

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
      // Active skill -- clear draft state
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

  // Handle file click from file tree -- switch to Files tab in left panel
  const handleFileTreeClick = useCallback((_path: string) => {
    setLeftTab('files')
  }, [])

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-border-custom bg-ink/60">
        {/* Left: Skill selector dropdown */}
        <div className="flex items-center gap-3">
          <div ref={skillsDropdownRef} className="relative">
            <button
              onClick={() => setSkillsDropdownOpen(prev => !prev)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-surface/30 border border-border-custom hover:bg-surface/50 transition-colors"
            >
              <Package className="h-3.5 w-3.5 text-sand" />
              <span className="text-parchment/80">My Skills</span>
              <ChevronDown className={`h-3 w-3 text-stone/50 transition-transform ${skillsDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {skillsDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-ink border border-border-custom rounded-lg shadow-2xl overflow-hidden">
                <MySkillsSidebar
                  onNewDraft={handleNewDraft}
                  refreshKey={skillsRefreshKey}
                  selectedSkill={selectedSkill}
                  onSelectSkill={handleSelectSkill}
                />
              </div>
            )}
          </div>

          {/* Selected skill name + source badge */}
          {selectedSkill && (
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-sand" />
              <span className="text-sm font-medium text-parchment">{selectedSkill.name}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                selectedSkill.source === 'drafts'
                  ? 'bg-amber-500/15 text-amber-400/80'
                  : 'bg-emerald-500/15 text-emerald-400/80'
              }`}>
                {selectedSkill.source === 'drafts' ? 'Draft' : 'Active'}
              </span>
            </div>
          )}
          {!selectedSkill && (
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-sand" />
              <span className="text-sm font-medium text-parchment">Plugin Creator</span>
            </div>
          )}
        </div>

        {/* Right: Version, Save, Publish, New, Status */}
        <div className="flex items-center gap-2">
          {totalCost > 0 && (
            <span className="text-[11px] text-stone/60 font-mono">{formatCost(totalCost)}</span>
          )}
          <span className={`flex items-center gap-1 text-[10px] ${isConnected ? 'text-moss/70' : 'text-ember/60'}`}>
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          </span>

          {/* Version dropdown placeholder */}
          <select
            disabled
            className="px-2 py-1 rounded-md text-xs bg-surface/30 border border-border-custom text-stone/50 cursor-not-allowed"
          >
            <option>v1.0.0</option>
          </select>

          {/* Save button */}
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface/30 border border-border-custom text-stone/70 hover:text-parchment hover:bg-surface/50 transition-colors"
            title="Save"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>

          {/* Publish / Promote button */}
          {selectedSkill?.source === 'drafts' && (
            <button
              onClick={handlePromote}
              disabled={isPromoting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-moss/15 text-moss border border-moss/30 hover:bg-moss/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Promote to Active"
            >
              <Upload className="h-3.5 w-3.5" />
              {isPromoting ? 'Publishing...' : 'Publish'}
            </button>
          )}

          {/* New session button */}
          <button
            onClick={handleNewSession}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-stone hover:text-parchment hover:bg-surface/40 border border-border-custom transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>
      </div>

      {/* Two-panel split layout */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT PANEL */}
        <div className="flex-1 flex flex-col min-h-0 border-r border-border-custom">
          {/* Tab bar: Chat | Files */}
          <div className="flex shrink-0 border-b border-border-custom bg-ink/30">
            {([
              { key: 'chat' as const, label: 'Chat', icon: MessageSquare },
              { key: 'files' as const, label: 'Files', icon: FileText },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setLeftTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  leftTab === tab.key
                    ? 'border-sand text-parchment'
                    : 'border-transparent text-stone/50 hover:text-stone hover:border-stone/30'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Left panel content */}
          <div className="flex-1 flex flex-col min-h-0">
            {leftTab === 'chat' ? (
              <>
                <SkillChat selectedSkill={selectedSkill} />
              </>
            ) : (
              /* Files tab content */
              selectedSkill ? (
                <SkillFileViewer skill={selectedSkill} onPromote={handlePromote} isPromoting={isPromoting} />
              ) : (
                <div className="flex-1 flex items-center justify-center px-4">
                  <div className="text-center">
                    <FileText className="h-8 w-8 text-stone/20 mx-auto mb-2" />
                    <p className="text-xs text-stone/40">Select a skill to view its files</p>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Collapsible file tree at bottom of left panel */}
          <div className="shrink-0">
            <FileTree files={selectedDraftFiles} onFileClick={handleFileTreeClick} />
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab bar: Test | Console | Files | Web */}
          <div className="flex shrink-0 border-b border-border-custom bg-ink/30">
            {([
              { key: 'test' as const, label: 'Test', icon: Play },
              { key: 'console' as const, label: 'Console', icon: Terminal },
              { key: 'files' as const, label: 'Files', icon: FileText },
              { key: 'web' as const, label: 'Web', icon: Globe },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setRightTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  rightTab === tab.key
                    ? 'border-sand text-parchment'
                    : 'border-transparent text-stone/50 hover:text-stone hover:border-stone/30'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right panel content */}
          <div className="flex-1 flex flex-col min-h-0">
            {rightTab === 'test' ? (
              <SkillTester selectedSkill={selectedSkill} />
            ) : rightTab === 'console' ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Terminal className="h-8 w-8 text-stone/20 mx-auto mb-2" />
                  <p className="text-sm text-stone/50">Console</p>
                  <p className="text-xs text-stone/30 mt-1">Coming soon</p>
                </div>
              </div>
            ) : rightTab === 'files' ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <FileText className="h-8 w-8 text-stone/20 mx-auto mb-2" />
                  <p className="text-sm text-stone/50">Files</p>
                  <p className="text-xs text-stone/30 mt-1">Coming soon</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Globe className="h-8 w-8 text-stone/20 mx-auto mb-2" />
                  <p className="text-sm text-stone/50">Web Preview</p>
                  <p className="text-xs text-stone/30 mt-1">Coming soon</p>
                </div>
              </div>
            )}
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
