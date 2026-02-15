import express from 'express'
import {
  createLead,
  updateLead,
  addConversationMessage,
  createBooking,
  updateBookingStatus,
  scheduleNurtureMessage,
  getPendingNurtureMessages,
  markMessageSent,
  getLeadByPhone,
  getLeadsByStatus
} from '../services/cascade'

const router = express.Router()

/**
 * POST /api/cascade/lead
 * Create a new lead from missed call or form submission
 */
router.post('/lead', async (req, res) => {
  try {
    const { phone, name, source, memoryId, swarmId } = req.body

    if (!phone || !source) {
      return res.status(400).json({
        error: 'Missing required fields: phone, source'
      })
    }

    const lead = await createLead({ phone, name, source, memoryId, swarmId })
    res.json({ success: true, lead })
  } catch (error: any) {
    console.error('Create lead error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/cascade/lead/:id
 * Update lead status and details
 */
router.put('/lead/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    const lead = await updateLead(id, updates)
    res.json({ success: true, lead })
  } catch (error: any) {
    console.error('Update lead error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/cascade/lead/:id/message
 * Add message to conversation history
 */
router.post('/lead/:id/message', async (req, res) => {
  try {
    const { id } = req.params
    const { role, content } = req.body

    if (!role || !content) {
      return res.status(400).json({
        error: 'Missing required fields: role, content'
      })
    }

    const message = {
      role,
      content,
      timestamp: new Date().toISOString()
    }

    const lead = await addConversationMessage(id, message)
    res.json({ success: true, lead })
  } catch (error: any) {
    console.error('Add message error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/cascade/booking
 * Create a booking for a lead
 */
router.post('/booking', async (req, res) => {
  try {
    const { leadId, serviceType, scheduledDate } = req.body

    if (!leadId || !serviceType || !scheduledDate) {
      return res.status(400).json({
        error: 'Missing required fields: leadId, serviceType, scheduledDate'
      })
    }

    const booking = await createBooking({
      leadId,
      serviceType,
      scheduledDate: new Date(scheduledDate)
    })

    res.json({ success: true, booking })
  } catch (error: any) {
    console.error('Create booking error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/cascade/booking/:id
 * Update booking status
 */
router.put('/booking/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status) {
      return res.status(400).json({ error: 'Missing required field: status' })
    }

    const booking = await updateBookingStatus(id, status)
    res.json({ success: true, booking })
  } catch (error: any) {
    console.error('Update booking error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/cascade/nurture
 * Schedule a nurture sequence message
 */
router.post('/nurture', async (req, res) => {
  try {
    const { leadId, sequenceType, channel, step, scheduledTime } = req.body

    if (!leadId || !sequenceType || !channel || step === undefined || !scheduledTime) {
      return res.status(400).json({
        error: 'Missing required fields: leadId, sequenceType, channel, step, scheduledTime'
      })
    }

    const message = await scheduleNurtureMessage({
      leadId,
      sequenceType,
      channel,
      step,
      scheduledTime: new Date(scheduledTime)
    })

    res.json({ success: true, message })
  } catch (error: any) {
    console.error('Schedule nurture error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/cascade/nurture/pending
 * Get pending nurture messages (due to be sent)
 */
router.get('/nurture/pending', async (req, res) => {
  try {
    const messages = await getPendingNurtureMessages()
    res.json({ success: true, messages })
  } catch (error: any) {
    console.error('Get pending messages error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/cascade/nurture/:id/sent
 * Mark nurture message as sent
 */
router.put('/nurture/:id/sent', async (req, res) => {
  try {
    const { id } = req.params
    const { response } = req.body

    const message = await markMessageSent(id, response)
    res.json({ success: true, message })
  } catch (error: any) {
    console.error('Mark sent error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/cascade/lead/phone/:phone
 * Get lead by phone number
 */
router.get('/lead/phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params
    const lead = await getLeadByPhone(phone)
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' })
    }

    res.json({ success: true, lead })
  } catch (error: any) {
    console.error('Get lead by phone error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/cascade/leads/:status
 * Get all leads by status
 */
router.get('/leads/:status', async (req, res) => {
  try {
    const { status } = req.params
    const leads = await getLeadsByStatus(status as any)
    res.json({ success: true, leads })
  } catch (error: any) {
    console.error('Get leads by status error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/cascade/leads
 * Get all leads (no status filter)
 */
router.get('/leads', async (req, res) => {
  try {
    // Get all leads by querying each status
    const statuses = ['new', 'contacted', 'qualified', 'booking', 'booked', 'completed', 'lost']
    const allLeads = []
    
    for (const status of statuses) {
      const leads = await getLeadsByStatus(status as any)
      allLeads.push(...leads)
    }

    res.json({ success: true, leads: allLeads })
  } catch (error: any) {
    console.error('Get all leads error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
