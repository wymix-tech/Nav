import 'fake-indexeddb/auto'
import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { createDashboard, type Dashboard } from '../packages/shared/src/index.ts'

const require = createRequire(new URL('../packages/frontend/package.json', import.meta.url))
const { createPinia, setActivePinia } = await import(
  require.resolve('pinia').replace('/index.cjs', '/dist/pinia.mjs')
)
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true })
Object.defineProperty(globalThis, 'document', {
  value: Object.assign(new EventTarget(), { hidden: false }),
  configurable: true,
})
Object.defineProperty(globalThis, 'location', {
  value: { origin: 'http://history.test' },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true,
})
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null },
  configurable: true,
})
let remote: Dashboard
globalThis.fetch = async () =>
  new Response(JSON.stringify(remote), {
    headers: { 'Content-Type': 'application/json', 'X-Nav-State-Schema': '3' },
  })
const { getStorageAdapter } = await import('../packages/frontend/src/services/storageAdapter.ts')
const { SyncAdapter } = await import('../packages/frontend/src/services/syncAdapter.ts')
const { localDatabase: db } = await import('../packages/frontend/src/services/localDatabase.ts')
const { useDashboardStore } = await import('../packages/frontend/src/stores/dashboardStore.ts')
const { useAuthStore } = await import('../packages/frontend/src/stores/authStore.ts')
setActivePinia(createPinia())
const store = useDashboardStore(),
  adapter = (await getStorageAdapter()) as InstanceType<typeof SyncAdapter>
const snapshot = (title: string) => ({ ...structuredClone(remote), title })
beforeEach(async () => {
  remote = { ...createDashboard(), instanceId: 'history-test', revision: 0 }
  await db.sync.clear()
  await adapter.getDashboard()
  store.dashboard = snapshot('C')
  store.history = [snapshot('A'), snapshot('B')]
  store.future = []
  useAuthStore().state = 'authenticated'
  window.dispatchEvent(new CustomEvent('nav-editing-changed', { detail: true }))
})
after(async () => {
  await adapter.dispose()
  db.close()
})

test('an idle tab flush preserves history; a real external draft invalidates it without enabling a stale writer', async () => {
  const idle = new SyncAdapter(),
    monitor = new BroadcastChannel('nav-storage')
  const notification = () =>
    new Promise<void>((resolve) => {
      monitor.addEventListener('message', () => resolve(), { once: true })
    })
  try {
    await idle.getDashboard()
    // The editor's document and the cache represent the same content.
    store.dashboard = structuredClone(remote)
    const idleNotice = notification()
    await idle.flush()
    await idleNotice
    await delay(30)
    assert.equal(store.history.length, 2)
    assert.equal((await db.sync.get(adapter.key))!.revision, 0)

    const externalNotice = notification()
    await idle.saveDashboard(snapshot('external draft'))
    await externalNotice
    for (let i = 0; i < 100 && store.history.length; i++) await delay(5)
    assert.equal(store.history.length, 0)
    assert.equal(store.dashboard!.title, remote.title, 'do not replace an active editor')
    await assert.rejects(() => adapter.saveDashboard(snapshot('stale editor')), /标签页/)
  } finally {
    await idle.dispose()
    monitor.close()
  }
})

test('undo and redo update history before delayed persistence so new edits invalidate redo immediately', async (t) => {
  for (const direction of ['undo', 'redo'] as const) {
    store.dashboard = snapshot('C')
    store.history = [snapshot('A'), snapshot('B')]
    store.future = direction === 'redo' ? [snapshot('E')] : []
    const gate = Promise.withResolvers<void>()
    const save = t.mock.method(adapter, 'saveDashboard', async () => gate.promise)
    try {
      const historyOperation = store[direction]()
      assert.equal(store.dashboard!.title, direction === 'undo' ? 'B' : 'E')
      const edit = store.commit(snapshot('D'))
      gate.resolve()
      await Promise.all([historyOperation, edit])
      assert.equal(store.dashboard!.title, 'D')
      assert.deepEqual(store.future, [])
      assert.deepEqual(
        store.history.map((d) => d.title),
        direction === 'undo' ? ['A', 'B'] : ['A', 'B', 'C', 'E'],
      )
    } finally {
      gate.resolve()
      save.mock.restore()
    }
  }
})

test('invalid history targets leave stacks intact; failed saves keep the changed document explicitly unsaved', async (t) => {
  const invalid = snapshot('invalid')
  invalid.columns = 0
  store.history = [invalid]
  await store.undo()
  assert.equal(store.dashboard!.title, 'C')
  assert.equal(store.history.length, 1)
  assert.equal(store.future.length, 0)
  store.history = [snapshot('B')]
  t.mock.method(adapter, 'saveDashboard', async () => {
    throw new Error('disk unavailable')
  })
  await store.undo()
  assert.equal(store.dashboard!.title, 'B')
  assert.equal(store.history.length, 0)
  assert.equal(store.future[0].title, 'C')
  assert.match(store.error, /disk unavailable/)
})

test('an external replacement during delayed undo cannot resurrect history after it was invalidated', async (t) => {
  const gate = Promise.withResolvers<void>()
  t.mock.method(adapter, 'saveDashboard', async () => gate.promise)
  try {
    const undo = store.undo()
    await db.sync.update(adapter.key, { snapshot: snapshot('external replacement'), generation: 1 })
    window.dispatchEvent(
      new CustomEvent('nav-storage-changed', { detail: { key: adapter.key, external: true } }),
    )
    for (let i = 0; i < 100 && store.history.length; i++) await delay(5)
    assert.equal(store.history.length, 0)
    assert.equal(store.future.length, 0)
    gate.resolve()
    await undo
    assert.equal(store.history.length, 0)
    assert.equal(store.future.length, 0)
    assert.equal(
      store.dashboard!.title,
      'B',
      'keep the active draft for explicit conflict handling',
    )
  } finally {
    gate.resolve()
  }
})

test('legacy key-only broadcasts and revision/camera acknowledgements do not discard unchanged content history', async () => {
  store.dashboard = structuredClone(remote)
  const channel = new BroadcastChannel('nav-storage')
  try {
    await db.sync.update(adapter.key, {
      revision: 1,
      snapshot: {
        ...structuredClone(remote),
        revision: 1,
        viewport: { panX: 960, panY: 540, homeX: 960, homeY: 540, zoom: 1 },
      },
    })
    channel.postMessage(adapter.key)
    await delay(30)
    assert.equal(store.history.length, 2)
    await db.sync.update(adapter.key, {
      snapshot: snapshot('changed by an old tab'),
      generation: 1,
    })
    channel.postMessage(adapter.key)
    for (let i = 0; i < 100 && store.history.length; i++) await delay(5)
    assert.equal(store.history.length, 0)
  } finally {
    channel.close()
  }
})
