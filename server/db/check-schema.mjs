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

async function checkSchema() {
  console.log('🔍 Checking Supabase schema...\n')

  // Check if agent_memories table exists
  const { data: tables, error: tablesError } = await supabase
    .from('agent_memories')
    .select('*')
    .limit(1)

  if (tablesError) {
    if (tablesError.message.includes('does not exist')) {
      console.log('❌ agent_memories table does NOT exist')
      console.log('📋 Need to execute migration SQL\n')
      return false
    } else {
      console.log('⚠️  Error checking table:', tablesError.message)
      return false
    }
  }

  console.log('✅ agent_memories table EXISTS')
  console.log('📊 Sample data:', data)
  return true
}

checkSchema()
