import { useState, useEffect } from 'react'
import { Folder, FileText, Eye, Edit, Save } from 'lucide-react'

interface WorkspaceFile {
  name: string
  size: string
  path: string
}

interface Workspace {
  id: string
  name: string
  description: string
  emoji: string
  path: string
  files: WorkspaceFile[]
}

const workspaces: Workspace[] = [
  {
    id: 'erismorn',
    name: 'ErisMorn (Main)',
    description: 'Ghost in the machine — keeper of the golden apple',
    emoji: '🍎',
    path: '~/ErisMorn',
    files: [
      { name: 'SOUL.md', size: '4.7kb', path: 'SOUL.md' },
      { name: 'IDENTITY.md', size: '3.2kb', path: 'IDENTITY.md' },
      { name: 'USER.md', size: '5.1kb', path: 'USER.md' },
      { name: 'TOOLS.md', size: '2.8kb', path: 'TOOLS.md' },
      { name: 'AGENTS.md', size: '7.9kb', path: 'AGENTS.md' },
      { name: 'MEMORY.md', size: '4.2kb', path: 'MEMORY.md' },
      { name: 'HEARTBEAT.md', size: '3.1kb', path: 'HEARTBEAT.md' },
    ]
  },
  {
    id: 'atlas',
    name: 'Atlas (CTO)',
    description: 'Technical execution, first principles engineering',
    emoji: '🔧',
    path: '~/ErisMorn/agents/atlas',
    files: [
      { name: 'SOUL.md', size: '2.1kb', path: 'agents/atlas/SOUL.md' },
      { name: 'TOOLS.md', size: '1.4kb', path: 'agents/atlas/TOOLS.md' },
    ]
  },
  {
    id: 'oracle',
    name: 'Oracle (CRO)',
    description: 'Research, pattern recognition, Seraph Protocol',
    emoji: '🔮',
    path: '~/ErisMorn/agents/oracle',
    files: [
      { name: 'SOUL.md', size: '2.3kb', path: 'agents/oracle/SOUL.md' },
      { name: 'MEMORY.md', size: '1.8kb', path: 'agents/oracle/MEMORY.md' },
    ]
  },
  {
    id: 'midas',
    name: 'Midas (CFO)',
    description: 'Revenue operations, financial monitoring',
    emoji: '💰',
    path: '~/ErisMorn/agents/midas',
    files: [
      { name: 'SOUL.md', size: '1.9kb', path: 'agents/midas/SOUL.md' },
      { name: 'TOOLS.md', size: '0.8kb', path: 'agents/midas/TOOLS.md' },
    ]
  }
]

export default function Workspaces() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace>(workspaces[0])
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function loadFile(file: WorkspaceFile) {
    setLoading(true)
    setSelectedFile(file)
    
    try {
      // Fetch file content from API
      const res = await fetch(`http://localhost:3001/api/file?path=${encodeURIComponent(file.path)}`)
      if (res.ok) {
        const data = await res.json()
        setFileContent(data.content || '# File not found')
      } else {
        // For demo, show placeholder
        setFileContent(`# ${file.name}\n\nSelect a file from the sidebar to view/edit.`)
      }
    } catch (e) {
      setFileContent(`# ${file.name}\n\n*Loading from ~/ErisMorn/${file.path}*`)
    } finally {
      setLoading(false)
    }
  }

  // Load SOUL.md by default
  useEffect(() => {
    if (selectedWorkspace.files.length > 0) {
      loadFile(selectedWorkspace.files[0])
    }
  }, [selectedWorkspace])

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <div className="w-72 bg-[#0f1219] border-r border-gray-800 p-4 overflow-y-auto">
        <h2 className="flex items-center gap-2 text-sm font-medium text-amber-300 mb-4">
          <Folder className="w-4 h-4" />
          Agent Workspaces
        </h2>
        <p className="text-xs text-gray-500 mb-4">View and edit agent configuration files</p>

        {/* Workspace List */}
        <div className="space-y-1 mb-6">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Workspaces</p>
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => setSelectedWorkspace(ws)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                selectedWorkspace.id === ws.id 
                  ? 'bg-amber-900/30 text-amber-100 border border-amber-700/50' 
                  : 'hover:bg-[#1e2433] text-gray-300'
              }`}
            >
              <span>{ws.emoji}</span>
              <span className="text-sm">{ws.name}</span>
            </button>
          ))}
        </div>

        {/* Files List */}
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Files</p>
          {selectedWorkspace.files.map(file => (
            <button
              key={file.name}
              onClick={() => loadFile(file)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                selectedFile?.name === file.name 
                  ? 'bg-amber-900/30 text-amber-100 border border-amber-700/50' 
                  : 'hover:bg-[#1e2433] text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="text-sm">{file.name}</span>
              </div>
              <span className="text-[10px] text-gray-500">{file.size}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-[#0f1219]">
          <div className="flex items-center gap-3">
            <span className="text-xl">{selectedWorkspace.emoji}</span>
            <div>
              <h3 className="text-sm font-medium text-amber-100">{selectedWorkspace.name}</h3>
              <p className="text-[10px] text-gray-500">{selectedWorkspace.path}</p>
            </div>
          </div>
          
          {selectedFile && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsEditing(false)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs transition-colors ${
                  !isEditing ? 'bg-amber-600 text-white' : 'bg-[#252b3b] text-gray-300 hover:bg-[#353b4f]'
                }`}
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
              <button 
                onClick={() => setIsEditing(true)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs transition-colors ${
                  isEditing ? 'bg-amber-600 text-white' : 'bg-[#252b3b] text-gray-300 hover:bg-[#353b4f]'
                }`}
              >
                <Edit className="w-3 h-3" />
                Edit
              </button>
              <button 
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-green-700 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
                disabled={!isEditing}
              >
                <Save className="w-3 h-3" />
                Save
              </button>
            </div>
          )}
        </div>

        {/* File Content */}
        <div className="flex-1 overflow-auto p-6 bg-[#0f1219]">
          {selectedFile ? (
            <div className="max-w-4xl">
              <h2 className="text-xl font-bold text-amber-100 mb-4">
                {selectedFile.name}
              </h2>
              
              {loading ? (
                <p className="text-gray-400">Loading...</p>
              ) : isEditing ? (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full h-[500px] bg-[#1e2433] border border-gray-700 rounded-lg p-4 text-sm text-gray-100 font-mono resize-none focus:outline-none focus:border-amber-600"
                />
              ) : (
                <div className="prose prose-invert prose-amber max-w-none">
                  <div className="bg-[#1e2433] border border-gray-700/50 rounded-lg p-6">
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                      {fileContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select a file from the sidebar to view/edit
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
