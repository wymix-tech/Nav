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
  q.upsertDashboard({ id: c.req.param('id')!, name: body.name, columns: body.columns, rowHeight: body.rowHeight })
  return c.json({ success: true })
})

export default dashboards
