import { useState, useEffect } from 'react'
import { DollarSign, Zap, TrendingUp, Clock, BarChart3, RefreshCw } from 'lucide-react'

interface TokenEntry {
  timestamp: string
  inputTokens: number
  outputTokens: number
  model: string
  toolsUsed: string[]
  cacheCreation?: number
  cacheRead?: number
}

interface TokenData {
  entries: TokenEntry[]
  totals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    totalCost: number
    requestCount: number
  }
  sessionCost: number
  todayEntries: TokenEntry[]
}

export default function TokenUsage() {
  const [data, setData] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'overview' | 'history'>('overview')

  async function fetchUsage() {
    setLoading(true)
    try {
      const res = await fetch('http://localhost:3001/api/erismorn/token-usage')
      if (res.ok) {
        setData(await res.json())
      }
    } catch (e) {
      console.error('Failed to fetch token usage')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUsage()
    const interval = setInterval(fetchUsage, 30000)
    return () => clearInterval(interval)
  }, [])

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toString()
  }

  function formatCost(n: number): string {
    if (n < 0.01) return `$${n.toFixed(4)}`
    return `$${n.toFixed(2)}`
  }

  function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  // Compute hourly breakdown for today's chart
  function getHourlyBreakdown(entries: TokenEntry[]): { hour: string; tokens: number; cost: number }[] {
    const hours: Record<string, { tokens: number; cost: number }> = {}
    for (const e of entries) {
      const h = new Date(e.timestamp).getHours()
      const key = `${h.toString().padStart(2, '0')}:00`
      if (!hours[key]) hours[key] = { tokens: 0, cost: 0 }
      hours[key].tokens += e.inputTokens + e.outputTokens
      hours[key].cost += (e.inputTokens / 1_000_000) * 3.0 + (e.outputTokens / 1_000_000) * 15.0
    }
    return Object.entries(hours)
      .map(([hour, v]) => ({ hour, ...v }))
      .sort((a, b) => a.hour.localeCompare(b.hour))
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 animate-pulse">Loading token usage...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <DollarSign className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No token usage data yet</p>
          <p className="text-xs text-gray-600 mt-1">Chat with ErisMorn to start tracking</p>
        </div>
      </div>
    )
  }

  const hourly = getHourlyBreakdown(data.todayEntries)
  const maxHourlyTokens = Math.max(...hourly.map(h => h.tokens), 1)

  const todayInput = data.todayEntries.reduce((a, e) => a + e.inputTokens, 0)
  const todayOutput = data.todayEntries.reduce((a, e) => a + e.outputTokens, 0)
  const todayTotal = todayInput + todayOutput
  const avgTokensPerReq = data.totals.requestCount > 0
    ? Math.round(data.totals.totalTokens / data.totals.requestCount)
    : 0

  // Tool usage frequency
  const toolFreq: Record<string, number> = {}
  for (const e of data.entries) {
    for (const t of e.toolsUsed) {
      toolFreq[t] = (toolFreq[t] || 0) + 1
    }
  }
  const topTools = Object.entries(toolFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-bold text-amber-100">Token Usage & Cost</h2>
          <span className="text-xs text-gray-500 bg-[#1e2433] px-2 py-0.5 rounded">
            {data.totals.requestCount} requests tracked
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1e2433] rounded-lg border border-amber-900/30 overflow-hidden">
            <button
              onClick={() => setView('overview')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                view === 'overview' ? 'bg-amber-700/50 text-amber-200' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setView('history')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                view === 'history' ? 'bg-amber-700/50 text-amber-200' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              History
            </button>
          </div>
          <button
            onClick={fetchUsage}
            className="p-1.5 rounded-lg bg-[#1e2433] border border-amber-900/30 text-gray-400 hover:text-amber-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {view === 'overview' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#1e2433] border border-green-900/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400">Total Cost</span>
              </div>
              <div className="text-2xl font-bold text-green-300">{formatCost(data.totals.totalCost)}</div>
              <div className="text-xs text-gray-500 mt-1">
                Today: {formatCost(data.sessionCost)}
              </div>
            </div>

            <div className="bg-[#1e2433] border border-amber-900/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-gray-400">Total Tokens</span>
              </div>
              <div className="text-2xl font-bold text-amber-200">{formatTokens(data.totals.totalTokens)}</div>
              <div className="text-xs text-gray-500 mt-1">
                Today: {formatTokens(todayTotal)}
              </div>
            </div>

            <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400">Avg / Request</span>
              </div>
              <div className="text-2xl font-bold text-purple-300">{formatTokens(avgTokensPerReq)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {data.totals.requestCount} API calls
              </div>
            </div>

            <div className="bg-[#1e2433] border border-blue-900/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400">I/O Split</span>
              </div>
              <div className="text-sm font-mono text-blue-300 mt-1">
                <span className="text-cyan-400">IN</span> {formatTokens(data.totals.inputTokens)}
              </div>
              <div className="text-sm font-mono text-blue-300">
                <span className="text-orange-400">OUT</span> {formatTokens(data.totals.outputTokens)}
              </div>
            </div>
          </div>

          {/* Hourly Chart */}
          {hourly.length > 0 && (
            <div className="bg-[#1e2433] border border-amber-900/30 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-200 mb-3">Today's Usage by Hour</h3>
              <div className="flex items-end gap-1 h-32">
                {hourly.map(h => (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                      <div
                        className="w-full bg-gradient-to-t from-amber-700 to-amber-500 rounded-t opacity-80"
                        style={{ height: `${Math.max((h.tokens / maxHourlyTokens) * 100, 4)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-gray-500">{h.hour}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-2">
                <span>{data.todayEntries.length} requests today</span>
                <span>{formatTokens(todayTotal)} tokens</span>
                <span>{formatCost(data.sessionCost)}</span>
              </div>
            </div>
          )}

          {/* Token Breakdown + Tool Usage */}
          <div className="grid grid-cols-2 gap-4">
            {/* Token Breakdown */}
            <div className="bg-[#1e2433] border border-amber-900/30 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-200 mb-3">Token Breakdown</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-cyan-400">Input Tokens</span>
                    <span className="text-gray-400">{formatTokens(data.totals.inputTokens)}</span>
                  </div>
                  <div className="h-2 bg-[#0a0d14] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500/60 rounded-full"
                      style={{ width: `${data.totals.totalTokens > 0 ? (data.totals.inputTokens / data.totals.totalTokens) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-orange-400">Output Tokens</span>
                    <span className="text-gray-400">{formatTokens(data.totals.outputTokens)}</span>
                  </div>
                  <div className="h-2 bg-[#0a0d14] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500/60 rounded-full"
                      style={{ width: `${data.totals.totalTokens > 0 ? (data.totals.outputTokens / data.totals.totalTokens) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-700/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Input cost</span>
                    <span className="text-gray-300">{formatCost((data.totals.inputTokens / 1_000_000) * 3.0)}</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-400">Output cost</span>
                    <span className="text-gray-300">{formatCost((data.totals.outputTokens / 1_000_000) * 15.0)}</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-400">Model</span>
                    <span className="text-gray-300 font-mono text-[10px]">sonnet-4.5</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tool Usage */}
            <div className="bg-[#1e2433] border border-amber-900/30 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-200 mb-3">Tool Usage Frequency</h3>
              {topTools.length > 0 ? (
                <div className="space-y-2">
                  {topTools.map(([tool, count]) => {
                    const maxCount = topTools[0][1] as number
                    return (
                      <div key={tool}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-300 font-mono">{tool}</span>
                          <span className="text-gray-500">{count}x</span>
                        </div>
                        <div className="h-1.5 bg-[#0a0d14] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500/60 rounded-full"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-500 text-center py-4">No tool usage recorded yet</div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* History View */
        <div className="bg-[#1e2433] border border-amber-900/30 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700/50 text-gray-400">
                <th className="text-left p-3">Time</th>
                <th className="text-right p-3">Input</th>
                <th className="text-right p-3">Output</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Cost</th>
                <th className="text-left p-3">Tools</th>
              </tr>
            </thead>
            <tbody>
              {[...data.entries].reverse().slice(0, 50).map((entry, i) => {
                const cost = (entry.inputTokens / 1_000_000) * 3.0 + (entry.outputTokens / 1_000_000) * 15.0
                return (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-[#252b3b] transition-colors">
                    <td className="p-3 text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {timeAgo(entry.timestamp)}
                      </div>
                    </td>
                    <td className="p-3 text-right text-cyan-400 font-mono">{formatTokens(entry.inputTokens)}</td>
                    <td className="p-3 text-right text-orange-400 font-mono">{formatTokens(entry.outputTokens)}</td>
                    <td className="p-3 text-right text-amber-200 font-mono">{formatTokens(entry.inputTokens + entry.outputTokens)}</td>
                    <td className="p-3 text-right text-green-400 font-mono">{formatCost(cost)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {entry.toolsUsed.map((t, j) => (
                          <span key={j} className="bg-purple-900/30 text-purple-300 px-1.5 py-0.5 rounded text-[10px]">
                            {t}
                          </span>
                        ))}
                        {entry.toolsUsed.length === 0 && (
                          <span className="text-gray-600">none</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No usage history yet — chat with ErisMorn to start tracking
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
