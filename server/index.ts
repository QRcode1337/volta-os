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
import erismornRoutes from './routes/erismorn.js'
import { startNurtureScheduler } from './jobs/nurtureScheduler.js'
import { startEmbedder } from './jobs/embedder.js'

const app = express()
const PORT = process.env.PORT || 3001
const API_STUB_MODE = (process.env.API_STUB_MODE ?? 'true').toLowerCase() === 'true'

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

// ErisMorn core routes (status, intelligence, labs, observability, etc.)
app.use('/api', erismornRoutes)

// AgentForge + CASCADE API Routes
app.use('/api/memory', memoryRoutes)
app.use('/api/swarm', swarmRoutes)
app.use('/api/cascade', cascadeRoutes)

// Catch-all for unimplemented Volta OS endpoints (prevents 404 noise in console)
app.use('/api', (req, res) => {
  if (!API_STUB_MODE) {
    return res.status(404).json({
      ok: false,
      error: 'Not Found',
      path: req.originalUrl
    })
  }

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
  console.log(`🧪 API stub mode: ${API_STUB_MODE}`)
  startNurtureScheduler()
  startEmbedder()
})

export default app
