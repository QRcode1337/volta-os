import { useState, useEffect } from 'react'
import { Orbit } from 'lucide-react'
import VectorGalaxy from '../components/AgentForge/VectorGalaxy'
import MemorySearch from '../components/AgentForge/MemorySearch'
import LeadDashboard from '../components/CASCADE/LeadDashboard'
import { api } from '../lib/api'

type Tab = 'vector-galaxy' | 'memory-search' | 'cascade-leads'

interface AgentForgePageProps {
  initialTab?: string
}

interface Memory {
  id: string
  agent_id: string
  content: string
  embedding: number[]
  strength: number
  tags: string[]
  created_at: string
  last_accessed: string
}

export default function AgentForgePage({ initialTab }: AgentForgePageProps) {
  const mapTab = (t?: string): Tab => {
    if (t === 'vector-galaxy') return 'vector-galaxy'
    if (t === 'memory-search') return 'memory-search'
    if (t === 'cascade-leads') return 'cascade-leads'
    return 'vector-galaxy'
  }
  const [activeTab, setActiveTab] = useState<Tab>(mapTab(initialTab))
  const [memories, setMemories] = useState<Memory[]>([])
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    checkHealth()
  }, [])

  const checkHealth = async () => {
    try {
      await api.health()
      setConnected(true)
      fetchMemories()
    } catch (error) {
      console.error('Backend not connected:', error)
      setConnected(false)
    }
  }

  const fetchMemories = async () => {
    setLoading(true)
    try {
      const response = await api.memory.list({ limit: 200 })
      setMemories(response.memories.map(m => ({
        id: m.id,
        agent_id: m.agent_id,
        content: m.content,
        embedding: [], // not fetched — VectorGalaxy uses random projection for position
        strength: m.strength,
        tags: m.tags || [],
        created_at: m.created_at,
        last_accessed: m.last_accessed
      })))
    } catch (error) {
      console.error('Failed to fetch memories:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (query: string, options: any) => {
    const response = await api.memory.search({ query, ...options })
    return response.results
  }

  const handleLoadLeads = async (status?: any) => {
    if (status) {
      const response = await api.cascade.getLeadsByStatus(status)
      return response.leads
    } else {
      const response = await api.cascade.getAllLeads()
      return response.leads
    }
  }

  const handleMemoryClick = (memory: any) => {
    setSelectedMemoryId(memory.id)
    console.log('Memory clicked:', memory)
  }

  const handleResultClick = (result: any) => {
    setSelectedMemoryId(result.id)
    console.log('Search result clicked:', result)
  }

  const handleLeadClick = (lead: any) => {
    console.log('Lead clicked:', lead)
  }

  // Sync tab when parent changes
  useEffect(() => {
    if (initialTab) setActiveTab(mapTab(initialTab))
  }, [initialTab])

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Connection Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-layer-1 border-b border-neon-cyan/10">
        <div className="flex items-center gap-3">
          <span className="text-orange-400 font-mono text-sm tracking-wider uppercase">AgentForge x CASCADE</span>
          <span className="text-gray-600 text-xs">Persistent Memory & Business Automation</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(0,255,128,0.5)]' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-500 font-mono">
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
          {!connected && (
            <button
              onClick={checkHealth}
              className="text-xs text-orange-400 hover:text-orange-300 ml-2 underline"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!connected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Orbit className="w-16 h-16 mb-4 opacity-20 text-orange-400" />
            <p className="text-lg mb-2 text-gray-300">Backend server not connected</p>
            <p className="text-sm text-gray-500">Start the server with: <code className="text-orange-400">npm run dev:server</code></p>
            <button
              onClick={checkHealth}
              className="mt-4 px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors font-mono text-sm"
            >
              RECONNECT
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'vector-galaxy' && (
              <VectorGalaxy
                memories={memories}
                onMemoryClick={handleMemoryClick}
                selectedMemoryId={selectedMemoryId}
              />
            )}

            {activeTab === 'memory-search' && (
              <MemorySearch
                onSearch={handleSearch}
                onResultClick={handleResultClick}
              />
            )}

            {activeTab === 'cascade-leads' && (
              <LeadDashboard
                onLoadLeads={handleLoadLeads}
                onLeadClick={handleLeadClick}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
