import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Shield, Telescope, BookMarked, RefreshCw,
  Link2, ChevronDown, ChevronRight, Clock, Loader,
  Workflow, Zap
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

// ============================================================
// Types
// ============================================================

interface SynthesisPattern {
  id: string
  title: string
  description: string
  agents: string[]
  confidence: number
  category: string
  discoveredAt: string
  connections: { from: string; to: string; relation: string }[]
}

// ============================================================
// Agent Node Config
// ============================================================

const AGENTS = [
  { id: 'SENTINEL', label: 'SENTINEL', emoji: '\u{1F6E1}\u{FE0F}', color: 'text-red-400', bg: 'bg-red-900/40', border: 'border-red-700/50', icon: Shield },
  { id: 'SCOUT', label: 'SCOUT', emoji: '\u{1F52D}', color: 'text-blue-400', bg: 'bg-blue-900/40', border: 'border-blue-700/50', icon: Telescope },
  { id: 'CURATOR', label: 'CURATOR', emoji: '\u{1F4DA}', color: 'text-purple-400', bg: 'bg-purple-900/40', border: 'border-purple-700/50', icon: BookMarked },
  { id: 'SYNTHESIZER', label: 'SYNTHESIZER', emoji: '\u{2728}', color: 'text-amber-400', bg: 'bg-amber-900/40', border: 'border-amber-700/50', icon: Sparkles },
] as const

function getAgentConfig(agentName: string) {
  const normalized = agentName.toUpperCase()
  return AGENTS.find(a => normalized.includes(a.id)) || {
    id: agentName, label: agentName, emoji: '\u{26A1}', color: 'text-gray-400',
    bg: 'bg-gray-800/40', border: 'border-gray-700/50', icon: Zap
  }
}

// ============================================================
// Agent Badge Component
// ============================================================

function AgentBadge({ name }: { name: string }) {
  const agent = getAgentConfig(name)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${agent.bg} ${agent.color} border ${agent.border}`}>
      <span>{agent.emoji}</span>
      {agent.label}
    </span>
  )
}

// ============================================================
// Confidence Meter
// ============================================================

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono ${textColor}`}>{pct}%</span>
    </div>
  )
}

// ============================================================
// Pattern Card
// ============================================================

function PatternCard({ pattern }: { pattern: SynthesisPattern }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg overflow-hidden hover:border-purple-700/40 transition-colors">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {pattern.category && (
                <span className="text-[10px] bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded">
                  {pattern.category}
                </span>
              )}
              <ConfidenceMeter value={pattern.confidence} />
            </div>
            <h3 className="text-sm font-semibold text-amber-100">{pattern.title}</h3>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 transition-colors mt-1"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Description */}
        <p className={`text-xs text-gray-400 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
          {pattern.description}
        </p>

        {/* Agents */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {pattern.agents.map(agent => (
            <AgentBadge key={agent} name={agent} />
          ))}
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1 mt-3 text-[10px] text-gray-500">
          <Clock className="w-3 h-3" />
          Discovered {new Date(pattern.discoveredAt).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </div>
      </div>

      {/* Expanded connections */}
      {expanded && pattern.connections.length > 0 && (
        <div className="border-t border-purple-900/20 bg-[#161b26] p-3">
          <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            Connections
          </h4>
          <div className="space-y-1.5">
            {pattern.connections.map((conn, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-purple-300 font-mono">{conn.from}</span>
                <span className="text-gray-600">&rarr;</span>
                <span className="text-amber-300 font-mono">{conn.to}</span>
                <span className="text-gray-500 ml-1">({conn.relation})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Synthesis Engine Empty State
// ============================================================

function SynthesisEmptyState() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="relative w-[420px] h-[420px]">
        {/* SVG Connection Lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 420 420">
          {/* Connecting lines between agents — animated dashes */}
          {/* SENTINEL (top) to SCOUT (right) */}
          <line x1="210" y1="65" x2="355" y2="210" stroke="url(#grad1)" strokeWidth="1" strokeDasharray="6 4" className="animate-dash" opacity="0.5" />
          {/* SCOUT (right) to SYNTHESIZER (bottom) */}
          <line x1="355" y1="210" x2="210" y2="355" stroke="url(#grad2)" strokeWidth="1" strokeDasharray="6 4" className="animate-dash" opacity="0.5" />
          {/* SYNTHESIZER (bottom) to CURATOR (left) */}
          <line x1="210" y1="355" x2="65" y2="210" stroke="url(#grad3)" strokeWidth="1" strokeDasharray="6 4" className="animate-dash" opacity="0.5" />
          {/* CURATOR (left) to SENTINEL (top) */}
          <line x1="65" y1="210" x2="210" y2="65" stroke="url(#grad4)" strokeWidth="1" strokeDasharray="6 4" className="animate-dash" opacity="0.5" />
          {/* Cross lines */}
          <line x1="210" y1="65" x2="210" y2="355" stroke="#6b21a8" strokeWidth="0.5" strokeDasharray="4 6" className="animate-dash-slow" opacity="0.25" />
          <line x1="65" y1="210" x2="355" y2="210" stroke="#6b21a8" strokeWidth="0.5" strokeDasharray="4 6" className="animate-dash-slow" opacity="0.25" />

          {/* Lines from each agent to center */}
          <line x1="210" y1="65" x2="210" y2="180" stroke="#d97706" strokeWidth="1" strokeDasharray="3 5" className="animate-dash-reverse" opacity="0.4" />
          <line x1="355" y1="210" x2="240" y2="210" stroke="#d97706" strokeWidth="1" strokeDasharray="3 5" className="animate-dash-reverse" opacity="0.4" />
          <line x1="210" y1="355" x2="210" y2="240" stroke="#d97706" strokeWidth="1" strokeDasharray="3 5" className="animate-dash-reverse" opacity="0.4" />
          <line x1="65" y1="210" x2="180" y2="210" stroke="#d97706" strokeWidth="1" strokeDasharray="3 5" className="animate-dash-reverse" opacity="0.4" />

          {/* Gradient definitions */}
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="grad4" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.6" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center — Synthesis Engine badge */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            {/* Outer pulse ring */}
            <div className="absolute -inset-4 bg-amber-500/10 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute -inset-2 bg-amber-500/5 rounded-full animate-pulse" style={{ animationDuration: '2s' }} />
            {/* Badge */}
            <div className="relative bg-[#1e2433] border-2 border-amber-600/60 rounded-full px-5 py-3 shadow-lg shadow-amber-900/30">
              <div className="flex items-center gap-2">
                <Workflow className="w-5 h-5 text-amber-400 animate-pulse" />
                <div>
                  <div className="text-xs font-bold text-amber-200">Synthesis Engine</div>
                  <div className="text-[9px] text-amber-500/70">Weaving patterns...</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Agent Nodes — positioned at cardinal points */}
        {/* SENTINEL - top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2">
          <AgentNode agent={AGENTS[0]} />
        </div>
        {/* SCOUT - right */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <AgentNode agent={AGENTS[1]} />
        </div>
        {/* SYNTHESIZER - bottom */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <AgentNode agent={AGENTS[3]} />
        </div>
        {/* CURATOR - left */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2">
          <AgentNode agent={AGENTS[2]} />
        </div>
      </div>
    </div>
  )
}

function AgentNode({ agent }: { agent: typeof AGENTS[number] }) {
  const Icon = agent.icon
  return (
    <div className={`flex flex-col items-center gap-1.5 group`}>
      <div className={`w-14 h-14 rounded-xl ${agent.bg} border ${agent.border} flex items-center justify-center
        shadow-lg transition-all group-hover:scale-110 group-hover:shadow-xl`}
      >
        <Icon className={`w-6 h-6 ${agent.color}`} />
      </div>
      <span className={`text-[10px] font-bold ${agent.color} tracking-wide`}>{agent.label}</span>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function SynthesisView() {
  const [patterns, setPatterns] = useState<SynthesisPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [groupByCategory, setGroupByCategory] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`${API_BASE}/erismorn/synthesis`)
      if (res.status === 404) {
        // Endpoint not yet available — show empty state
        setPatterns([])
        return
      }
      if (!res.ok) {
        setPatterns([])
        return
      }
      const data = await res.json()
      setPatterns(data.patterns || data || [])
    } catch {
      // Network error or server down — graceful fallback
      setPatterns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Group patterns by category
  const grouped = patterns.reduce<Record<string, SynthesisPattern[]>>((acc, p) => {
    const key = p.category || 'Uncategorized'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  const categoryColors: Record<string, string> = {
    'Uncategorized': 'text-gray-400',
    'Research': 'text-blue-400',
    'Security': 'text-red-400',
    'Knowledge': 'text-amber-400',
    'Operations': 'text-green-400',
    'Finance': 'text-emerald-400',
    'Strategy': 'text-purple-400',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="w-6 h-6 text-purple-400 animate-spin" />
        <span className="ml-3 text-sm text-gray-400">Loading synthesis data...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Cross-Agent Synthesis
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pattern recognition across agent outputs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {patterns.length > 0 && (
            <button
              onClick={() => setGroupByCategory(!groupByCategory)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                groupByCategory
                  ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50'
                  : 'bg-[#1e2433] text-gray-400 hover:text-gray-200 border border-gray-700/50'
              }`}
            >
              Group by category
            </button>
          )}
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#1e2433] text-gray-400 hover:text-gray-200 rounded-lg border border-gray-700/50 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {patterns.length === 0 ? (
        <div className="bg-[#0f1219] border border-purple-900/20 rounded-lg overflow-hidden">
          <SynthesisEmptyState />
          <div className="text-center pb-8">
            <p className="text-sm text-gray-400">
              ErisMorn is weaving patterns from chaos...
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Synthesis emerges when agents discover cross-domain connections
            </p>
          </div>
        </div>
      ) : groupByCategory ? (
        // Grouped view
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, categoryPatterns]) => (
            <div key={category}>
              <h3 className={`text-xs font-medium uppercase tracking-wider mb-2 flex items-center gap-2 ${categoryColors[category] || 'text-gray-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${categoryColors[category]?.replace('text-', 'bg-') || 'bg-gray-400'}`} />
                {category}
                <span className="text-[10px] bg-[#252b3b] text-gray-500 px-1.5 py-0.5 rounded ml-1">
                  {categoryPatterns.length}
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {categoryPatterns.map(pattern => (
                  <PatternCard key={pattern.id} pattern={pattern} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat view
        <div className="grid grid-cols-2 gap-3">
          {patterns.map(pattern => (
            <PatternCard key={pattern.id} pattern={pattern} />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {patterns.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-800/50">
          <span>{patterns.length} patterns discovered</span>
          <span>{Object.keys(grouped).length} categories</span>
          <span>
            Avg confidence: {Math.round((patterns.reduce((s, p) => s + p.confidence, 0) / patterns.length) * 100)}%
          </span>
        </div>
      )}

      {/* CSS for dash animation */}
      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -20; }
        }
        @keyframes dash-reverse {
          to { stroke-dashoffset: 20; }
        }
        @keyframes dash-slow {
          to { stroke-dashoffset: -30; }
        }
        .animate-dash {
          animation: dash 2s linear infinite;
        }
        .animate-dash-reverse {
          animation: dash-reverse 3s linear infinite;
        }
        .animate-dash-slow {
          animation: dash-slow 4s linear infinite;
        }
      `}</style>
    </div>
  )
}
