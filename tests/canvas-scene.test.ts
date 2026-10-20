import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCanvasCommand as run,
  canonical,
  commonDelta,
  createDashboard,
  effectiveLocked,
  initialScene,
  marqueeSelection,
  migrateCanvasDocument,
  normalizeSelection,
  refKey,
  sceneRanks,
  searchCanvas,
  canvasSearchIndex,
  canvasSceneDifferences,
  resolveCanvasLabel,
  selectionRect,
  snapSelection,
  validateCanvasTransition,
  validateDashboard,
  type Dashboard,
  type SelectionRef,
  type CanvasCommand,
} from '../packages/shared/src/index.ts'
export function fixture(): Dashboard {
  const d = createDashboard()
  d.layoutMode = 'canvas'
  d.widgets = ['a', 'b', 'c', 'd'].map((id, i) => ({
    id,
    widgetId: 'clock',
    source: 'builtin',
    config: {},
    layouts: {
      lg: { x: i * 2, y: 0, w: 2, h: 3 },
      md: { x: 0, y: 0, w: 2, h: 3 },
      sm: { x: 0, y: 0, w: 2, h: 3 },
      xs: { x: 0, y: 0, w: 2, h: 3 },
    },
    canvas: { x: i * 201 + 3, y: i * 27 + 7, w: 100 + i * 10, h: 100 },
  }))
  d.canvasScene = initialScene(d.widgets.map((w) => w.id))
  return d
}
const w = (id: string): SelectionRef => ({ kind: 'widget', id }),
  g: SelectionRef = { kind: 'group', id: 'g' },
  r: SelectionRef = { kind: 'region', id: 'region' }
const group = (d: Dashboard) =>
  run(d, { type: 'group', id: 'g', title: '工作', widgetIds: ['a', 'c'] })
test('scene migration 2 -> 3 preserves all V1 geometry, identity and default camera, is idempotent and rejects future versions', () => {
  const legacy: any = fixture()
  legacy.documentVersion = 2
  delete legacy.canvasScene
  const original = canonical(legacy),
    d = migrateCanvasDocument(legacy)
  assert.equal(d.documentVersion, 3)
  assert.deepEqual(d.widgets, legacy.widgets)
  assert.deepEqual(d.canvasSettings, legacy.canvasSettings)
  assert.deepEqual(d.canvasScene, initialScene(['a', 'b', 'c', 'd']))
  assert.equal(canonical(legacy), original)
  assert.deepEqual(migrateCanvasDocument(d), d)
  assert.throws(() => migrateCanvasDocument({ ...d, documentVersion: 4 } as any))
})
test('scene validation rejects missing metadata, duplicate and nested members, bad layer coverage, shared IDs, prototype IDs, title code points and region endpoints', () => {
  const mutations: ((d: Dashboard) => void)[] = [
    (d) => delete d.canvasScene!.widgetMeta.a,
    (d) => (d.canvasScene!.widgetMeta.orphan = { title: '', locked: false }),
    (d) => d.canvasScene!.layers.pop(),
    (d) => d.canvasScene!.layers.push(w('a') as any),
    (d) =>
      d.canvasScene!.groups.push({ id: 'g', title: 'bad', locked: false, memberIds: ['a', 'a'] }),
    (d) =>
      d.canvasScene!.groups.push({ id: 'a', title: 'bad', locked: false, memberIds: ['b', 'c'] }),
    (d) => (d.canvasScene!.widgetMeta.a.title = '😀'.repeat(81)),
    (d) =>
      d.canvasScene!.regions.push({
        id: 'constructor',
        title: 'r',
        locked: false,
        color: 'blue',
        x: 0,
        y: 0,
        w: 40,
        h: 40,
      }),
    (d) =>
      d.canvasScene!.regions.push({
        id: 'r',
        title: 'r',
        locked: false,
        color: 'blue',
        x: 1e6,
        y: 0,
        w: 20000,
        h: 100,
      }),
  ]
  for (const mutate of mutations) {
    const d = fixture()
    mutate(d)
    assert.throws(() => validateDashboard(d))
  }
  const d = fixture()
  d.canvasScene!.regions.push({
    id: 'r',
    title: '合法的大区域',
    color: 'slate',
    locked: false,
    x: -1e6,
    y: 0,
    w: 2e6 + 16384,
    h: 100,
  })
  validateDashboard(d)
})
test('nonadjacent group uses frontmost selected anchor and ungroup preserves member ordering and exact geometry', () => {
  const d = fixture(),
    next = group(d)
  assert.deepEqual(next.canvasScene!.layers, [w('b'), g, w('d')])
  assert.deepEqual(next.canvasScene!.groups[0].memberIds, ['a', 'c'])
  assert.deepEqual(next.widgets, d.widgets)
  assert.deepEqual(sceneRanks(next), { b: 1, a: 2, c: 3, d: 4 })
  assert.deepEqual(run(next, { type: 'ungroup', refs: [g] }).canvasScene!.layers, [
    w('b'),
    w('a'),
    w('c'),
    w('d'),
  ])
  assert.deepEqual(normalizeSelection(next, [w('a'), g, w('c')]), [g])
})
test('join and remove members stay atomic and dissolve a one-member group without deleting widgets', () => {
  let d = group(fixture())
  d = run(d, { type: 'join-group', groupId: 'g', widgetIds: ['b'] })
  assert.deepEqual(d.canvasScene!.groups[0].memberIds, ['a', 'c', 'b'])
  d = run(d, { type: 'remove-members', groupId: 'g', widgetIds: ['a', 'b'] })
  assert.equal(d.canvasScene!.groups.length, 0)
  assert.deepEqual(d.canvasScene!.layers, [w('c'), w('a'), w('b'), w('d')])
  assert.equal(d.widgets.length, 4)
  validateDashboard(d)
})
test('group and region delete clean all references and clear does not retain dangling metadata', () => {
  let d = group(fixture())
  d.layoutProfiles = { 'cols-12': Object.fromEntries(d.widgets.map((w) => [w.id, w.layouts.lg])) }
  d = run(d, {
    type: 'create-region',
    region: { id: 'region', title: 'r', color: 'blue', locked: false, x: 0, y: 0, w: 100, h: 100 },
  })
  const original = d.widgets.map((w) => w.canvas)
  const noRegion = run(d, { type: 'delete', refs: [r] })
  assert.deepEqual(
    noRegion.widgets.map((w) => w.canvas),
    original,
  )
  d = run(d, { type: 'delete', refs: [g, r] })
  assert.deepEqual(
    d.widgets.map((w) => w.id),
    ['b', 'd'],
  )
  assert.deepEqual(Object.keys(d.canvasScene!.widgetMeta), ['b', 'd'])
  assert.deepEqual(Object.keys(d.layoutProfiles!['cols-12']), ['b', 'd'])
  validateDashboard(d)
  d = run(d, { type: 'clear' })
  assert.deepEqual(d.canvasScene, initialScene([]))
  assert.equal(d.widgets.length, 0)
})
test('reorder preserves selected relative order and group blocks and rejects mixed content/background planes', () => {
  const d = fixture()
  assert.deepEqual(
    run(d, { type: 'reorder', refs: [w('a'), w('c')], action: 'forward' }).canvasScene!.layers,
    [w('b'), w('a'), w('d'), w('c')],
  )
  assert.deepEqual(
    run(d, { type: 'reorder', refs: [w('b'), w('d')], action: 'backward' }).canvasScene!.layers,
    [w('b'), w('a'), w('d'), w('c')],
  )
  const grouped = group(d)
  assert.deepEqual(sceneRanks(run(grouped, { type: 'reorder', refs: [g], action: 'front' })), {
    b: 1,
    d: 2,
    a: 3,
    c: 4,
  })
  const region = run(d, {
    type: 'create-region',
    region: { id: 'region', title: 'r', color: 'blue', locked: false, x: 0, y: 0, w: 100, h: 100 },
  })
  assert.throws(() => run(region, { type: 'reorder', refs: [w('a'), r], action: 'front' }))
})
test('common delta clamps once, preserves irregular offsets and treats large regions with their own bounds', () => {
  const d = group(fixture())
  d.widgets[0].canvas!.x = 999990
  d.widgets[2].canvas!.x = 999993
  const delta = commonDelta(d, [g], { x: 100, y: 11 })
  assert.deepEqual(delta, { x: 7, y: 11 })
  const next = run(d, { type: 'move', refs: [g], delta: { x: 100, y: 11 } })
  assert.equal(next.widgets[2].canvas!.x - next.widgets[0].canvas!.x, 3)
  assert.equal(next.widgets[2].canvas!.x, 1e6)
  assert.equal(next.widgets[0].canvas!.y, 18)
})
test('locks reject whole batches, same-request unlock and move, membership edits, grid profiles and clear, but permit names, content and explicit order', () => {
  let d = group(fixture())
  d = run(d, { type: 'set-lock', refs: [g], locked: true })
  for (const c of [
    { type: 'move', refs: [g, w('d')], delta: { x: 20, y: 20 } },
    { type: 'delete', refs: [g] },
    { type: 'ungroup', refs: [g] },
    { type: 'join-group', groupId: 'g', widgetIds: ['b'] },
    { type: 'clear' },
  ] as CanvasCommand[])
    assert.throws(() => run(d, c))
  const next = structuredClone(d)
  next.canvasScene!.groups[0].locked = false
  next.widgets[0].canvas!.x++
  assert.throws(() => validateCanvasTransition(d, next))
  const config = structuredClone(d)
  config.widgets[0].config = { text: 'allowed' }
  validateCanvasTransition(d, config)
  assert.equal(
    run(d, { type: 'rename', ref: g, title: '改名' }).canvasScene!.groups[0].title,
    '改名',
  )
  run(d, { type: 'reorder', refs: [g], action: 'front' })
  const grid = structuredClone(d)
  grid.layoutProfiles = { 'cols-8': { a: { x: 0, y: 0, w: 2, h: 3 } } }
  assert.throws(() => validateCanvasTransition(d, grid))
  d = run(d, { type: 'set-lock', refs: [g], locked: false })
  d = run(d, { type: 'set-lock', refs: [w('a')], locked: true })
  assert.equal(effectiveLocked(d, g), true)
  d = run(d, { type: 'set-lock', refs: [w('a')], locked: false })
  assert.equal(effectiveLocked(d, g), false)
})
test('no-op commands retain identity, invalid batches preserve source, and adding atomically creates metadata and a top layer', () => {
  const d = fixture(),
    source = canonical(d)
  assert.equal(run(d, { type: 'move', refs: [w('a')], delta: { x: 0, y: 0 } }), d)
  assert.equal(run(d, { type: 'rename', ref: w('a'), title: '' }), d)
  assert.throws(() => run(d, { type: 'delete', refs: [w('missing')] }))
  assert.equal(canonical(d), source)
  const added = run(d, { type: 'add-widget', widget: { ...d.widgets[0], id: 'new' } })
  assert.deepEqual(added.canvasScene!.layers.at(-1), w('new'))
  assert.deepEqual(added.canvasScene!.widgetMeta.new, { title: '', locked: false })
})
test('marquee intersects with positive area at negative coordinates, groups normalize once and regions do not auto-select', () => {
  let d = group(fixture())
  d = run(d, {
    type: 'create-region',
    region: {
      id: 'region',
      title: 'bg',
      color: 'blue',
      locked: false,
      x: -100,
      y: -100,
      w: 1000,
      h: 1000,
    },
  })
  const box = selectionRect(d, g)
  assert.deepEqual(marqueeSelection(d, { x: box.x - 20, y: box.y, w: 20, h: 20 }), [])
  assert.ok(
    marqueeSelection(d, { x: box.x - 20, y: box.y, w: 21, h: 20 }).some(
      (x) => refKey(x) === refKey(g),
    ),
  )
  assert.ok(
    marqueeSelection(d, { x: -500, y: -500, w: 2000, h: 2000 }).every((x) => x.kind !== 'region'),
  )
})
test('six alignments use selection bounds and preserve group shape, distribution uses true edge gaps and rejects negative spacing', () => {
  const d = group(fixture())
  for (const action of ['left', 'center', 'right', 'top', 'middle', 'bottom'] as const) {
    const next = run(d, { type: 'align', refs: [g, w('b')], action })
    assert.equal(
      next.widgets[2].canvas!.x - next.widgets[0].canvas!.x,
      d.widgets[2].canvas!.x - d.widgets[0].canvas!.x,
    )
    validateDashboard(next)
  }
  const next = run(fixture(), {
      type: 'distribute',
      refs: [w('a'), w('b'), w('c'), w('d')],
      axis: 'x',
    }),
    rects = next.widgets.map((w) => w.canvas!)
  assert.equal(rects[0].x, 3)
  assert.equal(rects[3].x, 606)
  const gaps = rects.slice(1).map((r, i) => r.x - rects[i].x - rects[i].w)
  assert.ok(gaps.every((x) => Math.abs(x - gaps[0]) < 1e-7))
  const overlap = fixture()
  overlap.widgets.forEach((w) => {
    w.canvas!.x = 0
  })
  assert.throws(() =>
    run(overlap, { type: 'distribute', refs: [w('a'), w('b'), w('c')], axis: 'x' }),
  )
})
test('smart snap thresholds use CSS px, stable IDs, hold hysteresis, visible candidates and deterministic edge priority', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 },
    ref = { id: 'target', rect: { x: 200, y: 0, w: 100, h: 100 } },
    viewport = { x: -500, y: -500, w: 2000, h: 2000 }
  for (const zoom of [0.01, 1, 8]) {
    const raw = { x: 100 - 5 / zoom, y: 0 },
      s = snapSelection(box, raw, [ref], zoom, viewport)
    assert.ok(s.guides.some((g) => g.axis === 'x'))
    assert.ok(Math.abs(s.delta.x - raw.x) * zoom <= 6 + 1e-7)
  }
  const initial = snapSelection(box, { x: 95, y: 0 }, [ref], 1, viewport)
  const held = snapSelection(box, { x: 91, y: 0 }, [ref], 1, viewport, initial.guides)
  assert.equal(held.delta.x, 100)
  assert.equal(
    snapSelection(box, { x: 91, y: 0 }, [ref], 1, viewport).guides.some((g) => g.axis === 'x'),
    false,
  )
  assert.deepEqual(
    snapSelection(box, { x: 95, y: 3 }, [ref], 1, { x: 10000, y: 10000, w: 200, h: 200 }).guides,
    [],
  )
})
test('search whitelist excludes chat secrets and arbitrary plugin config, supports normalized title priority and bookmark aggregation', () => {
  let d = fixture()
  d.widgets[0].widgetId = 'chat'
  d.widgets[0].config = { messages: ['secretneedle'], token: 'secrettoken' }
  d.widgets[1].widgetId = 'bookmark'
  d.widgets[1].config = {
    groups: [
      {
        name: '常用',
        bookmarks: [
          { title: 'Docs', url: 'https://example.com/docs' },
          { title: 'Docs two', url: 'https://example.com/two' },
        ],
      },
    ],
  }
  d.canvasScene!.widgetMeta.c.title = 'ＤＯＣＳ'
  d = group(d)
  const idx = canvasSearchIndex(d, { builtin: { chat: 'AI 助手', clock: '时钟' } })
  assert.equal(searchCanvas(idx, 'secretneedle').length, 0)
  assert.equal(searchCanvas(idx, 'secrettoken').length, 0)
  assert.equal(searchCanvas(idx, 'DOCS')[0].ref.id, 'c')
  assert.equal(searchCanvas(idx, 'example.com').length, 1)
  assert.equal(searchCanvas(idx, '工作')[0].ref.kind, 'group')
  assert.equal(searchCanvas(idx, '  AI   助手 ').length, 1)
})

test('resize snaps only its active right/bottom edges, retains origin and falls back to size grid', () => {
  const box = { x: 17, y: 23, w: 100, h: 100 },
    viewport = { x: -500, y: -500, w: 2000, h: 2000 },
    references = [{ id: 'target', rect: { x: 200, y: 200, w: 100, h: 100 } }]
  const result = snapSelection(box, { x: 78, y: 72 }, references, 1, viewport, [], 'resize')
  assert.deepEqual(result.delta, { x: 83, y: 77 })
  assert.equal(box.x, 17)
  assert.equal(box.y, 23)
  assert.deepEqual(
    result.guides.map((g) => g.value),
    [200, 200],
  )
  const free = snapSelection(box, { x: 21, y: 21 }, [], 1, viewport, [], 'resize')
  assert.deepEqual(free.delta, { x: 20, y: 20 })
})

test('recovery reports region stacking order even when IDs and every region field are unchanged', () => {
  let d = fixture()
  for (const id of ['r1', 'r2'])
    d = run(d, {
      type: 'create-region',
      region: { id, title: id, color: 'blue', locked: false, x: 0, y: 0, w: 100, h: 100 },
    })
  const next = run(d, { type: 'reorder', refs: [{ kind: 'region', id: 'r1' }], action: 'front' })
  assert.deepEqual(
    next.canvasScene!.regions.map((r) => r.id),
    ['r2', 'r1'],
  )
  const changes = canvasSceneDifferences(d.canvasScene!, next.canvasScene!)
  assert.equal(changes.length, 1)
  assert.match(changes[0], /regions.order/)
  assert.deepEqual(
    canvasSceneDifferences(d.canvasScene!, JSON.parse(JSON.stringify(d.canvasScene))),
    [],
  )
})

test('labels and type searches distinguish builtin and installed widgets with the same ID', () => {
  const d = fixture()
  d.widgets[1].source = 'installed'
  const names = { builtin: { clock: '时钟' }, installed: { clock: 'Plugin Clock' } }
  assert.equal(resolveCanvasLabel(d, w('a'), names), '时钟')
  assert.equal(resolveCanvasLabel(d, w('b'), names), 'Plugin Clock')
  const index = canvasSearchIndex(d, names)
  assert.deepEqual(
    searchCanvas(index, 'Plugin').map((e) => e.ref.id),
    ['b'],
  )
  assert.deepEqual(
    searchCanvas(index, '时钟').map((e) => e.ref.id),
    ['a', 'c', 'd'],
  )
  d.canvasScene!.widgetMeta.b.title = 'My plugin'
  assert.equal(resolveCanvasLabel(d, w('b'), names), 'My plugin')
  assert.equal(searchCanvas(canvasSearchIndex(d, names), 'Plugin Clock')[0].ref.id, 'b')
})
