import { useState } from 'react'
import { Search, Filter, Zap } from 'lucide-react'

interface SearchResult {
  id: string
  agent_id: string
  content: string
  similarity: number
  strength: number
  tags: string[]
  created_at: string
}

interface MemorySearchProps {
  onSearch: (query: string, options: SearchOptions) => Promise<SearchResult[]>
  onResultClick?: (result: SearchResult) => void
}

interface SearchOptions {
  agentId?: string
  threshold: number
  limit: number
}

export default function MemorySearch({ onSearch, onResultClick }: MemorySearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [threshold, setThreshold] = useState(0.7)
  const [limit, setLimit] = useState(10)
  const [showFilters, setShowFilters] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    try {
      const searchResults = await onSearch(query, {
        agentId: agentId || undefined,
        threshold,
        limit
      })
      setResults(searchResults)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Search Input */}
      <div className="p-4 border-b border-gray-800">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search memories semantically..."
            className="w-full bg-gray-800 text-gray-100 rounded-lg pl-10 pr-20 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
          
          <div className="absolute right-2 top-2 flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                showFilters ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <Filter className="w-4 h-4" />
            </button>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Search
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-800 rounded-lg space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Agent ID (optional)</label>
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="Filter by agent..."
                className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Similarity Threshold: {(threshold * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Results Limit</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value))}
                  className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {results.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Search className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg">Search memories using natural language</p>
            <p className="text-sm mt-2">Results are ranked by semantic similarity</p>
          </div>
        )}

        {results.map((result) => (
          <div
            key={result.id}
            onClick={() => onResultClick?.(result)}
            className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-750 transition-colors border border-transparent hover:border-cyan-500/30"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: `hsl(${180 * result.similarity}, 70%, 50%)`
                  }}
                />
                <span className="text-sm text-cyan-400 font-mono">
                  {(result.similarity * 100).toFixed(1)}% match
                </span>
              </div>
              <span className="text-xs text-gray-500">
                Strength: {(result.strength * 100).toFixed(0)}%
              </span>
            </div>
            
            <p className="text-gray-300 text-sm mb-3">{result.content}</p>
            
            {result.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {result.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-xs text-cyan-400 bg-cyan-900/30 px-2 py-1 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            
            <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
              <span>Agent: {result.agent_id.slice(0, 8)}...</span>
              <span>{new Date(result.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
