import 'fake-indexeddb/auto'
import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createDashboard, type Dashboard } from '../packages/shared/src/index.ts'
const events = new EventTarget(),
  documentEvents = new EventTarget()
Object.defineProperty(globalThis, 'window', { value: events, configurable: true })
Object.defineProperty(globalThis, 'document', {
  value: Object.assign(documentEvents, { hidden: false }),
  configurable: true,
})
Object.defineProperty(globalThis, 'location', {
  value: { origin: 'http://storage.test' },
  configurable: true,
})
const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  },
  configurable: true,
})
let online = true,
  remote = createDashboard(),
  loseResponse = false,
  putCount = 0
Object.defineProperty(globalThis, 'navigator', {
  value: {
    get onLine() {
      return online
    },
  },
  configurable: true,
})
const accepted = new Map<string, Dashboard>()
globalThis.fetch = async (path: any, options: any = {}) => {
  if (!online) throw new TypeError('offline')
  const json = (x: any, status = 200) =>
    new Response(JSON.stringify(x), {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Nav-State-Schema': '2' },
    })
  if (options.method === 'PUT') {
    putCount++
    const { snapshot, operationId } = JSON.parse(options.body)
    if (accepted.has(operationId)) return json(accepted.get(operationId))
    if (Number(options.headers['If-Match'].replaceAll('"', '')) !== remote.revision)
      return json({ error: { message: 'conflict' } }, 412)
    remote = { ...snapshot, revision: remote.revision! + 1 }
    accepted.set(operationId, structuredClone(remote))
    if (loseResponse) {
      loseResponse = false
      throw new TypeError('response lost')
    }
    return json(remote)
  }
  return json(remote)
}
const { localDatabase: db } = await import('../packages/frontend/src/services/localDatabase.ts')
const { LocalAdapter } = await import('../packages/frontend/src/services/localAdapter.ts')
const { SyncAdapter } = await import('../packages/frontend/src/services/syncAdapter.ts')
beforeEach(async () => {
  online = true
  remote = createDashboard()
  putCount = 0
  loseResponse = false
  accepted.clear()
  storage.clear()
  await db.sync.clear()
  await db.dashboards.clear()
  await db.backups.clear()
})
after(() => db.close())
test('local changes really survive a new adapter and invalid updates do not overwrite data', async () => {
  const adapter = new LocalAdapter(),
    d = await adapter.getDashboard()
  d.title = 'persisted'
  await adapter.saveDashboard(d)
  assert.equal((await new LocalAdapter().getDashboard()).title, 'persisted')
  d.columns = 0
  await assert.rejects(() => adapter.saveDashboard(d))
  assert.equal((await adapter.getDashboard()).columns, 12)
})
test('standalone v1 migration saves an exact backup and runs only once', async () => {
  const old: any = createDashboard()
  delete old.layoutVersion
  delete old.layoutSettings
  await db.dashboards.put({ id: 'default', data: JSON.stringify(old), updatedAt: 'old' })
  const adapter = new LocalAdapter()
  await adapter.getDashboard()
  await adapter.getDashboard()
  assert.equal((await db.backups.toArray()).length, 1)
  assert.deepEqual(JSON.parse((await db.backups.get('layout-v1:standalone'))!.data), old)
})
test('offline drafts survive adapter recreation and synchronize in order', async () => {
  const a = new SyncAdapter()
  try {
    const d = await a.getDashboard()
    online = false
    d.title = 'offline draft'
    await a.saveDashboard(d)
    await a.flush()
    assert.equal((await db.sync.get(a.key))?.pending.length, 1)
    assert.equal((await a.cached())?.title, 'offline draft')
    online = true
    localStorage.setItem('nav_token', 'test-session')
    await a.flush()
    assert.equal(remote.title, 'offline draft')
    assert.equal((await a.getSyncState()).pendingChanges, 0)
  } finally {
    await a.dispose()
  }
})
test('lost responses are retried with the same operation ID before refresh can create false conflicts', async () => {
  const a = new SyncAdapter()
  try {
    const d = await a.getDashboard()
    online = false
    d.title = 'once'
    await a.saveDashboard(d)
    localStorage.setItem('nav_token', 'test-session')
    online = true
    loseResponse = true
    await a.flush()
    assert.equal(remote.revision, 1)
    await a.getDashboard()
    assert.equal((await a.getSyncState()).status, 'error')
    await a.flush()
    assert.equal(remote.revision, 1)
    assert.equal((await a.getSyncState()).pendingChanges, 0)
    assert.equal(putCount, 2)
  } finally {
    await a.dispose()
  }
})
test('a remote conflict preserves local and remote snapshots and needs explicit resolution', async () => {
  const a = new SyncAdapter()
  try {
    const d = await a.getDashboard()
    online = false
    d.title = 'local'
    await a.saveDashboard(d)
    remote = { ...remote, title: 'remote', revision: 1 }
    online = true
    localStorage.setItem('nav_token', 'test-session')
    await a.flush()
    assert.equal((await a.getSyncState()).status, 'conflict')
    assert.equal((await a.cached())?.title, 'local')
    assert.equal(remote.title, 'remote')
    await a.resolveConflict(false)
    assert.equal((await a.cached())?.title, 'remote')
    assert.equal((await db.backups.toArray()).length, 1)
  } finally {
    await a.dispose()
  }
})

test('two tabs cannot silently replace each other’s unsent drafts', async () => {
  const a = new SyncAdapter(),
    b = new SyncAdapter()
  try {
    const first = await a.getDashboard(),
      second = await b.getDashboard()
    online = false
    first.title = 'tab A'
    await a.saveDashboard(first)
    second.title = 'tab B'
    await assert.rejects(() => b.saveDashboard(second), /标签页/)
    assert.equal((await a.cached())?.title, 'tab A')
  } finally {
    await a.dispose()
    await b.dispose()
  }
})
test('standalone canvas migration preserves geometry and backs up credentials before removing public keys', async () => {
  const l = { x: 0, y: 0, w: 4, h: 3 },
    canvas = { x: 320, y: -160, w: 600, h: 480, originalW: 320, originalH: 240 }
  const old: any = {
    ...createDashboard(),
    layoutMode: 'canvas',
    viewport: { panX: 100, panY: 80, zoom: 0.8, homeX: 20, homeY: 30 },
    viewportWidth: 1920,
    viewportHeight: 1080,
    widgets: [
      {
        id: 'chat-legacy',
        widgetId: 'chat',
        source: 'builtin',
        config: { apiKey: 'synthetic-legacy-key' },
        layouts: { lg: l, md: l, sm: l, xs: l },
        canvas,
      },
    ],
  }
  delete old.layoutVersion
  await db.dashboards.put({ id: 'default', data: JSON.stringify(old), updatedAt: 'legacy' })
  const adapter = new LocalAdapter(),
    d = await adapter.getDashboard()
  assert.deepEqual(d.widgets[0].canvas, canvas)
  assert.deepEqual(d.viewport, old.viewport)
  assert.equal(d.widgets[0].config.apiKey, undefined)
  const backup = JSON.parse((await db.backups.get('layout-v1:standalone'))!.data)
  assert.deepEqual(backup, old)
  d.title = 'new title'
  await adapter.saveDashboard(d)
  assert.deepEqual((await adapter.getDashboard()).widgets[0].canvas, canvas)
  assert.deepEqual(JSON.parse((await db.backups.get('layout-v1:standalone'))!.data), old)
})

test('legacy pending operations are backed up unchanged and require explicit new-operation recovery', async () => {
  const a = new SyncAdapter()
  try {
    await a.getDashboard()
    const old: any = structuredClone(remote)
    delete old.documentVersion
    delete old.canvasSettings
    old.title = 'legacy offline draft'
    const pending = [{ id: 'legacy-possibly-committed', snapshot: structuredClone(old) }]
    await db.sync.put({
      key: a.key,
      snapshot: old,
      revision: 0,
      generation: 4,
      pending,
      lastSyncAt: null,
    })
    const returned = await a.getDashboard()
    assert.equal(returned.documentVersion, 2)
    localStorage.setItem('nav_token', 'test-session')
    await a.flush()
    assert.equal(putCount, 0)
    assert.equal((await a.getSyncState()).status, 'upgrade-required')
    assert.deepEqual((await db.sync.get(a.key))!.pending, pending)
    const backup = JSON.parse((await db.backups.get(`canvas-queue-v1:${a.key}:4`))!.data)
    assert.deepEqual(backup.pending, pending)
    await a.resolveConflict(true)
    assert.equal(remote.title, 'legacy offline draft')
    assert.equal(remote.documentVersion, 2)
    assert.equal(accepted.has('legacy-possibly-committed'), false)
    assert.equal((await a.getSyncState()).pendingChanges, 0)
  } finally {
    await a.dispose()
  }
})
test('view preferences are independent, ordered, and excluded from exported document state', async () => {
  const { writeViewPreference, readViewPreference } =
    await import('../packages/frontend/src/canvas/viewPreferenceService.ts')
  const a = new LocalAdapter(),
    d = await a.getDashboard(),
    before = await db.dashboards.get(d.id)
  await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      writeViewPreference({
        key: 'camera:test',
        version: 1,
        camera: { centerX: i, centerY: -i, zoom: 1 },
        presentation: 'spatial',
        updatedAt: String(i),
      }),
    ),
  )
  assert.equal((await readViewPreference('camera:test'))!.camera.centerX, 99)
  assert.deepEqual(await db.dashboards.get(d.id), before)
  assert.equal((await db.sync.toArray()).length, 0)
  assert.equal(JSON.stringify(d).includes('camera:test'), false)
})

test('failed standalone document upgrade rolls back both backup and data', async () => {
  const raw: any = createDashboard()
  delete raw.documentVersion
  delete raw.canvasSettings
  raw.widgets = [
    {
      id: 'invalid',
      widgetId: 'clock',
      source: 'builtin',
      config: {},
      layouts: { lg: { x: 0, y: 0, w: 4, h: 3 } },
      canvas: { x: 0, y: 0, w: -1, h: 50 },
    },
  ]
  const original = JSON.stringify(raw)
  await db.dashboards.put({ id: 'default', data: original, updatedAt: 'old' })
  await assert.rejects(() => new LocalAdapter().getDashboard())
  assert.equal((await db.dashboards.get('default'))!.data, original)
  assert.equal((await db.backups.toArray()).length, 0)
})
test('blocked edits during legacy queue recovery are preserved outside the immutable pending operation', async () => {
  const a = new SyncAdapter()
  try {
    await a.getDashboard()
    const old: any = structuredClone(remote)
    delete old.documentVersion
    delete old.canvasSettings
    await db.sync.put({
      key: a.key,
      snapshot: old,
      revision: 0,
      generation: 0,
      pending: [{ id: 'immutable-old-operation', snapshot: old }],
      lastSyncAt: null,
    })
    const d = await a.getDashboard()
    d.title = 'additional unsaved edit'
    await assert.rejects(() => a.saveDashboard(d), /已备份/)
    assert.equal(JSON.parse((await db.backups.get(`upgrade-edit:${a.key}`))!.data).title, d.title)
    assert.equal((await db.sync.get(a.key))!.pending[0].snapshot.title, old.title)
    assert.ok(Array.isArray((await a.getRecoveryPreview())!.differences))
  } finally {
    await a.dispose()
  }
})

test('a server without schema capability receives no writes and the current protocol draft survives', async () => {
  const originalFetch = globalThis.fetch,
    a = new SyncAdapter()
  try {
    globalThis.fetch = async (...args: any[]) => {
      const response = await originalFetch(args[0], args[1])
      response.headers.delete('X-Nav-State-Schema')
      return response
    }
    const d = await a.getDashboard()
    d.title = 'new draft awaiting server upgrade'
    localStorage.setItem('nav_token', 'test-session')
    await a.saveDashboard(d)
    await a.flush()
    const pending = structuredClone((await db.sync.get(a.key))!.pending)
    assert.equal(putCount, 0)
    assert.equal((await a.getSyncState()).status, 'upgrade-required')
    globalThis.fetch = originalFetch
    await a.flush()
    assert.equal(remote.title, d.title)
    assert.equal(accepted.has(pending[0].id), true)
    assert.equal((await a.getSyncState()).pendingChanges, 0)
  } finally {
    globalThis.fetch = originalFetch
    await a.dispose()
  }
})
