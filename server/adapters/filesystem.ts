import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { MemoryAdapter, MemoryDocument } from './types'

/**
 * Reads markdown files from ErisMorn memory subdirectories (scout, sentinel, etc.)
 */
export class FilesystemAdapter implements MemoryAdapter {
  name = 'filesystem'
  private root: string
  private dirs: string[]
  private maxContentLength: number
  private seenHashes = new Set<string>()

  constructor(root: string, dirs: string[], maxContentLength = 8000) {
    this.root = root
    this.dirs = dirs
    this.maxContentLength = maxContentLength
  }

  isAvailable(): boolean {
    return fs.existsSync(this.root)
  }

  async getNewDocuments(since?: Date): Promise<MemoryDocument[]> {
    const docs: MemoryDocument[] = []

    for (const dir of this.dirs) {
      const dirPath = path.join(this.root, dir)
      if (!fs.existsSync(dirPath)) continue

      try {
        const files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.md') && f !== 'CLAUDE.md' && f !== 'README.md')

        for (const file of files) {
          const fullPath = path.join(dirPath, file)
          const stat = fs.statSync(fullPath)

          if (since && stat.mtime < since) continue

          const content = fs.readFileSync(fullPath, 'utf-8')
          if (content.trim().length < 50) continue

          const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
          if (this.seenHashes.has(hash)) continue
          this.seenHashes.add(hash)

          const title = content.split('\n')
            .find(l => l.startsWith('#'))
            ?.replace(/^#+\s*/, '') || file.replace('.md', '')

          const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/)

          docs.push({
            content: content.slice(0, this.maxContentLength),
            title,
            source: dir,
            filePath: `${dir}/${file}`,
            date: dateMatch?.[1] || stat.mtime.toISOString().split('T')[0],
            metadata: { file_hash: hash, file_path: `${dir}/${file}`, dir, size: stat.size },
            tags: [`source:${dir}`, 'auto-indexed']
          })
        }
      } catch { /* skip unreadable dirs */ }
    }

    return docs
  }

  async getDocument(id: string): Promise<MemoryDocument | null> {
    const fullPath = path.join(this.root, id)
    if (!fs.existsSync(fullPath)) return null

    const content = fs.readFileSync(fullPath, 'utf-8')
    const title = content.split('\n')
      .find(l => l.startsWith('#'))
      ?.replace(/^#+\s*/, '') || path.basename(id, '.md')

    return {
      content,
      title,
      source: path.dirname(id),
      filePath: id,
      metadata: {},
      tags: [`source:${path.dirname(id)}`]
    }
  }
}
