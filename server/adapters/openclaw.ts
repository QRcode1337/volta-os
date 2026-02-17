import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { MemoryAdapter, MemoryDocument } from './types'

/**
 * Reads completed tasks and agent memories from the OpenClaw flow state directory.
 */
export class OpenClawAdapter implements MemoryAdapter {
  name = 'openclaw'
  private flowDir: string
  private maxContentLength: number
  private seenHashes = new Set<string>()

  constructor(flowDir: string, maxContentLength = 8000) {
    this.flowDir = flowDir
    this.maxContentLength = maxContentLength
  }

  isAvailable(): boolean {
    return fs.existsSync(this.flowDir)
  }

  async getNewDocuments(since?: Date): Promise<MemoryDocument[]> {
    const docs: MemoryDocument[] = []

    // Index completed tasks from state.json
    const statePath = path.join(this.flowDir, 'state.json')
    if (fs.existsSync(statePath)) {
      try {
        const stat = fs.statSync(statePath)
        if (!since || stat.mtime >= since) {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))

          if (state.tasks) {
            for (const [id, task] of Object.entries(state.tasks as Record<string, any>)) {
              if (task.status !== 'completed') continue

              const content = [
                `Task Completed: ${task.title || id}`,
                task.result ? `Result: ${JSON.stringify(task.result).slice(0, 2000)}` : ''
              ].filter(Boolean).join('\n')

              const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
              if (this.seenHashes.has(hash)) continue
              this.seenHashes.add(hash)

              docs.push({
                content: content.slice(0, this.maxContentLength),
                title: `Task: ${task.title || id}`,
                source: 'openclaw',
                metadata: { task_id: id, file_hash: hash, status: 'completed' },
                tags: ['source:openclaw', 'type:task-result', 'auto-indexed']
              })
            }
          }
        }
      } catch { /* skip malformed state */ }
    }

    // Index agent memories from memory.json
    const memoryPath = path.join(this.flowDir, 'memory.json')
    if (fs.existsSync(memoryPath)) {
      try {
        const stat = fs.statSync(memoryPath)
        if (!since || stat.mtime >= since) {
          const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'))

          for (const [key, value] of Object.entries(memory)) {
            const content = typeof value === 'string' ? value : JSON.stringify(value)
            if (content.length < 20) continue

            const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
            if (this.seenHashes.has(hash)) continue
            this.seenHashes.add(hash)

            docs.push({
              content: content.slice(0, this.maxContentLength),
              title: `OpenClaw Memory: ${key}`,
              source: 'openclaw',
              metadata: { memory_key: key, file_hash: hash },
              tags: ['source:openclaw', 'type:agent-memory', 'auto-indexed']
            })
          }
        }
      } catch { /* skip malformed memory */ }
    }

    return docs
  }

  async getDocument(_id: string): Promise<MemoryDocument | null> {
    return null // OpenClaw docs are derived from state, not individual files
  }
}
