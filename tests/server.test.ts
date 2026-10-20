import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, symlink, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  const body = JSON.stringify({ schemaVersion: 3, snapshot, operationId: 'operation-0123456789' })
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
      schemaVersion: 3,
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
        body: JSON.stringify({ schemaVersion: 3, snapshot, operationId: 'invalid-operation-0123' }),
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
    body: JSON.stringify({
      schemaVersion: 3,
      snapshot: d,
      operationId: 'different-server-operation',
    }),
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
test('restored Docker stays authenticated even with public stats and version metadata is available', async () => {
  const previous = process.env.NAV_PUBLIC_MONITOR
  process.env.NAV_PUBLIC_MONITOR = 'true'
  try {
    assert.equal((await app.request('/api/system/docker')).status, 401)
  } finally {
    if (previous === undefined) delete process.env.NAV_PUBLIC_MONITOR
    else process.env.NAV_PUBLIC_MONITOR = previous
  }
  const response = await app.request('/api/system/docker', { headers: auth })
  assert.equal(response.status, 200)
  assert.ok(Array.isArray((await response.json()).containers))
  const version = await app.request('/api/system/version')
  assert.equal(version.status, 200)
  assert.match((await version.json()).version, /^v?\d+\.\d+\.\d+/)
})

test('schema capability is explicit and old protocol writes cannot remove canvas settings', async () => {
  const r = await app.request('/api/dashboards'),
    d = await r.json()
  assert.equal(r.headers.get('X-Nav-State-Schema'), '3')
  const old = structuredClone(d)
  delete old.documentVersion
  delete old.canvasScene
  delete old.canvasSettings
  const rejected = await app.request('/api/dashboards/default/state', {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': String(d.revision) },
    body: JSON.stringify({ snapshot: old, operationId: 'old-client-operation-001' }),
  })
  assert.equal(rejected.status, 426)
  assert.deepEqual(
    (await (await app.request('/api/dashboards')).json()).canvasSettings,
    d.canvasSettings,
  )
})
test('V2 server enforces layout locks after revision and operation deduplication and rejects V1 writes', async () => {
  const { initialScene, applyCanvasCommand } = await import('../packages/shared/src/index.ts')
  const initial = await (await app.request('/api/dashboards')).json(),
    l = { x: 0, y: 0, w: 2, h: 3 }
  let d = { ...createDashboard(), instanceId: initial.instanceId, revision: initial.revision }
  d.widgets = ['lock-a', 'lock-b'].map((id, i) => ({
    id,
    widgetId: 'clock',
    source: 'builtin',
    config: {},
    layouts: { lg: l, md: l, sm: l, xs: l },
    canvas: { x: i * 200, y: 0, w: 100, h: 100 },
  }))
  d.canvasScene = initialScene(['lock-a', 'lock-b'])
  d = applyCanvasCommand(d, {
    type: 'group',
    id: 'lock-g',
    title: 'Locked group',
    widgetIds: ['lock-a', 'lock-b'],
  })
  const put = (snapshot: any, id: string, expected = snapshot.revision, schemaVersion = 3) =>
    app.request('/api/dashboards/default/state', {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': String(expected) },
      body: JSON.stringify({ schemaVersion, operationId: id, snapshot }),
    })
  let response = await put(d, 'v2-group-setup-operation')
  assert.equal(response.status, 200)
  d = await response.json()
  const locked = applyCanvasCommand(d, {
    type: 'set-lock',
    refs: [{ kind: 'widget', id: 'lock-a' }],
    locked: true,
  })
  response = await put(locked, 'v2-lock-save-operation')
  assert.equal(response.status, 200)
  const saved = await response.json()
  const bypass = structuredClone(saved)
  bypass.canvasScene.widgetMeta['lock-a'].locked = false
  bypass.widgets[1].canvas.x += 20
  assert.equal((await put(bypass, 'v2-lock-bypass-operation')).status, 400)
  const content = structuredClone(saved)
  content.widgets[0].config = { text: 'permitted' }
  response = await put(content, 'v2-content-save-operation')
  assert.equal(response.status, 200)
  assert.equal((await put(locked, 'v2-lock-save-operation', locked.revision)).status, 200)
  assert.equal(
    (await (await app.request('/api/dashboards')).json()).widgets[0].config.text,
    'permitted',
  )
  assert.equal(
    (
      await put(
        { ...saved, documentVersion: 2, canvasScene: undefined },
        'v1-write-test-operation',
        saved.revision,
        2,
      )
    ).status,
    426,
  )
})

test('all canvas maintenance commands reject a missing database without creating any files', async () => {
  const commands = ['canvas-v2-preflight', 'canvas-v2-dry-run', 'canvas-v2-migrate']
  for (const command of commands) {
    const path = join(dir, `${command}-missing.db`)
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        fileURLToPath(new URL('../packages/server/src/maintenance.ts', import.meta.url)),
        command,
      ],
      { env: { ...process.env, NAV_DB_PATH: path }, encoding: 'utf8', timeout: 10000 },
    )
    assert.equal(result.error, undefined)
    assert.notEqual(result.status, 0, command)
    assert.match(result.stderr, /数据库不存在/, command)
    for (const suffix of ['', '-wal', '-shm'])
      assert.equal(existsSync(path + suffix), false, `${command}${suffix}`)
  }
})
test('camera migration dry-run, backup, idempotence and rollback protect the original rows', async () => {
  const { migrateCanvasDatabase } = await import('../packages/server/src/db/state.ts')
  const old: any = createDashboard()
  delete old.documentVersion
  delete old.canvasScene
  delete old.canvasSettings
  const layout = { x: 0, y: 0, w: 4, h: 3 }
  old.widgets = [
    {
      id: 'migration-clock',
      widgetId: 'clock',
      source: 'builtin',
      config: { label: 'preserved' },
      layouts: { lg: layout, md: layout, sm: layout, xs: layout },
    },
  ]
  old.id = 'migration-fixture'
  old.layoutMode = 'canvas'
  old.viewport = { panX: 20, panY: 40, zoom: 0.5, homeX: 0, homeY: 0 }
  db.prepare('INSERT INTO dashboards(id,name,state_json,revision) VALUES(?,?,?,?)').run(
    old.id,
    'fixture',
    JSON.stringify(old),
    7,
  )
  const before = db.prepare('SELECT * FROM dashboards WHERE id=?').get(old.id)
  const backups = (db.prepare('SELECT count(*) n FROM migration_backups').get() as any).n
  migrateCanvasDatabase(false)
  assert.deepEqual(db.prepare('SELECT * FROM dashboards WHERE id=?').get(old.id), before)
  assert.equal((db.prepare('SELECT count(*) n FROM migration_backups').get() as any).n, backups)
  migrateCanvasDatabase(true)
  migrateCanvasDatabase(true)
  const row = db.prepare('SELECT * FROM dashboards WHERE id=?').get(old.id) as any
  assert.equal(row.revision, 8)
  assert.equal(JSON.parse(row.state_json).documentVersion, 3)
  const mirrored = db
    .prepare('SELECT canvas,config FROM widget_instances WHERE id=?')
    .get('migration-clock') as any
  assert.deepEqual(JSON.parse(mirrored.canvas), JSON.parse(row.state_json).widgets[0].canvas)
  assert.deepEqual(JSON.parse(mirrored.config), { label: 'preserved' })
  const backup = JSON.parse(
    (
      db
        .prepare('SELECT payload FROM migration_backups WHERE backup_key=?')
        .get('canvas-scene-v2:migration-fixture:7') as any
    ).payload,
  )
  assert.deepEqual(backup.dashboard, before)
  const bad = {
    ...old,
    id: 'invalid-migration',
    widgets: [
      {
        id: 'bad',
        widgetId: 'clock',
        source: 'builtin',
        config: {},
        layouts: { lg: { x: 0, y: 0, w: 4, h: 3 } },
        canvas: { x: Infinity, y: 0, w: 0, h: 100 },
      },
    ],
  }
  db.prepare('INSERT INTO dashboards(id,name,state_json,revision) VALUES(?,?,?,?)').run(
    bad.id,
    'invalid',
    JSON.stringify(bad),
    0,
  )
  assert.throws(() => migrateCanvasDatabase(true))
  assert.equal(
    (db.prepare('SELECT revision FROM dashboards WHERE id=?').get(bad.id) as any).revision,
    0,
  )
  assert.equal(
    db
      .prepare('SELECT 1 FROM migration_backups WHERE backup_key=?')
      .get('canvas-scene-v2:invalid-migration:0'),
    undefined,
  )
})
