import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { dockerSnapshot } from '../dockerMonitor.js'
import { allowedDisks, systemSnapshot } from '../systemSampler.js'
const system = new Hono()
system.get('/docker', authMiddleware, async (c) => {
  const sample = await dockerSnapshot()
  const name = c.req.query('name')
  if (name && name.length > 200)
    return c.json({ error: { code: 'INVALID_NAME', message: '容器名过长' } }, 400)
  return c.json({
    ...sample,
    containers: name
      ? sample.containers.filter((x) => x.name.includes(name) || x.id.startsWith(name))
      : sample.containers,
  })
})
system.use('/stats', (c, next) =>
  process.env.NAV_PUBLIC_MONITOR === 'true' ? next() : authMiddleware(c, next),
)
system.get('/stats', (c) => {
  const requested =
    c.req
      .query('disks')
      ?.split(',')
      .map((s) => s.trim()) ?? allowedDisks
  if (requested.length > 8 || requested.some((p) => !allowedDisks.includes(p)))
    return c.json(
      { error: { code: 'INVALID_DISKS', message: '磁盘路径不在服务端允许列表中' } },
      400,
    )
  const snapshot = systemSnapshot()
  if (!snapshot)
    return c.json({ error: { code: 'NOT_READY', message: '正在获取首次采样，请稍后重试' } }, 503)
  const disks = snapshot.disks.filter((d: any) => requested.includes(d.path))
  if (process.env.NAV_PUBLIC_MONITOR === 'true')
    return c.json({
      ...snapshot,
      hostname: '',
      cpu: { ...snapshot.cpu, model: '' },
      gpu: snapshot.gpu ? { ...snapshot.gpu, name: 'GPU' } : null,
      disks: disks.map((d: any, i: number) => ({ ...d, path: `磁盘 ${i + 1}` })),
    })
  return c.json({ ...snapshot, disks })
})
export default system
