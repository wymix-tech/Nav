import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import * as q from '../db/queries.js'

const widgets = new Hono()

widgets.post('/:dashboardId/widgets', authMiddleware, async (c) => {
  const body = await c.req.json()
  const id = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  q.insertWidgetInstance({
    id,
    dashboardId: c.req.param('dashboardId')!,
    widgetId: body.widgetId,
    source: body.source,
    config: body.config ?? {},
    layouts: body.layouts,
  })
  return c.json({ id, ...body })
})

widgets.put('/:instanceId', authMiddleware, async (c) => {
  const body = await c.req.json()
  q.updateWidgetInstance(c.req.param('instanceId')!, { config: body.config, layouts: body.layouts })
  return c.json({ success: true })
})

widgets.delete('/:instanceId', authMiddleware, (c) => {
  q.deleteWidgetInstance(c.req.param('instanceId')!)
  return c.json({ success: true })
})

export default widgets
