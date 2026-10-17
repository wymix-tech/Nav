import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, symlink, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createDashboard } from '../packages/shared/src/index.ts'
const dir = await mkdtemp(join(tmpdir(), 'nav-server-test-'))
process.env.NAV_JWT_SECRET = 'test-only-secret'
process.env.NAV_PASSWORD = 'test-password'
process.env.NAV_DB_PATH = join(dir, 'test.db')
process.env.NAV_UPLOAD_DIR = join(dir, 'uploads')
process.env.NAV_PUBLIC_DIR = join(dir, 'public')
await mkdir(process.env.NAV_PUBLIC_DIR)
await writeFile(join(process.env.NAV_PUBLIC_DIR, 'index.html'), '<html>app</html>')
const { createApp } = await import('../packages/server/src/app.ts')
const { generateToken } = await import('../packages/server/src/middleware/auth.ts')
const { default: db } = await import('../packages/server/src/db/database.ts')
const { RateLimiter } = await import('../packages/server/src/security.ts')
const app = createApp(),
  token = generateToken(),
  auth = { Authorization: `Bearer ${token}` }
const serverRequire = createRequire(new URL('../packages/server/package.json', import.meta.url))
const sharp = serverRequire('sharp')
after(async () => {
  db.close()
  await rm(dir, { recursive: true, force: true })
})
test('POST token validation is strict and unmatched API requests never return HTML', async () => {
  let r = await app.request('/api/auth/verify', { method: 'POST', headers: auth })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { valid: true })
  r = await app.request('/api/auth/verify')
  assert.equal(r.status, 404)
  assert.match(r.headers.get('Content-Type')!, /json/)
})
test('upload reads reject encoded traversal, symlinks and active documents', async () => {
  await mkdir(process.env.NAV_UPLOAD_DIR!, { recursive: true })
  await writeFile(join(dir, 'sentinel.txt'), 'harmless-sentinel')
  for (const path of [
    '/uploads/..%2Fsentinel.txt',
    '/uploads/%252e%252e%252fsentinel.txt',
    '/uploads/fixture.svg',
  ])
    assert.equal((await app.request(path)).status, 404)
  const name = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'
  await symlink(join(dir, 'sentinel.txt'), join(process.env.NAV_UPLOAD_DIR!, name))
  assert.equal((await app.request('/uploads/' + name)).status, 404)
})
test('content sniffing rejects SVG disguised as PNG and re-encodes a real raster', async () => {
  const bad = new FormData()
  bad.set(
    'file',
    new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>void 0</script></svg>'], 'a.png', {
      type: 'image/png',
    }),
  )
  assert.equal(
    (await app.request('/api/upload', { method: 'POST', headers: auth, body: bad })).status,
    400,
  )
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
      .png()
      .toBuffer(),
    form = new FormData()
  form.set('file', new File([bytes], 'ok.png', { type: 'text/plain' }))
  const uploaded = await app.request('/api/upload', { method: 'POST', headers: auth, body: form })
  assert.equal(uploaded.status, 200)
  const { url } = await uploaded.json()
  const r = await app.request(url)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('Content-Type'), 'image/webp')
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff')
})
test('snapshot commits are conditional, atomic and idempotent after lost responses', async () => {
  const initial = await (await app.request('/api/dashboards')).json()
  const snapshot = { ...initial, title: 'updated' }
  const body = JSON.stringify({ snapshot, operationId: 'operation-0123456789' })
  const save = () =>
    app.request('/api/dashboards/default/state', {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': '"0"' },
      body,
    })
  assert.equal((await save()).status, 200)
  assert.equal((await save()).status, 200)
  assert.equal((await (await app.request('/api/dashboards')).json()).revision, 1)
  const r = await app.request('/api/dashboards/default/state', {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': '"0"' },
    body: JSON.stringify({
      snapshot: { ...snapshot, title: 'stale' },
      operationId: 'different-operation-0123',
    }),
  })
  assert.equal(r.status, 412)
  assert.equal((await (await app.request('/api/dashboards')).json()).title, 'updated')
})
test('bad snapshots, missing conditions and old blind-write clients are rejected', async () => {
  const snapshot = {
    ...createDashboard(),
    instanceId: (await (await app.request('/api/dashboards')).json()).instanceId,
  }
  snapshot.columns = 0
  assert.equal(
    (
      await app.request('/api/dashboards/default/state', {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify({ snapshot, operationId: 'invalid-operation-0123' }),
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await app.request('/api/dashboards/default/state', {
        method: 'PUT',
        headers: auth,
        body: '{}',
      })
    ).status,
    428,
  )
  assert.equal(
    (await app.request('/api/widgets/any', { method: 'PUT', headers: auth })).status,
    426,
  )
})
test('monitor details require authentication and reject arbitrary disk paths', async () => {
  assert.equal((await app.request('/api/system/stats')).status, 401)
  assert.equal(
    (await app.request('/api/system/stats?disks=/arbitrary', { headers: auth })).status,
    400,
  )
})
test('rate limiting has expiry, bounded storage and ignores spoofed proxy headers', async () => {
  const limiter = new RateLimiter(1, 100, 1)
  assert.ok(limiter.allow('a', 0))
  assert.ok(!limiter.allow('a', 1))
  assert.ok(!limiter.allow('b', 1))
  assert.ok(limiter.allow('b', 101))
  let r: Response
  for (let i = 0; i < 6; i++)
    r = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `fake-${i}` },
      body: JSON.stringify({ password: 'bad' }),
    })
  assert.equal(r!.status, 429)
})

test('oversized streaming multipart is rejected before image parsing', async () => {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(7 * 1024 * 1024)], 'huge.png', { type: 'image/png' }))
  const r = await app.request('/api/upload', { method: 'POST', headers: auth, body: form })
  assert.equal(r.status, 413)
})
test('snapshot requests from a replaced server instance cannot overwrite the new database', async () => {
  const d = await (await app.request('/api/dashboards')).json()
  d.instanceId = 'different-server'
  const r = await app.request('/api/dashboards/default/state', {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': String(d.revision) },
    body: JSON.stringify({ snapshot: d, operationId: 'different-server-operation' }),
  })
  assert.equal(r.status, 412)
})
test('CPU usage is measured from deltas instead of boot-time totals', async () => {
  const { cpuUsage } = await import('../packages/server/src/systemSampler.ts')
  const cpu = (idle: number, user: number) => [
    { model: 'test', speed: 1, times: { idle, user, nice: 0, sys: 0, irq: 0 } },
  ]
  cpuUsage(cpu(100, 100))
  assert.equal(cpuUsage(cpu(150, 150)), 50)
})
