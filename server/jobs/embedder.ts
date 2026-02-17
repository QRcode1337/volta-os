import * as fs from 'fs'
import * as path from 'path'
import { supabase } from '../lib/supabase'
import { generateEmbedding } from '../lib/openai'

const ERISMORN_ROOT = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'
const MEMORY_DIR = path.join(ERISMORN_ROOT, 'memory')
const DEFAULT_INTERVAL_MS = 60_000
const AGENT_ID = 'forge-embedder'

// Track files we've already embedded (path → mtime) to avoid re-embedding unchanged files
const embeddedFiles = new Map<string, number>()
let isRunning = false

/**
 * Scan the ErisMorn memory directory for markdown files,
 * generate embeddings for new/changed content, and upsert into agent_memories.
 */
async function runEmbedderTick() {
  if (isRunning) return
  isRunning = true

  try {
    const files = collectMarkdownFiles(MEMORY_DIR)
    let embedded = 0
    let skipped = 0

    for (const filePath of files) {
      try {
        const stat = fs.statSync(filePath)
        const mtimeMs = stat.mtimeMs
        const prevMtime = embeddedFiles.get(filePath)

        // Skip if file hasn't changed since last embed
        if (prevMtime && prevMtime >= mtimeMs) {
          skipped++
          continue
        }

        const content = fs.readFileSync(filePath, 'utf-8')
        if (!content.trim() || content.length < 20) {
          skipped++
          continue
        }

        // Truncate very large files to first 8000 chars for embedding
        const truncated = content.length > 8000 ? content.slice(0, 8000) : content

        // Extract metadata from file path
        const relPath = path.relative(MEMORY_DIR, filePath)
        const dirName = path.dirname(relPath)
        const fileName = path.basename(relPath, '.md')
        const title = content.split('\n').find(l => l.startsWith('# '))?.replace(/^#+\s*/, '') || fileName
        const tags = dirName !== '.' ? [dirName] : []

        // Generate embedding
        const embedding = await generateEmbedding(truncated)

        // Upsert: check if we already have a memory for this file path
        const { data: existing } = await supabase
          .from('agent_memories')
          .select('id')
          .eq('agent_id', AGENT_ID)
          .eq('metadata->>file_path', relPath)
          .limit(1)

        if (existing && existing.length > 0) {
          // Update existing memory
          await supabase
            .from('agent_memories')
            .update({
              content: truncated,
              embedding,
              tags,
              metadata: { file_path: relPath, title, dir: dirName, size: stat.size },
              last_accessed: new Date().toISOString()
            })
            .eq('id', existing[0].id)
        } else {
          // Insert new memory
          await supabase
            .from('agent_memories')
            .insert({
              agent_id: AGENT_ID,
              content: truncated,
              embedding,
              strength: 1.0,
              tags,
              metadata: { file_path: relPath, title, dir: dirName, size: stat.size },
              decay_rate: 0.05
            })
        }

        embeddedFiles.set(filePath, mtimeMs)
        embedded++

        console.log(JSON.stringify({
          event: 'forge.embedder.embedded',
          file: relPath,
          title,
          contentLength: truncated.length,
          isUpdate: !!(existing && existing.length > 0)
        }))
      } catch (fileError) {
        console.error(`Embedder error on ${filePath}:`, fileError)
      }
    }

    if (embedded > 0) {
      console.log(JSON.stringify({
        event: 'forge.embedder.tick',
        embedded,
        skipped,
        total: files.length
      }))
    }
  } catch (error) {
    console.error('Embedder tick error:', error)
  } finally {
    isRunning = false
  }
}

/**
 * Recursively collect all .md files under a directory (skipping CLAUDE.md, README.md, node_modules)
 */
function collectMarkdownFiles(dir: string, maxDepth = 3, depth = 0): string[] {
  if (depth > maxDepth) return []
  const files: string[] = []

  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...collectMarkdownFiles(fullPath, maxDepth, depth + 1))
      } else if (
        entry.name.endsWith('.md') &&
        entry.name !== 'CLAUDE.md' &&
        entry.name !== 'README.md'
      ) {
        files.push(fullPath)
      }
    }
  } catch { /* skip unreadable dirs */ }

  return files
}

/**
 * Start the background embedder. Returns a cleanup function.
 */
export function startEmbedder() {
  const enabled = (process.env.FORGE_EMBEDDER_ENABLED || 'false').toLowerCase() === 'true'
  if (!enabled) {
    console.log('⏸️  FORGE embedder disabled (set FORGE_EMBEDDER_ENABLED=true to enable)')
    return () => undefined
  }

  const intervalMs = Number(process.env.FORGE_EMBEDDER_INTERVAL_MS || DEFAULT_INTERVAL_MS)
  console.log(`▶️  FORGE embedder enabled (interval=${intervalMs}ms, dir=${MEMORY_DIR})`)

  // Run immediately on startup
  runEmbedderTick().catch(error => {
    console.error('Initial embedder run failed:', error)
  })

  const interval = setInterval(() => {
    runEmbedderTick().catch(error => {
      console.error('Embedder interval run failed:', error)
    })
  }, intervalMs)

  return () => clearInterval(interval)
}
