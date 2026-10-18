import 'fake-indexeddb/auto'
import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { createDashboard, initialScene } from '../packages/shared/src/index.ts'

const frontendRequire = createRequire(new URL('../packages/frontend/package.json', import.meta.url))
const { createRenderer, ref, nextTick } = frontendRequire('vue')
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true })
Object.defineProperty(globalThis, 'document', {
  value: Object.assign(new EventTarget(), { hidden: false }),
  configurable: true,
})
const { localDatabase: db } = await import('../packages/frontend/src/services/localDatabase.ts')
const { useCanvasCamera } = await import('../packages/frontend/src/canvas/useCanvasCamera.ts')
const { useCanvasInteraction } =
  await import('../packages/frontend/src/canvas/useCanvasInteraction.ts')

// Use Vue's lifecycle and scheduler without a browser DOM. Pointer capture and RAF
// are controlled explicitly so these tests can hold an interaction across updates.
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
function mount<T>(setup: () => T) {
  let value!: T
  const app = renderer.createApp({
    setup() {
      value = setup()
      return () => null
    },
  })
  app.mount({})
  return { value, unmount: () => app.unmount() }
}
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return
    await delay(5)
  }
  assert.fail('Canvas state did not settle')
}
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback)
  return frameId
}
globalThis.cancelAnimationFrame = (id) => {
  frames.delete(id)
}
function flushFrames() {
  for (const [id, callback] of frames) {
    frames.delete(id)
    callback(0)
  }
}
beforeEach(async () => {
  frames.clear()
  await db.viewPreferences.clear()
  await db.backups.clear()
})
after(() => db.close())

test('a stale camera switch cannot hide a ready session after A -> B -> A during a slow write', async (t) => {
  const dashboard = ref({ ...createDashboard(), instanceId: 'camera-race-A' })
  const mounted = mount(() =>
    useCanvasCamera(
      () => dashboard.value,
      ref({ width: 1000, height: 600 }),
      () => null,
    ),
  )
  const view = mounted.value
  t.after(async () => {
    mounted.unmount()
    await view.flush()
  })
  await waitFor(() => view.ready.value)
  view.camera.value = { centerX: 123, centerY: -45, zoom: 2 }
  await view.flush()
  const started = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>(),
    finished = Promise.withResolvers<void>(),
    put = db.viewPreferences.put.bind(db.viewPreferences)
  let paused = false
  t.mock.method(db.viewPreferences, 'put', async (row: Parameters<typeof put>[0]) => {
    if (paused) return put(row)
    paused = true
    started.resolve()
    await release.promise
    try {
      return await put(row)
    } finally {
      finished.resolve()
    }
  })
  try {
    dashboard.value = { ...dashboard.value, instanceId: 'camera-race-B' }
    await started.promise
    dashboard.value = { ...dashboard.value, instanceId: 'camera-race-A' }
    await nextTick()
    release.resolve()
    await finished.promise
    // Drain the ordered writer as well as the database operation: its awaiting
    // watcher must resume before we inspect the final session state.
    await view.flush()
    await nextTick()
    assert.equal(view.ready.value, true)
    assert.deepEqual(view.camera.value, { centerX: 123, centerY: -45, zoom: 2 })
  } finally {
    release.resolve()
  }
})

function pointer(
  clientX: number,
  clientY: number,
  extra: Partial<PointerEvent> = {},
): PointerEvent {
  return {
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    clientX,
    clientY,
    target: { closest: () => null },
    preventDefault() {},
    stopPropagation() {},
    ...extra,
  } as unknown as PointerEvent
}
function interactionHarness() {
  const camera = ref({ centerX: 400, centerY: 300, zoom: 1 }),
    widgets = ref([
      {
        id: 'active-clock',
        widgetId: 'clock',
        source: 'builtin' as const,
        config: {},
        layouts: { lg: { x: 0, y: 0, w: 4, h: 3 } },
        canvas: { x: 0, y: 0, w: 300, h: 200 },
      },
    ]),
    captures = new Set<number>(),
    commits: unknown[] = []
  const root = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    focus() {},
    hasPointerCapture: (id: number) => captures.has(id),
    setPointerCapture: (id: number) => captures.add(id),
    releasePointerCapture: (id: number) => captures.delete(id),
  }
  const tool = ref('interact'),
    selected = ref([]),
    additive = ref(false),
    snapping = ref(true),
    allowed = ref(true),
    scene = ref(initialScene(['active-clock']))
  const mounted = mount(() =>
    useCanvasInteraction({
      root: ref(root),
      camera,
      size: ref({ width: 1000, height: 600 }),
      hand: ref(false),
      enabled: () => true,
      canEdit: () => allowed.value,
      dashboard: () => ({ ...createDashboard(), widgets: widgets.value, canvasScene: scene.value }),
      tool,
      selected,
      additive,
      snapping,
      notice: () => {},
      commit: (command) => commits.push(command),
    }),
  )
  return {
    ...mounted,
    camera,
    widgets,
    captures,
    commits,
    tool,
    selected,
    additive,
    snapping,
    allowed,
    scene,
  }
}
test('remote widget additions and removals preserve active pan and wheel navigation', async (t) => {
  const h = interactionHarness()
  t.after(h.unmount)
  const { value: interaction, camera, widgets } = h
  interaction.start(pointer(30, 30))
  interaction.move(pointer(110, 80))
  flushFrames()
  const panned = { ...camera.value }
  widgets.value.push({ ...widgets.value[0], id: 'remote-clock' })
  await nextTick()
  widgets.value = []
  await nextTick()
  assert.deepEqual(camera.value, panned)
  assert.equal(h.captures.size, 1)
  interaction.finish(pointer(150, 100))
  assert.deepEqual(camera.value, { centerX: 280, centerY: 230, zoom: 1 })
  interaction.wheel({
    target: { closest: () => null },
    deltaX: 10,
    deltaY: 20,
    deltaMode: 0,
    preventDefault() {},
  } as unknown as WheelEvent)
  const wheeled = { ...camera.value }
  widgets.value.push({ id: 'another-remote-clock' })
  await nextTick()
  assert.deepEqual(camera.value, wheeled)
  assert.equal(h.commits.length, 0)
})
test('unrelated widget changes preserve a geometry draft and pointerup commits once', async (t) => {
  const h = interactionHarness()
  t.after(h.unmount)
  h.value.start(pointer(30, 30), 'move', { kind: 'widget', id: h.widgets.value[0].id })
  h.value.move(pointer(70, 50))
  flushFrames()
  h.widgets.value.push({ ...h.widgets.value[0], id: 'remote-clock' })
  await nextTick()
  assert.equal(h.value.draft.value?.widgets['active-clock'].x, 40)
  h.widgets.value.pop()
  await nextTick()
  h.value.finish(pointer(90, 70))
  assert.deepEqual(h.commits, [
    { type: 'move', refs: [{ kind: 'widget', id: 'active-clock' }], delta: { x: 60, y: 40 } },
  ])
})
test('deleting the active widget cancels move and resize without a commit or pointer capture', async (t) => {
  for (const mode of ['move', 'resize'] as const) {
    const h = interactionHarness()
    t.after(h.unmount)
    h.value.start(pointer(30, 30), mode, { kind: 'widget', id: h.widgets.value[0].id })
    h.value.move(pointer(70, 50))
    flushFrames()
    assert.ok(h.value.draft.value)
    h.widgets.value = []
    await nextTick()
    assert.equal(h.value.draft.value, null)
    assert.equal(h.captures.size, 0)
    h.value.finish(pointer(90, 70))
    assert.equal(h.commits.length, 0)
  }
})

test('V2 marquee intersects consistently and Shift uses the start selection; cancel restores it without writes', async (t) => {
  const h = interactionHarness()
  t.after(h.unmount)
  h.tool.value = 'select'
  h.value.start(pointer(50, 10))
  h.value.move(pointer(150, 100))
  flushFrames()
  assert.deepEqual(h.selected.value, [{ kind: 'widget', id: 'active-clock' }])
  h.value.cancel()
  assert.deepEqual(h.selected.value, [])
  assert.equal(h.commits.length, 0)
  h.selected.value = [{ kind: 'widget', id: 'active-clock' }]
  h.value.start(pointer(500, 400, { shiftKey: true }))
  h.value.move(pointer(600, 500, { shiftKey: true }))
  flushFrames()
  assert.equal(h.selected.value.length, 1)
  h.value.finish(pointer(500, 400, { shiftKey: true }))
  assert.equal(h.selected.value.length, 1)
  assert.equal(h.commits.length, 0)
})
test('V2 selection drag commits final pointer once for a whole group and cancels when any member changes', async (t) => {
  const h = interactionHarness()
  t.after(h.unmount)
  h.widgets.value.push({
    ...h.widgets.value[0],
    id: 'member',
    canvas: { x: 333, y: 17, w: 100, h: 200 },
  })
  h.scene.value = initialScene(['active-clock', 'member'])
  h.scene.value.groups = [
    { id: 'g', title: 'Group', locked: false, memberIds: ['active-clock', 'member'] },
  ]
  h.scene.value.layers = [{ kind: 'group', id: 'g' }]
  h.tool.value = 'select'
  h.selected.value = [{ kind: 'group', id: 'g' }]
  h.snapping.value = false
  h.value.start(pointer(100, 100), 'move', { kind: 'widget', id: 'active-clock' })
  h.value.move(pointer(145, 120))
  h.value.finish(pointer(161, 143))
  assert.deepEqual(h.commits, [
    { type: 'move', refs: [{ kind: 'group', id: 'g' }], delta: { x: 61, y: 43 } },
  ])
  h.value.start(pointer(100, 100), 'move', { kind: 'widget', id: 'active-clock' })
  h.value.move(pointer(150, 130))
  flushFrames()
  assert.equal(h.value.draft.value!.widgets.member.x, 383)
  h.widgets.value[1].canvas.x++
  await nextTick()
  assert.equal(h.value.draft.value, null)
  assert.equal(h.captures.size, 0)
  h.value.finish(pointer(180, 150))
  assert.equal(h.commits.length, 1)
})
test('V2 Shift removal does not drag, lock and permission invalidation cancel geometry, and second touch cancels region creation before pinch', async (t) => {
  const h = interactionHarness()
  t.after(h.unmount)
  h.tool.value = 'select'
  h.selected.value = [{ kind: 'widget', id: 'active-clock' }]
  h.value.start(pointer(100, 100, { shiftKey: true }), 'move', {
    kind: 'widget',
    id: 'active-clock',
  })
  h.value.move(pointer(180, 150))
  h.value.finish(pointer(180, 150))
  assert.equal(h.selected.value.length, 0)
  assert.equal(h.commits.length, 0)
  h.value.start(pointer(100, 100), 'move', { kind: 'widget', id: 'active-clock' })
  h.value.move(pointer(180, 150))
  flushFrames()
  h.scene.value.widgetMeta['active-clock'].locked = true
  await nextTick()
  assert.equal(h.value.draft.value, null)
  assert.equal(h.captures.size, 0)
  h.scene.value.widgetMeta['active-clock'].locked = false
  h.value.start(pointer(100, 100), 'move', { kind: 'widget', id: 'active-clock' })
  h.allowed.value = false
  h.value.finish(pointer(180, 150))
  assert.equal(h.commits.length, 0)
  h.allowed.value = true
  h.tool.value = 'region'
  h.value.start(pointer(500, 300, { pointerType: 'touch' }))
  h.value.move(pointer(600, 400, { pointerType: 'touch' }))
  flushFrames()
  assert.ok(h.value.regionDraft.value)
  h.value.start(pointer(700, 400, { pointerType: 'touch', pointerId: 2 }))
  assert.equal(h.value.regionDraft.value, null)
  h.value.finish(pointer(750, 430, { pointerType: 'touch', pointerId: 2 }))
  assert.equal(h.commits.length, 0)
  assert.equal(h.captures.size, 0)
})
