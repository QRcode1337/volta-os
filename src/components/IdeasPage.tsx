import { useState, useEffect, useCallback } from 'react'
import {
  Lightbulb, Telescope, DollarSign, Shield,
  ChevronDown, ChevronRight, Filter, RefreshCw,
  Check, Star, Loader, Clock, FileText
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

// ============================================================
// Types
// ============================================================

type IdeaSource = 'SCOUT' | 'INCOME-SCOUT' | 'SENTINEL'
type IdeaType = 'discovery' | 'opportunity' | 'signal'
type IdeaPriority = 'high' | 'medium' | 'low'

interface Idea {
  id: string
  source: IdeaSource
  type: IdeaType
  title: string
  content: string
  date: string
  file: string
  priority: IdeaPriority
  resolved?: boolean
}

interface IdeasResponse {
  ideas: Idea[]
  count: number
  sources: string[]
}

// ============================================================
// Constants & Helpers
// ============================================================

const SOURCE_CONFIG: Record<IdeaSource, {
  color: string
  bg: string
  border: string
  icon: typeof Telescope
  label: string
}> = {
  SCOUT: {
    color: 'text-blue-400',
    bg: 'bg-blue-900/40',
    border: 'border-blue-700/50',
    icon: Telescope,
    label: 'SCOUT',
  },
  'INCOME-SCOUT': {
    color: 'text-green-400',
    bg: 'bg-green-900/40',
    border: 'border-green-700/50',
    icon: DollarSign,
    label: 'INCOME-SCOUT',
  },
  SENTINEL: {
    color: 'text-red-400',
    bg: 'bg-red-900/40',
    border: 'border-red-700/50',
    icon: Shield,
    label: 'SENTINEL',
  },
}

const TYPE_CONFIG: Record<IdeaType, {
  color: string
  icon: typeof Lightbulb
  label: string
}> = {
  discovery: { color: 'text-purple-400', icon: Lightbulb, label: 'Discovery' },
  opportunity: { color: 'text-amber-400', icon: Star, label: 'Opportunity' },
  signal: { color: 'text-cyan-400', icon: Filter, label: 'Signal' },
}

const PRIORITY_CONFIG: Record<IdeaPriority, {
  color: string
  bg: string
  border: string
}> = {
  high: { color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-700/50' },
  medium: { color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-700/50' },
  low: { color: 'text-blue-400', bg: 'bg-blue-900/30', border: 'border-blue-700/50' },
}

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// ============================================================
// Idea Card
// ============================================================

function IdeaCard({ idea }: { idea: Idea }) {
  const [expanded, setExpanded] = useState(false)
  const source = SOURCE_CONFIG[idea.source]
  const type = TYPE_CONFIG[idea.type]
  const priority = PRIORITY_CONFIG[idea.priority]
  const SourceIcon = source.icon
  const TypeIcon = type.icon

  return (
    <div className={`bg-[#1e2433] border border-purple-900/30 rounded-lg p-4 hover:border-purple-700/40 transition-colors ${
      idea.resolved ? 'opacity-50' : ''
    }`}>
      {/* Header: source badge + type + priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${source.bg} ${source.color} border ${source.border}`}>
            <SourceIcon className="w-3 h-3" />
            {source.label}
          </span>
          {/* Type badge */}
          <span className={`inline-flex items-center gap-1 text-[10px] ${type.color}`}>
            <TypeIcon className="w-3 h-3" />
            {type.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Resolved checkmark */}
          {idea.resolved && (
            <span className="flex items-center gap-1 text-[10px] text-green-500">
              <Check className="w-3 h-3" />
              Resolved
            </span>
          )}
          {/* Priority badge */}
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${priority.bg} ${priority.color} border ${priority.border}`}>
            {idea.priority}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-amber-100 mb-1.5">{idea.title}</h3>

      {/* Content — truncated to 3 lines, expandable */}
      <div className="relative">
        <p className={`text-xs text-gray-400 leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
          {idea.content}
        </p>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 mt-1.5 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronDown className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronRight className="w-3 h-3" />
              Show more
            </>
          )}
        </button>
      </div>

      {/* Footer: date + file */}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-gray-700/30">
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <Clock className="w-3 h-3" />
          {formatTimestamp(idea.date)}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-600 font-mono truncate" title={idea.file}>
          <FileText className="w-3 h-3 flex-shrink-0" />
          {idea.file}
        </span>
      </div>
    </div>
  )
}

// ============================================================
// Summary Stat Card
// ============================================================

function StatCard({ label, count, icon: Icon, color, bg, border }: {
  label: string
  count: number
  icon: typeof Telescope
  color: string
  bg: string
  border: string
}) {
  return (
    <div className={`${bg} border ${border} rounded-lg p-3 flex items-center gap-3`}>
      <div className={`w-9 h-9 rounded-lg ${bg} border ${border} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <div className={`text-lg font-bold ${color}`}>{count}</div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  )
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="absolute -inset-3 bg-amber-500/10 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute -inset-1.5 bg-amber-500/5 rounded-full animate-pulse" style={{ animationDuration: '2s' }} />
        <div className="relative w-14 h-14 bg-amber-900/30 border-2 border-amber-600/50 rounded-full flex items-center justify-center shadow-lg shadow-amber-900/30">
          <Lightbulb className="w-7 h-7 text-amber-400" />
        </div>
      </div>
      <p className="text-sm text-gray-400 mt-4">No ideas captured yet</p>
      <p className="text-xs text-gray-600 mt-1">Agents are exploring... discoveries will appear here</p>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<'ALL' | IdeaSource>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | IdeaType>('ALL')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/labs/ideas`).catch(() => null)
      if (res && res.ok) {
        const data: IdeasResponse = await res.json()
        setIdeas(data.ideas || [])
        setCount(data.count ?? data.ideas?.length ?? 0)
      } else {
        setIdeas([])
        setCount(0)
      }
    } catch {
      setIdeas([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + auto-refresh every 30 seconds
  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30_000)
    return () => clearInterval(interval)
  }, [loadData])

  // Filtered ideas
  const filtered = ideas.filter(idea => {
    if (sourceFilter !== 'ALL' && idea.source !== sourceFilter) return false
    if (typeFilter !== 'ALL' && idea.type !== typeFilter) return false
    return true
  })

  // Sort: unresolved first, then high priority first, then by date
  const sorted = [...filtered].sort((a, b) => {
    // Unresolved before resolved
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    // Priority ordering
    const priOrder: Record<IdeaPriority, number> = { high: 0, medium: 1, low: 2 }
    const priDiff = priOrder[a.priority] - priOrder[b.priority]
    if (priDiff !== 0) return priDiff
    // Newest first
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  // Source counts for summary cards
  const scoutCount = ideas.filter(i => i.source === 'SCOUT').length
  const incomeCount = ideas.filter(i => i.source === 'INCOME-SCOUT').length
  const sentinelCount = ideas.filter(i => i.source === 'SENTINEL').length

  // Source filter buttons
  const sourceOptions: { key: 'ALL' | IdeaSource; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'SCOUT', label: 'SCOUT' },
    { key: 'INCOME-SCOUT', label: 'INCOME-SCOUT' },
    { key: 'SENTINEL', label: 'SENTINEL' },
  ]

  // Type filter buttons
  const typeOptions: { key: 'ALL' | IdeaType; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'discovery', label: 'Discovery' },
    { key: 'opportunity', label: 'Opportunity' },
    { key: 'signal', label: 'Signal' },
  ]

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="w-6 h-6 text-amber-400 animate-spin" />
        <span className="ml-3 text-sm text-gray-400">Scanning intelligence feeds for ideas...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* HEADER */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-100 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            Ideas & Discoveries
            {count > 0 && (
              <span className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full">
                {count}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Discoveries, opportunities, and signals from intelligence agents
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#1e2433] text-gray-400 hover:text-gray-200 rounded-lg border border-gray-700/50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* ============================================================ */}
      {/* FILTER BAR */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Source filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Source:</span>
          {sourceOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSourceFilter(opt.key)}
              className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${
                sourceFilter === opt.key
                  ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50'
                  : 'bg-[#1e2433] text-gray-500 border border-gray-700/50 hover:text-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Type:</span>
          {typeOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setTypeFilter(opt.key)}
              className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${
                typeFilter === opt.key
                  ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50'
                  : 'bg-[#1e2433] text-gray-500 border border-gray-700/50 hover:text-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* SUMMARY STATS */}
      {/* ============================================================ */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="SCOUT discoveries"
          count={scoutCount}
          icon={Telescope}
          color="text-blue-400"
          bg="bg-blue-900/20"
          border="border-blue-700/40"
        />
        <StatCard
          label="Income opportunities"
          count={incomeCount}
          icon={DollarSign}
          color="text-green-400"
          bg="bg-green-900/20"
          border="border-green-700/40"
        />
        <StatCard
          label="SENTINEL signals"
          count={sentinelCount}
          icon={Shield}
          color="text-red-400"
          bg="bg-red-900/20"
          border="border-red-700/40"
        />
      </div>

      {/* ============================================================ */}
      {/* IDEAS GRID */}
      {/* ============================================================ */}
      {sorted.length === 0 ? (
        <div className="bg-[#0f1219] border border-amber-900/20 rounded-lg">
          <EmptyState />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {sorted.map(idea => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* STATS FOOTER */}
      {/* ============================================================ */}
      {ideas.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-800/50">
          <span>
            {ideas.filter(i => !i.resolved).length} active
            {ideas.filter(i => i.resolved).length > 0 && ` \u2022 ${ideas.filter(i => i.resolved).length} resolved`}
          </span>
          <span>
            {filtered.length} shown of {ideas.length} total
          </span>
        </div>
      )}
    </div>
  )
}
