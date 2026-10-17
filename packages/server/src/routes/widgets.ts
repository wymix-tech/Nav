import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
const widgets = new Hono()
for (const path of ['/widgets/:instanceId', '/dashboards/:dashboardId/widgets']) {
  widgets.all(path, authMiddleware, (c) =>
    c.json(
      { error: { code: 'UPGRADE_REQUIRED', message: '请刷新页面；组件变更需要原子状态接口' } },
      426,
    ),
  )
}
export default widgets
