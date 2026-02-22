import { useState, useEffect } from 'react'
import {
  Bookmark, Plus, ExternalLink, Star, Search, Tag, Filter,
  GraduationCap, Target, Clock, BookOpen, ChevronRight, Zap,
  Users, Mail, Building2, MapPin, MessageSquare, Circle,
  Edit3, Trash2, X, Check
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api/knowledge'

// ============================================================
// BOOKMARKS TAB
// ============================================================
export function BookmarksTab() {
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newBm, setNewBm] = useState({ url: '', title: '', category: 'research', summary: '', tags: '' })

  useEffect(() => { loadBookmarks() }, [filterCategory, filterStatus])

  async function loadBookmarks() {
    setLoading(true)
    try {
      let url = `${API_BASE}/bookmarks?`
      if (filterCategory) url += `category=${filterCategory}&`
      if (filterStatus) url += `status=${filterStatus}&`
      const res = await fetch(url)
      const data = await res.json()
      setBookmarks(data.bookmarks || [])
      setCategories(data.categories || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function addBookmark() {
    if (!newBm.url || !newBm.title) return
    try {
      await fetch(`${API_BASE}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newBm,
          tags: newBm.tags.split(',').map(t => t.trim()).filter(Boolean)
        })
      })
      setNewBm({ url: '', title: '', category: 'research', summary: '', tags: '' })
      setShowAdd(false)
      loadBookmarks()
    } catch (e) { console.error(e) }
  }

  async function updateBookmark(id: string, updates: any) {
    try {
      await fetch(`${API_BASE}/bookmarks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      loadBookmarks()
    } catch (e) { console.error(e) }
  }

  async function deleteBookmark(id: string) {
    try {
      await fetch(`${API_BASE}/bookmarks/${id}`, { method: 'DELETE' })
      loadBookmarks()
    } catch (e) { console.error(e) }
  }

  const filtered = searchQuery
    ? bookmarks.filter(b =>
        b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.tags?.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : bookmarks

  const statusColors: Record<string, string> = {
    unread: 'text-yellow-400 bg-yellow-900/30',
    reading: 'text-blue-400 bg-blue-900/30',
    read: 'text-green-400 bg-green-900/30',
    archived: 'text-gray-500 bg-gray-800/50'
  }

  const categoryColors: Record<string, string> = {
    ai_agents: 'text-fuchsia-400', building: 'text-cyan-400', growth: 'text-green-400',
    productivity: 'text-amber-400', leadership: 'text-rose-400', industry: 'text-blue-400',
    personal: 'text-purple-400', research: 'text-emerald-400', tools: 'text-orange-400'
  }

  if (loading) return <div className="text-gray-400 p-8">Loading bookmarks...</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fuchsia-300 flex items-center gap-2">
          <Bookmark className="w-5 h-5" />
          Knowledge Bookmarks
          <span className="text-xs text-gray-500 font-normal ml-2">{filtered.length} saved</span>
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-xs hover:bg-fuchsia-500/20 transition-colors"
          style={{ clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Bookmark
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-[#1e2433] border border-fuchsia-900/40 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="URL *" value={newBm.url} onChange={e => setNewBm({ ...newBm, url: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
            <input placeholder="Title *" value={newBm.title} onChange={e => setNewBm({ ...newBm, title: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={newBm.category} onChange={e => setNewBm({ ...newBm, category: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-fuchsia-600">
              {categories.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
            <input placeholder="Tags (comma-separated)" value={newBm.tags} onChange={e => setNewBm({ ...newBm, tags: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
            <input placeholder="Summary" value={newBm.summary} onChange={e => setNewBm({ ...newBm, summary: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300">Cancel</button>
            <button onClick={addBookmark} className="px-3 py-1 bg-fuchsia-600/80 text-white text-xs rounded hover:bg-fuchsia-600">Save</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 w-4 h-4 text-gray-500" />
          <input type="text" placeholder="Search bookmarks..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e2433] border border-fuchsia-900/30 rounded pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="bg-[#1e2433] border border-fuchsia-900/30 rounded px-3 py-1.5 text-xs text-gray-300 focus:outline-none">
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#1e2433] border border-fuchsia-900/30 rounded px-3 py-1.5 text-xs text-gray-300 focus:outline-none">
          <option value="">All statuses</option>
          <option value="unread">Unread</option>
          <option value="reading">Reading</option>
          <option value="read">Read</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Bookmarks list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{bookmarks.length === 0 ? 'No bookmarks yet. Save your first resource.' : 'No matches found.'}</p>
          </div>
        ) : filtered.map(bm => (
          <div key={bm.id} className="bg-[#1e2433] border border-fuchsia-900/20 rounded-lg p-3 hover:border-fuchsia-700/40 transition-colors group">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <a href={bm.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-fuchsia-200 hover:text-fuchsia-100 truncate flex items-center gap-1.5">
                    {bm.title}
                    <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
                  </a>
                </div>
                {bm.summary && <p className="text-xs text-gray-400 mb-2 line-clamp-2">{bm.summary}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] ${categoryColors[bm.category] || 'text-gray-400'}`}>
                    {bm.category?.replace('_', ' ')}
                  </span>
                  {bm.tags?.map((tag: string) => (
                    <span key={tag} className="text-[10px] bg-[#252b3b] text-gray-500 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                  <span className="text-[10px] text-gray-600 ml-auto">
                    {new Date(bm.saved_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Status toggle */}
                <select
                  value={bm.status}
                  onChange={e => updateBookmark(bm.id, { status: e.target.value })}
                  className={`text-[10px] px-2 py-0.5 rounded border-0 cursor-pointer ${statusColors[bm.status] || 'text-gray-400 bg-gray-800'}`}
                >
                  <option value="unread">unread</option>
                  <option value="reading">reading</option>
                  <option value="read">read</option>
                  <option value="archived">archived</option>
                </select>
                {/* Rating */}
                <button
                  onClick={() => updateBookmark(bm.id, { rating: bm.rating === 5 ? null : (bm.rating || 0) + 1 })}
                  className="text-gray-600 hover:text-amber-400 transition-colors"
                  title={`Rating: ${bm.rating || 'none'}`}
                >
                  <Star className={`w-3.5 h-3.5 ${bm.rating ? 'text-amber-400 fill-amber-400' : ''}`} />
                </button>
                {/* Delete */}
                <button
                  onClick={() => deleteBookmark(bm.id)}
                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// LEARNING TRACKER TAB
// ============================================================
export function LearningTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<'skills' | 'queue' | 'completed'>('skills')
  const [showAddSkill, setShowAddSkill] = useState(false)
  const [showAddQueue, setShowAddQueue] = useState(false)
  const [newSkill, setNewSkill] = useState({ name: '', category: 'technical', level: 'beginner', target_level: 'intermediate', notes: '' })
  const [newQueueItem, setNewQueueItem] = useState({ title: '', url: '', type: 'article', priority: 'medium', estimated_time: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/learning`)
      setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function addSkill() {
    if (!newSkill.name) return
    await fetch(`${API_BASE}/learning/skills`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSkill)
    })
    setNewSkill({ name: '', category: 'technical', level: 'beginner', target_level: 'intermediate', notes: '' })
    setShowAddSkill(false)
    loadData()
  }

  async function updateSkill(id: string, updates: any) {
    await fetch(`${API_BASE}/learning/skills/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    loadData()
  }

  async function addQueueItem() {
    if (!newQueueItem.title) return
    await fetch(`${API_BASE}/learning/queue`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newQueueItem)
    })
    setNewQueueItem({ title: '', url: '', type: 'article', priority: 'medium', estimated_time: '' })
    setShowAddQueue(false)
    loadData()
  }

  async function completeQueueItem(id: string, rating: number) {
    await fetch(`${API_BASE}/learning/queue/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', rating })
    })
    loadData()
  }

  async function setFocus(area: string) {
    await fetch(`${API_BASE}/learning/focus`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area, why: 'Strategic priority' })
    })
    loadData()
  }

  const levelColors: Record<string, string> = {
    beginner: 'text-red-400 bg-red-900/30',
    intermediate: 'text-yellow-400 bg-yellow-900/30',
    advanced: 'text-green-400 bg-green-900/30',
    expert: 'text-cyan-400 bg-cyan-900/30'
  }

  const priorityColors: Record<string, string> = {
    high: 'text-red-400', medium: 'text-yellow-400', low: 'text-gray-400'
  }

  if (loading) return <div className="text-gray-400 p-8">Loading learning tracker...</div>

  return (
    <div className="space-y-4">
      {/* Current Focus */}
      {data?.current_focus && (
        <div className="bg-gradient-to-r from-fuchsia-900/20 to-cyan-900/20 border border-fuchsia-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-fuchsia-400 mb-1">
            <Target className="w-3.5 h-3.5" />
            CURRENT FOCUS
          </div>
          <div className="text-lg font-semibold text-fuchsia-200">{data.current_focus.area}</div>
          {data.current_focus.why && <p className="text-xs text-gray-400 mt-1">{data.current_focus.why}</p>}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(['skills', 'queue', 'completed'] as const).map(view => (
            <button key={view} onClick={() => setActiveView(view)}
              className={`px-3 py-1.5 text-xs transition-colors ${
                activeView === view ? 'text-fuchsia-300 bg-fuchsia-500/15 border-b border-fuchsia-500' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {view === 'skills' && <><GraduationCap className="w-3.5 h-3.5 inline mr-1.5" />Skills ({data?.skills?.length || 0})</>}
              {view === 'queue' && <><BookOpen className="w-3.5 h-3.5 inline mr-1.5" />Queue ({data?.queue?.length || 0})</>}
              {view === 'completed' && <><Check className="w-3.5 h-3.5 inline mr-1.5" />Completed ({data?.completed?.length || 0})</>}
            </button>
          ))}
        </div>
        <button
          onClick={() => activeView === 'skills' ? setShowAddSkill(!showAddSkill) : setShowAddQueue(!showAddQueue)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-xs hover:bg-fuchsia-500/20 transition-colors"
          style={{ clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          {activeView === 'skills' ? 'Add Skill' : 'Add to Queue'}
        </button>
      </div>

      {/* Add Skill Form */}
      {showAddSkill && activeView === 'skills' && (
        <div className="bg-[#1e2433] border border-fuchsia-900/40 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Skill name *" value={newSkill.name} onChange={e => setNewSkill({ ...newSkill, name: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
            <select value={newSkill.category} onChange={e => setNewSkill({ ...newSkill, category: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none">
              <option value="technical">Technical</option>
              <option value="creative">Creative</option>
              <option value="business">Business</option>
              <option value="research">Research</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={newSkill.level} onChange={e => setNewSkill({ ...newSkill, level: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
            <select value={newSkill.target_level} onChange={e => setNewSkill({ ...newSkill, target_level: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none">
              <option value="intermediate">Target: Intermediate</option>
              <option value="advanced">Target: Advanced</option>
              <option value="expert">Target: Expert</option>
            </select>
            <input placeholder="Notes" value={newSkill.notes} onChange={e => setNewSkill({ ...newSkill, notes: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddSkill(false)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300">Cancel</button>
            <button onClick={addSkill} className="px-3 py-1 bg-fuchsia-600/80 text-white text-xs rounded hover:bg-fuchsia-600">Save</button>
          </div>
        </div>
      )}

      {/* Add Queue Item Form */}
      {showAddQueue && activeView === 'queue' && (
        <div className="bg-[#1e2433] border border-fuchsia-900/40 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Title *" value={newQueueItem.title} onChange={e => setNewQueueItem({ ...newQueueItem, title: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
            <input placeholder="URL" value={newQueueItem.url} onChange={e => setNewQueueItem({ ...newQueueItem, url: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={newQueueItem.type} onChange={e => setNewQueueItem({ ...newQueueItem, type: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none">
              <option value="article">Article</option>
              <option value="course">Course</option>
              <option value="book">Book</option>
              <option value="tutorial">Tutorial</option>
              <option value="project">Project</option>
              <option value="video">Video</option>
            </select>
            <select value={newQueueItem.priority} onChange={e => setNewQueueItem({ ...newQueueItem, priority: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none">
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
            <input placeholder="Est. time (e.g. 2h)" value={newQueueItem.estimated_time} onChange={e => setNewQueueItem({ ...newQueueItem, estimated_time: e.target.value })}
              className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddQueue(false)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300">Cancel</button>
            <button onClick={addQueueItem} className="px-3 py-1 bg-fuchsia-600/80 text-white text-xs rounded hover:bg-fuchsia-600">Save</button>
          </div>
        </div>
      )}

      {/* Skills View */}
      {activeView === 'skills' && (
        <div className="grid grid-cols-2 gap-3">
          {(!data?.skills || data.skills.length === 0) ? (
            <div className="col-span-2 text-center text-gray-500 py-12">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No skills tracked yet. Add your first skill.</p>
            </div>
          ) : data.skills.map((skill: any) => (
            <div key={skill.id} className="bg-[#1e2433] border border-fuchsia-900/20 rounded-lg p-4 hover:border-fuchsia-700/40 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-fuchsia-200 text-sm">{skill.name}</h3>
                <span className="text-[10px] text-gray-500">{skill.category}</span>
              </div>
              {/* Level progress */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] px-2 py-0.5 rounded ${levelColors[skill.level] || 'text-gray-400 bg-gray-800'}`}>
                  {skill.level}
                </span>
                <ChevronRight className="w-3 h-3 text-gray-600" />
                <span className={`text-[10px] px-2 py-0.5 rounded ${levelColors[skill.target_level] || 'text-gray-400 bg-gray-800'}`}>
                  {skill.target_level}
                </span>
              </div>
              {skill.notes && <p className="text-[11px] text-gray-500 mb-2">{skill.notes}</p>}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {skill.last_practiced ? new Date(skill.last_practiced).toLocaleDateString() : 'Never'}
                </span>
                {/* Level up button */}
                <button
                  onClick={() => {
                    const levels = ['beginner', 'intermediate', 'advanced', 'expert']
                    const currentIdx = levels.indexOf(skill.level)
                    if (currentIdx < levels.length - 1) {
                      updateSkill(skill.id, { level: levels[currentIdx + 1], last_practiced: new Date().toISOString() })
                    }
                  }}
                  className="text-[10px] text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1"
                  title="Level up"
                >
                  <Zap className="w-3 h-3" /> Level up
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Queue View */}
      {activeView === 'queue' && (
        <div className="space-y-2">
          {(!data?.queue || data.queue.length === 0) ? (
            <div className="text-center text-gray-500 py-12">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Learning queue is empty. Add resources to study.</p>
            </div>
          ) : data.queue.map((item: any) => (
            <div key={item.id} className="bg-[#1e2433] border border-fuchsia-900/20 rounded-lg p-3 flex items-center gap-3 group hover:border-fuchsia-700/40 transition-colors">
              <div className={`w-1.5 h-8 rounded-full ${item.priority === 'high' ? 'bg-red-500' : item.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-600'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-fuchsia-200 hover:text-fuchsia-100 truncate flex items-center gap-1">
                      {item.title} <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-sm text-fuchsia-200 truncate">{item.title}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-500">{item.type}</span>
                  {item.estimated_time && <span className="text-[10px] text-gray-600 flex items-center gap-0.5"><Clock className="w-3 h-3" />{item.estimated_time}</span>}
                </div>
              </div>
              <button
                onClick={() => completeQueueItem(item.id, 4)}
                className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Check className="w-3.5 h-3.5" /> Done
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Completed View */}
      {activeView === 'completed' && (
        <div className="space-y-2">
          {(!data?.completed || data.completed.length === 0) ? (
            <div className="text-center text-gray-500 py-12">
              <Check className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nothing completed yet. Keep learning.</p>
            </div>
          ) : data.completed.map((item: any, i: number) => (
            <div key={item.id || i} className="bg-[#1e2433] border border-green-900/20 rounded-lg p-3 flex items-center gap-3 opacity-70">
              <Check className="w-4 h-4 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-300 truncate block">{item.title}</span>
                <span className="text-[10px] text-gray-600">{item.type} - completed {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// NETWORK / CONTACTS TAB
// ============================================================
export function NetworkTab() {
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCircle, setFilterCircle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedContact, setSelectedContact] = useState<any>(null)
  const [newContact, setNewContact] = useState({
    name: '', handle: '', email: '', company: '', role: '',
    circle: 'network', how_met: '', topics: '', can_help_with: '', you_can_help_with: '', notes: ''
  })
  const [newInteraction, setNewInteraction] = useState({ type: 'note', notes: '' })

  useEffect(() => { loadContacts() }, [filterCircle])

  async function loadContacts() {
    setLoading(true)
    try {
      let url = `${API_BASE}/contacts?`
      if (filterCircle) url += `circle=${filterCircle}&`
      if (searchQuery) url += `q=${encodeURIComponent(searchQuery)}&`
      const res = await fetch(url)
      const data = await res.json()
      setContacts(data.contacts || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function addContact() {
    if (!newContact.name) return
    await fetch(`${API_BASE}/contacts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newContact,
        topics: newContact.topics.split(',').map(t => t.trim()).filter(Boolean)
      })
    })
    setNewContact({ name: '', handle: '', email: '', company: '', role: '', circle: 'network', how_met: '', topics: '', can_help_with: '', you_can_help_with: '', notes: '' })
    setShowAdd(false)
    loadContacts()
  }

  async function deleteContact(id: string) {
    await fetch(`${API_BASE}/contacts/${id}`, { method: 'DELETE' })
    if (selectedContact?.id === id) setSelectedContact(null)
    loadContacts()
  }

  async function addInteraction(contactId: string) {
    if (!newInteraction.notes) return
    await fetch(`${API_BASE}/contacts/${contactId}/interaction`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newInteraction)
    })
    setNewInteraction({ type: 'note', notes: '' })
    // Refresh contact detail
    const res = await fetch(`${API_BASE}/contacts?`)
    const data = await res.json()
    setContacts(data.contacts || [])
    setSelectedContact(data.contacts?.find((c: any) => c.id === contactId) || null)
  }

  function doSearch() {
    loadContacts()
  }

  const circleColors: Record<string, { dot: string; text: string; bg: string }> = {
    inner: { dot: 'bg-fuchsia-400', text: 'text-fuchsia-400', bg: 'bg-fuchsia-900/30' },
    active: { dot: 'bg-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan-900/30' },
    network: { dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-900/30' },
    dormant: { dot: 'bg-gray-500', text: 'text-gray-500', bg: 'bg-gray-800/50' }
  }

  if (loading) return <div className="text-gray-400 p-8">Loading contacts...</div>

  return (
    <div className="grid grid-cols-3 gap-4 h-full">
      {/* Left: Contact list */}
      <div className="bg-[#1e2433] border border-fuchsia-900/30 rounded-lg p-4 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-fuchsia-300 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Network ({contacts.length})
          </h3>
          <button onClick={() => setShowAdd(!showAdd)} className="text-fuchsia-400 hover:text-fuchsia-300">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Search + filter */}
        <div className="space-y-2 mb-3">
          <div className="relative">
            <Search className="absolute left-2 top-2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Search contacts..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              className="w-full bg-[#252b3b] border border-fuchsia-900/30 rounded pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
          </div>
          <div className="flex gap-1">
            {['', 'inner', 'active', 'network', 'dormant'].map(c => (
              <button key={c} onClick={() => setFilterCircle(c)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  filterCircle === c
                    ? 'text-fuchsia-300 bg-fuchsia-500/20'
                    : 'text-gray-500 hover:text-gray-300 bg-[#252b3b]'
                }`}>
                {c || 'all'}
              </button>
            ))}
          </div>
        </div>

        {/* Contacts list */}
        <div className="flex-1 overflow-auto space-y-1">
          {contacts.length === 0 ? (
            <div className="text-center text-gray-500 py-8 text-xs">No contacts</div>
          ) : contacts.map(contact => {
            const colors = circleColors[contact.circle] || circleColors.network
            return (
              <button key={contact.id} onClick={() => setSelectedContact(contact)}
                className={`w-full text-left p-2 rounded text-sm transition-colors ${
                  selectedContact?.id === contact.id ? 'bg-fuchsia-900/40 text-fuchsia-200' : 'hover:bg-[#252b3b] text-gray-300'
                }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span className="flex-1 truncate font-medium text-xs">{contact.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-4">
                  {contact.company && <span className="text-[10px] text-gray-500 truncate">{contact.company}</span>}
                  {contact.role && <span className="text-[10px] text-gray-600 truncate">- {contact.role}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: Contact detail or Add form */}
      <div className="bg-[#1e2433] border border-fuchsia-900/30 rounded-lg p-4 col-span-2 overflow-auto">
        {showAdd ? (
          /* Add Contact Form */
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-fuchsia-300 flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Contact
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Name *" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
              <input placeholder="@handle" value={newContact.handle} onChange={e => setNewContact({ ...newContact, handle: e.target.value })}
                className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
              <input placeholder="Email" value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
              <input placeholder="Company" value={newContact.company} onChange={e => setNewContact({ ...newContact, company: e.target.value })}
                className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
              <input placeholder="Role" value={newContact.role} onChange={e => setNewContact({ ...newContact, role: e.target.value })}
                className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
              <select value={newContact.circle} onChange={e => setNewContact({ ...newContact, circle: e.target.value })}
                className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none">
                <option value="inner">Inner circle</option>
                <option value="active">Active</option>
                <option value="network">Network</option>
                <option value="dormant">Dormant</option>
              </select>
            </div>
            <input placeholder="How did you meet?" value={newContact.how_met} onChange={e => setNewContact({ ...newContact, how_met: e.target.value })}
              className="w-full bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
            <input placeholder="Topics (comma-separated)" value={newContact.topics} onChange={e => setNewContact({ ...newContact, topics: e.target.value })}
              className="w-full bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="They can help with..." value={newContact.can_help_with} onChange={e => setNewContact({ ...newContact, can_help_with: e.target.value })}
                className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
              <input placeholder="You can help them with..." value={newContact.you_can_help_with} onChange={e => setNewContact({ ...newContact, you_can_help_with: e.target.value })}
                className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
            </div>
            <textarea placeholder="Notes" value={newContact.notes} onChange={e => setNewContact({ ...newContact, notes: e.target.value })} rows={3}
              className="w-full bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600 resize-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300">Cancel</button>
              <button onClick={addContact} className="px-3 py-1 bg-fuchsia-600/80 text-white text-xs rounded hover:bg-fuchsia-600">Save Contact</button>
            </div>
          </div>
        ) : selectedContact ? (
          /* Contact Detail */
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-fuchsia-200">{selectedContact.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {selectedContact.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{selectedContact.company}</span>}
                  {selectedContact.role && <span>{selectedContact.role}</span>}
                  {selectedContact.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{selectedContact.location}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded ${circleColors[selectedContact.circle]?.bg || ''} ${circleColors[selectedContact.circle]?.text || ''}`}>
                  {selectedContact.circle}
                </span>
                <button onClick={() => deleteContact(selectedContact.id)} className="text-gray-600 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-2 gap-4">
              {selectedContact.handle && (
                <div className="text-xs"><span className="text-gray-500">Handle:</span> <span className="text-gray-300">@{selectedContact.handle}</span></div>
              )}
              {selectedContact.email && (
                <div className="text-xs flex items-center gap-1"><Mail className="w-3 h-3 text-gray-500" /> <span className="text-gray-300">{selectedContact.email}</span></div>
              )}
              {selectedContact.how_met && (
                <div className="text-xs col-span-2"><span className="text-gray-500">How met:</span> <span className="text-gray-300">{selectedContact.how_met}</span></div>
              )}
            </div>

            {/* Topics */}
            {selectedContact.topics?.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-500 mb-1">TOPICS</div>
                <div className="flex flex-wrap gap-1">
                  {selectedContact.topics.map((t: string) => (
                    <span key={t} className="text-[10px] bg-fuchsia-900/30 text-fuchsia-300 px-2 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Help exchange */}
            <div className="grid grid-cols-2 gap-3">
              {selectedContact.can_help_with && (
                <div className="bg-[#252b3b] rounded p-2">
                  <div className="text-[10px] text-green-400 mb-1">THEY CAN HELP WITH</div>
                  <p className="text-xs text-gray-300">{selectedContact.can_help_with}</p>
                </div>
              )}
              {selectedContact.you_can_help_with && (
                <div className="bg-[#252b3b] rounded p-2">
                  <div className="text-[10px] text-cyan-400 mb-1">YOU CAN HELP WITH</div>
                  <p className="text-xs text-gray-300">{selectedContact.you_can_help_with}</p>
                </div>
              )}
            </div>

            {selectedContact.notes && (
              <div>
                <div className="text-[10px] text-gray-500 mb-1">NOTES</div>
                <p className="text-xs text-gray-400">{selectedContact.notes}</p>
              </div>
            )}

            {/* Interactions */}
            <div className="border-t border-fuchsia-900/20 pt-3">
              <div className="text-[10px] text-gray-500 mb-2">INTERACTIONS</div>
              {/* Add interaction */}
              <div className="flex items-center gap-2 mb-3">
                <select value={newInteraction.type} onChange={e => setNewInteraction({ ...newInteraction, type: e.target.value })}
                  className="bg-[#252b3b] border border-fuchsia-900/30 rounded px-2 py-1 text-[11px] text-gray-300">
                  <option value="note">Note</option>
                  <option value="meeting">Meeting</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="coffee">Coffee</option>
                </select>
                <input placeholder="Add interaction note..." value={newInteraction.notes}
                  onChange={e => setNewInteraction({ ...newInteraction, notes: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addInteraction(selectedContact.id)}
                  className="flex-1 bg-[#252b3b] border border-fuchsia-900/30 rounded px-3 py-1 text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-fuchsia-600" />
                <button onClick={() => addInteraction(selectedContact.id)}
                  className="px-2 py-1 bg-fuchsia-600/50 text-white text-[10px] rounded hover:bg-fuchsia-600/80">
                  Log
                </button>
              </div>
              {/* Interaction history */}
              <div className="space-y-1.5 max-h-48 overflow-auto">
                {(selectedContact.interactions || []).slice().reverse().map((int: any) => (
                  <div key={int.id} className="flex items-start gap-2 text-[11px]">
                    <MessageSquare className="w-3 h-3 text-gray-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-fuchsia-400">{int.type}</span>
                      <span className="text-gray-500 mx-1">-</span>
                      <span className="text-gray-400">{int.notes}</span>
                      <span className="text-gray-600 ml-2">{new Date(int.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {(!selectedContact.interactions || selectedContact.interactions.length === 0) && (
                  <p className="text-[10px] text-gray-600">No interactions logged yet</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a contact or add a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
