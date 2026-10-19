import test from 'node:test'
import assert from 'node:assert/strict'
import { createRuntimeRegistry } from '../packages/frontend/src/runtime/runtimeRegistry'
import { createChatRuntime } from '../packages/frontend/src/runtime/chatRuntime'
import { chatSessionKey, parseChatRecord } from '../packages/frontend/src/runtime/chatSessionStore'
import { createActivityGuard } from '../packages/frontend/src/runtime/activityGuard'
import { createNetworkRate } from '../packages/frontend/src/services/dockerService'
import { createDashboard, initialScene, type WidgetInstance } from '../packages/shared/src/index'
class MemoryStorage implements Storage {
  data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  key(n: number) {
    return [...this.data.keys()][n] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}
const options = (storage = new MemoryStorage()) => ({
  storage,
  headers: () => ({}),
  invalidAuth() {},
})
function widgets(): WidgetInstance[] {
  const d = createDashboard(),
    l = { x: 0, y: 0, w: 4, h: 3 }
  d.widgets = ['chat', 'search', 'clock'].map((widgetId) => ({
    id: widgetId,
    widgetId,
    source: 'builtin',
    config: {},
    layouts: { lg: l, md: l, sm: l, xs: l },
  }))
  d.canvasScene = initialScene(d.widgets.map((w) => w.id))
  return d.widgets
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
test('unique owners retain drafts across repeated attach/detach; space and source replacement isolate state', () => {
  const registry = createRuntimeRegistry(options()),
    ws = widgets()
  registry.reconcile('A', ws, [])
  const first = registry.owners.get('chat')!
  assert.equal(first.kind, 'chat')
  if (first.kind !== 'chat') throw Error()
  first.chat.input.value = 'private draft'
  const detach = registry.attach('chat'),
    detach2 = registry.attach('chat')
  registry.reconcile(
    'A',
    ws.map((w) => ({ ...w, config: { model: 'next' } })),
    [],
  )
  assert.equal(registry.owners.get('chat'), first)
  detach()
  detach()
  detach2()
  assert.equal(registry.diagnostics().views, 0)
  assert.equal(first.chat.input.value, 'private draft')
  registry.reconcile('B', ws, [])
  const second = registry.owners.get('chat')!
  assert.notEqual(second, first)
  if (second.kind === 'chat') assert.equal(second.chat.input.value, '')
  registry.reconcile('A', ws, [])
  const returned = registry.owners.get('chat')!
  if (returned.kind === 'chat') assert.equal(returned.chat.input.value, 'private draft')
  registry.reconcile(
    'A',
    ws.map((w) => ({ ...w, source: 'installed' as const })),
    [],
  )
  assert.equal(registry.owners.get('chat')!.policy, 'opaque-retain')
  registry.dispose()
  registry.dispose()
  assert.equal(registry.owners.size, 0)
})
test('stream survives detached/hidden view, uses accepted config snapshot, checkpoints fragments and never persists Key', async () => {
  const storage = new MemoryStorage(),
    encoder = new TextEncoder()
  let stream!: ReadableStreamDefaultController<Uint8Array>,
    sends = 0,
    body = ''
  const runtime = createChatRuntime('space', 'id', {
    ...options(storage),
    fetch: (async (_, init) => {
      sends++
      body = String(init?.body)
      return new Response(
        new ReadableStream({
          start(c) {
            stream = c
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    }) as typeof fetch,
  })
  runtime.updateConfig({ model: 'accepted', systemPrompt: 'system' })
  runtime.apiKey.value = 'SECRET_KEY'
  runtime.input.value = 'hello'
  const sent = runtime.send(true)
  await tick()
  runtime.setVisible(false)
  runtime.updateConfig({ model: 'new' })
  for (const content of ['part1', 'part2'])
    stream.enqueue(
      encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`),
    )
  await tick()
  runtime.checkpoint()
  const raw = storage.getItem(chatSessionKey('space', 'id'))!
  assert.ok(raw.includes('part1part2'))
  assert.ok(!raw.includes('SECRET_KEY'))
  const recovered = parseChatRecord(raw)
  assert.equal(recovered.status, 'interrupted')
  assert.match(recovered.error, /中断/)
  runtime.input.value = 'another'
  await runtime.send(true)
  assert.equal(sends, 1)
  assert.equal(JSON.parse(body).model, 'accepted')
  stream.close()
  await sent
  runtime.setVisible(true)
  assert.equal(runtime.messages.value[1].content, 'part1part2')
  assert.equal(runtime.loading.value, false)
  runtime.dispose('closed')
})
test('delete/new conversation discards late fragments and finally; undo restores stopped records without resending', async () => {
  const storage = new MemoryStorage(),
    encoder = new TextEncoder()
  let stream!: ReadableStreamDefaultController<Uint8Array>,
    sends = 0
  const config = {
    ...options(storage),
    fetch: (async () => {
      sends++
      return new Response(
        new ReadableStream({
          start(c) {
            stream = c
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    }) as typeof fetch,
  }
  const runtime = createChatRuntime('space', 'chat', config)
  runtime.input.value = 'hello'
  const sent = runtime.send(true)
  await tick()
  stream.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"kept"}}]}\n\n'))
  await tick()
  runtime.dispose('组件已删除，运行任务已结束')
  stream.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"LATE"}}]}\n\n'))
  stream.close()
  await sent
  const restored = createChatRuntime('space', 'chat', config)
  assert.equal(sends, 1)
  assert.equal(restored.loading.value, false)
  assert.equal(restored.messages.value[1].content, 'kept')
  restored.newConversation()
  assert.deepEqual(restored.messages.value, [])
  restored.dispose('closed')
})
test('legacy import requires explicit unique binding; future/corrupt private records stay untouched', () => {
  const storage = new MemoryStorage(),
    original = JSON.stringify([{ role: 'user', content: 'legacy', timestamp: 1 }])
  storage.setItem('nav_chat_same', original)
  const a = createChatRuntime('A', 'same', options(storage)),
    b = createChatRuntime('B', 'same', options(storage))
  assert.equal(a.messages.value.length, 0)
  assert.equal(a.legacy.value?.length, 1)
  a.bindLegacy()
  b.bindLegacy()
  assert.equal(a.messages.value.length, 1)
  assert.equal(b.messages.value.length, 0)
  assert.equal(storage.getItem('nav_chat_same'), original)
  const key = chatSessionKey('C', 'same'),
    future = '{"version":99,"messages":[]}'
  storage.setItem(key, future)
  const c = createChatRuntime('C', 'same', options(storage))
  c.input.value = 'memory'
  c.checkpoint()
  assert.equal(storage.getItem(key), future)
  assert.match(c.storageError.value, /版本/)
  a.dispose('closed')
  b.dispose('closed')
  c.dispose('closed')
})
test('storage quota errors preserve memory, auth revoke clears ephemeral key, activity tokens release idempotently', () => {
  const storage = new MemoryStorage()
  storage.setItem = () => {
    throw new Error('QuotaExceeded')
  }
  const runtime = createChatRuntime('A', 'id', options(storage))
  runtime.input.value = 'keep'
  runtime.apiKey.value = 'secret'
  runtime.checkpoint()
  assert.match(runtime.storageError.value, /未保存/)
  assert.equal(runtime.input.value, 'keep')
  runtime.revoke()
  assert.equal(runtime.apiKey.value, '')
  const guard = createActivityGuard(),
    a = guard.pin('id', 'focus'),
    b = guard.pin('id', 'composition')
  a()
  a()
  assert.equal(guard.has('id'), true)
  b()
  assert.equal(guard.has('id'), false)
  runtime.dispose('closed')
})
test('Docker rates require one monotonic same-container baseline; pause, restart and rollback reset it', () => {
  const rates = createNetworkRate()
  assert.equal(rates.sample('a', 100, 100, 1000), null)
  assert.deepEqual(rates.sample('a', 200, 300, 2000), { rx: 100, tx: 200 })
  assert.equal(rates.sample('a', 200, 300, 2000), null)
  rates.reset()
  assert.equal(rates.sample('a', 1000, 2000, 5000), null)
  assert.equal(rates.sample('b', 5000, 5000, 6000), null)
  assert.equal(rates.sample('b', 1, 2, 7000), null)
})
test('catalog refresh retains a plugin owner; changing network permissions replaces its security identity', () => {
  const registry = createRuntimeRegistry(options()),
    w = { ...widgets()[0], source: 'installed' as const, widgetId: 'plugin' }
  const installed = {
    widgetId: 'plugin',
    commit: 'a'.repeat(40),
    cdnUrl: 'https://cdn.jsdelivr.net/gh/test/plugin@' + 'a'.repeat(40) + '/index.js',
    installedAt: '2026-10-19',
    manifest: {
      manifestVersion: 2 as const,
      name: 'plugin',
      displayName: 'Plugin',
      version: '1',
      entry: 'index.js',
      description: 'fixture',
      author: 'test',
      icon: '',
      repository: 'https://github.com/test/plugin',
      schema: {},
      size: { w: 3, h: 3 },
      minSize: { w: 2, h: 2 },
      networkOrigins: ['https://example.com'],
      permissions: [],
    },
  }
  registry.reconcile('A', [w], [installed])
  const first = registry.owners.get(w.id)
  registry.reconcile(
    'A',
    [w],
    [{ ...installed, manifest: { ...installed.manifest, displayName: 'Renamed' } }],
  )
  assert.equal(registry.owners.get(w.id), first)
  registry.reconcile(
    'A',
    [w],
    [{ ...installed, manifest: { ...installed.manifest, networkOrigins: [] } }],
  )
  assert.notEqual(registry.owners.get(w.id), first)
  registry.dispose()
})
test('oversized input never writes a record that its own format cannot recover', () => {
  const storage = new MemoryStorage(),
    runtime = createChatRuntime('A', 'oversized', options(storage))
  runtime.input.value = 'x'.repeat(16385)
  runtime.checkpoint()
  assert.equal(storage.getItem(chatSessionKey('A', 'oversized')), null)
  assert.match(runtime.storageError.value, /超过/)
  assert.equal(runtime.input.value.length, 16385)
  runtime.dispose('closed')
})
test('legacy binding storage failure cannot partially import the same private record into two spaces', () => {
  const storage = new MemoryStorage(),
    write = storage.setItem.bind(storage),
    id = 'binding-failure'
  write(`nav_chat_${id}`, JSON.stringify([{ role: 'user', content: 'old private', timestamp: 1 }]))
  storage.setItem = (key, value) => {
    if (key.startsWith('nav_chat_bound:')) throw Error('quota')
    write(key, value)
  }
  const a = createChatRuntime('A', id, options(storage)),
    b = createChatRuntime('B', id, options(storage))
  a.bindLegacy()
  b.bindLegacy()
  assert.equal(storage.getItem(chatSessionKey('A', id)), null)
  assert.equal(storage.getItem(chatSessionKey('B', id)), null)
  assert.match(a.storageError.value, /未完成/)
  a.dispose('closed')
  b.dispose('closed')
})
test('switching spaces preserves more than 20 dirty input drafts without treating them as deletion tombstones', () => {
  const registry = createRuntimeRegistry(options()),
    template = widgets()[1]
  const ws = Array.from({ length: 25 }, (_, i) => ({ ...template, id: `search-${i}` }))
  registry.reconcile('A', ws, [])
  for (const w of ws) {
    const owner = registry.owners.get(w.id)!
    if (owner.kind === 'search') owner.state.query = `private ${w.id}`
  }
  registry.reconcile('B', [], [])
  assert.equal(registry.diagnostics().tombstones, 0)
  assert.equal(registry.diagnostics().inactiveDrafts, 25)
  registry.reconcile('A', ws, [])
  for (const w of ws) {
    const owner = registry.owners.get(w.id)!
    if (owner.kind === 'search') assert.equal(owner.state.query, `private ${w.id}`)
  }
  assert.equal(registry.diagnostics().inactiveDrafts, 0)
  registry.dispose()
})
