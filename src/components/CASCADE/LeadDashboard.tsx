import { useState, useEffect } from 'react'
import { Phone, Mail, Calendar, TrendingUp, Users, MessageSquare } from 'lucide-react'

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'booking' | 'booked' | 'completed' | 'lost'
type LeadSource = 'missed_call' | 'web_form' | 'referral'

interface Lead {
  id: string
  phone: string
  name: string | null
  source: LeadSource
  status: LeadStatus
  conversation_history: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }>
  created_at: string
  updated_at: string
  last_contact: string | null
}

interface LeadDashboardProps {
  onLoadLeads: (status?: LeadStatus) => Promise<Lead[]>
  onLeadClick?: (lead: Lead) => void
}

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-blue-500',
  contacted: 'bg-yellow-500',
  qualified: 'bg-purple-500',
  booking: 'bg-orange-500',
  booked: 'bg-green-500',
  completed: 'bg-gray-500',
  lost: 'bg-red-500'
}

const sourceIcons: Record<LeadSource, typeof Phone> = {
  missed_call: Phone,
  web_form: Mail,
  referral: Users
}

export default function LeadDashboard({ onLoadLeads, onLeadClick }: LeadDashboardProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedStatus, setSelectedStatus] = useState<LeadStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    booked: 0,
    conversionRate: 0
  })

  useEffect(() => {
    loadLeads()
  }, [selectedStatus])

  const loadLeads = async () => {
    setLoading(true)
    try {
      const statusFilter = selectedStatus === 'all' ? undefined : selectedStatus
      const data = await onLoadLeads(statusFilter)
      setLeads(data)
      
      // Calculate stats
      const total = data.length
      const newLeads = data.filter(l => l.status === 'new').length
      const contacted = data.filter(l => l.status === 'contacted').length
      const qualified = data.filter(l => l.status === 'qualified').length
      const booked = data.filter(l => ['booked', 'completed'].includes(l.status)).length
      const conversionRate = total > 0 ? (booked / total) * 100 : 0
      
      setStats({
        total,
        new: newLeads,
        contacted,
        qualified,
        booked,
        conversionRate
      })
    } catch (error) {
      console.error('Failed to load leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const getTimeSince = (date: string) => {
    const now = Date.now()
    const then = new Date(date).getTime()
    const diff = now - then
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(date).toLocaleDateString()
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Stats Cards */}
      <div className="p-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Total Leads</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">New</span>
            <div className="w-3 h-3 rounded-full bg-blue-500" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.new}</p>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Contacted</span>
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.contacted}</p>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Qualified</span>
            <div className="w-3 h-3 rounded-full bg-purple-500" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.qualified}</p>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Conversion</span>
            <Calendar className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.conversionRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Status Filter */}
      <div className="px-4 pb-4 flex gap-2 overflow-x-auto">
        {['all', 'new', 'contacted', 'qualified', 'booking', 'booked', 'completed', 'lost'].map((status) => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              selectedStatus === status
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Leads List */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="w-16 h-16 mb-4 opacity-20" />
            <p>No leads found</p>
          </div>
        ) : (
          leads.map((lead) => {
            const SourceIcon = sourceIcons[lead.source]
            return (
              <div
                key={lead.id}
                onClick={() => onLeadClick?.(lead)}
                className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-750 transition-colors border border-transparent hover:border-cyan-500/30"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${statusColors[lead.status]}`} />
                    <div>
                      <h3 className="text-white font-medium">
                        {lead.name || lead.phone}
                      </h3>
                      <p className="text-sm text-gray-400">{lead.phone}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{getTimeSince(lead.created_at)}</span>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <div className="flex items-center gap-1">
                    <SourceIcon className="w-4 h-4" />
                    <span>{lead.source.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" />
                    <span>{lead.conversation_history.length} messages</span>
                  </div>
                  {lead.last_contact && (
                    <div className="flex items-center gap-1">
                      <span>Last contact: {getTimeSince(lead.last_contact)}</span>
                    </div>
                  )}
                </div>

                {lead.conversation_history.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <p className="text-sm text-gray-300 line-clamp-2">
                      {lead.conversation_history[lead.conversation_history.length - 1].content}
                    </p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
