import { useState, useEffect, useCallback } from 'react'
import {
  Bot, Power, Play, RefreshCw, AlertTriangle, CheckCircle,
  Clock, Loader, Cpu, XCircle, Pause, Zap
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

interface CronJob {
  id: string
  name: string
  enabled: boolean
  schedule: { kind: string; everyMs?: number; expr?: string }
  state?: {
    lastRunAtMs?: number
    lastStatus?: string
    nextRunAtMs?: number
    consecutiveErrors?: number
  }
}

type StatusColor = 'green' | 'yellow' | 'red' | 'gray'

function getStatusColor(job: CronJob): StatusColor {
  if (!job.enabled) return 'gray'
  if (job.state?.lastStatus === 'error') return 'red'
  if (job.state?.lastStatus === 'ok') return 'green'
  return 'yellow'
}

function getStatusLabel(job: CronJob): string {
  if (!job.enabled) return 'Disabled'
  if (job.state?.lastStatus === 'error') return 'Error'
  if (job.state?.lastStatus === 'ok') return 'OK'
  if (!job.state?.lastRunAtMs) return 'Pending'
  return 'Idle'
}

function formatSchedule(schedule: CronJob['schedule']): string {
  if (schedule.kind === 'every') {
    const mins = (schedule.everyMs || 0) / 60000
    if (mins >= 1440) return `Every ${Math.round(mins / 1440)}d`
    if (mins >= 60) return `Every ${Math.round(mins / 60)}h`
    return `Every ${mins}m`
  }
  if (schedule.kind === 'cron') return schedule.expr || 'cron'
  return schedule.kind
}

function formatLastRun(ms?: number): string {
  if (!ms) return 'Never'
  const date = new Date(ms)
  const now = Date.now()
  const diffMs = now - ms
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getAgentModel(name: string): string | null {
  const lower = name.toLowerCase()
  if (lower.includes('scout') || lower.includes('synthesiz') || lower.includes('income')) return 'sonnet-4.5'
  if (lower.includes('sentinel') || lower.includes('curator') || lower.includes('compressor') || lower.includes('builder') || lower.includes('voltamachine') || lower.includes('portfolio') || lower.includes('btc') || lower.includes('margin') || lower.includes('email') || lower.includes('pieces')) return 'haiku-4.5'
  return null
}

const statusDotColors: Record<StatusColor, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  gray: 'bg-gray-500',
}

const statusBgColors: Record<StatusColor, string> = {
  green: 'bg-green-900/30 border-green-800/30',
  yellow: 'bg-yellow-900/30 border-yellow-800/30',
  red: 'bg-red-900/30 border-red-800/30',
  gray: 'bg-gray-800/30 border-gray-700/30',
}

const statusTextColors: Record<StatusColor, string> = {
  green: 'text-green-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  gray: 'text-gray-500',
}

function AgentCard({
  job,
  onToggle,
  onTrigger,
  toggling,
  triggering,
}: {
  job: CronJob
  onToggle: (id: string) => void
  onTrigger: (id: string) => void
  toggling: string | null
  triggering: string | null
}) {
  const status = getStatusColor(job)
  const model = getAgentModel(job.name)
  const errors = job.state?.consecutiveErrors || 0

  return (
    <div className={`bg-[#1e2433] rounded-lg border ${statusBgColors[status]} p-4 hover:border-amber-700/40 transition-colors`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Bot className="w-5 h-5 text-amber-400" />
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1e2433] ${statusDotColors[status]}`} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-100 leading-tight">{job.name}</h3>
            <span className={`text-[10px] ${statusTextColors[status]}`}>{getStatusLabel(job)}</span>
          </div>
        </div>

        {/* Enabled toggle */}
        <button
          onClick={() => onToggle(job.id)}
          disabled={toggling === job.id}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            job.enabled ? 'bg-green-600' : 'bg-gray-600'
          } ${toggling === job.id ? 'opacity-50' : 'hover:opacity-80'}`}
          title={job.enabled ? 'Disable agent' : 'Enable agent'}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            job.enabled ? 'left-[18px]' : 'left-0.5'
          }`} />
        </button>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Last Run
          </span>
          <span className="text-gray-300 font-mono">{formatLastRun(job.state?.lastRunAtMs)}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Schedule
          </span>
          <span className="text-gray-300 font-mono">{formatSchedule(job.schedule)}</span>
        </div>

        {errors > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Errors
            </span>
            <span className="text-red-300 font-mono">{errors}</span>
          </div>
        )}

        {model && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Cpu className="w-3 h-3" />
              Model
            </span>
            <span className="text-[10px] bg-amber-900/30 text-amber-300 px-2 py-0.5 rounded">
              {model}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-gray-700/30">
        <button
          onClick={() => onTrigger(job.id)}
          disabled={triggering === job.id || !job.enabled}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            !job.enabled
              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
              : triggering === job.id
                ? 'bg-purple-900/50 text-purple-300'
                : 'bg-purple-900/30 text-purple-300 hover:bg-purple-900/50'
          }`}
        >
          {triggering === job.id ? (
            <Loader className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {triggering === job.id ? 'Running...' : 'Trigger'}
        </button>
      </div>
    </div>
  )
}

export default function AgentControl() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [triggering, setTriggering] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/cron-jobs`)
      const data = await res.json()
      setJobs(data.jobs || [])
      setError(null)
      setLastRefresh(new Date())
    } catch (e) {
      console.error('Failed to fetch agent data:', e)
      setError('Failed to connect to agent gateway')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
    const interval = setInterval(loadJobs, 30000)
    return () => clearInterval(interval)
  }, [loadJobs])

  async function handleToggle(id: string) {
    setToggling(id)
    try {
      const res = await fetch(`${API_BASE}/erismorn/agents/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        // Optimistically toggle local state
        setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j))
      }
    } catch (e) {
      console.error('Toggle failed:', e)
      // Silently fail — endpoint may not exist yet
    } finally {
      setToggling(null)
    }
  }

  async function handleTrigger(jobId: string) {
    setTriggering(jobId)
    try {
      await fetch(`${API_BASE}/action/trigger-cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
    } catch (e) {
      console.error('Trigger failed:', e)
    } finally {
      setTimeout(() => setTriggering(null), 2000)
    }
  }

  // Summary stats
  const enabledCount = jobs.filter(j => j.enabled).length
  const healthyCount = jobs.filter(j => j.enabled && j.state?.lastStatus === 'ok').length
  const errorCount = jobs.filter(j => j.state?.lastStatus === 'error').length
  const pendingCount = jobs.filter(j => j.enabled && !j.state?.lastRunAtMs).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-amber-100">Agent Control</h2>
            <p className="text-xs text-gray-400">Lifecycle management for all sub-agents</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-500">
            Last sync: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={loadJobs}
            disabled={loading}
            className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-300">{jobs.length}</p>
          <p className="text-xs text-gray-400">Total</p>
        </div>
        <div className="bg-[#1e2433] border border-green-900/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{healthyCount}</p>
          <p className="text-xs text-gray-400">Healthy</p>
        </div>
        <div className="bg-[#1e2433] border border-red-900/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{errorCount}</p>
          <p className="text-xs text-gray-400">Errors</p>
        </div>
        <div className="bg-[#1e2433] border border-yellow-900/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-yellow-400">{pendingCount}</p>
          <p className="text-xs text-gray-400">Pending</p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 flex items-center gap-3">
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
          <button
            onClick={loadJobs}
            className="ml-auto text-xs text-red-400 hover:text-red-300 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && jobs.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Connecting to agent gateway...</p>
          </div>
        </div>
      )}

      {/* Agent Grid */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {jobs.map(job => (
            <AgentCard
              key={job.id}
              job={job}
              onToggle={handleToggle}
              onTrigger={handleTrigger}
              toggling={toggling}
              triggering={triggering}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && jobs.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Bot className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No agents discovered</p>
            <p className="text-xs text-gray-600 mt-1">Ensure the gateway is running on port 3001</p>
          </div>
        </div>
      )}
    </div>
  )
}
