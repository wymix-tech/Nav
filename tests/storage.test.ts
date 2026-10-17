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
    new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } })
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
