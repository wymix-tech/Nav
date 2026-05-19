import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import './db/database.js'
import authRoutes from './routes/auth.js'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/auth', authRoutes)

const port = Number(process.env.PORT ?? 4000)
console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
