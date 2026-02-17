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

async function checkTables() {
  console.log('🔍 Checking if tables exist via SQL query...\n')
  
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('swarms', 'swarm_agents', 'cascade_leads', 'cascade_bookings', 'cascade_nurture_sequences')
      ORDER BY table_name;
    `
  })
  
  if (error) {
    console.log('❌ Query failed. Tables might exist but PostgREST cache needs refresh.')
    console.log('Error:', error.message)
    console.log('\n💡 Solution: Go to Supabase Dashboard → Settings → API → Click "Reload schema cache"')
  } else {
    console.log('✅ Found tables:', data)
  }
}

checkTables()
