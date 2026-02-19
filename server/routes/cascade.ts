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
  getLeadsByStatus,
  getAllLeads
} from '../services/cascade'
import { storeMemory } from '../services/memory'

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
    if (!message) {
      return res.status(409).json({ success: false, error: 'Message already sent or not found' })
    }

    res.json({ success: true, message })
  } catch (error: any) {
    console.error('Mark sent error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/cascade/trigger/missed-call
 * Trigger workflow: create/reuse lead, bridge memory, schedule nurture
 */
router.post('/trigger/missed-call', async (req, res) => {
  try {
    const { phone, name, source = 'missed_call' } = req.body as {
      phone?: string
      name?: string
      source?: 'missed_call' | 'web_form' | 'referral'
    }

    if (!phone) {
      return res.status(400).json({ error: 'Missing required field: phone' })
    }

    let lead = await getLeadByPhone(phone)
    let created = false

    if (!lead) {
      lead = await createLead({ phone, name, source })
      created = true
    }

    let memoryId: string | undefined
    try {
      const memory = await storeMemory({
        agentId: 'cascade',
        content: `Missed call trigger for ${phone}${name ? ` (${name})` : ''}`,
        metadata: { leadId: lead.id, source, phone },
        tags: ['cascade', 'lead', 'missed_call']
      })
      memoryId = memory.id
      await updateLead(lead.id, { memoryId: memory.id })
    } catch (memoryError) {
      console.warn('Memory bridge skipped:', memoryError)
    }

    await scheduleNurtureMessage({
      leadId: lead.id,
      sequenceType: 'follow_up',
      channel: 'sms',
      step: 1,
      scheduledTime: new Date(Date.now() + 60_000)
    })

    res.json({
      ok: true,
      leadId: lead.id,
      created,
      scheduledNurture: true,
      ...(memoryId && { memoryId })
    })
  } catch (error: any) {
    console.error('Missed call trigger error:', error)
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
    const leads = await getAllLeads()
    const counts = leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1
      return acc
    }, {})
    res.json({ success: true, leads, counts })
  } catch (error: any) {
    console.error('Get all leads error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
