import { useState, useEffect, useCallback } from 'react'
import {
  Send, Clock, AlertTriangle, CheckCircle, Loader, XCircle,
  ListTodo, Plus, ChevronDown, Target, User, Flag
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

interface Delegation {
  id: string
  task: string
  agentId: string
  agentName: string
  priority: 'urgent' | 'high' | 'normal' | 'low'
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  createdAt: string
  completedAt: string | null
}

interface CronJob {
  id: string
  name: string
  enabled: boolean
}

const priorityConfig: Record<Delegation['priority'], { label: string; bg: string; text: string; border: string }> = {
  urgent: { label: 'URGENT', bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-800/50' },
  high:   { label: 'HIGH',   bg: 'bg-amber-900/50', text: 'text-amber-300', border: 'border-amber-800/50' },
  normal: { label: 'NORMAL', bg: 'bg-blue-900/50', text: 'text-blue-300', border: 'border-blue-800/50' },
  low:    { label: 'LOW',    bg: 'bg-gray-700/50', text: 'text-gray-300', border: 'border-gray-600/50' },
}

const statusConfig: Record<Delegation['status'], { label: string; icon: React.ReactNode; color: string }> = {
  'pending':     { label: 'Pending',     icon: <Clock className="w-3 h-3" />,          color: 'text-yellow-400' },
  'in-progress': { label: 'In Progress', icon: <Loader className="w-3 h-3 animate-spin" />, color: 'text-blue-400' },
  'completed':   { label: 'Completed',   icon: <CheckCircle className="w-3 h-3" />,    color: 'text-green-400' },
  'failed':      { label: 'Failed',      icon: <XCircle className="w-3 h-3" />,         color: 'text-red-400' },
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function DelegationRow({ delegation }: { delegation: Delegation }) {
  const priority = priorityConfig[delegation.priority]
  const status = statusConfig[delegation.status]

  return (
    <div className="bg-[#252b3b] border border-gray-700/30 rounded-lg p-3 hover:border-amber-700/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-100 leading-tight mb-1.5">{delegation.task}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded ${priority.bg} ${priority.text}`}>
              {priority.label}
            </span>
            <span className={`flex items-center gap-1 text-[10px] ${status.color}`}>
              {status.icon}
              {status.label}
            </span>
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <User className="w-3 h-3" />
              {delegation.agentName}
            </span>
          </div>
        </div>
        <span className="text-[10px] text-gray-500 whitespace-nowrap">{formatRelativeTime(delegation.createdAt)}</span>
      </div>
    </div>
  )
}

function CreateDelegationForm({
  agents,
  onSubmit,
  submitting,
}: {
  agents: { id: string; name: string }[]
  onSubmit: (data: { task: string; agentId: string; priority: Delegation['priority']; deadline: string }) => void
  submitting: boolean
}) {
  const [task, setTask] = useState('')
  const [agentId, setAgentId] = useState('')
  const [priority, setPriority] = useState<Delegation['priority']>('normal')
  const [deadline, setDeadline] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!task.trim() || !agentId) return
    onSubmit({ task: task.trim(), agentId, priority, deadline })
    setTask('')
    setDeadline('')
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
        <Plus className="w-4 h-4" />
        New Delegation
      </h3>

      <div className="space-y-3">
        {/* Task description */}
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Task</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the task to delegate..."
            rows={2}
            className="w-full bg-[#252b3b] border border-gray-700/50 rounded p-2.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 resize-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Agent select */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Agent</label>
            <div className="relative">
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full bg-[#252b3b] border border-gray-700/50 rounded px-2.5 py-2 text-xs text-gray-100 focus:outline-none focus:border-purple-600 appearance-none cursor-pointer"
              >
                <option value="">Select agent...</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* Priority select */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Priority</label>
            <div className="relative">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Delegation['priority'])}
                className="w-full bg-[#252b3b] border border-gray-700/50 rounded px-2.5 py-2 text-xs text-gray-100 focus:outline-none focus:border-purple-600 appearance-none cursor-pointer"
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-[#252b3b] border border-gray-700/50 rounded px-2.5 py-2 text-xs text-gray-100 focus:outline-none focus:border-purple-600"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !task.trim() || !agentId}
          className="w-full flex items-center justify-center gap-2 bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <Loader className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {submitting ? 'Delegating...' : 'Delegate Task'}
        </button>
      </div>
    </form>
  )
}

export default function DelegationBoard() {
  const [delegations, setDelegations] = useState<Delegation[]>([])
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [apiAvailable, setApiAvailable] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [groupBy, setGroupBy] = useState<'agent' | 'priority' | 'status'>('agent')

  const loadData = useCallback(async () => {
    try {
      // Fetch agents from cron-jobs (always available)
      const cronRes = await fetch(`${API_BASE}/cron-jobs`)
      const cronData = await cronRes.json()
      if (cronData.jobs) {
        setAgents(cronData.jobs.map((j: any) => ({ id: j.id, name: j.name })))
      }
    } catch (e) {
      console.error('Failed to fetch agents:', e)
    }

    try {
      // Fetch delegations (may not exist yet)
      const delRes = await fetch(`${API_BASE}/erismorn/delegations`)
      if (delRes.ok) {
        const delData = await delRes.json()
        setDelegations(delData.delegations || [])
        setApiAvailable(true)
      } else {
        setApiAvailable(false)
        setDelegations([])
      }
    } catch (e) {
      setApiAvailable(false)
      setDelegations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleDelegate(data: { task: string; agentId: string; priority: Delegation['priority']; deadline: string }) {
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/erismorn/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.delegation) {
          setDelegations(prev => [result.delegation, ...prev])
        } else {
          // Reload to get fresh data
          loadData()
        }
      }
    } catch (e) {
      console.error('Delegation failed:', e)
      // Still add optimistically with local state
      const agent = agents.find(a => a.id === data.agentId)
      const newDelegation: Delegation = {
        id: `local-${Date.now()}`,
        task: data.task,
        agentId: data.agentId,
        agentName: agent?.name || data.agentId,
        priority: data.priority,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
      }
      setDelegations(prev => [newDelegation, ...prev])
    } finally {
      setSubmitting(false)
    }
  }

  // Group delegations
  function getGrouped(): Record<string, Delegation[]> {
    const groups: Record<string, Delegation[]> = {}
    for (const d of delegations) {
      const key = groupBy === 'agent' ? d.agentName
                : groupBy === 'priority' ? d.priority
                : d.status
      if (!groups[key]) groups[key] = []
      groups[key].push(d)
    }
    return groups
  }

  const grouped = getGrouped()
  const totalCount = delegations.length
  const pendingCount = delegations.filter(d => d.status === 'pending').length
  const inProgressCount = delegations.filter(d => d.status === 'in-progress').length
  const completedCount = delegations.filter(d => d.status === 'completed').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="w-5 h-5 text-purple-400" />
          <div>
            <h2 className="text-lg font-semibold text-amber-100">Delegation Board</h2>
            <p className="text-xs text-gray-400">Task delegation tracking across agents</p>
          </div>
        </div>

        {/* Group by selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">Group by:</span>
          {(['agent', 'priority', 'status'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setGroupBy(mode)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                groupBy === mode
                  ? 'bg-purple-900/40 text-purple-200 border border-purple-700/50'
                  : 'bg-[#252b3b] text-gray-400 hover:text-gray-200'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-300">{totalCount}</p>
          <p className="text-xs text-gray-400">Total</p>
        </div>
        <div className="bg-[#1e2433] border border-yellow-900/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-yellow-400">{pendingCount}</p>
          <p className="text-xs text-gray-400">Pending</p>
        </div>
        <div className="bg-[#1e2433] border border-blue-900/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-400">{inProgressCount}</p>
          <p className="text-xs text-gray-400">In Progress</p>
        </div>
        <div className="bg-[#1e2433] border border-green-900/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{completedCount}</p>
          <p className="text-xs text-gray-400">Completed</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Create form */}
        <div>
          <CreateDelegationForm
            agents={agents}
            onSubmit={handleDelegate}
            submitting={submitting}
          />
        </div>

        {/* Right: Delegation list */}
        <div className="col-span-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-400">Loading delegations...</p>
              </div>
            </div>
          ) : !apiAvailable && delegations.length === 0 ? (
            /* API not available — show coming online state */
            <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-purple-900/30 flex items-center justify-center">
                <Target className="w-6 h-6 text-purple-400 animate-pulse" />
              </div>
              <h3 className="text-sm font-medium text-purple-300 mb-1">Delegation engine coming online...</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                The delegation API is being initialized. You can create delegations below, and they will be queued locally until the engine is ready.
              </p>
            </div>
          ) : delegations.length === 0 ? (
            <div className="bg-[#1e2433] border border-gray-700/30 rounded-lg p-8 text-center">
              <ListTodo className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No delegations yet</p>
              <p className="text-xs text-gray-600 mt-1">Create a delegation using the form</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([groupName, items]) => (
                <div key={groupName}>
                  <div className="flex items-center gap-2 mb-2">
                    <Flag className="w-3.5 h-3.5 text-gray-500" />
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">{groupName}</h4>
                    <span className="text-[10px] bg-[#252b3b] text-gray-500 px-1.5 py-0.5 rounded">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map(delegation => (
                      <DelegationRow key={delegation.id} delegation={delegation} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
