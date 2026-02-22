import { Router } from 'express'
import * as fs from 'fs'
import * as path from 'path'

const router = Router()
const DATA_DIR = path.join(process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn', 'volta-os/server/data')

function readJsonFile(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch { return null }
}

function writeJsonFile(filePath: string, data: any): boolean {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    return true
  } catch { return false }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Bookmarks ────────────────────────────────────────────────

const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json')
const BOOKMARK_CATEGORIES = ['ai_agents', 'building', 'growth', 'productivity', 'leadership', 'industry', 'personal', 'research', 'tools'] as const

router.get('/bookmarks', (req, res) => {
  const data = readJsonFile(BOOKMARKS_FILE)
  const bookmarks = data?.bookmarks || []
  const category = req.query.category as string
  const status = req.query.status as string
  let filtered = bookmarks
  if (category) filtered = filtered.filter((b: any) => b.category === category)
  if (status) filtered = filtered.filter((b: any) => b.status === status)
  filtered.sort((a: any, b: any) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime())
  res.json({ bookmarks: filtered, count: filtered.length, categories: BOOKMARK_CATEGORIES })
})

router.post('/bookmarks', (req, res) => {
  const { url, title, category, summary, tags, source_type } = req.body
  if (!url || !title) return res.status(400).json({ error: 'url and title required' })
  const data = readJsonFile(BOOKMARKS_FILE) || { bookmarks: [] }
  const bookmark = {
    id: `bm_${generateId()}`,
    saved_at: new Date().toISOString(),
    url, title,
    source_type: source_type || 'article',
    category: category || 'research',
    summary: summary || '',
    key_insights: [],
    tags: tags || [],
    status: 'unread',
    rating: null
  }
  data.bookmarks.push(bookmark)
  writeJsonFile(BOOKMARKS_FILE, data)
  res.json({ success: true, bookmark })
})

router.patch('/bookmarks/:id', (req, res) => {
  const data = readJsonFile(BOOKMARKS_FILE)
  if (!data?.bookmarks) return res.status(404).json({ error: 'No bookmarks found' })
  const idx = data.bookmarks.findIndex((b: any) => b.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Bookmark not found' })
  Object.assign(data.bookmarks[idx], req.body, { updated_at: new Date().toISOString() })
  writeJsonFile(BOOKMARKS_FILE, data)
  res.json({ success: true, bookmark: data.bookmarks[idx] })
})

router.delete('/bookmarks/:id', (req, res) => {
  const data = readJsonFile(BOOKMARKS_FILE)
  if (!data?.bookmarks) return res.status(404).json({ error: 'No bookmarks found' })
  data.bookmarks = data.bookmarks.filter((b: any) => b.id !== req.params.id)
  writeJsonFile(BOOKMARKS_FILE, data)
  res.json({ success: true })
})

// ── Learning Tracker ─────────────────────────────────────────

const LEARNING_FILE = path.join(DATA_DIR, 'learning.json')

router.get('/learning', (req, res) => {
  const data = readJsonFile(LEARNING_FILE) || {
    current_focus: null,
    skills: [],
    queue: [],
    completed: [],
    habits: { daily_time: '1h', best_time: 'morning', preferred_formats: ['docs', 'projects', 'videos'] }
  }
  res.json(data)
})

router.post('/learning/skills', (req, res) => {
  const { name, category, level, target_level, resources, notes } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const data = readJsonFile(LEARNING_FILE) || { skills: [], queue: [], completed: [] }
  if (!data.skills) data.skills = []
  const skill = {
    id: `skill_${generateId()}`,
    name, category: category || 'technical',
    level: level || 'beginner',
    target_level: target_level || 'intermediate',
    resources: resources || [],
    milestones: [],
    notes: notes || '',
    last_practiced: new Date().toISOString(),
    created_at: new Date().toISOString()
  }
  data.skills.push(skill)
  writeJsonFile(LEARNING_FILE, data)
  res.json({ success: true, skill })
})

router.patch('/learning/skills/:id', (req, res) => {
  const data = readJsonFile(LEARNING_FILE)
  if (!data?.skills) return res.status(404).json({ error: 'No skills found' })
  const idx = data.skills.findIndex((s: any) => s.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Skill not found' })
  Object.assign(data.skills[idx], req.body, { updated_at: new Date().toISOString() })
  writeJsonFile(LEARNING_FILE, data)
  res.json({ success: true, skill: data.skills[idx] })
})

router.post('/learning/queue', (req, res) => {
  const { title, url, type, priority, estimated_time } = req.body
  if (!title) return res.status(400).json({ error: 'title required' })
  const data = readJsonFile(LEARNING_FILE) || { skills: [], queue: [], completed: [] }
  if (!data.queue) data.queue = []
  const item = {
    id: `lq_${generateId()}`,
    title, url: url || '',
    type: type || 'article',
    priority: priority || 'medium',
    estimated_time: estimated_time || '',
    added_at: new Date().toISOString(),
    status: 'queued'
  }
  data.queue.push(item)
  writeJsonFile(LEARNING_FILE, data)
  res.json({ success: true, item })
})

router.patch('/learning/queue/:id', (req, res) => {
  const data = readJsonFile(LEARNING_FILE)
  if (!data?.queue) return res.status(404).json({ error: 'No queue found' })
  const idx = data.queue.findIndex((q: any) => q.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Queue item not found' })
  if (req.body.status === 'completed') {
    const [item] = data.queue.splice(idx, 1)
    if (!data.completed) data.completed = []
    data.completed.push({ ...item, ...req.body, completed_at: new Date().toISOString() })
  } else {
    Object.assign(data.queue[idx], req.body)
  }
  writeJsonFile(LEARNING_FILE, data)
  res.json({ success: true })
})

router.post('/learning/focus', (req, res) => {
  const { area, why, target_level, deadline } = req.body
  if (!area) return res.status(400).json({ error: 'area required' })
  const data = readJsonFile(LEARNING_FILE) || { skills: [], queue: [], completed: [] }
  data.current_focus = { area, why: why || '', target_level: target_level || '', deadline: deadline || '', set_at: new Date().toISOString() }
  writeJsonFile(LEARNING_FILE, data)
  res.json({ success: true, focus: data.current_focus })
})

// ── Network / Contacts ───────────────────────────────────────

const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json')
const CIRCLE_TIERS = ['inner', 'active', 'network', 'dormant'] as const

router.get('/contacts', (req, res) => {
  const data = readJsonFile(CONTACTS_FILE) || { contacts: [], circles: {} }
  const circle = req.query.circle as string
  const search = (req.query.q as string || '').toLowerCase()
  let contacts = data.contacts || []
  if (circle) contacts = contacts.filter((c: any) => c.circle === circle)
  if (search) contacts = contacts.filter((c: any) =>
    (c.name || '').toLowerCase().includes(search) ||
    (c.company || '').toLowerCase().includes(search) ||
    (c.topics || []).some((t: string) => t.toLowerCase().includes(search))
  )
  contacts.sort((a: any, b: any) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
  res.json({ contacts, count: contacts.length, circles: CIRCLE_TIERS })
})

router.post('/contacts', (req, res) => {
  const { name, handle, email, company, role, location, circle, how_met, topics, can_help_with, you_can_help_with, notes } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const data = readJsonFile(CONTACTS_FILE) || { contacts: [] }
  if (!data.contacts) data.contacts = []
  const contact = {
    id: `contact_${generateId()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name, handle: handle || '', email: email || '',
    company: company || '', role: role || '', location: location || '',
    circle: circle || 'network',
    how_met: how_met || '',
    topics: topics || [],
    can_help_with: can_help_with || '',
    you_can_help_with: you_can_help_with || '',
    notes: notes || '',
    last_contact: new Date().toISOString(),
    interactions: []
  }
  data.contacts.push(contact)
  writeJsonFile(CONTACTS_FILE, data)
  res.json({ success: true, contact })
})

router.patch('/contacts/:id', (req, res) => {
  const data = readJsonFile(CONTACTS_FILE)
  if (!data?.contacts) return res.status(404).json({ error: 'No contacts found' })
  const idx = data.contacts.findIndex((c: any) => c.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Contact not found' })
  Object.assign(data.contacts[idx], req.body, { updated_at: new Date().toISOString() })
  writeJsonFile(CONTACTS_FILE, data)
  res.json({ success: true, contact: data.contacts[idx] })
})

router.delete('/contacts/:id', (req, res) => {
  const data = readJsonFile(CONTACTS_FILE)
  if (!data?.contacts) return res.status(404).json({ error: 'No contacts found' })
  data.contacts = data.contacts.filter((c: any) => c.id !== req.params.id)
  writeJsonFile(CONTACTS_FILE, data)
  res.json({ success: true })
})

router.post('/contacts/:id/interaction', (req, res) => {
  const { type, notes, date } = req.body
  const data = readJsonFile(CONTACTS_FILE)
  if (!data?.contacts) return res.status(404).json({ error: 'No contacts found' })
  const idx = data.contacts.findIndex((c: any) => c.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Contact not found' })
  if (!data.contacts[idx].interactions) data.contacts[idx].interactions = []
  data.contacts[idx].interactions.push({
    id: `int_${generateId()}`,
    type: type || 'note',
    notes: notes || '',
    date: date || new Date().toISOString()
  })
  data.contacts[idx].last_contact = new Date().toISOString()
  data.contacts[idx].updated_at = new Date().toISOString()
  writeJsonFile(CONTACTS_FILE, data)
  res.json({ success: true, contact: data.contacts[idx] })
})

export default router
