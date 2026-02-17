import { supabase } from '../lib/supabase'
import { generateEmbedding } from '../lib/openai'
import type { Database } from '../types/supabase'

type Memory = Database['public']['Tables']['agent_memories']['Row']
type MemoryInsert = Database['public']['Tables']['agent_memories']['Insert']
type MemoryUpdate = Database['public']['Tables']['agent_memories']['Update']

export interface StoreMemoryOptions {
  agentId: string
  content: string
  strength?: number
  metadata?: Record<string, any>
  tags?: string[]
  decayRate?: number
}

export interface SearchMemoriesOptions {
  agentId?: string
  query: string
  threshold?: number
  limit?: number
}

/**
 * Store a new memory with embedding
 */
export async function storeMemory(options: StoreMemoryOptions): Promise<Memory> {
  const {
    agentId,
    content,
    strength = 1.0,
    metadata = {},
    tags = [],
    decayRate = 0.1
  } = options

  // Generate embedding for the content
  const embedding = await generateEmbedding(content)

  // Insert into database
  const { data, error } = await supabase
    .from('agent_memories')
    .insert({
      agent_id: agentId,
      content,
      embedding,
      strength,
      metadata,
      tags,
      decay_rate: decayRate
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to store memory: ${error.message}`)
  }

  return data
}

/**
 * Search memories using semantic similarity
 */
export async function searchMemories(options: SearchMemoriesOptions) {
  const {
    agentId,
    query,
    threshold = 0.7,
    limit = 10
  } = options

  // Generate embedding for the search query
  const queryEmbedding = await generateEmbedding(query)

  // Call the search_memories function
  const { data, error } = await supabase.rpc('search_memories', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    filter_agent_id: agentId || null
  })

  if (error) {
    throw new Error(`Failed to search memories: ${error.message}`)
  }

  return data
}

/**
 * Update memory strength (for reinforcement)
 */
export async function reinforceMemory(memoryId: string, strengthDelta: number): Promise<Memory> {
  // Get current memory
  const { data: current, error: fetchError } = await supabase
    .from('agent_memories')
    .select('strength')
    .eq('id', memoryId)
    .single()

  if (fetchError) {
    throw new Error(`Failed to fetch memory: ${fetchError.message}`)
  }

  // Calculate new strength (capped at 1.0)
  const newStrength = Math.min(1.0, current.strength + strengthDelta)

  // Update memory
  const { data, error } = await supabase
    .from('agent_memories')
    .update({
      strength: newStrength,
      last_accessed: new Date().toISOString()
    })
    .eq('id', memoryId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to reinforce memory: ${error.message}`)
  }

  return data
}

/**
 * Apply temporal decay to memories
 */
export async function applyDecay(agentId: string): Promise<number> {
  const { data: memories, error: fetchError } = await supabase
    .from('agent_memories')
    .select('id, strength, decay_rate, last_accessed')
    .eq('agent_id', agentId)

  if (fetchError) {
    throw new Error(`Failed to fetch memories: ${fetchError.message}`)
  }

  if (!memories || memories.length === 0) {
    return 0
  }

  // Calculate decay based on time since last access
  const now = Date.now()
  const updates = memories.map(memory => {
    const lastAccessed = new Date(memory.last_accessed).getTime()
    const hoursSinceAccess = (now - lastAccessed) / (1000 * 60 * 60)
    
    // Exponential decay: strength * e^(-decay_rate * hours)
    const newStrength = memory.strength * Math.exp(-memory.decay_rate * hoursSinceAccess)
    
    return {
      id: memory.id,
      strength: Math.max(0.01, newStrength) // Minimum strength 0.01
    }
  })

  // Batch update
  for (const update of updates) {
    await supabase
      .from('agent_memories')
      .update({ strength: update.strength })
      .eq('id', update.id)
  }

  return updates.length
}

/**
 * Delete weak memories below threshold
 */
export async function pruneWeakMemories(agentId: string, threshold: number = 0.1): Promise<number> {
  const { data, error } = await supabase
    .from('agent_memories')
    .delete()
    .eq('agent_id', agentId)
    .lt('strength', threshold)
    .select()

  if (error) {
    throw new Error(`Failed to prune memories: ${error.message}`)
  }

  return data?.length || 0
}
