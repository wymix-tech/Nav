import './env.js'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { existsSync, createReadStream } from 'node:fs'
import { resolve, extname } from 'node:path'
import './db/database.js'
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboards.js'
import widgetRoutes from './routes/widgets.js'
import installedWidgetRoutes from './routes/installedWidgets.js'
import uploadRoutes from './routes/upload.js'
import systemRoutes from './routes/system.js'

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
app.route('/api/upload', uploadRoutes)
app.route('/api/system', systemRoutes)

// 上传文件静态服务
const uploadDir = resolve(process.env.NAV_UPLOAD_DIR ?? '../uploads')
const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
}
app.get('/uploads/:filename', (c) => {
  const filename = c.req.param('filename')
  const filepath = resolve(uploadDir, filename)
  if (!existsSync(filepath)) return c.notFound()
  const ext = extname(filename).toLowerCase()
  const mime = MIME_MAP[ext] ?? 'application/octet-stream'
  c.header('Content-Type', mime)
  c.header('Cache-Control', 'public, max-age=31536000, immutable')
  return c.body(createReadStream(filepath) as any)
})

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
