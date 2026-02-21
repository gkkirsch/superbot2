#!/usr/bin/env node
// Parses Claude Code JSONL transcripts and buckets activity into 30-min slots.
// Usage: node parse-activity.mjs [hoursBack]
// Output: JSON array of { ts, tools, messages, sessions }

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SUPERBOT_DIR = process.env.SUPERBOT2_HOME || join(homedir(), '.superbot2')
const CLAUDE_PROJECTS = join(SUPERBOT_DIR, '.claude', 'projects')
const hoursBack = parseInt(process.argv[2] || '24', 10)

async function parseActivity(hoursBack) {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000
  const bucketMs = 30 * 60 * 1000
  const buckets = new Map()

  let projectDirs
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS, { withFileTypes: true })
  } catch {
    console.log('[]')
    return
  }

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue
    const dirPath = join(CLAUDE_PROJECTS, dir.name)

    let files
    try {
      files = (await readdir(dirPath)).filter(f => f.endsWith('.jsonl'))
    } catch { continue }

    for (const file of files) {
      const filePath = join(dirPath, file)
      const st = await stat(filePath)
      if (st.mtimeMs < cutoff) continue

      const content = await readFile(filePath, 'utf-8')
      const sessionId = file.replace('.jsonl', '')

      for (const line of content.split('\n')) {
        if (!line) continue
        try {
          const entry = JSON.parse(line)
          if (!entry.timestamp) continue
          const ts = new Date(entry.timestamp).getTime()
          if (ts < cutoff) continue

          const bucketStart = ts - (ts % bucketMs)

          if (!buckets.has(bucketStart)) {
            buckets.set(bucketStart, { ts: new Date(bucketStart).toISOString(), tools: 0, messages: 0, sessions: new Set(), skills: new Set(), subagents: new Set() })
          }
          const b = buckets.get(bucketStart)
          b.sessions.add(sessionId)

          if (entry.type === 'assistant' && entry.message?.content) {
            for (const block of entry.message.content) {
              if (block.type === 'tool_use') {
                b.tools++
                if (block.name === 'Skill' && block.input?.skill) {
                  b.skills.add(block.input.skill)
                }
                if (block.name === 'Task' && block.input?.subagent_type) {
                  b.subagents.add(block.input.subagent_type)
                }
              }
            }
            b.messages++
          } else if (entry.type === 'user') {
            b.messages++
          }
        } catch { /* skip malformed lines */ }
      }
    }
  }

  const sorted = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      ts: v.ts, tools: v.tools, messages: v.messages, sessions: v.sessions.size,
      skills: [...v.skills], subagents: [...v.subagents]
    }))

  console.log(JSON.stringify(sorted))
}

parseActivity(hoursBack)
