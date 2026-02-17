# Volta OS: Unified Agent Memory & Orchestration Platform

## The Problem Nobody Has Solved

Every AI coding agent — Claude Code, OpenClaw, Codex, Cursor, Windsurf — has the same fatal flaw: **memory dies when the session ends.**

People have built their own bespoke solutions. CLAUDE.md files. Memory banks. Custom MCP servers. `.claude/memory/` directories. JSON transcripts. But these are all band-aids on a severed artery. The real problem is that **no system exists to unify agent memory across tools, sessions, and contexts** — and the tools that do exist are fighting each other instead of working together.

Volta OS is the answer. Not as another bespoke memory hack, but as **the scaffolding that makes persistent agent memory a solved problem** regardless of which bot, which tool, or which workflow someone uses.

---

## What Volta OS Actually Is

Volta OS is a **local-first agent operations platform** — a dashboard and API layer that sits between your AI agents and your data. Think of it as the nervous system connecting your brain (agents) to your body (filesystem, databases, external services).

It has five sections, each serving a distinct operational need:

### BRAIN — What Your Agent Knows
The filesystem-based knowledge layer. Daily logs, agent outputs, project context, file browsing. This is the raw material — markdown files, JSON state, memory directories. Brain answers: *"What has happened? What do I know?"*

### LABS — What Your Agent Discovers
The intelligence and analysis layer. Scout reports, sentinel alerts, synthesis patterns, curator reviews. Labs takes raw Brain data and extracts signal from noise. Labs answers: *"What matters? What patterns are emerging?"*

### OPS — How Your Agent Runs
The operational layer. Task management, agent status, observability traces, token costs, workspace management. Ops answers: *"What's running? What's it costing? What broke?"*

### COMMAND — What Your Agent Decides
The decision and delegation layer. Console interface, decision logs, standing orders, triage queue, task delegations. Command answers: *"What should we do? Who's handling it?"*

### FORGE — What Your Agent Remembers (Permanently)
The persistent memory and automation layer. Vector embeddings, semantic search, lead management, swarm coordination. Forge answers: *"What do I remember across sessions? How do I act on it?"*

---

## The Three Systems (and Why They Exist Separately)

### 1. ErisMorn Intelligence System
**Data store:** Filesystem (`~/ErisMorn/memory/`)
**What it does:** Reads markdown files written by cron-scheduled agents (SCOUT, SENTINEL, CURATOR, SYNTHESIZER, BUILDER). These agents run on timers, scan the world, and write their findings as `.md` files into structured directories.

**Strengths:**
- Simple, readable, git-trackable
- Human-editable (you can hand-write a memory)
- Zero external dependencies
- Works offline

**Weaknesses:**
- No semantic search (can't ask "what do I know about quantum computing?")
- No relationships between memories
- No decay or reinforcement (old garbage stays forever)
- Agent-specific directories create silos

### 2. AgentForge Memory Engine
**Data store:** Supabase PostgreSQL with pgvector
**What it does:** Stores agent memories as vector embeddings. When you store a memory, it generates an OpenAI embedding (1536-dimensional vector) and indexes it with HNSW for fast similarity search. Memories have strength that decays over time and can be reinforced.

**Strengths:**
- Semantic search ("find memories related to authentication patterns")
- Memory lifecycle (store → reinforce → decay → prune)
- Metadata and tagging
- Works across sessions (database-backed)

**Weaknesses:**
- Requires Supabase + OpenAI API keys
- Currently isolated from filesystem memory
- No automatic ingestion from agent outputs
- Empty until you explicitly store things

### 3. CASCADE Business Automation
**Data store:** Supabase PostgreSQL (relational tables)
**What it does:** Lead management pipeline. Missed call comes in → lead created → conversation tracked → booking scheduled → nurture sequence triggered. It's a CRM that your agent operates.

**Strengths:**
- Full lead lifecycle management
- Conversation history per lead
- Booking and scheduling
- Nurture sequences (follow-up automation)

**Weaknesses:**
- Disconnected from memory system (lead conversations aren't searchable)
- No vector search on conversations
- Requires Twilio for SMS/voice (not configured)

---

## The Current State: Three Islands

Here's the honest picture of how data flows today:

```
  FILESYSTEM                    SUPABASE (pgvector)           SUPABASE (relational)
  ──────────                    ───────────────────           ─────────────────────
  ~/ErisMorn/memory/            agent_memories                cascade_leads
  ├── scout/*.md                ├── embedding (vector)        ├── phone
  ├── sentinel/*.md             ├── content                   ├── conversation_history
  ├── synthesis/*.md            ├── strength                  ├── status
  ├── builder/*.md              ├── tags                      └── memory_id → ???
  ├── curated/*.md              └── metadata                       (never populated)
  └── shared/*.md
       │                              │                              │
       │                              │                              │
       ▼                              ▼                              ▼
  Brain, Labs, Ops,             Forge (VectorGalaxy,          Forge (LeadDashboard)
  Command, Intelligence          MemorySearch)

           ╳ NO CONNECTION ╳                  ╳ NO CONNECTION ╳
```

The filesystem knows nothing about the vector database. The vector database has nothing in it because no agent writes to it. CASCADE has a `memory_id` field on every lead that points to... nothing. These three systems share a UI but not a brain.

---

## The Vision: One Memory, Many Views

The fix isn't to pick one system and kill the others. Each exists for a reason. The fix is to **bridge them**.

```
                          ┌─────────────────────────┐
                          │   UNIFIED MEMORY LAYER   │
                          │                           │
                          │  Every piece of knowledge │
                          │  gets:                    │
                          │  1. Written to filesystem  │
                          │  2. Embedded to vectors   │
                          │  3. Tagged with source    │
                          │  4. Linked to context     │
                          └─────────┬─────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
               ┌────▼────┐   ┌─────▼─────┐   ┌────▼────┐
               │FILESYSTEM│   │  PGVECTOR  │   │RELATIONAL│
               │ (archive)│   │ (search)   │   │ (state)  │
               │          │   │            │   │          │
               │ Raw .md  │   │ Embeddings │   │ Leads    │
               │ Daily    │   │ Similarity │   │ Bookings │
               │ logs     │   │ Decay      │   │ Nurture  │
               └────┬─────┘   └─────┬──────┘   └────┬─────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
               ┌────▼────┐   ┌─────▼─────┐   ┌────▼────┐
               │  BRAIN   │   │   FORGE    │   │ CASCADE │
               │  LABS    │   │ VectorGalaxy│  │ Leads   │
               │  OPS     │   │ MemSearch  │   │ Bookings│
               │  COMMAND │   │            │   │         │
               └──────────┘   └────────────┘   └─────────┘
```

### The Bridge: Background Embedder

The missing piece is a **background process** that watches the filesystem and indexes everything into vectors:

```
Agent writes scout/2026-02-16.md
         │
         ▼
    File watcher detects new/modified file
         │
         ▼
    Extract content + metadata
    (source: "scout", date: "2026-02-16", title: "...")
         │
         ▼
    Generate embedding via OpenAI
         │
         ▼
    Upsert into agent_memories with tags
    ["source:scout", "date:2026-02-16", "auto-indexed"]
         │
         ▼
    Now searchable via "find memories about X"
    AND visible in VectorGalaxy
    AND available to any agent that queries memory
```

This one bridge eliminates the biggest disconnect. Every scout report, every sentinel alert, every synthesis pattern becomes semantically searchable. The filesystem remains the source of truth. The vector database becomes the index.

### The CASCADE Link

When CASCADE creates a lead or updates a conversation, it should also:

1. Create a memory entry: `"New lead from missed_call: +1234567890"`
2. Embed the conversation as it grows
3. Link the memory ID back to the lead record

Now when an agent asks "what do I know about this phone number?" — the vector search returns both the lead data AND any related agent memories. The systems reinforce each other.

---

## Why OpenClaw, Claude Code, and Codex Shouldn't Be At Odds

Here's the real insight: **every AI coding tool has the same memory problem, and they're all solving it independently.**

- **Claude Code** uses `CLAUDE.md` files and `~/.claude/memory/`
- **OpenClaw** uses `.openclaw-flow/` state files and sessions
- **Codex** uses its own context management
- **Cursor** uses `.cursor/` rules files
- **Users** build bespoke memory banks, MCP servers, hook systems

These aren't competing solutions. They're all **producers and consumers of the same underlying resource: knowledge about the project, the user, and the work.**

### The Adapter Pattern

Instead of forcing everyone onto one memory system, Volta OS should be the **hub** that connects them all:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Claude Code  │  │   OpenClaw    │  │    Codex      │  │  Custom Agent │
│  CLAUDE.md    │  │ .openclaw-flow│  │  (whatever)   │  │  (whatever)   │
│  ~/.claude/   │  │  sessions/    │  │               │  │               │
└──────┬───────┘  └──────┬───────┘  └──────┬────────┘  └──────┬────────┘
       │                 │                 │                   │
       ▼                 ▼                 ▼                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     MEMORY ADAPTER LAYER                             │
│                                                                      │
│  ClaudeCodeAdapter    OpenClawAdapter    GenericFileAdapter          │
│  - reads CLAUDE.md    - reads state.json - reads any structured     │
│  - reads memory/      - reads spawned    - watches directories      │
│  - reads transcripts  - reads sessions   - parses common formats    │
│                                                                      │
│  All adapters implement:                                             │
│    ingest() → extract content, generate embedding, store             │
│    query()  → semantic search across all sources                     │
│    sync()   → bidirectional sync with source                        │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │   agent_memories (pgvector)│
                    │                            │
                    │  Unified searchable index  │
                    │  of ALL agent knowledge    │
                    │  from ALL sources          │
                    │                            │
                    │  Tags track origin:        │
                    │  source:claude-code         │
                    │  source:openclaw            │
                    │  source:scout               │
                    │  source:cascade-lead        │
                    └──────────────────────────┘
```

The key insight: **the vector database doesn't replace any of these systems. It indexes them.** Claude Code still writes CLAUDE.md. OpenClaw still manages its state files. But now there's a unified search layer that lets any agent find relevant knowledge regardless of where it originated.

### What This Unlocks

**Cross-session continuity:** "Last Tuesday you decided to use Redis for caching. Here's why." — found via semantic search across transcripts from 5 sessions ago.

**Cross-tool knowledge:** OpenClaw learns something during a cron job. Next time Claude Code opens, it can query that knowledge. They're not competing — they're collaborating through shared memory.

**Cross-project learning:** "You solved a similar authentication bug in project-alpha. Here's what you did." — found via embedding similarity, not filename matching.

**Decay and reinforcement:** Memories that keep getting accessed stay strong. Memories that are never relevant again fade. This isn't possible with flat files.

---

## How It Could Be Better Organized

### Current Structure (Siloed)
```
server/routes/
├── erismorn.ts    ← reads filesystem, 30+ endpoints, does everything
├── memory.ts      ← Supabase CRUD, 5 endpoints
├── swarm.ts       ← Supabase CRUD, 8 endpoints
├── cascade.ts     ← Supabase CRUD, 11 endpoints
```

### Proposed Structure (Layered)
```
server/
├── adapters/                    # Data source adapters
│   ├── filesystem.ts            # Reads ~/ErisMorn/memory/
│   ├── vector.ts                # Supabase pgvector operations
│   ├── claude-code.ts           # Reads CLAUDE.md, memory/, transcripts
│   ├── openclaw.ts              # Reads .openclaw-flow/ state
│   └── claude-mem.ts            # Proxies to localhost:37777
│
├── services/                    # Business logic (adapter-agnostic)
│   ├── unified-memory.ts        # Queries across all adapters
│   ├── embedder.ts              # Background embedding job
│   ├── intelligence.ts          # Briefing, anomalies, synthesis
│   ├── cascade.ts               # Lead lifecycle management
│   └── swarm.ts                 # Agent orchestration
│
├── routes/                      # Thin HTTP layer
│   ├── memory.ts                # /api/memory/* (unified search + CRUD)
│   ├── intelligence.ts          # /api/intelligence/* (briefings, labs)
│   ├── observability.ts         # /api/observability/* (traces, state)
│   ├── cascade.ts               # /api/cascade/* (leads, bookings)
│   └── system.ts                # /api/status, /api/config, /health
│
├── jobs/                        # Background processes
│   ├── embedder.ts              # Watch filesystem → embed new files
│   ├── decay.ts                 # Periodic memory strength decay
│   └── sync.ts                  # Cross-adapter synchronization
│
└── config/
    └── agents.json              # Agent manifest (configurable per user)
```

### The Agent Manifest

Instead of hardcoding `sentinel/`, `scout/`, `curator/`:

```json
{
  "workspace": "~/ErisMorn",
  "memoryRoot": "~/ErisMorn/memory",
  "agents": [
    {
      "id": "scout",
      "name": "SCOUT",
      "directory": "scout",
      "type": "discovery",
      "schedule": "*/30 * * * *",
      "outputFormat": "markdown"
    },
    {
      "id": "sentinel",
      "name": "SENTINEL",
      "directory": "sentinel",
      "type": "monitoring",
      "schedule": "*/15 * * * *",
      "outputFormat": "markdown"
    }
  ],
  "dataSources": [
    { "type": "filesystem", "path": "~/ErisMorn/memory" },
    { "type": "claude-code", "path": "~/.claude" },
    { "type": "openclaw", "path": "~/ErisMorn/.openclaw-flow" }
  ],
  "vectorStore": {
    "provider": "supabase",
    "embeddingModel": "text-embedding-3-small"
  }
}
```

Now someone running OpenClaw with different agents just edits this file. The entire backend adapts. No code changes needed.

---

## The Five Memory Layers (Current vs. Unified)

### Current: Five Disconnected Systems

| # | System | Store | Search | Connected? |
|---|--------|-------|--------|------------|
| 1 | ErisMorn Memory | Filesystem `.md` | Full-text grep | To Brain/Labs only |
| 2 | AgentForge Memory | Supabase pgvector | Semantic (cosine) | To Forge only |
| 3 | CASCADE Conversations | Supabase JSONB | None | To Leads only |
| 4 | OpenClaw State | JSON files | None | To Observability only |
| 5 | Claude Code Memory | External service | External | Proxied only |

### Unified: One Index, Many Sources

| Layer | Purpose | Implementation |
|-------|---------|----------------|
| **Source Layer** | Raw data lives where it was created | Filesystem, Supabase, external services |
| **Adapter Layer** | Reads from each source format | Pluggable adapters per source type |
| **Embedding Layer** | Generates vectors for all content | Background job with OpenAI embeddings |
| **Index Layer** | Unified searchable store | Supabase pgvector with source tags |
| **Query Layer** | Single API for all memory | `POST /api/memory/search` returns results from everywhere |

The filesystem stays. Supabase stays. Claude Code stays. Nothing gets replaced. Everything gets **indexed**.

---

## Practical Integration Points

### 1. When a Scout Report Lands
```
scout/2026-02-16.md written
  → embedder picks it up
  → generates vector embedding
  → stores in agent_memories with tags: ["source:scout", "auto-indexed"]
  → now visible in VectorGalaxy
  → now searchable in MemorySearch
  → still visible in Labs > Ideas (filesystem)
```

### 2. When a Lead Conversation Updates
```
CASCADE lead gets new message
  → message added to conversation_history
  → conversation summary embedded
  → stored in agent_memories with tags: ["source:cascade", "lead:{id}"]
  → linked via cascade_leads.memory_id
  → now searchable: "what did the client say about scheduling?"
```

### 3. When Claude Code Learns Something
```
Claude Code writes to ~/.claude/memory/patterns.md
  → claude-code adapter detects change
  → extracts new entries
  → embeds and stores with tags: ["source:claude-code", "type:pattern"]
  → next time ANY agent queries memory, this knowledge is available
```

### 4. When OpenClaw Spawns Agents
```
OpenClaw creates .openclaw-flow/state.json
  → openclaw adapter reads state
  → agent decisions and task results get embedded
  → observability dashboard shows live state
  → completed task results become searchable memory
```

---

## What This Means for the User

**Today:** You open Volta OS and see five tabs with five different types of data that don't talk to each other. Forge is empty because nobody stored anything. Labs shows scout reports but you can't search them semantically. CASCADE has leads but the agent doesn't know about them.

**Tomorrow:** You open Volta OS and everything is connected. Type a question in Memory Search — it finds relevant scout reports, Claude Code learnings, lead conversations, and OpenClaw task results. The Vector Galaxy shows your entire knowledge graph as a 3D constellation. When a new lead comes in, the agent already knows related context from previous sessions.

**The scaffolding is already built.** The frontend components exist. The database schema exists. The API routes exist. What's missing is the connective tissue — the adapters, the embedder, and the config that makes it all flow together.

The goal isn't to replace anyone's setup. It's to give every setup a shared memory layer that actually works.

---

## Next Steps

### Phase 1: Bridge (Now)
- [ ] Build the background embedder (filesystem → pgvector)
- [ ] Wire CASCADE lead creation to memory store
- [ ] Populate VectorGalaxy with auto-indexed memories
- [ ] Fix database schema (foreign keys, missing tables)

### Phase 2: Adapt (Soon)
- [ ] Create adapter interfaces for each data source
- [ ] Build the agent manifest config system
- [ ] Add claude-code adapter (reads CLAUDE.md + memory/)
- [ ] Add openclaw adapter (reads state files)
- [ ] Unified `/api/memory/search` that queries all adapters

### Phase 3: Scale (Later)
- [ ] Real-time subscriptions (Supabase Realtime)
- [ ] Memory decay cron job
- [ ] Cross-project memory sharing
- [ ] Export/import for portability
- [ ] Plugin system for custom adapters

---

*Volta OS isn't a dashboard. It's the memory layer that AI agents have been missing.*
