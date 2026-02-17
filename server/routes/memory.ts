import express from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { supabase } from '../lib/supabase'
import {
  storeMemory,
  searchMemories,
  reinforceMemory,
  applyDecay,
  pruneWeakMemories,
  resolveMemoryTableName
} from '../services/memory'

const ERISMORN_ROOT = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'
const MEMORY_DIR = path.join(ERISMORN_ROOT, 'memory')

const router = express.Router()

/**
 * GET /api/memory/all
 * List all memories (without raw embeddings to save bandwidth)
 */
router.get('/all', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000)
    const agentId = req.query.agentId as string | undefined
    const memoryTable = await resolveMemoryTableName()

    let query = (supabase as any)
      .from(memoryTable)
      .select('id, agent_id, content, strength, metadata, tags, created_at, last_accessed, decay_rate')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data, error } = await query

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ success: true, memories: data || [], count: data?.length || 0 })
  } catch (error: any) {
    console.error('List memories error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/memory/store
 * Store a new memory with embedding
 */
router.post('/store', async (req, res) => {
  try {
    const { agentId, content, strength, metadata, tags, decayRate } = req.body

    if (!agentId || !content) {
      return res.status(400).json({
        error: 'Missing required fields: agentId, content'
      })
    }

    const memory = await storeMemory({
      agentId,
      content,
      strength,
      metadata,
      tags,
      decayRate
    })

    res.json({ success: true, memory })
  } catch (error: any) {
    console.error('Store memory error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/memory/search
 * Search memories using semantic similarity
 */
router.post('/search', async (req, res) => {
  try {
    const { agentId, query, threshold, limit } = req.body

    if (!query) {
      return res.status(400).json({
        error: 'Missing required field: query'
      })
    }

    const results = await searchMemories({
      agentId,
      query,
      threshold,
      limit
    })

    res.json({ success: true, results })
  } catch (error: any) {
    console.error('Search memories error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/memory/unified-search
 * Search both vector DB (semantic) and filesystem (text match), merge results
 */
router.post('/unified-search', async (req, res) => {
  try {
    const { query, agentId, threshold = 0.6, limit = 20 } = req.body

    if (!query) {
      return res.status(400).json({ error: 'Missing required field: query' })
    }

    // Run vector search and filesystem search in parallel
    const [vectorResults, fsResults] = await Promise.all([
      searchMemories({ agentId, query, threshold, limit }).catch(() => []),
      searchFilesystem(query, Math.min(limit, 10))
    ])

    // Merge: vector results first (ranked by similarity), then filesystem hits
    // Deduplicate by file_path if a vector result was embedded from the same file
    const seenPaths = new Set<string>()
    const merged: any[] = []

    for (const vr of (vectorResults as any[])) {
      merged.push({
        id: vr.id,
        source: 'vector',
        agent_id: vr.agent_id,
        content: vr.content,
        similarity: vr.similarity,
        strength: vr.strength,
        metadata: vr.metadata,
        created_at: vr.created_at
      })
      // Track file path to deduplicate
      if (vr.metadata?.file_path) {
        seenPaths.add(vr.metadata.file_path)
      }
    }

    for (const fr of fsResults) {
      if (!seenPaths.has(fr.file)) {
        merged.push({
          id: `fs-${fr.file}`,
          source: 'filesystem',
          content: fr.preview,
          similarity: null,
          strength: null,
          metadata: { file_path: fr.file, title: fr.title, matchLine: fr.matchLine },
          created_at: fr.mtime
        })
      }
    }

    res.json({ success: true, results: merged.slice(0, limit), count: merged.length })
  } catch (error: any) {
    console.error('Unified search error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Search filesystem for text matches in markdown files
 */
function searchFilesystem(query: string, maxResults: number) {
  const q = query.toLowerCase()
  const results: Array<{ file: string; title: string; matchLine: number | null; preview: string; mtime: string }> = []

  function walk(dir: string, prefix: string, depth = 0) {
    if (depth > 3 || results.length >= maxResults) return
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (results.length >= maxResults) return
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath, `${prefix}${entry.name}/`, depth + 1)
        } else if (entry.name.endsWith('.md') && entry.name !== 'CLAUDE.md' && entry.name !== 'README.md') {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')
            if (content.toLowerCase().includes(q)) {
              const stat = fs.statSync(fullPath)
              const lines = content.split('\n')
              const matchLine = lines.findIndex(l => l.toLowerCase().includes(q))
              results.push({
                file: `${prefix}${entry.name}`,
                title: lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || entry.name,
                matchLine: matchLine >= 0 ? matchLine + 1 : null,
                preview: lines.slice(Math.max(0, matchLine - 1), matchLine + 4).join('\n'),
                mtime: stat.mtime.toISOString()
              })
            }
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(MEMORY_DIR, '', 0)
  return results
}

/**
 * POST /api/memory/reinforce/:id
 * Reinforce a memory by increasing its strength
 */
router.post('/reinforce/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { strengthDelta = 0.1 } = req.body

    const memory = await reinforceMemory(id, strengthDelta)

    res.json({ success: true, memory })
  } catch (error: any) {
    console.error('Reinforce memory error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/memory/decay/:agentId
 * Apply temporal decay to all memories for an agent
 */
router.post('/decay/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params

    const count = await applyDecay(agentId)

    res.json({ success: true, count })
  } catch (error: any) {
    console.error('Apply decay error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/memory/prune/:agentId
 * Delete weak memories below threshold
 */
router.post('/prune/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params
    const { threshold = 0.1 } = req.body

    const count = await pruneWeakMemories(agentId, threshold)

    res.json({ success: true, count })
  } catch (error: any) {
    console.error('Prune memories error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
