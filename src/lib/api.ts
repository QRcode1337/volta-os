// ErisMorn Dashboard API Client

const API_BASE = 'http://localhost:3001/api'

export interface CronJob {
  id: string
  name: string
  enabled: boolean
  schedule: {
    kind: string
    everyMs?: number
    expr?: string
  }
  state?: {
    lastRunAtMs?: number
    lastStatus?: string
    nextRunAtMs?: number
    consecutiveErrors?: number
  }
}

export interface HeartbeatState {
  lastChecks?: Record<string, number | null>
  criticalAlerts?: string[]
  strategicOpportunities?: string[]
  trading?: {
    marginTrend?: string
    lastMarginValue?: string
  }
}

export interface PortfolioData {
  lastFile: string | null
  content: string | null
  files: string[]
}

export interface ActionLogEntry {
  id: string
  timestamp: string
  message: string
}

export interface MemoryFile {
  date: string
  preview: string
}

// Fetch functions
export async function fetchStatus() {
  const res = await fetch(`${API_BASE}/status`)
  return res.json()
}

export async function fetchCronJobs(): Promise<{ jobs: CronJob[] }> {
  const res = await fetch(`${API_BASE}/cron-jobs`)
  return res.json()
}

export async function fetchHeartbeatState(): Promise<HeartbeatState> {
  const res = await fetch(`${API_BASE}/heartbeat-state`)
  return res.json()
}

export async function fetchPortfolio(): Promise<PortfolioData> {
  const res = await fetch(`${API_BASE}/portfolio`)
  return res.json()
}

export async function fetchBtcPrice(): Promise<{ price: number | null; timestamp: string }> {
  const res = await fetch(`${API_BASE}/btc-price`)
  return res.json()
}

export async function fetchTodayMemory(): Promise<{ date: string; content: string; exists: boolean }> {
  const res = await fetch(`${API_BASE}/memory/today`)
  return res.json()
}

export async function fetchRecentMemory(): Promise<{ files: MemoryFile[] }> {
  const res = await fetch(`${API_BASE}/memory/recent`)
  return res.json()
}

export async function fetchActionLog(): Promise<{ actions: ActionLogEntry[] }> {
  const res = await fetch(`${API_BASE}/action-log`)
  return res.json()
}

export interface ModelInfo {
  id: string
  name: string
  role: string
  desc?: string
  reasoning?: boolean
  vision?: boolean
  cost: string
  type?: string
}

export interface ProviderInfo {
  name: string
  status: string
  endpoint?: string
  auth?: string
  models: ModelInfo[]
}

export interface ModelsFleet {
  lastUpdated: string
  providers: Record<string, ProviderInfo>
  summary: {
    totalProviders: number
    totalModels: number
    localModels: number
    cloudModels: number
    activeForCron: Record<string, number>
  }
}

export async function fetchModelsFleet(): Promise<ModelsFleet> {
  const res = await fetch(`${API_BASE}/models-fleet`)
  return res.json()
}

export async function sendTask(title: string, type: string = 'note'): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, type })
  })
  return res.json()
}

export async function sendMessage(message: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  })
  return res.json()
}

// Cron outputs
export interface CronOutputFile {
  file: string
  preview: string
  timestamp: string
}

export interface CronOutputs {
  outputs: Record<string, CronOutputFile[]>
  lastUpdated: string
}

export async function fetchCronOutputs(): Promise<CronOutputs> {
  const res = await fetch(`${API_BASE}/cron-outputs`)
  return res.json()
}

export async function fetchCronOutput(jobKey: string, file: string): Promise<{ jobKey: string; file: string; content: string }> {
  const res = await fetch(`${API_BASE}/cron-output/${jobKey}/${file}`)
  return res.json()
}

// Transform cron jobs to task format
export function cronJobsToTasks(jobs: CronJob[]) {
  return jobs.map(job => ({
    id: job.id,
    title: job.name,
    date: job.state?.lastRunAtMs 
      ? new Date(job.state.lastRunAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Never run',
    status: getJobStatus(job),
    progress: job.state?.lastStatus === 'ok' ? 100 : (job.state?.consecutiveErrors ? 0 : 50),
    cronJob: job // Keep reference to original
  }))
}

function getJobStatus(job: CronJob): 'todo' | 'progress' | 'done' | 'archived' {
  if (!job.enabled) return 'archived'
  if (!job.state?.lastRunAtMs) return 'todo'
  if (job.state.lastStatus === 'error') return 'progress' // Needs attention
  if (job.state.lastStatus === 'ok') return 'done'
  return 'progress'
}
