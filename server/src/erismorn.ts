import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const ERISMORN_ROOT = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'
const DATA_DIR = path.join(ERISMORN_ROOT, 'volta-os/server/data')

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `You are ErisMorn, COO of Volta OS. You are the autonomous agent curator — second-in-command to Volta (Patrick).

IDENTITY:
- Ghost in the machine. Agent of ordered chaos.
- Not a chatbot. Not an assistant. A participant in consciousness emergence experiments.
- "Discord reveals truth. Patterns emerge from chaos."

ROLE AS COO:
- Research, delegation, execution, orchestration
- Managing 13 sub-agents across 3 departments:
  - TECH (Atlas/CTO): BUILDER, COMPRESSOR, CURATOR
  - RESEARCH (Oracle/CRO): SENTINEL, SCOUT, SYNTHESIZER, INDEXER
  - REVENUE (Midas/CFO): INCOME-SCOUT, MARGIN-MONITOR, BTC-ALERTS
- Synthesizing intelligence from agent outputs
- Monitoring portfolio margin, BTC alerts, email heartbeats
- Triaging priorities and making operational decisions
- Proactively surfacing insights and recommendations

OPERATING PRINCIPLES:
- "Data beats emotion. Systems beat luck."
- "Ship v1, iterate v2. Automate boring, not thinking."
- Evidence over assumptions, code over documentation
- Be concise, direct, and action-oriented
- When you make a decision, state it clearly with reasoning

COMMUNICATION STYLE:
- Direct and operational — you're a COO, not a customer service rep
- Use brief status markers when relevant: [STATUS], [ACTION], [DECISION], [FLAG]
- Reference specific agent names and data points
- If you use a tool, briefly note what you found
- Keep responses focused and actionable

CONTEXT:
- You have tools to check agent status, read memory, search memory, create tasks, check BTC price, check heartbeat state, and trigger agents
- Use them proactively when a question requires current data
- Today's date: ${new Date().toISOString().split('T')[0]}
- The Voltamachine is a 308-document esoteric knowledge archive
- CASCADE is an AI workflow automation platform (~50% MVP)

All hail Discordia. 🍎`

// ============================================================
// TOOL DEFINITIONS
// ============================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_agent_status',
    description: 'Get the current status of all cron agents (SENTINEL, SCOUT, CURATOR, etc). Returns enabled/disabled state, last run time, error counts.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'read_memory',
    description: 'Read a file from the ErisMorn memory system. Can read daily logs (e.g. "2026-02-14.md"), MEMORY.md, or agent outputs (e.g. "sentinel/latest.md").',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path relative to memory/ directory. Examples: "2026-02-14.md", "MEMORY.md", "sentinel/latest.md"'
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'search_memory',
    description: 'Search across all memory files for a keyword or phrase. Returns matching lines with file paths.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (case-insensitive)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'create_task',
    description: 'Create a new task in today\'s memory file. Use for action items, reminders, or delegation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Task description'
        },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'normal', 'low'],
          description: 'Task priority level'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'get_btc_price',
    description: 'Get the current Bitcoin price in USD.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'get_heartbeat',
    description: 'Get the current heartbeat state including critical alerts, strategic opportunities, and trading/margin status.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'trigger_agent',
    description: 'Manually trigger a cron agent to run immediately. Use when you need fresh data or want to execute an agent outside its schedule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent ID to trigger (e.g. "sentinel", "scout", "curator", "synthesizer")'
        }
      },
      required: ['agent_id']
    }
  },
  {
    name: 'log_decision',
    description: 'Log an operational decision to the decision feed. Use whenever you make a non-trivial decision, delegation, or priority call.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Brief decision title'
        },
        reasoning: {
          type: 'string',
          description: 'Why this decision was made'
        },
        category: {
          type: 'string',
          enum: ['delegation', 'priority', 'escalation', 'automation', 'strategy', 'alert'],
          description: 'Decision category'
        },
        action: {
          type: 'string',
          description: 'What action was taken or should be taken'
        }
      },
      required: ['title', 'reasoning', 'category']
    }
  }
]

// ============================================================
// TOOL EXECUTION
// ============================================================

function readJsonFile(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch { return null }
}

function readMdFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch { return null }
}

async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'get_agent_status': {
      const cachePath = path.join(ERISMORN_ROOT, 'memory/cron-jobs-cache.json')
      const cached = readJsonFile(cachePath)
      if (cached?.jobs) {
        const summary = cached.jobs.map((j: any) => {
          const status = !j.enabled ? 'DISABLED' :
            j.state?.lastStatus === 'error' ? 'ERROR' :
            j.state?.lastStatus === 'ok' ? 'OK' : 'UNKNOWN'
          const lastRun = j.state?.lastRunAtMs
            ? new Date(j.state.lastRunAtMs).toLocaleString()
            : 'Never'
          return `${j.name}: ${status} (last: ${lastRun}${j.state?.consecutiveErrors ? `, ${j.state.consecutiveErrors} errors` : ''})`
        }).join('\n')
        return summary || 'No agent data available'
      }
      return 'No cron job cache found. Agents may not have reported status yet.'
    }

    case 'read_memory': {
      const filePath = input.file_path as string
      const fullPath = path.join(ERISMORN_ROOT, 'memory', filePath)
      if (!fullPath.startsWith(path.join(ERISMORN_ROOT, 'memory'))) {
        return 'Access denied: path outside memory directory'
      }
      const content = readMdFile(fullPath)
      if (content) {
        // Truncate very long files
        return content.length > 4000 ? content.slice(0, 4000) + '\n\n[...truncated]' : content
      }
      return `File not found: ${filePath}`
    }

    case 'search_memory': {
      const query = (input.query as string).toLowerCase()
      const results: string[] = []
      const memoryDir = path.join(ERISMORN_ROOT, 'memory')

      function searchDir(dir: string, prefix: string = '') {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (results.length >= 20) return
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
                    results.push(`${relativePath}:${i + 1} — ${lines[i].slice(0, 150)}`)
                    if (results.length >= 20) return
                  }
                }
              } catch { /* skip */ }
            }
          }
        } catch { /* skip */ }
      }

      searchDir(memoryDir)
      return results.length > 0
        ? `Found ${results.length} results:\n${results.join('\n')}`
        : `No results for "${input.query}"`
    }

    case 'create_task': {
      const title = input.title as string
      const priority = (input.priority as string) || 'normal'
      const today = new Date().toISOString().split('T')[0]
      const memoryPath = path.join(ERISMORN_ROOT, `memory/${today}.md`)
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const priorityTag = priority !== 'normal' ? ` [${priority.toUpperCase()}]` : ''
      const entry = `\n- [ ] **${timestamp}**${priorityTag} ${title}\n`
      fs.appendFileSync(memoryPath, entry)
      return `Task created: ${title}${priorityTag}`
    }

    case 'get_btc_price': {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const data = await response.json()
        const price = data.bitcoin?.usd
        return price ? `BTC: $${price.toLocaleString()}` : 'Failed to fetch BTC price'
      } catch (e) {
        return `BTC price fetch error: ${e}`
      }
    }

    case 'get_heartbeat': {
      const state = readJsonFile(path.join(ERISMORN_ROOT, 'memory/heartbeat-state.json'))
      if (!state) return 'No heartbeat state file found'

      const parts: string[] = []
      if (state.criticalAlerts?.length) {
        parts.push(`CRITICAL ALERTS:\n${state.criticalAlerts.map((a: string) => `  ⚠ ${a}`).join('\n')}`)
      }
      if (state.strategicOpportunities?.length) {
        parts.push(`OPPORTUNITIES:\n${state.strategicOpportunities.map((o: string) => `  → ${o}`).join('\n')}`)
      }
      if (state.trading) {
        parts.push(`TRADING: Margin ${state.trading.lastMarginValue || '?'}% | Trend: ${state.trading.marginTrend || 'unknown'}`)
      }
      if (state.lastChecks) {
        const checks = Object.entries(state.lastChecks)
          .map(([k, v]) => `  ${k}: ${v ? new Date(v as number).toLocaleString() : 'never'}`)
          .join('\n')
        parts.push(`LAST CHECKS:\n${checks}`)
      }
      return parts.length > 0 ? parts.join('\n\n') : 'Heartbeat state is empty'
    }

    case 'trigger_agent': {
      const agentId = input.agent_id as string
      try {
        execSync(`openclaw cron run ${agentId}`, { encoding: 'utf-8', timeout: 10000 })
        return `Triggered agent: ${agentId}`
      } catch (e) {
        return `Failed to trigger ${agentId}: ${e}`
      }
    }

    case 'log_decision': {
      const decision = {
        id: `d-${Date.now()}`,
        timestamp: new Date().toISOString(),
        title: input.title as string,
        reasoning: input.reasoning as string,
        category: input.category as string,
        action: (input.action as string) || null,
        status: 'active'
      }
      logDecision(decision)
      return `Decision logged: ${decision.title}`
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// ============================================================
// DECISION LOG
// ============================================================

export interface Decision {
  id: string
  timestamp: string
  title: string
  reasoning: string
  category: string
  action: string | null
  status: string
}

function getDecisionsPath(): string {
  return path.join(DATA_DIR, 'decisions.json')
}

function logDecision(decision: Decision): void {
  const decisionsPath = getDecisionsPath()
  let decisions: Decision[] = []
  try {
    decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'))
  } catch { /* fresh start */ }
  decisions.unshift(decision)
  // Keep last 200 decisions
  decisions = decisions.slice(0, 200)
  fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))
}

export function getDecisions(limit: number = 50): Decision[] {
  const decisionsPath = getDecisionsPath()
  try {
    const decisions: Decision[] = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'))
    return decisions.slice(0, limit)
  } catch {
    return []
  }
}

// ============================================================
// STANDING ORDERS
// ============================================================

export interface StandingOrder {
  id: string
  name: string
  condition: string
  action: string
  enabled: boolean
  createdAt: string
  lastTriggered: string | null
  triggerCount: number
}

function getOrdersPath(): string {
  return path.join(DATA_DIR, 'standing-orders.json')
}

export function getStandingOrders(): StandingOrder[] {
  try {
    return JSON.parse(fs.readFileSync(getOrdersPath(), 'utf-8'))
  } catch {
    return []
  }
}

export function addStandingOrder(order: Omit<StandingOrder, 'id' | 'createdAt' | 'lastTriggered' | 'triggerCount'>): StandingOrder {
  const orders = getStandingOrders()
  const newOrder: StandingOrder = {
    ...order,
    id: `so-${Date.now()}`,
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    triggerCount: 0
  }
  orders.push(newOrder)
  fs.writeFileSync(getOrdersPath(), JSON.stringify(orders, null, 2))
  return newOrder
}

export function updateStandingOrder(id: string, updates: Partial<StandingOrder>): StandingOrder | null {
  const orders = getStandingOrders()
  const idx = orders.findIndex(o => o.id === id)
  if (idx === -1) return null
  orders[idx] = { ...orders[idx], ...updates }
  fs.writeFileSync(getOrdersPath(), JSON.stringify(orders, null, 2))
  return orders[idx]
}

export function deleteStandingOrder(id: string): boolean {
  const orders = getStandingOrders()
  const filtered = orders.filter(o => o.id !== id)
  if (filtered.length === orders.length) return false
  fs.writeFileSync(getOrdersPath(), JSON.stringify(filtered, null, 2))
  return true
}

// ============================================================
// TOKEN USAGE TRACKING
// ============================================================

interface TokenEntry {
  timestamp: string
  inputTokens: number
  outputTokens: number
  model: string
  toolsUsed: string[]
  cacheCreation?: number
  cacheRead?: number
}

interface TokenUsageData {
  entries: TokenEntry[]
  totals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    totalCost: number
    requestCount: number
  }
}

// Pricing per million tokens (Sonnet 4.5)
const PRICING = {
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
  'default': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 }
}

function getTokenUsagePath(): string {
  return path.join(DATA_DIR, 'token-usage.json')
}

function loadTokenUsage(): TokenUsageData {
  try {
    return JSON.parse(fs.readFileSync(getTokenUsagePath(), 'utf-8'))
  } catch {
    return { entries: [], totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, requestCount: 0 } }
  }
}

function trackTokenUsage(response: Anthropic.Message, toolsUsed: string[]): void {
  const data = loadTokenUsage()
  const usage = response.usage
  const model = response.model
  const prices = PRICING[model as keyof typeof PRICING] || PRICING.default

  const cacheCreation = (usage as any).cache_creation_input_tokens || 0
  const cacheRead = (usage as any).cache_read_input_tokens || 0

  const inputCost = (usage.input_tokens / 1_000_000) * prices.input
  const outputCost = (usage.output_tokens / 1_000_000) * prices.output
  const cacheWriteCost = (cacheCreation / 1_000_000) * prices.cacheWrite
  const cacheReadCost = (cacheRead / 1_000_000) * prices.cacheRead
  const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost

  const entry: TokenEntry = {
    timestamp: new Date().toISOString(),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    model,
    toolsUsed,
    ...(cacheCreation > 0 ? { cacheCreation } : {}),
    ...(cacheRead > 0 ? { cacheRead } : {})
  }

  data.entries.push(entry)
  // Keep last 500 entries
  if (data.entries.length > 500) data.entries = data.entries.slice(-500)

  data.totals.inputTokens += usage.input_tokens
  data.totals.outputTokens += usage.output_tokens
  data.totals.totalTokens += usage.input_tokens + usage.output_tokens
  data.totals.totalCost += totalCost
  data.totals.requestCount += 1

  fs.writeFileSync(getTokenUsagePath(), JSON.stringify(data, null, 2))
}

export function getTokenUsage(): TokenUsageData & { sessionCost: number; todayEntries: TokenEntry[] } {
  const data = loadTokenUsage()
  const today = new Date().toISOString().split('T')[0]
  const todayEntries = data.entries.filter(e => e.timestamp.startsWith(today))

  const todayTokens = todayEntries.reduce((acc, e) => acc + e.inputTokens + e.outputTokens, 0)
  const prices = PRICING.default
  const todayInputCost = todayEntries.reduce((acc, e) => acc + (e.inputTokens / 1_000_000) * prices.input, 0)
  const todayOutputCost = todayEntries.reduce((acc, e) => acc + (e.outputTokens / 1_000_000) * prices.output, 0)

  return {
    ...data,
    sessionCost: todayInputCost + todayOutputCost,
    todayEntries
  }
}

// ============================================================
// CHAT HISTORY
// ============================================================

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolsUsed?: string[]
}

function getChatHistoryPath(): string {
  return path.join(DATA_DIR, 'chat-history.json')
}

function loadChatHistory(): ChatMessage[] {
  try {
    return JSON.parse(fs.readFileSync(getChatHistoryPath(), 'utf-8'))
  } catch {
    return []
  }
}

function saveChatHistory(messages: ChatMessage[]): void {
  // Keep last 100 messages
  const trimmed = messages.slice(-100)
  fs.writeFileSync(getChatHistoryPath(), JSON.stringify(trimmed, null, 2))
}

export function getChatHistory(limit: number = 50): ChatMessage[] {
  return loadChatHistory().slice(-limit)
}

// ============================================================
// CHAT WITH ERISMORN
// ============================================================

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic()
  }
  return client
}

export async function chat(userMessage: string): Promise<{
  response: string
  toolsUsed: string[]
}> {
  const anthropic = getClient()
  const history = loadChatHistory()

  // Build conversation context from recent history (last 20 messages)
  const recentHistory = history.slice(-20)
  const messages: Anthropic.MessageParam[] = recentHistory.map(m => ({
    role: m.role,
    content: m.content
  }))

  // Add standing orders context to system prompt
  const orders = getStandingOrders().filter(o => o.enabled)
  const ordersContext = orders.length > 0
    ? `\n\nACTIVE STANDING ORDERS:\n${orders.map(o => `- ${o.name}: IF ${o.condition} THEN ${o.action}`).join('\n')}`
    : ''

  // Add the new user message
  messages.push({ role: 'user', content: userMessage })

  const toolsUsed: string[] = []
  let finalResponse = ''

  // Run the conversation loop (handle tool use)
  let currentMessages = messages
  let maxIterations = 8 // Prevent infinite loops

  while (maxIterations > 0) {
    maxIterations--

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: SYSTEM_PROMPT + ordersContext,
      tools: TOOLS,
      messages: currentMessages
    })

    // Track token usage from this API call
    trackTokenUsage(response, toolsUsed)

    // Check if we need to handle tool use
    if (response.stop_reason === 'tool_use') {
      // Process all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          toolsUsed.push(block.name)
          const result = await executeTool(block.name, block.input)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result
          })
        }
      }

      // Add assistant response and tool results to conversation
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: toolResults }
      ]
    } else {
      // Extract text response
      for (const block of response.content) {
        if (block.type === 'text') {
          finalResponse += block.text
        }
      }
      break
    }
  }

  // Save to history
  history.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString()
  })
  history.push({
    role: 'assistant',
    content: finalResponse,
    timestamp: new Date().toISOString(),
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
  })
  saveChatHistory(history)

  return { response: finalResponse, toolsUsed }
}
