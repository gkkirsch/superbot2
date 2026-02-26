import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Send, X, ChevronUp, Paperclip, FileText } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { sendMessageToOrchestrator, fetchMessages } from '@/lib/api'
import { MarkdownContent } from '@/features/MarkdownContent'
import type { InboxMessage } from '@/lib/types'

// --- Inline image detection ---

const IMAGE_PATH_RE = /((?:~\/|\/)[^\s]+\.(?:png|jpe?g|gif|webp))/gi
const PDF_PATH_RE = /((?:~\/|\/)[^\s]+\.pdf)/gi

function imageApiUrl(filePath: string): string {
  return `/api/images?path=${encodeURIComponent(filePath)}`
}

function hasImagePaths(text: string): boolean {
  IMAGE_PATH_RE.lastIndex = 0
  const result = IMAGE_PATH_RE.test(text)
  IMAGE_PATH_RE.lastIndex = 0
  return result
}

/** Extract image file paths from text */
function extractImagePaths(text: string): string[] {
  IMAGE_PATH_RE.lastIndex = 0
  const paths: string[] = []
  let match
  while ((match = IMAGE_PATH_RE.exec(text)) !== null) {
    paths.push(match[1])
  }
  IMAGE_PATH_RE.lastIndex = 0
  return paths
}

/** Strip image paths from text, cleaning up extra whitespace */
function stripImagePaths(text: string): string {
  IMAGE_PATH_RE.lastIndex = 0
  return text.replace(IMAGE_PATH_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

function hasPdfPaths(text: string): boolean {
  PDF_PATH_RE.lastIndex = 0
  const result = PDF_PATH_RE.test(text)
  PDF_PATH_RE.lastIndex = 0
  return result
}

function extractPdfPaths(text: string): string[] {
  PDF_PATH_RE.lastIndex = 0
  const paths: string[] = []
  let match
  while ((match = PDF_PATH_RE.exec(text)) !== null) {
    paths.push(match[1])
  }
  PDF_PATH_RE.lastIndex = 0
  return paths
}

function stripPdfPaths(text: string): string {
  PDF_PATH_RE.lastIndex = 0
  return text.replace(PDF_PATH_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

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
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function ThumbnailGallery({ paths }: { paths: string[] }) {
  const [lightboxPath, setLightboxPath] = useState<string | null>(null)
  const [errorPaths, setErrorPaths] = useState<Set<string>>(new Set())

  if (paths.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {paths.map((path, i) => {
          const filename = path.split('/').pop() || 'image'
          if (errorPaths.has(path)) {
            return <span key={i} className="text-stone/50 text-xs italic">{path}</span>
          }
          return (
            <button
              key={i}
              onClick={() => setLightboxPath(path)}
              className="rounded-md overflow-hidden border border-border-custom hover:border-stone/40 transition-colors"
            >
              <img
                src={imageApiUrl(path)}
                alt={filename}
                className="h-20 w-20 object-cover"
                loading="lazy"
                onError={() => setErrorPaths(prev => new Set(prev).add(path))}
              />
            </button>
          )
        })}
      </div>
      {lightboxPath && (
        <ImageLightbox
          src={imageApiUrl(lightboxPath)}
          alt={lightboxPath.split('/').pop() || 'image'}
          onClose={() => setLightboxPath(null)}
        />
      )}
    </>
  )
}

function PdfAttachments({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {paths.map((path, i) => {
        const filename = path.split('/').pop() || 'document.pdf'
        return (
          <a
            key={i}
            href={imageApiUrl(path)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-custom hover:bg-surface/30 transition-colors group"
          >
            <FileText className="h-5 w-5 text-stone/60 group-hover:text-stone/80 shrink-0" />
            <span className="text-sm text-parchment/70 group-hover:text-parchment/90 truncate">{filename}</span>
          </a>
        )
      })}
    </div>
  )
}

type MessageType = 'user' | 'orchestrator' | 'agent' | 'system'

function classifyMessage(msg: InboxMessage): MessageType {
  if (msg.from === 'dashboard-user') return 'user'
  if (msg.from === 'system') return 'system'
  if (msg.from === 'team-lead') return 'orchestrator'
  if (msg.type === 'heartbeat' || msg.type === 'scheduled_job') return 'system'
  if (msg.from === 'heartbeat' || msg.from === 'scheduler') return 'system'
  const text = msg.text.trim()
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed.type) return 'system'
    } catch { /* not JSON */ }
  }
  return 'agent'
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getSystemLabel(msg: InboxMessage): string {
  if (msg.type === 'compact') return 'context compacting'
  if (msg.type === 'heartbeat' || msg.from === 'heartbeat') return 'heartbeat'
  if (msg.type === 'scheduled_job' || msg.from === 'scheduler') {
    const meta = msg.metadata as Record<string, unknown> | undefined
    return `scheduled: ${(meta?.jobName as string) || 'job'}`
  }
  const text = msg.text.trim()
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      const source = parsed.from || msg.from
      if (parsed.type === 'idle_notification' || parsed.type === 'idle') return `${source} idle`
      if (parsed.type === 'shutdown_approved') return `${source} shut down`
      if (parsed.type === 'shutdown_request') return `shutdown → ${parsed.recipient || msg.to || 'agent'}`
      if (parsed.type === 'shutdown_response') return `${source} shutdown response`
      if (parsed.type === 'teammate_terminated') return `${source} terminated`
      if (parsed.type) return `${source} ${parsed.type.replace(/_/g, ' ')}`
    } catch { /* not JSON */ }
  }
  return msg.from
}

interface CompactionEvent {
  timestamp: string
  trigger: string
}

type RenderItem =
  | { kind: 'bubble'; msg: InboxMessage; type: MessageType }
  | { kind: 'activity'; msgs: Array<{ msg: InboxMessage; type: MessageType }> }
  | { kind: 'compaction'; timestamp: string }

function isPrimaryMessage(msg: InboxMessage, type: MessageType): boolean {
  if (type === 'user') return true
  if (type === 'orchestrator' && (!msg.to || msg.to === 'dashboard-user')) return true
  return false
}

const PAGE_SIZE = 50

function msgKey(m: InboxMessage) {
  return `${m.timestamp}:${m.from}:${m.text.slice(0, 40)}`
}

const ONBOARDING_STORAGE_KEY = 'superbot2-onboarded'

const ONBOARDING_MESSAGES: InboxMessage[] = [
  {
    from: 'team-lead',
    text: "Hey! I'm your team lead. I coordinate everything — finding work, assigning it to workers, and reporting back to you. Think of me as the AI manager for all your projects.",
    timestamp: '2026-01-01T00:00:00Z',
    read: true,
    type: 'message',
    metadata: { onboarding: true, first: true },
  },
  {
    from: 'team-lead',
    text: "When there's work to do, I spawn workers — specialized agents that handle specific projects. A worker reads the plan, executes tasks, commits code, and reports back when done. You'll see their updates here in chat.",
    timestamp: '2026-01-01T00:00:01Z',
    read: true,
    type: 'message',
    metadata: { onboarding: true },
  },
  {
    from: 'team-lead',
    text: 'Your projects live in spaces — each one is a domain like kidsvids, supercharge, or hostreply. Check /spaces to see what\'s active, what\'s pending, and start or stop dev servers.',
    timestamp: '2026-01-01T00:00:02Z',
    read: true,
    type: 'message',
    metadata: { onboarding: true },
  },
  {
    from: 'team-lead',
    text: "When a worker hits a decision it can't make on its own — a design choice, missing info, a judgment call — it creates an escalation. You'll see those on the main dashboard. I'll ping you here when something needs your attention.",
    timestamp: '2026-01-01T00:00:03Z',
    read: true,
    type: 'message',
    metadata: { onboarding: true },
  },
  {
    from: 'team-lead',
    text: 'To get started, just tell me what you want to work on. Or browse /spaces to see your current projects.',
    timestamp: '2026-01-01T00:00:04Z',
    read: true,
    type: 'message',
    metadata: { onboarding: true },
  },
]

function useOnboarding() {
  const [showOnboarding] = useState(
    () => typeof window !== 'undefined' && !localStorage.getItem(ONBOARDING_STORAGE_KEY)
  )

  useEffect(() => {
    if (showOnboarding) {
      const timer = setTimeout(() => {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [showOnboarding])

  return showOnboarding
}

interface AttachedImage {
  file: File
  preview: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:...;base64, prefix
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const ACCEPTED_FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']

export function ChatSection() {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sent, setSent] = useState(false)
  const [waitingForReply, setWaitingForReply] = useState(false)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const lastOrchestratorReplyRef = useRef<string | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isLoadingEarlierRef = useRef(false)
  const dragCounterRef = useRef(0)
  const initialScrollDoneRef = useRef(false)
  const pollRef = useRef<(() => Promise<void>) | null>(null)
  const showOnboarding = useOnboarding()

  // Initial load
  useEffect(() => {
    fetchMessages(true, PAGE_SIZE).then(({ messages: msgs, hasMore: hm }) => {
      setMessages(msgs)
      setHasMore(hm)
    })
  }, [])

  // Poll for new messages every 15s — only fetch last PAGE_SIZE and merge in new ones
  useEffect(() => {
    const poll = async () => {
      const { messages: fresh } = await fetchMessages(true, PAGE_SIZE)
      setMessages(prev => {
        const existingKeys = new Set(prev.map(msgKey))
        const newOnes = fresh.filter(m => !existingKeys.has(msgKey(m)))
        if (newOnes.length === 0) return prev
        return [...prev, ...newOnes].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
      })
    }
    pollRef.current = poll
    const id = setInterval(poll, 15_000)
    return () => clearInterval(id)
  }, [])

  const { data: compactionData } = useQuery<{ events: CompactionEvent[] }>({
    queryKey: ['compaction-events'],
    queryFn: () => fetch('/api/compaction-events').then(r => r.json()),
    refetchInterval: 30_000,
  })

  // Merge onboarding messages with real messages
  const allMessages = useMemo(() => {
    if (!showOnboarding || !messages) return messages
    return [...ONBOARDING_MESSAGES, ...messages]
  }, [showOnboarding, messages])

  const mutation = useMutation({
    mutationFn: ({ text, images }: { text: string; images?: { name: string; data: string }[] }) =>
      sendMessageToOrchestrator(text, images),
    onSuccess: () => {
      if (inputRef.current) {
        inputRef.current.value = ''
        inputRef.current.style.height = 'auto'
      }
      setAttachedImages(prev => {
        prev.forEach(img => URL.revokeObjectURL(img.preview))
        return []
      })
      setSent(true)
      setWaitingForReply(true)
      setTimeout(() => setSent(false), 2000)
      // Immediately poll for the reply instead of waiting for the interval
      setTimeout(() => pollRef.current?.(), 1000)
    },
  })

  const addFiles = useCallback((files: File[]) => {
    const valid = files.filter(f => ACCEPTED_FILE_TYPES.includes(f.type))
    if (valid.length === 0) return
    const newImages = valid.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setAttachedImages(prev => [...prev, ...newImages])
  }, [])

  const removeImage = useCallback((index: number) => {
    setAttachedImages(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = inputRef.current?.value.trim()
    if ((!value && attachedImages.length === 0) || mutation.isPending) return

    let images: { name: string; data: string }[] | undefined
    if (attachedImages.length > 0) {
      images = await Promise.all(
        attachedImages.map(async ({ file }) => ({
          name: file.name,
          data: await fileToBase64(file),
        }))
      )
    }

    mutation.mutate({ text: value || '', images })
  }

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }, [addFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
      e.target.value = ''
    }
  }, [addFiles])

  // Paste handler for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of items) {
        if (item.kind === 'file' && ACCEPTED_FILE_TYPES.includes(item.type)) {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) addFiles(files)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [addFiles])

  const classified = useMemo(() => {
    if (!allMessages) return []
    return allMessages.map(msg => ({ msg, type: classifyMessage(msg) }))
  }, [allMessages])

  // Clear waiting state when a new orchestrator reply arrives
  useEffect(() => {
    if (!classified.length) return
    const latestReply = [...classified]
      .reverse()
      .find(({ msg, type }) => type === 'orchestrator' && (!msg.to || msg.to === 'dashboard-user'))
    const ts = latestReply?.msg.timestamp ?? null
    if (waitingForReply && ts && ts !== lastOrchestratorReplyRef.current) {
      setWaitingForReply(false)
    }
    lastOrchestratorReplyRef.current = ts
  }, [classified, waitingForReply])

  // Group consecutive non-primary messages into activity clusters
  const renderItems = useMemo((): RenderItem[] => {
    if (!classified.length) return []
    const items: RenderItem[] = []
    let cluster: Array<{ msg: InboxMessage; type: MessageType }> = []

    for (const { msg, type } of classified) {
      if (isPrimaryMessage(msg, type)) {
        if (cluster.length > 0) {
          items.push({ kind: 'activity', msgs: [...cluster] })
          cluster = []
        }
        items.push({ kind: 'bubble', msg, type })
      } else {
        cluster.push({ msg, type })
      }
    }
    if (cluster.length > 0) {
      items.push({ kind: 'activity', msgs: cluster })
    }
    return items
  }, [classified])

  // Interleave compaction markers into render items by timestamp
  const itemsWithCompaction = useMemo((): RenderItem[] => {
    const events = compactionData?.events
    if (!events || events.length === 0 || renderItems.length === 0) return renderItems

    // Get timestamp range of visible messages
    const msgTimestamps = classified.map(c => new Date(c.msg.timestamp).getTime())
    const oldest = Math.min(...msgTimestamps)
    const newest = Math.max(...msgTimestamps)

    // Filter compaction events to those within message range
    const relevant = events
      .filter(e => {
        const t = new Date(e.timestamp).getTime()
        return t >= oldest && t <= newest
      })
      .map(e => ({ ...e, time: new Date(e.timestamp).getTime() }))

    if (relevant.length === 0) return renderItems

    // Build a flat list with timestamps for each render item
    // Use the timestamp of the first message in each item
    const getItemTimestamp = (item: RenderItem): number => {
      if (item.kind === 'bubble') return new Date(item.msg.timestamp).getTime()
      if (item.kind === 'activity') return new Date(item.msgs[0].msg.timestamp).getTime()
      return new Date(item.timestamp).getTime()
    }

    const result: RenderItem[] = []
    let eventIdx = 0
    // Sort relevant events by time ascending
    const sortedEvents = [...relevant].sort((a, b) => a.time - b.time)

    for (const item of renderItems) {
      const itemTime = getItemTimestamp(item)
      // Insert any compaction markers that fall before this item
      while (eventIdx < sortedEvents.length && sortedEvents[eventIdx].time <= itemTime) {
        result.push({ kind: 'compaction', timestamp: sortedEvents[eventIdx].timestamp })
        eventIdx++
      }
      result.push(item)
    }
    // Append any remaining compaction events after the last item
    while (eventIdx < sortedEvents.length) {
      result.push({ kind: 'compaction', timestamp: sortedEvents[eventIdx].timestamp })
      eventIdx++
    }

    return result
  }, [renderItems, compactionData, classified])

  // All loaded messages are visible; hasMore controls the "load earlier" button
  const hasEarlierMessages = hasMore
  const visibleItems = itemsWithCompaction

  const loadEarlier = useCallback(async () => {
    if (!hasMore || messages.length === 0) return
    const oldest = messages[0].timestamp
    const container = chatContainerRef.current
    const prevHeight = container?.scrollHeight ?? 0
    isLoadingEarlierRef.current = true
    const { messages: older, hasMore: hm } = await fetchMessages(true, PAGE_SIZE, oldest)
    setMessages(prev => {
      const existingKeys = new Set(prev.map(msgKey))
      const toAdd = older.filter(m => !existingKeys.has(msgKey(m)))
      return [...toAdd, ...prev]
    })
    setHasMore(hm)
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - prevHeight
      isLoadingEarlierRef.current = false
    })
  }, [hasMore, messages])

  // Auto-scroll to bottom for new messages, but not when loading earlier
  useEffect(() => {
    if (isLoadingEarlierRef.current) return
    const container = chatContainerRef.current
    if (!container) return
    // Always scroll to bottom on initial load / page return
    if (!initialScrollDoneRef.current && classified.length > 0) {
      initialScrollDoneRef.current = true
      // Use rAF to ensure flex layout is fully resolved before scrolling
      const rafId = requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
        }
      })
      return () => cancelAnimationFrame(rafId)
    }
    // Only auto-scroll if user is near the bottom (within 150px)
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150
    if (nearBottom) {
      container.scrollTop = container.scrollHeight
    }
  }, [classified])

  return (
    <div
      className="flex flex-col h-[calc(100vh-11rem)] min-w-0"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="relative flex-1 min-h-0 min-w-0">

      <div
        ref={chatContainerRef}
        className={`h-full overflow-y-auto overflow-x-hidden rounded-xl bg-ink/60 p-4 space-y-4 transition-colors ${
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
        ) : classified.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-stone/50">No messages yet</p>
          </div>
        ) : (
          <>
            {hasEarlierMessages && (
              <button
                onClick={loadEarlier}
                className="flex items-center justify-center gap-1 w-full py-1.5 text-[11px] text-stone/50 hover:text-stone/70 transition-colors"
              >
                <ChevronUp className="h-3 w-3" />
                Load earlier messages
              </button>
            )}
            {visibleItems.map((item, i) => {
              if (item.kind === 'compaction') {
                return <CompactionMarker key={`c-${i}`} />
              }
              if (item.kind === 'bubble') {
                if (item.type === 'user') {
                  return <UserBubble key={`b-${i}`} msg={item.msg} />
                }
                return <OrchestratorBubble key={`b-${i}`} msg={item.msg} />
              }
              return <ActivityIndicator key={`a-${i}`} msgs={item.msgs} />
            })}
            {waitingForReply && <TypingIndicator />}
          </>
        )}
      </div>
      </div>

      {attachedImages.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachedImages.map((img, i) => (
            <div key={i} className="relative group">
              {img.file.type === 'application/pdf' ? (
                <div className="h-16 w-16 flex items-center justify-center rounded-lg border border-border-custom bg-ink/40">
                  <FileText className="h-6 w-6 text-stone/60" />
                </div>
              ) : (
                <img
                  src={img.preview}
                  alt={img.file.name}
                  className="h-16 w-16 object-cover rounded-lg border border-border-custom"
                />
              )}
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 bg-ink border border-border-custom rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3 text-stone/70" />
              </button>
              <span className="absolute bottom-0 left-0 right-0 text-[8px] text-parchment/70 bg-ink/80 rounded-b-lg px-1 truncate">
                {img.file.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-2 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,.pdf,application/pdf"
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
          placeholder="Message superbot..."
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
          disabled={mutation.isPending}
          className="shrink-0 p-2.5 rounded-xl text-stone hover:text-parchment hover:bg-surface/40 transition-colors disabled:opacity-25"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {mutation.isError && <span className="text-[10px] text-ember/70 mt-1 ml-1">Failed</span>}
    </div>
  )
}

function CompactionMarker() {
  return (
    <div className="flex items-center gap-2 py-1 my-1">
      <div className="h-px flex-1 bg-border-custom" />
      <span className="text-[10px] text-stone/40 whitespace-nowrap">context compacted</span>
      <div className="h-px flex-1 bg-border-custom" />
    </div>
  )
}

function ActivityIndicator({ msgs }: { msgs: Array<{ msg: InboxMessage; type: MessageType }> }) {
  const coordMsgs = msgs.filter(m => m.type === 'orchestrator' || m.type === 'agent')
  const systemMsgs = msgs.filter(m => m.type === 'system')

  // System-only clusters render as traditional centered labels
  if (coordMsgs.length === 0) {
    return (
      <>
        {systemMsgs.map(({ msg }, i) => (
          <div key={i} className="text-center py-0.5">
            <span className="text-[10px] text-stone/50">{getSystemLabel(msg)} · {formatTime(msg.timestamp)}</span>
          </div>
        ))}
      </>
    )
  }

  const excluded = new Set(['team-lead', 'heartbeat', 'scheduler', 'dashboard-user'])
  const workers = new Set(
    msgs.map(m => m.msg.from).filter(f => f && !excluded.has(f))
  )
  const workerCount = workers.size

  const timestamps = msgs.map(m => new Date(m.msg.timestamp).getTime())
  const durationMs = Math.max(...timestamps) - Math.min(...timestamps)
  const durationMin = Math.round(durationMs / 60000)

  const msgCount = coordMsgs.length

  const parts: string[] = []
  if (workerCount > 0) {
    parts.push(`${workerCount} ${workerCount === 1 ? 'worker' : 'workers'}`)
  }
  if (durationMin > 0) {
    parts.push(`${durationMin} min`)
  }
  parts.push(`${msgCount} ${msgCount === 1 ? 'message' : 'messages'}`)

  return (
    <div className="text-center py-1">
      <span className="text-[10px] text-stone/45">
        {parts.join(' · ')}
      </span>
    </div>
  )
}

function UserBubble({ msg }: { msg: InboxMessage }) {
  const imagePaths = useMemo(
    () => hasImagePaths(msg.text) ? extractImagePaths(msg.text) : [],
    [msg.text]
  )
  const pdfPaths = useMemo(
    () => hasPdfPaths(msg.text) ? extractPdfPaths(msg.text) : [],
    [msg.text]
  )
  const displayText = useMemo(() => {
    let text = msg.text
    if (imagePaths.length > 0) text = stripImagePaths(text)
    if (pdfPaths.length > 0) text = stripPdfPaths(text)
    return text
  }, [msg.text, imagePaths, pdfPaths])

  return (
    <div className="flex justify-end">
      <div className="max-w-[75%]">
        <div className="rounded-2xl rounded-br-md px-4 py-2.5 bg-[rgba(180,160,120,0.15)] overflow-hidden min-w-0">
          <p className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{displayText}</p>
        </div>
        {imagePaths.length > 0 && <ThumbnailGallery paths={imagePaths} />}
        {pdfPaths.length > 0 && <PdfAttachments paths={pdfPaths} />}
        <span className="text-[10px] text-stone/50 block text-right mt-1 mr-1">{formatTime(msg.timestamp)}</span>
      </div>
    </div>
  )
}

function OrchestratorBubble({ msg }: { msg: InboxMessage }) {
  const isOnboarding = !!(msg.metadata as Record<string, unknown> | undefined)?.onboarding
  const isFirstOnboarding = !!(msg.metadata as Record<string, unknown> | undefined)?.first
  const imagePaths = useMemo(
    () => hasImagePaths(msg.text) ? extractImagePaths(msg.text) : [],
    [msg.text]
  )
  const pdfPaths = useMemo(
    () => hasPdfPaths(msg.text) ? extractPdfPaths(msg.text) : [],
    [msg.text]
  )
  const processedText = useMemo(() => {
    let text = msg.text
    if (imagePaths.length > 0) text = stripImagePaths(text)
    if (pdfPaths.length > 0) text = stripPdfPaths(text)
    return text
  }, [msg.text, imagePaths, pdfPaths])

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] overflow-hidden">
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">
          superbot{msg.to && msg.to !== 'dashboard-user' ? ` → ${msg.to}` : ''}
          {isFirstOnboarding && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] bg-sand/15 text-sand/70">Welcome</span>
          )}
        </span>
        <div className={`rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden min-w-0 w-full ${isOnboarding ? 'opacity-85' : ''}`}>
          <MarkdownContent content={processedText} className="text-parchment/80" />
        </div>
        {imagePaths.length > 0 && <ThumbnailGallery paths={imagePaths} />}
        {pdfPaths.length > 0 && <PdfAttachments paths={pdfPaths} />}
        <span className="text-[10px] text-stone/50 block mt-1 ml-1">
          {formatTime(msg.timestamp)}
          {msg.summary && <span className="text-stone/45"> — {msg.summary}</span>}
        </span>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div>
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">superbot</span>
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

