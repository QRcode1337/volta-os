import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { MemoryAdapter, MemoryDocument } from './types'

/**
 * Reads Claude Code project memory files from ~/.claude/projects/<project>/memory/*.md
 */
export class ClaudeCodeAdapter implements MemoryAdapter {
  name = 'claude-code'
  private claudeDir: string
  private maxContentLength: number
  private seenHashes = new Set<string>()

  constructor(claudeDir?: string, maxContentLength = 8000) {
    this.claudeDir = claudeDir || path.join(process.env.HOME || '', '.claude')
    this.maxContentLength = maxContentLength
  }

  isAvailable(): boolean {
    return fs.existsSync(this.claudeDir)
  }

  async getNewDocuments(since?: Date): Promise<MemoryDocument[]> {
    const docs: MemoryDocument[] = []

    const projectsDir = path.join(this.claudeDir, 'projects')
    if (!fs.existsSync(projectsDir)) return docs

    try {
      for (const projectDir of fs.readdirSync(projectsDir)) {
        const memoryDir = path.join(projectsDir, projectDir, 'memory')
        if (!fs.existsSync(memoryDir)) continue

        const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'))

        for (const file of files) {
          const fullPath = path.join(memoryDir, file)
          const stat = fs.statSync(fullPath)

          if (since && stat.mtime < since) continue

          const content = fs.readFileSync(fullPath, 'utf-8')
          if (content.trim().length < 50) continue

          const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
          if (this.seenHashes.has(hash)) continue
          this.seenHashes.add(hash)

          docs.push({
            content: content.slice(0, this.maxContentLength),
            title: `Claude Code: ${file.replace('.md', '')}`,
            source: 'claude-code',
            filePath: fullPath,
            date: stat.mtime.toISOString().split('T')[0],
            metadata: {
              file_hash: hash,
              project: projectDir,
              file_path: `projects/${projectDir}/memory/${file}`
            },
            tags: ['source:claude-code', `project:${projectDir}`, 'auto-indexed']
          })
        }
      }
    } catch { /* skip on permission errors */ }

    return docs
  }

  async getDocument(id: string): Promise<MemoryDocument | null> {
    if (!fs.existsSync(id)) return null
    const content = fs.readFileSync(id, 'utf-8')

    return {
      content,
      title: path.basename(id, '.md'),
      source: 'claude-code',
      filePath: id,
      metadata: {},
      tags: ['source:claude-code']
    }
  }
}
