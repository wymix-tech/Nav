import './env.js'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { ValidationError } from '@nav/shared'
import { StateError } from './db/state.js'
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboards.js'
import widgetRoutes from './routes/widgets.js'
import installedWidgetRoutes from './routes/installedWidgets.js'
import uploadRoutes, { files } from './routes/upload.js'
import systemRoutes from './routes/system.js'
import chatRoutes from './routes/chat.js'
import versionRoutes from './routes/version.js'

export function createApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.header('X-Request-Id', randomUUID())
    c.header('X-Content-Type-Options', 'nosniff')
    await next()
  })
  app.use(
    '/api/*',
    cors({
      origin: process.env.NAV_CORS_ORIGIN || 'http://localhost:3000',
      exposeHeaders: ['ETag', 'X-Nav-State-Schema'],
    }),
  )
  app.use('/api/*', async (c, next) =>
    c.req.path === '/api/upload' ? next() : bodyLimit({ maxSize: 2 * 1024 * 1024 })(c, next),
  )
  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json(
        {
          error: {
            code: 'HTTP_ERROR',
            message: error.status === 413 ? '请求体超过大小限制' : '请求无法处理',
          },
        },
        error.status,
      )
    if (error instanceof ValidationError || error instanceof SyntaxError)
      return c.json({ error: { code: 'VALIDATION_ERROR', message: error.message } }, 400)
    if (error instanceof StateError)
      return c.json({ error: { code: 'STATE_CONFLICT', message: error.message } }, error.status)
    console.error(
      'Request failed',
      c.res.headers.get('X-Request-Id'),
      error instanceof Error ? error.name : 'Unknown',
    )
    return c.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, 500)
  })
  app.get('/api/health', (c) => c.json({ status: 'ok', storageMode: 'server' }))
  app.route('/api/auth', authRoutes)
  app.route('/api/dashboards', dashboardRoutes)
  app.route('/api', widgetRoutes)
  app.route('/api/installed-widgets', installedWidgetRoutes)
  app.route('/api/upload', uploadRoutes)
  app.route('/api/system', versionRoutes)
  app.route('/api/system', systemRoutes)
  app.route('/api/chat', chatRoutes)
  app.route('/uploads', files)
  app.all('/api/*', (c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'API 不存在或请求方法不正确' } }, 404),
  )
  app.all('/uploads/*', (c) => c.notFound())
  const root = process.env.NAV_PUBLIC_DIR ?? './public'
  if (existsSync(`${root}/index.html`)) {
    app.use('/assets/*', serveStatic({ root }))
    app.get('/favicon.svg', serveStatic({ root }))
    app.get('/sw.js', async (c, next) => {
      c.header('Cache-Control', 'no-cache')
      return serveStatic({ root })(c, next)
    })
    app.get('*', async (c, next) =>
      c.req.path.startsWith('/assets/')
        ? c.notFound()
        : serveStatic({ root, path: 'index.html' })(c, next),
    )
  }
  return app
}
