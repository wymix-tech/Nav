import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import './db/database.js'
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboards.js'
import widgetRoutes from './routes/widgets.js'
import installedWidgetRoutes from './routes/installedWidgets.js'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({ origin: process.env.NAV_CORS_ORIGIN ?? 'http://localhost:3000' }))

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/auth', authRoutes)
app.route('/api/dashboards', dashboardRoutes)
app.route('/api/dashboards', widgetRoutes)
app.route('/api/installed-widgets', installedWidgetRoutes)

const port = Number(process.env.PORT ?? 4000)
console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
