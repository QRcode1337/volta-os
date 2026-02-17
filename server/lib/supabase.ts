import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

let _supabaseClient: ReturnType<typeof createClient<Database>> | null = null

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables. Make sure SUPABASE_URL and SUPABASE_SERVICE_KEY are set.')
  }

  _supabaseClient = createClient<Database>(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  return _supabaseClient
}

/**
 * Supabase client with service role key
 * Has full admin access - use carefully!
 */
export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(target, prop) {
    const client = getSupabaseClient()
    return (client as any)[prop]
  }
})

/**
 * Supabase client factory for custom configurations
 */
export function createSupabaseClient(options?: {
  autoRefreshToken?: boolean
  persistSession?: boolean
}) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient<Database>(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        autoRefreshToken: options?.autoRefreshToken ?? false,
        persistSession: options?.persistSession ?? false
      }
    }
  )
}
