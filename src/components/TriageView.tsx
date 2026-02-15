import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, AlertCircle, Inbox, Archive, Clock,
  Loader, ChevronDown, ChevronUp, Bot, Radar, Filter
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

interface TriageItem {
  id: string
  source: string
  message: string
  priority: 'urgent' | 'important' | 'routine' | 'archive'
  reasoning: string
  timestamp: string
}

const columnConfig: Record<TriageItem['priority'], {
  label: string
  icon: React.ReactNode
  headerBg: string
  borderColor: string
  dotColor: string
  textColor: string
  accentColor: string
}> = {
  urgent: {
    label: 'URGENT',
    icon: <AlertTriangle className="w-4 h-4" />,
    headerBg: 'bg-red-900/60',
    borderColor: 'border-red-800/40',
    dotColor: 'bg-red-500',
    textColor: 'text-red-300',
    accentColor: 'text-red-400',
  },
  important: {
    label: 'IMPORTANT',
    icon: <AlertCircle className="w-4 h-4" />,
    headerBg: 'bg-amber-900/60',
    borderColor: 'border-amber-800/40',
    dotColor: 'bg-amber-500',
    textColor: 'text-amber-300',
    accentColor: 'text-amber-400',
  },
  routine: {
    label: 'ROUTINE',
    icon: <Inbox className="w-4 h-4" />,
    headerBg: 'bg-blue-900/60',
    borderColor: 'border-blue-800/40',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-300',
    accentColor: 'text-blue-400',
  },
  archive: {
    label: 'ARCHIVE',
    icon: <Archive className="w-4 h-4" />,
    headerBg: 'bg-gray-700/60',
    borderColor: 'border-gray-600/40',
    dotColor: 'bg-gray-500',
    textColor: 'text-gray-300',
    accentColor: 'text-gray-400',
  },
}

const sourceEmojis: Record<string, string> = {
  sentinel: '🛡️',
  scout: '🔭',
  synthesizer: '✨',
  curator: '📚',
  builder: '🏗️',
  compressor: '📦',
  indexer: '🗂️',
  'income-scout': '💎',
  'margin-monitor': '📊',
  'btc-alerts': '₿',
  'email-heartbeat': '📧',
  'portfolio-monitor': '💰',
}

function getSourceEmoji(source: string): string {
  const lower = source.toLowerCase()
  for (const [key, emoji] of Object.entries(sourceEmojis)) {
    if (lower.includes(key)) return emoji
  }
  return '🤖'
}

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SignalCard({ item }: { item: TriageItem }) {
  const [expanded, setExpanded] = useState(false)
  const config = columnConfig[item.priority]

  return (
    <div
      className={`bg-[#252b3b] border border-gray-700/30 rounded-lg p-3 hover:border-gray-600/50 transition-colors cursor-pointer`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0 mt-0.5">{getSourceEmoji(item.source)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-200 leading-relaxed line-clamp-2">{item.message}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-gray-500">{item.source}</span>
            <span className="text-[10px] text-gray-600 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {formatTimestamp(item.timestamp)}
            </span>
          </div>
        </div>
        <button className="shrink-0 mt-0.5 text-gray-600 hover:text-gray-400">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-700/30">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Reasoning</p>
          <p className="text-xs text-gray-400 leading-relaxed italic">{item.reasoning}</p>
        </div>
      )}
    </div>
  )
}

function TriageColumn({ priority, items }: { priority: TriageItem['priority']; items: TriageItem[] }) {
  const config = columnConfig[priority]

  return (
    <div className={`bg-[#1e2433] rounded-lg border ${config.borderColor} overflow-hidden flex flex-col`}>
      {/* Column header */}
      <div className={`${config.headerBg} px-3 py-2.5 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={config.accentColor}>{config.icon}</span>
          <span className={`text-xs font-semibold ${config.textColor}`}>{config.label}</span>
        </div>
        <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full text-white/80 font-mono">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[500px]">
        {items.length > 0 ? (
          items.map(item => <SignalCard key={item.id} item={item} />)
        ) : (
          <div className="flex items-center justify-center py-8 text-center">
            <p className="text-xs text-gray-600">No signals</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Sample data used when API is unavailable
const sampleData: TriageItem[] = [
  {
    id: 'sample-1',
    source: 'sentinel',
    message: 'Margin utilization trending upward — approaching 45% threshold on equity positions.',
    priority: 'urgent',
    reasoning: 'Historical pattern shows margin spikes above 45% correlate with forced liquidation risk. Preemptive attention recommended.',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: 'sample-2',
    source: 'scout',
    message: 'New Claude API pricing tier detected — potential cost savings for cron agents.',
    priority: 'important',
    reasoning: 'Cost optimization opportunity. Current haiku-4.5 spend could decrease 15-20% with new tier.',
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: 'sample-3',
    source: 'income-scout',
    message: 'Freelance contract posted matching CASCADE skill profile — NLP pipeline automation.',
    priority: 'important',
    reasoning: 'Revenue opportunity aligned with active project capabilities. Time-sensitive posting.',
    timestamp: new Date(Date.now() - 90 * 60000).toISOString(),
  },
  {
    id: 'sample-4',
    source: 'curator',
    message: 'Daily memory compression complete. 3 patterns archived, 1 cross-reference discovered.',
    priority: 'routine',
    reasoning: 'Standard memory maintenance cycle. Cross-reference between Voltamachine docs and CASCADE design patterns flagged for review.',
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
  },
  {
    id: 'sample-5',
    source: 'synthesizer',
    message: 'Morning synthesis complete — 7 signals processed, 2 actionable insights generated.',
    priority: 'routine',
    reasoning: 'Regular synthesis cycle. Insights relate to portfolio rebalancing and development velocity metrics.',
    timestamp: new Date(Date.now() - 180 * 60000).toISOString(),
  },
  {
    id: 'sample-6',
    source: 'btc-alerts',
    message: 'BTC price crossed $95,000 support level. No immediate action required.',
    priority: 'archive',
    reasoning: 'Price movement within expected range. Alert logged for pattern tracking.',
    timestamp: new Date(Date.now() - 240 * 60000).toISOString(),
  },
]

export default function TriageView() {
  const [items, setItems] = useState<TriageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [apiAvailable, setApiAvailable] = useState(true)
  const [usingSample, setUsingSample] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/erismorn/triage`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || data.signals || [])
        setApiAvailable(true)
        setUsingSample(false)
      } else {
        // API returned error (404, etc.) — use sample data
        setApiAvailable(false)
        setItems(sampleData)
        setUsingSample(true)
      }
    } catch (e) {
      // Network error — use sample data
      setApiAvailable(false)
      setItems(sampleData)
      setUsingSample(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Group items by priority
  const byPriority: Record<TriageItem['priority'], TriageItem[]> = {
    urgent: items.filter(i => i.priority === 'urgent'),
    important: items.filter(i => i.priority === 'important'),
    routine: items.filter(i => i.priority === 'routine'),
    archive: items.filter(i => i.priority === 'archive'),
  }

  const totalCount = items.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radar className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-amber-100">Triage Matrix</h2>
            <p className="text-xs text-gray-400">Incoming signals categorized by ErisMorn</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Counts summary */}
          <div className="flex items-center gap-2">
            {(['urgent', 'important', 'routine', 'archive'] as const).map(p => (
              <div key={p} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${columnConfig[p].dotColor}`} />
                <span className="text-[10px] text-gray-500 font-mono">{byPriority[p].length}</span>
              </div>
            ))}
          </div>

          <span className="text-[10px] bg-[#252b3b] text-gray-400 px-2 py-1 rounded">
            {totalCount} signal{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Sample data banner */}
      {usingSample && (
        <div className="bg-purple-900/20 border border-purple-800/30 rounded-lg p-3 flex items-center gap-3">
          <div className="relative shrink-0">
            <Bot className="w-5 h-5 text-purple-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          </div>
          <div>
            <p className="text-xs text-purple-300">ErisMorn is analyzing incoming signals...</p>
            <p className="text-[10px] text-gray-500">Showing sample data. Live triage will activate when the endpoint comes online.</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading triage data...</p>
          </div>
        </div>
      )}

      {/* Kanban columns */}
      {!loading && (
        <div className="grid grid-cols-4 gap-4">
          <TriageColumn priority="urgent" items={byPriority.urgent} />
          <TriageColumn priority="important" items={byPriority.important} />
          <TriageColumn priority="routine" items={byPriority.routine} />
          <TriageColumn priority="archive" items={byPriority.archive} />
        </div>
      )}

      {/* Empty state (when API works but no data) */}
      {!loading && apiAvailable && items.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-900/20 flex items-center justify-center">
              <Radar className="w-8 h-8 text-amber-500/50" />
            </div>
            <p className="text-sm text-gray-400">No incoming signals</p>
            <p className="text-xs text-gray-600 mt-1">ErisMorn will populate this view as agents report in</p>
          </div>
        </div>
      )}
    </div>
  )
}
