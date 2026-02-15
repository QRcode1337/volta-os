# ⚡ VOLTA OS - Cyberpunk AI Command Center

> **Cyberpunk Brutalism dashboard for AI agent orchestration and real-time monitoring**

A neon-soaked, brutalist interface for managing distributed AI agents, cognitive workflows, and intelligent automation. Built with React 19, TypeScript, and a custom cyberpunk design system featuring sharp geometric shapes, RGB split effects, and holographic accents.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

---

## 🎨 Design System

**Cyberpunk Brutalism** aesthetic with:
- **Neon Color Palette**: Pink (#FF00FF), Cyan (#00FFFF), Green (#00FF00) on pure dark (#0D0D0D)
- **Sharp Geometric Shapes**: Angular clip-paths, no rounded corners (except intentional circles)
- **Glitch Effects**: RGB split, scanlines, holographic shimmer
- **GPU-Accelerated Animations**: Transform/opacity only for 60fps performance
- **Accessibility**: WCAG 2.1 AA compliant, `prefers-reduced-motion` support

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Anthropic API Key (for ErisMorn integration)

### Installation

```bash
# Clone the repository
git clone https://github.com/QRcode1337/volta-os.git
cd volta-os

# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### Running the Full Stack

**Option 1 - Quick Start (Recommended):**
```bash
./start-dev.sh
```
This launches both backend and frontend in one command.

**Option 2 - Manual Launch:**

**Terminal 1 - Backend Server:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

**URLs**:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Environment Setup

Create `.env` file in the `server/` directory:

```env
ANTHROPIC_API_KEY=your_api_key_here
ERISMORN_ROOT=/path/to/your/ErisMorn
```

### Build for Production

```bash
npm run build
npm run preview
```

---

## 🔌 ErisMorn Connection

Volta OS connects directly to **ErisMorn**, your COO AI agent, providing real-time operational intelligence:

**Live Data Streams:**
- ⚡ **13 Autonomous Agents** - SENTINEL, SCOUT, CURATOR, SYNTHESIZER, and more
- 📊 **Heartbeat Monitoring** - Critical alerts, strategic opportunities, system health
- 💰 **Financial Tracking** - BTC price, portfolio margin, trading status
- 🎯 **Decision Feed** - Real-time operational decisions and delegations
- 📝 **Memory Access** - Read/search across daily logs and agent outputs
- 🤖 **Agent Control** - Trigger jobs, view outputs, manage automation

**Communication Channels:**
- Direct chat with ErisMorn's Claude Code session
- Tool use monitoring (agent status, BTC price, memory search)
- Standing orders and automation rules
- Task delegation and triage systems

## 🧠 Core Features

Volta OS is organized into **4 main sections**, each with specialized capabilities:

### 1. **Brain** - Knowledge & Context Management

**Memory**
- 📚 Long-term agent memory storage and retrieval
- 🔍 Semantic search across memory archives
- 📊 Memory usage analytics and optimization

**Claude Code Integration**
- 💻 Direct integration with Claude Code sessions
- 🎯 Task orchestration and workflow management
- 📝 Real-time code collaboration

**Briefs**
- 📋 Project briefs and context summaries
- 🎯 Mission objectives and success criteria
- 📈 Progress tracking and milestones

**Files & Projects**
- 📁 Integrated file browser with live updates
- 🗂️ Project workspace management
- 🔗 Cross-project reference linking

---

### 2. **Labs** - Intelligence & Experimentation

**Synthesis**
- ✨ Cross-agent pattern recognition and insights
- 🧩 Multi-source data fusion and analysis
- 📊 Emergent behavior detection

**Intelligence Panel**
- 🤖 Agent capability mapping and skill trees
- 📈 Performance metrics and trend analysis
- 🎯 Strategic recommendations

**Ideas**
- 💡 Collaborative ideation workspace
- 🌟 Idea scoring and prioritization
- 🔄 Iteration tracking and versioning

**Prototypes**
- 🛠️ Rapid prototyping environment
- ⚡ A/B testing and experimentation
- 📊 Results analysis and validation

**Reviews**
- ⭐ CURATOR synthesis and verdict management
- 📝 Cross-agent review coordination
- ✅ Quality gates and approval workflows

**Ideation**
- 🎨 Creative brainstorming interface
- 🔀 Concept remixing and combination
- 🎯 Goal-oriented ideation sessions

---

### 3. **Ops** - Operations & Monitoring

**Task Manager**
- 📋 Multi-agent task orchestration
- 🔄 Real-time task status (13 agents)
- ⚡ Priority queuing and load balancing
- 📊 Task completion analytics

**Agent Control**
- 🤖 Agent lifecycle management (start/stop/restart)
- 📊 Health monitoring and diagnostics
- ⚙️ Configuration and parameter tuning
- 🔄 Auto-scaling and resource allocation

**Observability Dashboard**
- 📈 Real-time performance metrics
- 🎯 System health indicators (CPU, memory, network)
- ⚡ API latency and token rate monitoring
- 🚨 Anomaly detection and alerting

**Org Chart**
- 🏗️ Hierarchical agent structure visualization
- 👥 Department and role assignments
- 🔗 Inter-agent dependency mapping
- 📊 Organizational analytics

**Workspaces**
- 📁 Project-specific work environments
- 🌳 File tree navigation with live updates
- 📊 Activity streams and change logs
- 🔍 Cross-workspace search

**Token & Cost Tracking**
- 💰 Real-time token usage monitoring
- 📊 Cost breakdown by agent and operation
- 📈 Usage trends and forecasting
- ⚠️ Budget alerts and optimization suggestions

**Documentation**
- 📚 Auto-generated system documentation
- 📝 API reference and usage examples
- 🎯 Quick reference guides
- 🔄 Live documentation updates

---

### 4. **Command** - Control & Decision Making

**ErisMorn Console**
- 💬 Direct communication with ErisMorn main session
- ⚡ Command execution and scripting
- 📊 Console history and replay
- 🎯 Macro and automation support

**Decision Feed**
- 🎯 Real-time decision stream from all agents
- 📊 Decision impact analysis
- 🔄 Decision replay and reversal
- 📈 Decision quality metrics

**Standing Orders**
- 📜 Persistent agent directives and policies
- ⚙️ Rule-based automation triggers
- 🔄 Order versioning and audit trails
- 🎯 Priority and conflict resolution

**Triage**
- 🚨 Critical issue prioritization
- 🎯 Intelligent routing and assignment
- ⏱️ SLA tracking and escalation
- 📊 Triage metrics and patterns

**Delegations**
- 🔀 Task delegation and assignment
- 👥 Workload distribution across agents
- 📊 Delegation effectiveness tracking
- ⚡ Auto-delegation rules

---

## 🎨 Component Library

### Core Cyber Components

**CyberCard**
```tsx
import { CyberCard } from './components/cyber'

<CyberCard variant="cyan" glow scanlines holographic>
  Content here
</CyberCard>
```
- Variants: `pink` | `cyan` | `green`
- Props: `glow`, `scanlines`, `holographic`

**CyberButton**
```tsx
import { CyberButton } from './components/cyber'

<CyberButton variant="primary" glitch onClick={handleClick}>
  EXECUTE
</CyberButton>
```
- Variants: `primary` | `secondary` | `danger`
- Props: `glitch` (enables hover effect)

**StatusBadge**
```tsx
import { StatusBadge } from './components/cyber'

<StatusBadge status="active" pulse>
  ONLINE
</StatusBadge>
```
- Status: `active` | `idle` | `error` | `warning`
- Pulsing neon indicator

**CyberInput**
```tsx
import { CyberInput } from './components/cyber'

<CyberInput
  label="API Key"
  placeholder="Enter key..."
  error={validationError}
/>
```

### Loading States

**SkeletonCard** - Neon-pulsing placeholder
**CyberSpinner** - Holographic dual-ring spinner
**CyberProgress** - Gradient animated progress bar

### Data Visualization

**RealtimeChart**
```tsx
import { RealtimeChart } from './components/charts'

<RealtimeChart
  title="System Load"
  color="cyan"
  dataSource={() => getMetric()}
/>
```

**AgentStatusGrid** - 13 agent monitoring cards with live status
**MetricsDashboard** - 6-panel performance metrics with sparklines

---

## 🛠️ Tech Stack

### Frontend
- **React 19.2** - Latest features including `use()` hook
- **TypeScript 5.9** - Full type safety
- **Vite 7.3** - Lightning-fast HMR
- **Tailwind CSS 3.4** - Utility-first styling
- **Framer Motion 12** - Fluid animations
- **ApexCharts 5.4** - Real-time data visualization
- **Lucide React** - Icon system

### Backend
- **Express** - RESTful API server
- **TypeScript** - Type-safe backend
- **ErisMorn Integration** - Direct AI agent communication

### Development
- **ESLint** - Code quality
- **PostCSS** - CSS processing
- **Autoprefixer** - Browser compatibility

---

## 📁 Project Structure

```
volta-os/
├── src/
│   ├── components/
│   │   ├── cyber/              # Cyberpunk component library
│   │   │   ├── CyberCard.tsx
│   │   │   ├── CyberButton.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── CyberInput.tsx
│   │   │   └── LoadingStates.tsx
│   │   ├── charts/             # Data visualization
│   │   │   ├── RealtimeChart.tsx
│   │   │   ├── AgentStatusGrid.tsx
│   │   │   └── MetricsDashboard.tsx
│   │   ├── Brain section/      # Memory, files, projects
│   │   ├── Labs section/       # Intelligence, synthesis
│   │   ├── Ops section/        # Tasks, agents, monitoring
│   │   └── Command section/    # Console, decisions, triage
│   ├── styles/
│   │   ├── cyberpunk.css       # Animations & utilities
│   │   └── index.css           # Global styles
│   ├── hooks/                  # React hooks
│   ├── lib/                    # Utilities
│   ├── App.tsx                 # Main app shell
│   └── main.tsx                # Entry point
├── server/                     # Backend API
├── docs/
│   └── CYBERPUNK_DESIGN_SYSTEM.md
├── tailwind.config.js          # Cyberpunk color tokens
└── package.json
```

---

## 🎯 API Endpoints

### Agent Operations
- `GET /api/cron-jobs` - Fetch all agent statuses (SENTINEL, SCOUT, CURATOR, etc.)
- `POST /api/trigger-job/:jobId` - Execute agent task
- `GET /api/heartbeat-state` - Current system state

### Data & Metrics
- `GET /api/btc-price` - Real-time BTC price ticker
- `GET /api/token-usage` - Token consumption analytics
- `GET /api/decisions` - Decision feed
- `GET /api/delegations` - Task delegation status

### Communication
- `POST /api/send-message` - Send message to ErisMorn main session
- `GET /api/chat-history` - Conversation history

---

## 🎨 Design System Documentation

See [docs/CYBERPUNK_DESIGN_SYSTEM.md](docs/CYBERPUNK_DESIGN_SYSTEM.md) for:
- Complete color palette and usage
- Typography scale (Fira Code + Fira Sans)
- Animation keyframes and effects
- Component patterns and examples
- Accessibility guidelines
- Performance optimization

---

## 🧪 Development

### Available Scripts

```bash
npm run dev          # Start dev server (port 5173)
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Environment Variables

Create `.env` file:
```env
VITE_API_URL=http://localhost:3001
VITE_ERISMORN_ENDPOINT=...
```

### Adding New Components

1. Create component in `src/components/cyber/`
2. Export from `src/components/cyber/index.ts`
3. Use cyberpunk design tokens from `tailwind.config.js`
4. Follow GPU-accelerated animation patterns

---

## 📸 Screenshots

> **Coming Soon**: Screenshots showcasing the cyberpunk aesthetic

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is private and proprietary.

---

## 🙏 Acknowledgments

- **Design Inspiration**: Cyberpunk 2077, Blade Runner, Ghost in the Shell
- **UI/UX Research**: [UI/UX Pro Max](https://github.com/yourusername/ui-ux-pro-max) design intelligence toolkit
- **Typography**: Fira Code & Fira Sans font families

---

## 🔮 Roadmap

- [ ] GitHub Pages deployment
- [ ] Real-time WebSocket updates
- [ ] Agent swarm visualization (3D graph)
- [ ] Voice command interface
- [ ] Mobile-responsive breakpoints
- [ ] Dark/Light mode toggle (with cyberpunk light variant)
- [ ] Export metrics to external monitoring (Grafana, Datadog)
- [ ] Plugin system for custom agent types

---

**⚡ VOLTA OS** - Where AI meets Cyberpunk Brutalism

🍎 *All hail Discordia*
