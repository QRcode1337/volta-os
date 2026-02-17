import { supabase } from '../lib/supabase'
import type { Database } from '../types/supabase'

export type LeadSource = 'missed_call' | 'web_form' | 'referral'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'booking' | 'booked' | 'completed' | 'lost'
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type NurtureChannel = 'sms' | 'email' | 'voice'
export type SequenceType = 'booking_reminder' | 'follow_up' | 'reengagement'
type Lead = Database['public']['Tables']['cascade_leads']['Row']
type NurtureMessage = Database['public']['Tables']['cascade_nurture_sequences']['Row']

function isMissingRpcFunctionError(error: { message?: string } | null): boolean {
  if (!error?.message) return false
  return /could not find the function|schema cache/i.test(error.message)
}

export interface CreateLeadOptions {
  phone: string
  name?: string
  source: LeadSource
  memoryId?: string
  swarmId?: string
}

export interface CreateBookingOptions {
  leadId: string
  serviceType: string
  scheduledDate: Date
}

export interface CreateNurtureSequenceOptions {
  leadId: string
  sequenceType: SequenceType
  channel: NurtureChannel
  step: number
  scheduledTime: Date
}

/**
 * Create a new lead from missed call or form submission
 */
export async function createLead(options: CreateLeadOptions) {
  const { phone, name, source, memoryId, swarmId } = options

  const { data, error } = await supabase
    .from('cascade_leads')
    .insert({
      phone,
      name,
      source,
      status: 'new',
      memory_id: memoryId,
      assigned_swarm_id: swarmId
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create lead: ${error.message}`)
  }

  return data
}

/**
 * Update lead status and conversation history
 */
export async function updateLead(
  leadId: string,
  updates: {
    status?: LeadStatus
    name?: string
    conversationHistory?: any[]
    memoryId?: string
    swarmId?: string
  }
) {
  const { data, error } = await supabase
    .from('cascade_leads')
    .update({
      ...(updates.status && { status: updates.status }),
      ...(updates.name && { name: updates.name }),
      ...(updates.conversationHistory && { conversation_history: updates.conversationHistory }),
      ...(updates.memoryId && { memory_id: updates.memoryId }),
      ...(updates.swarmId && { assigned_swarm_id: updates.swarmId }),
      last_contact: new Date().toISOString()
    })
    .eq('id', leadId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update lead: ${error.message}`)
  }

  return data
}

/**
 * Add message to conversation history
 */
export async function addConversationMessage(
  leadId: string,
  message: { role: 'user' | 'assistant'; content: string; timestamp: string }
) {
  const { data, error } = await supabase.rpc('append_cascade_conversation_message', {
    p_lead_id: leadId,
    p_message: message
  })

  if (error && !isMissingRpcFunctionError(error)) {
    throw new Error(`Failed to add message: ${error.message}`)
  }

  if (!error && data) {
    return data as Lead
  }

  // Backward-compatible fallback when migration 003 has not been applied yet.
  const { data: lead, error: fetchError } = await supabase
    .from('cascade_leads')
    .select('conversation_history')
    .eq('id', leadId)
    .single()

  if (fetchError) {
    throw new Error(`Failed to fetch lead: ${fetchError.message}`)
  }

  const history = (lead.conversation_history as any[]) || []
  history.push(message)

  const { data: updated, error: updateError } = await supabase
    .from('cascade_leads')
    .update({
      conversation_history: history,
      last_contact: new Date().toISOString()
    })
    .eq('id', leadId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to add message: ${updateError.message}`)
  }

  return updated
}

/**
 * Create a booking for a lead
 */
export async function createBooking(options: CreateBookingOptions) {
  const { leadId, serviceType, scheduledDate } = options

  const { data, error } = await supabase
    .from('cascade_bookings')
    .insert({
      lead_id: leadId,
      service_type: serviceType,
      scheduled_date: scheduledDate.toISOString(),
      status: 'pending'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create booking: ${error.message}`)
  }

  // Update lead status to 'booked'
  await updateLead(leadId, { status: 'booked' })

  return data
}

/**
 * Update booking status
 */
export async function updateBookingStatus(bookingId: string, status: BookingStatus) {
  const { data, error } = await supabase
    .from('cascade_bookings')
    .update({ status })
    .eq('id', bookingId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update booking: ${error.message}`)
  }

  return data
}

/**
 * Schedule a nurture sequence message
 */
export async function scheduleNurtureMessage(options: CreateNurtureSequenceOptions) {
  const { leadId, sequenceType, channel, step, scheduledTime } = options

  const { data, error } = await supabase
    .from('cascade_nurture_sequences')
    .insert({
      lead_id: leadId,
      sequence_type: sequenceType,
      channel,
      step,
      scheduled_time: scheduledTime.toISOString(),
      sent: false
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to schedule nurture message: ${error.message}`)
  }

  return data
}

/**
 * Get pending nurture messages (due to be sent)
 */
export async function getPendingNurtureMessages() {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('cascade_nurture_sequences')
    .select('*')
    .eq('sent', false)
    .lte('scheduled_time', now)
    .order('scheduled_time', { ascending: true })

  if (error) {
    throw new Error(`Failed to get pending messages: ${error.message}`)
  }

  return data
}

/**
 * Mark nurture message as sent with response
 */
export async function markMessageSent(messageId: string, response?: Record<string, any>) {
  const { data, error } = await supabase.rpc('mark_nurture_message_sent_if_pending', {
    p_message_id: messageId,
    p_response: response || null
  })

  if (error && !isMissingRpcFunctionError(error)) {
    throw new Error(`Failed to mark message sent: ${error.message}`)
  }

  if (!error) {
    return (data as NurtureMessage | null) || null
  }

  const { data: updatedRows, error: fallbackError } = await supabase
    .from('cascade_nurture_sequences')
    .update({
      sent: true,
      response: response || null
    })
    .eq('id', messageId)
    .eq('sent', false)
    .select()

  if (fallbackError) {
    throw new Error(`Failed to mark message sent: ${fallbackError.message}`)
  }

  return updatedRows?.[0] || null
}

/**
 * Get lead by phone number
 */
export async function getLeadByPhone(phone: string) {
  const { data, error } = await supabase
    .from('cascade_leads')
    .select('*')
    .eq('phone', phone)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    throw new Error(`Failed to get lead: ${error.message}`)
  }

  return data
}

/**
 * Get all leads by status
 */
export async function getLeadsByStatus(status: LeadStatus) {
  const { data, error } = await supabase
    .from('cascade_leads')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to get leads: ${error.message}`)
  }

  return data
}

/**
 * Get all leads in one query
 */
export async function getAllLeads() {
  const { data, error } = await supabase
    .from('cascade_leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to get all leads: ${error.message}`)
  }

  return data
}
