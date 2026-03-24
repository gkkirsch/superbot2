#!/usr/bin/env node
// telegram-watcher.mjs — Long-poll Telegram Bot API, relay messages to superbot2 dashboard
// Usage: node telegram-watcher.mjs
//
// Reads config from ~/.superbot2/config.json (telegram.botToken, telegram.chatId, telegram.enabled)
// Long polls getUpdates with 30s timeout
// Relays inbound messages to POST http://localhost:3274/api/messages
// Monitors orchestrator replies and sends them back to Telegram
// Monitors needs_human escalations and sends rich cards with inline buttons
// Handles /status, /escalations, /recent, /schedule, /todo, /help commands
// Typing indicator while waiting for orchestrator reply

import { readFile, writeFile, readdir, unlink, stat, mkdir } from 'node:fs/promises'
import { existsSync, createWriteStream } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'

const SUPERBOT_DIR = process.env.SUPERBOT2_HOME || join(homedir(), '.superbot2')
const SPACES_DIR = join(SUPERBOT_DIR, 'spaces')
const CONFIG_PATH = join(SUPERBOT_DIR, 'config.json')
const PID_FILE = join(SUPERBOT_DIR, 'telegram.pid')
const LAST_SENT_FILE = join(SUPERBOT_DIR, 'telegram-last-sent-idx.txt')
const LAST_UPDATE_ID_FILE = join(SUPERBOT_DIR, 'telegram-last-update-id.txt')
const SENT_ESCALATIONS_FILE = join(SUPERBOT_DIR, 'telegram-sent-escalations.json')
const MESSAGE_MAP_FILE = join(SUPERBOT_DIR, 'telegram-message-map.json')
const HEARTBEAT_FILE = join(SUPERBOT_DIR, 'telegram-heartbeat.txt')
const ESCALATIONS_DIR = join(SUPERBOT_DIR, 'escalations', 'needs_human')
const SUPERBOT2_NAME = process.env.SUPERBOT2_NAME || 'superbot2'
const TEAM_INBOXES_DIR = join(SUPERBOT_DIR, '.claude', 'teams', SUPERBOT2_NAME, 'inboxes')
const DASHBOARD_API = `http://localhost:${process.env.SUPERBOT2_API_PORT || '3274'}/api`
const TELEGRAM_API = 'https://api.telegram.org/bot'
const POLL_TIMEOUT = 30
const TYPING_INTERVAL = 3000
const REPLY_POLL_INTERVAL = 3000
const ESCALATION_POLL_INTERVAL = 10000

// --- State ---

let botToken = ''
let chatId = ''
let lastUpdateId = -1 // -1 means "not loaded yet, skip old updates on first run"
let lastSentReplyCount = 0
let sentEscalationIds = new Set()
let typingInterval = null
let waitingForReply = false
let shuttingDown = false

// Telegram conversation gating — only forward orchestrator replies when user
// is actively chatting via Telegram, not when messages originate from dashboard
let lastTelegramMessageTime = 0
let replyBaseline = 0
const TELEGRAM_CONVERSATION_TIMEOUT = 2 * 60 * 60 * 1000 // 2 hours

// In-memory map: short callback key -> full escalation ID
// Populated when escalation cards are sent, used when callback buttons are clicked
let callbackMap = new Map() // e.g. "e1" -> "esc-personal-assistant-email-triage-..."
let callbackCounter = 0

// Map: Telegram message_id of sent escalation card -> escalation ID
// Used to detect freeform replies to escalation cards
let escalationMessageMap = new Map() // e.g. 12345 -> "esc-personal-assistant-email-triage-..."

// Message ID tracking for reply threading
// lastUserMessageId: the Telegram message_id of the user's most recent non-command message
// messageMap: maps inbox index -> Telegram message_id of the bot's sent reply
// userMessageAnchors: array of {inboxCountAtSend, telegramMessageId} recording which
//   user message was active when each inbox reply arrived. Used to thread each
//   orchestrator reply back to the correct user message instead of always the latest.
let lastUserMessageId = null
let messageMap = {} // { inboxIdx: telegramMessageId, ... } + { lastUserMessageId }
let userMessageAnchors = [] // [{inboxCountAtSend, telegramMessageId}, ...]
const MAX_MESSAGE_MAP_SIZE = 200 // Keep map bounded
const MAX_ANCHORS = 200 // Keep anchors bounded

// Message editing: track last sent text message for rapid-fire reply coalescing
let lastSentBotMessageId = null // Telegram message_id of the last text reply sent
let lastSentBotMessageTime = 0  // timestamp when it was sent
let lastSentBotMessageText = '' // text content of the last sent message
const EDIT_WINDOW_MS = 5000     // edit instead of new message if within 5 seconds

// --- Helpers ---

function log(msg) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] telegram-watcher: ${msg}`)
}

function logError(msg) {
  const ts = new Date().toISOString()
  console.error(`[${ts}] telegram-watcher: ${msg}`)
}

async function readJsonFile(filePath) {
  try {
    const data = await readFile(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function writeJsonFile(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function loadConfig() {
  const config = await readJsonFile(CONFIG_PATH)
  if (!config?.telegram) return null
  return config.telegram
}

async function saveConfigField(field, value) {
  const config = await readJsonFile(CONFIG_PATH) || {}
  if (!config.telegram) config.telegram = {}
  config.telegram[field] = value
  await writeJsonFile(CONFIG_PATH, config)
}

// --- Image path detection ---

const IMAGE_PATH_RE = /((?:~\/|\/)[^\s]+\.(?:png|jpe?g|gif|webp))/gi

function extractImagePaths(text) {
  IMAGE_PATH_RE.lastIndex = 0
  const paths = []
  let match
  while ((match = IMAGE_PATH_RE.exec(text)) !== null) {
    paths.push(match[1])
  }
  IMAGE_PATH_RE.lastIndex = 0
  return paths
}

function stripImagePaths(text) {
  IMAGE_PATH_RE.lastIndex = 0
  return text.replace(IMAGE_PATH_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

function resolveImagePath(p) {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

async function filterExistingImages(paths) {
  const existing = []
  for (const p of paths) {
    const resolved = resolveImagePath(p)
    try {
      const s = await stat(resolved)
      if (s.isFile()) existing.push(resolved)
    } catch {
      // file doesn't exist, skip
    }
  }
  return existing
}

const UPLOADS_DIR = join(SUPERBOT_DIR, 'uploads')

// --- Download inbound Telegram photos ---

async function downloadTelegramFile(fileId) {
  // Step 1: Get file path from Telegram
  const fileInfo = await tg('getFile', { file_id: fileId })
  if (!fileInfo?.file_path) {
    throw new Error('getFile returned no file_path')
  }

  // Step 2: Download the file
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`
  const ext = extname(fileInfo.file_path) || '.jpg'
  const filename = `telegram-${Date.now()}${ext}`
  const destPath = join(UPLOADS_DIR, filename)

  await mkdir(UPLOADS_DIR, { recursive: true })

  const res = await fetch(downloadUrl)
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  await writeFile(destPath, buffer)
  log(`Downloaded photo: ${destPath} (${buffer.length} bytes)`)
  return destPath
}

// --- Telegram API ---

const MAX_RETRIES = 3
const RETRY_BACKOFF = [1000, 2000, 4000] // exponential backoff

function isRetryableError(err) {
  const msg = (err.message || '').toLowerCase()
  return msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('socket hang up') ||
    msg.includes('aborted')
}

async function tg(method, body) {
  const url = `${TELEGRAM_API}${botToken}/${method}`
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, opts)
      const json = await res.json()
      if (!json.ok) {
        throw new Error(`Telegram API ${method} failed: ${json.description || 'unknown error'}`)
      }
      return json.result
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = RETRY_BACKOFF[attempt - 1] || 4000
        log(`tg(${method}) attempt ${attempt}/${MAX_RETRIES} failed: ${err.message} — retrying in ${delay}ms`)
        await sleep(delay)
        continue
      }
      throw err
    }
  }
}

async function tgMultipart(method, fields, files) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`
      const CRLF = Buffer.from('\r\n')
      const buffers = []

      // Add text fields
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue
        buffers.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
        ))
      }

      // Add file fields
      for (const { field, filePath, filename } of files) {
        const fileData = await readFile(filePath)
        const name = filename || basename(filePath)
        buffers.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`
        ))
        buffers.push(fileData)
        buffers.push(CRLF)
      }

      // Closing boundary
      buffers.push(Buffer.from(`--${boundary}--\r\n`))
      const body = Buffer.concat(buffers)

      const url = `${TELEGRAM_API}${botToken}/${method}`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body,
      })
      const json = await res.json()
      if (!json.ok) {
        throw new Error(`Telegram API ${method} (multipart) failed: ${json.description || 'unknown error'}`)
      }
      return json.result
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = RETRY_BACKOFF[attempt - 1] || 4000
        log(`tgMultipart(${method}) attempt ${attempt}/${MAX_RETRIES} failed: ${err.message} — retrying in ${delay}ms`)
        await sleep(delay)
        continue
      }
      throw err
    }
  }
}

async function sendPhoto(filePath, caption, replyToMessageId) {
  if (!chatId) return null
  const fields = {
    chat_id: chatId,
    ...(caption ? { caption, parse_mode: 'HTML' } : {}),
    ...(replyToMessageId ? { reply_to_message_id: String(replyToMessageId) } : {}),
  }
  return tgMultipart('sendPhoto', fields, [{ field: 'photo', filePath }])
}

async function sendMediaGroup(filePaths, caption, replyToMessageId) {
  if (!chatId) return null
  // sendMediaGroup requires media as JSON array with attach:// references
  // and the actual files as multipart fields
  const media = filePaths.map((_, i) => ({
    type: 'photo',
    media: `attach://photo${i}`,
    ...(i === 0 && caption ? { caption, parse_mode: 'HTML' } : {}),
  }))
  const fields = {
    chat_id: chatId,
    media: JSON.stringify(media),
    ...(replyToMessageId ? { reply_to_message_id: String(replyToMessageId) } : {}),
  }
  const files = filePaths.map((filePath, i) => ({
    field: `photo${i}`,
    filePath,
  }))
  return tgMultipart('sendMediaGroup', fields, files)
}

async function sendMessage(text, opts = {}) {
  if (!chatId) return null
  const body = {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode || 'HTML',
    ...opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {},
    ...opts.replyToMessageId ? { reply_to_message_id: opts.replyToMessageId } : {},
  }
  return tg('sendMessage', body)
}

async function editMessageText(messageId, text, opts = {}) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: opts.parseMode || 'HTML',
    ...opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {},
  }
  return tg('editMessageText', body)
}

async function sendTypingAction() {
  if (!chatId) return
  // Fire-and-forget with short timeout — don't use tg() retry wrapper
  // because retry delays make the typing indicator appear slow.
  // On failure, retry once immediately to maximize indicator visibility.
  const doSend = () => fetch(`${TELEGRAM_API}${botToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    signal: AbortSignal.timeout(5000),
  })
  try {
    doSend().then(r => r.json()).then(j => {
      if (!j.ok) {
        log(`typing action failed, retrying: ${JSON.stringify(j)}`)
        doSend().catch(e => log(`typing retry error: ${e.message}`))
      }
    }).catch(e => {
      log(`typing action error, retrying: ${e.message}`)
      doSend().catch(e2 => log(`typing retry error: ${e2.message}`))
    })
  } catch (err) {
    log(`typing action sync error: ${err.message}`)
  }
}

async function answerCallbackQuery(callbackQueryId, text) {
  try {
    await tg('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text || '',
    })
  } catch {
    // non-critical
  }
}

// --- Typing indicator ---

function startTyping() {
  if (typingInterval) return
  waitingForReply = true
  sendTypingAction()
  typingInterval = setInterval(sendTypingAction, TYPING_INTERVAL)
}

function stopTyping() {
  waitingForReply = false
  if (typingInterval) {
    clearInterval(typingInterval)
    typingInterval = null
  }
}

// --- PID file ---

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function checkPidFile() {
  if (!existsSync(PID_FILE)) return
  try {
    const content = await readFile(PID_FILE, 'utf-8')
    const pid = parseInt(content.trim(), 10)
    if (isNaN(pid)) return
    if (pid === process.pid) return
    if (isProcessRunning(pid)) {
      logError(`Another instance is already running (pid=${pid}). Exiting.`)
      process.exit(1)
    }
    log(`Stale PID file found (pid=${pid} not running). Overwriting.`)
  } catch {
    // Can't read PID file — proceed
  }
}

async function writePidFile() {
  await writeFile(PID_FILE, String(process.pid), 'utf-8')
}

async function removePidFile() {
  try {
    if (existsSync(PID_FILE)) await unlink(PID_FILE)
  } catch { /* ignore */ }
}

// --- Persistence ---

async function loadLastSentCount() {
  try {
    const val = await readFile(LAST_SENT_FILE, 'utf-8')
    const n = parseInt(val.trim(), 10)
    return isNaN(n) ? 0 : n
  } catch {
    return 0
  }
}

async function saveLastSentCount(n) {
  await writeFile(LAST_SENT_FILE, String(n), 'utf-8')
}

async function loadLastUpdateId() {
  try {
    const val = await readFile(LAST_UPDATE_ID_FILE, 'utf-8')
    const n = parseInt(val.trim(), 10)
    return isNaN(n) ? -1 : n
  } catch {
    return -1
  }
}

async function saveLastUpdateId(id) {
  await writeFile(LAST_UPDATE_ID_FILE, String(id), 'utf-8')
}

async function loadSentEscalations() {
  const data = await readJsonFile(SENT_ESCALATIONS_FILE)
  return new Set(Array.isArray(data) ? data : [])
}

async function saveSentEscalations() {
  await writeJsonFile(SENT_ESCALATIONS_FILE, [...sentEscalationIds])
}

async function loadMessageMap() {
  const data = await readJsonFile(MESSAGE_MAP_FILE)
  if (data && typeof data === 'object') {
    if (data.lastUserMessageId) lastUserMessageId = data.lastUserMessageId
    if (Array.isArray(data._userMessageAnchors)) userMessageAnchors = data._userMessageAnchors
    return data
  }
  return {}
}

async function saveMessageMap() {
  // Prune old entries to keep the map bounded
  const keys = Object.keys(messageMap).filter(k => k !== 'lastUserMessageId' && k !== '_userMessageAnchors')
  if (keys.length > MAX_MESSAGE_MAP_SIZE) {
    // Keep only the most recent entries (highest numeric keys)
    const numericKeys = keys.filter(k => !isNaN(parseInt(k, 10))).map(Number).sort((a, b) => a - b)
    const toRemove = numericKeys.slice(0, numericKeys.length - MAX_MESSAGE_MAP_SIZE)
    for (const k of toRemove) {
      delete messageMap[String(k)]
    }
  }
  // Prune old anchors
  if (userMessageAnchors.length > MAX_ANCHORS) {
    userMessageAnchors = userMessageAnchors.slice(-MAX_ANCHORS)
  }
  messageMap.lastUserMessageId = lastUserMessageId
  messageMap._userMessageAnchors = userMessageAnchors
  await writeJsonFile(MESSAGE_MAP_FILE, messageMap)
}

// --- Message processing ---

// Build reply context string when user replies to a bot message
function buildReplyContext(replyToMessage) {
  if (!replyToMessage) return ''
  const replyText = replyToMessage.text || replyToMessage.caption || ''
  if (!replyText.trim()) return ''
  // Truncate long quoted text
  const maxQuoteLen = 200
  const quoted = replyText.length > maxQuoteLen
    ? replyText.slice(0, maxQuoteLen - 3) + '...'
    : replyText
  return `[Replying to: "${quoted}"]\n\n`
}

async function handleTextMessage(text, msg) {
  // Check if this is a freeform reply to an escalation card
  if (msg?.reply_to_message?.message_id && escalationMessageMap.has(msg.reply_to_message.message_id)) {
    const escId = escalationMessageMap.get(msg.reply_to_message.message_id)
    const escFile = join(ESCALATIONS_DIR, `${escId}.json`)
    if (existsSync(escFile)) {
      log(`Freeform escalation reply for ${escId}: ${text.slice(0, 100)}`)
      try {
        await new Promise((resolve, reject) => {
          execFile('bash', [
            join(SUPERBOT_DIR, 'scripts', 'resolve-escalation.sh'),
            escFile,
            '--resolution', text.trim(),
            '--resolved-by', 'user',
          ], { timeout: 10000 }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message))
            else resolve(stdout)
          })
        })
        // Edit the escalation card to show resolved state
        try {
          const origMsg = msg.reply_to_message
          await editMessageText(origMsg.message_id,
            (origMsg.text || '') + `\n\n✅ <b>Resolved:</b> ${escapeHtml(text.trim())}`,
            { replyMarkup: { inline_keyboard: [] } }
          )
        } catch { /* ignore edit failures */ }
        await sendMessage('Escalation resolved.', { replyToMessageId: msg.message_id })
        escalationMessageMap.delete(msg.reply_to_message.message_id)
      } catch (err) {
        logError(`Failed to resolve escalation ${escId} via freeform reply: ${err.message}`)
        await sendMessage('Failed to resolve escalation.')
      }
      return
    } else {
      log(`Escalation file not found for freeform reply: ${escFile} (may already be resolved)`)
      escalationMessageMap.delete(msg.reply_to_message.message_id)
    }
  }

  // Check for bot commands
  const cmd = text.trim().toLowerCase()

  // Bot commands — typing indicator will naturally expire (Telegram 5s window)
  // and stopTyping() is only called when an orchestrator reply is delivered
  if (cmd === '/start') {
    await sendMessage(
      '<b>superbot2 Telegram Bot</b>\n\n' +
      'Connected! Your chat ID has been registered.\n\n' +
      'Send me a message and I\'ll relay it to the orchestrator.\n\n' +
      'Commands:\n' +
      '/status - Portfolio overview\n' +
      '/spaces - Spaces and project details\n' +
      '/escalations - Open escalations needing your input\n' +
      '/workers - Active team members\n' +
      '/recent - Recent session summaries\n' +
      '/schedule - Scheduled jobs\n' +
      '/todo - Your todos\n' +
      '/help - List commands'
    )
    return
  }

  if (cmd === '/help') {
    await sendMessage(
      '<b>Available Commands</b>\n\n' +
      '/status - Portfolio overview (spaces, projects, tasks)\n' +
      '/spaces - Spaces and project details\n' +
      '/escalations - List open escalations with action buttons\n' +
      '/workers - Active team members\n' +
      '/recent - Recent session summaries\n' +
      '/schedule - Scheduled jobs\n' +
      '/todo - Your todos\n' +
      '/help - Show this message\n\n' +
      'Any other message is sent to the superbot2 orchestrator.'
    )
    return
  }

  if (cmd === '/status') {
    await handleStatusCommand()
    return
  }

  if (cmd === '/escalations') {
    await handleEscalationsCommand()
    return
  }

  if (cmd === '/workers') {
    await handleWorkersCommand()
    return
  }

  if (cmd === '/recent') {
    await handleRecentActivityCommand()
    return
  }

  if (cmd === '/schedule') {
    await handleScheduleCommand()
    return
  }

  if (cmd === '/todo') {
    await handleTodosCommand()
    return
  }

  if (cmd === '/spaces') {
    await handleSpacesCommand()
    return
  }

  // Regular message — relay to orchestrator
  // Track the user's message ID for reply threading
  if (msg && msg.message_id) {
    lastUserMessageId = msg.message_id
  }

  // Activate Telegram conversation — set baseline to lastSentReplyCount so we
  // forward any replies that haven't been sent yet, including ones that arrived
  // between the user's message and now (race condition fix).
  replyBaseline = lastSentReplyCount
  try {
    const dashUserInbox = await readJsonFile(join(TEAM_INBOXES_DIR, 'dashboard-user.json')) || []
    const orchestratorReplies = dashUserInbox.filter(m => m.from === 'team-lead')
    if (msg && msg.message_id) {
      userMessageAnchors.push({
        inboxCountAtSend: orchestratorReplies.length,
        telegramMessageId: msg.message_id,
      })
    }
  } catch {
    replyBaseline = lastSentReplyCount
    if (msg && msg.message_id) {
      userMessageAnchors.push({
        inboxCountAtSend: lastSentReplyCount,
        telegramMessageId: msg.message_id,
      })
    }
  }
  lastTelegramMessageTime = Date.now()
  await saveMessageMap()

  // Build the relayed text, prepending reply context if the user replied to a specific message
  const replyContext = msg?.reply_to_message ? buildReplyContext(msg.reply_to_message) : ''
  const relayText = replyContext + text

  startTyping()
  try {
    const res = await fetch(`${DASHBOARD_API}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: relayText }),
    })
    if (!res.ok) {
      logError(`Failed to relay message to dashboard: HTTP ${res.status}`)
      await sendMessage('Failed to relay message to orchestrator.')
    } else {
      log(`Relayed message to orchestrator: ${relayText.slice(0, 80)}...`)
    }
  } catch (err) {
    logError(`Error relaying message: ${err.message}`)
    await sendMessage('Failed to relay message — is the dashboard running?')
  }
}

async function handleStatusCommand() {
  await sendTypingAction()
  const scriptsDir = join(SUPERBOT_DIR, 'scripts')
  const statusScript = join(scriptsDir, 'portfolio-status.sh')

  try {
    const output = await new Promise((resolve, reject) => {
      execFile('bash', [statusScript, '--compact'], { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout)
      })
    })

    const formatted = output.trim() || 'No spaces found.'
    await sendMessage(`<b>Portfolio Status</b>\n\n<pre>${escapeHtml(formatted)}</pre>`)
  } catch (err) {
    logError(`Status command failed: ${err.message}`)
    await sendMessage('Failed to get portfolio status.')
  }
}

async function handleEscalationsCommand() {
  await sendTypingAction()

  try {
    if (!existsSync(ESCALATIONS_DIR)) {
      await sendMessage('No open escalations.')
      return
    }

    const files = await readdir(ESCALATIONS_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    if (jsonFiles.length === 0) {
      await sendMessage('No open escalations.')
      return
    }

    for (const file of jsonFiles) {
      const esc = await readJsonFile(join(ESCALATIONS_DIR, file))
      if (!esc) continue
      await sendEscalationCard(esc)
    }
  } catch (err) {
    logError(`Escalations command failed: ${err.message}`)
    await sendMessage('Failed to list escalations.')
  }
}

async function handleRecentActivityCommand() {
  await sendTypingAction()

  try {
    const sessionsDir = join(SUPERBOT_DIR, 'sessions')
    if (!existsSync(sessionsDir)) {
      await sendMessage('No recent activity.')
      return
    }

    const files = await readdir(sessionsDir)
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 10)

    if (jsonFiles.length === 0) {
      await sendMessage('No recent activity.')
      return
    }

    let text = '<b>Recent Activity</b>\n'

    for (const file of jsonFiles) {
      const session = await readJsonFile(join(sessionsDir, file))
      if (!session) continue

      const ts = session.completedAt || session.id?.replace('session-', '') || '?'
      const spaceProject = `${session.space || '?'}/${session.project || '?'}`
      const worker = session.worker || '?'
      const summary = session.summary || 'No summary'

      // Truncate long summaries
      const shortSummary = summary.length > 200 ? summary.slice(0, 197) + '...' : summary

      text += `\n<b>${escapeHtml(spaceProject)}</b>\n`
      text += `<i>${escapeHtml(ts)}</i>\n`
      text += `Worker: <code>${escapeHtml(worker)}</code>\n`
      text += `${escapeHtml(shortSummary)}\n`
    }

    // Truncate if over Telegram limit
    if (text.length > 4000) {
      text = text.slice(0, 3997) + '...'
    }

    await sendMessage(text)
  } catch (err) {
    logError(`Recent activity command failed: ${err.message}`)
    await sendMessage('Failed to get recent activity.')
  }
}

async function handleScheduleCommand() {
  await sendTypingAction()

  try {
    const config = await readJsonFile(CONFIG_PATH)
    const schedule = config?.schedule

    if (!schedule || !Array.isArray(schedule) || schedule.length === 0) {
      await sendMessage('No scheduled jobs.')
      return
    }

    let text = '<b>Scheduled Jobs</b>\n'

    for (const job of schedule) {
      const name = job.name || '?'
      const time = job.time || '?'
      const space = job.space || '?'
      const task = job.task || 'No description'

      // Truncate long task descriptions
      const shortTask = task.length > 150 ? task.slice(0, 147) + '...' : task

      text += `\n<b>${escapeHtml(name)}</b>\n`
      text += `Schedule: <code>${escapeHtml(time)}</code> | Space: <code>${escapeHtml(space)}</code>\n`
      text += `${escapeHtml(shortTask)}\n`
    }

    if (text.length > 4000) {
      text = text.slice(0, 3997) + '...'
    }

    await sendMessage(text)
  } catch (err) {
    logError(`Schedule command failed: ${err.message}`)
    await sendMessage('Failed to get schedule.')
  }
}

async function handleTodosCommand() {
  await sendTypingAction()

  try {
    const todosPath = join(SUPERBOT_DIR, 'todos.json')
    const todos = await readJsonFile(todosPath)

    if (!todos || !Array.isArray(todos) || todos.length === 0) {
      await sendMessage('No todos yet.')
      return
    }

    let text = '<b>Todos</b>\n'

    for (const todo of todos) {
      const title = todo.title || todo.subject || '?'
      const status = todo.status || '?'
      const notes = todo.notes || ''

      const statusIcon = status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : '⬜'

      text += `\n${statusIcon} <b>${escapeHtml(title)}</b>`
      text += ` <i>(${escapeHtml(status)})</i>\n`
      if (notes) {
        const shortNotes = notes.length > 100 ? notes.slice(0, 97) + '...' : notes
        text += `${escapeHtml(shortNotes)}\n`
      }
    }

    if (text.length > 4000) {
      text = text.slice(0, 3997) + '...'
    }

    await sendMessage(text)
  } catch (err) {
    logError(`Todos command failed: ${err.message}`)
    await sendMessage('Failed to get todos.')
  }
}

async function handleSpacesCommand() {
  await sendTypingAction()

  try {
    if (!existsSync(SPACES_DIR)) {
      await sendMessage('No spaces found.')
      return
    }

    const spaceDirs = await readdir(SPACES_DIR)
    if (spaceDirs.length === 0) {
      await sendMessage('No spaces found.')
      return
    }

    let text = '<b>Spaces</b>\n'

    for (const spaceSlug of spaceDirs.sort()) {
      const spaceDir = join(SPACES_DIR, spaceSlug)
      const spaceJson = await readJsonFile(join(spaceDir, 'space.json'))
      if (!spaceJson) continue

      const name = spaceJson.name || spaceSlug
      const status = spaceJson.status || 'unknown'
      const description = spaceJson.description || ''

      text += `\n<b>${escapeHtml(name)}</b>`
      text += ` <i>(${escapeHtml(status)})</i>\n`
      if (description) {
        text += `${escapeHtml(description)}\n`
      }

      // List projects under plans/
      const plansDir = join(spaceDir, 'plans')
      let projects = []
      try {
        if (existsSync(plansDir)) {
          projects = await readdir(plansDir)
          // Filter to directories that contain a tasks/ folder or plan.md
          const validProjects = []
          for (const p of projects.sort()) {
            const tasksDir = join(plansDir, p, 'tasks')
            const planFile = join(plansDir, p, 'plan.md')
            if (existsSync(tasksDir) || existsSync(planFile)) {
              validProjects.push(p)
            }
          }
          projects = validProjects
        }
      } catch {
        projects = []
      }

      if (projects.length === 0) {
        text += '  No projects\n'
        continue
      }

      for (const project of projects) {
        const tasksDir = join(plansDir, project, 'tasks')
        let totalTasks = 0
        let completedTasks = 0

        try {
          if (existsSync(tasksDir)) {
            const taskFiles = (await readdir(tasksDir)).filter(f => f.endsWith('.json'))
            for (const tf of taskFiles) {
              const task = await readJsonFile(join(tasksDir, tf))
              if (!task) continue
              totalTasks++
              if (task.status === 'completed') completedTasks++
            }
          }
        } catch {
          // ignore task read errors
        }

        const taskInfo = totalTasks > 0
          ? `${completedTasks}/${totalTasks} tasks done`
          : 'no tasks'

        text += `  <code>${escapeHtml(project)}</code> — ${taskInfo}\n`
      }
    }

    if (text.length > 4000) {
      text = text.slice(0, 3997) + '...'
    }

    await sendMessage(text)
  } catch (err) {
    logError(`Spaces command failed: ${err.message}`)
    await sendMessage('Failed to list spaces.')
  }
}

async function handleWorkersCommand() {
  await sendTypingAction()

  try {
    const teamConfigPath = join(SUPERBOT_DIR, '.claude', 'teams', SUPERBOT2_NAME, 'config.json')
    const teamConfig = await readJsonFile(teamConfigPath)

    if (!teamConfig?.members || teamConfig.members.length === 0) {
      await sendMessage('No team members found.')
      return
    }

    let text = '<b>Team Members</b>\n'

    for (const member of teamConfig.members) {
      const name = member.name || '?'
      const type = member.agentType || '?'
      const model = member.model || '?'
      const cwd = member.cwd || ''

      // Derive a short workspace name from cwd
      const workspace = cwd ? basename(cwd) : ''

      text += `\n<b>${escapeHtml(name)}</b>`
      text += ` <i>(${escapeHtml(type)})</i>\n`
      text += `Model: <code>${escapeHtml(model)}</code>`
      if (workspace) text += ` | Dir: <code>${escapeHtml(workspace)}</code>`
      text += '\n'
    }

    if (text.length > 4000) {
      text = text.slice(0, 3997) + '...'
    }

    await sendMessage(text)
  } catch (err) {
    logError(`Workers command failed: ${err.message}`)
    await sendMessage('Failed to list workers.')
  }
}

// --- Escalation cards ---

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Convert standard markdown (from orchestrator) to Telegram-safe HTML.
// Escapes HTML entities first, then converts markdown syntax to HTML tags.
function markdownToTelegramHtml(text) {
  // Step 1: Escape HTML entities
  let out = escapeHtml(text)

  // Step 2: Convert fenced code blocks (```...```) to <pre>
  out = out.replace(/```(?:\w*)\n?([\s\S]*?)```/g, '<pre>$1</pre>')

  // Step 3: Convert inline code (`...`) to <code>
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>')

  // Step 4: Convert bold (**...**) to <b>
  out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

  // Step 5: Convert italic (*...*) to <i> — single asterisks not preceded/followed by *
  out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>')

  // Step 6: Convert markdown links [text](url) to <a href="url">text</a>
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  return out
}

function priorityBadge(priority) {
  switch (priority) {
    case 'critical': return '🔴 CRITICAL'
    case 'high': return '🟠 HIGH'
    case 'medium': return '🟡 MEDIUM'
    case 'low': return '🟢 LOW'
    default: return priority?.toUpperCase() || ''
  }
}

async function sendEscalationCard(esc) {
  const title = esc.question || esc.subject || 'Escalation'
  const badge = priorityBadge(esc.priority)
  const space = esc.space || '?'
  const project = esc.project || '?'
  const context = esc.context || ''

  let text = `<b>${escapeHtml(title)}</b>\n`
  text += `${badge} | ${escapeHtml(space)}/${escapeHtml(project)}\n\n`
  if (context) {
    text += `<blockquote>${escapeHtml(context)}</blockquote>\n`
  }

  // Build inline keyboard with short callback_data keys (Telegram limit: 64 bytes)
  // We register a per-escalation counter so all buttons for one escalation share the same counter
  callbackCounter++
  const escCounter = callbackCounter
  const buttons = []
  if (esc.suggestedAnswers && esc.suggestedAnswers.length > 0) {
    for (let i = 0; i < esc.suggestedAnswers.length; i++) {
      const answer = esc.suggestedAnswers[i]
      const label = answer.label || answer.description || `Option ${i + 1}`
      const shortKey = `e${escCounter}:${i}`
      callbackMap.set(shortKey, esc.id)
      buttons.push([{
        text: label,
        callback_data: shortKey,
      }])
    }
  }

  const replyMarkup = { inline_keyboard: buttons }

  try {
    const sentMsg = await sendMessage(text, { replyMarkup })
    if (sentMsg?.message_id) {
      escalationMessageMap.set(sentMsg.message_id, esc.id)
    }
    log(`Sent escalation card for ${esc.id} (callback keys: e${escCounter}:*, msg_id=${sentMsg?.message_id || '?'})`)
  } catch (err) {
    logError(`Failed to send escalation card for ${esc.id}: ${err.message}`)
  }
}

async function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data || ''
  const callbackId = callbackQuery.id
  const message = callbackQuery.message

  // Callback data format: "e<N>:<answerIdx>" — look up full escalation ID from in-memory map
  if (!data.startsWith('e')) {
    await answerCallbackQuery(callbackId, 'Unknown action')
    return
  }

  const escId = callbackMap.get(data)
  if (!escId) {
    log(`Callback key not found in map: ${data} (bot may have restarted since card was sent)`)
    await answerCallbackQuery(callbackId, 'Session expired — use /escalations to refresh')
    return
  }

  const parts = data.split(':')
  const answerIdx = parseInt(parts[1], 10)

  // Read the escalation to get the answer text
  const escFile = join(ESCALATIONS_DIR, `${escId}.json`)
  let esc = await readJsonFile(escFile)

  // If not in needs_human, try to find it (might have been moved already)
  if (!esc) {
    // Check resolved
    const resolvedFile = join(SUPERBOT_DIR, 'escalations', 'resolved', `${escId}.json`)
    esc = await readJsonFile(resolvedFile)
    if (esc) {
      await answerCallbackQuery(callbackId, 'Already resolved')
      // Update the message to show resolved state
      if (message) {
        try {
          await editMessageText(message.message_id,
            message.text + '\n\n✅ <b>Already resolved</b>',
            { replyMarkup: { inline_keyboard: [] } }
          )
        } catch { /* ignore edit failures */ }
      }
      return
    }
    await answerCallbackQuery(callbackId, 'Escalation not found')
    return
  }

  const answer = esc.suggestedAnswers?.[answerIdx]
  const resolution = answer?.label || answer?.description || `Option ${answerIdx + 1}`

  // Resolve via dashboard API
  try {
    const res = await fetch(`${DASHBOARD_API}/escalations/${encodeURIComponent(escId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      logError(`Failed to resolve escalation ${escId}: HTTP ${res.status} - ${errBody}`)
      await answerCallbackQuery(callbackId, 'Failed to resolve')
      return
    }

    log(`Resolved escalation ${escId}: ${resolution}`)
    await answerCallbackQuery(callbackId, 'Resolved!')

    // Edit the message in place to show resolved state
    if (message) {
      try {
        // Reconstruct text without HTML to avoid parse issues on edit
        const title = esc.question || esc.subject || 'Escalation'
        const badge = priorityBadge(esc.priority)
        const space = esc.space || '?'
        const project = esc.project || '?'

        let newText = `<b>${escapeHtml(title)}</b>\n`
        newText += `${badge} | ${escapeHtml(space)}/${escapeHtml(project)}\n\n`
        newText += `✅ <b>Resolved:</b> ${escapeHtml(resolution)}`

        await editMessageText(message.message_id, newText, {
          replyMarkup: { inline_keyboard: [] },
        })
      } catch (editErr) {
        logError(`Failed to edit message after resolve: ${editErr.message}`)
      }
    }
  } catch (err) {
    logError(`Error resolving escalation ${escId}: ${err.message}`)
    await answerCallbackQuery(callbackId, 'Error resolving')
  }
}

// --- Smart typing detection ---
// If an orchestrator reply mentions spawning a worker or background task,
// stop the typing indicator — the user shouldn't see typing during a long background wait.
const BACKGROUND_TASK_PATTERNS = [
  /\bspawn(ing|ed)?\b.*\bworker\b/i,
  /\bdispatch(ing|ed)?\b.*\bworker\b/i,
  /\bbackground\s+task\b/i,
  /\bworker\s+(started|launched|dispatched|spawned)\b/i,
  /\bkicking off\b.*\bworker\b/i,
  /\bstarting\b.*\bworker\b/i,
  /\bqueued\b.*\b(task|work)\b/i,
]

function mentionsBackgroundWork(text) {
  return BACKGROUND_TASK_PATTERNS.some(p => p.test(text))
}

// --- Reply mirroring ---

// Helper: send a new text reply with HTML -> plain text -> no-threading fallback chain
async function sendNewTextReply(html, plainText, replyToId) {
  try {
    const result = await tg('sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      ...(replyToId ? { reply_to_message_id: replyToId } : {}),
    })
    log(`Sent reply to Telegram (reply_to=${replyToId || 'none'}): ${plainText.slice(0, 60)}...`)
    if (result?.message_id) {
      lastSentBotMessageId = result.message_id
      lastSentBotMessageTime = Date.now()
      lastSentBotMessageText = plainText
    }
    return result
  } catch (err) {
    logError(`Failed to send reply to Telegram: ${err.message}`)
    try {
      const result = await tg('sendMessage', {
        chat_id: chatId,
        text: plainText,
        ...(replyToId ? { reply_to_message_id: replyToId } : {}),
      })
      log(`Sent reply as plain text fallback`)
      if (result?.message_id) {
        lastSentBotMessageId = result.message_id
        lastSentBotMessageTime = Date.now()
        lastSentBotMessageText = plainText
      }
      return result
    } catch (fallbackErr) {
      logError(`Fallback send also failed: ${fallbackErr.message}`)
      try {
        await tg('sendMessage', { chat_id: chatId, text: plainText })
      } catch { /* give up */ }
      return null
    }
  }
}

async function checkForReplies() {
  if (!chatId) return

  try {
    const dashUserInbox = await readJsonFile(join(TEAM_INBOXES_DIR, 'dashboard-user.json')) || []
    const orchestratorReplies = dashUserInbox.filter(m => m.from === 'team-lead')

    // Safety: if the inbox was truncated/recreated, our counter may be too high.
    // Reset to current length to prevent permanently stuck forwarding.
    if (lastSentReplyCount > orchestratorReplies.length) {
      log(`Counter sync: lastSentReplyCount (${lastSentReplyCount}) > inbox length (${orchestratorReplies.length}) — resetting`)
      lastSentReplyCount = orchestratorReplies.length
      await saveLastSentCount(lastSentReplyCount)
    }

    // Always forward unsent replies — no conversation gating.
    // The counter ensures we never send duplicates, and the replyBaseline
    // prevents dumping old messages after a restart.
    const startIdx = Math.max(lastSentReplyCount, replyBaseline)

    if (orchestratorReplies.length <= startIdx) {
      return
    }

    const newReplies = orchestratorReplies.slice(startIdx)

    for (const reply of newReplies) {
      const text = reply.text || reply.content || ''
      if (!text.trim()) continue

      // Track the inbox index for this reply (for future reverse-mapping)
      const replyIdx = startIdx + newReplies.indexOf(reply)

      // Find the correct user message to thread this reply to.
      // Walk the anchors to find the most recent user message sent
      // BEFORE this inbox index — that's the message that triggered this reply.
      let replyToId = lastUserMessageId || null
      if (userMessageAnchors.length > 0) {
        let bestAnchor = null
        for (const anchor of userMessageAnchors) {
          if (anchor.inboxCountAtSend <= replyIdx) {
            bestAnchor = anchor
          }
        }
        if (bestAnchor) {
          replyToId = bestAnchor.telegramMessageId
        }
      }

      // Check for image paths in the message
      const imagePaths = extractImagePaths(text)
      const existingImages = imagePaths.length > 0 ? await filterExistingImages(imagePaths) : []

      let sentResult = null

      if (existingImages.length > 0) {
        // Send images with text as caption
        const textWithoutImages = stripImagePaths(text)
        const truncatedCaption = textWithoutImages.length > 1024
          ? textWithoutImages.slice(0, 1021) + '...'
          : textWithoutImages
        const captionHtml = truncatedCaption ? markdownToTelegramHtml(truncatedCaption) : ''

        try {
          if (existingImages.length === 1) {
            sentResult = await sendPhoto(existingImages[0], captionHtml, replyToId)
            log(`Sent photo to Telegram: ${basename(existingImages[0])}`)
          } else {
            // sendMediaGroup for 2-10 images (Telegram limit)
            const batch = existingImages.slice(0, 10)
            sentResult = await sendMediaGroup(batch, captionHtml, replyToId)
            log(`Sent ${batch.length} photos as album to Telegram`)
          }

          // If caption was truncated and there's significant remaining text, send the rest as a message
          if (textWithoutImages.length > 1024) {
            const remaining = textWithoutImages.slice(1024)
            const truncated = remaining.length > 4000 ? remaining.slice(0, 3997) + '...' : remaining
            const html = markdownToTelegramHtml(truncated)
            try {
              await tg('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML' })
            } catch {
              await tg('sendMessage', { chat_id: chatId, text: truncated }).catch(() => {})
            }
          }
        } catch (err) {
          logError(`Failed to send photo(s) to Telegram: ${err.message}`)
          // Fallback: send as text with paths
          const truncated = text.length > 4000 ? text.slice(0, 3997) + '...' : text
          try {
            sentResult = await tg('sendMessage', {
              chat_id: chatId,
              text: markdownToTelegramHtml(truncated),
              parse_mode: 'HTML',
              ...(replyToId ? { reply_to_message_id: replyToId } : {}),
            })
          } catch {
            await tg('sendMessage', { chat_id: chatId, text: truncated }).catch(() => {})
          }
        }
        // Reset edit tracking — can't edit a photo message into text
        lastSentBotMessageId = null
        lastSentBotMessageText = ''
      } else {
        // No images — send as text with reply threading
        const truncated = text.length > 4000 ? text.slice(0, 3997) + '...' : text
        const html = markdownToTelegramHtml(truncated)

        // Try to edit the previous message if it was sent recently (within 5s)
        const now = Date.now()
        const canEdit = lastSentBotMessageId &&
          (now - lastSentBotMessageTime) < EDIT_WINDOW_MS &&
          lastSentBotMessageText // don't edit if previous was empty

        if (canEdit) {
          // Append new text to previous message with a separator
          const combinedText = lastSentBotMessageText + '\n\n' + truncated
          const combinedTruncated = combinedText.length > 4000
            ? combinedText.slice(0, 3997) + '...'
            : combinedText
          const combinedHtml = markdownToTelegramHtml(combinedTruncated)

          try {
            await editMessageText(lastSentBotMessageId, combinedHtml)
            lastSentBotMessageText = combinedTruncated
            lastSentBotMessageTime = now
            // sentResult stays null — we reuse the existing message_id
            log(`Edited previous message (msg_id=${lastSentBotMessageId}): ${truncated.slice(0, 60)}...`)
          } catch (editErr) {
            logError(`Failed to edit message, sending new: ${editErr.message}`)
            // Fall through to send as new message
            sentResult = await sendNewTextReply(html, truncated, replyToId)
          }
        } else {
          sentResult = await sendNewTextReply(html, truncated, replyToId)
        }
      }

      // Track the sent message ID so we can map it when user replies to it
      if (sentResult?.message_id) {
        messageMap[String(replyIdx)] = sentResult.message_id
      }
    }

    // Smart typing: if any reply mentions spawning a worker/background task,
    // stop typing and don't resume — the user shouldn't see typing during a long wait.
    const anyBackgroundWork = newReplies.some(r => mentionsBackgroundWork(r.text || r.content || ''))
    stopTyping()
    if (anyBackgroundWork) {
      // Prevent typing from being restarted for this conversation turn
      waitingForReply = false
      log('Reply mentions background work — typing indicator suppressed')
    }
    lastSentReplyCount = orchestratorReplies.length
    await saveLastSentCount(lastSentReplyCount)
    await saveMessageMap()
  } catch (err) {
    logError(`Error checking for replies: ${err.message}`)
  }
}

// --- Escalation monitoring ---

async function checkForNewEscalations() {
  try {
    if (!existsSync(ESCALATIONS_DIR)) return

    const files = await readdir(ESCALATIONS_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    for (const file of jsonFiles) {
      const esc = await readJsonFile(join(ESCALATIONS_DIR, file))
      if (!esc || !esc.id) continue

      if (sentEscalationIds.has(esc.id)) continue

      // New escalation — send card
      log(`New escalation: ${esc.id}`)
      await sendEscalationCard(esc)
      sentEscalationIds.add(esc.id)
    }

    await saveSentEscalations()
  } catch (err) {
    logError(`Error checking escalations: ${err.message}`)
  }
}

// --- Long polling ---

async function pollUpdates() {
  // If no persisted offset, do a bootstrap poll with offset=-1 to skip old updates.
  // Telegram returns at most the latest update with offset=-1, which we use only to
  // set our lastUpdateId baseline.
  if (lastUpdateId < 0) {
    log('No persisted update offset — bootstrapping to skip old updates')
    try {
      const bootstrapRes = await fetch(`${TELEGRAM_API}${botToken}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: -1, timeout: 0, allowed_updates: ['message', 'callback_query'] }),
        signal: AbortSignal.timeout(10000),
      })
      const bootstrapJson = await bootstrapRes.json()
      if (bootstrapJson.ok && bootstrapJson.result && bootstrapJson.result.length > 0) {
        const maxId = Math.max(...bootstrapJson.result.map(u => u.update_id))
        lastUpdateId = maxId
        await saveLastUpdateId(lastUpdateId)
        log(`Bootstrap: skipped old updates, offset set to ${lastUpdateId}`)
      } else {
        lastUpdateId = 0
        await saveLastUpdateId(lastUpdateId)
        log('Bootstrap: no pending updates, starting from 0')
      }
    } catch (err) {
      logError(`Bootstrap poll failed: ${err.message}`)
      lastUpdateId = 0
    }
  }

  log(`Polling for updates with offset=${lastUpdateId + 1}`)

  let consecutiveErrors = 0

  while (!shuttingDown) {
    try {
      const body = {
        offset: lastUpdateId + 1,
        timeout: POLL_TIMEOUT,
        allowed_updates: ['message', 'callback_query'],
      }

      const url = `${TELEGRAM_API}${botToken}/getUpdates`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout((POLL_TIMEOUT + 5) * 1000),
      })

      if (!res.ok) {
        let errText = ''
        try { errText = await res.text() } catch { errText = '(could not read response body)' }
        logError(`getUpdates failed: HTTP ${res.status} - ${errText}`)
        consecutiveErrors++
        await sleep(Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000))
        continue
      }

      let json
      try {
        json = await res.json()
      } catch (parseErr) {
        logError(`getUpdates response not valid JSON: ${parseErr.message}`)
        consecutiveErrors++
        await sleep(Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000))
        continue
      }

      if (!json.ok || !json.result) {
        logError(`getUpdates response not ok: ${JSON.stringify(json)}`)
        consecutiveErrors++
        await sleep(Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000))
        continue
      }

      // Successful poll — reset error counter
      consecutiveErrors = 0

      for (const update of json.result) {
        try {
          lastUpdateId = Math.max(lastUpdateId, update.update_id)

          if (update.callback_query) {
            log(`Inbound callback_query [update_id=${update.update_id}]: data=${update.callback_query.data}`)
            await handleCallbackQuery(update.callback_query)
            continue
          }

          if (update.message) {
            const msg = update.message
            const msgChatId = String(msg.chat.id)

            // Auto-detect chatId from first message
            if (!chatId) {
              chatId = msgChatId
              await saveConfigField('chatId', chatId)
              log(`Auto-detected chatId: ${chatId}`)
              await sendMessage('Chat ID registered! You\'re connected to superbot2.')
            }

            // Security: only process messages from authorized chat
            if (msgChatId !== chatId) {
              log(`Ignoring message from unauthorized chat: ${msgChatId}`)
              continue
            }

            // Start typing immediately on any inbound message
            startTyping()

            if (msg.text) {
              const replyInfo = msg.reply_to_message ? ` (reply to msg ${msg.reply_to_message.message_id})` : ''
              log(`Inbound message [update_id=${update.update_id}, msg_id=${msg.message_id}]${replyInfo}: ${msg.text.slice(0, 100)}`)
              await handleTextMessage(msg.text, msg)
            } else if (msg.photo && msg.photo.length > 0) {
              // Telegram sends photos as array of sizes — pick the largest
              const photo = msg.photo[msg.photo.length - 1]
              log(`Inbound photo [update_id=${update.update_id}, msg_id=${msg.message_id}]: file_id=${photo.file_id}`)
              try {
                const localPath = await downloadTelegramFile(photo.file_id)
                // Relay as text message with the local path (and caption if any)
                const caption = msg.caption || ''
                const relayText = caption
                  ? `${caption}\n\n${localPath}`
                  : localPath
                await handleTextMessage(relayText, msg)
              } catch (dlErr) {
                logError(`Failed to download photo: ${dlErr.message}`)
                await sendMessage('Failed to download your photo.')
              }
            } else if (msg.document && msg.document.mime_type?.startsWith('image/')) {
              // Photos sent as files (uncompressed) also come as documents
              log(`Inbound image document [update_id=${update.update_id}, msg_id=${msg.message_id}]: file_id=${msg.document.file_id}`)
              try {
                const localPath = await downloadTelegramFile(msg.document.file_id)
                const caption = msg.caption || ''
                const relayText = caption
                  ? `${caption}\n\n${localPath}`
                  : localPath
                await handleTextMessage(relayText, msg)
              } catch (dlErr) {
                logError(`Failed to download image document: ${dlErr.message}`)
                await sendMessage('Failed to download your image.')
              }
            } else if (msg.document) {
              // Non-image documents (PDF, files, etc.)
              const doc = msg.document
              const docName = doc.file_name || 'unknown'
              log(`Inbound document [update_id=${update.update_id}, msg_id=${msg.message_id}]: ${docName} (${doc.mime_type || 'unknown type'}, file_id=${doc.file_id})`)
              try {
                const localPath = await downloadTelegramFile(doc.file_id)
                const caption = msg.caption || ''
                const relayText = caption
                  ? `${caption}\n\n[File: ${docName}]\n${localPath}`
                  : `[File: ${docName}]\n${localPath}`
                await handleTextMessage(relayText, msg)
              } catch (dlErr) {
                logError(`Failed to download document: ${dlErr.message}`)
                await sendMessage(`Failed to download your file (${docName}).`)
              }
            }
          }
        } catch (updateErr) {
          logError(`Error processing update ${update.update_id}: ${updateErr.message}`)
          // Continue processing remaining updates — don't let one bad update crash the loop
        }
      }

      // Persist offset after processing each batch
      if (json.result.length > 0) {
        await saveLastUpdateId(lastUpdateId)
      }

      // Write heartbeat so watchdog knows we're alive
      await writeFile(HEARTBEAT_FILE, String(Date.now()), 'utf-8')
    } catch (err) {
      if (shuttingDown) break
      // Write heartbeat even on errors — poll timeouts are normal and don't mean we're stuck
      await writeFile(HEARTBEAT_FILE, String(Date.now()), 'utf-8').catch(() => {})
      consecutiveErrors++
      const backoff = Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000)
      logError(`Polling error (consecutive=${consecutiveErrors}, backoff=${backoff}ms): ${err.message}`)
      await sleep(backoff)
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// --- Background loops ---

let replyCheckTimer = null
let escalationCheckTimer = null

function startBackgroundLoops() {
  replyCheckTimer = setInterval(checkForReplies, REPLY_POLL_INTERVAL)
  escalationCheckTimer = setInterval(checkForNewEscalations, ESCALATION_POLL_INTERVAL)
}

function stopBackgroundLoops() {
  if (replyCheckTimer) { clearInterval(replyCheckTimer); replyCheckTimer = null }
  if (escalationCheckTimer) { clearInterval(escalationCheckTimer); escalationCheckTimer = null }
}

// --- Main ---

async function main() {
  log('Starting...')

  // Load config
  const config = await loadConfig()
  if (!config) {
    logError('No telegram config found in config.json. Exiting.')
    process.exit(0)
  }

  if (!config.enabled) {
    log('Telegram not enabled. Exiting.')
    process.exit(0)
  }

  botToken = config.botToken
  if (!botToken) {
    logError('No botToken configured. Exiting.')
    process.exit(0)
  }

  chatId = config.chatId || ''

  // Load persisted state
  lastUpdateId = await loadLastUpdateId()
  lastSentReplyCount = await loadLastSentCount()
  sentEscalationIds = await loadSentEscalations()
  messageMap = await loadMessageMap()

  // Startup counter sync check — detect if inbox was truncated since last run
  try {
    const dashUserInbox = await readJsonFile(join(TEAM_INBOXES_DIR, 'dashboard-user.json')) || []
    const orchestratorReplies = dashUserInbox.filter(m => m.from === 'team-lead')
    if (lastSentReplyCount > orchestratorReplies.length) {
      log(`Startup counter sync: lastSentReplyCount (${lastSentReplyCount}) > inbox length (${orchestratorReplies.length}) — resetting`)
      lastSentReplyCount = orchestratorReplies.length
      await saveLastSentCount(lastSentReplyCount)
    }
  } catch {
    // non-critical — will be caught in checkForReplies too
  }

  // Check for already-running instance, then write PID file
  await checkPidFile()
  await writePidFile()
  log(`PID file written: ${PID_FILE} (pid=${process.pid})`)

  // Verify bot token (retry up to 5 times for transient network issues)
  let connected = false
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const me = await tg('getMe', {})
      log(`Bot connected: @${me.username} (${me.first_name})`)
      connected = true
      break
    } catch (err) {
      logError(`Connection attempt ${attempt}/5 failed: ${err.message}`)
      if (attempt < 5) {
        await new Promise(r => setTimeout(r, 3000))
      }
    }
  }
  if (!connected) {
    logError('Failed to connect to Telegram after 5 attempts')
    await removePidFile()
    process.exit(1)
  }

  if (chatId) {
    log(`Authorized chatId: ${chatId}`)
  } else {
    log('No chatId configured — will auto-detect from first message')
  }

  // Register bot commands menu for autocomplete
  try {
    await tg('setMyCommands', {
      commands: [
        { command: 'status', description: 'Portfolio overview' },
        { command: 'escalations', description: 'Open escalations needing input' },
        { command: 'workers', description: 'Active workers' },
        { command: 'recent', description: 'Recent session summaries' },
        { command: 'schedule', description: 'Scheduled jobs' },
        { command: 'todo', description: 'Your todos' },
        { command: 'spaces', description: 'Spaces and project details' },
        { command: 'help', description: 'List available commands' },
      ],
    })
    log('Bot commands menu registered')
  } catch (err) {
    logError(`Failed to register bot commands: ${err.message}`)
    // Non-critical — commands still work, just no autocomplete
  }

  // Start background loops
  startBackgroundLoops()

  // Start long polling
  await pollUpdates()
}

// --- Shutdown ---

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  log(`Shutting down (${signal})...`)
  stopTyping()
  stopBackgroundLoops()
  await removePidFile()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

main().catch(err => {
  logError(`Fatal error: ${err.message}`)
  removePidFile().finally(() => process.exit(1))
})
