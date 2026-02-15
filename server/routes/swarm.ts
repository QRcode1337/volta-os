import express from 'express'
import {
  createSwarm,
  addAgentToSwarm,
  updateSwarmStatus,
  assignTask,
  getSwarm,
  getAgentsByStatus,
  updateAgentPerformance,
  completeTask
} from '../services/swarm'

const router = express.Router()

/**
 * POST /api/swarm/create
 * Create a new swarm with specified topology
 */
router.post('/create', async (req, res) => {
  try {
    const { name, strategy, topology } = req.body

    if (!name || !strategy || !topology) {
      return res.status(400).json({
        error: 'Missing required fields: name, strategy, topology'
      })
    }

    const swarm = await createSwarm({ name, strategy, topology })
    res.json({ success: true, swarm })
  } catch (error: any) {
    console.error('Create swarm error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/swarm/add-agent
 * Add an agent to a swarm
 */
router.post('/add-agent', async (req, res) => {
  try {
    const { swarmId, agentId, role } = req.body

    if (!swarmId || !agentId || !role) {
      return res.status(400).json({
        error: 'Missing required fields: swarmId, agentId, role'
      })
    }

    const swarmAgent = await addAgentToSwarm({ swarmId, agentId, role })
    res.json({ success: true, swarmAgent })
  } catch (error: any) {
    console.error('Add agent error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/swarm/:id/status
 * Update swarm status
 */
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status) {
      return res.status(400).json({ error: 'Missing required field: status' })
    }

    const swarm = await updateSwarmStatus(id, status)
    res.json({ success: true, swarm })
  } catch (error: any) {
    console.error('Update status error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/swarm/assign-task
 * Assign task to agent in swarm
 */
router.post('/assign-task', async (req, res) => {
  try {
    const { swarmAgentId, task } = req.body

    if (!swarmAgentId || !task) {
      return res.status(400).json({
        error: 'Missing required fields: swarmAgentId, task'
      })
    }

    const agent = await assignTask(swarmAgentId, task)
    res.json({ success: true, agent })
  } catch (error: any) {
    console.error('Assign task error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/swarm/:id
 * Get swarm with all agents
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const swarm = await getSwarm(id)
    res.json({ success: true, swarm })
  } catch (error: any) {
    console.error('Get swarm error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/swarm/:id/agents/:status
 * Get agents by status in a swarm
 */
router.get('/:id/agents/:status', async (req, res) => {
  try {
    const { id, status } = req.params
    const agents = await getAgentsByStatus(id, status as any)
    res.json({ success: true, agents })
  } catch (error: any) {
    console.error('Get agents error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/swarm/agent/:id/performance
 * Update agent performance metrics
 */
router.put('/agent/:id/performance', async (req, res) => {
  try {
    const { id } = req.params
    const { metrics } = req.body

    if (!metrics) {
      return res.status(400).json({ error: 'Missing required field: metrics' })
    }

    const agent = await updateAgentPerformance(id, metrics)
    res.json({ success: true, agent })
  } catch (error: any) {
    console.error('Update performance error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/swarm/agent/:id/complete
 * Complete task and update agent status
 */
router.post('/agent/:id/complete', async (req, res) => {
  try {
    const { id } = req.params
    const agent = await completeTask(id)
    res.json({ success: true, agent })
  } catch (error: any) {
    console.error('Complete task error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
