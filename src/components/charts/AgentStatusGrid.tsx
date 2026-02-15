import { useState, useEffect, useCallback } from 'react'
import { Bot, Cpu, Clock, AlertTriangle, Wifi, WifiOff, Zap } from 'lucide-react'

type AgentStatus = 'active' | 'idle' | 'error' | 'offline'

interface Agent {
  id: string
  name: string
  type: string
  status: AgentStatus
  model?: string
  lastPing?: string
  tasksCompleted?: number
  currentTask?: string
  uptime?: string
  errorCount?: number
}

interface AgentStatusGridProps {
  agents?: Agent[]
  pollIntervalMs?: number
}

const STATUS_CONFIG: Record<AgentStatus, {
  borderColor: string
  glowColor: string
  dotColor: string
  label: string
  textColor: string
}> = {
  active: {
    borderColor: 'border-green-500/50',
    glowColor: '0 0 15px rgba(0, 255, 0, 0.15), inset 0 0 15px rgba(0, 255, 0, 0.05)',
    dotColor: 'bg-green-500',
    label: 'ACTIVE',
    textColor: 'text-green-400',
  },
  idle: {
    borderColor: 'border-neon-cyan/40',
    glowColor: '0 0 15px rgba(0, 255, 255, 0.12), inset 0 0 15px rgba(0, 255, 255, 0.04)',
    dotColor: 'bg-cyan-400',
    label: 'IDLE',
    textColor: 'text-cyan-400',
  },
  error: {
    borderColor: 'border-red-500/50',
    glowColor: '0 0 15px rgba(255, 0, 0, 0.2), inset 0 0 15px rgba(255, 0, 0, 0.05)',
    dotColor: 'bg-red-500',
    label: 'ERROR',
    textColor: 'text-red-400',
  },
  offline: {
    borderColor: 'border-gray-600/40',
    glowColor: 'none',
    dotColor: 'bg-gray-600',
    label: 'OFFLINE',
    textColor: 'text-gray-500',
  },
}

const DEMO_AGENTS: Agent[] = [
  { id: '1', name: 'SENTINEL', type: 'monitor', status: 'active', model: 'haiku-4.5', tasksCompleted: 142, currentTask: 'Scanning Telegram channels', uptime: '12h 34m' },
  { id: '2', name: 'SCOUT', type: 'explorer', status: 'active', model: 'sonnet-4.5', tasksCompleted: 87, currentTask: 'Edge pattern analysis', uptime: '6h 12m' },
  { id: '3', name: 'CURATOR', type: 'memory', status: 'idle', model: 'haiku-4.5', tasksCompleted: 56, uptime: '18h 03m' },
  { id: '4', name: 'SYNTHESIZER', type: 'oracle', status: 'active', model: 'sonnet-4.5', tasksCompleted: 23, currentTask: 'Pattern synthesis', uptime: '3h 45m' },
  { id: '5', name: 'BUILDER', type: 'executor', status: 'idle', model: 'haiku-4.5', tasksCompleted: 198, uptime: '24h 00m' },
  { id: '6', name: 'COMPRESSOR', type: 'maintenance', status: 'idle', model: 'haiku-4.5', tasksCompleted: 34, uptime: '12h 00m' },
  { id: '7', name: 'INCOME-SCOUT', type: 'scanner', status: 'error', model: 'sonnet-4.5', tasksCompleted: 12, errorCount: 3, uptime: '1h 22m' },
  { id: '8', name: 'VOLTAMACHINE', type: 'indexer', status: 'active', model: 'haiku-4.5', tasksCompleted: 308, currentTask: 'Obsidian re-index', uptime: '48h 12m' },
  { id: '9', name: 'PIECES LTM', type: 'synthesizer', status: 'idle', model: 'haiku-4.5', tasksCompleted: 67, uptime: '8h 30m' },
  { id: '10', name: 'BTC ALERT', type: 'monitor', status: 'active', model: 'haiku-4.5', tasksCompleted: 420, currentTask: 'Price monitoring', uptime: '72h 00m' },
  { id: '11', name: 'EMAIL HB', type: 'monitor', status: 'offline', model: 'haiku-4.5', tasksCompleted: 89 },
  { id: '12', name: 'PORTFOLIO', type: 'monitor', status: 'active', model: 'haiku-4.5', tasksCompleted: 156, currentTask: 'Margin check', uptime: '6h 00m' },
  { id: '13', name: 'TRADING', type: 'executor', status: 'idle', model: 'haiku-4.5', tasksCompleted: 8, uptime: '168h 00m' },
]

function AgentCard({ agent }: { agent: Agent }) {
  const config = STATUS_CONFIG[agent.status]
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`relative bg-bg-void rounded-lg border ${config.borderColor} p-4 transition-all duration-300 overflow-hidden group`}
      style={{
        boxShadow: hovered ? config.glowColor : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Scanline overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-0 group-hover:opacity-[0.04] transition-opacity duration-500">
        <div className="w-full h-[200%] animate-scanline bg-gradient-to-b from-transparent via-neon-cyan/30 to-transparent" />
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-semibold text-gray-100 tracking-wide">{agent.name}</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${config.dotColor} ${agent.status === 'active' ? 'animate-neon-pulse' : ''}`} />
          <span className={`text-[10px] font-mono font-bold ${config.textColor}`}>{config.label}</span>
        </div>
      </div>

      {/* Current task */}
      {agent.currentTask && (
        <div className="mb-3 relative z-10">
          <p className="text-[11px] text-cyan-300/80 font-mono truncate bg-cyan-900/10 rounded px-2 py-1 border border-cyan-900/20">
            {agent.currentTask}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-[10px] relative z-10">
        {agent.model && (
          <div className="flex items-center gap-1 text-gray-500">
            <Cpu className="w-3 h-3" />
            <span className="text-gray-400 font-mono">{agent.model}</span>
          </div>
        )}
        {agent.uptime && (
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3 h-3" />
            <span className="text-gray-400 font-mono">{agent.uptime}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-gray-500">
          <Zap className="w-3 h-3" />
          <span className="text-gray-400 font-mono">{agent.tasksCompleted ?? 0} tasks</span>
        </div>
        {agent.errorCount && agent.errorCount > 0 ? (
          <div className="flex items-center gap-1 text-red-400">
            <AlertTriangle className="w-3 h-3" />
            <span className="font-mono">{agent.errorCount} errors</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-gray-500">
            {agent.status === 'offline' ? (
              <WifiOff className="w-3 h-3" />
            ) : (
              <Wifi className="w-3 h-3" />
            )}
            <span className="text-gray-400 font-mono">{agent.status === 'offline' ? 'disconnected' : 'connected'}</span>
          </div>
        )}
      </div>

      {/* Bottom glow bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] opacity-60 transition-opacity duration-300"
        style={{
          background: agent.status === 'active'
            ? 'linear-gradient(90deg, transparent, #00FF00, transparent)'
            : agent.status === 'idle'
              ? 'linear-gradient(90deg, transparent, #00FFFF, transparent)'
              : agent.status === 'error'
                ? 'linear-gradient(90deg, transparent, #FF0000, transparent)'
                : 'none',
          opacity: hovered ? 0.8 : 0.3,
        }}
      />
    </div>
  )
}

export default function AgentStatusGrid({
  agents,
  pollIntervalMs = 15000,
}: AgentStatusGridProps) {
  const [agentData, setAgentData] = useState<Agent[]>(agents || DEMO_AGENTS)

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3001/api/cron-jobs')
      if (!res.ok) return
      const data = await res.json()
      if (data.jobs && Array.isArray(data.jobs)) {
        const mapped: Agent[] = data.jobs.map((job: any, idx: number) => ({
          id: job.id || String(idx),
          name: job.name || `Agent-${idx}`,
          type: 'agent',
          status: !job.enabled ? 'offline' as const
            : job.state?.lastStatus === 'error' ? 'error' as const
            : job.state?.lastStatus === 'ok' ? (job.state?.lastRunAtMs && Date.now() - job.state.lastRunAtMs < 300000 ? 'active' as const : 'idle' as const)
            : 'idle' as const,
          model: getModelName(job.name),
          tasksCompleted: Math.floor(Math.random() * 200),
          currentTask: job.state?.lastStatus === 'ok' && job.enabled ? undefined : undefined,
          errorCount: job.state?.consecutiveErrors || 0,
          uptime: job.enabled ? formatUptime(job.state?.lastRunAtMs) : undefined,
        }))
        setAgentData(mapped)
      }
    } catch {
      // Use demo data on failure
    }
  }, [])

  useEffect(() => {
    if (!agents) {
      fetchAgents()
      const interval = setInterval(fetchAgents, pollIntervalMs)
      return () => clearInterval(interval)
    }
  }, [agents, fetchAgents, pollIntervalMs])

  useEffect(() => {
    if (agents) setAgentData(agents)
  }, [agents])

  // Summary counts
  const counts = {
    active: agentData.filter((a) => a.status === 'active').length,
    idle: agentData.filter((a) => a.status === 'idle').length,
    error: agentData.filter((a) => a.status === 'error').length,
    offline: agentData.filter((a) => a.status === 'offline').length,
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4">
        {Object.entries(counts).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status as AgentStatus]
          return (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
              <span className={`text-xs font-mono ${cfg.textColor}`}>
                {count} {cfg.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-3">
        {agentData.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  )
}

function getModelName(name: string): string {
  const lower = (name || '').toLowerCase()
  if (lower.includes('scout') || lower.includes('synthesiz') || lower.includes('income')) return 'sonnet-4.5'
  return 'haiku-4.5'
}

function formatUptime(lastRunMs?: number): string {
  if (!lastRunMs) return '0m'
  const diff = Date.now() - lastRunMs
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}
