import { useEffect, useState } from 'react'
import { Activity, Zap, TrendingUp, AlertTriangle } from 'lucide-react'
import { CyberCard } from './cyber/CyberCard'
import { StatusBadge } from './cyber/StatusBadge'

interface ErisMornStatus {
  connected: boolean
  heartbeat: any
  btcPrice: number | null
  cronJobs: number
  criticalAlerts: string[]
}

const API_BASE = 'http://localhost:3001/api'

export function ErisMornStatus() {
  const [status, setStatus] = useState<ErisMornStatus>({
    connected: false,
    heartbeat: null,
    btcPrice: null,
    cronJobs: 0,
    criticalAlerts: []
  })

  useEffect(() => {
    async function fetchStatus() {
      try {
        const [statusRes, btcRes, cronRes] = await Promise.all([
          fetch(`${API_BASE}/status`),
          fetch(`${API_BASE}/btc-price`),
          fetch(`${API_BASE}/cron-jobs`)
        ])

        const statusData = await statusRes.json()
        const btcData = await btcRes.json()
        const cronData = await cronRes.json()

        setStatus({
          connected: true,
          heartbeat: statusData.heartbeatState,
          btcPrice: btcData.price,
          cronJobs: cronData.jobs?.length || 0,
          criticalAlerts: statusData.heartbeatState?.criticalAlerts || []
        })
      } catch (e) {
        setStatus(prev => ({ ...prev, connected: false }))
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 30000) // Refresh every 30s

    return () => clearInterval(interval)
  }, [])

  return (
    <CyberCard variant="cyan" glow className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold font-['Fira_Code'] text-neon-cyan flex items-center gap-2">
          <Activity className="w-6 h-6" />
          ERISMORN CONNECTION
        </h2>
        <StatusBadge status={status.connected ? 'active' : 'error'} pulse>
          {status.connected ? 'ONLINE' : 'OFFLINE'}
        </StatusBadge>
      </div>

      {status.connected && (
        <div className="space-y-4">
          {/* BTC Price */}
          <div className="flex items-center justify-between p-3 bg-bg-layer-2 clip-angle-left">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-neon-green" />
              <span className="text-sm font-['Fira_Code'] text-gray-400">BTC PRICE</span>
            </div>
            <span className="text-lg font-bold text-neon-green">
              ${status.btcPrice?.toLocaleString() || '---'}
            </span>
          </div>

          {/* Cron Jobs */}
          <div className="flex items-center justify-between p-3 bg-bg-layer-2 clip-angle-left">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-neon-cyan" />
              <span className="text-sm font-['Fira_Code'] text-gray-400">ACTIVE AGENTS</span>
            </div>
            <span className="text-lg font-bold text-neon-cyan">
              {status.cronJobs}
            </span>
          </div>

          {/* Critical Alerts */}
          {status.criticalAlerts.length > 0 && (
            <div className="p-3 bg-bg-layer-2 clip-angle-left">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-neon-pink" />
                <span className="text-sm font-['Fira_Code'] text-gray-400">CRITICAL ALERTS</span>
              </div>
              <div className="space-y-1">
                {status.criticalAlerts.slice(0, 3).map((alert, i) => (
                  <div key={i} className="text-xs font-['Fira_Code'] text-gray-300 truncate">
                    {alert}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last Update */}
          <div className="text-center text-xs text-gray-600 font-['Fira_Code']">
            Last update: {new Date().toLocaleTimeString()}
          </div>
        </div>
      )}

      {!status.connected && (
        <div className="text-center py-8">
          <AlertTriangle className="w-12 h-12 text-neon-red mx-auto mb-4 animate-pulse" />
          <p className="text-sm text-gray-400 font-['Fira_Code']">
            Backend server not responding
          </p>
          <p className="text-xs text-gray-600 mt-2 font-['Fira_Code']">
            Run: <code className="text-neon-cyan">cd server && npm run dev</code>
          </p>
        </div>
      )}
    </CyberCard>
  )
}
