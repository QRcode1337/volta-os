import { useState, useEffect } from 'react'
import { Cpu, CheckCircle, Archive, Folder, Clock, AlertTriangle, TrendingUp, Zap, RefreshCw, Send, FileText, ChevronDown, ChevronRight, Wifi, WifiOff } from 'lucide-react'
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as api from '../lib/api'
import { useOpenClaw } from '../hooks/useOpenClaw'
import { QuickActions, CronTrigger } from './QuickActions'

// Job output display component
function CronOutputPanel({ outputs }: { outputs: api.CronOutputs | null }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<{ jobKey: string; file: string; content: string } | null>(null)
  
  if (!outputs) return null
  
  const jobNames: Record<string, string> = {
    'sentinel': 'SENTINEL',
    'scout': 'SCOUT',
    'synthesis': 'SYNTHESIZER',
    'curator': 'CURATOR',
    'pieces-ltm': 'Pieces LTM',
    'voltamachine': 'Voltamachine',
    'portfolio': 'Portfolio',
    'builder': 'BUILDER'
  }
  
  const loadFullOutput = async (jobKey: string, file: string) => {
    const data = await api.fetchCronOutput(jobKey, file)
    setSelectedFile(data)
  }
  
  return (
    <div className="mt-4">
      <h3 className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-300">
        <FileText className="w-4 h-4 text-purple-400" />
        Latest Agent Outputs
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(outputs.outputs)
          .filter(([_, files]) => files.length > 0)
          .map(([jobKey, files]) => (
            <div key={jobKey} className="bg-[#252b3b] rounded-lg border border-gray-700/50 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === jobKey ? null : jobKey)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2d3447] transition-colors"
              >
                <span className="text-xs font-medium text-gray-200">{jobNames[jobKey] || jobKey}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">{files.length} file(s)</span>
                  {expanded === jobKey ? (
                    <ChevronDown className="w-3 h-3 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-gray-500" />
                  )}
                </div>
              </button>
              {expanded === jobKey && (
                <div className="border-t border-gray-700/30 p-2 space-y-2">
                  {files.map((f) => (
                    <div
                      key={f.file}
                      className="bg-[#1a1f2e] rounded p-2 cursor-pointer hover:bg-[#1e2433] transition-colors"
                      onClick={() => loadFullOutput(jobKey, f.file)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-blue-400">{f.file}</span>
                        <span className="text-[9px] text-gray-500">
                          {new Date(f.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <pre className="text-[10px] text-gray-400 whitespace-pre-wrap line-clamp-3 overflow-hidden">
                        {f.preview}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
      
      {/* Full output modal */}
      {selectedFile && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-8" onClick={() => setSelectedFile(null)}>
          <div className="bg-[#1a1f2e] rounded-lg border border-gray-700 max-w-4xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <span className="text-sm font-medium text-gray-200">
                {jobNames[selectedFile.jobKey] || selectedFile.jobKey} / {selectedFile.file}
              </span>
              <button onClick={() => setSelectedFile(null)} className="text-gray-500 hover:text-gray-300">✕</button>
            </div>
            <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-[calc(80vh-60px)]">
              {selectedFile.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// Types
type TaskStatus = 'todo' | 'progress' | 'done' | 'archived'

interface Task {
  id: string
  title: string
  date: string
  status: TaskStatus
  progress?: number
  cronJob?: api.CronJob
}

// Sortable Task Card
function SortableTaskCard({ task, onProgressChange }: { task: Task; onProgressChange?: (id: string, value: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getStatusIndicator = () => {
    if (task.cronJob?.state?.lastStatus === 'error') {
      return <AlertTriangle className="w-3 h-3 text-red-400" />
    }
    if (task.cronJob?.state?.lastStatus === 'ok') {
      return <CheckCircle className="w-3 h-3 text-green-400" />
    }
    return null
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-[#2d3447] hover:bg-[#353b4f] rounded-md p-3 cursor-grab active:cursor-grabbing transition-colors border border-gray-700/30"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-xs mb-1.5 text-gray-100 leading-tight flex-1">{task.title}</h3>
        {getStatusIndicator()}
      </div>
      <p className="text-[10px] text-gray-400">{task.date}</p>
      {task.status === 'progress' && task.progress !== undefined && (
        <div className="mt-2">
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${task.progress > 66 ? 'bg-green-500' : task.progress > 33 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Droppable Column
function DroppableColumn({
  id,
  title,
  icon,
  headerColor,
  borderColor,
  tasks,
  count
}: {
  id: string
  title: string
  icon: string
  headerColor: string
  borderColor: string
  tasks: Task[]
  count?: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`bg-[#1e2433] rounded-lg border ${borderColor} ${isOver ? 'ring-2 ring-blue-500/50' : ''}`}
    >
      <div className={`${headerColor} px-3 py-2 rounded-t-lg flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-medium text-white">{title}</span>
        </div>
        <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded text-white/80">
          {count ?? tasks.length}
        </span>
      </div>
      <div className="p-2 space-y-2 min-h-[120px] max-h-[300px] overflow-y-auto">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <SortableTaskCard key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

// Main Dashboard Component
export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [btcPrice, setBtcPrice] = useState<number | null>(null)
  const [heartbeatState, setHeartbeatState] = useState<api.HeartbeatState | null>(null)
  const [actionLog, setActionLog] = useState<api.ActionLogEntry[]>([])
  const [cronOutputs, setCronOutputs] = useState<api.CronOutputs | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  
  // WebSocket connection to OpenClaw
  const { connected: wsConnected, lastMessage, messages: wsMessages } = useOpenClaw()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Load data on mount
  useEffect(() => {
    loadData()
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      
      // Fetch all data in parallel
      const [cronData, btcData, hbState, logData, outputsData] = await Promise.all([
        api.fetchCronJobs(),
        api.fetchBtcPrice(),
        api.fetchHeartbeatState(),
        api.fetchActionLog(),
        api.fetchCronOutputs()
      ])

      // Transform cron jobs to tasks
      if (cronData.jobs) {
        const cronTasks = api.cronJobsToTasks(cronData.jobs)
        setTasks(cronTasks)
      }

      setBtcPrice(btcData.price)
      setHeartbeatState(hbState)
      setActionLog(logData.actions || [])
      setCronOutputs(outputsData)
      setLastRefresh(new Date())
    } catch (e) {
      console.error('Failed to load data:', e)
    } finally {
      setLoading(false)
    }
  }

  // Group tasks by status
  const tasksByStatus = {
    todo: tasks.filter(t => t.status === 'todo'),
    progress: tasks.filter(t => t.status === 'progress'),
    done: tasks.filter(t => t.status === 'done'),
    archived: tasks.filter(t => t.status === 'archived'),
  }

  // Drag handlers
  function handleDragStart(event: any) {
    setActiveTask(tasks.find(t => t.id === event.active.id) || null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const taskId = active.id as string
    const newStatus = over.id as TaskStatus

    if (['todo', 'progress', 'done', 'archived'].includes(newStatus)) {
      setTasks(prev =>
        prev.map(task =>
          task.id === taskId ? { ...task, status: newStatus } : task
        )
      )
    }
  }

  // Send note to ErisMorn
  async function handleAddNote() {
    if (!note.trim()) return
    await api.sendTask(note)
    setNote('')
    loadData() // Refresh
  }

  // Send message to main session
  async function handleSendMessage() {
    if (!message.trim()) return
    await api.sendMessage(message)
    setMessage('')
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-[#0f1219] text-gray-100">
        {/* Header */}
        <header className="bg-[#1a1f2e] border-b border-gray-800 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <h1 className="text-lg font-bold text-white">VOLTA OS</h1>
                <p className="text-xs text-gray-400">Agent Operations Center • 13 Sub-Agents</p>
              </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center gap-4">
              {/* WebSocket Status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                wsConnected ? 'bg-green-900/30' : 'bg-red-900/30'
              }`}>
                {wsConnected ? (
                  <Wifi className="w-4 h-4 text-green-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-400" />
                )}
                <span className={`text-xs ${wsConnected ? 'text-green-300' : 'text-red-300'}`}>
                  {wsConnected ? 'Live' : 'Offline'}
                </span>
              </div>

              {/* BTC Price */}
              <div className="flex items-center gap-2 bg-[#252b3b] px-3 py-1.5 rounded-lg">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-mono">
                  BTC: ${btcPrice?.toLocaleString() || '---'}
                </span>
              </div>

              {/* Margin Status */}
              {heartbeatState?.trading && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  parseFloat(heartbeatState.trading.lastMarginValue || '0') > 50 
                    ? 'bg-red-900/50' 
                    : 'bg-green-900/50'
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-mono">
                    Margin: {heartbeatState.trading.lastMarginValue || '?'}%
                  </span>
                </div>
              )}

              {/* Refresh */}
              <button
                onClick={loadData}
                disabled={loading}
                className="flex items-center gap-2 bg-[#5865f2] hover:bg-[#4752c4] px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-6">
          {/* Critical Alerts */}
          {heartbeatState?.criticalAlerts && heartbeatState.criticalAlerts.length > 0 && (
            <div className="mb-4 bg-red-900/30 border border-red-500/50 rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-red-400 font-medium text-sm mb-2">
                <AlertTriangle className="w-4 h-4" />
                Critical Alerts
              </h3>
              <ul className="space-y-1">
                {heartbeatState.criticalAlerts.map((alert, i) => (
                  <li key={i} className="text-xs text-red-300">• {alert}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Cron Jobs as Task Board */}
          <div className="mb-6">
            <h2 className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-300">
              <Zap className="w-4 h-4 text-yellow-500" />
              Cron Jobs / Sub-Agents
              <span className="text-[10px] text-gray-500 ml-2">
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </span>
            </h2>
            <div className="grid grid-cols-4 gap-3">
              <DroppableColumn
                id="todo"
                title="Pending"
                icon="📋"
                headerColor="bg-[#5865f2]"
                borderColor="border-[#5865f2]/30"
                tasks={tasksByStatus.todo}
              />
              <DroppableColumn
                id="progress"
                title="Running / Errors"
                icon="⚡"
                headerColor="bg-[#faa61a]"
                borderColor="border-[#faa61a]/30"
                tasks={tasksByStatus.progress}
              />
              <DroppableColumn
                id="done"
                title="Healthy"
                icon="✅"
                headerColor="bg-[#57f287]"
                borderColor="border-[#57f287]/30"
                tasks={tasksByStatus.done}
              />
              <DroppableColumn
                id="archived"
                title="Disabled"
                icon="🗄️"
                headerColor="bg-[#4e5569]"
                borderColor="border-[#4e5569]/30"
                tasks={tasksByStatus.archived}
              />
            </div>
            
            {/* Agent Outputs */}
            <CronOutputPanel outputs={cronOutputs} />
          </div>

          {/* Strategic Opportunities */}
          {heartbeatState?.strategicOpportunities && heartbeatState.strategicOpportunities.length > 0 && (
            <div className="mb-6 bg-green-900/20 border border-green-500/30 rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-green-400 font-medium text-sm mb-2">
                <TrendingUp className="w-4 h-4" />
                Strategic Opportunities
              </h3>
              <ul className="space-y-1">
                {heartbeatState.strategicOpportunities.map((opp, i) => (
                  <li key={i} className="text-xs text-green-300">• {opp}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Bottom Section */}
          <div className="grid grid-cols-3 gap-4">
            {/* Quick Actions */}
            <div>
              <QuickActions />
              
              {/* Cron Trigger */}
              <div className="mt-4">
                <CronTrigger jobs={tasks.map(t => ({ 
                  id: t.cronJob?.id || t.id, 
                  name: t.title 
                }))} />
              </div>
            </div>

            {/* Send Message to ErisMorn */}
            <div>
              <h2 className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-300">
                <Send className="w-4 h-4 text-blue-400" />
                Message ErisMorn
              </h2>
              <div className="bg-[#252b3b] rounded-lg p-4 border border-gray-700/50">
                <textarea
                  className="w-full bg-[#1a1f2e] border border-gray-700/50 rounded p-2.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5865f2] focus:ring-1 focus:ring-[#5865f2]"
                  placeholder="Type a message to send to ErisMorn's main session..."
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button
                  onClick={handleSendMessage}
                  className="mt-3 bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 py-1.5 rounded text-xs font-medium transition-colors"
                >
                  Send Message
                </button>
              </div>
              
              {/* WebSocket Messages */}
              {wsMessages.length > 0 && (
                <div className="mt-4 bg-[#252b3b] rounded-lg p-3 border border-purple-700/30">
                  <h4 className="text-xs text-purple-300 mb-2 flex items-center gap-2">
                    <Wifi className="w-3 h-3" />
                    Live Messages ({wsMessages.length})
                  </h4>
                  <div className="space-y-1 max-h-24 overflow-auto">
                    {wsMessages.slice(-5).reverse().map((msg, i) => (
                      <div key={i} className="text-[10px] text-gray-400 truncate">
                        {msg.type}: {JSON.stringify(msg.data || msg).slice(0, 60)}...
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Log */}
            <div>
              <h2 className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-300">
                <Clock className="w-4 h-4 text-yellow-500" />
                Today's Action Log
              </h2>
              <div className="bg-[#252b3b] rounded-lg p-4 border border-gray-700/50 max-h-64 overflow-y-auto">
                {actionLog.length > 0 ? (
                  <div className="space-y-2.5">
                    {actionLog.map(entry => (
                      <div key={entry.id} className="pb-2.5 border-b border-gray-700/30 last:border-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                          <span className="text-[10px] text-yellow-400">{entry.timestamp}</span>
                        </div>
                        <p className="text-xs text-gray-300 leading-tight">{entry.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No actions logged today yet.</p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="bg-[#3a4052] rounded-md p-3 border border-blue-500/50 shadow-2xl opacity-90">
            <h3 className="font-medium text-xs mb-1.5 text-gray-100 leading-tight">{activeTask.title}</h3>
            <p className="text-[10px] text-gray-400">{activeTask.date}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
