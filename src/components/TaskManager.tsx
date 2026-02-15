import { useState, useEffect } from 'react'
import { Cpu, Zap, DollarSign, Clock, CheckCircle, AlertTriangle, Activity } from 'lucide-react'
import * as api from '../lib/api'

interface ActiveSession {
  id: string
  name: string
  models: string[]
  lastMessage: string
  tokens: string
  cost: string
  timestamp: string
  status: 'active' | 'idle' | 'error'
}

function ProviderCard({ provider, name, status, models }: { provider: string; name: string; status: string; models: api.ModelInfo[] }) {
  const statusColor = status === 'active' ? 'text-green-400' : 
                      status === 'error' ? 'text-red-400' : 'text-yellow-400'
  
  const getProviderIcon = () => {
    if (provider === 'anthropic') return '🧠'
    if (provider === 'ollama') return '🦙'
    if (provider === 'lmstudio') return '🔧'
    if (provider === 'google') return '🔷'
    if (provider === 'openai') return '🤖'
    if (provider === 'elevenlabs') return '🎙️'
    return '⚡'
  }
  
  return (
    <div className="bg-[#1e2433] border border-amber-900/30 rounded-lg p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getProviderIcon()}</span>
          <div>
            <h3 className="font-semibold text-amber-100 text-sm">{name}</h3>
            <span className={`text-[10px] ${statusColor}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
        <span className="text-xs bg-amber-900/30 text-amber-300 px-2 py-0.5 rounded">
          {models.length} models
        </span>
      </div>
      
      <div className="space-y-1.5 mt-2">
        {models.slice(0, 4).map((model, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              {model.reasoning && <span className="text-purple-400" title="Reasoning">🧪</span>}
              {model.vision && <span className="text-blue-400" title="Vision">👁️</span>}
              <span className="text-gray-300 truncate max-w-[120px]">{model.name}</span>
            </div>
            <span className={`font-mono ${model.cost === 'free' ? 'text-green-400' : 'text-amber-400'}`}>
              {model.cost === 'free' ? '$0' : model.cost}
            </span>
          </div>
        ))}
        {models.length > 4 && (
          <span className="text-[10px] text-gray-500">+{models.length - 4} more</span>
        )}
      </div>
    </div>
  )
}

function SessionCard({ session }: { session: ActiveSession }) {
  const statusIcon = session.status === 'active' ? <Activity className="w-3 h-3 text-green-400" /> :
                     session.status === 'error' ? <AlertTriangle className="w-3 h-3 text-red-400" /> :
                     <Clock className="w-3 h-3 text-yellow-400" />

  return (
    <div className="bg-[#252b3b] border border-gray-700/50 rounded-lg p-3 hover:border-amber-700/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-sm text-gray-100">{session.name}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400 font-mono">{session.tokens}</span>
          <span className="text-xs text-amber-400 font-mono ml-2">{session.cost}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-2">
        {session.models.map((model, i) => (
          <span key={i} className="text-[10px] bg-amber-900/30 text-amber-300 px-2 py-0.5 rounded">
            {model}
          </span>
        ))}
        <span className="text-[10px] text-gray-500 ml-auto">{session.timestamp}</span>
      </div>
      
      <div className="mt-2 text-xs text-gray-400 truncate">
        {session.lastMessage}
      </div>
    </div>
  )
}

function CronJobRow({ job }: { job: api.CronJob }) {
  const getStatusBadge = () => {
    if (!job.state) return <span className="text-yellow-400">⏳ Pending</span>
    if (job.state.lastStatus === 'ok') return <span className="text-green-400">✓ OK</span>
    if (job.state.lastStatus === 'error') return <span className="text-red-400">✗ Error</span>
    return <span className="text-yellow-400">○ Idle</span>
  }

  const getScheduleText = () => {
    if (job.schedule.kind === 'every') {
      const mins = (job.schedule.everyMs || 0) / 60000
      if (mins >= 60) return `Every ${Math.round(mins/60)}h`
      return `Every ${mins}m`
    }
    if (job.schedule.kind === 'cron') return job.schedule.expr || 'cron'
    return job.schedule.kind
  }

  const getCategory = () => {
    const name = job.name.toLowerCase()
    if (name.includes('sentinel') || name.includes('security')) return { label: 'SECURITY', color: 'bg-red-900/50 text-red-300' }
    if (name.includes('curator') || name.includes('memory') || name.includes('compressor')) return { label: 'MEMORY', color: 'bg-purple-900/50 text-purple-300' }
    if (name.includes('scout') || name.includes('synthesizer')) return { label: 'RESEARCH', color: 'bg-blue-900/50 text-blue-300' }
    if (name.includes('income') || name.includes('trading') || name.includes('portfolio') || name.includes('btc')) return { label: 'FINANCE', color: 'bg-green-900/50 text-green-300' }
    if (name.includes('voltamachine') || name.includes('index')) return { label: 'KNOWLEDGE', color: 'bg-amber-900/50 text-amber-300' }
    return { label: 'OPS', color: 'bg-gray-700/50 text-gray-300' }
  }

  const cat = getCategory()

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-800/50 last:border-0 hover:bg-[#252b3b]/50 px-2 -mx-2 rounded transition-colors">
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full ${job.state?.lastStatus === 'ok' ? 'bg-green-400' : job.state?.lastStatus === 'error' ? 'bg-red-400' : 'bg-yellow-400'}`}></span>
        <div>
          <h4 className="text-sm text-gray-100">{job.name}</h4>
          <p className="text-[10px] text-gray-500">{getScheduleText()}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <span className={`text-[10px] px-2 py-0.5 rounded ${cat.color}`}>{cat.label}</span>
        {getStatusBadge()}
      </div>
    </div>
  )
}

export default function TaskManager() {
  const [cronJobs, setCronJobs] = useState<api.CronJob[]>([])
  const [modelsFleet, setModelsFleet] = useState<api.ModelsFleet | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [cronData, fleetData] = await Promise.all([
        api.fetchCronJobs(),
        api.fetchModelsFleet()
      ])
      setCronJobs(cronData.jobs || [])
      setModelsFleet(fleetData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Mock sessions for now
  const activeSessions: ActiveSession[] = [
    {
      id: '1',
      name: 'Main Session — ErisMorn',
      models: ['claude-opus-4.5'],
      lastMessage: 'Building ErisMorn OS dashboard...',
      tokens: '156K',
      cost: '$12.40',
      timestamp: 'just now',
      status: 'active'
    },
    {
      id: '2',
      name: 'Cron: Voltamachine Indexer',
      models: ['claude-haiku-4.5'],
      lastMessage: 'Indexed 683 documents. No new discoveries.',
      tokens: '23K',
      cost: '$0.05',
      timestamp: '12m ago',
      status: 'idle'
    },
    {
      id: '3',
      name: 'Cron: SENTINEL Monitor',
      models: ['claude-haiku-4.5'],
      lastMessage: 'Portfolio margin gap alert sent to main session.',
      tokens: '45K',
      cost: '$0.09',
      timestamp: '48m ago',
      status: 'idle'
    }
  ]

  const dailyJobs = cronJobs.filter(j => j.schedule.kind === 'every' || (j.schedule.kind === 'cron' && !j.schedule.expr?.includes('* *')))
  const weeklyJobs = cronJobs.filter(j => j.schedule.kind === 'cron' && (j.schedule.expr?.includes('1') || j.schedule.expr?.includes('1,3,5')))

  return (
    <div className="space-y-6">
      {/* Model Fleet */}
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-amber-300 mb-3">
          <Cpu className="w-4 h-4" />
          Model Fleet
          {modelsFleet?.summary && (
            <span className="text-xs bg-amber-900/50 text-amber-200 px-2 py-0.5 rounded ml-2">
              {modelsFleet.summary.totalModels} models • {modelsFleet.summary.localModels} local
            </span>
          )}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {modelsFleet?.providers && Object.entries(modelsFleet.providers).map(([key, provider]) => (
            <ProviderCard 
              key={key}
              provider={key}
              name={provider.name}
              status={provider.status}
              models={provider.models}
            />
          ))}
        </div>
      </div>

      {/* Active Sessions */}
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-amber-300 mb-3">
          <Activity className="w-4 h-4" />
          Active Sessions
          <span className="text-xs bg-amber-900/50 text-amber-200 px-2 py-0.5 rounded ml-2">
            {activeSessions.length}
          </span>
        </h2>
        <div className="space-y-2">
          {activeSessions.map(session => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      </div>

      {/* Cron Monitor */}
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-amber-300 mb-3">
          <Clock className="w-4 h-4" />
          Cron Monitor
          <span className="text-xs bg-amber-900/50 text-amber-200 px-2 py-0.5 rounded ml-2">
            {cronJobs.length}
          </span>
        </h2>
        
        <div className="bg-[#1e2433] border border-amber-900/30 rounded-lg p-4">
          {loading ? (
            <p className="text-gray-400 text-sm">Loading cron jobs...</p>
          ) : (
            <>
              <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Daily Jobs</h3>
              <div className="space-y-0">
                {dailyJobs.map(job => (
                  <CronJobRow key={job.id} job={job} />
                ))}
              </div>
              
              {weeklyJobs.length > 0 && (
                <>
                  <h3 className="text-xs text-gray-400 uppercase tracking-wider mt-4 mb-2">Weekly Jobs</h3>
                  <div className="space-y-0">
                    {weeklyJobs.map(job => (
                      <CronJobRow key={job.id} job={job} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
