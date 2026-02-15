import { useState } from 'react'
import { 
  RefreshCw, Play, Mail, MessageSquare, Zap, 
  AlertTriangle, CheckCircle, Loader, Terminal,
  Bitcoin, Eye, FileText
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

interface ActionResult {
  success: boolean
  message: string
  data?: any
}

export function QuickActions() {
  const [loading, setLoading] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ActionResult | null>(null)
  const [showOutput, setShowOutput] = useState(false)

  async function runAction(actionId: string, label: string, handler: () => Promise<ActionResult>) {
    setLoading(actionId)
    setLastResult(null)
    try {
      const result = await handler()
      setLastResult(result)
      setShowOutput(true)
    } catch (e) {
      setLastResult({ success: false, message: String(e) })
      setShowOutput(true)
    } finally {
      setLoading(null)
    }
  }

  // Action handlers
  const actions = [
    {
      id: 'restart-gateway',
      label: 'Restart Gateway',
      icon: <RefreshCw className="w-4 h-4" />,
      color: 'text-amber-400',
      handler: async (): Promise<ActionResult> => {
        const res = await fetch(`${API_BASE}/action/restart-gateway`, { method: 'POST' })
        const data = await res.json()
        return data.success 
          ? { success: true, message: 'Gateway restart triggered' }
          : { success: false, message: data.error || 'Failed' }
      }
    },
    {
      id: 'check-email',
      label: 'Check Email',
      icon: <Mail className="w-4 h-4" />,
      color: 'text-blue-400',
      handler: async (): Promise<ActionResult> => {
        const res = await fetch(`${API_BASE}/action/check-email`, { method: 'POST' })
        const data = await res.json()
        return { success: data.success, message: data.output || data.error || 'Done' }
      }
    },
    {
      id: 'btc-price',
      label: 'BTC Price',
      icon: <Bitcoin className="w-4 h-4" />,
      color: 'text-orange-400',
      handler: async (): Promise<ActionResult> => {
        const res = await fetch(`${API_BASE}/btc-price`)
        const data = await res.json()
        if (data.price) {
          const formatted = new Intl.NumberFormat('en-US', { 
            style: 'currency', 
            currency: 'USD',
            maximumFractionDigits: 0
          }).format(data.price)
          return { success: true, message: `BTC: ${formatted}`, data }
        }
        return { success: false, message: 'Failed to fetch price' }
      }
    },
    {
      id: 'send-heartbeat',
      label: 'Heartbeat',
      icon: <Zap className="w-4 h-4" />,
      color: 'text-purple-400',
      handler: async (): Promise<ActionResult> => {
        const res = await fetch(`${API_BASE}/action/heartbeat`, { method: 'POST' })
        const data = await res.json()
        return { success: data.success, message: data.message || 'Heartbeat sent' }
      }
    },
    {
      id: 'view-sessions',
      label: 'Sessions',
      icon: <Eye className="w-4 h-4" />,
      color: 'text-green-400',
      handler: async (): Promise<ActionResult> => {
        const res = await fetch(`${API_BASE}/sessions`)
        const data = await res.json()
        return { 
          success: true, 
          message: `${data.sessions?.length || 0} active sessions`,
          data 
        }
      }
    },
    {
      id: 'cron-status',
      label: 'Cron Status',
      icon: <Terminal className="w-4 h-4" />,
      color: 'text-cyan-400',
      handler: async (): Promise<ActionResult> => {
        const res = await fetch(`${API_BASE}/cron-jobs`)
        const data = await res.json()
        const jobs = data.jobs || []
        const enabled = jobs.filter((j: any) => j.enabled).length
        return { 
          success: true, 
          message: `${enabled}/${jobs.length} jobs enabled`,
          data: jobs
        }
      }
    }
  ]

  return (
    <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4" />
        Quick Actions
      </h3>
      
      <div className="grid grid-cols-3 gap-2">
        {actions.map(action => (
          <button
            key={action.id}
            onClick={() => runAction(action.id, action.label, action.handler)}
            disabled={loading !== null}
            className={`
              flex flex-col items-center justify-center gap-1 p-3 rounded-lg
              bg-[#252b3b] hover:bg-[#2a3142] transition-all
              border border-transparent hover:border-purple-800/50
              disabled:opacity-50 disabled:cursor-not-allowed
              ${loading === action.id ? 'animate-pulse' : ''}
            `}
          >
            {loading === action.id ? (
              <Loader className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <span className={action.color}>{action.icon}</span>
            )}
            <span className="text-[10px] text-gray-400">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Result output */}
      {showOutput && lastResult && (
        <div className={`mt-3 p-2 rounded text-xs flex items-start gap-2 ${
          lastResult.success 
            ? 'bg-green-900/30 border border-green-800/50' 
            : 'bg-red-900/30 border border-red-800/50'
        }`}>
          {lastResult.success ? (
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span className={lastResult.success ? 'text-green-300' : 'text-red-300'}>
              {lastResult.message}
            </span>
            {lastResult.data && (
              <pre className="mt-1 text-[10px] text-gray-500 max-h-20 overflow-auto">
                {JSON.stringify(lastResult.data, null, 2).slice(0, 500)}
              </pre>
            )}
          </div>
          <button 
            onClick={() => setShowOutput(false)}
            className="text-gray-500 hover:text-gray-300"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// Cron job trigger component
export function CronTrigger({ jobs }: { jobs: any[] }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<{ id: string; success: boolean } | null>(null)

  async function triggerJob(jobId: string) {
    setLoading(jobId)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/action/trigger-cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      })
      const data = await res.json()
      setResult({ id: jobId, success: data.success })
    } catch (e) {
      setResult({ id: jobId, success: false })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
        <Play className="w-4 h-4" />
        Trigger Cron Job
      </h3>
      
      <div className="space-y-1 max-h-48 overflow-auto">
        {jobs.map(job => (
          <button
            key={job.id}
            onClick={() => triggerJob(job.id)}
            disabled={loading !== null}
            className={`
              w-full text-left p-2 rounded text-xs flex items-center justify-between
              hover:bg-[#252b3b] transition-colors
              ${loading === job.id ? 'animate-pulse bg-purple-900/30' : ''}
              ${result?.id === job.id ? (result?.success ? 'bg-green-900/20' : 'bg-red-900/20') : ''}
            `}
          >
            <span className="text-gray-300 truncate flex-1">{job.name}</span>
            {loading === job.id ? (
              <Loader className="w-3 h-3 animate-spin text-purple-400" />
            ) : result?.id === job.id ? (
              result?.success ? (
                <CheckCircle className="w-3 h-3 text-green-400" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-red-400" />
              )
            ) : (
              <Play className="w-3 h-3 text-gray-600" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
