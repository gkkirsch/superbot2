import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendMessageToOrchestrator } from '@/lib/api'
import { useMessages } from '@/hooks/useSpaces'
import { MarkdownContent } from '@/features/MarkdownContent'
import type { InboxMessage } from '@/lib/types'

// --- Inline image detection ---

const IMAGE_PATH_RE = /((?:~\/|\/)[^\s]+\.(?:png|jpe?g|gif|webp))/gi

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
                className="h-20 w-auto object-cover"
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

/** Renders plain text with image thumbnails below */
function TextWithInlineImages({ text, className }: { text: string; className?: string }) {
  const imagePaths = useMemo(() => extractImagePaths(text), [text])
  const strippedText = useMemo(() => stripImagePaths(text), [text])

  return (
    <div className={className}>
      {strippedText && <span>{strippedText}</span>}
      <ThumbnailGallery paths={imagePaths} />
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

type RenderItem =
  | { kind: 'bubble'; msg: InboxMessage; type: MessageType }
  | { kind: 'activity'; msgs: Array<{ msg: InboxMessage; type: MessageType }> }

function isPrimaryMessage(msg: InboxMessage, type: MessageType): boolean {
  if (type === 'user') return true
  if (type === 'orchestrator' && (!msg.to || msg.to === 'dashboard-user')) return true
  return false
}

export function ChatSection() {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [waitingForReply, setWaitingForReply] = useState(false)
  const lastOrchestratorReplyRef = useRef<string | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  // Always fetch background messages so we have orchestrator-worker activity
  const { data: messages } = useMessages(true)

  const mutation = useMutation({
    mutationFn: (message: string) => sendMessageToOrchestrator(message),
    onSuccess: () => {
      setText('')
      setSent(true)
      setWaitingForReply(true)
      setTimeout(() => setSent(false), 2000)
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim() && !mutation.isPending) {
      mutation.mutate(text.trim())
    }
  }

  const classified = useMemo(() => {
    if (!messages) return []
    return messages.map(msg => ({ msg, type: classifyMessage(msg) }))
  }, [messages])

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

  useEffect(() => {
    const container = chatContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [classified])

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-3">
        <h2 className="font-heading text-xl text-parchment">Chat</h2>
      </div>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto rounded-xl bg-ink/60 p-4 space-y-4 min-h-0">
        {classified.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-stone/50">No messages yet</p>
          </div>
        ) : (
          <>
            {renderItems.map((item, i) => {
              if (item.kind === 'bubble') {
                if (item.type === 'user') {
                  return (
                    <div key={`b-${i}`} className="flex justify-end">
                      <div className="max-w-[75%]">
                        <div className="rounded-2xl rounded-br-md px-4 py-2.5 bg-[rgba(180,160,120,0.15)] overflow-hidden min-w-0">
                          {hasImagePaths(item.msg.text) ? (
                            <TextWithInlineImages text={item.msg.text} className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]" />
                          ) : (
                            <p className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{item.msg.text}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-stone/50 block text-right mt-1 mr-1">{formatTime(item.msg.timestamp)}</span>
                      </div>
                    </div>
                  )
                }
                return <OrchestratorBubble key={`b-${i}`} msg={item.msg} />
              }
              return <ActivityIndicator key={`a-${i}`} msgs={item.msgs} />
            })}
            {waitingForReply && <TypingIndicator />}
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message superbot..."
          className="flex-1 bg-ink/80 border border-border-custom rounded-xl px-4 py-2.5 text-sm text-parchment placeholder:text-stone/45 focus:outline-none focus:border-stone/30 transition-colors"
        />
        <button
          type="submit"
          disabled={!text.trim() || mutation.isPending}
          className="shrink-0 p-2.5 rounded-xl text-stone hover:text-parchment hover:bg-surface/40 transition-colors disabled:opacity-25"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {sent && <span className="text-[10px] text-moss/70 mt-1 ml-1">Sent</span>}
      {mutation.isError && <span className="text-[10px] text-ember/70 mt-1 ml-1">Failed</span>}
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

function OrchestratorBubble({ msg }: { msg: InboxMessage }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = msg.text.length > 500
  const imagePaths = useMemo(
    () => hasImagePaths(msg.text) ? extractImagePaths(msg.text) : [],
    [msg.text]
  )
  const processedText = useMemo(
    () => imagePaths.length > 0 ? stripImagePaths(msg.text) : msg.text,
    [msg.text, imagePaths]
  )

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] overflow-hidden">
        <span className="text-[10px] text-stone/55 ml-1 mb-0.5 block">
          superbot{msg.to && msg.to !== 'dashboard-user' ? ` → ${msg.to}` : ''}
        </span>
        <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[rgba(120,140,160,0.12)] overflow-hidden min-w-0 w-full">
          {isLong && !expanded ? (
            <>
              <div className="max-h-32 overflow-hidden">
                <MarkdownContent content={processedText} className="text-parchment/80" />
              </div>
              <button onClick={() => setExpanded(true)} className="text-xs text-stone/50 mt-1.5">
                Show more
              </button>
            </>
          ) : (
            <>
              <MarkdownContent content={processedText} className="text-parchment/80" />
              {isLong && (
                <button onClick={() => setExpanded(false)} className="text-xs text-stone/50 mt-1.5">
                  Show less
                </button>
              )}
            </>
          )}
          {imagePaths.length > 0 && <ThumbnailGallery paths={imagePaths} />}
        </div>
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

