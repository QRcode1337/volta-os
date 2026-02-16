// Load environment variables FIRST before any other imports
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

// Now import everything else
import express from 'express'
import cors from 'cors'
import memoryRoutes from './routes/memory.js'
import swarmRoutes from './routes/swarm.js'
import cascadeRoutes from './routes/cascade.js'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      memory: 'ready',
      swarm: 'ready',
      cascade: 'ready'
    }
  })
})

// Volta OS compatibility endpoints (prevent console errors from existing components)
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    heartbeatState: {
      lastBeat: new Date().toISOString(),
      criticalAlerts: []
    }
  })
})

app.get('/api/btc-price', (req, res) => {
  res.json({ price: null, source: 'placeholder' })
})

app.get('/api/cron-jobs', (req, res) => {
  res.json({ jobs: [] })
})

// AgentForge + CASCADE API Routes
app.use('/api/memory', memoryRoutes)
app.use('/api/swarm', swarmRoutes)
app.use('/api/cascade', cascadeRoutes)

// Catch-all for unimplemented Volta OS endpoints (prevents 404 noise in console)
app.use('/api', (req, res) => {
  res.json({ ok: true, stub: true, data: null, jobs: [], items: [], message: 'Endpoint not yet implemented' })
})

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({ 
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Volta OS AgentForge Server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🧠 Memory API: http://localhost:${PORT}/api/memory`)
  console.log(`🤖 Swarm API: http://localhost:${PORT}/api/swarm`)
  console.log(`📞 CASCADE API: http://localhost:${PORT}/api/cascade`)
})

export default app
