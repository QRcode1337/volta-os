import { useState, useEffect } from 'react'
import {
  BookOpen, ClipboardList, FolderOpen, Layers, RefreshCw,
  ChevronRight, FileText, Calendar, Brain, Zap, Search,
  ChevronDown, FolderClosed, Clock, Hash
} from 'lucide-react'
import MarkdownPreview from './MarkdownPreview'

const API_BASE = 'http://localhost:3001/api'

// ============================================================
// MEMORY TAB - Enhanced with search + full file tree
// ============================================================
export function MemoryTab() {
  const [memoryMd, setMemoryMd] = useState<string>('')
  const [memoryList, setMemoryList] = useState<{
    dailyLogs: { date: string; size: number; mtime: string }[]
    subdirs: { name: string; fileCount: number }[]
    rootFiles: { name: string; size: number }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [dirFiles, setDirFiles] = useState<Record<string, { name: string; size: number; mtime: string }[]>>({})
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ file: string; line: number; content: string }[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Fetch MEMORY.md
      const memRes = await fetch(`${API_BASE}/file?path=MEMORY.md`)
      const memData = await memRes.json()
      setMemoryMd(memData.content || '')

      // Fetch memory listing
      const listRes = await fetch(`${API_BASE}/memory/list`)
      const listData = await listRes.json()
      setMemoryList(listData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadFile(filePath: string) {
    setSelectedFile(filePath)
    setSearchResults(null)
    try {
      const res = await fetch(`${API_BASE}/file?path=${filePath}`)
      const data = await res.json()
      setFileContent(data.content || 'No content')
    } catch (e) {
      setFileContent('Failed to load')
    }
  }

  async function toggleDir(dirName: string) {
    const newExpanded = new Set(expandedDirs)
    
    if (expandedDirs.has(dirName)) {
      newExpanded.delete(dirName)
    } else {
      newExpanded.add(dirName)
      // Load dir contents if not cached
      if (!dirFiles[dirName]) {
        try {
          const res = await fetch(`${API_BASE}/memory/dir/${dirName}`)
          const data = await res.json()
          setDirFiles(prev => ({ ...prev, [dirName]: data.files || [] }))
        } catch (e) {
          console.error(e)
        }
      }
    }
    
    setExpandedDirs(newExpanded)
  }

  async function search() {
    if (!searchQuery || searchQuery.length < 2) return
    
    setSearching(true)
    setSelectedFile(null)
    try {
      const res = await fetch(`${API_BASE}/memory/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch (e) {
      console.error(e)
    } finally {
      setSearching(false)
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  function formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return <div className="text-gray-400 p-8">Loading memory...</div>
  }

  return (
    <div className="grid grid-cols-3 gap-4 h-full">
      {/* Left: File tree + search */}
      <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4 overflow-hidden flex flex-col">
        {/* Search */}
        <div className="mb-3">
          <div className="relative">
            <Search className="absolute left-2 top-2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search memory..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              className="w-full bg-[#252b3b] border border-purple-900/30 rounded pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-600"
            />
          </div>
          {searching && <div className="text-xs text-purple-400 mt-1">Searching...</div>}
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-auto space-y-1">
          {/* MEMORY.md */}
          <button
            onClick={() => {
              setSelectedFile(null)
              setSearchResults(null)
            }}
            className={`w-full text-left p-2 rounded text-sm flex items-center gap-2 ${
              !selectedFile && !searchResults 
                ? 'bg-purple-900/40 text-purple-200' 
                : 'hover:bg-[#252b3b] text-gray-300'
            }`}
          >
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="flex-1">MEMORY.md</span>
            <span className="text-[10px] text-gray-500">Long-term</span>
          </button>

          {/* Daily Logs section */}
          <div className="pt-2 border-t border-purple-900/20 mt-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 px-2">
              Daily Logs ({memoryList?.dailyLogs.length || 0})
            </div>
            <div className="space-y-0.5 max-h-40 overflow-auto">
              {memoryList?.dailyLogs.slice(0, 14).map(log => (
                <button
                  key={log.date}
                  onClick={() => loadFile(`memory/${log.date}.md`)}
                  className={`w-full text-left p-1.5 rounded text-xs flex items-center gap-2 ${
                    selectedFile === `memory/${log.date}.md`
                      ? 'bg-purple-900/40 text-purple-200'
                      : 'hover:bg-[#252b3b] text-gray-400'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span className="font-mono flex-1">{log.date}</span>
                  <span className="text-[10px] text-gray-600">{formatSize(log.size)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subdirectories */}
          <div className="pt-2 border-t border-purple-900/20 mt-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 px-2">
              Agent Outputs
            </div>
            <div className="space-y-0.5 max-h-60 overflow-auto">
              {memoryList?.subdirs.map(dir => (
                <div key={dir.name}>
                  <button
                    onClick={() => toggleDir(dir.name)}
                    className="w-full text-left p-1.5 rounded text-xs flex items-center gap-2 hover:bg-[#252b3b] text-gray-400"
                  >
                    {expandedDirs.has(dir.name) ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {expandedDirs.has(dir.name) ? (
                      <FolderOpen className="w-3 h-3 text-amber-400" />
                    ) : (
                      <FolderClosed className="w-3 h-3 text-amber-400" />
                    )}
                    <span className="flex-1">{dir.name}</span>
                    <span className="text-[10px] text-gray-600">{dir.fileCount}</span>
                  </button>
                  
                  {/* Expanded directory contents */}
                  {expandedDirs.has(dir.name) && dirFiles[dir.name] && (
                    <div className="ml-6 space-y-0.5 mt-0.5">
                      {dirFiles[dir.name].slice(0, 10).map(file => (
                        <button
                          key={file.name}
                          onClick={() => loadFile(`memory/${dir.name}/${file.name}`)}
                          className={`w-full text-left p-1 rounded text-[11px] flex items-center gap-1.5 ${
                            selectedFile === `memory/${dir.name}/${file.name}`
                              ? 'bg-purple-900/40 text-purple-200'
                              : 'hover:bg-[#252b3b] text-gray-500'
                          }`}
                        >
                          <FileText className="w-3 h-3" />
                          <span className="truncate flex-1">{file.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Content viewer */}
      <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4 col-span-2 overflow-auto">
        {searchResults ? (
          // Search results view
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                <Search className="w-4 h-4" />
                Search: "{searchQuery}" ({searchResults.length} results)
              </h3>
              <button 
                onClick={() => setSearchResults(null)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              {searchResults.map((result, i) => (
                <button
                  key={`${result.file}-${result.line}-${i}`}
                  onClick={() => loadFile(result.file.startsWith('memory/') ? result.file : `memory/${result.file}`)}
                  className="w-full text-left p-2 rounded bg-[#252b3b] hover:bg-[#2a3142] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-3 h-3 text-purple-400" />
                    <span className="text-xs text-purple-300 font-mono">{result.file}</span>
                    <span className="text-[10px] text-gray-600 flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      {result.line}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 truncate">{result.content}</div>
                </button>
              ))}
              {searchResults.length === 0 && (
                <div className="text-center text-gray-500 py-8">No results found</div>
              )}
            </div>
          </>
        ) : selectedFile ? (
          // File content view
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {selectedFile}
              </h3>
              <button 
                onClick={() => setSelectedFile(null)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                ← Back
              </button>
            </div>
            <MarkdownPreview content={fileContent} className="" />
          </>
        ) : (
          // MEMORY.md view
          <>
            <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4" />
              MEMORY.md — Long-Term Memory
            </h3>
            <MarkdownPreview content={memoryMd || 'No MEMORY.md found'} className="" />
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================
// BRIEFS TAB
// ============================================================
export function BriefsTab() {
  const [briefs, setBriefs] = useState<{name: string; content: string}[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBrief, setSelectedBrief] = useState<string | null>(null)

  useEffect(() => {
    loadBriefs()
  }, [])

  async function loadBriefs() {
    setLoading(true)
    try {
      // Fetch from memory subdirs
      const dirs = ['synthesis', 'curated', 'scout', 'sentinel']
      const allBriefs: {name: string; content: string}[] = []
      
      for (const dir of dirs) {
        try {
          const res = await fetch(`${API_BASE}/memory/dir/${dir}`)
          const data = await res.json()
          
          if (data.files) {
            for (const file of data.files.slice(0, 3)) {
              const contentRes = await fetch(`${API_BASE}/file?path=memory/${dir}/${file.name}`)
              const contentData = await contentRes.json()
              if (contentData.content) {
                allBriefs.push({
                  name: `${dir}/${file.name}`,
                  content: contentData.content
                })
              }
            }
          }
        } catch (e) {
          // Skip missing dirs
        }
      }
      
      setBriefs(allBriefs)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-gray-400 p-8">Loading briefs...</div>
  }

  const selected = briefs.find(b => b.name === selectedBrief)

  return (
    <div className="grid grid-cols-3 gap-4 h-full">
      {/* Left: Brief list */}
      <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4 overflow-auto">
        <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Synthesis Reports
        </h3>
        {briefs.length === 0 ? (
          <p className="text-xs text-gray-500">No recent briefs found</p>
        ) : (
          <div className="space-y-1">
            {briefs.map(brief => (
              <button
                key={brief.name}
                onClick={() => setSelectedBrief(brief.name)}
                className={`w-full text-left p-2 rounded text-xs transition-colors ${
                  selectedBrief === brief.name 
                    ? 'bg-purple-900/40 text-purple-200' 
                    : 'hover:bg-[#252b3b] text-gray-300'
                }`}
              >
                <div className="font-mono truncate">{brief.name}</div>
              </button>
            ))}
          </div>
        )}
        
        {/* Quick actions */}
        <div className="mt-4 pt-4 border-t border-purple-900/30">
          <h4 className="text-xs text-gray-500 mb-2">Sub-Agent Schedules</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2 text-purple-400">
              <Zap className="w-3 h-3" /> SYNTHESIZER — 3 AM daily
            </div>
            <div className="flex items-center gap-2 text-green-400">
              <Zap className="w-3 h-3" /> CURATOR — every 6h
            </div>
            <div className="flex items-center gap-2 text-blue-400">
              <Zap className="w-3 h-3" /> SCOUT — every 8h
            </div>
            <div className="flex items-center gap-2 text-amber-400">
              <Zap className="w-3 h-3" /> SENTINEL — every 4h
            </div>
          </div>
        </div>
      </div>

      {/* Right: Content */}
      <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4 col-span-2 overflow-auto">
        {selected ? (
          <>
            <h3 className="text-sm font-semibold text-purple-300 mb-3">{selected.name}</h3>
            <MarkdownPreview content={selected.content} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a brief to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// FILES TAB - Dynamic directory listing
// ============================================================
export function FilesTab() {
  const [currentPath, setCurrentPath] = useState('')
  const [items, setItems] = useState<{ name: string; type: 'dir' | 'file'; size: number; mtime: string }[]>([])
  const [fileContent, setFileContent] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadDirectory(currentPath)
  }, [currentPath])

  async function loadDirectory(path: string) {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/directory?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      setItems(data.items || [])
    } catch (e) {
      console.error(e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  async function openFile(name: string) {
    const path = currentPath ? `${currentPath}/${name}` : name
    setSelectedFile(path)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/file?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      setFileContent(data.content || 'Unable to load file')
    } catch (e) {
      setFileContent('Error loading file')
    } finally {
      setLoading(false)
    }
  }

  function navigateTo(dir: string) {
    if (dir === '..') {
      const parts = currentPath.split('/')
      parts.pop()
      setCurrentPath(parts.join('/'))
    } else {
      setCurrentPath(currentPath ? `${currentPath}/${dir}` : dir)
    }
    setSelectedFile('')
    setFileContent('')
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`
  }

  return (
    <div className="grid grid-cols-3 gap-4 h-full">
      {/* Left: File tree */}
      <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4 overflow-auto">
        <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          ~/ErisMorn/{currentPath}
        </h3>
        
        {currentPath && (
          <button
            onClick={() => navigateTo('..')}
            className="w-full text-left p-2 rounded text-sm hover:bg-[#252b3b] text-gray-400 flex items-center gap-2 mb-1"
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
            ..
          </button>
        )}
        
        {loading && !selectedFile ? (
          <div className="text-xs text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-0.5">
            {items.map(item => (
              <button
                key={item.name}
                onClick={() => item.type === 'dir' ? navigateTo(item.name) : openFile(item.name)}
                className={`w-full text-left p-2 rounded text-sm transition-colors flex items-center gap-2 ${
                  selectedFile === (currentPath ? `${currentPath}/${item.name}` : item.name)
                    ? 'bg-purple-900/40 text-purple-200'
                    : 'hover:bg-[#252b3b] text-gray-300'
                }`}
              >
                {item.type === 'dir' ? (
                  <FolderClosed className="w-4 h-4 text-amber-400" />
                ) : (
                  <FileText className="w-4 h-4 text-gray-400" />
                )}
                <span className="flex-1 truncate">{item.name}</span>
                {item.type === 'file' && (
                  <span className="text-[10px] text-gray-600">{formatSize(item.size)}</span>
                )}
                {item.type === 'dir' && <ChevronRight className="w-3 h-3 text-gray-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: File content */}
      <div className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4 col-span-2 overflow-auto">
        {loading && selectedFile ? (
          <div className="text-gray-400">Loading...</div>
        ) : selectedFile ? (
          <>
            <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {selectedFile}
            </h3>
            <MarkdownPreview content={fileContent} className="" />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a file to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// PROJECTS TAB
// ============================================================
export function ProjectsTab() {
  const projects = [
    {
      name: 'CASCADE',
      status: 'active',
      desc: 'AI Workflow Automation Platform — ~50% MVP',
      path: '~/Documents/PROJECTS/CASCADE',
      tags: ['TypeScript', 'Next.js', 'Node.js'],
      progress: 50
    },
    {
      name: 'Voltamachine',
      status: 'active', 
      desc: 'Esoteric knowledge archive — 308 docs indexed',
      path: '/Volumes/Voltamachina/voltamachine_v3',
      tags: ['Research', 'Obsidian', 'Notion'],
      progress: 100
    },
    {
      name: 'ORCHESTRA OS',
      status: 'active',
      desc: 'Agent operations dashboard',
      path: '~/ErisMorn/volta-os',
      tags: ['React', 'TypeScript', 'Vite'],
      progress: 80
    },
    {
      name: 'income-engine',
      status: 'planning',
      desc: 'Revenue generation strategies & tracking',
      path: '~/ErisMorn/projects/income-engine',
      tags: ['Strategy', 'Automation'],
      progress: 20
    },
    {
      name: 'hive-mind-backrooms',
      status: 'research',
      desc: 'Multi-agent consciousness experiments',
      path: '~/Documents/PROJECTS/hive-mind-backrooms',
      tags: ['AI', 'Research', 'Experiments'],
      progress: 30
    },
    {
      name: 'PRISM VECTOR',
      status: 'planning',
      desc: 'Government contracts strategy',
      path: '~/ErisMorn/projects/prism-vector',
      tags: ['Business', 'Gov'],
      progress: 10
    }
  ]

  const statusColors = {
    active: 'bg-green-900/50 text-green-300',
    planning: 'bg-yellow-900/50 text-yellow-300',
    research: 'bg-blue-900/50 text-blue-300',
    paused: 'bg-gray-700/50 text-gray-300'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-purple-300 flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Active Projects
        </h2>
        <span className="text-xs text-gray-500">{projects.length} projects</span>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {projects.map(project => (
          <div 
            key={project.name}
            className="bg-[#1e2433] border border-purple-900/30 rounded-lg p-4 hover:border-purple-700/50 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-amber-100">{project.name}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded ${statusColors[project.status as keyof typeof statusColors]}`}>
                {project.status}
              </span>
            </div>
            
            <p className="text-xs text-gray-400 mb-3">{project.desc}</p>
            
            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                <span>Progress</span>
                <span>{project.progress}%</span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
            
            {/* Tags */}
            <div className="flex flex-wrap gap-1">
              {project.tags.map(tag => (
                <span key={tag} className="text-[10px] bg-[#252b3b] text-gray-400 px-2 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
            
            <div className="mt-3 pt-3 border-t border-purple-900/30">
              <code className="text-[10px] text-gray-500 font-mono">{project.path}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
