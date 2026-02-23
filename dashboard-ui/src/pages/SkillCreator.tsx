import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, Paperclip, FileText, Wand2, Wifi, WifiOff, Loader2 } from 'lucide-react'
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

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

    // New session
    setSessionId(crypto.randomUUID())
  }, [sessionId])

  // Memoize empty state check
  const isEmpty = messages.length === 0 && !streamingText

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
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

      {/* Chat area */}
      <div
        className="flex-1 min-h-0 flex flex-col"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          ref={chatContainerRef}
          className={`flex-1 overflow-y-auto rounded-xl bg-ink/60 p-4 space-y-4 min-h-0 transition-colors ${
            isDragging ? 'ring-2 ring-sand/50 bg-sand/5' : ''
          }`}
        >
          {isDragging ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Paperclip className="h-8 w-8 text-sand/50 mx-auto mb-2" />
                <p className="text-sm text-sand/70">Drop files here</p>
              </div>
            </div>
          ) : isEmpty ? (
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
        <div className="mt-2 px-3 py-2 rounded-lg bg-ember/10 border border-ember/20 flex items-center justify-between">
          <span className="text-xs text-ember/80">{error}</span>
          <button onClick={() => setError(null)} className="text-ember/50 hover:text-ember/70">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachedFiles.map((f, i) => (
            <div key={i} className="relative group">
              {f.preview ? (
                <button onClick={() => setLightboxSrc(f.preview)}>
                  <img
                    src={f.preview}
                    alt={f.file.name}
                    className="h-16 w-16 object-cover rounded-lg border border-border-custom"
                  />
                </button>
              ) : (
                <div className="h-16 w-16 flex items-center justify-center rounded-lg border border-border-custom bg-ink/40">
                  <FileText className="h-6 w-6 text-stone/60" />
                </div>
              )}
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 bg-ink border border-border-custom rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3 text-stone/70" />
              </button>
              <span className="absolute bottom-0 left-0 right-0 text-[8px] text-parchment/70 bg-ink/80 rounded-b-lg px-1 truncate">
                {f.file.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-2 flex items-end gap-2 shrink-0">
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

      {/* Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Preview" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}
