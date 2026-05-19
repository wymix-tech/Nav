import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import * as q from '../db/queries.js'

const installedWidgets = new Hono()

installedWidgets.get('/', (c) => {
  const rows = q.getInstalledWidgets()
  const result = rows.map((r: any) => ({
    widgetId: r.widget_id,
    manifest: JSON.parse(r.manifest),
    installedAt: r.installed_at,
  }))
  return c.json(result)
})

installedWidgets.post('/', authMiddleware, async (c) => {
  const body = await c.req.json()
  q.insertInstalledWidget({ widgetId: body.widgetId, manifest: body.manifest })
  return c.json({ success: true })
})

installedWidgets.delete('/:widgetId', authMiddleware, (c) => {
  q.deleteInstalledWidget(c.req.param('widgetId')!)
  return c.json({ success: true })
})

export default installedWidgets
