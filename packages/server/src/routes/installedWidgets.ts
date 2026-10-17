import { Hono, type Context } from 'hono'
import { createHash } from 'node:crypto'
import { validateInstalled, assert } from '@nav/shared'
import { authMiddleware } from '../middleware/auth.js'
import db from '../db/database.js'
import { StateError } from '../db/state.js'
const installedWidgets = new Hono()
function revision() {
  return (
    db.prepare('SELECT revision FROM catalog_metadata WHERE id=1').get() as { revision: number }
  ).revision
}
function change(c: Context, body: unknown, write: () => void) {
  const raw = c.req.header('If-Match')
  if (!raw) throw new StateError(428, '需要插件目录版本')
  assert(/^(?:\d+|"\d+")$/.test(raw), '目录版本无效')
  const id = c.req.header('Idempotency-Key')
  assert(typeof id === 'string' && /^[\w-]{16,100}$/.test(id), '缺少幂等操作 ID')
  const hash = createHash('sha256')
    .update(JSON.stringify({ method: c.req.method, path: c.req.path, body }))
    .digest('hex')
  return db.transaction(() => {
    const old = db.prepare('SELECT * FROM committed_operations WHERE operation_id=?').get(id) as any
    if (old) {
      if (old.request_hash !== hash || old.dashboard_id !== 'catalog')
        throw new StateError(409, '操作 ID 冲突')
      return JSON.parse(old.response)
    }
    if (Number(raw.replaceAll('"', '')) !== revision())
      throw new StateError(412, '插件目录已改变，请刷新后重试')
    write()
    db.prepare('UPDATE catalog_metadata SET revision=revision+1 WHERE id=1').run()
    const response = { success: true, revision: revision() }
    db.prepare(
      'INSERT INTO committed_operations(operation_id,dashboard_id,request_hash,response) VALUES(?,?,?,?)',
    ).run(id, 'catalog', hash, JSON.stringify(response))
    return response
  })()
}
installedWidgets.get('/revision', (c) => c.json({ revision: revision() }))
installedWidgets.get('/', (c) => {
  c.header('ETag', `"${revision()}"`)
  const rows = db.prepare('SELECT * FROM installed_widgets').all() as any[]
  return c.json(
    rows.map((r) => {
      const saved = JSON.parse(r.manifest)
      return (
        saved.installed ?? {
          widgetId: r.widget_id,
          manifest: saved,
          cdnUrl: '',
          installedAt: r.installed_at,
        }
      )
    }),
  )
})
installedWidgets.post('/', authMiddleware, async (c) => {
  const body = await c.req.json()
  validateInstalled(body)
  return c.json(
    change(c, body, () => {
      db.prepare(
        'INSERT INTO installed_widgets(widget_id,manifest) VALUES(?,?) ON CONFLICT(widget_id) DO UPDATE SET manifest=excluded.manifest,installed_at=CURRENT_TIMESTAMP',
      ).run(body.widgetId, JSON.stringify({ installed: body }))
    }),
  )
})
installedWidgets.delete('/:widgetId', authMiddleware, (c) => {
  const id = c.req.param('widgetId')
  return c.json(
    change(c, null, () => {
      if (
        db
          .prepare(
            "SELECT 1 FROM widget_instances WHERE source='installed' AND widget_id=? LIMIT 1",
          )
          .get(id)
      )
        throw new StateError(409, '请先删除引用此插件的组件')
      if (!db.prepare('DELETE FROM installed_widgets WHERE widget_id=?').run(id).changes)
        throw new StateError(409, '插件已经不存在，请刷新目录')
    }),
  )
})
export default installedWidgets
