import { getPendingNurtureMessages, markMessageSent } from '../services/cascade'

const DEFAULT_INTERVAL_MS = 30_000

let isRunning = false

async function runNurtureTick() {
  if (isRunning) {
    return
  }

  isRunning = true
  try {
    const dueMessages = await getPendingNurtureMessages()

    for (const message of dueMessages) {
      const response = {
        delivered: true,
        provider: 'log',
        timestamp: new Date().toISOString()
      }

      console.log(
        JSON.stringify({
          event: 'cascade.nurture.dispatch',
          messageId: message.id,
          leadId: message.lead_id,
          sequenceType: message.sequence_type,
          channel: message.channel,
          step: message.step,
          scheduledTime: message.scheduled_time,
          response
        })
      )

      const updated = await markMessageSent(message.id, response)

      if (!updated) {
        console.log(
          JSON.stringify({
            event: 'cascade.nurture.skip',
            reason: 'already_sent_or_missing',
            messageId: message.id
          })
        )
      }
    }
  } catch (error) {
    console.error('Nurture scheduler tick error:', error)
  } finally {
    isRunning = false
  }
}

export function startNurtureScheduler() {
  const enabled = (process.env.CASCADE_SCHEDULER_ENABLED || 'false').toLowerCase() === 'true'
  if (!enabled) {
    console.log('⏸️ CASCADE nurture scheduler disabled (set CASCADE_SCHEDULER_ENABLED=true to enable)')
    return () => undefined
  }

  const intervalMs = Number(process.env.CASCADE_SCHEDULER_INTERVAL_MS || DEFAULT_INTERVAL_MS)
  console.log(`▶️ CASCADE nurture scheduler enabled (interval=${intervalMs}ms)`)

  runNurtureTick().catch((error) => {
    console.error('Initial nurture scheduler run failed:', error)
  })

  const interval = setInterval(() => {
    runNurtureTick().catch((error) => {
      console.error('Nurture scheduler interval run failed:', error)
    })
  }, intervalMs)

  return () => clearInterval(interval)
}
