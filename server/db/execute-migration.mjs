import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function executeMigration() {
  console.log('🚀 Executing 002_swarms_and_cascade.sql migration...\n')

  const sqlPath = join(__dirname, 'schema/002_swarms_and_cascade.sql')
  const sql = readFileSync(sqlPath, 'utf-8')

  console.log('📋 SQL to execute:')
  console.log('─'.repeat(80))
  console.log(sql)
  console.log('─'.repeat(80))
  console.log('\n⚠️  IMPORTANT: Supabase REST API cannot execute raw SQL.')
  console.log('Please execute this SQL manually in Supabase Dashboard:\n')
  console.log('1. Go to: https://supabase.com/dashboard/project/sezdqsyywtkcgmntdqig/editor')
  console.log('2. Click "SQL Editor" in left sidebar')
  console.log('3. Click "+ New Query"')
  console.log('4. Copy-paste the SQL above')
  console.log('5. Click "Run" button\n')

  console.log('✅ After execution, run verification:')
  console.log('   node server/db/verify-schema.mjs\n')
}

executeMigration()
