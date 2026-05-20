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
  if (!body.widgetId || !body.manifest) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'widgetId 和 manifest 为必填字段' } }, 400)
  }
  // 校验 manifest 基本结构
  const m = body.manifest
  if (typeof m !== 'object' || !m.name || !m.version || !m.entry) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'manifest 必须包含 name、version、entry 字段' } }, 400)
  }
  q.insertInstalledWidget({ widgetId: body.widgetId, manifest: body.manifest })
  return c.json({ success: true })
})

installedWidgets.delete('/:widgetId', authMiddleware, (c) => {
  q.deleteInstalledWidget(c.req.param('widgetId')!)
  return c.json({ success: true })
})

export default installedWidgets
