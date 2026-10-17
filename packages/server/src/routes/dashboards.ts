import { Hono } from 'hono'
import { assert, record } from '@nav/shared'
import { authMiddleware } from '../middleware/auth.js'
import { readSnapshot, commitSnapshot } from '../db/state.js'
import db from '../db/database.js'
const dashboards = new Hono()
dashboards.get('/', (c) => {
  const d = readSnapshot()
  c.header('ETag', `"${d.revision}"`)
  return c.json(d)
})
dashboards.get('/:id/backup', authMiddleware, (c) => {
  const rows = db
    .prepare(
      'SELECT backup_key,payload,created_at FROM migration_backups WHERE backup_key IN (?,?,?)',
    )
    .all(
      `layout-v1:${c.req.param('id')}`,
      `legacy-main-v1:${c.req.param('id')}`,
      `chat-credentials-v1:${c.req.param('id')}`,
    )
  return c.json({ backups: rows })
})
dashboards.put('/:id/state', authMiddleware, async (c) => {
  const raw = c.req.header('If-Match')
  if (!raw)
    return c.json({ error: { code: 'PRECONDITION_REQUIRED', message: '需要 If-Match 版本' } }, 428)
  assert(
    /^(?:\d+|"\d+")$/.test(raw) && Number.isSafeInteger(Number(raw.replaceAll('"', ''))),
    'If-Match 无效',
  )
  const body = await c.req.json()
  assert(record(body), '请求必须为 JSON 对象')
  const { snapshot, operationId } = body
  assert(
    snapshot?.id === c.req.param('id') && /^[\w-]{1,80}$/.test(snapshot.id),
    '仪表盘 ID 不一致',
  )
  assert(typeof operationId === 'string' && /^[\w-]{16,100}$/.test(operationId), '操作 ID 无效')
  const d = commitSnapshot(snapshot, Number(raw.replaceAll('"', '')), operationId)
  c.header('ETag', `"${d.revision}"`)
  return c.json(d)
})
dashboards.put('/:id', authMiddleware, (c) =>
  c.json({ error: { code: 'UPGRADE_REQUIRED', message: '请刷新页面使用版本化状态接口' } }, 426),
)
export default dashboards
