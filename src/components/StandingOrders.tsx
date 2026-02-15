import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, X, AlertCircle, ShieldCheck } from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

interface StandingOrder {
  id: string
  name: string
  condition: string
  action: string
  enabled: boolean
  createdAt: string
  lastTriggered: string | null
  triggerCount: number
}

export default function StandingOrders() {
  const [orders, setOrders] = useState<StandingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formCondition, setFormCondition] = useState('')
  const [formAction, setFormAction] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function fetchOrders() {
    try {
      const res = await fetch(`${API_BASE}/erismorn/standing-orders`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      setOrders(data.orders || [])
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Failed to fetch standing orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim() || !formCondition.trim() || !formAction.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/erismorn/standing-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          condition: formCondition.trim(),
          action: formAction.trim(),
          enabled: true
        })
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      setFormName('')
      setFormCondition('')
      setFormAction('')
      setShowForm(false)
      await fetchOrders()
    } catch (e: any) {
      setError(e.message || 'Failed to create order')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(id: string, currentEnabled: boolean) {
    setTogglingId(id)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/erismorn/standing-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      setOrders(prev =>
        prev.map(o => o.id === id ? { ...o, enabled: !currentEnabled } : o)
      )
    } catch (e: any) {
      setError(e.message || 'Failed to toggle order')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/erismorn/standing-orders/${id}`, {
        method: 'DELETE'
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (e: any) {
      setError(e.message || 'Failed to delete order')
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(ts: string | null) {
    if (!ts) return 'Never'
    try {
      return new Date(ts).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    } catch {
      return ts
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading standing orders...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-100">Standing Orders</h2>
          <p className="text-xs text-gray-500">Autonomous behaviors — IF condition THEN action</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-700 hover:bg-green-600 rounded-lg text-white transition-colors"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Cancel' : 'Add Order'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-[#1e2433] border border-green-900/30 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Order Name</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="e.g. Auto-escalate critical alerts"
              className="w-full bg-[#0f1219] border border-amber-900/30 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-700/50 focus:ring-1 focus:ring-green-700/30"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              IF <span className="text-green-400">(condition)</span>
            </label>
            <input
              type="text"
              value={formCondition}
              onChange={e => setFormCondition(e.target.value)}
              placeholder="e.g. BTC price drops below $50,000"
              className="w-full bg-[#0f1219] border border-amber-900/30 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-700/50 focus:ring-1 focus:ring-green-700/30"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              THEN <span className="text-amber-400">(action)</span>
            </label>
            <input
              type="text"
              value={formAction}
              onChange={e => setFormAction(e.target.value)}
              placeholder="e.g. Send alert to Telegram + log to diary"
              className="w-full bg-[#0f1219] border border-amber-900/30 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-700/50 focus:ring-1 focus:ring-green-700/30"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !formName.trim() || !formCondition.trim() || !formAction.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white transition-colors"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create Order
            </button>
          </div>
        </form>
      )}

      {/* Orders List */}
      {orders.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
          <ShieldCheck className="w-10 h-10 mb-3 text-gray-600" />
          <p className="text-sm">No standing orders</p>
          <p className="text-xs text-gray-600 mt-1">Create autonomous IF/THEN rules for ErisMorn</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div
              key={order.id}
              className={`bg-[#1e2433] border rounded-lg p-4 transition-colors ${
                order.enabled
                  ? 'border-green-900/30 hover:border-green-700/40'
                  : 'border-gray-700/30 opacity-60 hover:border-gray-600/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Name + Status */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-medium text-amber-100 truncate">{order.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      order.enabled
                        ? 'bg-green-900/30 text-green-300 border-green-700/30'
                        : 'bg-red-900/30 text-red-300 border-red-700/30'
                    }`}>
                      {order.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  {/* Condition & Action */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-green-400 font-mono flex-shrink-0">IF</span>
                      <span className="text-gray-300">{order.condition}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 font-mono flex-shrink-0">THEN</span>
                      <span className="text-gray-300">{order.action}</span>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-600">
                    <span>Triggered {order.triggerCount}x</span>
                    <span>Last: {formatDate(order.lastTriggered)}</span>
                    <span>Created: {formatDate(order.createdAt)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(order.id, order.enabled)}
                    disabled={togglingId === order.id}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      order.enabled ? 'bg-green-700' : 'bg-gray-600'
                    } ${togglingId === order.id ? 'opacity-50' : ''}`}
                    title={order.enabled ? 'Disable' : 'Enable'}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      order.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(order.id)}
                    disabled={deletingId === order.id}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                    title="Delete order"
                  >
                    {deletingId === order.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
