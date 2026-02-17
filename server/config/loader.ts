import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

export interface AgentConfig {
  id: string
  name: string
  directory: string
  type: string
  description?: string
}

export interface DataSourceConfig {
  type: 'filesystem' | 'claude-code' | 'openclaw'
  path: string
  dirs?: string[]
}

export interface ManifestConfig {
  workspace: string
  memoryRoot: string
  agents: AgentConfig[]
  dataSources: DataSourceConfig[]
  vectorStore: {
    provider: string
    embeddingModel: string
    dimensions: number
  }
  embedder: {
    enabled: boolean
    pollIntervalMs: number
    maxContentLength: number
  }
}

function expandHome(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(process.env.HOME || '', p.slice(2))
  }
  return p
}

let cached: ManifestConfig | null = null

export function loadManifest(configPath?: string): ManifestConfig {
  if (cached) return cached

  // ESM-compatible __dirname
  const thisDir = path.dirname(fileURLToPath(import.meta.url))
  const defaultPath = path.join(thisDir, 'agents.json')
  const filePath = configPath || process.env.FORGE_MANIFEST_PATH || defaultPath

  if (!fs.existsSync(filePath)) {
    console.warn(`[config] No manifest found at ${filePath}, using defaults`)
    cached = getDefaultManifest()
    return cached
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    // Expand ~ paths
    raw.workspace = expandHome(raw.workspace)
    raw.memoryRoot = expandHome(raw.memoryRoot)
    for (const ds of raw.dataSources || []) {
      ds.path = expandHome(ds.path)
    }

    cached = raw as ManifestConfig
    return cached
  } catch (err) {
    console.error(`[config] Failed to parse manifest at ${filePath}:`, err)
    cached = getDefaultManifest()
    return cached
  }
}

function getDefaultManifest(): ManifestConfig {
  const root = process.env.ERISMORN_ROOT || '/Users/patrickgallowaypro/ErisMorn'
  return {
    workspace: root,
    memoryRoot: path.join(root, 'memory'),
    agents: [],
    dataSources: [
      { type: 'filesystem', path: path.join(root, 'memory'), dirs: ['scout', 'sentinel'] }
    ],
    vectorStore: {
      provider: 'supabase',
      embeddingModel: 'text-embedding-3-small',
      dimensions: 1536
    },
    embedder: {
      enabled: false,
      pollIntervalMs: 60000,
      maxContentLength: 8000
    }
  }
}

/** Force re-read from disk on next call */
export function invalidateManifestCache() {
  cached = null
}
