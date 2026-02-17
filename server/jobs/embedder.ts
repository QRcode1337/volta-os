import * as fs from 'fs'
import * as path from 'path'
import { supabase } from '../lib/supabase'
import { generateEmbedding } from '../lib/openai'
import { loadManifest } from '../config/loader.js'
import { FilesystemAdapter } from '../adapters/filesystem.js'
import { ClaudeCodeAdapter } from '../adapters/claude-code.js'
import { OpenClawAdapter } from '../adapters/openclaw.js'
import type { MemoryAdapter, MemoryDocument } from '../adapters/types'

const DEFAULT_INTERVAL_MS = 60_000
const AGENT_ID = 'forge-embedder'

let isRunning = false

/**
 * Build adapter instances from the manifest config.
 */
function buildAdapters(): MemoryAdapter[] {
  const manifest = loadManifest()
  const adapters: MemoryAdapter[] = []

  for (const ds of manifest.dataSources) {
    switch (ds.type) {
      case 'filesystem':
        adapters.push(new FilesystemAdapter(ds.path, ds.dirs || [], manifest.embedder.maxContentLength))
        break
      case 'claude-code':
        adapters.push(new ClaudeCodeAdapter(ds.path, manifest.embedder.maxContentLength))
        break
      case 'openclaw':
        adapters.push(new OpenClawAdapter(ds.path, manifest.embedder.maxContentLength))
        break
    }
  }

  return adapters
}

/**
 * Run one adapter cycle: collect new documents from all adapters,
 * generate embeddings, and upsert into agent_memories.
 */
async function runAdapterCycle(adapters: MemoryAdapter[]): Promise<number> {
  let total = 0

  for (const adapter of adapters) {
    if (!adapter.isAvailable()) continue

    try {
      const docs = await adapter.getNewDocuments()

      for (const doc of docs) {
        try {
          // Dedup by file_hash if present
          if (doc.metadata.file_hash) {
            const { data } = await supabase
              .from('agent_memories')
              .select('id')
              .eq('agent_id', AGENT_ID)
              .eq('metadata->>file_hash', doc.metadata.file_hash)
              .limit(1)
            if (data && data.length > 0) continue
          }

          // Also check by file_path to avoid duplicates from different runs
          if (doc.metadata.file_path) {
            const { data } = await supabase
              .from('agent_memories')
              .select('id')
              .eq('agent_id', AGENT_ID)
              .eq('metadata->>file_path', doc.metadata.file_path)
              .limit(1)
            if (data && data.length > 0) {
              // Update existing
              const embedding = await generateEmbedding(doc.content)
              await supabase
                .from('agent_memories')
                .update({
                  content: doc.content,
                  embedding,
                  tags: doc.tags,
                  metadata: { ...doc.metadata, adapter: adapter.name, indexed_at: new Date().toISOString() },
                  last_accessed: new Date().toISOString()
                })
                .eq('id', data[0].id)
              total++
              continue
            }
          }

          // Insert new
          const embedding = await generateEmbedding(doc.content)
          await supabase
            .from('agent_memories')
            .insert({
              agent_id: AGENT_ID,
              content: doc.content,
              embedding,
              strength: 1.0,
              tags: doc.tags,
              metadata: { ...doc.metadata, adapter: adapter.name, indexed_at: new Date().toISOString() },
              decay_rate: 0.05
            })
          total++

          console.log(JSON.stringify({
            event: 'forge.embedder.indexed',
            adapter: adapter.name,
            title: doc.title,
            source: doc.source,
            contentLength: doc.content.length
          }))
        } catch (docError) {
          console.error(`[embedder] Error indexing doc from ${adapter.name}:`, docError)
        }
      }
    } catch (err) {
      console.error(`[embedder] Adapter ${adapter.name} error:`, err)
    }
  }

  return total
}

/**
 * One embedder tick: build adapters from manifest, run cycle.
 */
async function runEmbedderTick() {
  if (isRunning) return
  isRunning = true

  try {
    const adapters = buildAdapters()
    const indexed = await runAdapterCycle(adapters)

    if (indexed > 0) {
      console.log(JSON.stringify({
        event: 'forge.embedder.tick',
        indexed,
        adapterCount: adapters.length
      }))
    }
  } catch (error) {
    console.error('Embedder tick error:', error)
  } finally {
    isRunning = false
  }
}

/**
 * Start the background embedder. Returns a cleanup function.
 */
export function startEmbedder() {
  const manifest = loadManifest()
  const enabled = (process.env.FORGE_EMBEDDER_ENABLED || 'false').toLowerCase() === 'true' || manifest.embedder.enabled

  if (!enabled) {
    console.log('⏸️  FORGE embedder disabled (set FORGE_EMBEDDER_ENABLED=true or enable in manifest)')
    return () => undefined
  }

  const intervalMs = Number(process.env.FORGE_EMBEDDER_INTERVAL_MS || manifest.embedder.pollIntervalMs || DEFAULT_INTERVAL_MS)
  const adapterCount = manifest.dataSources.length
  console.log(`▶️  FORGE embedder enabled (interval=${intervalMs}ms, adapters=${adapterCount})`)

  // Run immediately on startup
  runEmbedderTick().catch(error => {
    console.error('Initial embedder run failed:', error)
  })

  const interval = setInterval(() => {
    runEmbedderTick().catch(error => {
      console.error('Embedder interval run failed:', error)
    })
  }, intervalMs)

  return () => clearInterval(interval)
}

export { runAdapterCycle }
