import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, Inbox } from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

interface Decision {
  id: string
  timestamp: string
  title: string
  reasoning: string
  category: string
  action: string | null
  status: string
}

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  delegation:  { bg: 'bg-blue-900/30',   text: 'text-blue-300',   border: 'border-blue-700/30' },
  priority:    { bg: 'bg-amber-900/30',   text: 'text-amber-300',  border: 'border-amber-700/30' },
  escalation:  { bg: 'bg-red-900/30',     text: 'text-red-300',    border: 'border-red-700/30' },
  automation:  { bg: 'bg-purple-900/30',   text: 'text-purple-300', border: 'border-purple-700/30' },
  strategy:    { bg: 'bg-green-900/30',    text: 'text-green-300',  border: 'border-green-700/30' },
  alert:       { bg: 'bg-orange-900/30',   text: 'text-orange-300', border: 'border-orange-700/30' },
}

function getCategoryStyle(category: string) {
  return categoryColors[category.toLowerCase()] || {
    bg: 'bg-gray-900/30',
    text: 'text-gray-300',
    border: 'border-gray-700/30'
  }
}

function formatTimestamp(ts: string) {
  try {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMs / 3600000)

    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function DecisionFeed() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchDecisions(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await fetch(`${API_BASE}/erismorn/decisions`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      setDecisions(data.decisions || [])
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Failed to fetch decisions')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDecisions()
    const interval = setInterval(() => fetchDecisions(), 30000)
    return () => clearInterval(interval)
  }, [])

  // Sort newest first
  const sorted = [...decisions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading decisions...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-100">Decision Feed</h2>
          <p className="text-xs text-gray-500">ErisMorn's operational decisions — auto-refreshes every 30s</p>
        </div>
        <button
          onClick={() => fetchDecisions(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1e2433] hover:bg-[#252b3b] border border-amber-900/30 rounded-lg text-gray-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Empty State */}
      {sorted.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <Inbox className="w-10 h-10 mb-3 text-gray-600" />
          <p className="text-sm">No decisions yet</p>
          <p className="text-xs text-gray-600 mt-1">ErisMorn's operational decisions will appear here</p>
        </div>
      ) : (
        /* Decision Cards */
        <div className="space-y-3">
          {sorted.map(decision => {
            const style = getCategoryStyle(decision.category)
            return (
              <div
                key={decision.id}
                className="bg-[#1e2433] border border-amber-900/20 rounded-lg p-4 hover:border-amber-900/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    {/* Category Badge */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${style.bg} ${style.text} ${style.border} border`}>
                      {decision.category}
                    </span>
                    {/* Status */}
                    <span className="text-[10px] text-gray-500">{decision.status}</span>
                  </div>
                  <span className="text-[10px] text-gray-600 flex-shrink-0">
                    {formatTimestamp(decision.timestamp)}
                  </span>
                </div>

                <h3 className="text-sm font-medium text-amber-100 mb-1.5">{decision.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-2">{decision.reasoning}</p>

                {decision.action && (
                  <div className="flex items-start gap-2 mt-2 pt-2 border-t border-gray-700/30">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider flex-shrink-0 mt-0.5">Action:</span>
                    <span className="text-xs text-green-300">{decision.action}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
