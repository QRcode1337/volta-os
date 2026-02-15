import { useState, useEffect, useCallback } from 'react'
import {
  Layers, Hammer, FolderOpen, Cpu, ChevronDown, ChevronRight,
  RefreshCw, FileText, Calendar, Loader2
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

// ============================================================
// Types
// ============================================================

interface Prototype {
  id: string
  source: 'BUILDER' | 'PROJECT' | 'SWARM'
  type: 'build' | 'demo' | 'session-log' | 'project' | 'experiment'
  title: string
  preview: string
  content: string
  date: string
  file: string
  size: number
  fileCount?: number
}

interface PrototypesResponse {
  prototypes: Prototype[]
  count: number
  sources: string[]
}

// ============================================================
// Constants
// ============================================================

const SOURCE_CONFIG = {
  BUILDER: {
    label: 'BUILDER',
    icon: Hammer,
    bg: 'bg-amber-900/30',
    text: 'text-amber-300',
    border: 'border-amber-700/50',
  },
  PROJECT: {
    label: 'PROJECT',
    icon: FolderOpen,
    bg: 'bg-green-900/30',
    text: 'text-green-300',
    border: 'border-green-700/50',
  },
  SWARM: {
    label: 'SWARM',
    icon: Cpu,
    bg: 'bg-purple-900/30',
    text: 'text-purple-300',
    border: 'border-purple-700/50',
  },
} as const

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  build:        { bg: 'bg-amber-900/20', text: 'text-amber-400' },
  demo:         { bg: 'bg-cyan-900/20',  text: 'text-cyan-400' },
  'session-log': { bg: 'bg-gray-800/50',  text: 'text-gray-400' },
  project:      { bg: 'bg-green-900/20', text: 'text-green-400' },
  experiment:   { bg: 'bg-purple-900/20', text: 'text-purple-400' },
}

const SOURCE_FILTERS = ['ALL', 'BUILDER', 'PROJECT', 'SWARM'] as const
const TYPE_FILTERS = ['ALL', 'build', 'demo', 'session-log', 'project', 'experiment'] as const

// ============================================================
// Helpers
// ============================================================

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// ============================================================
// Source Badge
// ============================================================

function SourceBadge({ source }: { source: keyof typeof SOURCE_CONFIG }) {
  const cfg = SOURCE_CONFIG[source] || SOURCE_CONFIG.BUILDER
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// ============================================================
// Type Badge
// ============================================================

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_COLORS[type] || { bg: 'bg-gray-800/50', text: 'text-gray-400' }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {type}
    </span>
  )
}

// ============================================================
// Prototype Card
// ============================================================

function PrototypeCard({ prototype }: { prototype: Prototype }) {
  const [expanded, setExpanded] = useState(false)

  const previewLines = prototype.preview?.split('\n') || []
  const truncatedPreview = previewLines.slice(0, 10).join('\n')
  const hasMore = previewLines.length > 10 || (prototype.content && prototype.content.length > truncatedPreview.length)

  return (
    <div className="bg-[#1e2433] border border-amber-900/20 rounded-lg overflow-hidden hover:border-amber-900/40 transition-colors">
      <div className="p-4">
        {/* Badges row */}
        <div className="flex items-center gap-2 mb-2">
          <SourceBadge source={prototype.source} />
          <TypeBadge type={prototype.type} />
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-amber-100 mb-2">{prototype.title}</h3>

        {/* Preview content */}
        <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-mono bg-[#0a0d14] rounded p-3 max-h-60 overflow-y-auto">
          {expanded ? (prototype.content || prototype.preview) : truncatedPreview}
        </div>

        {/* Expand/collapse */}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-2 text-[10px] text-amber-400/70 hover:text-amber-300 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronDown className="w-3 h-3" />
                Collapse
              </>
            ) : (
              <>
                <ChevronRight className="w-3 h-3" />
                Show full content
              </>
            )}
          </button>
        )}

        {/* Meta row */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {prototype.file}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(prototype.date)}
          </span>
          <span>{formatSize(prototype.size)}</span>
          {prototype.fileCount != null && (
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {prototype.fileCount} files
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function PrototypesPage() {
  const [prototypes, setPrototypes] = useState<Prototype[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<string>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/labs/prototypes`)
      if (res.status === 404) {
        setPrototypes([])
        setCount(0)
        return
      }
      if (!res.ok) {
        setPrototypes([])
        setCount(0)
        return
      }
      const data: PrototypesResponse = await res.json()
      setPrototypes(data.prototypes || [])
      setCount(data.count || 0)
    } catch {
      setPrototypes([])
      setCount(0)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(() => loadData(true), 30000)
    return () => clearInterval(interval)
  }, [loadData])

  // Filtered prototypes
  const filtered = prototypes.filter(p => {
    if (sourceFilter !== 'ALL' && p.source !== sourceFilter) return false
    if (typeFilter !== 'ALL' && p.type !== typeFilter) return false
    return true
  })

  // Summary counts
  const builderCount = prototypes.filter(p => p.source === 'BUILDER').length
  const projectCount = prototypes.filter(p => p.source === 'PROJECT').length
  const swarmCount = prototypes.filter(p => p.source === 'SWARM').length

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
        <span className="ml-3 text-sm text-gray-400">Loading prototypes...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-amber-100">Prototypes & Builds</h2>
          <span className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full font-mono border border-amber-700/50">
            {count}
          </span>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1e2433] hover:bg-[#252b3b] border border-amber-900/30 rounded-lg text-gray-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Source filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Source</span>
          {SOURCE_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                sourceFilter === s
                  ? 'bg-amber-700/50 text-amber-200'
                  : 'bg-[#1e2433] text-gray-400 hover:text-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Type</span>
          {TYPE_FILTERS.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                typeFilter === t
                  ? 'bg-amber-700/50 text-amber-200'
                  : 'bg-[#1e2433] text-gray-400 hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Builder Outputs', value: builderCount, icon: Hammer, color: 'text-amber-400', border: 'border-amber-900/30', bg: 'bg-amber-900/10' },
          { label: 'Active Projects', value: projectCount, icon: FolderOpen, color: 'text-green-400', border: 'border-green-900/30', bg: 'bg-green-900/10' },
          { label: 'Swarm Experiments', value: swarmCount, icon: Cpu, color: 'text-purple-400', border: 'border-purple-900/30', bg: 'bg-purple-900/10' },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className={`${stat.bg} border ${stat.border} rounded-lg p-3 flex items-center gap-3`}>
              <Icon className={`w-5 h-5 ${stat.color}`} />
              <div>
                <div className="text-xl font-bold text-gray-100">{stat.value}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">{stat.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Prototypes list */}
      {filtered.length === 0 ? (
        <div className="bg-[#0f1219] border border-amber-900/20 rounded-lg p-12 text-center">
          <Hammer className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No prototypes yet — BUILDER is standing by...</p>
          <p className="text-xs text-gray-600 mt-1">
            Builds, demos, and experiments will appear here as agents produce output
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(proto => (
            <PrototypeCard key={proto.id} prototype={proto} />
          ))}
        </div>
      )}

      {/* Footer stats */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-800/50">
          <span>{filtered.length} prototype{filtered.length !== 1 ? 's' : ''} shown</span>
          <span>Auto-refreshes every 30s</span>
          <span>
            Total size: {formatSize(filtered.reduce((sum, p) => sum + (p.size || 0), 0))}
          </span>
        </div>
      )}
    </div>
  )
}
