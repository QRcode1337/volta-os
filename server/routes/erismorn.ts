import { Router } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { loadManifest, invalidateManifestCache } from '../config/loader.js'

const router = Router()
const ERISMORN_ROOT = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'
const DATA_DIR = path.join(ERISMORN_ROOT, 'volta-os/server/data')
const SHARED_MEMORY_DIR = path.join(ERISMORN_ROOT, 'memory/shared')

// ── Helpers ──────────────────────────────────────────────────

function readJsonFile(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch { return null }
}

function readMdFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8') } catch { return null }
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function writeJsonFile(filePath: string, data: any): boolean {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    return true
  } catch { return false }
}

function parseAgentOutputs(dirName: string, maxFiles = 5) {
  const dirPath = path.join(ERISMORN_ROOT, 'memory', dirName)
  const items: any[] = []
  try {
    if (!fs.existsSync(dirPath)) return items
    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md') && f !== 'CLAUDE.md' && f !== 'README.md')
      .sort().reverse().slice(0, maxFiles)
    for (const file of files) {
      const fullPath = path.join(dirPath, file)
      const stat = fs.statSync(fullPath)
      const content = readMdFile(fullPath) || ''
      const lines = content.split('\n')
      const title = lines.find(l => l.startsWith('# '))?.replace(/^#+\s*/, '') || file.replace('.md', '')
      const preview = lines.slice(0, 20).join('\n')
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch ? dateMatch[1] : stat.mtime.toISOString().split('T')[0]
      items.push({ file, title, content, preview, date, mtime: stat.mtime.toISOString(), size: stat.size })
    }
  } catch { /* skip */ }
  return items
}

function extractSections(content: string) {
  const sections: { heading: string; level: number; content: string }[] = []
  const lines = content.split('\n')
  let cur: { heading: string; level: number; lines: string[] } | null = null
  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)$/)
    if (m) {
      if (cur) sections.push({ heading: cur.heading, level: cur.level, content: cur.lines.join('\n') })
      cur = { heading: m[2], level: m[1].length, lines: [] }
    } else if (cur) cur.lines.push(line)
  }
  if (cur) sections.push({ heading: cur.heading, level: cur.level, content: cur.lines.join('\n') })
  return sections
}

function extractBulletItems(content: string) {
  const items: { text: string; checked: boolean }[] = []
  for (const line of content.split('\n')) {
    const checkMatch = line.match(/^[-*]\s+\[([ x])\]\s+(.+)$/)
    if (checkMatch) { items.push({ text: checkMatch[2], checked: checkMatch[1] === 'x' }); continue }
    const bulletMatch = line.match(/^[-*]\s+(.+)$/)
    if (bulletMatch && !bulletMatch[1].startsWith('#')) items.push({ text: bulletMatch[1], checked: false })
  }
  return items
}

function extractParticipants(content: string): string[] {
  const participants = new Set<string>()
  const patterns = [/erismorn/gi, /sentinel/gi, /scout/gi, /curator/gi, /synthesizer/gi, /builder/gi, /compressor/gi, /voltamachine/gi, /volta/gi]
  for (const p of patterns) {
    if (p.test(content)) {
      const match = content.match(p)
      if (match) participants.add(match[0].toLowerCase().replace(/[^a-z]/g, '-'))
    }
  }
  return Array.from(participants)
}

// ── Status & Core ────────────────────────────────────────────

router.get('/status', (req, res) => {
  const heartbeatState = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  const todayMemory = readMdFile(path.join(ERISMORN_ROOT, `memory/${getTodayStr()}.md`))
  res.json({ timestamp: new Date().toISOString(), heartbeatState, hasTodayMemory: !!todayMemory, workspace: ERISMORN_ROOT, status: 'online' })
})

router.get('/btc-price', async (req, res) => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
    const data = await response.json()
    res.json({ price: data.bitcoin?.usd || null, timestamp: new Date().toISOString() })
  } catch { res.json({ price: null, error: 'fetch failed' }) }
})

router.get('/cron-jobs', (req, res) => {
  const cached = readJsonFile(path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json'))
  if (cached?.jobs) return res.json(cached)
  res.json({ jobs: [] })
})

router.get('/heartbeat-state', (req, res) => {
  const state = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  res.json(state || {})
})

router.get('/cron-outputs', (req, res) => {
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  const outputs: Record<string, any[]> = {}
  const jobDirs: Record<string, string> = { sentinel: 'sentinel', scout: 'scout', synthesis: 'synthesis', curator: 'curated', 'pieces-ltm': 'pieces-ltm', voltamachine: 'voltamachine', portfolio: 'portfolio', builder: 'builder' }
  for (const [jobKey, dirName] of Object.entries(jobDirs)) {
    outputs[jobKey] = []
    const dirPath = path.join(memoryDir, dirName)
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 3)
        for (const file of files) {
          const content = readMdFile(path.join(dirPath, file))
          const stat = fs.statSync(path.join(dirPath, file))
          outputs[jobKey].push({ file, preview: content?.split('\n').slice(0, 8).join('\n') || '', timestamp: stat.mtime.toISOString() })
        }
      }
    } catch { /* skip */ }
  }
  res.json({ outputs, lastUpdated: new Date().toISOString() })
})

// ── ErisMorn Agent Endpoints ─────────────────────────────────

router.get('/erismorn/synthesis', (req, res) => {
  const data = readJsonFile(path.join(DATA_DIR, 'synthesis.json'))
  res.json({ patterns: data?.patterns || [] })
})

router.get('/erismorn/anomalies', (req, res) => {
  const cached = readJsonFile(path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json'))
  const anomalies: any[] = []
  const now = Date.now()
  if (cached?.jobs && Array.isArray(cached.jobs)) {
    for (const job of cached.jobs) {
      const state = job.state || {}
      if (state.consecutiveErrors && state.consecutiveErrors > 2) {
        anomalies.push({ type: 'error_spike', severity: state.consecutiveErrors > 5 ? 'critical' : 'warning', agentId: job.id, agentName: job.name || job.id, message: `${state.consecutiveErrors} consecutive errors`, detectedAt: new Date().toISOString() })
      }
      if (state.lastRunAtMs && job.intervalMs) {
        const elapsed = now - state.lastRunAtMs
        if (elapsed > job.intervalMs * 2) {
          anomalies.push({ type: 'missing_run', severity: elapsed > job.intervalMs * 5 ? 'critical' : 'warning', agentId: job.id, agentName: job.name || job.id, message: `Last run was ${Math.round((elapsed - job.intervalMs) / 60000)} minutes overdue`, detectedAt: new Date().toISOString() })
        }
      }
    }
  }
  res.json({ anomalies, count: anomalies.length, analyzedAt: new Date().toISOString() })
})

router.get('/erismorn/recommendations', (req, res) => {
  let data = readJsonFile(path.join(DATA_DIR, 'recommendations.json'))
  if (!data?.recommendations?.length) {
    const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
    const autoRecs: any[] = []
    if (heartbeat?.strategicOpportunities) {
      for (const opp of heartbeat.strategicOpportunities) {
        autoRecs.push({ id: generateId(), title: typeof opp === 'string' ? opp : opp.title || 'Opportunity', description: typeof opp === 'string' ? opp : opp.description || '', source: 'heartbeat-auto', priority: 'important', status: 'active', createdAt: new Date().toISOString() })
      }
    }
    data = { recommendations: autoRecs }
    if (autoRecs.length > 0) writeJsonFile(path.join(DATA_DIR, 'recommendations.json'), data)
  }
  res.json({ recommendations: data.recommendations || [] })
})

router.get('/erismorn/delegations', (req, res) => {
  const data = readJsonFile(path.join(DATA_DIR, 'delegations.json'))
  res.json({ delegations: data?.delegations || [] })
})

router.get('/erismorn/triage', (req, res) => {
  let data = readJsonFile(path.join(DATA_DIR, 'triage.json'))
  if (!data?.items?.length) {
    const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
    const autoItems: any[] = []
    if (heartbeat?.criticalAlerts) {
      for (const alert of heartbeat.criticalAlerts) {
        autoItems.push({ id: generateId(), source: 'heartbeat-critical', message: typeof alert === 'string' ? alert : alert.message || JSON.stringify(alert), priority: 'urgent', timestamp: new Date().toISOString() })
      }
    }
    data = { items: autoItems }
  }
  res.json({ items: data.items || [] })
})

router.get('/erismorn/decisions', (req, res) => {
  try {
    const decisions = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'decisions.json'), 'utf-8'))
    res.json({ decisions: Array.isArray(decisions) ? decisions.slice(0, 50) : [] })
  } catch { res.json({ decisions: [] }) }
})

router.get('/erismorn/standing-orders', (req, res) => {
  try {
    const orders = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'standing-orders.json'), 'utf-8'))
    res.json({ orders })
  } catch { res.json({ orders: [] }) }
})

router.get('/erismorn/token-usage', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'token-usage.json'), 'utf-8'))
    const today = new Date().toISOString().split('T')[0]
    const todayEntries = (data.entries || []).filter((e: any) => e.timestamp.startsWith(today))
    // Compute sessionCost from today's entries
    const sessionCost = todayEntries.reduce((sum: number, e: any) => {
      return sum + (e.inputTokens / 1_000_000) * 3.0 + (e.outputTokens / 1_000_000) * 15.0
    }, 0)
    res.json({ ...data, todayEntries, sessionCost })
  } catch { res.json({ entries: [], totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, requestCount: 0 }, todayEntries: [], sessionCost: 0 }) }
})

router.get('/erismorn/history', (req, res) => {
  try {
    const history = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'chat-history.json'), 'utf-8'))
    res.json({ messages: Array.isArray(history) ? history.slice(-50) : [] })
  } catch { res.json({ messages: [] }) }
})

// ── Intelligence Briefing ────────────────────────────────────

router.get('/intelligence/briefing', (req, res) => {
  const cached = readJsonFile(path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json'))
  let criticalCount = 0, warningCount = 0, healthyCount = 0
  if (cached?.jobs) {
    for (const job of cached.jobs) {
      const state = job.state || {}
      if (state.consecutiveErrors > 5) criticalCount++
      else if (state.consecutiveErrors > 2) warningCount++
      else if (job.enabled) healthyCount++
    }
  }
  const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  const criticalAlerts = heartbeat?.criticalAlerts || []
  const opportunities = heartbeat?.strategicOpportunities || []

  let threatLevel: string = 'nominal'
  if (criticalCount > 0 || criticalAlerts.length > 2) threatLevel = 'critical'
  else if (warningCount > 2 || criticalAlerts.length > 0) threatLevel = 'high'
  else if (warningCount > 0) threatLevel = 'elevated'

  const latestSentinel = parseAgentOutputs('sentinel', 1)[0]
  const latestScout = parseAgentOutputs('scout', 1)[0]
  const latestSynthesis = parseAgentOutputs('synthesis', 1)[0]
  const latestCurator = parseAgentOutputs('curated', 1)[0]
  const synthesisData = readJsonFile(path.join(DATA_DIR, 'synthesis.json'))

  res.json({
    threatLevel,
    agentHealth: { critical: criticalCount, warning: warningCount, healthy: healthyCount, total: (cached?.jobs?.length || 0) },
    criticalAlerts: criticalAlerts.slice(0, 5),
    opportunities: opportunities.slice(0, 5),
    patternCount: synthesisData?.patterns?.length || 0,
    latestSignals: {
      sentinel: latestSentinel ? { title: latestSentinel.title, date: latestSentinel.date, preview: latestSentinel.preview.slice(0, 200) } : null,
      scout: latestScout ? { title: latestScout.title, date: latestScout.date, preview: latestScout.preview.slice(0, 200) } : null,
      synthesis: latestSynthesis ? { title: latestSynthesis.title, date: latestSynthesis.date, preview: latestSynthesis.preview.slice(0, 200) } : null,
      curator: latestCurator ? { title: latestCurator.title, date: latestCurator.date, preview: latestCurator.preview.slice(0, 200) } : null
    },
    timestamp: new Date().toISOString()
  })
})

// ── Labs ─────────────────────────────────────────────────────

router.get('/labs/ideas', (req, res) => {
  const ideas: any[] = []
  for (const output of parseAgentOutputs('scout', 5)) {
    for (const s of extractSections(output.content)) {
      if (s.level <= 2 && s.heading && s.content.length > 50)
        ideas.push({ id: `scout-${output.file}-${s.heading.slice(0, 20)}`, source: 'SCOUT', type: 'discovery', title: s.heading.replace(/\*\*/g, ''), content: s.content.slice(0, 500), date: output.date, file: `scout/${output.file}`, priority: s.heading.toLowerCase().includes('critical') ? 'high' : 'medium' })
    }
  }
  for (const output of parseAgentOutputs('sentinel', 5)) {
    for (const item of extractBulletItems(output.content)) {
      if (item.text.length > 10)
        ideas.push({ id: `sentinel-${output.file}-${item.text.slice(0, 20)}`, source: 'SENTINEL', type: 'signal', title: item.text.replace(/\*\*/g, ''), content: item.text, date: output.date, file: `sentinel/${output.file}`, priority: item.text.toLowerCase().includes('critical') ? 'high' : 'low', resolved: item.checked })
    }
  }
  ideas.sort((a, b) => b.date.localeCompare(a.date))
  res.json({ ideas, count: ideas.length, sources: ['SCOUT', 'SENTINEL'], timestamp: new Date().toISOString() })
})

router.get('/labs/prototypes', (req, res) => {
  const prototypes: any[] = []
  for (const output of parseAgentOutputs('builder', 10)) {
    prototypes.push({ id: `builder-${output.file}`, source: 'BUILDER', type: 'build', title: output.title, preview: output.preview, date: output.date, file: `builder/${output.file}`, size: output.size })
  }
  prototypes.sort((a, b) => b.date.localeCompare(a.date))
  res.json({ prototypes, count: prototypes.length, sources: ['BUILDER'], timestamp: new Date().toISOString() })
})

router.get('/labs/reviews', (req, res) => {
  const reviews: any[] = []
  for (const output of parseAgentOutputs('curated', 10)) {
    const sections = extractSections(output.content)
    const summary = sections.find(s => s.heading.toLowerCase().includes('summary'))
    reviews.push({ id: `curator-${output.file}`, source: 'CURATOR', type: 'synthesis', title: output.title, summary: summary?.content.slice(0, 300) || output.preview.slice(0, 300), date: output.date, file: `curated/${output.file}`, size: output.size })
  }
  reviews.sort((a, b) => b.date.localeCompare(a.date))
  res.json({ reviews, count: reviews.length, sources: ['CURATOR'], timestamp: new Date().toISOString() })
})

router.get('/labs/ideation', (req, res) => {
  const ideation: any[] = []
  for (const output of parseAgentOutputs('synthesis', 10)) {
    const sections = extractSections(output.content)
    ideation.push({ id: `synth-${output.file}`, source: 'SYNTHESIZER', type: 'pattern-analysis', title: output.title, preview: output.preview, sections: sections.map(s => ({ heading: s.heading, level: s.level })), date: output.date, file: `synthesis/${output.file}`, size: output.size })
  }
  try {
    const strategyDir = path.join(ERISMORN_ROOT, 'memory/strategy')
    if (fs.existsSync(strategyDir)) {
      for (const file of fs.readdirSync(strategyDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 5)) {
        const content = readMdFile(path.join(strategyDir, file)) || ''
        const stat = fs.statSync(path.join(strategyDir, file))
        const title = content.split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || file.replace('.md', '')
        ideation.push({ id: `strategy-${file}`, source: 'STRATEGY', type: 'strategy', title, preview: content.split('\n').slice(0, 15).join('\n'), date: stat.mtime.toISOString().split('T')[0], file: `strategy/${file}`, size: stat.size })
      }
    }
  } catch { /* skip */ }
  ideation.sort((a, b) => b.date.localeCompare(a.date))
  res.json({ ideation, count: ideation.length, sources: ['SYNTHESIZER', 'STRATEGY'], timestamp: new Date().toISOString() })
})

// ── Observability ────────────────────────────────────────────

const FLOW_STATE_DIR = path.join(ERISMORN_ROOT, '.openclaw-flow')

router.get('/observability/state', (req, res) => {
  const state = readJsonFile(path.join(FLOW_STATE_DIR, 'state.json'))
  const spawned = readJsonFile(path.join(FLOW_STATE_DIR, 'spawned.json'))
  const memory = readJsonFile(path.join(FLOW_STATE_DIR, 'memory.json'))
  const agents = Object.values(state?.agents || {}) as any[]
  const swarms = Object.values(state?.swarms || {}) as any[]
  const tasks = Object.values(state?.tasks || {}) as any[]
  const spawnedList = Object.values(spawned || {}) as any[]

  // Aggregate stats for frontend FlowState.stats shape
  function countBy(arr: any[], key: string): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const item of arr) {
      const val = item[key] || 'unknown'
      counts[val] = (counts[val] || 0) + 1
    }
    return counts
  }

  const stats = {
    agents: { total: agents.length, byStatus: countBy(agents, 'status'), byType: countBy(agents, 'type') },
    swarms: { total: swarms.length, byStatus: countBy(swarms, 'status'), byStrategy: countBy(swarms, 'strategy') },
    tasks: { total: tasks.length, byStatus: countBy(tasks, 'status'), byType: countBy(tasks, 'type'), byPriority: countBy(tasks, 'priority') },
    spawned: { total: spawnedList.length, byStatus: countBy(spawnedList, 'status') }
  }

  res.json({ agents, swarms, tasks, spawned: spawnedList, memory: memory || {}, stats, timestamp: new Date().toISOString() })
})

router.get('/observability/traces', (req, res) => {
  const traces: any[] = []
  const state = readJsonFile(path.join(FLOW_STATE_DIR, 'state.json'))
  if (state?.agents) {
    for (const [id, agent] of Object.entries(state.agents as Record<string, any>)) {
      traces.push({ id: `agent-${id}`, type: 'agent_lifecycle', source: agent.type || 'unknown', agentId: id, action: `Agent ${agent.status}`, detail: agent.task || null, status: agent.status, timestamp: agent.created_at || new Date().toISOString() })
    }
  }
  const spawned = readJsonFile(path.join(FLOW_STATE_DIR, 'spawned.json'))
  if (spawned) {
    for (const [id, sp] of Object.entries(spawned as Record<string, any>)) {
      traces.push({ id: `spawn-${id}`, type: 'agent_spawn', source: sp.agent_type || 'spawner', agentId: id, action: `Spawned ${sp.agent_type || 'agent'}`, status: sp.status || 'spawned', timestamp: sp.spawned_at || new Date().toISOString() })
    }
  }
  if (state?.tasks) {
    for (const [id, task] of Object.entries(state.tasks as Record<string, any>)) {
      traces.push({ id: `task-${id}`, type: 'task_assignment', source: task.agent_id || 'unassigned', action: `Task: ${task.title || id}`, status: task.status, timestamp: task.created_at || new Date().toISOString() })
    }
  }
  const decisions = readJsonFile(path.join(DATA_DIR, 'decisions.json'))
  if (Array.isArray(decisions)) {
    for (const d of decisions.slice(0, 50)) {
      traces.push({ id: d.id, type: 'erismorn_decision', source: 'erismorn', action: d.title, detail: d.reasoning, status: d.status || 'active', timestamp: d.timestamp })
    }
  }
  traces.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  res.json({ traces, count: traces.length, timestamp: new Date().toISOString() })
})

router.get('/observability/comms', (req, res) => {
  const comms: any[] = []
  try {
    if (fs.existsSync(SHARED_MEMORY_DIR)) {
      for (const file of fs.readdirSync(SHARED_MEMORY_DIR).filter(f => f.endsWith('.md') && f !== 'CLAUDE.md')) {
        const fullPath = path.join(SHARED_MEMORY_DIR, file)
        const stat = fs.statSync(fullPath)
        const content = readMdFile(fullPath)
        comms.push({ id: `shared-${file}`, type: 'shared_memory', channel: 'shared_memory', file, preview: content?.split('\n').slice(0, 10).join('\n') || '', size: stat.size, lastModified: stat.mtime.toISOString(), participants: extractParticipants(content || '') })
      }
    }
  } catch { /* skip */ }
  const delegations = readJsonFile(path.join(DATA_DIR, 'delegations.json'))
  if (delegations?.delegations) {
    for (const d of delegations.delegations) {
      comms.push({ id: `deleg-${d.id}`, type: 'delegation', channel: 'task_delegation', from: 'erismorn', to: d.agentName || d.agentId, message: d.task, status: d.status, priority: d.priority, timestamp: d.createdAt })
    }
  }
  const agentDirs = ['sentinel', 'scout', 'curated', 'synthesis', 'builder', 'pieces-ltm']
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  for (const dir of agentDirs) {
    const dirPath = path.join(memoryDir, dir)
    try {
      if (fs.existsSync(dirPath)) {
        for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 3)) {
          const stat = fs.statSync(path.join(dirPath, file))
          comms.push({ id: `output-${dir}-${file}`, type: 'agent_output', channel: `agent/${dir}`, from: dir.toUpperCase(), to: 'erismorn', file: `${dir}/${file}`, size: stat.size, timestamp: stat.mtime.toISOString() })
        }
      }
    } catch { /* skip */ }
  }
  comms.sort((a, b) => new Date(b.timestamp || b.lastModified || '').getTime() - new Date(a.timestamp || a.lastModified || '').getTime())
  res.json({ communications: comms, count: comms.length, timestamp: new Date().toISOString() })
})

// ── Sessions ─────────────────────────────────────────────────

router.get('/sessions', (req, res) => {
  try {
    const sessionsPath = path.join(process.env.HOME || '', '.openclaw/sessions/sessions.json')
    const sessions = readJsonFile(sessionsPath)
    if (sessions?.sessions) {
      const list = Object.entries(sessions.sessions).map(([key, session]: [string, any]) => ({
        key, label: session.label, kind: session.kind, updatedAt: session.updatedAt, messageCount: session.messageCount
      }))
      res.json({ sessions: list })
    } else { res.json({ sessions: [] }) }
  } catch { res.json({ sessions: [] }) }
})

// ── Memory browser ───────────────────────────────────────────

router.get('/memory/today', (req, res) => {
  const content = readMdFile(path.join(ERISMORN_ROOT, `memory/${getTodayStr()}.md`))
  res.json({ date: getTodayStr(), content: content || '# No memory file for today yet', exists: !!content })
})

router.get('/memory/list', (req, res) => {
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  const result: any = { dailyLogs: [], subdirs: [], rootFiles: [] }
  try {
    for (const entry of fs.readdirSync(memoryDir, { withFileTypes: true })) {
      const fullPath = path.join(memoryDir, entry.name)
      if (entry.isDirectory()) {
        try { result.subdirs.push({ name: entry.name, fileCount: fs.readdirSync(fullPath).filter(f => f.endsWith('.md') || f.endsWith('.json')).length }) } catch { /* skip */ }
      } else if (/^\d{4}-\d{2}-\d{2}\.md$/.test(entry.name)) {
        const stat = fs.statSync(fullPath)
        result.dailyLogs.push({ date: entry.name.replace('.md', ''), size: stat.size, mtime: stat.mtime.toISOString() })
      }
    }
    result.dailyLogs.sort((a: any, b: any) => b.date.localeCompare(a.date))
  } catch { /* skip */ }
  res.json(result)
})

// ── Claude-mem bridge ────────────────────────────────────────

const CLAUDE_MEM_BASE = process.env.CLAUDE_MEM_URL || 'http://localhost:37777'

router.get('/claude-mem/health', async (req, res) => {
  try {
    const response = await fetch(`${CLAUDE_MEM_BASE}/health`)
    const data = await response.json()
    res.json({ ...data, available: true })
  } catch { res.json({ available: false, error: 'Claude Code not running' }) }
})

router.get('/claude-mem/observations', async (req, res) => {
  const { offset = '0', limit = '20', project, type } = req.query
  try {
    let url = `${CLAUDE_MEM_BASE}/api/observations?offset=${offset}&limit=${limit}`
    if (project) url += `&project=${encodeURIComponent(project as string)}`
    if (type) url += `&type=${encodeURIComponent(type as string)}`
    const response = await fetch(url)
    res.json(await response.json())
  } catch { res.json({ items: [], available: false }) }
})

// ── File reader ─────────────────────────────────────────────

router.get('/file', (req, res) => {
  const filePath = req.query.path as string
  if (!filePath) return res.status(400).json({ error: 'Path required' })

  // Security: resolve symlinks and verify path stays within workspace
  const fullPath = path.join(ERISMORN_ROOT, filePath)
  let resolvedPath: string
  try {
    resolvedPath = fs.realpathSync(fullPath)
  } catch {
    return res.status(404).json({ error: 'File not found' })
  }
  const resolvedRoot = fs.realpathSync(ERISMORN_ROOT)
  if (!resolvedPath.startsWith(resolvedRoot)) return res.status(403).json({ error: 'Access denied' })

  const content = readMdFile(resolvedPath)
  if (content) {
    res.json({ path: filePath, content })
  } else {
    res.status(404).json({ error: 'File not found' })
  }
})

// ── Memory directory browser ────────────────────────────────

router.get('/memory/dir/:dirName', (req, res) => {
  const dirPath = path.join(ERISMORN_ROOT, 'memory', req.params.dirName)
  let resolvedDir: string
  try {
    resolvedDir = fs.realpathSync(dirPath)
  } catch {
    return res.json({ files: [], dirName: req.params.dirName })
  }
  const resolvedMemory = fs.realpathSync(path.join(ERISMORN_ROOT, 'memory'))
  if (!resolvedDir.startsWith(resolvedMemory)) return res.status(403).json({ error: 'Access denied' })

  try {
    if (!fs.existsSync(dirPath)) return res.json({ files: [], dirName: req.params.dirName })
    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md') || f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(dirPath, f))
        return { name: f, size: stat.size, mtime: stat.mtime.toISOString() }
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
    res.json({ files, dirName: req.params.dirName, count: files.length })
  } catch { res.json({ files: [], dirName: req.params.dirName }) }
})

// ── Memory search ───────────────────────────────────────────

router.get('/memory/search', (req, res) => {
  const q = (req.query.q as string || '').toLowerCase()
  if (!q) return res.json({ results: [], query: '' })

  const results: any[] = []
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')

  function searchDir(dirPath: string, prefix: string) {
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          searchDir(path.join(dirPath, entry.name), `${prefix}${entry.name}/`)
        } else if (entry.name.endsWith('.md') && entry.name !== 'CLAUDE.md' && entry.name !== 'README.md') {
          const fullPath = path.join(dirPath, entry.name)
          const content = readMdFile(fullPath)
          if (content && content.toLowerCase().includes(q)) {
            const stat = fs.statSync(fullPath)
            const lines = content.split('\n')
            const matchLine = lines.findIndex(l => l.toLowerCase().includes(q))
            results.push({
              file: `${prefix}${entry.name}`,
              title: lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || entry.name,
              matchLine: matchLine >= 0 ? matchLine + 1 : null,
              preview: lines.slice(Math.max(0, matchLine - 1), matchLine + 3).join('\n'),
              size: stat.size,
              mtime: stat.mtime.toISOString()
            })
          }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  searchDir(memoryDir, '')
  results.sort((a, b) => b.mtime.localeCompare(a.mtime))
  res.json({ results: results.slice(0, 50), query: q, count: results.length })
})

// ── Directory listing ───────────────────────────────────────

router.get('/directory', (req, res) => {
  const relPath = req.query.path as string || ''
  const fullPath = path.join(ERISMORN_ROOT, relPath)
  let resolvedPath: string
  try {
    resolvedPath = fs.realpathSync(fullPath)
  } catch {
    return res.status(404).json({ error: 'Directory not found' })
  }
  const resolvedRoot = fs.realpathSync(ERISMORN_ROOT)
  if (!resolvedPath.startsWith(resolvedRoot)) return res.status(403).json({ error: 'Access denied' })

  try {
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      return res.status(404).json({ error: 'Directory not found' })
    }
    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        size: e.isFile() ? fs.statSync(path.join(fullPath, e.name)).size : undefined,
        mtime: fs.statSync(path.join(fullPath, e.name)).mtime.toISOString()
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1))
    res.json({ path: relPath, entries, count: entries.length })
  } catch { res.json({ path: relPath, entries: [], count: 0 }) }
})

// ── Claude-mem stats ────────────────────────────────────────

router.get('/claude-mem/stats', async (req, res) => {
  try {
    const response = await fetch(`${CLAUDE_MEM_BASE}/api/observations?limit=100`)
    const data = await response.json()
    const items = data.items || []
    const stats: { total: number; hasMore: boolean; byType: Record<string, number>; byProject: Record<string, number>; recentProjects: string[] } = {
      total: items.length,
      hasMore: data.hasMore,
      byType: {},
      byProject: {},
      recentProjects: []
    }
    for (const obs of items) {
      stats.byType[obs.type] = (stats.byType[obs.type] || 0) + 1
      stats.byProject[obs.project] = (stats.byProject[obs.project] || 0) + 1
    }
    stats.recentProjects = Object.entries(stats.byProject)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5)
      .map(([name]) => name)
    res.json(stats)
  } catch { res.json({ total: 0, error: 'Claude Code not running', available: false }) }
})

// ── Config / Manifest ────────────────────────────────────────

router.get('/config/manifest', (req, res) => {
  try {
    const manifest = loadManifest()
    res.json(manifest)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/config/agents', (req, res) => {
  try {
    const manifest = loadManifest()
    res.json({ agents: manifest.agents })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/config/reload', (req, res) => {
  invalidateManifestCache()
  const manifest = loadManifest()
  res.json({ reloaded: true, agentCount: manifest.agents.length, dataSourceCount: manifest.dataSources.length })
})

export default router
