import express from 'express'
import {
  storeMemory,
  searchMemories,
  reinforceMemory,
  applyDecay,
  pruneWeakMemories
} from '../services/memory'

const router = express.Router()

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
