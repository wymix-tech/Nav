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
      headers: { 'Content-Type': 'application/json', 'X-Nav-State-Schema': '3' },
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
  old.documentVersion = 2
  delete old.canvasScene
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
    delete old.canvasScene
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
    assert.equal(returned.documentVersion, 3)
    localStorage.setItem('nav_token', 'test-session')
    await a.flush()
    assert.equal(putCount, 0)
    assert.equal((await a.getSyncState()).status, 'upgrade-required')
    assert.deepEqual((await db.sync.get(a.key))!.pending, pending)
    const backup = JSON.parse((await db.backups.get(`canvas-queue-v1:${a.key}:4`))!.data)
    assert.deepEqual(backup.pending, pending)
    await a.resolveConflict(true)
    assert.equal(remote.title, 'legacy offline draft')
    assert.equal(remote.documentVersion, 3)
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
  delete raw.canvasScene
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
    delete old.canvasScene
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

test('recovery previews expose every shared layout setting that resolution can replace', async () => {
  const a = new SyncAdapter()
  try {
    remote.instanceId = 'recovery-preview-server'
    const d = await a.getDashboard()
    const changes = {
      columns: 8,
      baseColumns: 8,
      rowHeight: 140,
      layoutSettings: { columnMode: 'custom', contentWidthMode: 'fluid', maxContentWidth: 1200 },
      layoutProfiles: { 'cols-8': {} },
    }
    for (const [field, value] of Object.entries(changes)) {
      await db.sync.put({
        key: a.key,
        snapshot: { ...d, [field]: value },
        conflict: d,
        revision: d.revision ?? 0,
        generation: 0,
        pending: [],
        lastSyncAt: null,
      })
      const preview = await a.getRecoveryPreview()
      assert.equal(preview!.differences.length, 1, field)
      assert.ok(preview!.differences[0].startsWith(`${field}:`), field)
    }
    const local = { ...d, ...changes } as Dashboard
    await db.sync.update(a.key, { snapshot: local })
    assert.equal((await a.getRecoveryPreview())!.differences.length, Object.keys(changes).length)
    online = false
    await assert.rejects(() => a.resolveConflict(true), /offline/)
    assert.deepEqual((await db.sync.get(a.key))!.snapshot, local)
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

test('first offline upgrade retains a legacy cached camera even with no pending document edits', async () => {
  const a = new SyncAdapter()
  try {
    const old: any = {
      ...remote,
      instanceId: 'same-server',
      viewport: { panX: 240, panY: -70, zoom: 0.5, homeX: 0, homeY: 0 },
      viewportWidth: 1920,
      viewportHeight: 1080,
    }
    delete old.documentVersion
    delete old.canvasScene
    delete old.canvasSettings
    await db.sync.put({
      key: a.key,
      snapshot: old,
      revision: 0,
      generation: 2,
      pending: [],
      lastSyncAt: null,
    })
    online = false
    const current = await a.getDashboard()
    assert.equal(current.documentVersion, 3)
    assert.deepEqual(
      JSON.parse((await db.backups.get('canvas-seed:same-server:default'))!.data),
      old,
    )
    assert.deepEqual((await db.sync.get(a.key))!.snapshot, old)
    assert.equal((await a.getSyncState()).pendingChanges, 0)
  } finally {
    await a.dispose()
  }
})

test('named views are independent of delayed camera writes, unique normalized names, and per-row compare-and-swap across tabs', async () => {
  const { changeNamedView, listNamedViews } =
    await import('../packages/frontend/src/canvas/namedViewService.ts')
  await db.namedViews.clear()
  const camera = { centerX: -123, centerY: 300, zoom: 2 },
    space = 'server:named-test:default'
  const row = (await changeNamedView(space, { type: 'create', name: 'Ｄｅｓｋ  One', camera }))!
  await assert.rejects(() => changeNamedView(space, { type: 'create', name: 'desk one', camera }))
  const results = await Promise.allSettled([
    changeNamedView(space, { type: 'rename', id: row.id, revision: 1, name: 'Renamed' }),
    changeNamedView(space, {
      type: 'update',
      id: row.id,
      revision: 1,
      camera: { ...camera, zoom: 3 },
    }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const latest = (await listNamedViews(space)).views[0]
  assert.equal(latest.revision, 2)
  await db.viewPreferences.put({
    key: space,
    version: 1,
    camera: { centerX: 0, centerY: 0, zoom: 1 },
    presentation: 'spatial',
    updatedAt: new Date().toISOString(),
  })
  assert.deepEqual((await listNamedViews(space)).views, [latest])
  await assert.rejects(
    () => changeNamedView(space, { type: 'delete', id: row.id, revision: 1 }),
    /另一标签页/,
  )
  await changeNamedView(space, { type: 'delete', id: row.id, revision: 2 })
  assert.equal((await listNamedViews(space)).views.length, 0)
  assert.equal((await db.viewPreferences.get(space))!.camera.zoom, 1)
})
test('named view limits, future records and invalid cameras retain original rows and cannot pollute public document backups', async () => {
  const { changeNamedView, listNamedViews } =
    await import('../packages/frontend/src/canvas/namedViewService.ts')
  await db.namedViews.clear()
  const space = 'server:limits:default',
    camera = { centerX: 0, centerY: 0, zoom: 1 }
  await assert.rejects(
    () => changeNamedView('server:unconfirmed:default', { type: 'create', name: 'x', camera }),
    /未确认/,
  )
  await assert.rejects(() =>
    changeNamedView(space, { type: 'create', name: 'bad', camera: { ...camera, zoom: 100 } }),
  )
  await assert.rejects(() =>
    changeNamedView(space, { type: 'create', name: '😀'.repeat(81), camera }),
  )
  for (let i = 0; i < 49; i++)
    await changeNamedView(space, { type: 'create', name: 'view ' + i, camera })
  const future: any = {
    spaceKey: space,
    id: 'future',
    version: 99,
    name: 'future',
    nameKey: 'future',
    camera,
    revision: 1,
    createdAt: 'old',
    updatedAt: 'old',
  }
  await db.namedViews.add(future)
  const list = await listNamedViews(space)
  assert.equal(list.views.length, 49)
  assert.equal(list.invalid, 1)
  await assert.rejects(
    () => changeNamedView(space, { type: 'create', name: 'too many', camera }),
    /50/,
  )
  await assert.rejects(
    () => changeNamedView(space, { type: 'delete', id: 'future', revision: 1 }),
    /未来/,
  )
  assert.deepEqual(await db.namedViews.get([space, 'future']), future)
  assert.equal(JSON.stringify(await db.backups.toArray()).includes('nameKey'), false)
})
test('V2 recovery compares same-count membership and layer changes and ignores harmless object key order', async () => {
  const { applyCanvasCommand, initialScene } = await import('../packages/shared/src/index.ts')
  const a = new SyncAdapter()
  try {
    const d = await a.getDashboard(),
      l = { x: 0, y: 0, w: 2, h: 3 }
    d.widgets = ['a', 'b', 'c'].map((id) => ({
      id,
      widgetId: 'clock',
      source: 'builtin',
      config: { one: 1, two: 2 },
      layouts: { lg: l, md: l, sm: l, xs: l },
      canvas: { x: 0, y: 0, w: 100, h: 100 },
    }))
    d.canvasScene = initialScene(['a', 'b', 'c'])
    const local = applyCanvasCommand(d, {
      type: 'group',
      widgetIds: ['a', 'b'],
      id: 'g',
      title: 'Work',
    })
    remote = applyCanvasCommand(d, {
      type: 'group',
      widgetIds: ['b', 'c'],
      id: 'g',
      title: 'Work',
    })
    await db.sync.put({
      key: a.key,
      snapshot: local,
      conflict: remote,
      revision: 0,
      pending: [],
      lastSyncAt: null,
    })
    assert.ok((await a.getRecoveryPreview())!.differences.some((x) => x.startsWith('canvasScene:')))
    const same = structuredClone(local)
    remote = structuredClone(same)
    same.widgets.forEach((w) => (w.config = { two: 2, one: 1 }))
    await db.sync.put({
      key: a.key,
      snapshot: local,
      conflict: same,
      revision: 0,
      pending: [],
      lastSyncAt: null,
    })
    assert.deepEqual((await a.getRecoveryPreview())!.differences, [])
  } finally {
    await a.dispose()
  }
})

test('recovery refreshes its preview, rechecks remote revision before applying and never merges stale locks implicitly', async () => {
  const a = new SyncAdapter()
  try {
    const d = await a.getDashboard()
    online = false
    d.title = 'Local draft'
    await a.saveDashboard(d)
    remote = { ...remote, title: 'Remote one', revision: 1 }
    online = true
    localStorage.setItem('nav_token', 'session')
    await a.flush()
    let preview = await a.getRecoveryPreview()
    assert.equal(preview!.remoteFresh, true)
    assert.equal(preview!.remoteTitle, 'Remote one')
    remote = { ...remote, title: 'Remote two', revision: 2 }
    await assert.rejects(() => a.resolveConflict(true), /远端已变化/)
    assert.equal((await db.sync.get(a.key))!.snapshot.title, 'Local draft')
    preview = await a.getRecoveryPreview()
    assert.equal(preview!.remoteTitle, 'Remote two')
    await a.resolveConflict(false)
    assert.equal((await a.cached())!.title, 'Remote two')
  } finally {
    await a.dispose()
  }
})
test('V1 pending and future snapshots keep immutable contents, while old-schema and future-server writes stay paused', async () => {
  const a = new SyncAdapter()
  try {
    const d = await a.getDashboard(),
      old = structuredClone(d)
    old.documentVersion = 2
    delete old.canvasScene
    await db.sync.put({
      key: a.key,
      snapshot: old,
      revision: 0,
      generation: 3,
      pending: [{ id: 'possibly-committed-v1', snapshot: old }],
      lastSyncAt: null,
    })
    const candidate = await a.getDashboard()
    assert.equal(candidate.documentVersion, 3)
    await a.flush()
    assert.equal(putCount, 0)
    assert.deepEqual((await db.sync.get(a.key))!.pending[0].snapshot, old)
    await assert.rejects(() => a.saveDashboard(old), /版本 3/)
    const future: any = { ...d, documentVersion: 4 }
    await db.sync.put({
      key: a.key,
      snapshot: future,
      revision: 0,
      generation: 4,
      pending: [{ id: 'future-operation', snapshot: future }],
      lastSyncAt: null,
    })
    await a.flush()
    assert.equal(putCount, 0)
    assert.equal((await a.getSyncState()).status, 'upgrade-required')
    assert.deepEqual((await db.sync.get(a.key))!.snapshot, future)
  } finally {
    await a.dispose()
  }
})
