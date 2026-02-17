import { useState, useEffect } from 'react'
import { Monitor, Users, Briefcase, FileText, TrendingUp, RefreshCw, Mic, Brain, FlaskConical, Wrench, FolderOpen, ClipboardList, Lightbulb, Layers, Star, BookOpen, Radio, MessageSquare, GitBranch, ShieldCheck, Sparkles, Activity, Cpu, Target, ArrowRightLeft, DollarSign, Eye, Code, Orbit, Search, Phone } from 'lucide-react'
import TaskManager from './components/TaskManager'
import OrgChart from './components/OrgChart'
import Workspaces from './components/Workspaces'
import { MemoryTab, BriefsTab, FilesTab, ProjectsTab } from './components/BrainSection'
import { ClaudeCodePanel } from './components/ClaudeCodePanel'
import ErisMornConsole from './components/ErisMornConsole'
import DecisionFeed from './components/DecisionFeed'
import StandingOrders from './components/StandingOrders'
import SynthesisView from './components/SynthesisView'
import IntelligencePanel from './components/IntelligencePanel'
import AgentControl from './components/AgentControl'
import DelegationBoard from './components/DelegationBoard'
import TriageView from './components/TriageView'
import TokenUsage from './components/TokenUsage'
import ObservabilityDashboard from './components/ObservabilityDashboard'
import IdeasPage from './components/IdeasPage'
import PrototypesPage from './components/PrototypesPage'
import ReviewsPage from './components/ReviewsPage'
import IdeationPage from './components/IdeationPage'
import { ErisMornStatus } from './components/ErisMornStatus'
import AgentForgePage from './pages/AgentForgePage'

type Section = 'brain' | 'labs' | 'ops' | 'command' | 'forge'
type Tab =
  // Brain tabs
  | 'memory' | 'briefs' | 'files' | 'projects' | 'claude-code'
  // Labs tabs
  | 'ideas' | 'prototypes' | 'reviews' | 'ideation'
  // Intelligence tabs (Labs)
  | 'synthesis' | 'intelligence'
  // Ops tabs
  | 'task-manager' | 'org-chart' | 'workspaces' | 'docs' | 'agents' | 'observability'
  // Command tabs
  | 'console' | 'decisions' | 'orders' | 'triage' | 'delegations' | 'tokens'
  // AgentForge tabs
  | 'vector-galaxy' | 'memory-search' | 'cascade-leads'

interface SidebarItem {
  id: Section
  icon: React.ReactNode
  label: string
  tabs: { id: Tab; label: string; icon: React.ReactNode }[]
}

const sidebarSections: SidebarItem[] = [
  {
    id: 'brain',
    icon: <Brain className="w-5 h-5" />,
    label: 'Brain',
    tabs: [
      { id: 'memory', label: 'Memory', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'claude-code', label: 'Claude Code', icon: <Code className="w-4 h-4" /> },
      { id: 'briefs', label: 'Briefs', icon: <ClipboardList className="w-4 h-4" /> },
      { id: 'files', label: 'Files', icon: <FolderOpen className="w-4 h-4" /> },
      { id: 'projects', label: 'Projects', icon: <Layers className="w-4 h-4" /> },
    ]
  },
  {
    id: 'labs',
    icon: <FlaskConical className="w-5 h-5" />,
    label: 'Labs',
    tabs: [
      { id: 'synthesis', label: 'Synthesis', icon: <Sparkles className="w-4 h-4" /> },
      { id: 'intelligence', label: 'Intelligence', icon: <Activity className="w-4 h-4" /> },
      { id: 'ideas', label: 'Ideas', icon: <Lightbulb className="w-4 h-4" /> },
      { id: 'prototypes', label: 'Prototypes', icon: <Layers className="w-4 h-4" /> },
      { id: 'reviews', label: 'Reviews', icon: <Star className="w-4 h-4" /> },
      { id: 'ideation', label: 'Ideation', icon: <Brain className="w-4 h-4" /> },
    ]
  },
  {
    id: 'ops',
    icon: <Wrench className="w-5 h-5" />,
    label: 'Ops',
    tabs: [
      { id: 'task-manager', label: 'Task Manager', icon: <Monitor className="w-4 h-4" /> },
      { id: 'agents', label: 'Agents', icon: <Cpu className="w-4 h-4" /> },
      { id: 'observability', label: 'Observability', icon: <Eye className="w-4 h-4" /> },
      { id: 'org-chart', label: 'Org Chart', icon: <Users className="w-4 h-4" /> },
      { id: 'workspaces', label: 'Workspaces', icon: <Briefcase className="w-4 h-4" /> },
      { id: 'tokens', label: 'Tokens & Cost', icon: <DollarSign className="w-4 h-4" /> },
      { id: 'docs', label: 'Docs', icon: <FileText className="w-4 h-4" /> },
    ]
  },
  {
    id: 'command',
    icon: <Radio className="w-5 h-5" />,
    label: 'Command',
    tabs: [
      { id: 'console', label: 'Console', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'decisions', label: 'Decisions', icon: <GitBranch className="w-4 h-4" /> },
      { id: 'orders', label: 'Orders', icon: <ShieldCheck className="w-4 h-4" /> },
      { id: 'triage', label: 'Triage', icon: <Target className="w-4 h-4" /> },
      { id: 'delegations', label: 'Delegations', icon: <ArrowRightLeft className="w-4 h-4" /> },
    ]
  },
  {
    id: 'forge',
    icon: <Orbit className="w-5 h-5" />,
    label: 'Forge',
    tabs: [
      { id: 'vector-galaxy', label: 'Vector Galaxy', icon: <Sparkles className="w-4 h-4" /> },
      { id: 'memory-search', label: 'Memory Search', icon: <Search className="w-4 h-4" /> },
      { id: 'cascade-leads', label: 'CASCADE', icon: <Phone className="w-4 h-4" /> },
    ]
  }
]

// Section accent colors for cyberpunk theming
const sectionAccent: Record<Section, { border: string; text: string; bg: string; glow: string }> = {
  brain: { border: 'border-fuchsia-500/60', text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15', glow: '0 0 20px rgba(255,0,255,0.3)' },
  labs: { border: 'border-emerald-400/60', text: 'text-emerald-300', bg: 'bg-emerald-500/15', glow: '0 0 20px rgba(0,255,128,0.3)' },
  ops: { border: 'border-cyan-400/60', text: 'text-cyan-300', bg: 'bg-cyan-500/15', glow: '0 0 20px rgba(0,255,255,0.3)' },
  command: { border: 'border-rose-500/60', text: 'text-rose-300', bg: 'bg-rose-500/15', glow: '0 0 20px rgba(255,0,100,0.3)' },
  forge: { border: 'border-orange-400/60', text: 'text-orange-300', bg: 'bg-orange-500/15', glow: '0 0 20px rgba(255,165,0,0.3)' },
}

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>('ops')
  const [activeTab, setActiveTab] = useState<Tab>('task-manager')
  const [btcPrice, setBtcPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    fetchBtcPrice()
    const btcInterval = setInterval(fetchBtcPrice, 60000)
    const clockInterval = setInterval(() => setTime(new Date()), 1000)
    return () => { clearInterval(btcInterval); clearInterval(clockInterval) }
  }, [])

  async function fetchBtcPrice() {
    try {
      const res = await fetch('http://localhost:3001/api/btc-price')
      const data = await res.json()
      setBtcPrice(data.price)
    } catch (e) {
      console.error('Failed to fetch BTC price')
    }
  }

  const currentSection = sidebarSections.find(s => s.id === activeSection)
  const tabs = currentSection?.tabs || []
  const accent = sectionAccent[activeSection]

  function handleSectionChange(section: Section) {
    setActiveSection(section)
    const firstTab = sidebarSections.find(s => s.id === section)?.tabs[0]
    if (firstTab) setActiveTab(firstTab.id)
  }

  return (
    <div className="min-h-screen bg-bg-void text-gray-100 flex overflow-hidden relative">
      {/* Global scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.015) 2px, rgba(0,255,255,0.015) 4px)',
        }}
      />

      {/* Sidebar */}
      <div className="w-20 bg-bg-void border-r border-neon-cyan/10 flex flex-col items-center py-4 gap-1 relative z-10">
        {/* Scanline effect on sidebar */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-x-0 h-[200%] animate-scanline opacity-[0.03]"
            style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(0,255,255,0.15) 50%, transparent 100%)' }}
          />
        </div>

        {/* Logo mark */}
        <div className="mb-4 flex flex-col items-center">
          <div
            className="w-10 h-10 flex items-center justify-center text-lg font-black tracking-tighter"
            style={{
              background: 'linear-gradient(135deg, #FF00FF, #00FFFF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 6px rgba(255,0,255,0.5))',
            }}
          >
            V
          </div>
          <div className="w-8 h-px bg-gradient-to-r from-transparent via-neon-cyan/40 to-transparent mt-2" />
        </div>

        {/* Nav buttons */}
        {sidebarSections.map((section) => {
          const isActive = activeSection === section.id
          const sAccent = sectionAccent[section.id]
          return (
            <button
              key={section.id}
              onClick={() => handleSectionChange(section.id)}
              className={`relative w-14 h-14 flex flex-col items-center justify-center gap-1 transition-all duration-200 group ${
                isActive ? sAccent.text : 'text-gray-500 hover:text-gray-300'
              }`}
              style={{
                clipPath: 'polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)',
                background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                boxShadow: isActive ? sAccent.glow : 'none',
              }}
              title={section.label}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div
                  className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r"
                  style={{
                    background: `linear-gradient(180deg, transparent, ${section.id === 'brain' ? '#FF00FF' : section.id === 'labs' ? '#00FF80' : section.id === 'ops' ? '#00FFFF' : section.id === 'forge' ? '#FFA500' : '#FF006E'}, transparent)`,
                    boxShadow: sAccent.glow,
                  }}
                />
              )}
              {section.icon}
              <span className="text-[9px] font-medium tracking-wider uppercase">{section.label}</span>
            </button>
          )
        })}

        {/* Separator */}
        <div className="w-10 h-px bg-gradient-to-r from-transparent via-neon-pink/20 to-transparent my-3" />

        {/* System status */}
        <div className="flex flex-col items-center gap-2 mt-auto mb-2">
          <div className="relative">
            <span className="block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400/40 animate-ping" />
          </div>
          <span className="text-[8px] text-gray-600 uppercase tracking-widest">SYS</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-bg-void/80 backdrop-blur-sm border-b border-neon-cyan/10 px-6 py-2 relative z-10">
          <div className="flex items-center justify-between">
            {/* Logo & Tabs */}
            <div className="flex items-center gap-6">
              {/* Animated Logo */}
              <div className="flex items-center gap-3">
                <h1
                  className="text-xl font-black tracking-[0.2em] uppercase animate-rgb-split select-none"
                  style={{
                    background: 'linear-gradient(90deg, #FF00FF, #00FFFF, #FF00FF)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    animation: 'gradient-shift 8s ease infinite, rgb-split 4s ease-in-out infinite',
                  }}
                >
                  VOLTA OS
                </h1>
                <span className={`text-[10px] uppercase tracking-widest ${accent.text} opacity-70 border-l border-gray-700/50 pl-3`}>
                  {currentSection?.label}
                </span>
              </div>

              {/* Tab Navigation */}
              <nav className="flex items-center gap-0.5">
                {tabs.map(tab => {
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative flex items-center gap-2 px-4 py-2 text-sm transition-all duration-150 ${
                        isActive
                          ? `${accent.text} ${accent.bg}`
                          : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
                      }`}
                      style={{
                        clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)',
                      }}
                    >
                      {/* Bottom accent line for active tab */}
                      {isActive && (
                        <div
                          className="absolute bottom-0 left-2 right-2 h-[1px]"
                          style={{
                            background: `linear-gradient(90deg, transparent, ${activeSection === 'brain' ? '#FF00FF' : activeSection === 'labs' ? '#00FF80' : activeSection === 'ops' ? '#00FFFF' : activeSection === 'forge' ? '#FFA500' : '#FF006E'}, transparent)`,
                            boxShadow: accent.glow,
                          }}
                        />
                      )}
                      {tab.icon}
                      <span className="whitespace-nowrap">{tab.label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* Status Bar */}
            <div className="flex items-center gap-3">
              {/* BTC Price Ticker */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 border border-neon-cyan/20 bg-neon-cyan/[0.03]"
                style={{ clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)' }}
              >
                <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs font-mono text-cyan-300 tracking-wider">
                  BTC ${btcPrice?.toLocaleString() || '---'}
                </span>
              </div>

              {/* System Online Indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 border border-emerald-500/20 bg-emerald-500/[0.03]"
                style={{ clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Online</span>
              </div>

              {/* Refresh */}
              <button
                onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1000) }}
                className="flex items-center gap-2 px-3 py-1.5 border border-neon-pink/30 bg-neon-pink/[0.05] hover:bg-neon-pink/10 text-neon-pink text-xs transition-colors"
                style={{ clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 bg-bg-void relative">
          {/* Subtle grid pattern overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(0,255,255,0.3) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,255,255,0.3) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />

          <div className="relative z-[1]">
            {/* OPS Section */}
            {activeTab === 'task-manager' && <TaskManager />}
            {activeTab === 'org-chart' && <OrgChart />}
            {activeTab === 'workspaces' && <Workspaces />}
            {activeTab === 'docs' && <DocsPage />}

            {/* BRAIN Section */}
            {activeTab === 'memory' && <MemoryTab />}
            {activeTab === 'claude-code' && <ClaudeCodePanel />}
            {activeTab === 'briefs' && <BriefsTab />}
            {activeTab === 'files' && <FilesTab />}
            {activeTab === 'projects' && <ProjectsTab />}

            {/* LABS Section */}
            {activeTab === 'synthesis' && <SynthesisView />}
            {activeTab === 'intelligence' && <IntelligencePanel />}
            {activeTab === 'ideas' && <IdeasPage />}
            {activeTab === 'prototypes' && <PrototypesPage />}
            {activeTab === 'reviews' && <ReviewsPage />}
            {activeTab === 'ideation' && <IdeationPage />}

            {/* OPS Section -- Agent Control & Tokens */}
            {activeTab === 'agents' && <AgentControl />}
            {activeTab === 'observability' && <ObservabilityDashboard />}
            {activeTab === 'tokens' && <TokenUsage />}

            {/* COMMAND Section */}
            {activeTab === 'console' && <ErisMornConsole />}
            {activeTab === 'decisions' && <DecisionFeed />}
            {activeTab === 'orders' && <StandingOrders />}
            {activeTab === 'triage' && <TriageView />}
            {activeTab === 'delegations' && <DelegationBoard />}

            {/* FORGE Section -- AgentForge x CASCADE */}
            {(activeTab === 'vector-galaxy' || activeTab === 'memory-search' || activeTab === 'cascade-leads') && (
              <AgentForgePage initialTab={activeTab} />
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="relative bg-bg-void/80 backdrop-blur-sm border-t border-neon-cyan/10 px-6 py-2 flex items-center justify-between text-xs z-10 overflow-hidden">
          {/* Holographic shimmer */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              background: 'linear-gradient(135deg, #FF00FF 0%, #00FFFF 25%, #FF00FF 50%, #00FFFF 75%, #FF00FF 100%)',
              backgroundSize: '400% 400%',
              animation: 'gradient-shift 12s ease infinite',
            }}
          />
          <span className="relative text-gray-500">
            <span className="text-neon-pink/60 font-mono">VOLTA OS</span>
            <span className="mx-2 text-gray-700">|</span>
            <span>ErisMorn + Volta</span>
            <span className="mx-2 text-gray-700">|</span>
            <span className="italic opacity-60">All hail Discordia</span>
          </span>
          <span className="relative font-mono text-gray-500">
            <span className="text-neon-cyan/50">24</span> models
            <span className="mx-1 text-gray-700">/</span>
            <span className="text-neon-pink/50">13</span> agents
            <span className="mx-1 text-gray-700">/</span>
            <span className="text-emerald-400/50">{time.toLocaleTimeString()}</span>
          </span>
        </footer>
      </div>
    </div>
  )
}

// Placeholder for sections not yet built
function PlaceholderPage({ icon, title, desc, section }: { icon: React.ReactNode; title: string; desc: string; section: string }) {
  const sectionColors = {
    brain: 'text-purple-500',
    labs: 'text-green-500',
    ops: 'text-amber-500',
    command: 'text-green-500'
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className={`w-16 h-16 mx-auto mb-4 ${sectionColors[section as keyof typeof sectionColors]}`}>
          {icon}
        </div>
        <h2 className="text-xl font-bold text-amber-100 mb-2">{title}</h2>
        <p className="text-gray-400 max-w-md">{desc}</p>
        <p className="text-xs text-gray-600 mt-4">Coming soon -- building the substrate</p>
      </div>
    </div>
  )
}

// Full Documentation Page
function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-bg-layer-1 border border-neon-cyan/10 rounded-lg p-8 relative overflow-hidden">
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-16 h-[1px] bg-gradient-to-r from-neon-pink/60 to-transparent" />
        <div className="absolute top-0 left-0 w-[1px] h-16 bg-gradient-to-b from-neon-pink/60 to-transparent" />
        <div className="absolute bottom-0 right-0 w-16 h-[1px] bg-gradient-to-l from-neon-cyan/60 to-transparent" />
        <div className="absolute bottom-0 right-0 w-[1px] h-16 bg-gradient-to-t from-neon-cyan/60 to-transparent" />

        <h1
          className="text-3xl font-black tracking-widest mb-2"
          style={{
            background: 'linear-gradient(90deg, #FF00FF, #00FFFF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          VOLTA OS
        </h1>
        <p className="text-gray-500 mb-8 font-mono text-sm">// The operational nervous system for Volta + ErisMorn</p>

        <div className="space-y-8">
          {/* What is VOLTA OS */}
          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-neon-cyan rounded-full shadow-[0_0_8px_rgba(0,255,255,0.5)]" />
              What is VOLTA OS?
            </h2>
            <div className="text-gray-300 space-y-3 pl-4 border-l border-neon-cyan/20">
              <p>VOLTA OS is the unified command center for human-AI collaboration. It combines:</p>
              <ul className="list-disc pl-6 space-y-1 text-sm">
                <li><strong className="text-neon-pink/80">Volta</strong> -- Human orchestrator, CEO, strategic direction</li>
                <li><strong className="text-neon-cyan/80">ErisMorn</strong> -- AI COO, curator, synthesizer, automation architect</li>
                <li><strong className="text-emerald-400/80">13 Sub-agents</strong> -- Specialized workers (SENTINEL, SCOUT, CURATOR, etc.)</li>
                <li><strong className="text-fuchsia-400/80">24 Models</strong> -- Claude, Ollama, LM Studio, Gemini, OpenAI, ElevenLabs</li>
              </ul>
            </div>
          </section>

          {/* Sections */}
          <section>
            <h2 className="text-xl font-semibold text-fuchsia-300 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-neon-pink rounded-full shadow-[0_0_8px_rgba(255,0,255,0.5)]" />
              Brain -- Knowledge & Memory
            </h2>
            <div className="text-gray-300 space-y-2 pl-4 border-l border-neon-pink/20 text-sm">
              <p><strong>Memory:</strong> MEMORY.md, daily logs, long-term synthesis</p>
              <p><strong>Briefs:</strong> Morning reports, status summaries, SYNTHESIZER outputs</p>
              <p><strong>Files:</strong> Workspace explorer -- inbox/, memory/, scripts/, projects/</p>
              <p><strong>Projects:</strong> CASCADE, Voltamachine, income-engine, hive-mind-backrooms</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-emerald-300 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-neon-green rounded-full shadow-[0_0_8px_rgba(0,255,0,0.5)]" />
              Labs -- Experimentation
            </h2>
            <div className="text-gray-300 space-y-2 pl-4 border-l border-emerald-500/20 text-sm">
              <p><strong>Ideas:</strong> Captured insights, spontaneous discoveries, SCOUT findings</p>
              <p><strong>Prototypes:</strong> WIP builds, experiments, MVPs</p>
              <p><strong>Reviews:</strong> Code reviews, design critiques, BUILDER outputs</p>
              <p><strong>Ideation:</strong> Brainstorming, mind maps, SYNTHESIZER patterns</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-neon-cyan rounded-full shadow-[0_0_8px_rgba(0,255,255,0.5)]" />
              Ops -- Operations
            </h2>
            <div className="text-gray-300 space-y-2 pl-4 border-l border-neon-cyan/20 text-sm">
              <p><strong>Task Manager:</strong> Model fleet, active sessions, cron jobs (13 agents)</p>
              <p><strong>Org Chart:</strong> Hierarchy -- Volta {'->'} ErisMorn {'->'} Departments {'->'} Agents</p>
              <p><strong>Workspaces:</strong> Project views, file trees, activity streams</p>
              <p><strong>Docs:</strong> This documentation + auto-generated reports</p>
            </div>
          </section>

          {/* What ErisMorn Can Do */}
          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-neon-cyan rounded-full shadow-[0_0_8px_rgba(0,255,255,0.5)]" />
              What Can ErisMorn Do?
            </h2>
            <div className="text-gray-300 pl-4 border-l border-neon-cyan/20">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-semibold text-fuchsia-300 mb-2">Knowledge Management</h4>
                  <ul className="space-y-1 text-gray-400">
                    <li>- Voltamachine curation (308+ docs)</li>
                    <li>- Obsidian + Notion indexing</li>
                    <li>- Pattern synthesis across domains</li>
                    <li>- Memory compression & archiving</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-cyan-300 mb-2">Automation</h4>
                  <ul className="space-y-1 text-gray-400">
                    <li>- 13 autonomous cron agents</li>
                    <li>- Portfolio monitoring</li>
                    <li>- Email/calendar checks</li>
                    <li>- GitHub activity tracking</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-emerald-300 mb-2">Communication</h4>
                  <ul className="space-y-1 text-gray-400">
                    <li>- Discord & Telegram integration</li>
                    <li>- Email access (3 accounts)</li>
                    <li>- Moltbook agent social network</li>
                    <li>- TTS via ElevenLabs</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-rose-300 mb-2">Research</h4>
                  <ul className="space-y-1 text-gray-400">
                    <li>- Web search (Brave API)</li>
                    <li>- Pieces LTM context awareness</li>
                    <li>- Browser automation</li>
                    <li>- Market research & analysis</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-amber-300 mb-2">Development</h4>
                  <ul className="space-y-1 text-gray-400">
                    <li>- Code generation & review</li>
                    <li>- Shell command execution</li>
                    <li>- Git operations</li>
                    <li>- Skill creation & management</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-cyan-300 mb-2">Monitoring</h4>
                  <ul className="space-y-1 text-gray-400">
                    <li>- BTC price alerts</li>
                    <li>- Portfolio margin tracking</li>
                    <li>- System health checks</li>
                    <li>- Cron job health monitoring</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Sub-Agents */}
          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-neon-cyan rounded-full shadow-[0_0_8px_rgba(0,255,255,0.5)]" />
              The 13 Agents
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { name: 'SENTINEL', desc: 'External signal monitor -- Telegram, Moltbook, GitHub' },
                { name: 'SCOUT', desc: 'Edge explorer -- emerging patterns, discoveries' },
                { name: 'CURATOR', desc: 'Memory weaver -- synthesis, MEMORY.md updates' },
                { name: 'SYNTHESIZER', desc: 'Pattern oracle -- daily synthesis at 3 AM' },
                { name: 'BUILDER', desc: 'Execution engine -- action plans, implementations' },
                { name: 'COMPRESSOR', desc: 'Memory maintenance -- compression, archiving' },
                { name: 'INCOME-SCOUT', desc: 'Money finder -- daily opportunity scan' },
                { name: 'VOLTAMACHINE INDEXER', desc: 'Knowledge curator -- Obsidian + Notion sync' },
                { name: 'PIECES LTM', desc: 'Digital life synthesis -- browser, apps, context' },
                { name: 'BTC PRICE ALERT', desc: 'Crypto monitor -- price levels, alerts' },
                { name: 'EMAIL HEARTBEAT', desc: 'Communication monitor -- inbox checks' },
                { name: 'TRADING REMINDER', desc: 'Monday sell orders -- SELL-LIST execution' },
                { name: 'PORTFOLIO MONITOR', desc: 'Margin tracker -- 6hr autonomous checks' },
              ].map(agent => (
                <div
                  key={agent.name}
                  className="bg-bg-void border border-neon-cyan/10 p-3 rounded relative overflow-hidden group hover:border-neon-cyan/30 transition-colors"
                >
                  <div className="absolute top-0 left-0 w-8 h-[1px] bg-neon-cyan/30 group-hover:w-full transition-all duration-500" />
                  <span className="text-neon-pink/80 font-mono text-xs">{agent.name}</span>
                  <p className="text-gray-500 mt-0.5">{agent.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Philosophy */}
          <section className="border-t border-neon-cyan/10 pt-6">
            <p className="text-center text-gray-500 italic font-mono text-sm">
              "Discord reveals truth. Patterns emerge from chaos. Systems make magic real."
            </p>
            <p className="text-center text-neon-pink/40 mt-2 text-sm">All hail Discordia</p>
          </section>
        </div>
      </div>
    </div>
  )
}
