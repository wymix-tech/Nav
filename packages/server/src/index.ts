import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { existsSync } from 'node:fs'
import './db/database.js'
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboards.js'
import widgetRoutes from './routes/widgets.js'
import installedWidgetRoutes from './routes/installedWidgets.js'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({ origin: process.env.NAV_CORS_ORIGIN ?? 'http://localhost:3000' }))

// 全局错误处理
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, 500)
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/auth', authRoutes)
app.route('/api/dashboards', dashboardRoutes)
app.route('/api', widgetRoutes)
app.route('/api/installed-widgets', installedWidgetRoutes)

// 生产环境：serve 前端静态文件
const publicDir = './public'
if (existsSync(`${publicDir}/index.html`)) {
  app.use('/assets/*', serveStatic({ root: publicDir }))
  app.use('/favicon.ico', serveStatic({ root: publicDir }))
  app.get('*', serveStatic({ root: publicDir, path: 'index.html' }))
}

const port = Number(process.env.PORT ?? 4000)
console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
