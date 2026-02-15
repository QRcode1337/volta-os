import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, AlertCircle, Info, CheckCircle, Activity,
  Lightbulb, MessageSquare, Clock, RefreshCw, Loader,
  Shield, Telescope, BookMarked, Sparkles, Zap,
  ChevronDown, ChevronRight, Eye, TrendingDown, AlertOctagon, Timer,
  Radio, BarChart3, Filter, FileText, Brain, Target, Layers,
  Workflow, Search, ExternalLink
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'
const REFRESH_INTERVAL = 30_000

// ============================================================
// Types
// ============================================================

type TabId = 'briefing' | 'signals' | 'analysis'

type ThreatLevel = 'nominal' | 'elevated' | 'high' | 'critical'

interface BriefingData {
  threatLevel: ThreatLevel
  agentHealth: { critical: number; warning: number; healthy: number; total: number }
  criticalAlerts: string[]
  opportunities: string[]
  patternCount: number
  latestSignals: {
    sentinel: { title: string; date: string; preview: string } | null
    scout: { title: string; date: string; preview: string } | null
    synthesis: { title: string; date: string; preview: string } | null
    curator: { title: string; date: string; preview: string } | null
  }
}

interface Anomaly {
  type: string
  severity: 'critical' | 'warning' | 'info'
  agentId: string
  agentName: string
  message: string
  detectedAt: string
}

interface Recommendation {
  id: string
  title: string
  description: string
  source: string
  priority: 'high' | 'medium' | 'low'
  status: string
  createdAt: string
}

interface SynthesisPattern {
  id: string
  title: string
  description: string
  agents: string[]
  confidence: number
  category: string
  discoveredAt: string
}

interface CronOutput {
  file: string
  preview: string
  timestamp: string
}

interface CronOutputs {
  outputs: Record<string, CronOutput[]>
}

// ============================================================
// Constants & Helpers
// ============================================================

const THREAT_LEVEL_CONFIG: Record<ThreatLevel, { label: string; color: string; bg: string; border: string; glow: string; pulse: boolean }> = {
  nominal: {
    label: 'NOMINAL',
    color: 'text-green-400',
    bg: 'bg-green-900/40',
    border: 'border-green-600/50',
    glow: 'shadow-green-900/40',
    pulse: false,
  },
  elevated: {
    label: 'ELEVATED',
    color: 'text-amber-400',
    bg: 'bg-amber-900/40',
    border: 'border-amber-600/50',
    glow: 'shadow-amber-900/40',
    pulse: true,
  },
  high: {
    label: 'HIGH',
    color: 'text-orange-400',
    bg: 'bg-orange-900/40',
    border: 'border-orange-600/50',
    glow: 'shadow-orange-900/40',
    pulse: true,
  },
  critical: {
    label: 'CRITICAL',
    color: 'text-red-400',
    bg: 'bg-red-900/40',
    border: 'border-red-600/50',
    glow: 'shadow-red-900/40',
    pulse: true,
  },
}

const SEVERITY_CONFIG = {
  critical: {
    color: 'text-red-400',
    bg: 'bg-red-900/30',
    border: 'border-red-700/50',
    badgeBg: 'bg-red-900/60',
    icon: AlertOctagon,
  },
  warning: {
    color: 'text-amber-400',
    bg: 'bg-amber-900/20',
    border: 'border-amber-700/40',
    badgeBg: 'bg-amber-900/50',
    icon: AlertTriangle,
  },
  info: {
    color: 'text-blue-400',
    bg: 'bg-blue-900/20',
    border: 'border-blue-700/40',
    badgeBg: 'bg-blue-900/50',
    icon: Info,
  },
}

const PRIORITY_CONFIG = {
  high: { color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-700/50' },
  medium: { color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-700/50' },
  low: { color: 'text-blue-400', bg: 'bg-blue-900/30', border: 'border-blue-700/50' },
}

const AGENT_CONFIGS: Record<string, { label: string; emoji: string; color: string; bg: string; border: string; icon: typeof Shield }> = {
  sentinel: { label: 'SENTINEL', emoji: '\u{1F6E1}\u{FE0F}', color: 'text-red-400', bg: 'bg-red-900/40', border: 'border-red-700/50', icon: Shield },
  scout: { label: 'SCOUT', emoji: '\u{1F52D}', color: 'text-blue-400', bg: 'bg-blue-900/40', border: 'border-blue-700/50', icon: Telescope },
  synthesis: { label: 'SYNTHESIZER', emoji: '\u{2728}', color: 'text-amber-400', bg: 'bg-amber-900/40', border: 'border-amber-700/50', icon: Sparkles },
  curator: { label: 'CURATOR', emoji: '\u{1F4DA}', color: 'text-purple-400', bg: 'bg-purple-900/40', border: 'border-purple-700/50', icon: BookMarked },
  'pieces-ltm': { label: 'Pieces LTM', emoji: '\u{1F9E0}', color: 'text-cyan-400', bg: 'bg-cyan-900/40', border: 'border-cyan-700/50', icon: Brain },
  voltamachine: { label: 'Voltamachine', emoji: '\u{26A1}', color: 'text-yellow-400', bg: 'bg-yellow-900/40', border: 'border-yellow-700/50', icon: Zap },
  portfolio: { label: 'Portfolio', emoji: '\u{1F4BC}', color: 'text-emerald-400', bg: 'bg-emerald-900/40', border: 'border-emerald-700/50', icon: Layers },
  builder: { label: 'BUILDER', emoji: '\u{1F527}', color: 'text-orange-400', bg: 'bg-orange-900/40', border: 'border-orange-700/50', icon: Workflow },
}

function getAgentConfig(key: string) {
  const normalized = key.toLowerCase()
  for (const [id, cfg] of Object.entries(AGENT_CONFIGS)) {
    if (normalized.includes(id)) return cfg
  }
  return { label: key, emoji: '\u{26A1}', color: 'text-gray-400', bg: 'bg-gray-800/40', border: 'border-gray-700/50', icon: Zap }
}

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  } catch {
    return ''
  }
}

// ============================================================
// Sub-Components
// ============================================================

function ThreatBadge({ level }: { level: ThreatLevel }) {
  const cfg = THREAT_LEVEL_CONFIG[level]
  return (
    <div className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-lg ${cfg.bg} border ${cfg.border} shadow-lg ${cfg.glow}`}>
      {cfg.pulse && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.bg}`} />
          <span className={`relative inline-flex rounded-full h-3 w-3 ${cfg.bg} border ${cfg.border}`} />
        </span>
      )}
      <Shield className={`w-5 h-5 ${cfg.color}`} />
      <span className={`text-sm font-bold tracking-wider ${cfg.color}`}>{cfg.label}</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent = 'amber' }: {
  icon: typeof Shield
  label: string
  value: string | number
  sub?: string
  accent?: 'amber' | 'green' | 'red' | 'purple' | 'blue'
}) {
  const accentColors: Record<string, string> = {
    amber: 'text-amber-400',
    green: 'text-green-400',
    red: 'text-red-400',
    purple: 'text-purple-400',
    blue: 'text-blue-400',
  }
  return (
    <div className="bg-[#1e2433] border border-gray-700/30 rounded-lg p-3 flex flex-col items-center text-center min-w-0">
      <Icon className={`w-4 h-4 ${accentColors[accent]} mb-1`} />
      <span className="text-lg font-bold text-gray-100">{value}</span>
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      {sub && <span className="text-[10px] text-gray-400 mt-0.5">{sub}</span>}
    </div>
  )
}

function SignalCard({ agentKey, title, date, preview }: {
  agentKey: string
  title: string
  date: string
  preview: string
}) {
  const agent = getAgentConfig(agentKey)
  const AgentIcon = agent.icon
  return (
    <div className={`bg-[#1e2433] border ${agent.border} rounded-lg p-3 hover:brightness-110 transition-all`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex items-center justify-center w-6 h-6 rounded ${agent.bg}`}>
          <AgentIcon className={`w-3.5 h-3.5 ${agent.color}`} />
        </div>
        <span className={`text-xs font-semibold ${agent.color}`}>{agent.label}</span>
      </div>
      <h4 className="text-sm font-medium text-gray-200 mb-1 line-clamp-1">{title}</h4>
      <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-2">{preview}</p>
      <span className="flex items-center gap-1 text-[10px] text-gray-500">
        <Clock className="w-3 h-3" />
        {formatTimestamp(date)}
      </span>
    </div>
  )
}

function EmptySignalCard({ agentKey }: { agentKey: string }) {
  const agent = getAgentConfig(agentKey)
  const AgentIcon = agent.icon
  return (
    <div className="bg-[#1e2433] border border-gray-700/20 rounded-lg p-3 opacity-50">
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex items-center justify-center w-6 h-6 rounded ${agent.bg}`}>
          <AgentIcon className={`w-3.5 h-3.5 ${agent.color}`} />
        </div>
        <span className={`text-xs font-semibold ${agent.color}`}>{agent.label}</span>
      </div>
      <p className="text-xs text-gray-500 italic">No recent signals</p>
    </div>
  )
}

function AgentBadge({ name }: { name: string }) {
  const agent = getAgentConfig(name)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${agent.bg} ${agent.color} border ${agent.border}`}>
      <span>{agent.emoji}</span>
      {agent.label}
    </span>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 font-mono w-8 text-right">{pct}%</span>
    </div>
  )
}

// ============================================================
// Briefing View
// ============================================================

function BriefingView({ data, loading }: { data: BriefingData | null; loading: boolean }) {
  if (loading) return <LoadingSpinner message="Loading intelligence briefing..." />
  if (!data) return <EmptyState message="Briefing data unavailable" icon={Shield} />

  const healthLabel = `${data.agentHealth.healthy}/${data.agentHealth.total}`

  return (
    <div className="space-y-5">
      {/* Threat Level Banner */}
      <div className="flex items-center justify-center py-4">
        <ThreatBadge level={data.threatLevel} />
      </div>

      {/* Stat Cards Row */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard
          icon={Shield}
          label="Threat Level"
          value={data.threatLevel.toUpperCase()}
          accent={data.threatLevel === 'nominal' ? 'green' : data.threatLevel === 'elevated' ? 'amber' : 'red'}
        />
        <StatCard
          icon={Activity}
          label="Agent Health"
          value={healthLabel}
          sub="healthy"
          accent={data.agentHealth.critical > 0 ? 'red' : data.agentHealth.warning > 0 ? 'amber' : 'green'}
        />
        <StatCard
          icon={AlertOctagon}
          label="Critical Alerts"
          value={data.criticalAlerts.length}
          accent={data.criticalAlerts.length > 0 ? 'red' : 'green'}
        />
        <StatCard
          icon={Brain}
          label="Patterns"
          value={data.patternCount}
          accent="purple"
        />
        <StatCard
          icon={Target}
          label="Opportunities"
          value={data.opportunities.length}
          accent="blue"
        />
      </div>

      {/* Critical Alerts Box */}
      {data.criticalAlerts.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon className="w-4 h-4 text-red-400 animate-pulse" />
            <span className="text-sm font-semibold text-red-300">Critical Alerts</span>
          </div>
          <ul className="space-y-1.5">
            {data.criticalAlerts.map((alert, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-red-200">
                <AlertCircle className="w-3 h-3 mt-0.5 text-red-400 shrink-0" />
                {alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opportunities */}
      {data.opportunities.length > 0 && (
        <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-blue-300">Opportunities</span>
          </div>
          <ul className="space-y-1.5">
            {data.opportunities.map((opp, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-blue-200">
                <ChevronRight className="w-3 h-3 mt-0.5 text-blue-400 shrink-0" />
                {opp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Latest Signals Grid */}
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
          <Radio className="w-4 h-4 text-purple-400" />
          Latest Agent Signals
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {data.latestSignals.sentinel ? (
            <SignalCard agentKey="sentinel" {...data.latestSignals.sentinel} />
          ) : (
            <EmptySignalCard agentKey="sentinel" />
          )}
          {data.latestSignals.scout ? (
            <SignalCard agentKey="scout" {...data.latestSignals.scout} />
          ) : (
            <EmptySignalCard agentKey="scout" />
          )}
          {data.latestSignals.synthesis ? (
            <SignalCard agentKey="synthesis" {...data.latestSignals.synthesis} />
          ) : (
            <EmptySignalCard agentKey="synthesis" />
          )}
          {data.latestSignals.curator ? (
            <SignalCard agentKey="curator" {...data.latestSignals.curator} />
          ) : (
            <EmptySignalCard agentKey="curator" />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Signals View
// ============================================================

function SignalsView({ cronOutputs, loading }: { cronOutputs: CronOutputs | null; loading: boolean }) {
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [expandedFile, setExpandedFile] = useState<string | null>(null)

  if (loading) return <LoadingSpinner message="Loading signal feeds..." />
  if (!cronOutputs || Object.keys(cronOutputs.outputs).length === 0) {
    return <EmptyState message="No agent signals available" icon={Radio} />
  }

  const allAgentKeys = Object.keys(cronOutputs.outputs).filter(
    k => cronOutputs.outputs[k].length > 0
  )

  const filteredKeys = agentFilter === 'all'
    ? allAgentKeys
    : allAgentKeys.filter(k => k === agentFilter)

  // Flatten and sort all signals by timestamp descending
  const allSignals = filteredKeys.flatMap(agentKey =>
    cronOutputs.outputs[agentKey].map(output => ({ agentKey, ...output }))
  ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return (
    <div className="space-y-4">
      {/* Agent Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-gray-500" />
        <button
          onClick={() => setAgentFilter('all')}
          className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${
            agentFilter === 'all'
              ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50'
              : 'bg-[#1e2433] text-gray-500 border border-gray-700/30 hover:text-gray-300'
          }`}
        >
          All Agents
        </button>
        {allAgentKeys.map(key => {
          const agent = getAgentConfig(key)
          return (
            <button
              key={key}
              onClick={() => setAgentFilter(key)}
              className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                agentFilter === key
                  ? `${agent.bg} ${agent.color} border ${agent.border}`
                  : 'bg-[#1e2433] text-gray-500 border border-gray-700/30 hover:text-gray-300'
              }`}
            >
              <span>{agent.emoji}</span>
              {agent.label}
            </button>
          )
        })}
      </div>

      {/* Signal Count */}
      <div className="text-[10px] text-gray-500">
        {allSignals.length} signal{allSignals.length !== 1 ? 's' : ''} found
      </div>

      {/* Signal Cards */}
      <div className="space-y-2">
        {allSignals.map((signal, idx) => {
          const agent = getAgentConfig(signal.agentKey)
          const AgentIcon = agent.icon
          const fileKey = `${signal.agentKey}:${signal.file}:${idx}`
          const isExpanded = expandedFile === fileKey

          return (
            <div
              key={fileKey}
              className={`bg-[#1e2433] border ${agent.border} rounded-lg overflow-hidden transition-all hover:brightness-105`}
            >
              <button
                onClick={() => setExpandedFile(isExpanded ? null : fileKey)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
              >
                {/* Agent Badge */}
                <div className={`flex items-center justify-center w-7 h-7 rounded-md ${agent.bg} shrink-0`}>
                  <AgentIcon className={`w-4 h-4 ${agent.color}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold ${agent.color}`}>{agent.label}</span>
                    <span className="text-[10px] text-gray-500">{relativeTime(signal.timestamp)}</span>
                  </div>
                  <span className="text-xs font-mono text-blue-400 block truncate">{signal.file}</span>
                </div>

                {/* Expand Icon */}
                <div className="text-gray-500 shrink-0">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </button>

              {/* Preview (always shown) */}
              {!isExpanded && (
                <div className="px-3 pb-2.5 -mt-1">
                  <pre className="text-[10px] text-gray-400 whitespace-pre-wrap line-clamp-2 font-mono leading-relaxed">
                    {signal.preview}
                  </pre>
                </div>
              )}

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-700/20 mt-1 pt-2">
                  <pre className="text-[11px] text-gray-300 whitespace-pre-wrap font-mono leading-relaxed bg-[#0a0d14] rounded-md p-3 max-h-64 overflow-y-auto">
                    {signal.preview}
                  </pre>
                  <div className="flex items-center justify-between mt-2">
                    <span className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(signal.timestamp)}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-gray-500">
                      <FileText className="w-3 h-3" />
                      {signal.file}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {allSignals.length === 0 && (
        <EmptyState message={`No signals from ${getAgentConfig(agentFilter).label}`} icon={Radio} />
      )}
    </div>
  )
}

// ============================================================
// Analysis View
// ============================================================

function AnalysisView({
  anomalies,
  patterns,
  recommendations,
  loading,
}: {
  anomalies: Anomaly[]
  patterns: SynthesisPattern[]
  recommendations: Recommendation[]
  loading: boolean
}) {
  if (loading) return <LoadingSpinner message="Analyzing intelligence data..." />

  const sortedAnomalies = [...anomalies].sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 }
    const sevDiff = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3)
    if (sevDiff !== 0) return sevDiff
    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  })

  const sortedPatterns = [...patterns].sort(
    (a, b) => b.confidence - a.confidence
  )

  const sortedRecs = [...recommendations].sort((a, b) => {
    const priOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    return (priOrder[a.priority] ?? 3) - (priOrder[b.priority] ?? 3)
  })

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Left Column: Anomalies */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-gray-300 sticky top-0 bg-[#0f1219] py-1 z-10">
          <Activity className="w-4 h-4 text-red-400" />
          Anomalies
          {sortedAnomalies.length > 0 && (
            <span className="text-[10px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded">
              {sortedAnomalies.length}
            </span>
          )}
        </h3>
        {sortedAnomalies.length === 0 ? (
          <div className="bg-[#1e2433] border border-green-900/20 rounded-lg p-4">
            <div className="flex flex-col items-center py-4">
              <CheckCircle className="w-8 h-8 text-green-500/60 mb-2" />
              <p className="text-xs text-green-400">All nominal</p>
              <p className="text-[10px] text-gray-500 mt-0.5">No anomalies detected</p>
            </div>
          </div>
        ) : (
          sortedAnomalies.map((anomaly, i) => {
            const sev = SEVERITY_CONFIG[anomaly.severity] || SEVERITY_CONFIG.info
            const SevIcon = sev.icon
            const agent = getAgentConfig(anomaly.agentName)
            return (
              <div
                key={`${anomaly.agentId}-${anomaly.detectedAt}-${i}`}
                className={`${sev.bg} border ${sev.border} rounded-lg p-3 transition-colors hover:brightness-110`}
              >
                <div className="flex items-start gap-2">
                  <SevIcon className={`w-4 h-4 ${sev.color} mt-0.5 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-semibold ${agent.color}`}>
                        {agent.emoji} {anomaly.agentName}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sev.badgeBg} ${sev.color}`}>
                        {anomaly.severity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed mb-1.5">{anomaly.message}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 bg-[#252b3b] px-1.5 py-0.5 rounded">
                        {anomaly.type.replace(/_/g, ' ')}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Clock className="w-3 h-3" />
                        {relativeTime(anomaly.detectedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Center Column: Patterns */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-gray-300 sticky top-0 bg-[#0f1219] py-1 z-10">
          <Sparkles className="w-4 h-4 text-amber-400" />
          Patterns
          {sortedPatterns.length > 0 && (
            <span className="text-[10px] bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded">
              {sortedPatterns.length}
            </span>
          )}
        </h3>
        {sortedPatterns.length === 0 ? (
          <div className="bg-[#1e2433] border border-purple-900/20 rounded-lg p-4">
            <div className="flex flex-col items-center py-4">
              <Eye className="w-8 h-8 text-purple-500/60 mb-2 animate-pulse" style={{ animationDuration: '3s' }} />
              <p className="text-xs text-gray-400">Observing patterns...</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Cross-agent analysis in progress</p>
            </div>
          </div>
        ) : (
          sortedPatterns.map(pattern => (
            <div
              key={pattern.id}
              className="bg-[#1e2433] border border-amber-900/30 rounded-lg p-3 hover:border-amber-700/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium text-amber-100 leading-tight">{pattern.title}</h4>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/50 shrink-0">
                  {pattern.category}
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-3">{pattern.description}</p>

              {/* Agents involved */}
              <div className="flex flex-wrap gap-1 mb-2">
                {pattern.agents.map(a => (
                  <AgentBadge key={a} name={a} />
                ))}
              </div>

              {/* Confidence bar */}
              <div className="mb-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Confidence</span>
              </div>
              <ConfidenceBar value={pattern.confidence} />

              <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-500">
                <Clock className="w-3 h-3" />
                {relativeTime(pattern.discoveredAt)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Right Column: Recommendations */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-gray-300 sticky top-0 bg-[#0f1219] py-1 z-10">
          <Lightbulb className="w-4 h-4 text-purple-400" />
          Recommendations
          {sortedRecs.length > 0 && (
            <span className="text-[10px] bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded">
              {sortedRecs.length}
            </span>
          )}
        </h3>
        {sortedRecs.length === 0 ? (
          <div className="bg-[#1e2433] border border-purple-900/20 rounded-lg p-4">
            <div className="flex flex-col items-center py-4">
              <Lightbulb className="w-8 h-8 text-purple-500/60 mb-2" />
              <p className="text-xs text-gray-400">No recommendations yet</p>
              <p className="text-[10px] text-gray-500 mt-0.5">ErisMorn is analyzing data</p>
            </div>
          </div>
        ) : (
          sortedRecs.map(rec => {
            const pri = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.low
            return (
              <div
                key={rec.id}
                className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-3 hover:border-purple-700/40 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${pri.bg} ${pri.color} border ${pri.border}`}>
                    {rec.priority}
                  </span>
                  {rec.status && (
                    <span className="text-[10px] text-gray-500 bg-[#252b3b] px-2 py-0.5 rounded">
                      {rec.status}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-amber-100 mb-1">{rec.title}</h4>
                <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-3">{rec.description}</p>

                {rec.source && (
                  <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1.5">
                    <Search className="w-3 h-3" />
                    Source: {rec.source}
                  </div>
                )}

                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                  <Clock className="w-3 h-3" />
                  {relativeTime(rec.createdAt)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============================================================
// Shared UI Atoms
// ============================================================

function LoadingSpinner({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader className="w-5 h-5 text-purple-400 animate-spin" />
      <span className="ml-3 text-sm text-gray-400">{message}</span>
    </div>
  )
}

function EmptyState({ message, icon: Icon }: { message: string; icon: typeof Shield }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Icon className="w-8 h-8 text-gray-600 mb-3" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function IntelligencePanel() {
  const [activeTab, setActiveTab] = useState<TabId>('briefing')
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Data stores
  const [briefing, setBriefing] = useState<BriefingData | null>(null)
  const [cronOutputs, setCronOutputs] = useState<CronOutputs | null>(null)
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [patterns, setPatterns] = useState<SynthesisPattern[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])

  const loadAllData = useCallback(async () => {
    setLoading(true)
    try {
      const [briefingRes, cronRes, anomalyRes, synthesisRes, recRes] = await Promise.all([
        fetch(`${API_BASE}/intelligence/briefing`).catch(() => null),
        fetch(`${API_BASE}/cron-outputs`).catch(() => null),
        fetch(`${API_BASE}/erismorn/anomalies`).catch(() => null),
        fetch(`${API_BASE}/erismorn/synthesis`).catch(() => null),
        fetch(`${API_BASE}/erismorn/recommendations`).catch(() => null),
      ])

      // Briefing
      if (briefingRes && briefingRes.ok) {
        const data = await briefingRes.json()
        setBriefing(data)
      } else {
        setBriefing(null)
      }

      // Cron outputs
      if (cronRes && cronRes.ok) {
        const data = await cronRes.json()
        setCronOutputs(data)
      } else {
        setCronOutputs(null)
      }

      // Anomalies
      if (anomalyRes && anomalyRes.ok) {
        const data = await anomalyRes.json()
        setAnomalies(data.anomalies || [])
      } else {
        setAnomalies([])
      }

      // Synthesis patterns
      if (synthesisRes && synthesisRes.ok) {
        const data = await synthesisRes.json()
        setPatterns(data.patterns || [])
      } else {
        setPatterns([])
      }

      // Recommendations
      if (recRes && recRes.ok) {
        const data = await recRes.json()
        setRecommendations(data.recommendations || [])
      } else {
        setRecommendations([])
      }

      setLastRefresh(new Date())
    } catch {
      // Server down -- graceful fallback
      setBriefing(null)
      setCronOutputs(null)
      setAnomalies([])
      setPatterns([])
      setRecommendations([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(loadAllData, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [loadAllData])

  const tabs: { id: TabId; label: string; icon: typeof Shield; count?: number }[] = [
    { id: 'briefing', label: 'Briefing', icon: Shield },
    { id: 'signals', label: 'Signals', icon: Radio },
    {
      id: 'analysis',
      label: 'Analysis',
      icon: BarChart3,
      count: anomalies.length + patterns.length + recommendations.length,
    },
  ]

  return (
    <div className="bg-[#0a0d14] min-h-full">
      {/* Header */}
      <div className="bg-[#0f1219] border-b border-gray-800/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-900/40 border border-purple-700/50">
              <Eye className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-amber-100">Intelligence Center</h1>
              <p className="text-[10px] text-gray-500">ErisMorn Command Overview</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-500">
              Updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={loadAllData}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#1e2433] text-gray-400 hover:text-gray-200 rounded-lg border border-gray-700/50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-3">
          {tabs.map(tab => {
            const TabIcon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-[#1e2433]'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-purple-800/60 text-purple-200' : 'bg-gray-700/50 text-gray-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 bg-[#0f1219]">
        {activeTab === 'briefing' && (
          <BriefingView data={briefing} loading={loading} />
        )}
        {activeTab === 'signals' && (
          <SignalsView cronOutputs={cronOutputs} loading={loading} />
        )}
        {activeTab === 'analysis' && (
          <AnalysisView
            anomalies={anomalies}
            patterns={patterns}
            recommendations={recommendations}
            loading={loading}
          />
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="bg-[#0a0d14] border-t border-gray-800/50 px-4 py-2 flex items-center justify-between text-[10px] text-gray-500">
        <div className="flex items-center gap-3">
          {briefing && (
            <>
              <span className="flex items-center gap-1">
                <Shield className={`w-3 h-3 ${THREAT_LEVEL_CONFIG[briefing.threatLevel].color}`} />
                {briefing.threatLevel.toUpperCase()}
              </span>
              <span>{briefing.agentHealth.healthy}/{briefing.agentHealth.total} agents healthy</span>
            </>
          )}
          <span>{anomalies.length} anomalies</span>
          <span>{patterns.length} patterns</span>
          <span>{recommendations.length} recommendations</span>
        </div>
        <span className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          Auto-refresh: 30s
        </span>
      </div>

      {/* Pulse animation CSS */}
      <style>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
