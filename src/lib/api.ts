const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || 'Request failed')
    }

    return response.json()
  }

  // Memory API
  memory = {
    list: (options?: { agentId?: string; limit?: number }) =>
      this.request<{
        success: boolean
        memories: Array<{
          id: string
          agent_id: string
          content: string
          strength: number
          tags: string[] | null
          metadata: Record<string, any>
          created_at: string
          last_accessed: string
          decay_rate: number
        }>
        count: number
      }>(`/api/memory/all${options ? `?${new URLSearchParams(
        Object.fromEntries(
          Object.entries(options).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
        )
      ).toString()}` : ''}`),

    store: (data: {
      agentId: string
      content: string
      strength?: number
      metadata?: Record<string, any>
      tags?: string[]
      decayRate?: number
    }) => this.request('/api/memory/store', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    search: (data: {
      query: string
      agentId?: string
      threshold?: number
      limit?: number
    }) => this.request<{
      success: boolean
      results: Array<{
        id: string
        agent_id: string
        content: string
        similarity: number
        strength: number
        tags: string[]
        metadata: Record<string, any>
        created_at: string
        last_accessed: string
      }>
    }>('/api/memory/search', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    unifiedSearch: (data: {
      query: string
      agentId?: string
      threshold?: number
      limit?: number
    }) => this.request<{
      success: boolean
      results: Array<{
        id: string
        source: 'vector' | 'filesystem'
        content: string
        similarity: number | null
        strength: number | null
        metadata: Record<string, any>
        created_at: string
      }>
      count: number
    }>('/api/memory/unified-search', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    reinforce: (memoryId: string, strengthDelta = 0.1) =>
      this.request(`/api/memory/reinforce/${memoryId}`, {
        method: 'POST',
        body: JSON.stringify({ strengthDelta })
      }),

    decay: (agentId: string) =>
      this.request(`/api/memory/decay/${agentId}`, { method: 'POST' }),

    prune: (agentId: string, threshold = 0.1) =>
      this.request(`/api/memory/prune/${agentId}`, {
        method: 'POST',
        body: JSON.stringify({ threshold })
      })
  }

  // Swarm API
  swarm = {
    create: (data: {
      name: string
      strategy: 'hierarchical' | 'mesh' | 'adaptive'
      topology: any
    }) => this.request('/api/swarm/create', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    addAgent: (data: {
      swarmId: string
      agentId: string
      role: string
    }) => this.request('/api/swarm/add-agent', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    updateStatus: (swarmId: string, status: string) =>
      this.request(`/api/swarm/${swarmId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      }),

    assignTask: (data: {
      swarmAgentId: string
      task: Record<string, any>
    }) => this.request('/api/swarm/assign-task', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    get: (swarmId: string) =>
      this.request(`/api/swarm/${swarmId}`, { method: 'GET' }),

    getAgentsByStatus: (swarmId: string, status: string) =>
      this.request(`/api/swarm/${swarmId}/agents/${status}`, { method: 'GET' }),

    updatePerformance: (agentId: string, metrics: Record<string, any>) =>
      this.request(`/api/swarm/agent/${agentId}/performance`, {
        method: 'PUT',
        body: JSON.stringify({ metrics })
      }),

    completeTask: (agentId: string) =>
      this.request(`/api/swarm/agent/${agentId}/complete`, { method: 'POST' })
  }

  // CASCADE API
  cascade = {
    createLead: (data: {
      phone: string
      name?: string
      source: 'missed_call' | 'web_form' | 'referral'
      memoryId?: string
      swarmId?: string
    }) => this.request('/api/cascade/lead', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    updateLead: (leadId: string, updates: any) =>
      this.request(`/api/cascade/lead/${leadId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      }),

    addMessage: (leadId: string, data: {
      role: 'user' | 'assistant'
      content: string
    }) => this.request(`/api/cascade/lead/${leadId}/message`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    createBooking: (data: {
      leadId: string
      serviceType: string
      scheduledDate: string
    }) => this.request('/api/cascade/booking', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    updateBooking: (bookingId: string, status: string) =>
      this.request(`/api/cascade/booking/${bookingId}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      }),

    scheduleNurture: (data: {
      leadId: string
      sequenceType: 'booking_reminder' | 'follow_up' | 'reengagement'
      channel: 'sms' | 'email' | 'voice'
      step: number
      scheduledTime: string
    }) => this.request('/api/cascade/nurture', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    getPendingNurture: () =>
      this.request('/api/cascade/nurture/pending', { method: 'GET' }),

    markNurtureSent: (messageId: string, response?: Record<string, any>) =>
      this.request(`/api/cascade/nurture/${messageId}/sent`, {
        method: 'PUT',
        body: JSON.stringify({ response })
      }),

    getLeadByPhone: (phone: string) =>
      this.request(`/api/cascade/lead/phone/${phone}`, { method: 'GET' }),

    getLeadsByStatus: (status: string) =>
      this.request<{
        success: boolean
        leads: Array<any>
      }>(`/api/cascade/leads/${status}`, { method: 'GET' }),

    getAllLeads: () =>
      this.request<{
        success: boolean
        leads: Array<any>
      }>('/api/cascade/leads', { method: 'GET' })
  }

  // Config / Manifest API
  config = {
    manifest: () =>
      this.request<{
        workspace: string
        memoryRoot: string
        agents: Array<{ id: string; name: string; directory: string; type: string; description?: string }>
        dataSources: Array<{ type: string; path: string; dirs?: string[] }>
        vectorStore: { provider: string; embeddingModel: string; dimensions: number }
        embedder: { enabled: boolean; pollIntervalMs: number; maxContentLength: number }
      }>('/api/config/manifest'),

    agents: () =>
      this.request<{
        agents: Array<{ id: string; name: string; directory: string; type: string; description?: string }>
      }>('/api/config/agents'),

    reload: () =>
      this.request<{ reloaded: boolean; agentCount: number; dataSourceCount: number }>('/api/config/reload', {
        method: 'POST'
      })
  }

  // Health check
  health = () => this.request('/health', { method: 'GET' })
}

export const api = new ApiClient(API_BASE)
export default api
