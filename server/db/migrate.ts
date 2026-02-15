import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function runMigrations() {
  const schemaDir = path.join(__dirname, 'schema')

  if (!fs.existsSync(schemaDir)) {
    console.error('❌ Schema directory not found:', schemaDir)
    process.exit(1)
  }

  const files = fs.readdirSync(schemaDir).sort()
  console.log('🚀 Running database migrations...\n')

  for (const file of files) {
    if (!file.endsWith('.sql')) continue

    console.log(`📄 Processing: ${file}`)
    const sqlPath = path.join(schemaDir, file)
    const sql = fs.readFileSync(sqlPath, 'utf-8')

    // Note: Supabase client doesn't support arbitrary SQL execution via API
    // This migration runner displays SQL for manual execution in Supabase Dashboard
    console.log('\n📋 Copy and execute this SQL in Supabase SQL Editor:')
    console.log('━'.repeat(80))
    console.log(sql)
    console.log('━'.repeat(80))
    console.log('\n✅ Migration prepared:', file)
    console.log('   → Go to: https://supabase.com/dashboard/project/_/sql/new')
    console.log('   → Paste the SQL above')
    console.log('   → Click "Run"\n')
  }

  console.log('✨ All migrations listed successfully')
  console.log('\n💡 After running SQL in Supabase, you can verify with:')
  console.log('   SELECT * FROM agent_memories LIMIT 1;')
}

runMigrations().catch(console.error)
