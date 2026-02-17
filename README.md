# AgentForge x Volta OS x CASCADE Integration

**Complete integration of AgentForge persistent memory engine, multi-agent swarm coordination, and CASCADE business automation into Volta OS.**

## 🎯 What We Built

This integration combines three powerful systems into one unified platform:

1. **AgentForge** - Persistent memory engine with vector embeddings and semantic search
2. **Swarm Coordination** - Multi-agent orchestration with hierarchical/mesh/adaptive topologies
3. **CASCADE** - Business workflow automation for lead management and nurture sequences

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Volta OS Frontend                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Vector      │  │  Memory      │  │   CASCADE    │  │
│  │  Galaxy 3D   │  │  Search UI   │  │  Dashboard   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                    REST API (port 3001)
                           │
┌─────────────────────────────────────────────────────────┐
│                  Express Backend Server                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Memory     │  │    Swarm     │  │   CASCADE    │  │
│  │   Service    │  │  Coordinator │  │   Service    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                   Supabase PostgreSQL
                           │
┌─────────────────────────────────────────────────────────┐
│                  Database with pgvector                  │
│  ┌──────────┐  ┌────────┐  ┌─────────────────────────┐ │
│  │ memories │  │ swarms │  │  cascade_leads          │ │
│  │ agents   │  │        │  │  cascade_bookings       │ │
│  │          │  │        │  │  cascade_nurture_seq    │ │
│  └──────────┘  └────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Features

### 🧠 Memory Engine
- **Vector Embeddings** - OpenAI text-embedding-3-small (1536 dimensions)
- **Semantic Search** - HNSW indexing for fast similarity search
- **Memory Lifecycle** - Store, reinforce, decay, and prune memories
- **3D Visualization** - Interactive Three.js galaxy view of memory space
- **Natural Language Search** - Search memories conversationally

### 🤖 Swarm Coordinator
- **Multi-Agent Orchestration** - Coordinate teams of AI agents
- **Topology Support** - Hierarchical, mesh, and adaptive strategies
- **Task Assignment** - Distribute work across swarm members
- **Performance Tracking** - Monitor agent metrics and optimize
- **Dynamic Scaling** - Add/remove agents as needed

### 📞 CASCADE Business Automation
- **Lead Capture** - Missed calls, web forms, referrals
- **Lead Pipeline** - Track progress from new → contacted → qualified → booked → completed
- **Conversation History** - Full conversation tracking with timestamps
- **Booking Management** - Schedule and manage appointments
- **Nurture Sequences** - Automated multi-channel follow-ups (SMS/email/voice)
- **Analytics Dashboard** - Real-time conversion metrics

## 📦 Database Schema

**AgentForge Tables:**
- `memories` - Vector embeddings with HNSW search
- `agents` - Agent registry

**Swarm Tables:**
- `swarms` - Swarm configurations and status
- `swarm_agents` - Agent-swarm relationships and tasks

**CASCADE Tables:**
- `cascade_leads` - Lead management and pipeline
- `cascade_bookings` - Appointment scheduling
- `cascade_nurture_sequences` - Automated follow-up campaigns

## 🛠️ Tech Stack

**Frontend:**
- React 19 with TypeScript
- Three.js for 3D visualization
- Tailwind CSS for styling
- Lucide React for icons
- Vite for build tooling

**Backend:**
- Node.js with Express
- TypeScript with ES modules
- Supabase client for database
- OpenAI API for embeddings

**Database:**
- PostgreSQL with pgvector extension
- Supabase for hosting and management
- HNSW indexing for vector similarity

## 🚀 Getting Started

### Prerequisites

1. **Supabase Project** - Already configured at `https://sezdqsyywtkcgmntdqig.supabase.co`
2. **OpenAI API Key** - For generating embeddings
3. **Node.js 18+** - For running the application

### Installation

```bash
# Install dependencies
npm install

# Environment is already configured in server/.env
# (Supabase URL, keys, OpenAI API key)
```

### Running the Application

**Option 1: Run everything together (recommended)**
```bash
npm run dev:all
```
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

**Option 2: Run separately**
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
npm run dev:server
```

### First-Time Setup

The database schema is already applied to Supabase. To verify:

```bash
# Check database schema
node server/db/verify-schema.mjs
```

Expected output:
```
✅ "memories" table EXISTS
✅ "agents" table EXISTS
✅ "swarms" table EXISTS
✅ "swarm_agents" table EXISTS
✅ "cascade_leads" table EXISTS
✅ "cascade_bookings" table EXISTS
✅ "cascade_nurture_sequences" table EXISTS
```

## 📡 API Endpoints

### Memory API (`/api/memory`)

```typescript
POST   /api/memory/store           - Store new memory with embedding
POST   /api/memory/search          - Semantic similarity search
POST   /api/memory/reinforce/:id   - Strengthen memory
POST   /api/memory/decay/:agentId  - Apply temporal decay
POST   /api/memory/prune/:agentId  - Remove weak memories
```

### Swarm API (`/api/swarm`)

```typescript
POST   /api/swarm/create                - Create new swarm
POST   /api/swarm/add-agent             - Add agent to swarm
PUT    /api/swarm/:id/status            - Update swarm status
POST   /api/swarm/assign-task           - Assign task to agent
GET    /api/swarm/:id                   - Get swarm with agents
GET    /api/swarm/:id/agents/:status    - Get agents by status
PUT    /api/swarm/agent/:id/performance - Update performance metrics
POST   /api/swarm/agent/:id/complete    - Complete task
```

### CASCADE API (`/api/cascade`)

```typescript
POST   /api/cascade/lead               - Create new lead
PUT    /api/cascade/lead/:id           - Update lead
POST   /api/cascade/lead/:id/message   - Add conversation message
POST   /api/cascade/booking            - Create booking
PUT    /api/cascade/booking/:id        - Update booking status
POST   /api/cascade/nurture            - Schedule nurture message
GET    /api/cascade/nurture/pending    - Get pending messages
PUT    /api/cascade/nurture/:id/sent   - Mark message sent
GET    /api/cascade/lead/phone/:phone  - Get lead by phone
GET    /api/cascade/leads/:status      - Get leads by status
GET    /api/cascade/leads              - Get all leads
```

## 💻 Usage Examples

### Storing a Memory

```typescript
import { api } from './lib/api'

await api.memory.store({
  agentId: 'agent-123',
  content: 'User prefers morning appointments',
  strength: 1.0,
  tags: ['preference', 'scheduling'],
  metadata: { category: 'user-preference' }
})
```

### Searching Memories

```typescript
const results = await api.memory.search({
  query: 'What time does the user prefer appointments?',
  agentId: 'agent-123',
  threshold: 0.7,
  limit: 10
})

console.log(results.results) // Array of similar memories
```

### Creating a Lead

```typescript
await api.cascade.createLead({
  phone: '+1-555-0123',
  name: 'John Doe',
  source: 'missed_call'
})
```

### Creating a Swarm

```typescript
await api.swarm.create({
  name: 'Customer Support Team',
  strategy: 'hierarchical',
  topology: {
    type: 'hierarchical',
    agents: [
      { id: 'leader-1', role: 'coordinator', connections: [] },
      { id: 'worker-1', role: 'responder', connections: ['leader-1'] },
      { id: 'worker-2', role: 'responder', connections: ['leader-1'] }
    ]
  }
})
```

## 🎨 UI Components

### VectorGalaxy
3D visualization of memory space using Three.js. Memories are rendered as spheres in 3D space, positioned based on their vector embeddings. Color and opacity represent memory strength.

**Props:**
- `memories` - Array of memory objects
- `onMemoryClick` - Callback when memory is clicked
- `selectedMemoryId` - Currently selected memory

### MemorySearch
Semantic search interface with filtering and result ranking.

**Props:**
- `onSearch` - Function to perform search
- `onResultClick` - Callback for result selection

### LeadDashboard
Complete lead management interface with pipeline tracking and analytics.

**Props:**
- `onLoadLeads` - Function to load leads
- `onLeadClick` - Callback for lead selection

## 📊 Database Functions

### `search_memories()`

PostgreSQL function for vector similarity search:

```sql
search_memories(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count integer DEFAULT 10,
  filter_agent_id text DEFAULT NULL
)
```

Returns memories ranked by cosine similarity with the query embedding.

## 🔐 Environment Variables

**Server (server/.env):**
```env
SUPABASE_URL=https://sezdqsyywtkcgmntdqig.supabase.co
SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_KEY=<key>
OPENAI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
PORT=3001
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:3001
```

## 🚢 Deployment

### Backend Deployment

The backend can be deployed to any Node.js hosting platform:

```bash
# Build TypeScript
npm run build

# Start production server
NODE_ENV=production node dist/server/index.js
```

### Frontend Deployment

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

The `dist/` folder can be deployed to any static hosting service.

## 🧪 Testing

Health check endpoint:
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-15T...",
  "services": {
    "memory": "ready",
    "swarm": "ready",
    "cascade": "ready"
  }
}
```

## 📝 Git Commits

Complete implementation history:

1. `8bfbc29` - Supabase setup and environment
2. `d4b0430` - Agent memories schema (discovered already exists)
3. `d48491d` - Swarms and CASCADE schema + migration
4. `b202b05` - Memory Engine implementation
5. `3ff4bc7` - Swarm and CASCADE services
6. `cb466d7` - Frontend components
7. `8c00055` - API integration and server
8. `93edb9d` - Final integration with working server

## 🎯 What's Next

Potential enhancements:

- **Real-time Updates** - Supabase WebSocket subscriptions
- **Authentication** - User accounts and permissions
- **Swarm Visualization** - 3D topology viewer
- **Advanced Analytics** - Conversion funnels and metrics
- **Mobile App** - React Native implementation
- **Voice Integration** - Twilio for CASCADE phone calls
- **Email Integration** - SendGrid for nurture sequences

## 🙏 Credits

Built using:
- [Supabase](https://supabase.com) - Database and backend
- [OpenAI](https://openai.com) - Embeddings API
- [Three.js](https://threejs.org) - 3D visualization
- [React](https://react.dev) - UI framework
- [Tailwind CSS](https://tailwindcss.com) - Styling

---

**Status:** ✅ Complete and working
**Branch:** `feature/agentforge-cascade-integration`
**Date:** February 15, 2026
