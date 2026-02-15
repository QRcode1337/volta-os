import { useState, useEffect, useCallback } from 'react'
import {
  Brain, Sparkles, Target, Users, ChevronDown, ChevronRight,
  RefreshCw, FileText, Calendar, Network, Loader
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

// ============================================================
// Types
// ============================================================

interface IdeationSection {
  heading: string
  level: number
  preview: string
}

interface IdeationItem {
  id: string
  source: 'SYNTHESIZER' | 'STRATEGY' | 'SHARED'
  type: 'pattern-analysis' | 'strategy' | 'cross-agent'
  title: string
  preview: string
  sections?: IdeationSection[]
  content: string
  date: string
  file: string
  participants?: string[]
  size: number
}

interface IdeationResponse {
  ideation: IdeationItem[]
  count: number
  sources: string[]
}

type SourceFilter = 'ALL' | 'SYNTHESIZER' | 'STRATEGY' | 'SHARED'

// ============================================================
// Source Configuration
// ============================================================

const SOURCE_CONFIG: Record<string, {
  label: string
  icon: typeof Brain
  color: string
  borderColor: string
  bgColor: string
  badgeBg: string
  badgeText: string
  accent: string
}> = {
  SYNTHESIZER: {
    label: 'Synthesizer',
    icon: Sparkles,
    color: 'text-purple-400',
    borderColor: 'border-l-purple-500',
    bgColor: 'bg-purple-900/10',
    badgeBg: 'bg-purple-900/50',
    badgeText: 'text-purple-300',
    accent: 'purple',
  },
  STRATEGY: {
    label: 'Strategy',
    icon: Target,
    color: 'text-amber-400',
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-900/10',
    badgeBg: 'bg-amber-900/50',
    badgeText: 'text-amber-300',
    accent: 'amber',
  },
  SHARED: {
    label: 'Shared',
    icon: Users,
    color: 'text-cyan-400',
    borderColor: 'border-l-cyan-500',
    bgColor: 'bg-cyan-900/10',
    badgeBg: 'bg-cyan-900/50',
    badgeText: 'text-cyan-300',
    accent: 'cyan',
  },
}

// ============================================================
// Participant Badge
// ============================================================

const PARTICIPANT_COLORS: Record<string, { bg: string; text: string }> = {
  SENTINEL: { bg: 'bg-red-900/50', text: 'text-red-300' },
  SCOUT: { bg: 'bg-blue-900/50', text: 'text-blue-300' },
  CURATOR: { bg: 'bg-purple-900/50', text: 'text-purple-300' },
  SYNTHESIZER: { bg: 'bg-amber-900/50', text: 'text-amber-300' },
  ERISMORN: { bg: 'bg-cyan-900/50', text: 'text-cyan-300' },
}

function getParticipantStyle(name: string) {
  const upper = name.toUpperCase()
  for (const [key, style] of Object.entries(PARTICIPANT_COLORS)) {
    if (upper.includes(key)) return style
  }
  return { bg: 'bg-gray-800/50', text: 'text-gray-300' }
}

function ParticipantBadge({ name }: { name: string }) {
  const style = getParticipantStyle(name)
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${style.bg} ${style.text}`}>
      {name}
    </span>
  )
}

// ============================================================
// Date Formatting
// ============================================================

function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================================
// Synthesizer Card (Full Width, Featured)
// ============================================================

function SynthesizerCard({ item }: { item: IdeationItem }) {
  const [expanded, setExpanded] = useState(false)
  const config = SOURCE_CONFIG.SYNTHESIZER

  return (
    <div className={`col-span-2 bg-[#1e2433] border border-purple-900/30 border-l-4 ${config.borderColor} rounded-lg overflow-hidden hover:border-purple-700/40 transition-colors`}>
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${config.badgeBg} ${config.badgeText}`}>
                <Sparkles className="w-3 h-3" />
                Oracle Report
              </span>
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {formatSize(item.size)}
              </span>
            </div>
            <h3 className="text-base font-semibold text-purple-100 mb-1">{item.title}</h3>
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Calendar className="w-3 h-3" />
              {formatDate(item.date)}
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 transition-colors mt-1 p-1"
          >
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* Section outline (key findings) */}
        {item.sections && item.sections.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <h4 className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Network className="w-3 h-3" />
              Key Findings
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              {item.sections.map((section, i) => (
                <div key={i} className="flex items-start gap-2 bg-[#161b26] rounded px-3 py-2">
                  <span className="text-purple-500 text-[10px] font-mono mt-0.5">
                    {'#'.repeat(section.level)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-purple-200 font-medium block truncate">
                      {section.heading}
                    </span>
                    {section.preview && (
                      <span className="text-[10px] text-gray-500 block truncate mt-0.5">
                        {section.preview}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview text (when not expanded) */}
        {!expanded && !item.sections?.length && (
          <p className="text-xs text-gray-400 leading-relaxed mt-3 line-clamp-3">
            {item.preview}
          </p>
        )}
      </div>

      {/* Expanded full content */}
      {expanded && (
        <div className="border-t border-purple-900/20 bg-[#0f1219] p-5">
          <pre className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-mono max-h-[500px] overflow-y-auto">
            {item.content}
          </pre>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Strategy Card (Half Width)
// ============================================================

function StrategyCard({ item }: { item: IdeationItem }) {
  const [expanded, setExpanded] = useState(false)
  const config = SOURCE_CONFIG.STRATEGY

  return (
    <div className={`bg-[#1e2433] border border-amber-900/20 border-l-4 ${config.borderColor} rounded-lg overflow-hidden hover:border-amber-700/40 transition-colors`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${config.badgeBg} ${config.badgeText}`}>
                <Target className="w-3 h-3" />
                Strategy
              </span>
            </div>
            <h3 className="text-sm font-semibold text-amber-100 truncate">{item.title}</h3>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 transition-colors mt-1"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Preview */}
        <p className={`text-xs text-gray-400 leading-relaxed mt-2 ${expanded ? '' : 'line-clamp-3'}`}>
          {expanded ? '' : item.preview}
        </p>

        {/* Meta */}
        <div className="flex items-center justify-between mt-3">
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <Calendar className="w-3 h-3" />
            {formatDate(item.date)}
          </span>
          <span className="text-[10px] text-gray-600">
            {formatSize(item.size)}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-amber-900/20 bg-[#0f1219] p-4">
          <pre className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-mono max-h-[400px] overflow-y-auto">
            {item.content}
          </pre>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Shared Card (Half Width)
// ============================================================

function SharedCard({ item }: { item: IdeationItem }) {
  const [expanded, setExpanded] = useState(false)
  const config = SOURCE_CONFIG.SHARED

  return (
    <div className={`bg-[#1e2433] border border-cyan-900/20 border-l-4 ${config.borderColor} rounded-lg overflow-hidden hover:border-cyan-700/40 transition-colors`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${config.badgeBg} ${config.badgeText}`}>
                <Users className="w-3 h-3" />
                Cross-Agent
              </span>
            </div>
            <h3 className="text-sm font-semibold text-cyan-100 truncate">{item.title}</h3>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 transition-colors mt-1"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Participant badges */}
        {item.participants && item.participants.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.participants.map((p) => (
              <ParticipantBadge key={p} name={p} />
            ))}
          </div>
        )}

        {/* Preview */}
        <p className={`text-xs text-gray-400 leading-relaxed mt-2 ${expanded ? '' : 'line-clamp-3'}`}>
          {expanded ? '' : item.preview}
        </p>

        {/* Meta */}
        <div className="flex items-center justify-between mt-3">
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <Calendar className="w-3 h-3" />
            {formatDate(item.date)}
          </span>
          <span className="text-[10px] text-gray-600">
            {formatSize(item.size)}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-cyan-900/20 bg-[#0f1219] p-4">
          <pre className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-mono max-h-[400px] overflow-y-auto">
            {item.content}
          </pre>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Empty State
// ============================================================

function IdeationEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        {/* Outer pulse */}
        <div className="absolute -inset-4 bg-purple-500/10 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute -inset-2 bg-purple-500/5 rounded-full animate-pulse" style={{ animationDuration: '2s' }} />
        {/* Icon */}
        <div className="relative w-16 h-16 bg-purple-900/30 border-2 border-purple-600/50 rounded-full flex items-center justify-center shadow-lg shadow-purple-900/30">
          <Brain className="w-8 h-8 text-purple-400 animate-pulse" style={{ animationDuration: '3s' }} />
        </div>
      </div>
      <p className="text-sm text-gray-400 mt-5">No patterns emerging yet</p>
      <p className="text-xs text-gray-600 mt-1">SYNTHESIZER is weaving...</p>
    </div>
  )
}

// ============================================================
// Filter Buttons
// ============================================================

const FILTER_OPTIONS: { value: SourceFilter; label: string; icon: typeof Brain }[] = [
  { value: 'ALL', label: 'All', icon: Brain },
  { value: 'SYNTHESIZER', label: 'Synthesizer', icon: Sparkles },
  { value: 'STRATEGY', label: 'Strategy', icon: Target },
  { value: 'SHARED', label: 'Shared', icon: Users },
]

// ============================================================
// Main Component
// ============================================================

export default function IdeationPage() {
  const [items, setItems] = useState<IdeationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<SourceFilter>('ALL')

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/labs/ideation`)
      if (!res.ok) {
        setItems([])
        return
      }
      const data: IdeationResponse = await res.json()
      setItems(data.ideation || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load + auto-refresh every 30 seconds
  useEffect(() => {
    loadData()
    const interval = setInterval(() => loadData(true), 30000)
    return () => clearInterval(interval)
  }, [loadData])

  // Filtered items
  const filtered = filter === 'ALL'
    ? items
    : items.filter((item) => item.source === filter)

  // Counts per source
  const synthCount = items.filter((i) => i.source === 'SYNTHESIZER').length
  const stratCount = items.filter((i) => i.source === 'STRATEGY').length
  const sharedCount = items.filter((i) => i.source === 'SHARED').length

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="w-6 h-6 text-purple-400 animate-spin" />
        <span className="ml-3 text-sm text-gray-400">Loading ideation patterns...</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* HEADER */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-purple-100 flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            Ideation & Patterns
            {items.length > 0 && (
              <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Synthesizer pattern analysis, strategic thinking, and cross-agent brainstorming
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1e2433] hover:bg-[#252b3b] border border-purple-900/30 rounded-lg text-gray-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ============================================================ */}
      {/* FILTER BAR */}
      {/* ============================================================ */}
      <div className="flex items-center gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isActive = filter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors border ${
                isActive
                  ? 'bg-purple-900/40 text-purple-300 border-purple-700/50'
                  : 'bg-[#1e2433] text-gray-400 hover:text-gray-200 border-gray-700/50 hover:border-gray-600/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* ============================================================ */}
      {/* SUMMARY STATS */}
      {/* ============================================================ */}
      <div className="grid grid-cols-3 gap-3">
        {/* Synthesizer patterns */}
        <div className="bg-[#0f1219] border border-purple-900/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-purple-300">{synthCount}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Patterns</div>
            </div>
          </div>
        </div>

        {/* Strategy docs */}
        <div className="bg-[#0f1219] border border-amber-900/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-amber-900/30 rounded-lg flex items-center justify-center">
              <Target className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-amber-300">{stratCount}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Strategy</div>
            </div>
          </div>
        </div>

        {/* Shared brainstorms */}
        <div className="bg-[#0f1219] border border-cyan-900/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-cyan-900/30 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-cyan-300">{sharedCount}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Shared</div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* IDEATION GRID */}
      {/* ============================================================ */}
      {filtered.length === 0 ? (
        <div className="bg-[#0f1219] border border-purple-900/20 rounded-lg overflow-hidden">
          <IdeationEmptyState />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => {
            switch (item.source) {
              case 'SYNTHESIZER':
                return <SynthesizerCard key={item.id} item={item} />
              case 'STRATEGY':
                return <StrategyCard key={item.id} item={item} />
              case 'SHARED':
                return <SharedCard key={item.id} item={item} />
              default:
                return null
            }
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* STATS FOOTER */}
      {/* ============================================================ */}
      {items.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-800/50">
          <span>{items.length} ideation items</span>
          <span>
            {synthCount} patterns / {stratCount} strategy / {sharedCount} shared
          </span>
          <span>Auto-refresh 30s</span>
        </div>
      )}
    </div>
  )
}
