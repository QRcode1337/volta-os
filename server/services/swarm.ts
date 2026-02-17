import { supabase } from '../lib/supabase'

export type SwarmStrategy = 'hierarchical' | 'mesh' | 'adaptive'
export type SwarmStatus = 'idle' | 'active' | 'paused' | 'completed'
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'completed'

export interface SwarmTopology {
  type: SwarmStrategy
  agents: {
    id: string
    role: string
    connections: string[]
    priority?: number
  }[]
  coordinationRules?: Record<string, any>
}

export interface CreateSwarmOptions {
  name: string
  strategy: SwarmStrategy
  topology: SwarmTopology
}

export interface AddAgentToSwarmOptions {
  swarmId: string
  agentId: string
  role: string
}

/**
 * Create a new swarm with specified topology
 */
export async function createSwarm(options: CreateSwarmOptions) {
  const { name, strategy, topology } = options

  const { data, error } = await supabase
    .from('swarms')
    .insert({
      name,
      strategy,
      topology,
      status: 'idle'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create swarm: ${error.message}`)
  }

  return data
}

/**
 * Add an agent to a swarm
 */
export async function addAgentToSwarm(options: AddAgentToSwarmOptions) {
  const { swarmId, agentId, role } = options

  const { data, error } = await supabase
    .from('swarm_agents')
    .insert({
      swarm_id: swarmId,
      agent_id: agentId,
      role,
      status: 'idle'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to add agent to swarm: ${error.message}`)
  }

  return data
}

/**
 * Update swarm status
 */
export async function updateSwarmStatus(swarmId: string, status: SwarmStatus) {
  const { data, error } = await supabase
    .from('swarms')
    .update({ status })
    .eq('id', swarmId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update swarm status: ${error.message}`)
  }

  return data
}

/**
 * Assign task to agent in swarm
 */
export async function assignTask(swarmAgentId: string, task: Record<string, any>) {
  const { data, error } = await supabase
    .from('swarm_agents')
    .update({
      current_task: task,
      status: 'working'
    })
    .eq('id', swarmAgentId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to assign task: ${error.message}`)
  }

  return data
}

/**
 * Get swarm with all agents
 */
export async function getSwarm(swarmId: string) {
  const { data: swarm, error: swarmError } = await supabase
    .from('swarms')
    .select('*')
    .eq('id', swarmId)
    .single()

  if (swarmError) {
    throw new Error(`Failed to get swarm: ${swarmError.message}`)
  }

  const { data: agents, error: agentsError } = await supabase
    .from('swarm_agents')
    .select('*')
    .eq('swarm_id', swarmId)

  if (agentsError) {
    throw new Error(`Failed to get swarm agents: ${agentsError.message}`)
  }

  return {
    ...swarm,
    agents
  }
}

/**
 * Get all agents in a swarm by status
 */
export async function getAgentsByStatus(swarmId: string, status: AgentStatus) {
  const { data, error } = await supabase
    .from('swarm_agents')
    .select('*')
    .eq('swarm_id', swarmId)
    .eq('status', status)

  if (error) {
    throw new Error(`Failed to get agents by status: ${error.message}`)
  }

  return data
}

/**
 * Update agent performance metrics
 */
export async function updateAgentPerformance(
  swarmAgentId: string,
  metrics: Record<string, any>
) {
  const { data, error } = await supabase
    .from('swarm_agents')
    .update({ performance: metrics })
    .eq('id', swarmAgentId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update agent performance: ${error.message}`)
  }

  return data
}

/**
 * Complete task and update agent status
 */
export async function completeTask(swarmAgentId: string) {
  const { data, error } = await supabase
    .from('swarm_agents')
    .update({
      status: 'completed',
      current_task: null
    })
    .eq('id', swarmAgentId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to complete task: ${error.message}`)
  }

  return data
}
