import 'fake-indexeddb/auto'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createDashboard, initialScene } from '../packages/shared/src/index'
const require = createRequire(new URL('../packages/frontend/package.json', import.meta.url))
const { createRenderer, ref } = require('vue')
const document = Object.assign(new EventTarget(), { hidden: false })
Object.defineProperty(globalThis, 'document', { value: document, configurable: true })
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true })
const data = new Map<string, string>()
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
}
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true })
const { useRuntimeReconciler } =
  await import('../packages/frontend/src/runtime/useRuntimeReconciler')
const { localDatabase } = await import('../packages/frontend/src/services/localDatabase')
after(() => localDatabase.close())
const renderer = createRenderer({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
})
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
test('temporary null/load failure preserves accepted owners; A→B→A drops late initialization and binds only latest space', async () => {
  const d = createDashboard(),
    l = { x: 0, y: 0, w: 3, h: 3 }
  d.instanceId = 'instance-a'
  d.widgets = [
    {
      id: 'same',
      widgetId: 'chat',
      source: 'builtin',
      config: {},
      layouts: { lg: l, md: l, sm: l, xs: l },
    },
  ]
  d.canvasScene = initialScene(['same'])
  const dashboard = ref(d),
    allowed = ref(true)
  let context!: ReturnType<typeof useRuntimeReconciler>
  const app = renderer.createApp({
    setup() {
      context = useRuntimeReconciler(
        () => dashboard.value,
        () => [],
        () => allowed.value,
        () => ({}),
      )
      return () => null
    },
  })
  app.mount({})
  await tick()
  const original = context.registry.owners.get('same')!
  assert.equal(original.kind, 'chat')
  if (original.kind !== 'chat') throw Error()
  original.chat.input.value = 'preserved'
  dashboard.value = null
  await tick()
  assert.equal(context.registry.owners.get('same'), original)
  dashboard.value = d
  await tick()
  assert.equal(context.registry.owners.get('same'), original)
  const b = { ...d, instanceId: 'instance-b' }
  dashboard.value = b
  dashboard.value = d
  await tick()
  assert.equal(context.registry.spaceKey, 'server:instance-a:default')
  const a = context.registry.owners.get('same')!
  assert.notEqual(a, original)
  if (a.kind === 'chat') assert.equal(a.chat.input.value, 'preserved')
  dashboard.value = b
  await tick()
  const other = context.registry.owners.get('same')!
  if (other.kind === 'chat') {
    assert.equal(other.chat.input.value, '')
    other.chat.apiKey.value = 'temporary'
  }
  allowed.value = false
  assert.equal(other.kind === 'chat' && other.chat.apiKey.value, '')
  app.unmount()
  assert.equal(context.registry.owners.size, 0)
})
