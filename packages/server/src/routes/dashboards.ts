import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import * as q from '../db/queries.js'

const dashboards = new Hono()

dashboards.get('/', (c) => {
  const d = q.getDashboard('default')
  if (!d) {
    q.upsertDashboard({ id: 'default', name: '我的导航', columns: 12, rowHeight: 80 })
    const fresh = q.getDashboard('default')
    const widgets = q.getWidgetInstances('default')
    return c.json({ ...fresh, widgets })
  }
  const widgets = q.getWidgetInstances('default')
  return c.json({ ...d, widgets })
})

dashboards.put('/:id', authMiddleware, async (c) => {
  const body = await c.req.json()
  const name = typeof body.name === 'string' ? body.name : '我的导航'
  const title = typeof body.title === 'string' ? body.title : 'INFI.NAV - 个人导航页'
  const columns = typeof body.columns === 'number' ? body.columns : 12
  const rowHeight = typeof body.rowHeight === 'number' ? body.rowHeight : 80
  const background = body.background ? JSON.stringify(body.background) : '{}'
  const layoutMode = typeof body.layoutMode === 'string' ? body.layoutMode : 'canvas'
  const viewport = body.viewport ? JSON.stringify(body.viewport) : '{"panX":0,"panY":0,"zoom":1,"homeX":0,"homeY":0}'
  q.upsertDashboard({ id: c.req.param('id')!, name, title, columns, rowHeight, background, layoutMode, viewport })
  return c.json({ success: true })
})

export default dashboards
