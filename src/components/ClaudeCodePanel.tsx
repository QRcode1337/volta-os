import { useState, useEffect } from 'react'
import { 
  Brain, Code, Bug, Lightbulb, RefreshCw, Layers, 
  ChevronDown, ChevronRight, Search, Zap, Clock,
  CheckCircle, AlertCircle, GitBranch, FileText
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

interface Observation {
  id: number
  project: string
  type: 'discovery' | 'bugfix' | 'feature' | 'refactor' | 'change' | 'decision'
  title: string
  subtitle: string
  narrative: string
  facts: string
  concepts: string
  files_read: string
  files_modified: string
  created_at: string
  prompt_number: number
}

interface Stats {
  total: number
  hasMore: boolean
  byType: Record<string, number>
  byProject: Record<string, number>
  recentProjects: string[]
  available?: boolean
  error?: string
}

const typeIcons: Record<string, React.ReactNode> = {
  discovery: <Lightbulb className="w-4 h-4 text-yellow-400" />,
  bugfix: <Bug className="w-4 h-4 text-red-400" />,
  feature: <Zap className="w-4 h-4 text-green-400" />,
  refactor: <Layers className="w-4 h-4 text-blue-400" />,
  change: <GitBranch className="w-4 h-4 text-purple-400" />,
  decision: <CheckCircle className="w-4 h-4 text-cyan-400" />
}

const typeColors: Record<string, string> = {
  discovery: 'bg-yellow-900/30 border-yellow-700/50',
  bugfix: 'bg-red-900/30 border-red-700/50',
  feature: 'bg-green-900/30 border-green-700/50',
  refactor: 'bg-blue-900/30 border-blue-700/50',
  change: 'bg-purple-900/30 border-purple-700/50',
  decision: 'bg-cyan-900/30 border-cyan-700/50'
}

export function ClaudeCodePanel() {
  const [observations, setObservations] = useState<Observation[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [typeFilter])

  async function loadData() {
    setLoading(true)
    try {
      // Check health first
      const healthRes = await fetch(`${API_BASE}/claude-mem/health`)
      const health = await healthRes.json()
      setAvailable(health.available)
      
      if (!health.available) {
        setLoading(false)
        return
      }

      // Fetch observations and stats
      let obsUrl = `${API_BASE}/claude-mem/observations?limit=30`
      if (typeFilter) obsUrl += `&type=${typeFilter}`
      
      const [obsRes, statsRes] = await Promise.all([
        fetch(obsUrl),
        fetch(`${API_BASE}/claude-mem/stats`)
      ])
      
      const obsData = await obsRes.json()
      const statsData = await statsRes.json()
      
      setObservations(obsData.items || [])
      setStats(statsData)
    } catch (e) {
      console.error('Failed to load Claude Code data:', e)
      setAvailable(false)
    } finally {
      setLoading(false)
    }
  }

  function formatTime(isoDate: string): string {
    const date = new Date(isoDate)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  function parseJson(str: string): string[] {
    try {
      return JSON.parse(str) || []
    } catch {
      return []
    }
  }

  const filteredObs = observations.filter(obs => {
    if (!filter) return true
    const searchable = `${obs.title} ${obs.subtitle} ${obs.project}`.toLowerCase()
    return searchable.includes(filter.toLowerCase())
  })

  if (loading) {
    return (
      <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-6">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Loading Claude Code memory...
        </div>
      </div>
    )
  }

  if (!available) {
    return (
      <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 text-gray-500">
          <AlertCircle className="w-5 h-5" />
          <div>
            <p className="font-medium">Claude Code not running</p>
            <p className="text-xs text-gray-600">Start Claude Code to see observations from localhost:37777</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Claude Code Memory
            <span className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded">LIVE</span>
          </h2>
          <button
            onClick={loadData}
            className="text-gray-400 hover:text-gray-200 p-1"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-6 gap-2 mb-4">
            {Object.entries(stats.byType).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                className={`p-2 rounded text-center transition-colors ${
                  typeFilter === type 
                    ? 'bg-purple-900/50 border border-purple-500' 
                    : 'bg-[#252b3b] hover:bg-[#2a3142]'
                }`}
              >
                <div className="flex justify-center mb-1">{typeIcons[type]}</div>
                <div className="text-lg font-bold text-gray-200">{count}</div>
                <div className="text-[10px] text-gray-500 capitalize">{type}</div>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search observations..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full bg-[#252b3b] border border-purple-900/30 rounded pl-9 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-600"
          />
        </div>
      </div>

      {/* Observations list */}
      <div className="space-y-2 max-h-[500px] overflow-auto">
        {filteredObs.map(obs => (
          <div
            key={obs.id}
            className={`border rounded-lg overflow-hidden ${typeColors[obs.type] || 'bg-[#1e2433] border-gray-700/50'}`}
          >
            <button
              onClick={() => setExpanded(expanded === obs.id ? null : obs.id)}
              className="w-full text-left p-3 flex items-start gap-3"
            >
              <div className="mt-0.5">{typeIcons[obs.type]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-purple-400 font-mono">{obs.project}</span>
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(obs.created_at)}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-gray-200 leading-tight">{obs.title}</h3>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{obs.subtitle}</p>
              </div>
              {expanded === obs.id ? (
                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
              )}
            </button>

            {expanded === obs.id && (
              <div className="px-3 pb-3 border-t border-gray-700/30 pt-3 space-y-3">
                {/* Narrative */}
                <div>
                  <h4 className="text-[10px] uppercase text-gray-500 mb-1">Narrative</h4>
                  <p className="text-xs text-gray-300 leading-relaxed">{obs.narrative}</p>
                </div>

                {/* Facts */}
                {obs.facts && parseJson(obs.facts).length > 0 && (
                  <div>
                    <h4 className="text-[10px] uppercase text-gray-500 mb-1">Facts</h4>
                    <ul className="space-y-1">
                      {parseJson(obs.facts).map((fact, i) => (
                        <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                          <span className="text-purple-400 mt-1">•</span>
                          {fact}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Files */}
                {(parseJson(obs.files_read).length > 0 || parseJson(obs.files_modified).length > 0) && (
                  <div className="flex gap-4">
                    {parseJson(obs.files_read).length > 0 && (
                      <div>
                        <h4 className="text-[10px] uppercase text-gray-500 mb-1">Files Read</h4>
                        <div className="space-y-0.5">
                          {parseJson(obs.files_read).map((file, i) => (
                            <div key={i} className="text-[10px] text-blue-400 font-mono flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {file}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {parseJson(obs.files_modified).length > 0 && (
                      <div>
                        <h4 className="text-[10px] uppercase text-gray-500 mb-1">Files Modified</h4>
                        <div className="space-y-0.5">
                          {parseJson(obs.files_modified).map((file, i) => (
                            <div key={i} className="text-[10px] text-green-400 font-mono flex items-center gap-1">
                              <Code className="w-3 h-3" />
                              {file}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center gap-4 text-[10px] text-gray-600 pt-2 border-t border-gray-700/30">
                  <span>ID: {obs.id}</span>
                  <span>Prompt #{obs.prompt_number}</span>
                  <span>{new Date(obs.created_at).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        ))}

        {filteredObs.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            {filter ? 'No matching observations' : 'No observations yet'}
          </div>
        )}
      </div>
    </div>
  )
}

// Compact version for sidebar/widget
export function ClaudeCodeWidget() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<Observation[]>([])
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [healthRes, statsRes, obsRes] = await Promise.all([
        fetch(`${API_BASE}/claude-mem/health`),
        fetch(`${API_BASE}/claude-mem/stats`),
        fetch(`${API_BASE}/claude-mem/observations?limit=5`)
      ])
      
      const health = await healthRes.json()
      setAvailable(health.available)
      
      if (health.available) {
        const statsData = await statsRes.json()
        const obsData = await obsRes.json()
        setStats(statsData)
        setRecent(obsData.items || [])
      }
    } catch (e) {
      setAvailable(false)
    }
  }

  if (!available) {
    return (
      <div className="bg-[#252b3b] rounded-lg p-3 border border-gray-700/30">
        <div className="flex items-center gap-2 text-gray-500 text-xs">
          <Brain className="w-4 h-4" />
          Claude Code offline
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#252b3b] rounded-lg p-3 border border-purple-700/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-purple-300 text-xs font-medium">
          <Brain className="w-4 h-4" />
          Claude Code
        </div>
        <span className="text-[10px] bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded">
          {stats?.total || 0} obs
        </span>
      </div>
      
      <div className="space-y-1.5">
        {recent.slice(0, 3).map(obs => (
          <div key={obs.id} className="flex items-start gap-2">
            <div className="mt-0.5">{typeIcons[obs.type]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-300 truncate">{obs.title}</p>
              <p className="text-[10px] text-gray-500">{obs.project}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
