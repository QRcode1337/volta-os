# AgentForge x Volta OS x CASCADE Integration Design

**Date**: 2026-02-15
**Status**: Approved
**Strategy**: Plugin Architecture - Absorb AgentForge and CASCADE into Volta OS

---

## Executive Summary

This design absorbs AgentForge's AI memory and swarm capabilities and CASCADE's business automation into Volta OS as a unified AI operations platform. The plugin architecture eliminates AgentForge as a separate product, positioning Volta OS as the shippable platform.

**Strategic Vision**: Volta OS becomes the command center that orchestrates AgentForge swarms running CASCADE workflows, all within a single cyberpunk brutalist interface.

---

## Section 1: Navigation & Interface Structure

### Main Navigation (5 Sections)

#### 1. **Brain** (Knowledge & Intelligence)
- **Memory Inspector** - Explore agent memory with 3D Vector Galaxy visualization
- **Memory Search** - Semantic search across all agent memories (HNSW-powered)
- **Claude Code Integration** - Direct ErisMorn session integration (existing)
- **Files & Projects** - Integrated file browser (existing)

#### 2. **Labs** (Experimentation & AI)
- **Swarm Builder** - Design and configure multi-agent teams
- **Swarm Simulations** - Test swarm strategies (hierarchical, mesh, adaptive)
- **Memory Experiments** - Test decay rates, strength patterns, temporal dynamics
- **Intelligence Panel** - Agent capability mapping (existing)
- **Prototypes** - Rapid prototyping environment (existing)

#### 3. **Ops** (Operations & Monitoring)
- **Task Manager** - Multi-agent task orchestration (existing, enhanced with swarm support)
- **Agent Control** - Lifecycle management (existing, + swarm coordination)
- **Observability Dashboard** - Real-time metrics (existing, + memory/swarm metrics)
- **CASCADE Workflows** - Business automation pipelines (NEW)
- **Token & Cost Tracking** - Enhanced with memory operation costs (existing)

#### 4. **Command** (Control Center)
- **ErisMorn Console** - Main COO agent communication (existing)
- **Swarm Control** - Deploy and manage active swarms (NEW)
- **CASCADE Control Panel** - Lead capture, booking, nurture controls (NEW)
- **Decision Feed** - Real-time decisions from all agents (existing)
- **Standing Orders** - Persistent agent directives (existing)

#### 5. **CASCADE** (Business Automation)
- **Lead Dashboard** - Missed call capture pipeline
- **Booking Manager** - Smart scheduling and confirmations
- **Nurture Campaigns** - Multi-channel follow-up sequences
- **Analytics** - Revenue attribution and conversion metrics

---

## Section 2: Database Schema & API Architecture

### Database (Supabase PostgreSQL + pgvector)

#### Core Tables

```sql
-- AgentForge Memory Engine
CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  strength FLOAT DEFAULT 1.0 CHECK (strength BETWEEN 0.0 AND 1.0),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW(),
  decay_rate FLOAT DEFAULT 0.1,
  tags TEXT[]
);

CREATE INDEX idx_agent_memories_hnsw ON agent_memories
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_agent_memories_agent ON agent_memories (agent_id);
CREATE INDEX idx_agent_memories_strength ON agent_memories (strength DESC);

-- AgentForge Swarms
CREATE TABLE swarms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  strategy TEXT CHECK (strategy IN ('hierarchical', 'mesh', 'adaptive')),
  topology JSONB NOT NULL,
  status TEXT CHECK (status IN ('idle', 'active', 'paused', 'completed')),
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE swarm_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID REFERENCES swarms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT CHECK (status IN ('idle', 'working', 'blocked', 'completed')),
  current_task JSONB,
  performance JSONB DEFAULT '{}'
);

-- CASCADE Business Automation
CREATE TABLE cascade_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  name TEXT,
  source TEXT, -- 'missed_call', 'web_form', 'referral'
  status TEXT CHECK (status IN ('new', 'contacted', 'qualified', 'booking', 'booked', 'completed', 'lost')),
  conversation_history JSONB DEFAULT '[]',
  memory_id UUID REFERENCES agent_memories(id), -- Links to agent memory
  assigned_swarm_id UUID REFERENCES swarms(id), -- Which swarm is handling this lead
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_contact TIMESTAMP
);

CREATE TABLE cascade_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES cascade_leads(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  scheduled_date TIMESTAMP NOT NULL,
  status TEXT CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  confirmation_sent BOOLEAN DEFAULT FALSE,
  reminders_sent INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE cascade_nurture_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES cascade_leads(id) ON DELETE CASCADE,
  sequence_type TEXT, -- 'booking_reminder', 'follow_up', 'reengagement'
  channel TEXT CHECK (channel IN ('sms', 'email', 'voice')),
  step INTEGER NOT NULL,
  scheduled_time TIMESTAMP NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Vector Search Function

```sql
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INTEGER DEFAULT 10,
  filter_agent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  agent_id TEXT,
  content TEXT,
  similarity FLOAT,
  strength FLOAT,
  metadata JSONB,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.agent_id,
    m.content,
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.strength,
    m.metadata,
    m.created_at
  FROM agent_memories m
  WHERE
    (filter_agent_id IS NULL OR m.agent_id = filter_agent_id)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### API Routes (Express Backend on Port 3001)

#### AgentForge Memory Engine API

```typescript
// Memory Operations
POST   /api/memory/store        // Store new memory with embedding
POST   /api/memory/search       // Semantic search
GET    /api/memory/:id          // Get specific memory
PUT    /api/memory/:id/strength // Update memory strength
DELETE /api/memory/:id          // Delete memory
POST   /api/memory/decay        // Trigger decay process

// Swarm Operations
POST   /api/swarms/create       // Create new swarm
GET    /api/swarms              // List all swarms
GET    /api/swarms/:id          // Get swarm details
POST   /api/swarms/:id/start    // Start swarm execution
POST   /api/swarms/:id/pause    // Pause swarm
GET    /api/swarms/:id/metrics  // Get performance metrics
```

#### CASCADE Business Automation API

```typescript
// Lead Management
POST   /api/cascade/leads              // Create lead (from missed call)
GET    /api/cascade/leads              // List leads with filters
GET    /api/cascade/leads/:id          // Get lead details
PUT    /api/cascade/leads/:id/status   // Update lead status

// Booking Operations
POST   /api/cascade/bookings           // Create booking
GET    /api/cascade/bookings           // List bookings
PUT    /api/cascade/bookings/:id       // Update booking

// Nurture Sequences
POST   /api/cascade/nurture/trigger    // Start nurture sequence
GET    /api/cascade/nurture/:leadId    // Get sequence status
```

#### Integration Endpoints

```typescript
// Memory + CASCADE Integration
POST   /api/integration/lead-memory    // Create lead with memory storage
GET    /api/integration/lead-context/:id // Get lead with full memory context

// Swarm + CASCADE Integration
POST   /api/integration/assign-swarm   // Assign swarm to lead pipeline
GET    /api/integration/swarm-leads/:swarmId // Get all leads for swarm
```

### Real-time Subscriptions (Supabase)

```typescript
// Memory Updates
supabase
  .channel('memory-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'agent_memories'
  }, (payload) => handleMemoryUpdate(payload))
  .subscribe()

// Swarm Status
supabase
  .channel('swarm-status')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'swarms'
  }, (payload) => updateSwarmUI(payload))
  .subscribe()

// CASCADE Leads
supabase
  .channel('cascade-leads')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'cascade_leads'
  }, (payload) => handleLeadUpdate(payload))
  .subscribe()
```

---

## Section 3: Component Integration

### AgentForge Components

#### 1. VectorGalaxy.tsx (3D Memory Visualization)

```typescript
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'

interface Memory {
  id: string
  position: [number, number, number]
  strength: number
  agentId: string
  content: string
}

export function VectorGalaxy() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null)

  useEffect(() => {
    loadMemories()

    const subscription = supabase
      .channel('memory-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_memories'
      }, (payload) => {
        addMemoryPoint(payload.new)
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [])

  async function loadMemories() {
    const { data } = await fetch('/api/memory/visualization').then(r => r.json())
    setMemories(data)
  }

  return (
    <CyberCard variant="cyan" glow className="h-[800px]">
      <div className="h-full">
        <Canvas camera={{ position: [0, 0, 50] }}>
          <Stars />
          <OrbitControls />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />

          {memories.map(memory => (
            <MemoryPoint
              key={memory.id}
              memory={memory}
              onClick={() => setSelectedMemory(memory)}
            />
          ))}
        </Canvas>

        {selectedMemory && (
          <MemoryInspector memory={selectedMemory} />
        )}
      </div>
    </CyberCard>
  )
}
```

#### 2. MemorySearch.tsx (Semantic Search Interface)

```typescript
export function MemorySearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Memory[]>([])
  const [loading, setLoading] = useState(false)

  async function search() {
    setLoading(true)
    const response = await fetch('/api/memory/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        threshold: 0.7,
        limit: 20
      })
    })
    const data = await response.json()
    setResults(data.results)
    setLoading(false)
  }

  return (
    <CyberCard variant="green" glow>
      <CyberInput
        label="Search Agent Memory"
        placeholder="e.g., 'authentication bug fixes'"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && search()}
      />

      <CyberButton onClick={search} disabled={loading}>
        {loading ? 'Searching...' : 'Search'}
      </CyberButton>

      <div className="mt-6 space-y-4">
        {results.map(result => (
          <MemoryCard
            key={result.id}
            memory={result}
            similarity={result.similarity}
          />
        ))}
      </div>
    </CyberCard>
  )
}
```

#### 3. SwarmBuilder.tsx (Swarm Configuration)

```typescript
export function SwarmBuilder() {
  const [swarmConfig, setSwarmConfig] = useState({
    name: '',
    strategy: 'hierarchical' as 'hierarchical' | 'mesh' | 'adaptive',
    agents: [] as SwarmAgent[]
  })

  async function createSwarm() {
    const response = await fetch('/api/swarms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(swarmConfig)
    })
    const swarm = await response.json()

    // Navigate to swarm control panel
    router.push(`/command/swarm-control/${swarm.id}`)
  }

  return (
    <CyberCard variant="pink" glow>
      <h2 className="text-2xl font-bold mb-6">Build Swarm</h2>

      <CyberInput
        label="Swarm Name"
        value={swarmConfig.name}
        onChange={(e) => setSwarmConfig({...swarmConfig, name: e.target.value})}
      />

      <div className="mt-4">
        <label className="text-sm text-gray-400">Strategy</label>
        <select
          value={swarmConfig.strategy}
          onChange={(e) => setSwarmConfig({
            ...swarmConfig,
            strategy: e.target.value as any
          })}
          className="cyber-select"
        >
          <option value="hierarchical">Hierarchical (Queen + Workers)</option>
          <option value="mesh">Mesh (Peer-to-Peer)</option>
          <option value="adaptive">Adaptive (Dynamic)</option>
        </select>
      </div>

      <AgentSelector
        selected={swarmConfig.agents}
        onChange={(agents) => setSwarmConfig({...swarmConfig, agents})}
      />

      <CyberButton onClick={createSwarm} glitch>
        Deploy Swarm
      </CyberButton>
    </CyberCard>
  )
}
```

### CASCADE Components

#### 4. LeadDashboard.tsx (Missed Call Pipeline)

```typescript
export function LeadDashboard() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [filter, setFilter] = useState<'all' | 'new' | 'contacted' | 'booked'>('all')

  useEffect(() => {
    loadLeads()

    const subscription = supabase
      .channel('cascade-leads')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cascade_leads'
      }, (payload) => {
        handleLeadUpdate(payload)
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [filter])

  async function loadLeads() {
    const response = await fetch(`/api/cascade/leads?status=${filter}`)
    const data = await response.json()
    setLeads(data.leads)
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <StatusBadge status={filter === 'new' ? 'active' : 'idle'}>
          New Leads: {leads.filter(l => l.status === 'new').length}
        </StatusBadge>
        <StatusBadge status={filter === 'contacted' ? 'active' : 'idle'}>
          Contacted: {leads.filter(l => l.status === 'contacted').length}
        </StatusBadge>
        <StatusBadge status={filter === 'booked' ? 'active' : 'idle'}>
          Booked: {leads.filter(l => l.status === 'booked').length}
        </StatusBadge>
      </div>

      <CyberCard variant="cyan" glow>
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onStatusChange={(status) => updateLeadStatus(lead.id, status)}
          />
        ))}
      </CyberCard>
    </div>
  )
}
```

#### 5. BookingManager.tsx (Smart Scheduling)

```typescript
export function BookingManager() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())

  async function createBooking(leadId: string, date: Date, serviceType: string) {
    const response = await fetch('/api/cascade/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        scheduled_date: date.toISOString(),
        service_type: serviceType
      })
    })

    const booking = await response.json()

    // Trigger confirmation sequence
    await fetch('/api/cascade/nurture/trigger', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: leadId,
        sequence_type: 'booking_confirmation'
      })
    })

    setBookings([...bookings, booking])
  }

  return (
    <CyberCard variant="green" glow>
      <Calendar
        value={selectedDate}
        onChange={setSelectedDate}
        className="cyber-calendar"
      />

      <div className="mt-6 space-y-4">
        {bookings
          .filter(b => isSameDay(new Date(b.scheduled_date), selectedDate))
          .map(booking => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onConfirm={() => confirmBooking(booking.id)}
              onCancel={() => cancelBooking(booking.id)}
            />
          ))}
      </div>
    </CyberCard>
  )
}
```

### Memory Engine Service Layer

```typescript
// src/engine/memory/index.ts
import OpenAI from 'openai'
import { supabase } from '../db'

const openai = new OpenAI()

export class MemoryEngine {
  static async store(params: {
    agentId: string
    content: string
    metadata?: Record<string, any>
    tags?: string[]
  }) {
    // Generate embedding
    const embedding = await this.generateEmbedding(params.content)

    // Store in database
    const { data, error } = await supabase
      .from('agent_memories')
      .insert({
        agent_id: params.agentId,
        content: params.content,
        embedding,
        strength: 1.0,
        metadata: params.metadata || {},
        tags: params.tags || []
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  static async search(params: {
    query: string
    agentId?: string
    threshold?: number
    limit?: number
  }) {
    const queryEmbedding = await this.generateEmbedding(params.query)

    const { data, error } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_threshold: params.threshold || 0.7,
      match_count: params.limit || 10,
      filter_agent_id: params.agentId || null
    })

    if (error) throw error
    return data
  }

  static async decay() {
    // Apply temporal decay to all memories
    const { data: memories } = await supabase
      .from('agent_memories')
      .select('*')
      .gt('strength', 0.1) // Only process memories above threshold

    for (const memory of memories || []) {
      const timeSinceAccess = Date.now() - new Date(memory.last_accessed).getTime()
      const daysSinceAccess = timeSinceAccess / (1000 * 60 * 60 * 24)

      const newStrength = memory.strength * Math.exp(-memory.decay_rate * daysSinceAccess)

      if (newStrength < 0.1) {
        // Archive or delete weak memories
        await supabase.from('agent_memories').delete().eq('id', memory.id)
      } else {
        await supabase
          .from('agent_memories')
          .update({ strength: newStrength })
          .eq('id', memory.id)
      }
    }
  }

  private static async generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    })
    return response.data[0].embedding
  }
}
```

### Swarm Coordinator Service

```typescript
// src/engine/swarm/coordinator.ts
import { supabase } from '../db'
import { Task } from '@anthropic-ai/sdk'

export class SwarmCoordinator {
  static async createSwarm(config: {
    name: string
    strategy: 'hierarchical' | 'mesh' | 'adaptive'
    agents: Array<{ id: string, role: string }>
  }) {
    const topology = this.generateTopology(config.strategy, config.agents)

    const { data, error } = await supabase
      .from('swarms')
      .insert({
        name: config.name,
        strategy: config.strategy,
        topology,
        status: 'idle'
      })
      .select()
      .single()

    if (error) throw error

    // Create agent entries
    for (const agent of config.agents) {
      await supabase.from('swarm_agents').insert({
        swarm_id: data.id,
        agent_id: agent.id,
        role: agent.role,
        status: 'idle'
      })
    }

    return data
  }

  static async startSwarm(swarmId: string, task: any) {
    // Update swarm status
    await supabase
      .from('swarms')
      .update({ status: 'active' })
      .eq('id', swarmId)

    // Get swarm configuration
    const { data: swarm } = await supabase
      .from('swarms')
      .select('*, swarm_agents(*)')
      .eq('id', swarmId)
      .single()

    // Execute based on strategy
    if (swarm.strategy === 'hierarchical') {
      return this.executeHierarchical(swarm, task)
    } else if (swarm.strategy === 'mesh') {
      return this.executeMesh(swarm, task)
    } else {
      return this.executeAdaptive(swarm, task)
    }
  }

  private static generateTopology(strategy: string, agents: any[]) {
    if (strategy === 'hierarchical') {
      return {
        queen: agents[0].id,
        workers: agents.slice(1).map(a => a.id)
      }
    } else if (strategy === 'mesh') {
      return {
        peers: agents.map(a => a.id),
        connections: this.generateMeshConnections(agents)
      }
    } else {
      return {
        adaptive: true,
        agents: agents.map(a => a.id)
      }
    }
  }

  private static async executeHierarchical(swarm: any, task: any) {
    // Queen coordinates workers
    // Implementation depends on Claude Code Task tool integration
  }
}
```

---

## Section 4: CASCADE Workflow Integration

### Workflow 1: Lead Capture (Missed Call → Text-Back)

**Trigger**: Missed call detected via Twilio webhook

**Flow**:
1. **Webhook Handler** → Creates CASCADE lead in database
2. **Memory Engine** → Stores lead context as memory
3. **Swarm Assignment** → Assigns lead to available "Sales" swarm
4. **Text-Back Agent** → Sends immediate response via Twilio
5. **Conversation Memory** → Stores all SMS exchanges with embeddings
6. **Status Update** → Updates lead status to "contacted"

**Implementation**:

```typescript
// server/routes/cascade/webhook.ts
export async function handleMissedCall(req, res) {
  const { From: phone, CallSid } = req.body

  // 1. Create lead
  const { data: lead } = await supabase
    .from('cascade_leads')
    .insert({
      phone,
      source: 'missed_call',
      status: 'new',
      conversation_history: []
    })
    .select()
    .single()

  // 2. Store in memory
  const memory = await MemoryEngine.store({
    agentId: 'cascade-sales',
    content: `New lead from ${phone} via missed call. Call SID: ${CallSid}`,
    metadata: { lead_id: lead.id, source: 'missed_call' },
    tags: ['lead', 'missed_call', 'new']
  })

  // 3. Link memory to lead
  await supabase
    .from('cascade_leads')
    .update({ memory_id: memory.id })
    .eq('id', lead.id)

  // 4. Find or create sales swarm
  let { data: swarm } = await supabase
    .from('swarms')
    .select('*')
    .eq('name', 'Sales Team')
    .eq('status', 'active')
    .single()

  if (!swarm) {
    swarm = await SwarmCoordinator.createSwarm({
      name: 'Sales Team',
      strategy: 'hierarchical',
      agents: [
        { id: 'sales-queen', role: 'coordinator' },
        { id: 'text-responder', role: 'worker' },
        { id: 'qualifier', role: 'worker' }
      ]
    })
  }

  // 5. Assign lead to swarm
  await supabase
    .from('cascade_leads')
    .update({ assigned_swarm_id: swarm.id })
    .eq('id', lead.id)

  // 6. Send text-back
  await twilioClient.messages.create({
    to: phone,
    from: process.env.TWILIO_PHONE,
    body: "Thanks for calling! I'm running a special this month. When works best for a quick chat about your project?"
  })

  // 7. Update lead status
  await supabase
    .from('cascade_leads')
    .update({ status: 'contacted', last_contact: new Date().toISOString() })
    .eq('id', lead.id)

  res.json({ success: true, lead_id: lead.id })
}
```

### Workflow 2: Booking Flow (Qualification → Scheduling)

**Trigger**: Lead responds showing interest

**Flow**:
1. **SMS Response** → Received via Twilio webhook
2. **Memory Search** → Find lead context using phone number
3. **Conversation Analysis** → Agent analyzes intent (booking, question, objection)
4. **Qualification Check** → Determine if lead is qualified (budget, timeline, service match)
5. **Booking Offer** → If qualified, present available times
6. **Calendar Creation** → Create booking in system
7. **Confirmation Sequence** → Send confirmation SMS + email

**Implementation**:

```typescript
// server/routes/cascade/sms.ts
export async function handleSMSResponse(req, res) {
  const { From: phone, Body: message } = req.body

  // 1. Find lead
  const { data: lead } = await supabase
    .from('cascade_leads')
    .select('*, cascade_bookings(*)')
    .eq('phone', phone)
    .single()

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' })
  }

  // 2. Search memory for context
  const memoryContext = await MemoryEngine.search({
    query: `Conversation with ${phone}: ${message}`,
    agentId: 'cascade-sales',
    limit: 5
  })

  // 3. Store new message in memory
  await MemoryEngine.store({
    agentId: 'cascade-sales',
    content: `Lead ${phone} said: "${message}"`,
    metadata: { lead_id: lead.id, direction: 'inbound' },
    tags: ['sms', 'lead', lead.status]
  })

  // 4. Update conversation history
  const updatedHistory = [
    ...lead.conversation_history,
    { timestamp: new Date().toISOString(), from: 'lead', message }
  ]

  await supabase
    .from('cascade_leads')
    .update({ conversation_history: updatedHistory })
    .eq('id', lead.id)

  // 5. Analyze intent (using Claude via ErisMorn)
  const analysis = await analyzeIntent(message, memoryContext)

  if (analysis.intent === 'book' && analysis.qualified) {
    // 6. Offer booking times
    const availableTimes = await getAvailableTimes()
    const response = `Great! I have these times available this week: ${availableTimes}. Which works best?`

    await sendSMS(phone, response)

    await supabase
      .from('cascade_leads')
      .update({ status: 'booking' })
      .eq('id', lead.id)
  } else if (analysis.intent === 'question') {
    // Answer question
    const response = await generateResponse(message, memoryContext)
    await sendSMS(phone, response)
  }

  res.json({ success: true })
}

async function analyzeIntent(message: string, context: any[]) {
  // Use Claude Code or ErisMorn to analyze
  // Returns { intent: 'book' | 'question' | 'objection', qualified: boolean }

  const contextStr = context.map(m => m.content).join('\n')

  const prompt = `Based on this conversation context:
${contextStr}

Latest message: "${message}"

Analyze:
1. Intent (book, question, objection)
2. Is the lead qualified? (shows urgency, has budget signals, matches service)

Respond in JSON: { "intent": "...", "qualified": true/false, "reason": "..." }`

  // Call Claude API or use existing ErisMorn integration
  // For now, simplified logic:
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes('book') || lowerMessage.includes('schedule') || lowerMessage.includes('appointment')) {
    return { intent: 'book', qualified: true, reason: 'Direct booking request' }
  }

  return { intent: 'question', qualified: false, reason: 'Needs more qualification' }
}
```

### Workflow 3: Nurture Campaigns (Multi-Channel Follow-Up)

**Trigger**: Lead goes cold (no response in 48h) or booking needs reminder

**Flow**:
1. **Cron Job** → Checks for stale leads or upcoming bookings
2. **Sequence Trigger** → Creates nurture sequence in database
3. **Channel Selection** → Choose SMS, email, or voice based on history
4. **Personalized Message** → Use memory context to personalize
5. **Delivery Scheduling** → Queue messages with delays
6. **Response Tracking** → Monitor engagement
7. **Re-engagement** → If response, move back to active pipeline

**Implementation**:

```typescript
// server/cron/nurture.ts
import cron from 'node-cron'

// Run every 4 hours
cron.schedule('0 */4 * * *', async () => {
  console.log('Running nurture sequence check...')

  // 1. Find stale leads (no contact in 48h, status = 'contacted')
  const { data: staleLeads } = await supabase
    .from('cascade_leads')
    .select('*')
    .eq('status', 'contacted')
    .lt('last_contact', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())

  for (const lead of staleLeads || []) {
    await triggerNurtureSequence(lead, 'reengagement')
  }

  // 2. Find upcoming bookings (within 24h, not confirmed)
  const { data: upcomingBookings } = await supabase
    .from('cascade_bookings')
    .select('*, cascade_leads(*)')
    .eq('status', 'pending')
    .gte('scheduled_date', new Date().toISOString())
    .lte('scheduled_date', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
    .eq('confirmation_sent', false)

  for (const booking of upcomingBookings || []) {
    await triggerNurtureSequence(booking.cascade_leads, 'booking_reminder', {
      booking_id: booking.id,
      scheduled_date: booking.scheduled_date
    })
  }
})

async function triggerNurtureSequence(
  lead: any,
  sequenceType: 'reengagement' | 'booking_reminder' | 'follow_up',
  metadata?: any
) {
  // Get memory context for personalization
  const memoryContext = await MemoryEngine.search({
    query: `Lead ${lead.phone} conversation history`,
    agentId: 'cascade-sales',
    limit: 10
  })

  // Create sequence steps
  const steps = getNurtureSteps(sequenceType, memoryContext, metadata)

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const scheduledTime = new Date(Date.now() + step.delayHours * 60 * 60 * 1000)

    await supabase.from('cascade_nurture_sequences').insert({
      lead_id: lead.id,
      sequence_type: sequenceType,
      channel: step.channel,
      step: i + 1,
      scheduled_time: scheduledTime.toISOString(),
      sent: false
    })
  }

  console.log(`Created ${steps.length}-step ${sequenceType} sequence for lead ${lead.id}`)
}

function getNurtureSteps(type: string, context: any[], metadata?: any) {
  if (type === 'reengagement') {
    return [
      { channel: 'sms', delayHours: 0, template: 'reengagement_1' },
      { channel: 'email', delayHours: 24, template: 'reengagement_2' },
      { channel: 'sms', delayHours: 72, template: 'reengagement_final' }
    ]
  } else if (type === 'booking_reminder') {
    return [
      { channel: 'sms', delayHours: 0, template: 'booking_confirmation' },
      { channel: 'email', delayHours: 2, template: 'booking_details' }
    ]
  }
  return []
}

// Separate cron for sending scheduled messages
cron.schedule('*/15 * * * *', async () => {
  const { data: pendingMessages } = await supabase
    .from('cascade_nurture_sequences')
    .select('*, cascade_leads(*)')
    .eq('sent', false)
    .lte('scheduled_time', new Date().toISOString())

  for (const msg of pendingMessages || []) {
    await sendNurtureMessage(msg)

    await supabase
      .from('cascade_nurture_sequences')
      .update({ sent: true })
      .eq('id', msg.id)
  }
})
```

---

## Section 5: Data Flow & Deployment Architecture

### End-to-End Data Flow Example

**Scenario**: Missed call → Booking → Completion

```
1. MISSED CALL (External Event)
   Twilio Webhook → POST /api/cascade/webhook/missed-call
   ↓

2. LEAD CREATION (CASCADE)
   - Insert into cascade_leads table
   - Generate embedding from phone + metadata
   - Store in agent_memories table
   - Link memory_id to lead
   ↓

3. SWARM ASSIGNMENT (AgentForge)
   - Query active "Sales Team" swarm
   - If none exists, create new hierarchical swarm
   - Update cascade_leads.assigned_swarm_id
   - Swarm status → 'active'
   ↓

4. IMMEDIATE RESPONSE (CASCADE)
   - Twilio SMS API call
   - Store outbound message in memory
   - Update lead.status → 'contacted'
   - Update lead.last_contact timestamp
   ↓

5. LEAD RESPONDS (SMS Webhook)
   POST /api/cascade/sms/inbound
   - Fetch lead by phone
   - Search memory for context (HNSW similarity search)
   - Store new message in memory with embedding
   - Analyze intent using Claude
   ↓

6. BOOKING OFFER (If qualified)
   - Query available calendar slots
   - Generate personalized offer using memory context
   - Send SMS with booking options
   - Update lead.status → 'booking'
   ↓

7. BOOKING CONFIRMATION
   POST /api/cascade/bookings
   - Insert into cascade_bookings table
   - Trigger confirmation sequence
   - Create nurture_sequences entries (SMS + Email)
   - Swarm updates performance metrics
   ↓

8. REAL-TIME UI UPDATES (Volta OS)
   - Supabase real-time subscription fires
   - Frontend receives lead update event
   - LeadDashboard updates count
   - VectorGalaxy adds new memory point
   - SwarmControl shows performance metrics
   ↓

9. COMPLETION
   - Booking status → 'completed'
   - Swarm stores outcome in memory
   - Performance metrics updated
   - Revenue attributed to swarm + campaign
```

### Real-Time Synchronization

```typescript
// All Volta OS components subscribe to relevant channels

// Example: LeadDashboard.tsx
useEffect(() => {
  const leadSub = supabase
    .channel('cascade-leads-updates')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'cascade_leads',
      filter: `status=in.(new,contacted,booking,booked)`
    }, (payload) => {
      if (payload.eventType === 'INSERT') {
        setLeads(prev => [payload.new, ...prev])
        playNotificationSound() // Cyberpunk alert
      } else if (payload.eventType === 'UPDATE') {
        setLeads(prev => prev.map(l =>
          l.id === payload.new.id ? payload.new : l
        ))
      }
    })
    .subscribe()

  return () => leadSub.unsubscribe()
}, [])

// Example: VectorGalaxy.tsx
useEffect(() => {
  const memorySub = supabase
    .channel('memory-viz-updates')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'agent_memories'
    }, async (payload) => {
      // Fetch embedding coordinates for 3D position
      const position = await dimensionalityReduction(payload.new.embedding)

      // Add to galaxy with animation
      addMemoryPoint({
        id: payload.new.id,
        position,
        strength: payload.new.strength,
        agentId: payload.new.agent_id,
        content: payload.new.content
      })
    })
    .subscribe()

  return () => memorySub.unsubscribe()
}, [])
```

### Deployment Architecture

#### Phase 1: Development (Local)

```yaml
Infrastructure:
  - Frontend: Vite dev server (localhost:5173)
  - Backend: Express dev server (localhost:3001)
  - Database: Supabase cloud (free tier)
  - Vector Search: Supabase pgvector extension
  - Embeddings: OpenAI API (text-embedding-3-small)
  - SMS/Voice: Twilio sandbox

Cost: ~$20/month (OpenAI + Twilio)
```

#### Phase 2: Production (MVP)

```yaml
Infrastructure:
  - Frontend: Vercel (static deployment)
  - Backend: Railway or Render (single container)
  - Database: Supabase Pro ($25/month)
  - Vector Search: Included with Supabase
  - Embeddings: OpenAI API
  - SMS/Voice: Twilio production ($50/month)
  - Monitoring: Sentry + Vercel Analytics

Cost: ~$150/month
Performance:
  - < 200ms API latency
  - < 3s page loads
  - 99.9% uptime
```

#### Phase 3: Scale (100+ leads/day)

```yaml
Infrastructure:
  - Frontend: Vercel Pro with edge caching
  - Backend: Railway (2x containers + autoscaling)
  - Database: Supabase Team ($599/month, 50GB storage)
  - Redis: Upstash for caching ($10/month)
  - Queue: BullMQ + Redis for nurture sequences
  - CDN: Cloudflare for static assets
  - Monitoring: Full observability stack

Cost: ~$800/month
Performance:
  - < 100ms API latency (cached)
  - < 1s page loads (edge)
  - 99.95% uptime
  - 1000+ concurrent users
```

### Performance Characteristics

```yaml
Memory Operations:
  - Store: 150-300ms (embedding generation + DB insert)
  - Search: 50-150ms (HNSW index + cosine similarity)
  - Decay: 5-10s (batch process, runs hourly)

Swarm Operations:
  - Create: 200-500ms (DB transaction + topology calculation)
  - Start: 1-5s (depends on swarm size and task complexity)
  - Metrics: 50-100ms (aggregated query)

CASCADE Workflows:
  - Lead Creation: 300-600ms (DB + memory + swarm assignment)
  - SMS Response: 200-400ms (memory search + intent analysis)
  - Booking: 500-1000ms (calendar + confirmation + sequence)
  - Nurture Trigger: 100-200ms (sequence creation)

Real-time Updates:
  - Supabase → Frontend: 50-200ms latency
  - 3D Galaxy Update: 16ms (60fps animation)
```

### Security Considerations

```yaml
Authentication:
  - Supabase Auth with Row Level Security (RLS)
  - API routes protected with JWT validation
  - Twilio webhook signature verification

Data Protection:
  - PII encryption at rest (Supabase native)
  - Memory embeddings do not store raw sensitive data
  - Lead phone numbers hashed for search indices

Access Control:
  - Admin: Full access to all swarms, leads, memory
  - Agent: Read-only access to assigned swarm memory
  - Sales: Lead management, booking creation
  - Viewer: Dashboard metrics only

Compliance:
  - GDPR: Right to deletion (cascade deletes from memory)
  - TCPA: Opt-out management for SMS campaigns
  - Data retention: 90-day auto-archive for inactive leads
```

---

## Conclusion

This design creates a unified AI operations platform by absorbing AgentForge and CASCADE into Volta OS. The plugin architecture eliminates product fragmentation while maintaining modular boundaries internally.

**Key Benefits**:

1. **Unified Interface**: Single cyberpunk dashboard for all AI operations
2. **Shared Memory**: Cross-system context via vector database
3. **Swarm-Powered Automation**: AgentForge swarms execute CASCADE workflows
4. **Real-time Visibility**: Live updates across all subsystems
5. **Scalable Architecture**: Proven stack (React + Express + Supabase)
6. **Ship-Ready**: Volta OS becomes the product, not AgentForge

**Next Steps**:

1. Set up Supabase database with schema
2. Implement Memory Engine and Swarm Coordinator
3. Build AgentForge components (VectorGalaxy, SwarmBuilder)
4. Integrate CASCADE workflows
5. Deploy MVP to production
6. Iterate based on real-world usage

**Timeline Estimate**: 4-6 weeks for MVP (working 20-30 hours/week)
