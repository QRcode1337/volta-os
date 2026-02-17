import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function checkExistingSchema() {
  console.log('🔍 Checking existing AgentForge schema in Supabase...\n')

  // Check for existing agent_memories table
  const { data: memories, error: memoriesError } = await supabase
    .from('agent_memories')
    .select('*')
    .limit(1)

  if (!memoriesError) {
    console.log('✅ AgentForge "agent_memories" table EXISTS')
    console.log('📊 Sample:', memories)
  } else {
    console.log('❌ agent_memories table:', memoriesError.message)
  }

  // Check for swarms table
  const { data: swarms, error: swarmsError } = await supabase
    .from('swarms')
    .select('*')
    .limit(1)

  if (!swarmsError) {
    console.log('✅ AgentForge "swarms" table EXISTS')
  } else {
    console.log('❌ swarms table:', swarmsError.message)
  }

  // Check for agents table
  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('*')
    .limit(1)

  if (!agentsError) {
    console.log('✅ AgentForge "agents" table EXISTS')
  } else {
    console.log('❌ agents table:', agentsError.message)
  }
}

checkExistingSchema()
