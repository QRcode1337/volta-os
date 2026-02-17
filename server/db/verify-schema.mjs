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

async function verifySchema() {
  console.log('🔍 Verifying AgentForge x CASCADE schema in Supabase...\n')

  const tables = [
    'memories',
    'agents',
    'swarms',
    'swarm_agents',
    'cascade_leads',
    'cascade_bookings',
    'cascade_nurture_sequences'
  ]

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1)

    if (!error) {
      console.log(`✅ "${table}" table EXISTS`)
    } else {
      console.log(`❌ "${table}" table MISSING:`, error.message)
    }
  }

  console.log('\n🎯 Schema verification complete!')
}

verifySchema()
