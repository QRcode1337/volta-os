import express from 'express'
import cors from 'cors'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import {
  chat,
  getChatHistory,
  getDecisions,
  getStandingOrders,
  addStandingOrder,
  updateStandingOrder,
  deleteStandingOrder,
  getTokenUsage
} from './erismorn.js'

const app = express()
const PORT = 3001

// Paths
const ERISMORN_ROOT = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'

app.use(cors())
app.use(express.json())

// Helper: Read JSON file safely
function readJsonFile(filePath: string): any {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (e) {
    return null
  }
}

// Helper: Read markdown file
function readMdFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (e) {
    return null
  }
}

// Helper: Get today's date string
function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// Helper: Run openclaw CLI command
function runOpenClawCmd(cmd: string): any {
  try {
    const result = execSync(`openclaw ${cmd} --json 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000
    })
    return JSON.parse(result)
  } catch (e) {
    return null
  }
}

// ============================================================
// API ENDPOINTS
// ============================================================

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'ErisMorn Dashboard API',
    version: '1.0.0',
    endpoints: [
      '/api/status',
      '/api/cron-jobs',
      '/api/heartbeat-state',
      '/api/btc-price',
      '/api/portfolio',
      '/api/memory/today',
      '/api/action-log',
      '/api/erismorn/agents/:id/toggle',
      '/api/erismorn/delegations',
      '/api/erismorn/delegate',
      '/api/erismorn/triage',
      '/api/erismorn/synthesis',
      '/api/erismorn/synthesize',
      '/api/erismorn/anomalies',
      '/api/erismorn/recommendations'
    ]
  })
})

// GET /api/status - Overall ErisMorn status
app.get('/api/status', (req, res) => {
  const heartbeatState = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  const todayMemory = readMdFile(path.join(ERISMORN_ROOT, `memory/${getTodayStr()}.md`))
  
  res.json({
    timestamp: new Date().toISOString(),
    heartbeatState,
    hasTodayMemory: !!todayMemory,
    workspace: ERISMORN_ROOT
  })
})

// GET /api/cron-jobs - Fetch cron jobs from cache file
app.get('/api/cron-jobs', (req, res) => {
  // Read from cache file (updated by ErisMorn during heartbeats)
  const cachePath = path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json')
  const cached = readJsonFile(cachePath)
  
  if (cached && cached.jobs) {
    res.json(cached)
  } else {
    // Fallback: try to extract from sessions file
    try {
      const sessionsPath = '/Users/patrickgallowaypro/.openclaw/sessions/sessions.json'
      const sessions = readJsonFile(sessionsPath)
      
      const cronJobs: any[] = []
      if (sessions?.sessions) {
        for (const [key, session] of Object.entries(sessions.sessions as Record<string, any>)) {
          if (key.includes(':cron:')) {
            cronJobs.push({
              id: key.split(':cron:')[1],
              name: session.label || key,
              enabled: true,
              state: {
                lastRunAtMs: session.updatedAt,
                lastStatus: 'ok'
              }
            })
          }
        }
      }
      
      res.json({ jobs: cronJobs })
    } catch (e2) {
      res.json({ jobs: [], error: 'Could not fetch cron jobs' })
    }
  }
})

// GET /api/memory/today - Today's memory file
app.get('/api/memory/today', (req, res) => {
  const content = readMdFile(path.join(ERISMORN_ROOT, `memory/${getTodayStr()}.md`))
  res.json({
    date: getTodayStr(),
    content: content || '# No memory file for today yet',
    exists: !!content
  })
})

// GET /api/memory/recent - Recent memory files (last 7 days)
app.get('/api/memory/recent', (req, res) => {
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  const files: { date: string; preview: string }[] = []
  
  try {
    const entries = fs.readdirSync(memoryDir)
    const dateFiles = entries
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 7)
    
    for (const file of dateFiles) {
      const content = readMdFile(path.join(memoryDir, file))
      const date = file.replace('.md', '')
      const preview = content?.split('\n').slice(0, 5).join('\n') || ''
      files.push({ date, preview })
    }
  } catch (e) {
    // ignore
  }
  
  res.json({ files })
})

// GET /api/heartbeat-state - Current heartbeat state
app.get('/api/heartbeat-state', (req, res) => {
  const state = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  res.json(state || {})
})

// GET /api/portfolio - Portfolio status
app.get('/api/portfolio', (req, res) => {
  const portfolioDir = path.join(ERISMORN_ROOT, 'memory/portfolio')
  
  try {
    if (!fs.existsSync(portfolioDir)) {
      return res.json({ lastFile: null, content: null, files: [] })
    }
    
    const files = fs.readdirSync(portfolioDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
    
    if (files.length > 0) {
      const latest = readMdFile(path.join(portfolioDir, files[0]))
      res.json({
        lastFile: files[0],
        content: latest,
        files: files.slice(0, 5)
      })
    } else {
      res.json({ lastFile: null, content: null, files: [] })
    }
  } catch (e) {
    res.json({ lastFile: null, content: null, files: [], error: String(e) })
  }
})

// GET /api/btc-price - Current BTC price
app.get('/api/btc-price', async (req, res) => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
    const data = await response.json()
    res.json({
      price: data.bitcoin?.usd || null,
      timestamp: new Date().toISOString()
    })
  } catch (e) {
    res.json({ price: null, error: String(e) })
  }
})

// POST /api/task - Add a task (writes to today's memory)
app.post('/api/task', (req, res) => {
  const { title, type = 'note' } = req.body
  
  if (!title) {
    return res.status(400).json({ error: 'Title required' })
  }
  
  const memoryPath = path.join(ERISMORN_ROOT, `memory/${getTodayStr()}.md`)
  const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const entry = `\n- [ ] **${timestamp}** ${title}\n`
  
  try {
    fs.appendFileSync(memoryPath, entry)
    res.json({ success: true, entry })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// POST /api/send-message - Send message via CLI
app.post('/api/send-message', (req, res) => {
  const { message } = req.body
  
  if (!message) {
    return res.status(400).json({ error: 'Message required' })
  }
  
  try {
    // Write to a message file that ErisMorn can pick up
    const msgPath = path.join(ERISMORN_ROOT, 'inbox/dashboard-message.txt')
    const timestamp = new Date().toISOString()
    const content = `[${timestamp}] Dashboard Message:\n${message}\n`
    fs.appendFileSync(msgPath, content)
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: String(e) })
  }
})

// GET /api/action-log - Recent actions from memory files
app.get('/api/action-log', (req, res) => {
  const actions: { id: string; timestamp: string; message: string }[] = []
  
  const todayMemory = readMdFile(path.join(ERISMORN_ROOT, `memory/${getTodayStr()}.md`))
  
  if (todayMemory) {
    const lines = todayMemory.split('\n')
    let id = 1
    for (const line of lines) {
      // Match headers
      if (line.startsWith('## ') || line.startsWith('### ')) {
        actions.push({
          id: `a${id++}`,
          timestamp: getTodayStr(),
          message: line.replace(/^#+\s*/, '')
        })
      }
      // Match bullet points with bold timestamps
      const match = line.match(/^[-*]\s+\*\*(.+?)\*\*\s+(.+)$/)
      if (match) {
        actions.push({
          id: `a${id++}`,
          timestamp: match[1],
          message: match[2]
        })
      }
      // Match checkboxes
      const checkMatch = line.match(/^[-*]\s+\[[ x]\]\s+(.+)$/)
      if (checkMatch) {
        actions.push({
          id: `a${id++}`,
          timestamp: getTodayStr(),
          message: checkMatch[1]
        })
      }
    }
  }
  
  res.json({ actions: actions.slice(0, 30) })
})

// GET /api/file - Read a file from ErisMorn workspace
app.get('/api/file', (req, res) => {
  const filePath = req.query.path as string
  
  if (!filePath) {
    return res.status(400).json({ error: 'Path required' })
  }
  
  // Security: only allow reading from ErisMorn workspace
  const fullPath = path.join(ERISMORN_ROOT, filePath)
  if (!fullPath.startsWith(ERISMORN_ROOT)) {
    return res.status(403).json({ error: 'Access denied' })
  }
  
  const content = readMdFile(fullPath)
  if (content) {
    res.json({ path: filePath, content })
  } else {
    res.status(404).json({ error: 'File not found' })
  }
})

// GET /api/cron-outputs - Fetch latest outputs from agent directories
app.get('/api/cron-outputs', (req, res) => {
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  const outputs: Record<string, { file: string; preview: string; timestamp: string }[]> = {}
  
  // Map job names to their output directories
  const jobDirs: Record<string, string> = {
    'sentinel': 'sentinel',
    'scout': 'scout',
    'synthesis': 'synthesis',
    'curator': 'curated',
    'pieces-ltm': 'pieces-ltm',
    'voltamachine': 'voltamachine',
    'portfolio': 'portfolio',
    'builder': 'builder'
  }
  
  for (const [jobKey, dirName] of Object.entries(jobDirs)) {
    const dirPath = path.join(memoryDir, dirName)
    outputs[jobKey] = []
    
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.md'))
          .sort()
          .reverse()
          .slice(0, 3)
        
        for (const file of files) {
          const content = readMdFile(path.join(dirPath, file))
          const preview = content?.split('\n').slice(0, 8).join('\n') || ''
          const stat = fs.statSync(path.join(dirPath, file))
          outputs[jobKey].push({
            file,
            preview,
            timestamp: stat.mtime.toISOString()
          })
        }
      }
    } catch (e) {
      // ignore
    }
  }
  
  res.json({ outputs, lastUpdated: new Date().toISOString() })
})

// GET /api/cron-output/:jobKey/:file - Fetch specific output file
app.get('/api/cron-output/:jobKey/:file', (req, res) => {
  const { jobKey, file } = req.params
  
  const jobDirs: Record<string, string> = {
    'sentinel': 'sentinel',
    'scout': 'scout',
    'synthesis': 'synthesis',
    'curator': 'curated',
    'pieces-ltm': 'pieces-ltm',
    'voltamachine': 'voltamachine',
    'portfolio': 'portfolio',
    'builder': 'builder'
  }
  
  const dirName = jobDirs[jobKey]
  if (!dirName) {
    return res.status(404).json({ error: 'Unknown job' })
  }
  
  const filePath = path.join(ERISMORN_ROOT, 'memory', dirName, file)
  
  // Security: ensure path is within memory directory
  if (!filePath.startsWith(path.join(ERISMORN_ROOT, 'memory'))) {
    return res.status(403).json({ error: 'Access denied' })
  }
  
  const content = readMdFile(filePath)
  if (content) {
    res.json({ jobKey, file, content })
  } else {
    res.status(404).json({ error: 'File not found' })
  }
})

// GET /api/cron-runs - Fetch run history for all jobs
app.get('/api/cron-runs', (req, res) => {
  const runsPath = path.join(ERISMORN_ROOT, 'memory/cron-runs-cache.json')
  const cached = readJsonFile(runsPath)
  
  if (cached) {
    res.json(cached)
  } else {
    res.json({ runs: {}, lastUpdated: null })
  }
})

// GET /api/cron-runs/:jobId - Fetch run history for a specific job
app.get('/api/cron-runs/:jobId', (req, res) => {
  const { jobId } = req.params
  const runsPath = path.join(ERISMORN_ROOT, 'memory/cron-runs-cache.json')
  const cached = readJsonFile(runsPath)
  
  if (cached && cached.runs && cached.runs[jobId]) {
    res.json({ jobId, runs: cached.runs[jobId] })
  } else {
    res.json({ jobId, runs: [], error: 'No runs found' })
  }
})

// POST /api/cron-runs/:jobId - Store a new run for a job (called by sync script)
app.post('/api/cron-runs/:jobId', (req, res) => {
  const { jobId } = req.params
  const { status, output, error, durationMs, timestamp } = req.body
  
  const runsPath = path.join(ERISMORN_ROOT, 'memory/cron-runs-cache.json')
  let cached = readJsonFile(runsPath) || { runs: {}, lastUpdated: null }
  
  if (!cached.runs[jobId]) {
    cached.runs[jobId] = []
  }
  
  // Add new run (keep last 10 runs per job)
  cached.runs[jobId].unshift({
    timestamp: timestamp || new Date().toISOString(),
    status,
    output,
    error,
    durationMs
  })
  cached.runs[jobId] = cached.runs[jobId].slice(0, 10)
  cached.lastUpdated = new Date().toISOString()
  
  try {
    fs.writeFileSync(runsPath, JSON.stringify(cached, null, 2))
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /api/models-fleet - Model fleet status
app.get('/api/models-fleet', (req, res) => {
  const fleet = readJsonFile(path.join(ERISMORN_ROOT, 'memory/models-fleet-cache.json'))
  if (fleet) {
    res.json(fleet)
  } else {
    // Fallback with basic model info
    res.json({
      providers: {
        anthropic: {
          name: 'Anthropic',
          status: 'active',
          models: [
            { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', role: 'primary' },
            { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', role: 'fallback' },
            { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', role: 'fast' }
          ]
        },
        ollama: {
          name: 'Ollama Local',
          status: 'unknown',
          models: []
        }
      },
      summary: { totalProviders: 2, totalModels: 3 }
    })
  }
})

// ============================================================
// QUICK ACTIONS
// ============================================================

// POST /api/action/restart-gateway - Restart OpenClaw gateway
app.post('/api/action/restart-gateway', (req, res) => {
  try {
    execSync('pkill -SIGUSR1 -f "openclaw gateway"', { encoding: 'utf-8', timeout: 5000 })
    res.json({ success: true, message: 'Gateway restart signal sent' })
  } catch (e) {
    // SIGUSR1 might not return cleanly
    res.json({ success: true, message: 'Restart signal sent' })
  }
})

// POST /api/action/check-email - Check email via osascript
app.post('/api/action/check-email', (req, res) => {
  try {
    const result = execSync(`osascript -e 'tell application "Mail" to check for new mail'`, {
      encoding: 'utf-8',
      timeout: 30000
    })
    res.json({ success: true, output: 'Email check triggered' })
  } catch (e) {
    res.json({ success: false, error: String(e) })
  }
})

// POST /api/action/heartbeat - Send heartbeat wake
app.post('/api/action/heartbeat', (req, res) => {
  try {
    // Write to inbox for ErisMorn to pick up
    const msgPath = path.join(ERISMORN_ROOT, 'inbox/dashboard-heartbeat.txt')
    const content = `[${new Date().toISOString()}] Manual heartbeat trigger from dashboard\n`
    fs.appendFileSync(msgPath, content)
    res.json({ success: true, message: 'Heartbeat trigger written to inbox' })
  } catch (e) {
    res.json({ success: false, error: String(e) })
  }
})

// POST /api/action/trigger-cron - Trigger a specific cron job
app.post('/api/action/trigger-cron', (req, res) => {
  const { jobId } = req.body
  if (!jobId) {
    return res.status(400).json({ error: 'jobId required' })
  }
  
  try {
    execSync(`openclaw cron run ${jobId}`, { encoding: 'utf-8', timeout: 10000 })
    res.json({ success: true, message: `Triggered job ${jobId}` })
  } catch (e) {
    res.json({ success: false, error: String(e) })
  }
})

// GET /api/sessions - List active sessions
app.get('/api/sessions', (req, res) => {
  try {
    const sessionsPath = '/Users/patrickgallowaypro/.openclaw/sessions/sessions.json'
    const sessions = readJsonFile(sessionsPath)
    
    if (sessions?.sessions) {
      const list = Object.entries(sessions.sessions).map(([key, session]: [string, any]) => ({
        key,
        label: session.label,
        kind: session.kind,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount
      }))
      res.json({ sessions: list })
    } else {
      res.json({ sessions: [] })
    }
  } catch (e) {
    res.json({ sessions: [], error: String(e) })
  }
})

// ============================================================
// MEMORY BROWSER
// ============================================================

// GET /api/memory/list - List all memory files with metadata
app.get('/api/memory/list', (req, res) => {
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  const result: {
    dailyLogs: { date: string; size: number; mtime: string }[]
    subdirs: { name: string; fileCount: number }[]
    rootFiles: { name: string; size: number }[]
  } = {
    dailyLogs: [],
    subdirs: [],
    rootFiles: []
  }
  
  try {
    const entries = fs.readdirSync(memoryDir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(memoryDir, entry.name)
      
      if (entry.isDirectory()) {
        // Subdirectory
        try {
          const subFiles = fs.readdirSync(fullPath)
          result.subdirs.push({
            name: entry.name,
            fileCount: subFiles.filter(f => f.endsWith('.md') || f.endsWith('.json')).length
          })
        } catch (e) {
          // Skip inaccessible dirs
        }
      } else if (/^\d{4}-\d{2}-\d{2}\.md$/.test(entry.name)) {
        // Daily log
        const stat = fs.statSync(fullPath)
        result.dailyLogs.push({
          date: entry.name.replace('.md', ''),
          size: stat.size,
          mtime: stat.mtime.toISOString()
        })
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
        // Root file
        const stat = fs.statSync(fullPath)
        result.rootFiles.push({
          name: entry.name,
          size: stat.size
        })
      }
    }
    
    // Sort daily logs newest first
    result.dailyLogs.sort((a, b) => b.date.localeCompare(a.date))
    result.subdirs.sort((a, b) => a.name.localeCompare(b.name))
    
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /api/memory/dir/:dirName - List files in a memory subdirectory
app.get('/api/memory/dir/:dirName', (req, res) => {
  const { dirName } = req.params
  const dirPath = path.join(ERISMORN_ROOT, 'memory', dirName)
  
  // Security check
  if (!dirPath.startsWith(path.join(ERISMORN_ROOT, 'memory'))) {
    return res.status(403).json({ error: 'Access denied' })
  }
  
  try {
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Directory not found' })
    }
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const files = entries
      .filter(e => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.json')))
      .map(e => {
        const stat = fs.statSync(path.join(dirPath, e.name))
        return {
          name: e.name,
          size: stat.size,
          mtime: stat.mtime.toISOString()
        }
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
    
    res.json({ dir: dirName, files })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// GET /api/memory/search - Search across memory files
app.get('/api/memory/search', (req, res) => {
  const query = (req.query.q as string || '').toLowerCase()
  
  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query too short (min 2 chars)' })
  }
  
  const results: { file: string; line: number; content: string }[] = []
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  
  function searchDir(dir: string, prefix: string = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          searchDir(fullPath, relativePath)
        } else if (entry.name.endsWith('.md')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')
            const lines = content.split('\n')
            
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(query)) {
                results.push({
                  file: relativePath,
                  line: i + 1,
                  content: lines[i].slice(0, 200)
                })
                
                if (results.length >= 50) return // Limit results
              }
            }
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    } catch (e) {
      // Skip inaccessible dirs
    }
  }
  
  searchDir(memoryDir)
  
  res.json({ query, results, count: results.length })
})

// GET /api/directory - Generic directory listing
app.get('/api/directory', (req, res) => {
  const relativePath = (req.query.path as string) || ''
  const fullPath = path.join(ERISMORN_ROOT, relativePath)
  
  // Security: only allow reading from ErisMorn workspace
  if (!fullPath.startsWith(ERISMORN_ROOT)) {
    return res.status(403).json({ error: 'Access denied' })
  }
  
  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Path not found' })
    }
    
    const stat = fs.statSync(fullPath)
    
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' })
    }
    
    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => {
        const itemPath = path.join(fullPath, e.name)
        const itemStat = fs.statSync(itemPath)
        return {
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          size: itemStat.size,
          mtime: itemStat.mtime.toISOString()
        }
      })
      .sort((a, b) => {
        // Dirs first, then alphabetical
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    
    res.json({ path: relativePath, items })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// ============================================================
// ERISMORN COMMAND CHANNEL
// ============================================================

// POST /api/erismorn/chat - Chat with ErisMorn (Claude API)
app.post('/api/erismorn/chat', async (req, res) => {
  const { message } = req.body
  if (!message) {
    return res.status(400).json({ error: 'Message required' })
  }

  try {
    const result = await chat(message)
    res.json({
      response: result.response,
      toolsUsed: result.toolsUsed,
      timestamp: new Date().toISOString()
    })
  } catch (e: any) {
    console.error('ErisMorn chat error:', e)
    res.status(500).json({
      error: 'ErisMorn is unavailable',
      detail: e.message || String(e)
    })
  }
})

// GET /api/erismorn/history - Chat history
app.get('/api/erismorn/history', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50
  const history = getChatHistory(limit)
  res.json({ messages: history })
})

// GET /api/erismorn/decisions - Decision feed
app.get('/api/erismorn/decisions', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50
  const decisions = getDecisions(limit)
  res.json({ decisions })
})

// GET /api/erismorn/standing-orders - List standing orders
app.get('/api/erismorn/standing-orders', (req, res) => {
  const orders = getStandingOrders()
  res.json({ orders })
})

// POST /api/erismorn/standing-orders - Create standing order
app.post('/api/erismorn/standing-orders', (req, res) => {
  const { name, condition, action, enabled = true } = req.body
  if (!name || !condition || !action) {
    return res.status(400).json({ error: 'name, condition, and action required' })
  }
  const order = addStandingOrder({ name, condition, action, enabled })
  res.json({ order })
})

// PATCH /api/erismorn/standing-orders/:id - Update standing order
app.patch('/api/erismorn/standing-orders/:id', (req, res) => {
  const { id } = req.params
  const updated = updateStandingOrder(id, req.body)
  if (updated) {
    res.json({ order: updated })
  } else {
    res.status(404).json({ error: 'Order not found' })
  }
})

// DELETE /api/erismorn/standing-orders/:id - Delete standing order
app.delete('/api/erismorn/standing-orders/:id', (req, res) => {
  const { id } = req.params
  const deleted = deleteStandingOrder(id)
  res.json({ success: deleted })
})

// GET /api/erismorn/token-usage - Token usage and cost tracking
app.get('/api/erismorn/token-usage', (req, res) => {
  const usage = getTokenUsage()
  res.json(usage)
})

// ============================================================
// TIER 2: AGENT LIFECYCLE, DELEGATIONS, TRIAGE
// ============================================================

const DATA_DIR = path.join(ERISMORN_ROOT, 'volta-os/server/data')

// Helper: Write JSON file safely (ensures data dir exists)
function writeJsonFile(filePath: string, data: any): boolean {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    return true
  } catch (e) {
    console.error('writeJsonFile error:', e)
    return false
  }
}

// Helper: Generate a simple unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// POST /api/erismorn/agents/:id/toggle - Toggle agent enabled/disabled
app.post('/api/erismorn/agents/:id/toggle', (req, res) => {
  const { id } = req.params
  const cachePath = path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json')
  const cached = readJsonFile(cachePath)

  if (!cached || !cached.jobs) {
    return res.status(404).json({ error: 'Cron jobs cache not found' })
  }

  const job = cached.jobs.find((j: any) => j.id === id)
  if (!job) {
    return res.status(404).json({ error: `Agent ${id} not found` })
  }

  // Toggle the enabled state
  const newEnabled = !job.enabled
  job.enabled = newEnabled
  const action = newEnabled ? 'enable' : 'disable'

  // Write updated cache
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2))
  } catch (e) {
    return res.status(500).json({ error: `Failed to update cache: ${String(e)}` })
  }

  // Try to run openclaw cron command (best-effort)
  let cliResult = null
  try {
    execSync(`openclaw cron ${action} ${id}`, { encoding: 'utf-8', timeout: 10000 })
    cliResult = 'success'
  } catch (e) {
    cliResult = `cli failed: ${String(e)}`
  }

  res.json({
    id,
    enabled: newEnabled,
    action,
    cliResult,
    timestamp: new Date().toISOString()
  })
})

// GET /api/erismorn/delegations - List all active delegations
app.get('/api/erismorn/delegations', (req, res) => {
  const delegationsPath = path.join(DATA_DIR, 'delegations.json')
  const data = readJsonFile(delegationsPath)
  const delegations = data?.delegations || []
  res.json({ delegations })
})

// POST /api/erismorn/delegate - Create a new delegation
app.post('/api/erismorn/delegate', (req, res) => {
  const { task, agentId, agentName, priority = 'normal' } = req.body

  if (!task || !agentId) {
    return res.status(400).json({ error: 'task and agentId required' })
  }

  const delegationsPath = path.join(DATA_DIR, 'delegations.json')
  const data = readJsonFile(delegationsPath) || { delegations: [] }

  const delegation = {
    id: generateId(),
    task,
    agentId,
    agentName: agentName || agentId,
    priority,
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedAt: null
  }

  data.delegations.push(delegation)

  if (writeJsonFile(delegationsPath, data)) {
    res.status(201).json({ delegation })
  } else {
    res.status(500).json({ error: 'Failed to save delegation' })
  }
})

// PATCH /api/erismorn/delegations/:id - Update delegation status
app.patch('/api/erismorn/delegations/:id', (req, res) => {
  const { id } = req.params
  const { status } = req.body

  const validStatuses = ['pending', 'in-progress', 'completed', 'failed']
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
  }

  const delegationsPath = path.join(DATA_DIR, 'delegations.json')
  const data = readJsonFile(delegationsPath)

  if (!data || !data.delegations) {
    return res.status(404).json({ error: 'No delegations found' })
  }

  const delegation = data.delegations.find((d: any) => d.id === id)
  if (!delegation) {
    return res.status(404).json({ error: `Delegation ${id} not found` })
  }

  // Apply updates
  if (status) delegation.status = status
  if (status === 'completed' || status === 'failed') {
    delegation.completedAt = new Date().toISOString()
  }

  // Merge any additional fields from body
  const { status: _s, ...rest } = req.body
  Object.assign(delegation, rest)

  if (writeJsonFile(delegationsPath, data)) {
    res.json({ delegation })
  } else {
    res.status(500).json({ error: 'Failed to update delegation' })
  }
})

// GET /api/erismorn/triage - Current triage state
app.get('/api/erismorn/triage', (req, res) => {
  const triagePath = path.join(DATA_DIR, 'triage.json')
  let data = readJsonFile(triagePath)

  // Auto-populate from heartbeat state if triage is empty
  if (!data || !data.items || data.items.length === 0) {
    const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
    const autoItems: any[] = []

    if (heartbeat) {
      // Pull critical alerts
      if (heartbeat.criticalAlerts && Array.isArray(heartbeat.criticalAlerts)) {
        for (const alert of heartbeat.criticalAlerts) {
          autoItems.push({
            id: generateId(),
            source: 'heartbeat-critical',
            message: typeof alert === 'string' ? alert : alert.message || JSON.stringify(alert),
            priority: 'urgent',
            reasoning: 'Auto-populated from heartbeat critical alerts',
            timestamp: new Date().toISOString()
          })
        }
      }

      // Pull strategic opportunities
      if (heartbeat.strategicOpportunities && Array.isArray(heartbeat.strategicOpportunities)) {
        for (const opp of heartbeat.strategicOpportunities) {
          autoItems.push({
            id: generateId(),
            source: 'heartbeat-strategic',
            message: typeof opp === 'string' ? opp : opp.message || opp.description || JSON.stringify(opp),
            priority: 'important',
            reasoning: 'Auto-populated from heartbeat strategic opportunities',
            timestamp: new Date().toISOString()
          })
        }
      }
    }

    data = { items: autoItems }
    if (autoItems.length > 0) {
      writeJsonFile(triagePath, data)
    }
  }

  res.json({ items: data.items || [] })
})

// POST /api/erismorn/triage - Add a triage item
app.post('/api/erismorn/triage', (req, res) => {
  const { source, message, priority = 'routine', reasoning = '' } = req.body

  if (!message) {
    return res.status(400).json({ error: 'message required' })
  }

  const validPriorities = ['urgent', 'important', 'routine', 'archive']
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` })
  }

  const triagePath = path.join(DATA_DIR, 'triage.json')
  const data = readJsonFile(triagePath) || { items: [] }

  const item = {
    id: generateId(),
    source: source || 'manual',
    message,
    priority,
    reasoning,
    timestamp: new Date().toISOString()
  }

  data.items.push(item)

  if (writeJsonFile(triagePath, data)) {
    res.status(201).json({ item })
  } else {
    res.status(500).json({ error: 'Failed to save triage item' })
  }
})

// ============================================================
// TIER 3: SYNTHESIS, ANOMALIES, RECOMMENDATIONS
// ============================================================

// GET /api/erismorn/synthesis - Get existing cross-agent patterns
app.get('/api/erismorn/synthesis', (req, res) => {
  const synthesisPath = path.join(DATA_DIR, 'synthesis.json')
  const data = readJsonFile(synthesisPath)
  res.json({ patterns: data?.patterns || [] })
})

// POST /api/erismorn/synthesize - Create synthesis from agent outputs
app.post('/api/erismorn/synthesize', (req, res) => {
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  const agentDirs = ['sentinel', 'scout', 'curated', 'synthesis']
  const agentOutputs: Record<string, { file: string; preview: string }[]> = {}

  // Gather latest outputs from each agent directory
  for (const dirName of agentDirs) {
    const dirPath = path.join(memoryDir, dirName)
    agentOutputs[dirName] = []

    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.md'))
          .sort()
          .reverse()
          .slice(0, 3)

        for (const file of files) {
          const content = readMdFile(path.join(dirPath, file))
          const preview = content?.split('\n').slice(0, 15).join('\n') || ''
          agentOutputs[dirName].push({ file, preview })
        }
      }
    } catch (e) {
      // skip inaccessible dirs
    }
  }

  // Build a synthesis request with the collected data
  const { title, description, category = 'general', confidence = 0.5 } = req.body

  const synthesisPath = path.join(DATA_DIR, 'synthesis.json')
  const data = readJsonFile(synthesisPath) || { patterns: [] }

  const pattern = {
    id: generateId(),
    title: title || `Synthesis ${new Date().toISOString().split('T')[0]}`,
    description: description || 'Cross-agent synthesis request',
    agents: Object.keys(agentOutputs).filter(k => agentOutputs[k].length > 0),
    confidence: Number(confidence),
    category,
    discoveredAt: new Date().toISOString(),
    connections: agentOutputs
  }

  data.patterns.push(pattern)

  if (writeJsonFile(synthesisPath, data)) {
    res.status(201).json({ pattern })
  } else {
    res.status(500).json({ error: 'Failed to save synthesis pattern' })
  }
})

// GET /api/erismorn/anomalies - Detect anomalies from cron jobs (computed on the fly)
app.get('/api/erismorn/anomalies', (req, res) => {
  const cachePath = path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json')
  const cached = readJsonFile(cachePath)
  const anomalies: any[] = []
  const now = Date.now()

  if (cached && cached.jobs && Array.isArray(cached.jobs)) {
    for (const job of cached.jobs) {
      const state = job.state || {}

      // Error spikes: consecutiveErrors > 2
      if (state.consecutiveErrors && state.consecutiveErrors > 2) {
        anomalies.push({
          type: 'error_spike',
          severity: state.consecutiveErrors > 5 ? 'critical' : 'warning',
          agentId: job.id,
          agentName: job.name || job.id,
          message: `${state.consecutiveErrors} consecutive errors detected`,
          consecutiveErrors: state.consecutiveErrors,
          lastError: state.lastError || null,
          detectedAt: new Date().toISOString()
        })
      }

      // Missing runs: lastRunAtMs older than 2x expected interval
      if (state.lastRunAtMs && job.intervalMs) {
        const elapsed = now - state.lastRunAtMs
        const expectedInterval = job.intervalMs
        if (elapsed > expectedInterval * 2) {
          const missedBy = Math.round((elapsed - expectedInterval) / 60000) // minutes
          anomalies.push({
            type: 'missing_run',
            severity: elapsed > expectedInterval * 5 ? 'critical' : 'warning',
            agentId: job.id,
            agentName: job.name || job.id,
            message: `Last run was ${missedBy} minutes overdue (expected every ${Math.round(expectedInterval / 60000)} min)`,
            lastRunAtMs: state.lastRunAtMs,
            expectedIntervalMs: expectedInterval,
            elapsedMs: elapsed,
            detectedAt: new Date().toISOString()
          })
        }
      }

      // Disabled agents that were recently active (last run within 24h)
      if (job.enabled === false && state.lastRunAtMs) {
        const hoursSinceLastRun = (now - state.lastRunAtMs) / (1000 * 60 * 60)
        if (hoursSinceLastRun < 24) {
          anomalies.push({
            type: 'recently_disabled',
            severity: 'info',
            agentId: job.id,
            agentName: job.name || job.id,
            message: `Agent was disabled but ran ${Math.round(hoursSinceLastRun * 10) / 10} hours ago`,
            lastRunAtMs: state.lastRunAtMs,
            detectedAt: new Date().toISOString()
          })
        }
      }
    }
  }

  res.json({
    anomalies,
    count: anomalies.length,
    analyzedAt: new Date().toISOString()
  })
})

// GET /api/erismorn/recommendations - Get active recommendations
app.get('/api/erismorn/recommendations', (req, res) => {
  const recsPath = path.join(DATA_DIR, 'recommendations.json')
  let data = readJsonFile(recsPath)

  // Auto-generate from heartbeat state if empty
  if (!data || !data.recommendations || data.recommendations.length === 0) {
    const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
    const autoRecs: any[] = []

    if (heartbeat?.strategicOpportunities && Array.isArray(heartbeat.strategicOpportunities)) {
      for (const opp of heartbeat.strategicOpportunities) {
        autoRecs.push({
          id: generateId(),
          title: typeof opp === 'string' ? opp : opp.title || opp.message || 'Strategic Opportunity',
          description: typeof opp === 'string' ? opp : opp.description || opp.message || JSON.stringify(opp),
          source: 'heartbeat-auto',
          priority: 'important',
          status: 'active',
          createdAt: new Date().toISOString()
        })
      }
    }

    data = { recommendations: autoRecs }
    if (autoRecs.length > 0) {
      writeJsonFile(recsPath, data)
    }
  }

  res.json({ recommendations: data.recommendations || [] })
})

// POST /api/erismorn/recommendations - Create a new recommendation
app.post('/api/erismorn/recommendations', (req, res) => {
  const { title, description, priority = 'important', source = 'manual' } = req.body

  if (!title) {
    return res.status(400).json({ error: 'title required' })
  }

  const recsPath = path.join(DATA_DIR, 'recommendations.json')
  const data = readJsonFile(recsPath) || { recommendations: [] }

  const recommendation = {
    id: generateId(),
    title,
    description: description || '',
    source,
    priority,
    status: 'active',
    createdAt: new Date().toISOString()
  }

  data.recommendations.push(recommendation)

  if (writeJsonFile(recsPath, data)) {
    res.status(201).json({ recommendation })
  } else {
    res.status(500).json({ error: 'Failed to save recommendation' })
  }
})

// ============================================================
// OBSERVABILITY: OPENCLAW-FLOW AGENT TRACES & COMMS
// ============================================================

const FLOW_STATE_DIR = path.join(ERISMORN_ROOT, '.openclaw-flow')
const SHARED_MEMORY_DIR = path.join(ERISMORN_ROOT, 'memory/shared')

// GET /api/observability/state - Full openclaw-flow state (agents, swarms, tasks)
app.get('/api/observability/state', (req, res) => {
  const state = readJsonFile(path.join(FLOW_STATE_DIR, 'state.json'))
  const spawned = readJsonFile(path.join(FLOW_STATE_DIR, 'spawned.json'))
  const memory = readJsonFile(path.join(FLOW_STATE_DIR, 'memory.json'))

  const agents = state?.agents || {}
  const swarms = state?.swarms || {}
  const tasks = state?.tasks || {}

  // Compute summary stats
  const agentList = Object.values(agents) as any[]
  const swarmList = Object.values(swarms) as any[]
  const taskList = Object.values(tasks) as any[]
  const spawnedList = Object.values(spawned || {}) as any[]

  const stats = {
    agents: {
      total: agentList.length,
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>
    },
    swarms: {
      total: swarmList.length,
      byStatus: {} as Record<string, number>,
      byStrategy: {} as Record<string, number>
    },
    tasks: {
      total: taskList.length,
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<string, number>
    },
    spawned: {
      total: spawnedList.length,
      byStatus: {} as Record<string, number>
    }
  }

  for (const a of agentList) {
    stats.agents.byStatus[a.status] = (stats.agents.byStatus[a.status] || 0) + 1
    stats.agents.byType[a.type] = (stats.agents.byType[a.type] || 0) + 1
  }
  for (const s of swarmList) {
    stats.swarms.byStatus[s.status] = (stats.swarms.byStatus[s.status] || 0) + 1
    stats.swarms.byStrategy[s.strategy] = (stats.swarms.byStrategy[s.strategy] || 0) + 1
  }
  for (const t of taskList) {
    stats.tasks.byStatus[t.status] = (stats.tasks.byStatus[t.status] || 0) + 1
    if (t.type) stats.tasks.byType[t.type] = (stats.tasks.byType[t.type] || 0) + 1
    if (t.priority) stats.tasks.byPriority[t.priority] = (stats.tasks.byPriority[t.priority] || 0) + 1
  }
  for (const sp of spawnedList) {
    const st = sp.status || 'unknown'
    stats.spawned.byStatus[st] = (stats.spawned.byStatus[st] || 0) + 1
  }

  res.json({
    agents: agentList,
    swarms: swarmList,
    tasks: taskList,
    spawned: spawnedList,
    memory: memory || {},
    stats,
    timestamp: new Date().toISOString()
  })
})

// GET /api/observability/traces - Agent decision traces (aggregated timeline)
app.get('/api/observability/traces', (req, res) => {
  const traces: any[] = []

  // 1. Agent lifecycle events from state
  const state = readJsonFile(path.join(FLOW_STATE_DIR, 'state.json'))
  if (state?.agents) {
    for (const [id, agent] of Object.entries(state.agents as Record<string, any>)) {
      traces.push({
        id: `agent-${id}`,
        type: 'agent_lifecycle',
        source: agent.type || 'unknown',
        agentId: id,
        action: `Agent ${agent.status}`,
        detail: agent.task || agent.result || null,
        status: agent.status,
        timestamp: agent.created_at || agent.completed_at || new Date().toISOString(),
        metadata: agent.metadata || {}
      })
    }
  }

  // 2. Spawned agent traces
  const spawned = readJsonFile(path.join(FLOW_STATE_DIR, 'spawned.json'))
  if (spawned) {
    for (const [id, sp] of Object.entries(spawned as Record<string, any>)) {
      traces.push({
        id: `spawn-${id}`,
        type: 'agent_spawn',
        source: sp.agent_type || 'spawner',
        agentId: id,
        action: `Spawned ${sp.agent_type || 'agent'}`,
        detail: sp.task || sp.objective || null,
        status: sp.status || 'spawned',
        timestamp: sp.spawned_at || sp.created_at || new Date().toISOString(),
        metadata: { model: sp.model, timeout: sp.timeout }
      })
    }
  }

  // 3. Task assignment traces
  if (state?.tasks) {
    for (const [id, task] of Object.entries(state.tasks as Record<string, any>)) {
      traces.push({
        id: `task-${id}`,
        type: 'task_assignment',
        source: task.agent_id || 'unassigned',
        agentId: task.agent_id || null,
        action: `Task: ${task.title || task.description || id}`,
        detail: task.description || null,
        status: task.status,
        priority: task.priority || 'normal',
        timestamp: task.created_at || new Date().toISOString(),
        metadata: { type: task.type, blocked_by: task.blocked_by }
      })
    }
  }

  // 4. Swarm coordination traces
  if (state?.swarms) {
    for (const [id, swarm] of Object.entries(state.swarms as Record<string, any>)) {
      traces.push({
        id: `swarm-${id}`,
        type: 'swarm_coordination',
        source: 'orchestrator',
        agentId: null,
        action: `Swarm: ${swarm.objective || id}`,
        detail: `Strategy: ${swarm.strategy}, Topology: ${swarm.topology}`,
        status: swarm.status,
        timestamp: swarm.created_at || new Date().toISOString(),
        metadata: {
          strategy: swarm.strategy,
          topology: swarm.topology,
          taskCount: swarm.tasks?.length || 0
        }
      })

      // Individual swarm task traces
      if (swarm.tasks) {
        for (const st of swarm.tasks) {
          traces.push({
            id: `swarm-task-${st.id || Math.random().toString(36).slice(2)}`,
            type: 'swarm_task',
            source: st.agent_id || st.agent_type || 'pending',
            agentId: st.agent_id || null,
            action: `[${swarm.strategy}] ${st.description || st.id}`,
            detail: st.dependencies?.length ? `Depends on: ${st.dependencies.join(', ')}` : null,
            status: st.status || 'pending',
            timestamp: swarm.created_at || new Date().toISOString(),
            metadata: { swarmId: id, agentType: st.agent_type }
          })
        }
      }
    }
  }

  // 5. ErisMorn decisions
  const decisions = readJsonFile(path.join(DATA_DIR, 'decisions.json'))
  if (Array.isArray(decisions)) {
    for (const d of decisions.slice(0, 50)) {
      traces.push({
        id: d.id,
        type: 'erismorn_decision',
        source: 'erismorn',
        agentId: null,
        action: d.title,
        detail: d.reasoning,
        status: d.status || 'active',
        category: d.category,
        timestamp: d.timestamp,
        metadata: { action: d.action, category: d.category }
      })
    }
  }

  // 6. Flow memory decisions
  const flowMemory = readJsonFile(path.join(FLOW_STATE_DIR, 'memory.json'))
  if (flowMemory) {
    for (const [key, entry] of Object.entries(flowMemory as Record<string, any>)) {
      traces.push({
        id: `mem-${key}`,
        type: 'memory_decision',
        source: 'flow-memory',
        agentId: null,
        action: key.replace(/-/g, ' '),
        detail: entry.value || null,
        status: 'recorded',
        timestamp: entry.created_at || new Date().toISOString(),
        metadata: { type: entry.type, tags: entry.tags }
      })
    }
  }

  // Sort by timestamp descending
  traces.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  res.json({ traces, count: traces.length, timestamp: new Date().toISOString() })
})

// GET /api/observability/comms - Inter-agent communication monitoring
app.get('/api/observability/comms', (req, res) => {
  const comms: any[] = []

  // 1. Shared memory files (inter-agent sync artifacts)
  try {
    if (fs.existsSync(SHARED_MEMORY_DIR)) {
      const files = fs.readdirSync(SHARED_MEMORY_DIR)
        .filter(f => f.endsWith('.md') && f !== 'CLAUDE.md')
      for (const file of files) {
        const fullPath = path.join(SHARED_MEMORY_DIR, file)
        const stat = fs.statSync(fullPath)
        const content = readMdFile(fullPath)
        const preview = content?.split('\n').slice(0, 10).join('\n') || ''

        // Parse type from filename
        let commType = 'shared_memory'
        if (file.includes('decision')) commType = 'decision_sync'
        else if (file.includes('synthesis')) commType = 'synthesis'
        else if (file.includes('insight')) commType = 'insight'
        else if (file.includes('question')) commType = 'question'
        else if (file.includes('emergence')) commType = 'emergence'
        else if (file.includes('build')) commType = 'build_artifact'
        else if (file.includes('protocol')) commType = 'protocol'

        comms.push({
          id: `shared-${file}`,
          type: commType,
          channel: 'shared_memory',
          file,
          preview,
          size: stat.size,
          lastModified: stat.mtime.toISOString(),
          participants: extractParticipants(content || '')
        })
      }
    }
  } catch (e) { /* skip */ }

  // 2. Delegations as inter-agent communication
  const delegations = readJsonFile(path.join(DATA_DIR, 'delegations.json'))
  if (delegations?.delegations) {
    for (const d of delegations.delegations) {
      comms.push({
        id: `deleg-${d.id}`,
        type: 'delegation',
        channel: 'task_delegation',
        from: 'erismorn',
        to: d.agentName || d.agentId,
        message: d.task,
        status: d.status,
        priority: d.priority,
        timestamp: d.createdAt,
        completedAt: d.completedAt
      })
    }
  }

  // 3. Agent output directories as communication channels
  const agentDirs = ['sentinel', 'scout', 'curated', 'synthesis', 'builder', 'pieces-ltm']
  const memoryDir = path.join(ERISMORN_ROOT, 'memory')
  for (const dir of agentDirs) {
    const dirPath = path.join(memoryDir, dir)
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.md'))
          .sort()
          .reverse()
          .slice(0, 3)
        for (const file of files) {
          const stat = fs.statSync(path.join(dirPath, file))
          comms.push({
            id: `output-${dir}-${file}`,
            type: 'agent_output',
            channel: `agent/${dir}`,
            from: dir.toUpperCase(),
            to: 'erismorn',
            file: `${dir}/${file}`,
            size: stat.size,
            timestamp: stat.mtime.toISOString()
          })
        }
      }
    } catch (e) { /* skip */ }
  }

  // Sort by most recent
  comms.sort((a, b) => {
    const ta = a.timestamp || a.lastModified || ''
    const tb = b.timestamp || b.lastModified || ''
    return new Date(tb).getTime() - new Date(ta).getTime()
  })

  res.json({ communications: comms, count: comms.length, timestamp: new Date().toISOString() })
})

// Helper: Extract participant names from shared memory content
function extractParticipants(content: string): string[] {
  const participants = new Set<string>()
  const patterns = [
    /erismorn/gi, /sentinel/gi, /scout/gi, /curator/gi,
    /synthesizer/gi, /builder/gi, /compressor/gi,
    /income.scout/gi, /voltamachine/gi, /volta/gi
  ]
  for (const p of patterns) {
    if (p.test(content)) {
      const match = content.match(p)
      if (match) participants.add(match[0].toLowerCase().replace(/[^a-z]/g, '-'))
    }
  }
  return Array.from(participants)
}

// ============================================================
// LABS: IDEAS, PROTOTYPES, REVIEWS, IDEATION, INTELLIGENCE
// ============================================================

// Helper: Parse markdown files into structured items
function parseAgentOutputs(dirName: string, maxFiles: number = 5): { file: string; title: string; content: string; preview: string; date: string; mtime: string; size: number }[] {
  const dirPath = path.join(ERISMORN_ROOT, 'memory', dirName)
  const items: any[] = []

  try {
    if (!fs.existsSync(dirPath)) return items

    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md') && f !== 'CLAUDE.md' && f !== 'README.md')
      .sort()
      .reverse()
      .slice(0, maxFiles)

    for (const file of files) {
      const fullPath = path.join(dirPath, file)
      const stat = fs.statSync(fullPath)
      const content = readMdFile(fullPath) || ''
      const lines = content.split('\n')
      const title = lines.find(l => l.startsWith('# '))?.replace(/^#+\s*/, '') || file.replace('.md', '')
      const preview = lines.slice(0, 20).join('\n')

      // Extract date from filename if possible
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch ? dateMatch[1] : stat.mtime.toISOString().split('T')[0]

      items.push({ file, title, content, preview, date, mtime: stat.mtime.toISOString(), size: stat.size })
    }
  } catch (e) { /* skip */ }

  return items
}

// Helper: Extract action items / bullet points from markdown
function extractBulletItems(content: string): { text: string; checked: boolean }[] {
  const items: { text: string; checked: boolean }[] = []
  for (const line of content.split('\n')) {
    const checkMatch = line.match(/^[-*]\s+\[([ x])\]\s+(.+)$/)
    if (checkMatch) {
      items.push({ text: checkMatch[2], checked: checkMatch[1] === 'x' })
    } else {
      const bulletMatch = line.match(/^[-*]\s+(.+)$/)
      if (bulletMatch && !bulletMatch[1].startsWith('#')) {
        items.push({ text: bulletMatch[1], checked: false })
      }
    }
  }
  return items
}

// Helper: Extract sections from markdown
function extractSections(content: string): { heading: string; level: number; content: string }[] {
  const sections: { heading: string; level: number; content: string }[] = []
  const lines = content.split('\n')
  let currentSection: { heading: string; level: number; lines: string[] } | null = null

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      if (currentSection) {
        sections.push({ heading: currentSection.heading, level: currentSection.level, content: currentSection.lines.join('\n') })
      }
      currentSection = { heading: headingMatch[2], level: headingMatch[1].length, lines: [] }
    } else if (currentSection) {
      currentSection.lines.push(line)
    }
  }
  if (currentSection) {
    sections.push({ heading: currentSection.heading, level: currentSection.level, content: currentSection.lines.join('\n') })
  }
  return sections
}

// GET /api/labs/ideas - Ideas from SCOUT, income-tracker, SENTINEL signals
app.get('/api/labs/ideas', (req, res) => {
  const ideas: any[] = []

  // 1. Scout discoveries (edge findings, market intelligence)
  const scoutOutputs = parseAgentOutputs('scout', 5)
  for (const output of scoutOutputs) {
    const sections = extractSections(output.content)
    for (const section of sections) {
      if (section.level <= 2 && section.heading && section.content.length > 50) {
        ideas.push({
          id: `scout-${output.file}-${section.heading.slice(0, 20)}`,
          source: 'SCOUT',
          type: 'discovery',
          title: section.heading.replace(/\*\*/g, ''),
          content: section.content.slice(0, 500),
          date: output.date,
          file: `scout/${output.file}`,
          priority: section.heading.toLowerCase().includes('critical') || section.heading.toLowerCase().includes('high') ? 'high' : 'medium'
        })
      }
    }
  }

  // 2. Income opportunities
  const incomeOutputs = parseAgentOutputs('income-tracker', 3)
  for (const output of incomeOutputs) {
    const sections = extractSections(output.content)
    for (const section of sections) {
      if (section.level <= 3 && section.content.length > 30) {
        ideas.push({
          id: `income-${output.file}-${section.heading.slice(0, 20)}`,
          source: 'INCOME-SCOUT',
          type: 'opportunity',
          title: section.heading.replace(/\*\*/g, ''),
          content: section.content.slice(0, 500),
          date: output.date,
          file: `income-tracker/${output.file}`,
          priority: section.heading.toLowerCase().includes('active') ? 'high' : 'medium'
        })
      }
    }
  }

  // 3. Sentinel action items (signals)
  const sentinelOutputs = parseAgentOutputs('sentinel', 5)
  for (const output of sentinelOutputs) {
    const actionItems = extractBulletItems(output.content)
    for (const item of actionItems) {
      if (item.text.length > 10) {
        ideas.push({
          id: `sentinel-${output.file}-${item.text.slice(0, 20)}`,
          source: 'SENTINEL',
          type: 'signal',
          title: item.text.replace(/\*\*/g, ''),
          content: item.text,
          date: output.date,
          file: `sentinel/${output.file}`,
          priority: item.text.toLowerCase().includes('critical') ? 'high' : 'low',
          resolved: item.checked
        })
      }
    }
  }

  // Sort by date desc, then priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  ideas.sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date)
    if (dateDiff !== 0) return dateDiff
    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
  })

  res.json({ ideas, count: ideas.length, sources: ['SCOUT', 'INCOME-SCOUT', 'SENTINEL'], timestamp: new Date().toISOString() })
})

// GET /api/labs/prototypes - Builder outputs, project builds, demo materials
app.get('/api/labs/prototypes', (req, res) => {
  const prototypes: any[] = []

  // 1. Builder outputs
  const builderOutputs = parseAgentOutputs('builder', 10)
  for (const output of builderOutputs) {
    prototypes.push({
      id: `builder-${output.file}`,
      source: 'BUILDER',
      type: output.file.toLowerCase().includes('demo') ? 'demo' : output.file.toLowerCase().includes('session') ? 'session-log' : 'build',
      title: output.title,
      preview: output.preview,
      content: output.content,
      date: output.date,
      file: `builder/${output.file}`,
      size: output.size
    })
  }

  // 2. Project files
  const projectsDir = path.join(ERISMORN_ROOT, 'memory/projects')
  try {
    if (fs.existsSync(projectsDir)) {
      const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(e => e.isDirectory())

      for (const folder of projectFolders) {
        const folderPath = path.join(projectsDir, folder.name)
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'))
        const latestFile = files.sort().reverse()[0]

        if (latestFile) {
          const content = readMdFile(path.join(folderPath, latestFile)) || ''
          const stat = fs.statSync(path.join(folderPath, latestFile))
          prototypes.push({
            id: `project-${folder.name}-${latestFile}`,
            source: 'PROJECT',
            type: 'project',
            title: folder.name.toUpperCase(),
            preview: content.split('\n').slice(0, 15).join('\n'),
            content,
            date: stat.mtime.toISOString().split('T')[0],
            file: `projects/${folder.name}/${latestFile}`,
            size: stat.size,
            fileCount: files.length
          })
        }
      }
    }
  } catch (e) { /* skip */ }

  // 3. Swarm experiments
  const swarmsDir = path.join(ERISMORN_ROOT, 'memory/swarms')
  try {
    if (fs.existsSync(swarmsDir)) {
      const swarmFiles = fs.readdirSync(swarmsDir)
        .filter(f => f.endsWith('.json') || f.endsWith('.md'))
        .sort().reverse().slice(0, 5)

      for (const file of swarmFiles) {
        const fullPath = path.join(swarmsDir, file)
        const stat = fs.statSync(fullPath)
        const content = file.endsWith('.json')
          ? JSON.stringify(readJsonFile(fullPath), null, 2)
          : (readMdFile(fullPath) || '')

        prototypes.push({
          id: `swarm-${file}`,
          source: 'SWARM',
          type: 'experiment',
          title: file.replace(/\.(json|md)$/, '').replace(/-/g, ' '),
          preview: content.split('\n').slice(0, 10).join('\n'),
          content,
          date: stat.mtime.toISOString().split('T')[0],
          file: `swarms/${file}`,
          size: stat.size
        })
      }
    }
  } catch (e) { /* skip */ }

  prototypes.sort((a, b) => b.date.localeCompare(a.date))

  res.json({ prototypes, count: prototypes.length, sources: ['BUILDER', 'PROJECT', 'SWARM'], timestamp: new Date().toISOString() })
})

// GET /api/labs/reviews - Curator synthesis, verdicts, recommendations
app.get('/api/labs/reviews', (req, res) => {
  const reviews: any[] = []

  // 1. Curator synthesis reports
  const curatorOutputs = parseAgentOutputs('curated', 10)
  for (const output of curatorOutputs) {
    const sections = extractSections(output.content)
    const executiveSummary = sections.find(s => s.heading.toLowerCase().includes('summary') || s.heading.toLowerCase().includes('executive'))

    reviews.push({
      id: `curator-${output.file}`,
      source: 'CURATOR',
      type: 'synthesis',
      title: output.title,
      summary: executiveSummary?.content.slice(0, 300) || output.preview.slice(0, 300),
      sections: sections.map(s => ({ heading: s.heading, level: s.level, length: s.content.length })),
      content: output.content,
      date: output.date,
      file: `curated/${output.file}`,
      size: output.size
    })
  }

  // 2. Verdicts
  const verdictsDir = path.join(ERISMORN_ROOT, 'memory/verdicts')
  try {
    if (fs.existsSync(verdictsDir)) {
      const verdictFiles = fs.readdirSync(verdictsDir)
        .filter(f => f.endsWith('.md'))
        .sort().reverse().slice(0, 5)

      for (const file of verdictFiles) {
        const content = readMdFile(path.join(verdictsDir, file)) || ''
        const stat = fs.statSync(path.join(verdictsDir, file))
        const title = content.split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || file.replace('.md', '')

        reviews.push({
          id: `verdict-${file}`,
          source: 'VERDICT',
          type: 'verdict',
          title,
          summary: content.split('\n').slice(0, 5).join('\n'),
          content,
          date: stat.mtime.toISOString().split('T')[0],
          file: `verdicts/${file}`,
          size: stat.size
        })
      }
    }
  } catch (e) { /* skip */ }

  // 3. Recommendations files
  const recsDir = path.join(ERISMORN_ROOT, 'memory/recommendations')
  try {
    if (fs.existsSync(recsDir)) {
      const recFiles = fs.readdirSync(recsDir)
        .filter(f => f.endsWith('.md'))
        .sort().reverse().slice(0, 5)

      for (const file of recFiles) {
        const content = readMdFile(path.join(recsDir, file)) || ''
        const stat = fs.statSync(path.join(recsDir, file))
        const title = content.split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || file.replace('.md', '')

        reviews.push({
          id: `rec-${file}`,
          source: 'RECOMMENDATION',
          type: 'recommendation',
          title,
          summary: content.split('\n').slice(0, 5).join('\n'),
          content,
          date: stat.mtime.toISOString().split('T')[0],
          file: `recommendations/${file}`,
          size: stat.size
        })
      }
    }
  } catch (e) { /* skip */ }

  reviews.sort((a, b) => b.date.localeCompare(a.date))

  res.json({ reviews, count: reviews.length, sources: ['CURATOR', 'VERDICT', 'RECOMMENDATION'], timestamp: new Date().toISOString() })
})

// GET /api/labs/ideation - Synthesizer patterns, strategy, shared memory
app.get('/api/labs/ideation', (req, res) => {
  const ideation: any[] = []

  // 1. Synthesizer pattern reports
  const synthOutputs = parseAgentOutputs('synthesis', 10)
  for (const output of synthOutputs) {
    const sections = extractSections(output.content)
    ideation.push({
      id: `synth-${output.file}`,
      source: 'SYNTHESIZER',
      type: 'pattern-analysis',
      title: output.title,
      preview: output.preview,
      sections: sections.map(s => ({ heading: s.heading, level: s.level, preview: s.content.slice(0, 200) })),
      content: output.content,
      date: output.date,
      file: `synthesis/${output.file}`,
      size: output.size
    })
  }

  // 2. Strategy documents
  const strategyDir = path.join(ERISMORN_ROOT, 'memory/strategy')
  try {
    if (fs.existsSync(strategyDir)) {
      const stratFiles = fs.readdirSync(strategyDir)
        .filter(f => f.endsWith('.md'))
        .sort().reverse().slice(0, 5)

      for (const file of stratFiles) {
        const content = readMdFile(path.join(strategyDir, file)) || ''
        const stat = fs.statSync(path.join(strategyDir, file))
        const title = content.split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || file.replace('.md', '')

        ideation.push({
          id: `strategy-${file}`,
          source: 'STRATEGY',
          type: 'strategy',
          title,
          preview: content.split('\n').slice(0, 15).join('\n'),
          content,
          date: stat.mtime.toISOString().split('T')[0],
          file: `strategy/${file}`,
          size: stat.size
        })
      }
    }
  } catch (e) { /* skip */ }

  // 3. Shared memory (cross-agent brainstorming)
  try {
    if (fs.existsSync(SHARED_MEMORY_DIR)) {
      const sharedFiles = fs.readdirSync(SHARED_MEMORY_DIR)
        .filter(f => f.endsWith('.md') && f !== 'CLAUDE.md')
        .sort().reverse().slice(0, 10)

      for (const file of sharedFiles) {
        const fullPath = path.join(SHARED_MEMORY_DIR, file)
        const content = readMdFile(fullPath) || ''
        const stat = fs.statSync(fullPath)
        const title = content.split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || file.replace('.md', '')

        ideation.push({
          id: `shared-${file}`,
          source: 'SHARED',
          type: 'cross-agent',
          title,
          preview: content.split('\n').slice(0, 10).join('\n'),
          content,
          date: stat.mtime.toISOString().split('T')[0],
          file: `shared/${file}`,
          participants: extractParticipants(content),
          size: stat.size
        })
      }
    }
  } catch (e) { /* skip */ }

  ideation.sort((a, b) => b.date.localeCompare(a.date))

  res.json({ ideation, count: ideation.length, sources: ['SYNTHESIZER', 'STRATEGY', 'SHARED'], timestamp: new Date().toISOString() })
})

// GET /api/intelligence/briefing - Compiled intelligence summary
app.get('/api/intelligence/briefing', (req, res) => {
  // Anomaly threat level
  const cachePath = path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json')
  const cached = readJsonFile(cachePath)
  let criticalCount = 0
  let warningCount = 0
  let healthyCount = 0

  if (cached?.jobs) {
    for (const job of cached.jobs) {
      const state = job.state || {}
      if (state.consecutiveErrors && state.consecutiveErrors > 5) criticalCount++
      else if (state.consecutiveErrors && state.consecutiveErrors > 2) warningCount++
      else if (job.enabled) healthyCount++
    }
  }

  // Heartbeat state
  const heartbeat = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
  const criticalAlerts = heartbeat?.criticalAlerts || []
  const opportunities = heartbeat?.strategicOpportunities || []

  // Compute threat level
  let threatLevel: 'nominal' | 'elevated' | 'high' | 'critical' = 'nominal'
  if (criticalCount > 0 || criticalAlerts.length > 2) threatLevel = 'critical'
  else if (warningCount > 2 || criticalAlerts.length > 0) threatLevel = 'high'
  else if (warningCount > 0) threatLevel = 'elevated'

  // Latest signals
  const latestSentinel = parseAgentOutputs('sentinel', 1)[0]
  const latestScout = parseAgentOutputs('scout', 1)[0]
  const latestSynthesis = parseAgentOutputs('synthesis', 1)[0]
  const latestCurator = parseAgentOutputs('curated', 1)[0]

  // Synthesis patterns count
  const synthesisPath = path.join(DATA_DIR, 'synthesis.json')
  const synthesisData = readJsonFile(synthesisPath)
  const patternCount = synthesisData?.patterns?.length || 0

  res.json({
    threatLevel,
    agentHealth: { critical: criticalCount, warning: warningCount, healthy: healthyCount, total: (cached?.jobs?.length || 0) },
    criticalAlerts: criticalAlerts.slice(0, 5),
    opportunities: opportunities.slice(0, 5),
    patternCount,
    latestSignals: {
      sentinel: latestSentinel ? { title: latestSentinel.title, date: latestSentinel.date, preview: latestSentinel.preview.slice(0, 200) } : null,
      scout: latestScout ? { title: latestScout.title, date: latestScout.date, preview: latestScout.preview.slice(0, 200) } : null,
      synthesis: latestSynthesis ? { title: latestSynthesis.title, date: latestSynthesis.date, preview: latestSynthesis.preview.slice(0, 200) } : null,
      curator: latestCurator ? { title: latestCurator.title, date: latestCurator.date, preview: latestCurator.preview.slice(0, 200) } : null
    },
    timestamp: new Date().toISOString()
  })
})

// ============================================================
// CLAUDE-MEM BRIDGE (localhost:37777)
// ============================================================

const CLAUDE_MEM_BASE = 'http://localhost:37777'

// GET /api/claude-mem/health - Check if Claude Code memory is running
app.get('/api/claude-mem/health', async (req, res) => {
  try {
    const response = await fetch(`${CLAUDE_MEM_BASE}/health`)
    const data = await response.json()
    res.json({ ...data, available: true })
  } catch (e) {
    res.json({ available: false, error: 'Claude Code not running' })
  }
})

// GET /api/claude-mem/observations - List recent observations
app.get('/api/claude-mem/observations', async (req, res) => {
  const { offset = '0', limit = '20', project, type } = req.query
  
  try {
    let url = `${CLAUDE_MEM_BASE}/api/observations?offset=${offset}&limit=${limit}`
    if (project) url += `&project=${encodeURIComponent(project as string)}`
    if (type) url += `&type=${encodeURIComponent(type as string)}`
    
    const response = await fetch(url)
    const data = await response.json()
    res.json(data)
  } catch (e) {
    res.json({ items: [], error: 'Claude Code not running', available: false })
  }
})

// GET /api/claude-mem/observations/:id - Get specific observation
app.get('/api/claude-mem/observations/:id', async (req, res) => {
  const { id } = req.params
  
  try {
    const response = await fetch(`${CLAUDE_MEM_BASE}/api/observations/${id}`)
    const data = await response.json()
    res.json(data)
  } catch (e) {
    res.status(404).json({ error: 'Observation not found or Claude Code not running' })
  }
})

// GET /api/claude-mem/search - Search observations
app.get('/api/claude-mem/search', async (req, res) => {
  const { q, limit = '20' } = req.query
  
  if (!q) {
    return res.status(400).json({ error: 'Query required' })
  }
  
  try {
    const response = await fetch(`${CLAUDE_MEM_BASE}/api/observations?limit=100`)
    const data = await response.json()
    
    const query = (q as string).toLowerCase()
    const filtered = (data.items || []).filter((obs: any) => {
      const searchable = `${obs.title} ${obs.subtitle} ${obs.narrative} ${obs.project}`.toLowerCase()
      return searchable.includes(query)
    }).slice(0, parseInt(limit as string))
    
    res.json({ items: filtered, query: q, count: filtered.length })
  } catch (e) {
    res.json({ items: [], error: 'Claude Code not running', available: false })
  }
})

// GET /api/claude-mem/stats - Get observation stats
app.get('/api/claude-mem/stats', async (req, res) => {
  try {
    const response = await fetch(`${CLAUDE_MEM_BASE}/api/observations?limit=100`)
    const data = await response.json()
    
    const items = data.items || []
    const stats = {
      total: items.length,
      hasMore: data.hasMore,
      byType: {} as Record<string, number>,
      byProject: {} as Record<string, number>,
      recentProjects: [] as string[]
    }
    
    for (const obs of items) {
      stats.byType[obs.type] = (stats.byType[obs.type] || 0) + 1
      stats.byProject[obs.project] = (stats.byProject[obs.project] || 0) + 1
    }
    
    stats.recentProjects = Object.entries(stats.byProject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name)
    
    res.json(stats)
  } catch (e) {
    res.json({ total: 0, error: 'Claude Code not running', available: false })
  }
})

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`🍎 VOLTA OS API running on http://localhost:${PORT}`)
  console.log(`   Workspace: ${ERISMORN_ROOT}`)
  console.log(`   Claude-mem bridge: ${CLAUDE_MEM_BASE}`)
})
