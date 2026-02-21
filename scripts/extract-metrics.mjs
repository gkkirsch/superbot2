#!/usr/bin/env node
// Extracts metrics from Claude Code JSONL conversation logs for self-improvement analysis.
// Usage: node extract-metrics.mjs [--days N] [--output path]
// Output: Structured JSON summary of tool usage, errors, sessions, patterns.

import { createReadStream } from 'node:fs'
import { readdir, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'
import { writeFile } from 'node:fs/promises'

const SUPERBOT_DIR = process.env.SUPERBOT2_HOME || join(homedir(), '.superbot2')
const CLAUDE_PROJECTS = join(SUPERBOT_DIR, '.claude', 'projects')

// Parse CLI args
const args = process.argv.slice(2)
let daysBack = 30
let outputPath = null

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days' && args[i + 1]) daysBack = parseInt(args[i + 1], 10)
  if (args[i] === '--output' && args[i + 1]) outputPath = args[i + 1]
}

const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000

// ── Metrics accumulators ──

const metrics = {
  meta: {
    extractedAt: new Date().toISOString(),
    daysAnalyzed: daysBack,
    cutoffDate: new Date(cutoff).toISOString(),
    totalFiles: 0,
    totalLines: 0,
    totalBytes: 0,
    parseErrors: 0,
  },

  sessions: {
    count: 0,
    totalDurationMinutes: 0,
    avgDurationMinutes: 0,
    byProject: {},  // projectSlug → { count, totalMinutes }
    byAgent: {},    // agentName → { count, totalMinutes }
  },

  tools: {
    totalCalls: 0,
    byName: {},       // toolName → { calls, errors }
    errorRate: 0,
    topErrors: [],    // { tool, errorSnippet, count }
  },

  tokens: {
    totalInput: 0,
    totalOutput: 0,
    totalCacheCreation: 0,
    totalCacheRead: 0,
    cacheHitRate: 0,
    byModel: {},  // modelId → { input, output, calls }
  },

  skills: {
    totalInvocations: 0,
    byName: {},  // skillName → count
  },

  teamCoordination: {
    totalMessages: 0,
    byAgent: {},      // agentName → { sent, received }
    messageTypes: {},  // type → count
  },

  escalations: {
    totalCreated: 0,
    byType: {},     // type → count
    bySpace: {},    // space → count
  },

  errorPatterns: {
    toolErrors: {},    // toolName → { errorSnippet → count }
    retryPatterns: [], // { tool, consecutiveAttempts, context }
  },

  workflows: {
    commonToolSequences: {},  // "Tool1→Tool2→Tool3" → count
    avgToolsPerTurn: 0,
  },
}

// ── Session tracking ──

const sessionData = new Map()  // sessionId → { firstTs, lastTs, project, agent, toolCalls: [] }
const errorSnippets = new Map()  // "toolName:snippet" → count
const toolSequences = new Map()  // "A→B→C" → count
const toolUseIdToName = new Map()  // tool_use_id → toolName (for error attribution)

// ── Stream processor ──

async function processLine(line, projectSlug, sessionId) {
  if (!line.trim()) return

  metrics.meta.totalLines++

  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    metrics.meta.parseErrors++
    return
  }

  // Skip non-conversation entries
  if (entry.type === 'file-history-snapshot') return

  const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : null
  if (ts && ts < cutoff) return

  // Session tracking
  const sid = entry.sessionId || sessionId
  if (sid && ts) {
    if (!sessionData.has(sid)) {
      sessionData.set(sid, {
        firstTs: ts,
        lastTs: ts,
        project: projectSlug,
        agent: entry.agentName || entry.teamName || 'unknown',
        toolSequence: [],
      })
    }
    const sd = sessionData.get(sid)
    if (ts < sd.firstTs) sd.firstTs = ts
    if (ts > sd.lastTs) sd.lastTs = ts
  }

  // Assistant messages — tool usage, tokens
  if (entry.type === 'assistant' && entry.message) {
    const msg = entry.message

    // Token accounting
    if (msg.usage) {
      const u = msg.usage
      metrics.tokens.totalInput += u.input_tokens || 0
      metrics.tokens.totalOutput += u.output_tokens || 0
      metrics.tokens.totalCacheCreation += u.cache_creation_input_tokens || 0
      metrics.tokens.totalCacheRead += u.cache_read_input_tokens || 0

      const model = msg.model || 'unknown'
      if (!metrics.tokens.byModel[model]) {
        metrics.tokens.byModel[model] = { input: 0, output: 0, calls: 0 }
      }
      metrics.tokens.byModel[model].input += u.input_tokens || 0
      metrics.tokens.byModel[model].output += u.output_tokens || 0
      metrics.tokens.byModel[model].calls++
    }

    // Tool calls
    if (Array.isArray(msg.content)) {
      const turnTools = []
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          const toolName = block.name || 'unknown'
          metrics.tools.totalCalls++

          if (!metrics.tools.byName[toolName]) {
            metrics.tools.byName[toolName] = { calls: 0, errors: 0 }
          }
          metrics.tools.byName[toolName].calls++
          turnTools.push(toolName)

          // Map tool_use_id to name for error attribution
          if (block.id) toolUseIdToName.set(block.id, toolName)

          // Track skill usage
          if (toolName === 'Skill' && block.input?.skill) {
            metrics.skills.totalInvocations++
            const skillName = block.input.skill
            metrics.skills.byName[skillName] = (metrics.skills.byName[skillName] || 0) + 1
          }

          // Track SendMessage for team coordination
          if (toolName === 'SendMessage' && block.input) {
            metrics.teamCoordination.totalMessages++
            const msgType = block.input.type || 'unknown'
            metrics.teamCoordination.messageTypes[msgType] =
              (metrics.teamCoordination.messageTypes[msgType] || 0) + 1

            const agent = entry.agentName || 'unknown'
            if (!metrics.teamCoordination.byAgent[agent]) {
              metrics.teamCoordination.byAgent[agent] = { sent: 0, received: 0 }
            }
            metrics.teamCoordination.byAgent[agent].sent++

            if (block.input.recipient) {
              const recipient = block.input.recipient
              if (!metrics.teamCoordination.byAgent[recipient]) {
                metrics.teamCoordination.byAgent[recipient] = { sent: 0, received: 0 }
              }
              metrics.teamCoordination.byAgent[recipient].received++
            }
          }

          // Track escalation creation
          if (toolName === 'Bash' && block.input?.command?.includes('create-escalation.sh')) {
            metrics.escalations.totalCreated++
            const cmd = block.input.command
            const typeMatch = cmd.match(/create-escalation\.sh\s+(\w+)/)
            if (typeMatch) {
              const escType = typeMatch[1]
              metrics.escalations.byType[escType] = (metrics.escalations.byType[escType] || 0) + 1
            }
            const spaceMatch = cmd.match(/create-escalation\.sh\s+\w+\s+(\w[\w-]*)/)
            if (spaceMatch) {
              const space = spaceMatch[1]
              metrics.escalations.bySpace[space] = (metrics.escalations.bySpace[space] || 0) + 1
            }
          }
        }
      }

      // Track tool sequences (sliding window of 3)
      if (sid && sessionData.has(sid)) {
        const sd = sessionData.get(sid)
        sd.toolSequence.push(...turnTools)
      }
    }
  }

  // User messages — check for tool_result errors
  if (entry.type === 'user' && entry.message) {
    const content = Array.isArray(entry.message.content) ? entry.message.content :
      (typeof entry.message.content === 'string' ? [] : [entry.message.content])

    for (const block of content) {
      if (block?.type === 'tool_result' && block.is_error) {
        // Find which tool this was for (best effort)
        const errorContent = typeof block.content === 'string' ? block.content :
          (Array.isArray(block.content) ? block.content.map(c => c.text || '').join(' ') : '')
        const snippet = errorContent.slice(0, 120).replace(/\n/g, ' ')

        // Look up which tool caused this error
        const toolName = (block.tool_use_id && toolUseIdToName.get(block.tool_use_id)) || 'unknown'
        if (metrics.tools.byName[toolName]) {
          metrics.tools.byName[toolName].errors++
        }
        const key = `${toolName}:${snippet.slice(0, 60)}`
        errorSnippets.set(key, (errorSnippets.get(key) || 0) + 1)
      }
    }
  }
}

async function processJsonlFile(filePath, projectSlug) {
  const fileInfo = await stat(filePath)
  metrics.meta.totalBytes += fileInfo.size

  // Skip files not modified within our window
  if (fileInfo.mtimeMs < cutoff) return

  metrics.meta.totalFiles++

  const sessionId = filePath.split('/').pop().replace('.jsonl', '')

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })

    rl.on('line', (line) => {
      processLine(line, projectSlug, sessionId)
    })

    rl.on('close', resolve)
    rl.on('error', reject)
  })
}

async function findJsonlFiles(dir) {
  const results = []

  async function walk(currentDir, depth = 0) {
    if (depth > 4) return  // Don't go too deep

    let entries
    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch { return }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(fullPath)
      } else if (entry.isDirectory() && entry.name !== 'memory') {
        await walk(fullPath, depth + 1)
      }
    }
  }

  await walk(dir)
  return results
}

// ── Finalize metrics ──

function finalizeMetrics() {
  // Session stats
  for (const [sid, sd] of sessionData) {
    metrics.sessions.count++
    const durationMin = (sd.lastTs - sd.firstTs) / 1000 / 60
    metrics.sessions.totalDurationMinutes += durationMin

    const proj = sd.project
    if (!metrics.sessions.byProject[proj]) {
      metrics.sessions.byProject[proj] = { count: 0, totalMinutes: 0 }
    }
    metrics.sessions.byProject[proj].count++
    metrics.sessions.byProject[proj].totalMinutes += durationMin

    const agent = sd.agent
    if (!metrics.sessions.byAgent[agent]) {
      metrics.sessions.byAgent[agent] = { count: 0, totalMinutes: 0 }
    }
    metrics.sessions.byAgent[agent].count++
    metrics.sessions.byAgent[agent].totalMinutes += durationMin

    // Build tool sequences
    const seq = sd.toolSequence
    for (let i = 0; i + 2 < seq.length; i++) {
      const key = `${seq[i]}→${seq[i + 1]}→${seq[i + 2]}`
      toolSequences.set(key, (toolSequences.get(key) || 0) + 1)
    }
  }

  if (metrics.sessions.count > 0) {
    metrics.sessions.avgDurationMinutes =
      Math.round(metrics.sessions.totalDurationMinutes / metrics.sessions.count * 10) / 10
  }

  // Round session minutes
  metrics.sessions.totalDurationMinutes = Math.round(metrics.sessions.totalDurationMinutes)
  for (const proj of Object.values(metrics.sessions.byProject)) {
    proj.totalMinutes = Math.round(proj.totalMinutes)
  }
  for (const agent of Object.values(metrics.sessions.byAgent)) {
    agent.totalMinutes = Math.round(agent.totalMinutes)
  }

  // Tool error rate
  let totalErrors = 0
  for (const t of Object.values(metrics.tools.byName)) {
    totalErrors += t.errors
  }
  metrics.tools.errorRate = metrics.tools.totalCalls > 0
    ? Math.round(totalErrors / metrics.tools.totalCalls * 10000) / 100
    : 0

  // Top error snippets
  metrics.tools.topErrors = [...errorSnippets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, count]) => {
      const [tool, snippet] = key.split(':')
      return { tool, errorSnippet: snippet, count }
    })

  // Cache hit rate
  const totalCacheInput = metrics.tokens.totalCacheCreation + metrics.tokens.totalCacheRead
  if (totalCacheInput > 0) {
    metrics.tokens.cacheHitRate =
      Math.round(metrics.tokens.totalCacheRead / totalCacheInput * 10000) / 100
  }

  // Top tool sequences
  metrics.workflows.commonToolSequences = Object.fromEntries(
    [...toolSequences.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
  )

  if (metrics.tools.totalCalls > 0 && metrics.sessions.count > 0) {
    metrics.workflows.avgToolsPerTurn =
      Math.round(metrics.tools.totalCalls / metrics.meta.totalLines * 100) / 100
  }

  // Clean up large intermediate structures
  delete metrics.errorPatterns
}

// ── Main ──

async function main() {
  let projectDirs
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS, { withFileTypes: true })
  } catch (err) {
    console.error('Cannot read', CLAUDE_PROJECTS, err.message)
    process.exit(1)
  }

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue
    const dirPath = join(CLAUDE_PROJECTS, dir.name)
    const projectSlug = dir.name

    const jsonlFiles = await findJsonlFiles(dirPath)

    for (const filePath of jsonlFiles) {
      try {
        await processJsonlFile(filePath, projectSlug)
      } catch (err) {
        // Skip files that can't be read
        metrics.meta.parseErrors++
      }
    }
  }

  finalizeMetrics()

  const output = JSON.stringify(metrics, null, 2)

  if (outputPath) {
    await writeFile(outputPath, output, 'utf-8')
    console.error(`Metrics written to ${outputPath} (${(Buffer.byteLength(output) / 1024).toFixed(1)}KB)`)
  } else {
    console.log(output)
  }
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
