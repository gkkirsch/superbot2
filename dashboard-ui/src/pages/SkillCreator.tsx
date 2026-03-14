import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, FileText, Wand2, Loader2, Plus, Upload, Package, Save, RefreshCw, ChevronDown, ChevronRight, FlaskConical, Play, Square, MessageSquare, Trash2, Terminal, Globe, FolderOpen, Copy, Search, ArrowLeft, Download } from 'lucide-react'
import { MarkdownContent } from '@/features/MarkdownContent'

// --- Shared Hooks ---

function useClickOutside(ref: React.RefObject<HTMLElement | null>, isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, ref, onClose])
}

// --- Shared Message Components ---

function SkillInvokedBanner({ skillName }: { skillName?: string }) {
  return (
    <div className="flex justify-center my-2">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
        <FlaskConical className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-300">Skill Invoked</span>
        {skillName && <span className="text-xs text-emerald-400/60">{skillName}</span>}
      </div>
    </div>
  )
}

function SystemBanner({ content }: { content: string }) {
  return (
    <div className="flex justify-center">
      <span className="text-[10px] text-stone/40 bg-surface/30 px-2 py-0.5 rounded-full">{content}</span>
    </div>
  )
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%]">
        <div className="rounded-2xl rounded-br-md px-4 py-2.5 bg-[rgba(180,160,120,0.15)]">
          <p className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{content}</p>
        </div>
      </div>
    </div>
  )
}

function AssistantBubble({ content, label, tools }: { content: string; label?: string; tools?: { name: string; input: Record<string, unknown> }[] }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] overflow-hidden">
        {label && <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">{label}</span>}
        <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden min-w-0 w-full">
          <MarkdownContent content={content} className="text-parchment/80" />
        </div>
        {tools && tools.length > 0 && <ToolIndicator tools={tools} />}
      </div>
    </div>
  )
}

function TestMessageList({ messages, skillName }: { messages: Array<{ id: string; role: string; content: string; tools?: { name: string; input: Record<string, unknown> }[] }>; skillName?: string }) {
  return (
    <>
      {messages.map(msg => {
        if (msg.role === 'system') {
          if (msg.content === '__skill_invoked__') {
            return <SkillInvokedBanner key={msg.id} skillName={skillName} />
          }
          return <SystemBanner key={msg.id} content={msg.content} />
        }
        if (msg.role === 'user') {
          return <UserBubble key={msg.id} content={msg.content} />
        }
        return <AssistantBubble key={msg.id} content={msg.content} label="test session" tools={msg.tools} />
      })}
    </>
  )
}

// --- Shared UI Components ---

function EmptyState({ icon: Icon, message, subtitle }: { icon: React.ComponentType<{ className?: string }>; message: string; subtitle?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Icon className="h-8 w-8 text-stone/20 mx-auto mb-2" />
        <p className="text-xs text-stone/40">{message}</p>
        {subtitle && <p className="text-[10px] text-stone/30 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  const isDraft = source === 'drafts'
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
      isDraft ? 'bg-amber-500/15 text-amber-400/80' : 'bg-emerald-500/15 text-emerald-400/80'
    }`}>
      {isDraft ? 'Draft' : 'Active'}
    </span>
  )
}

function TabBar<T extends string>({ tabs, activeTab, onTabChange }: {
  tabs: { key: T; label: string; icon: React.ComponentType<{ className?: string }> }[]
  activeTab: T
  onTabChange: (key: T) => void
}) {
  return (
    <div className="flex shrink-0 border-b border-border-custom bg-ink/30">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === tab.key
              ? 'border-sand text-parchment'
              : 'border-transparent text-stone/50 hover:text-stone hover:border-stone/30'
          }`}
        >
          <tab.icon className="h-3.5 w-3.5" />
          {tab.label}
        </button>
      ))}
    </div>
  )
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

// --- My Skills Sidebar (now used as dropdown content) ---

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
                    <SourceBadge source={skill.source} />
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
  const closeDropdown = useCallback(() => setOpen(false), [])
  useClickOutside(ref, open, closeDropdown)

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
  installPath?: string
  isPlugin?: boolean
}

interface SkillFileEntry {
  path: string
  content: string
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
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [toolInputJson, setToolInputJson] = useState('')
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
              setActiveTool(null)
              setToolInputJson('')
            } else if (data.type === 'tool_start') {
              setActiveTool(data.name)
              setToolInputJson('')
            } else if (data.type === 'tool_input_delta') {
              setToolInputJson(prev => prev + (data.partial_json || ''))
            } else if (data.type === 'files_changed') {
              setShowRefresh(true)
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
      }
      setStreamText('')
      setActiveTool(null)
      setToolInputJson('')
      setStreaming(false)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Connection error.' }])
      }
      setStreamText('')
      setActiveTool(null)
      setToolInputJson('')
      setStreaming(false)
    }
  }, [input, streaming, messages, selectedSkill])

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort()
    if (streamText.trim()) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: streamText + '\n\n*(stopped)*' }])
    }
    setStreamText('')
    setActiveTool(null)
    setToolInputJson('')
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
                  ) : activeTool ? null : (
                    <div className="flex gap-1.5 items-center py-1">
                      <span className="text-xs text-stone/50">Thinking...</span>
                      <Loader2 className="h-3 w-3 text-stone/40 animate-spin" />
                    </div>
                  )}
                  {activeTool && (
                    <div className="flex gap-1.5 items-center py-1 mt-1">
                      <Loader2 className="h-3 w-3 text-blue-400/70 animate-spin shrink-0" />
                      <span className="text-xs text-blue-300/70">
                        {activeTool === 'Write' && (() => { try { const p = JSON.parse(toolInputJson); return `Writing ${p.file_path?.split('/').pop() || 'file'}...` } catch { return 'Writing file...' } })()}
                        {activeTool === 'Edit' && (() => { try { const p = JSON.parse(toolInputJson); return `Editing ${p.file_path?.split('/').pop() || 'file'}...` } catch { return 'Editing file...' } })()}
                        {activeTool === 'Read' && (() => { try { const p = JSON.parse(toolInputJson); return `Reading ${p.file_path?.split('/').pop() || 'file'}...` } catch { return 'Reading file...' } })()}
                        {activeTool === 'Bash' && 'Running command...'}
                        {activeTool === 'Glob' && 'Searching files...'}
                        {activeTool === 'Grep' && 'Searching content...'}
                        {!['Write', 'Edit', 'Read', 'Bash', 'Glob', 'Grep'].includes(activeTool) && `Using ${activeTool}...`}
                      </span>
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

function SkillTester({ selectedSkill, activeTab = 'test' }: { selectedSkill: TesterSkill | null; activeTab?: 'test' | 'console' | 'files' | 'web' }) {
  const [testSessionId, setTestSessionId] = useState<string | null>(null)
  const [testMessages, setTestMessages] = useState<TestMessage[]>(() =>
    selectedSkill ? loadPersistedTestMessages(selectedSkill) : []
  )
  const [testStreamText, setTestStreamText] = useState('')
  const [testInput, setTestInput] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'starting' | 'ready' | 'processing' | 'error'>('idle')
  const [testSkillName, setTestSkillName] = useState<string | null>(null)
  const [consoleLines, setConsoleLines] = useState<string[]>([])
  const [testFiles, setTestFiles] = useState<{ path: string; size: number; modified: number }[]>([])
  const [webContent, setWebContent] = useState<string | null>(null)
  const [filesChanged, setFilesChanged] = useState(false)
  const sessionFileSnapshotRef = useRef<string>('')
  const testChatRef = useRef<HTMLDivElement>(null)
  const consolePanelRef = useRef<HTMLDivElement>(null)
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

  // Auto-scroll console panel
  useEffect(() => {
    const el = consolePanelRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    if (nearBottom) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [consoleLines])

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
    setConsoleLines([])
    setTestFiles([])
    setWebContent(null)

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

      // Capture file snapshot for change detection BEFORE setting session ID
      // (setTestSessionId triggers polling effect which checks the snapshot ref)
      if (selectedSkill.source === 'drafts') {
        try {
          const filesRes = await fetch(`/api/skill-creator/drafts/${selectedSkill.id}/files`)
          const filesData = await filesRes.json()
          if (filesData.ok) {
            sessionFileSnapshotRef.current = JSON.stringify(
              filesData.files.map((f: { path: string }) => f.path).sort()
            )
          }
        } catch {}
      }
      setFilesChanged(false)

      setTestSessionId(data.testSessionId)
      setTestSkillName(data.skillName)

      // Connect SSE
      const es = new EventSource(`/api/skill-creator/test/stream?testSessionId=${data.testSessionId}`)
      testEventSourceRef.current = es

      es.onopen = () => setTestStatus('ready')

      es.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data)
          const timestamp = new Date().toLocaleTimeString()

          if (d.type === 'text') {
            testStreamTextRef.current += d.text
            setTestStreamText(testStreamTextRef.current)
            setConsoleLines(prev => [...prev, `[${timestamp}] text: ${d.text.substring(0, 200)}`])
          } else if (d.type === 'tool_start') {
            testPendingToolsRef.current = [...testPendingToolsRef.current, { name: d.name, input: {} }]
            setConsoleLines(prev => [...prev, `[${timestamp}] tool_start: ${d.name}`])
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
            setConsoleLines(prev => [...prev, `[${timestamp}] assistant snapshot (${d.text?.length || 0} chars)`])
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
            setConsoleLines(prev => [...prev, `[${timestamp}] result (turn complete)`])
          } else if (d.type === 'error') {
            setTestMessages(msgs => [...msgs, { id: crypto.randomUUID(), role: 'system', content: `Error: ${d.message}` }])
            setTestStatus('ready')
            setConsoleLines(prev => [...prev, `[${timestamp}] ERROR: ${d.message}`])
          } else if (d.type === 'process_exit') {
            if (d.code !== 0) {
              setTestMessages(msgs => [...msgs, { id: crypto.randomUUID(), role: 'system', content: `Process exited with code ${d.code}` }])
            }
            setTestStatus('ready')
            setConsoleLines(prev => [...prev, `[${timestamp}] process exit: code ${d.code}`])
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

  // Poll for test session files when Files or Web tab is active and session exists
  useEffect(() => {
    if (!testSessionId) return
    if (activeTab !== 'files' && activeTab !== 'web') return

    let cancelled = false
    async function fetchFiles() {
      try {
        const res = await fetch(`/api/skill-creator/test/${testSessionId}/files`)
        const data = await res.json()
        if (!cancelled && data.ok) {
          setTestFiles(data.files || [])
          // Check for HTML files for web preview
          const htmlFile = (data.files || []).find((f: { path: string }) => f.path.endsWith('.html'))
          if (htmlFile && activeTab === 'web') {
            try {
              const contentRes = await fetch(`/api/skill-creator/test/${testSessionId}/file-content?path=${encodeURIComponent(htmlFile.path)}`)
              const contentData = await contentRes.json()
              if (!cancelled && contentData.ok) {
                setWebContent(contentData.content)
              }
            } catch {}
          } else if (!htmlFile) {
            setWebContent(null)
          }
        }
      } catch {}
    }
    fetchFiles()
    const interval = setInterval(fetchFiles, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [testSessionId, activeTab])

  // Poll for draft file changes to show reload banner
  useEffect(() => {
    if (!testSessionId || !selectedSkill || selectedSkill.source !== 'drafts') return
    if (!sessionFileSnapshotRef.current) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/skill-creator/drafts/${selectedSkill.id}/files`)
        const data = await res.json()
        if (data.ok) {
          const current = JSON.stringify(
            data.files.map((f: { path: string }) => f.path).sort()
          )
          if (sessionFileSnapshotRef.current && current !== sessionFileSnapshotRef.current) {
            setFilesChanged(true)
          }
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [testSessionId, selectedSkill])

  // Reload test session after draft file changes
  const handleReloadSession = useCallback(() => {
    setFilesChanged(false)
    closeTestSession()
    // Small delay to ensure cleanup, then restart
    setTimeout(() => startTestSession(), 200)
  }, [closeTestSession, startTestSession])

  // --- Console tab ---
  if (activeTab === 'console') {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2.5 border-b border-border-custom shrink-0 flex items-center justify-between">
          <p className="text-xs text-stone/50">Raw subprocess events</p>
          <button onClick={() => setConsoleLines([])} className="text-xs text-stone/40 hover:text-stone transition-colors">Clear</button>
        </div>
        <div ref={consolePanelRef} className="flex-1 min-h-0 overflow-y-auto p-4">
          <pre className="text-xs text-parchment/60 font-mono whitespace-pre-wrap">
            {consoleLines.length > 0 ? consoleLines.join('\n') : (
              testSessionId
                ? 'Listening for events...'
                : 'No output yet. Start a test session from the Test tab.'
            )}
          </pre>
        </div>
      </div>
    )
  }

  // --- Files tab (test session temp dir) ---
  if (activeTab === 'files') {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2.5 border-b border-border-custom shrink-0 flex items-center justify-between">
          <p className="text-xs text-stone/50">Test session working directory</p>
          {testSessionId && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/skill-creator/test/${testSessionId}/files`)
                  const data = await res.json()
                  if (data.ok) setTestFiles(data.files || [])
                } catch {}
              }}
              className="text-xs text-stone/40 hover:text-stone transition-colors flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {!testSessionId ? (
            <EmptyState icon={FolderOpen} message="No active test session" subtitle="Start a test session from the Test tab to see files" />
          ) : testFiles.length === 0 ? (
            <EmptyState icon={FolderOpen} message="No files in test directory" subtitle="Files created during the test session will appear here" />
          ) : (
            <div className="space-y-0.5">
              {testFiles.map(f => (
                <div
                  key={f.path}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface/30 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5 text-stone/40 shrink-0" />
                  <span className="text-sm text-parchment/80 truncate flex-1">{f.path}</span>
                  <span className="text-[10px] text-stone/40 shrink-0">
                    {f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- Web tab ---
  if (activeTab === 'web') {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2.5 border-b border-border-custom shrink-0 flex items-center justify-between">
          <p className="text-xs text-stone/50">Web preview</p>
          {webContent && (
            <button
              onClick={() => setWebContent(null)}
              className="text-xs text-stone/40 hover:text-stone transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0">
          {!testSessionId ? (
            <EmptyState icon={Globe} message="No active test session" subtitle="Start a test session from the Test tab" />
          ) : webContent ? (
            <iframe
              srcDoc={webContent}
              sandbox="allow-scripts"
              className="w-full h-full border-0 bg-white"
              title="Web Preview"
            />
          ) : (
            <EmptyState icon={Globe} message="No web content" subtitle="HTML files created in the test session will be previewed here" />
          )}
        </div>
      </div>
    )
  }

  // No skill selected -- empty state
  if (!selectedSkill) {
    return <EmptyState icon={FlaskConical} message='Select a skill from "My Skills" or click "New" to get started' />
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
              <TestMessageList messages={testMessages} />
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
                <SourceBadge source={selectedSkill.source} />
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

      {/* Reload banner when draft files change */}
      {filesChanged && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between shrink-0">
          <p className="text-xs text-amber-300">
            <span className="font-medium">Files changed</span> — skill files have been updated
          </p>
          <button
            onClick={handleReloadSession}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Reload
          </button>
        </div>
      )}

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
            <TestMessageList messages={testMessages} skillName={testSkillName ?? undefined} />
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

// --- Creation Modal ---

function CreationModal({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (name: string) => void
}) {
  const [view, setView] = useState<'choose' | 'fork'>('choose')
  const [skills, setSkills] = useState<TesterSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [forking, setForking] = useState(false)
  const [creating, setCreating] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setView('choose')
      setSearchQuery('')
      setForking(false)
      setCreating(false)
    }
  }, [open])

  // Fetch active skills when fork view is shown
  useEffect(() => {
    if (view !== 'fork') return
    let cancelled = false
    async function fetchSkills() {
      setLoading(true)
      try {
        const res = await fetch('/api/skill-tester/skills?source=active')
        const data = await res.json()
        if (!cancelled && data.ok) setSkills(data.skills)
      } catch {}
      if (!cancelled) setLoading(false)
    }
    fetchSkills()
    return () => { cancelled = true }
  }, [view])

  const filteredSkills = skills.filter(s => {
    const q = searchQuery.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  })

  const handleStartFromScratch = async () => {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/skill-creator/new-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftType: 'skill' }),
      })
      const data = await res.json()
      if (data.ok) {
        onCreated(data.name)
      }
    } catch {}
    setCreating(false)
  }

  const handleForkSkill = async (skill: TesterSkill) => {
    if (forking) return
    setForking(true)
    try {
      const res = await fetch('/api/skill-creator/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: skill.id, source: skill.source, installPath: skill.installPath }),
      })
      const data = await res.json()
      if (data.ok) {
        onCreated(data.name)
      }
    } catch {}
    setForking(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-ink border border-border-custom rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-custom">
          <div className="flex items-center gap-2">
            {view === 'fork' && (
              <button
                onClick={() => setView('choose')}
                className="p-1 rounded-md text-stone/50 hover:text-parchment hover:bg-surface/40 transition-colors mr-1"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-sm font-medium text-parchment">
              {view === 'choose' ? 'Create New Skill' : 'Fork Existing Skill'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-stone/50 hover:text-parchment hover:bg-surface/40 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        {view === 'choose' ? (
          <div className="p-6 grid grid-cols-2 gap-4">
            {/* Start from scratch */}
            <button
              onClick={handleStartFromScratch}
              disabled={creating}
              className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-border-custom hover:border-sand/40 hover:bg-sand/5 transition-all text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? (
                <Loader2 className="h-8 w-8 text-sand/50 animate-spin" />
              ) : (
                <div className="p-3 rounded-xl bg-sand/10 group-hover:bg-sand/15 transition-colors">
                  <Plus className="h-6 w-6 text-sand" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-parchment mb-1">Start from scratch</p>
                <p className="text-xs text-stone/50">Create a blank skill with a template SKILL.md</p>
              </div>
            </button>

            {/* Fork existing */}
            <button
              onClick={() => setView('fork')}
              className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-border-custom hover:border-blue-400/40 hover:bg-blue-500/5 transition-all text-center cursor-pointer"
            >
              <div className="p-3 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/15 transition-colors">
                <Copy className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-parchment mb-1">Fork existing</p>
                <p className="text-xs text-stone/50">Copy an active skill and modify it</p>
              </div>
            </button>
          </div>
        ) : (
          <div className="flex flex-col" style={{ maxHeight: '60vh' }}>
            {/* Search */}
            <div className="px-4 pt-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search active skills..."
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface/30 border border-border-custom text-sm text-parchment placeholder:text-stone/40 focus:outline-none focus:border-stone/30 transition-colors"
                />
              </div>
            </div>

            {/* Skill list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 text-stone/40 animate-spin" />
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-xs text-stone/40">
                    {searchQuery ? 'No skills match your search' : 'No active skills found'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 mt-1">
                  {filteredSkills.map(skill => (
                    <button
                      key={skill.id}
                      onClick={() => handleForkSkill(skill)}
                      disabled={forking}
                      className="w-full text-left px-4 py-3 rounded-lg hover:bg-surface/40 transition-colors flex items-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="p-1.5 rounded-md bg-blue-500/10 shrink-0">
                        <FileText className="h-3.5 w-3.5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-parchment truncate">{skill.name}</p>
                        {skill.description && (
                          <p className="text-xs text-stone/50 truncate mt-0.5">{skill.description}</p>
                        )}
                      </div>
                      <Copy className="h-3.5 w-3.5 text-stone/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {forking && (
                <div className="flex items-center justify-center gap-2 py-3 mt-2">
                  <Loader2 className="h-4 w-4 text-sand animate-spin" />
                  <span className="text-xs text-stone/50">Forking skill...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Inline File Editor (VS Code-style tabs) ---

interface TabData {
  content: string   // original content from server
  draft: string     // current edited content
  loading: boolean
  error: string | null
}

function InlineFileEditor({ skill, fileToOpen, refreshKey }: { skill: TesterSkill; fileToOpen: string | null; refreshKey?: number }) {
  const [openTabs, setOpenTabs] = useState<Map<string, TabData>>(new Map())
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [savingTab, setSavingTab] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isDraft = skill.source === 'drafts'

  // When fileToOpen changes, open that file as a new tab
  useEffect(() => {
    if (!fileToOpen) return
    const file = fileToOpen // capture for closures (TS narrowing)
    let cancelled = false

    setActiveTab(file)

    // Check if tab already exists
    setOpenTabs(prev => {
      if (prev.has(file)) return prev
      const next = new Map(prev)
      next.set(file, { content: '', draft: '', loading: true, error: null })
      return next
    })

    // Fetch file content for new tabs
    async function fetchContent() {
      try {
        let content = ''
        if (isDraft) {
          const res = await fetch(`/api/skill-creator/drafts/${encodeURIComponent(skill.id)}/file/${encodeURIComponent(file)}`)
          const data = await res.json()
          if (cancelled) return
          if (data.ok) {
            content = data.content || ''
          } else {
            setOpenTabs(prev => {
              const next = new Map(prev)
              next.set(file, { content: '', draft: '', loading: false, error: data.error || 'Failed to load file' })
              return next
            })
            return
          }
        } else {
          // Active skill: fetch from skill-tester endpoint
          const res = await fetch(`/api/skill-tester/skill-files?name=${encodeURIComponent(skill.id)}&source=active`)
          const data = await res.json()
          if (cancelled) return
          const matched = (data.files || []).find((f: SkillFileEntry) => f.path === file)
          content = matched?.content || ''
        }
        if (!cancelled) {
          setOpenTabs(prev => {
            const next = new Map(prev)
            next.set(file, { content, draft: content, loading: false, error: null })
            return next
          })
        }
      } catch {
        if (!cancelled) {
          setOpenTabs(prev => {
            const next = new Map(prev)
            next.set(file, { content: '', draft: '', loading: false, error: 'Failed to load file' })
            return next
          })
        }
      }
    }

    // Only fetch if this is a newly opened tab
    if (!openTabs.has(file)) {
      fetchContent()
    }

    return () => { cancelled = true }
  }, [fileToOpen, skill.id, skill.source, isDraft, refreshKey])

  // Reset tabs when skill changes or when version is restored (refreshKey changes)
  useEffect(() => {
    setOpenTabs(new Map())
    setActiveTab(null)
  }, [skill.id, skill.source, refreshKey])

  // Keyboard shortcut: Cmd+S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (activeTab && isDraft) {
          const tab = openTabs.get(activeTab)
          if (tab && tab.draft !== tab.content && !tab.loading) {
            handleSave(activeTab)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, openTabs, isDraft])

  const handleCloseTab = useCallback((path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setOpenTabs(prev => {
      const next = new Map(prev)
      next.delete(path)
      return next
    })
    if (activeTab === path) {
      // Activate nearest tab
      const paths = Array.from(openTabs.keys())
      const idx = paths.indexOf(path)
      if (paths.length > 1) {
        setActiveTab(paths[idx > 0 ? idx - 1 : idx + 1])
      } else {
        setActiveTab(null)
      }
    }
  }, [activeTab, openTabs])

  const handleDraftChange = useCallback((path: string, value: string) => {
    setOpenTabs(prev => {
      const next = new Map(prev)
      const tab = next.get(path)
      if (tab) {
        next.set(path, { ...tab, draft: value })
      }
      return next
    })
  }, [])

  const handleSave = useCallback(async (path: string) => {
    const tab = openTabs.get(path)
    if (!tab || !isDraft) return

    setSavingTab(path)
    try {
      const res = await fetch(`/api/skill-creator/drafts/${encodeURIComponent(skill.id)}/file/${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: tab.draft }),
      })
      const data = await res.json()
      if (data.ok) {
        setOpenTabs(prev => {
          const next = new Map(prev)
          const current = next.get(path)
          if (current) {
            next.set(path, { ...current, content: current.draft })
          }
          return next
        })
        setSaveSuccess(path)
        setTimeout(() => setSaveSuccess(prev => prev === path ? null : prev), 1500)
      }
    } catch {}
    setSavingTab(null)
  }, [openTabs, skill.id, isDraft])

  const activeTabData = activeTab ? openTabs.get(activeTab) : null
  const tabPaths = Array.from(openTabs.keys())

  // Empty state -- no tabs open
  if (tabPaths.length === 0) {
    return <EmptyState icon={FolderOpen} message="Open a file from the tree below" subtitle="Click any file to view and edit it here" />
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* VS Code-style file tabs */}
      <div className="flex overflow-x-auto shrink-0 bg-ink/30 no-scrollbar">
        {tabPaths.map(path => {
          const tab = openTabs.get(path)!
          const isActive = path === activeTab
          const isDirty = tab.draft !== tab.content
          const fileName = path.split('/').pop() || path

          return (
            <button
              key={path}
              onClick={() => setActiveTab(path)}
              className={`group flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors min-w-0 ${
                isActive
                  ? 'border-sand text-parchment bg-ink/60'
                  : 'border-transparent text-stone/60 hover:text-stone bg-ink/30'
              }`}
              title={path}
            >
              {isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-sand shrink-0" />
              )}
              <span className="truncate max-w-[140px]">{fileName}</span>
              <span
                onClick={(e) => handleCloseTab(path, e)}
                className="ml-1 shrink-0 text-stone/40 hover:text-stone opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                role="button"
                tabIndex={-1}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          )
        })}
      </div>

      {/* Editor content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTabData?.loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-stone/40 animate-spin" />
          </div>
        ) : activeTabData?.error ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-ember/70">{activeTabData.error}</p>
          </div>
        ) : activeTabData ? (
          <>
            {/* Save bar for drafts */}
            {isDraft && (
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-border-custom shrink-0">
                <span className="text-[10px] text-stone/40 truncate">{activeTab}</span>
                <div className="flex items-center gap-2">
                  {saveSuccess === activeTab && (
                    <span className="text-[10px] text-moss">Saved</span>
                  )}
                  <button
                    onClick={() => activeTab && handleSave(activeTab)}
                    disabled={!activeTabData || activeTabData.draft === activeTabData.content || savingTab === activeTab}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                      activeTabData && activeTabData.draft !== activeTabData.content
                        ? 'bg-sand/20 text-sand border border-sand/30 hover:bg-sand/30'
                        : 'bg-surface/20 text-stone/30 border border-border-custom cursor-not-allowed'
                    }`}
                  >
                    {savingTab === activeTab ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    {savingTab === activeTab ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Textarea (drafts) or read-only pre (active) */}
            <div className="flex-1 min-h-0 overflow-auto p-4">
              {isDraft ? (
                <textarea
                  ref={textareaRef}
                  value={activeTabData.draft}
                  onChange={(e) => activeTab && handleDraftChange(activeTab, e.target.value)}
                  className="w-full min-h-full bg-ink/80 text-parchment/90 font-mono text-sm border border-border-custom rounded-lg p-4 resize-none focus:outline-none focus:border-stone/30 transition-colors"
                  spellCheck={false}
                />
              ) : (
                <pre className="text-sm text-parchment/80 font-mono whitespace-pre-wrap break-words bg-ink/80 rounded-lg border border-border-custom p-4 min-h-full">
                  <code>{activeTabData.draft}</code>
                </pre>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// --- Main Component ---

export function SkillCreator() {
  // --- Kept state: used by v2 layout ---
  const [selectedSkill, setSelectedSkill] = useState<TesterSkill | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<string | null>(() => {
    try { return localStorage.getItem('skill-creator-selected-draft') } catch { return null }
  })
  const [selectedDraftFiles, setSelectedDraftFiles] = useState<{ path: string; type: string }[]>([])
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)
  const [fileEditorRefreshKey, setFileEditorRefreshKey] = useState(0)
  const [isPromoting, setIsPromoting] = useState(false)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)

  // Version control state
  const [versions, setVersions] = useState<{ number: number; label: string; timestamp: string }[]>([])
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Creation modal state
  const [showCreationModal, setShowCreationModal] = useState(false)

  // Two-panel tab state
  const [leftTab, setLeftTab] = useState<'chat' | 'files'>('chat')
  const [rightTab, setRightTab] = useState<'test' | 'console' | 'files' | 'web'>('test')

  // Skills dropdown popover
  const [skillsDropdownOpen, setSkillsDropdownOpen] = useState(false)
  const skillsDropdownRef = useRef<HTMLDivElement>(null)

  // Close skills dropdown when clicking outside
  const closeSkillsDropdown = useCallback(() => setSkillsDropdownOpen(false), [])
  useClickOutside(skillsDropdownRef, skillsDropdownOpen, closeSkillsDropdown)

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

  // Reconstruct selectedSkill from persisted selectedDraft on mount
  useEffect(() => {
    if (selectedDraft && !selectedSkill) {
      // Fetch draft metadata to get the proper skill name/description
      fetch(`/api/skill-creator/drafts`)
        .then(r => r.json())
        .then(data => {
          if (!data.ok) return
          const draft = data.drafts.find((d: { name: string }) => d.name === selectedDraft)
          if (draft) {
            // Read SKILL.md frontmatter for display name
            fetch(`/api/skill-creator/drafts/${encodeURIComponent(selectedDraft)}/file/${encodeURIComponent('SKILL.md')}`)
              .then(r => r.json())
              .then(fileData => {
                if (fileData.ok && fileData.content) {
                  const nameMatch = fileData.content.match(/^name:\s*(.+)$/m)
                  const descMatch = fileData.content.match(/^description:\s*>?\s*\n?\s*(.+)$/m)
                  const displayName = nameMatch?.[1]?.trim() || selectedDraft
                  const description = descMatch?.[1]?.trim() || ''
                  setSelectedSkill({ id: selectedDraft, name: displayName, description, source: 'drafts' })
                } else {
                  setSelectedSkill({ id: selectedDraft, name: selectedDraft, description: '', source: 'drafts' })
                }
              })
              .catch(() => {
                setSelectedSkill({ id: selectedDraft, name: selectedDraft, description: '', source: 'drafts' })
              })
          }
        })
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- mount-only reconstruction

  // Fetch versions when draft changes
  useEffect(() => {
    if (!selectedDraft) {
      setVersions([])
      setCurrentVersion(null)
      return
    }
    let cancelled = false
    async function fetchVersions() {
      try {
        const res = await fetch(`/api/skill-creator/drafts/${selectedDraft}/versions`)
        const data = await res.json()
        if (!cancelled && data.ok) {
          setVersions(data.versions || [])
          setCurrentVersion(data.currentVersion || null)
        }
      } catch {}
    }
    fetchVersions()
    return () => { cancelled = true }
  }, [selectedDraft, skillsRefreshKey])

  // Fetch files for the selected draft (for FileTree)
  useEffect(() => {
    const activeDraft = selectedDraft
    if (!activeDraft) {
      setSelectedDraftFiles([])
      return
    }
    let cancelled = false
    async function fetchFiles() {
      try {
        const res = await fetch(`/api/skill-creator/drafts/${activeDraft}/files`)
        const data = await res.json()
        if (!cancelled && data.ok) {
          setSelectedDraftFiles(data.files)
        }
      } catch {}
    }
    fetchFiles()
    const interval = setInterval(fetchFiles, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selectedDraft])

  // Promote draft to active
  const handlePromote = useCallback(async () => {
    if (!selectedDraft || isPromoting) return
    setIsPromoting(true)
    try {
      const res = await fetch('/api/skill-creator/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftName: selectedDraft }),
      })
      const data = await res.json()
      if (data.ok) {
        setSkillsRefreshKey(k => k + 1)
      }
    } catch {
      // silently fail
    }
    setIsPromoting(false)
  }, [selectedDraft, isPromoting])

  // Save current state as a new version snapshot
  const handleSaveVersion = useCallback(async () => {
    if (!selectedDraft || isSaving) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/skill-creator/drafts/${selectedDraft}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.ok) {
        setVersions(prev => [...prev, data.version])
        setCurrentVersion(data.version.number)
      }
    } catch {}
    setIsSaving(false)
  }, [selectedDraft, isSaving])

  // Restore a saved version to the working directory
  const handleRestoreVersion = useCallback(async (versionName: string) => {
    if (!selectedDraft) return
    try {
      const res = await fetch(`/api/skill-creator/drafts/${selectedDraft}/versions/${versionName}/restore`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.ok) {
        // Extract version number
        const num = parseInt(versionName.replace('v', ''))
        if (!isNaN(num)) setCurrentVersion(num)
        // Force refresh files and editor content
        setSkillsRefreshKey(k => k + 1)
        setFileEditorRefreshKey(k => k + 1)
      }
    } catch {}
  }, [selectedDraft])

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
        setSelectedSkill({ id: data.name, name: data.name, description: '', source: 'drafts' })
        setSkillsDropdownOpen(false)
      }
    } catch {
      // silently fail
    }
  }, [])

  // Select a skill from the sidebar -- handles both drafts and active skills
  const handleSelectSkill = useCallback((skill: TesterSkill) => {
    const isDeselecting = selectedSkill?.id === skill.id && selectedSkill?.source === skill.source

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
    } else {
      // Active skill -- clear draft state
      setSelectedDraft(null)
    }
  }, [selectedSkill])

  // Handle file click from file tree -- switch to Files tab and select file
  const handleFileTreeClick = useCallback((path: string) => {
    // Clear first to ensure re-trigger if clicking the same file after version restore
    setSelectedFilePath(null)
    setTimeout(() => {
      setSelectedFilePath(path)
      setLeftTab('files')
    }, 0)
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
              <SourceBadge source={selectedSkill.source} />
            </div>
          )}
          {!selectedSkill && (
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-sand" />
              <span className="text-sm font-medium text-parchment">Plugin Creator</span>
            </div>
          )}
        </div>

        {/* Right: New, Version, Save, Publish */}
        <div className="flex items-center gap-2">
          {/* New button */}
          <button
            onClick={() => setShowCreationModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-sand/15 text-sand border border-sand/30 hover:bg-sand/25 transition-colors"
            title="Create a new skill or fork an existing one"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>

          {/* Version dropdown — latest first */}
          {selectedDraft && versions.length > 0 ? (
            <select
              value={currentVersion ? `v${currentVersion}` : ''}
              onChange={(e) => {
                if (e.target.value) handleRestoreVersion(e.target.value)
              }}
              className="px-2 py-1 rounded-md text-xs bg-surface/30 border border-border-custom text-parchment/70"
              title="Restore a saved snapshot"
            >
              <option value="" disabled>Current (working copy)</option>
              {[...versions].reverse().map(v => (
                <option key={v.number} value={`v${v.number}`}>
                  v{v.number} — {new Date(v.timestamp).toLocaleString()}
                </option>
              ))}
            </select>
          ) : selectedDraft ? (
            <span className="px-2 py-1 text-[10px] text-stone/40">No snapshots yet</span>
          ) : null}

          {/* Snapshot button — saves a version snapshot of all files */}
          <button
            onClick={handleSaveVersion}
            disabled={!selectedDraft || isSaving}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              selectedDraft
                ? 'bg-surface/30 border-border-custom text-stone/70 hover:text-parchment hover:bg-surface/50'
                : 'bg-surface/30 border-border-custom text-stone/40 cursor-not-allowed opacity-60'
            }`}
            title={selectedDraft ? 'Save a snapshot of all current files' : 'Select a draft first'}
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? 'Saving...' : 'Snapshot'}
          </button>

          {/* Export button */}
          {selectedDraft && (
            <button
              onClick={() => {
                const a = document.createElement('a')
                a.href = `/api/skill-creator/drafts/${encodeURIComponent(selectedDraft)}/export`
                a.download = `${selectedDraft}.zip`
                a.click()
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface/30 border border-border-custom text-stone/70 hover:text-parchment hover:bg-surface/50 transition-colors"
              title="Export draft as zip"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          )}

          {/* Publish / Promote button */}
          {selectedSkill?.source === 'drafts' && (
            <button
              onClick={handlePromote}
              disabled={isPromoting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-moss/15 text-moss border border-moss/30 hover:bg-moss/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Install this draft as an active skill"
            >
              <Upload className="h-3.5 w-3.5" />
              {isPromoting ? 'Publishing...' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {/* Two-panel split layout */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT PANEL */}
        <div className="flex-1 flex flex-col min-h-0 border-r border-border-custom">
          <TabBar
            tabs={[
              { key: 'chat' as const, label: 'Chat', icon: MessageSquare },
              { key: 'files' as const, label: 'Files', icon: FileText },
            ]}
            activeTab={leftTab}
            onTabChange={setLeftTab}
          />

          {/* Left panel content — both tabs stay mounted to preserve state */}
          <div className={`flex-1 flex flex-col min-h-0 ${leftTab === 'chat' ? '' : 'hidden'}`}>
            <SkillChat selectedSkill={selectedSkill} />
          </div>
          <div className={`flex-1 flex flex-col min-h-0 ${leftTab === 'files' ? '' : 'hidden'}`}>
            {selectedSkill ? (
              <InlineFileEditor skill={selectedSkill} fileToOpen={selectedFilePath} refreshKey={fileEditorRefreshKey} />
            ) : (
              <EmptyState icon={FileText} message='Select a skill from "My Skills" to browse its files' />
            )}
          </div>

          {/* Collapsible file tree at bottom of left panel */}
          <div className="shrink-0">
            <FileTree files={selectedDraftFiles} onFileClick={handleFileTreeClick} />
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 flex flex-col min-h-0">
          <TabBar
            tabs={[
              { key: 'test' as const, label: 'Test', icon: Play },
              { key: 'console' as const, label: 'Console', icon: Terminal },
              { key: 'files' as const, label: 'Output', icon: FolderOpen },
              { key: 'web' as const, label: 'Web', icon: Globe },
            ]}
            activeTab={rightTab}
            onTabChange={setRightTab}
          />

          {/* Right panel content -- always render SkillTester, it handles all tabs */}
          <div className="flex-1 flex flex-col min-h-0">
            <SkillTester selectedSkill={selectedSkill} activeTab={rightTab} />
          </div>
        </div>
      </div>

      {/* Creation Modal */}
      <CreationModal
        open={showCreationModal}
        onClose={() => setShowCreationModal(false)}
        onCreated={(name) => {
          setSelectedDraft(name)
          setSelectedSkill({ id: name, name, description: '', source: 'drafts' })
          setSkillsRefreshKey(k => k + 1)
          setShowCreationModal(false)
        }}
      />
    </div>
  )
}
