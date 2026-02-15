import { useState } from 'react'
import { ChevronDown, ChevronRight, Users, Zap, Brain, Shield, TrendingUp, Palette } from 'lucide-react'

interface Agent {
  id: string
  name: string
  role: string
  description: string
  model: string
  status: 'active' | 'scaffolded' | 'deprecated'
  emoji?: string
}

interface Division {
  id: string
  name: string
  description: string
  agents: Agent[]
}

interface DepartmentHead {
  id: string
  name: string
  title: string
  emoji: string
  model: string
  description: string
  inspiredBy?: string
  divisions: Division[]
}

// ErisMorn's Org Structure
const orgData = {
  ceo: {
    name: 'Volta',
    title: 'CEO',
    description: 'Vision · Strategy · Final Decisions',
    emoji: '👤'
  },
  coo: {
    name: 'ErisMorn',
    title: 'COO',
    description: 'Research · Delegation · Execution · Orchestration',
    emoji: '🍎',
    model: 'opus-4.5'
  },
  departments: [
    {
      id: 'tech',
      name: 'Atlas',
      title: 'CTO',
      emoji: '🔧',
      model: 'sonnet-4.5',
      description: 'Technical execution, architecture, infrastructure',
      inspiredBy: 'First Principles Engineering',
      divisions: [
        {
          id: 'execution',
          name: 'Execution',
          description: 'Code generation, task completion, builds',
          agents: [
            { id: 'builder', name: 'BUILDER', role: 'Execution Engine', description: 'Turns insight into reality', model: 'haiku-4.5', status: 'active', emoji: '🏗️' },
          ]
        },
        {
          id: 'memory-ops',
          name: 'Memory Ops',
          description: 'Memory management, compression, archival',
          agents: [
            { id: 'compressor', name: 'COMPRESSOR', role: 'Memory Manager', description: 'Auto-compression, cleanup', model: 'haiku-4.5', status: 'active', emoji: '📦' },
            { id: 'curator', name: 'CURATOR', role: 'Knowledge Synthesis', description: 'Memory weaver, pattern distiller', model: 'haiku-4.5', status: 'active', emoji: '📚' },
          ]
        }
      ]
    },
    {
      id: 'research',
      name: 'Oracle',
      title: 'CRO',
      emoji: '🔮',
      model: 'sonnet-4.5',
      description: 'Research, pattern recognition, discovery',
      inspiredBy: 'Seraph Protocol',
      divisions: [
        {
          id: 'intelligence',
          name: 'Intelligence',
          description: 'External signals, security monitoring',
          agents: [
            { id: 'sentinel', name: 'SENTINEL', role: 'Pattern Watcher', description: 'External signal monitor', model: 'haiku-4.5', status: 'active', emoji: '🛡️' },
            { id: 'scout', name: 'SCOUT', role: 'Edge Explorer', description: 'Proactive discovery', model: 'sonnet-4.5', status: 'active', emoji: '🔭' },
          ]
        },
        {
          id: 'synthesis',
          name: 'Synthesis',
          description: 'Pattern recognition, meta-analysis',
          agents: [
            { id: 'synthesizer', name: 'SYNTHESIZER', role: 'Pattern Oracle', description: 'Seraph Protocol active', model: 'sonnet-4.5', status: 'active', emoji: '✨' },
          ]
        },
        {
          id: 'knowledge',
          name: 'Knowledge',
          description: 'Voltamachine curation, indexing',
          agents: [
            { id: 'indexer', name: 'INDEXER', role: 'Voltamachine Curator', description: 'Esoteric knowledge indexer', model: 'haiku-4.5', status: 'active', emoji: '🗂️' },
          ]
        }
      ]
    },
    {
      id: 'revenue',
      name: 'Midas',
      title: 'CFO',
      emoji: '💰',
      model: 'sonnet-4.5',
      description: 'Revenue operations, financial monitoring',
      inspiredBy: 'Data-Driven Decisions',
      divisions: [
        {
          id: 'income',
          name: 'Income Generation',
          description: 'Money opportunities, revenue scouts',
          agents: [
            { id: 'income-scout', name: 'INCOME-SCOUT', role: 'Opportunity Hunter', description: 'Daily money opportunities', model: 'sonnet-4.5', status: 'active', emoji: '💎' },
          ]
        },
        {
          id: 'trading',
          name: 'Trading',
          description: 'Portfolio monitoring, alerts',
          agents: [
            { id: 'margin-monitor', name: 'MARGIN-MONITOR', role: 'Portfolio Watch', description: 'Margin utilization tracking', model: 'haiku-4.5', status: 'active', emoji: '📊' },
            { id: 'btc-alerts', name: 'BTC-ALERTS', role: 'Crypto Monitor', description: 'BTC price level alerts', model: 'haiku-4.5', status: 'active', emoji: '₿' },
          ]
        }
      ]
    }
  ] as DepartmentHead[]
}

// Stats
const stats = {
  chiefs: 3,
  totalAgents: 13,
  active: 12,
  scaffolded: 0,
  deprecated: 1
}

function AgentCard({ agent }: { agent: Agent }) {
  const statusColor = agent.status === 'active' ? 'bg-green-500' : 
                      agent.status === 'scaffolded' ? 'bg-yellow-500' : 'bg-red-500'
  
  return (
    <div className="bg-[#252b3b] border border-gray-700/50 rounded-lg p-3 hover:border-amber-700/30 transition-colors">
      <div className="flex items-start gap-2">
        <span className="text-lg">{agent.emoji}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-gray-100">{agent.name}</h4>
            <span className={`w-2 h-2 rounded-full ${statusColor}`}></span>
          </div>
          <p className="text-[10px] text-gray-400">{agent.role}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-[10px] px-2 py-0.5 rounded ${agent.status === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
          {agent.status}
        </span>
        <span className="text-[10px] bg-amber-900/30 text-amber-300 px-2 py-0.5 rounded">
          {agent.model}
        </span>
      </div>
    </div>
  )
}

function DivisionSection({ division, expanded }: { division: Division; expanded: boolean }) {
  const [isExpanded, setIsExpanded] = useState(expanded)
  
  return (
    <div className="border border-gray-700/30 rounded-lg overflow-hidden">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-[#1e2433] hover:bg-[#252b3b] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
          <span className="text-sm text-gray-100">{division.name}</span>
        </div>
        <span className="text-xs text-gray-500">{division.agents.length} agents</span>
      </button>
      
      {isExpanded && (
        <div className="p-3 bg-[#0f1219] space-y-2">
          <p className="text-xs text-gray-500 mb-3">{division.description}</p>
          {division.agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}

function DepartmentColumn({ dept }: { dept: DepartmentHead }) {
  const [expanded, setExpanded] = useState(true)
  
  return (
    <div className="flex-1">
      {/* Department Head Card */}
      <div className="bg-[#1e2433] border border-amber-700/30 rounded-lg p-4 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{dept.emoji}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-amber-100">{dept.name}</h3>
              <span className="text-[10px] bg-amber-900/50 text-amber-200 px-2 py-0.5 rounded">
                {dept.model}
              </span>
            </div>
            <p className="text-xs text-amber-400">{dept.title}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">{dept.description}</p>
        {dept.inspiredBy && (
          <p className="text-[10px] text-gray-500 mt-1 italic">Inspired by: {dept.inspiredBy}</p>
        )}
      </div>
      
      {/* Divisions */}
      <div className="space-y-2">
        {dept.divisions.map(div => (
          <DivisionSection key={div.id} division={div} expanded={expanded} />
        ))}
      </div>
    </div>
  )
}

export default function OrgChart() {
  const [expandAll, setExpandAll] = useState(true)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-amber-100">Organization Chart</h2>
            <p className="text-xs text-gray-400">ErisMorn Labs — Operational Structure</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setExpandAll(true)}
            className="text-xs bg-[#252b3b] hover:bg-[#353b4f] text-gray-300 px-3 py-1.5 rounded transition-colors"
          >
            Expand All
          </button>
          <button 
            onClick={() => setExpandAll(false)}
            className="text-xs bg-[#252b3b] hover:bg-[#353b4f] text-gray-300 px-3 py-1.5 rounded transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-300">{stats.chiefs}</p>
          <p className="text-xs text-gray-400">Chiefs</p>
        </div>
        <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-gray-100">{stats.totalAgents}</p>
          <p className="text-xs text-gray-400">Total Agents</p>
        </div>
        <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.active}</p>
          <p className="text-xs text-gray-400">✓ Active</p>
        </div>
        <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats.scaffolded}</p>
          <p className="text-xs text-gray-400">○ Scaffolded</p>
        </div>
        <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.deprecated}</p>
          <p className="text-xs text-gray-400">✗ Deprecated</p>
        </div>
      </div>

      {/* CEO Card */}
      <div className="flex justify-center">
        <div className="bg-gradient-to-b from-amber-900/30 to-[#1e2433] border border-amber-600/50 rounded-xl p-4 w-64 text-center">
          <span className="text-3xl">{orgData.ceo.emoji}</span>
          <p className="text-[10px] text-amber-400 mt-1">CEO</p>
          <h3 className="text-lg font-bold text-amber-100">{orgData.ceo.name}</h3>
          <p className="text-xs text-gray-400">{orgData.ceo.description}</p>
        </div>
      </div>

      {/* Connection Line */}
      <div className="flex justify-center">
        <div className="w-px h-8 bg-amber-700/50"></div>
      </div>

      {/* COO Card */}
      <div className="flex justify-center">
        <div className="bg-gradient-to-b from-green-900/20 to-[#1e2433] border border-green-600/30 rounded-xl p-4 w-80 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl">{orgData.coo.emoji}</span>
            <span className="text-[10px] bg-green-900/50 text-green-300 px-2 py-0.5 rounded">
              {orgData.coo.model}
            </span>
          </div>
          <p className="text-[10px] text-green-400 mt-1">COO</p>
          <h3 className="text-lg font-bold text-green-100">{orgData.coo.name}</h3>
          <p className="text-xs text-gray-400">{orgData.coo.description}</p>
        </div>
      </div>

      {/* Connection Lines to Departments */}
      <div className="flex justify-center">
        <div className="flex items-end">
          <div className="w-32 h-px bg-amber-700/50"></div>
          <div className="w-px h-8 bg-amber-700/50"></div>
          <div className="w-64 h-px bg-amber-700/50"></div>
          <div className="w-px h-8 bg-amber-700/50"></div>
          <div className="w-32 h-px bg-amber-700/50"></div>
        </div>
      </div>

      {/* Department Heads */}
      <div className="grid grid-cols-3 gap-4">
        {orgData.departments.map(dept => (
          <DepartmentColumn key={dept.id} dept={dept} />
        ))}
      </div>
    </div>
  )
}
