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

import { readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'

const SUPERBOT_DIR = process.env.SUPERBOT2_HOME || join(homedir(), '.superbot2')
const SPACES_DIR = join(SUPERBOT_DIR, 'spaces')
const CONFIG_PATH = join(SUPERBOT_DIR, 'config.json')
const PID_FILE = join(SUPERBOT_DIR, 'telegram.pid')
const LAST_SENT_FILE = join(SUPERBOT_DIR, 'telegram-last-sent-idx.txt')
const LAST_UPDATE_ID_FILE = join(SUPERBOT_DIR, 'telegram-last-update-id.txt')
const SENT_ESCALATIONS_FILE = join(SUPERBOT_DIR, 'telegram-sent-escalations.json')
const ESCALATIONS_DIR = join(SUPERBOT_DIR, 'escalations', 'needs_human')
const SUPERBOT2_NAME = process.env.SUPERBOT2_NAME || 'superbot2'
const TEAM_INBOXES_DIR = join(SUPERBOT_DIR, '.claude', 'teams', SUPERBOT2_NAME, 'inboxes')
const DASHBOARD_API = 'http://localhost:3274/api'
const TELEGRAM_API = 'https://api.telegram.org/bot'
const POLL_TIMEOUT = 30
const TYPING_INTERVAL = 4000
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

// In-memory map: short callback key -> full escalation ID
// Populated when escalation cards are sent, used when callback buttons are clicked
let callbackMap = new Map() // e.g. "e1" -> "esc-personal-assistant-email-triage-..."
let callbackCounter = 0

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

// --- Telegram API ---

async function tg(method, body) {
  const url = `${TELEGRAM_API}${botToken}/${method}`
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  if (!json.ok) {
    throw new Error(`Telegram API ${method} failed: ${json.description || 'unknown error'}`)
  }
  return json.result
}

async function sendMessage(text, opts = {}) {
  if (!chatId) return null
  const body = {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode || 'HTML',
    ...opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {},
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
  try {
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
  } catch {
    // typing action failures are non-critical
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

// --- Message processing ---

async function handleTextMessage(text) {
  // Check for bot commands
  const cmd = text.trim().toLowerCase()

  if (cmd === '/start') {
    await sendMessage(
      '<b>superbot2 Telegram Bot</b>\n\n' +
      'Connected! Your chat ID has been registered.\n\n' +
      'Send me a message and I\'ll relay it to the orchestrator.\n\n' +
      'Commands:\n' +
      '/status - Portfolio overview\n' +
      '/spaces - Spaces and project details\n' +
      '/escalations - Open escalations needing your input\n' +
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
  startTyping()
  try {
    const res = await fetch(`${DASHBOARD_API}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      logError(`Failed to relay message to dashboard: HTTP ${res.status}`)
      stopTyping()
      await sendMessage('Failed to relay message to orchestrator.')
    } else {
      log(`Relayed message to orchestrator: ${text.slice(0, 60)}...`)
    }
  } catch (err) {
    logError(`Error relaying message: ${err.message}`)
    stopTyping()
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
    await sendMessage(text, { replyMarkup })
    log(`Sent escalation card for ${esc.id} (callback keys: e${escCounter}:*)`)
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

// --- Reply mirroring ---

async function checkForReplies() {
  if (!chatId) return

  try {
    const dashUserInbox = await readJsonFile(join(TEAM_INBOXES_DIR, 'dashboard-user.json')) || []
    const orchestratorReplies = dashUserInbox.filter(m => m.from === 'team-lead')

    if (orchestratorReplies.length <= lastSentReplyCount) {
      return
    }

    const newReplies = orchestratorReplies.slice(lastSentReplyCount)

    for (const reply of newReplies) {
      const text = reply.text || reply.content || ''
      if (!text.trim()) continue

      // Truncate very long messages for Telegram (4096 char limit)
      const truncated = text.length > 4000 ? text.slice(0, 3997) + '...' : text

      // Convert orchestrator markdown to Telegram-safe HTML
      const html = markdownToTelegramHtml(truncated)

      try {
        await tg('sendMessage', {
          chat_id: chatId,
          text: html,
          parse_mode: 'HTML',
        })
        log(`Sent reply to Telegram: ${truncated.slice(0, 60)}...`)
      } catch (err) {
        logError(`Failed to send reply to Telegram: ${err.message}`)
        // Fallback: send as plain text if HTML parsing fails
        try {
          await tg('sendMessage', {
            chat_id: chatId,
            text: truncated,
          })
          log(`Sent reply as plain text fallback`)
        } catch (fallbackErr) {
          logError(`Fallback send also failed: ${fallbackErr.message}`)
        }
      }
    }

    stopTyping()
    lastSentReplyCount = orchestratorReplies.length
    await saveLastSentCount(lastSentReplyCount)
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
        const errText = await res.text()
        logError(`getUpdates failed: HTTP ${res.status} - ${errText}`)
        await sleep(5000)
        continue
      }

      const json = await res.json()
      if (!json.ok || !json.result) {
        logError(`getUpdates response not ok: ${JSON.stringify(json)}`)
        await sleep(5000)
        continue
      }

      for (const update of json.result) {
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

          if (msg.text) {
            log(`Inbound message [update_id=${update.update_id}]: ${msg.text.slice(0, 100)}`)
            await handleTextMessage(msg.text)
          }
        }
      }

      // Persist offset after processing each batch
      if (json.result.length > 0) {
        await saveLastUpdateId(lastUpdateId)
      }
    } catch (err) {
      if (shuttingDown) break
      logError(`Polling error: ${err.message}`)
      await sleep(5000)
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

  // Write PID file
  await writePidFile()
  log(`PID file written: ${PID_FILE} (pid=${process.pid})`)

  // Verify bot token
  try {
    const me = await tg('getMe', {})
    log(`Bot connected: @${me.username} (${me.first_name})`)
  } catch (err) {
    logError(`Failed to connect to Telegram: ${err.message}`)
    await removePidFile()
    process.exit(1)
  }

  if (chatId) {
    log(`Authorized chatId: ${chatId}`)
  } else {
    log('No chatId configured — will auto-detect from first message')
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
