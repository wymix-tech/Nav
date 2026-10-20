import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRectIndex,
  queryRectIndex,
  createSpatialScene,
  createDashboard,
  initialScene,
  intersects,
  type Rect,
} from '../packages/shared/src/index'
import { decideVisibility } from '../packages/frontend/src/canvas/visibilityPolicy'
test('seed 73019: BVH and exact linear results agree including negative, edge touch, enormous and overlapping rectangles', () => {
  let seed = 73019
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (const n of [0, 1, 31, 100, 300, 1000]) {
    const entries = Array.from({ length: n }, (_, i) => ({
      id: String(i),
      x: random() * 20000 - 10000,
      y: random() * 20000 - 10000,
      w: random() * 3000 + 1,
      h: random() * 3000 + 1,
    }))
    if (entries[0]) entries[0] = { id: '0', x: -1000000, y: -1000000, w: 2000000, h: 2000000 }
    const linear = buildRectIndex(entries),
      tree = buildRectIndex(entries, 1, 'tree')
    for (let i = 0; i < 200; i++) {
      const query = {
        x: random() * 20000 - 10000,
        y: random() * 20000 - 10000,
        w: random() * 5000 + 1,
        h: random() * 5000 + 1,
      }
      assert.deepEqual(tree.queryIntersect(query), linear.queryIntersect(query))
      assert.deepEqual(
        tree.queryIntersect(query),
        entries.filter((e) => intersects(e, query)).map((e) => e.id),
      )
    }
  }
  assert.deepEqual(
    buildRectIndex([{ id: 'edge', x: 10, y: 0, w: 10, h: 10 }]).queryIntersect({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    }),
    [],
  )
})
test('geometry epoch follows local geometry and membership, ignores ack/config/name/rank changes; undo rebuilds exact bounds', () => {
  const scene = createSpatialScene(),
    d = createDashboard(),
    l = { x: 0, y: 0, w: 4, h: 3 }
  d.widgets = [0, 1].map((i) => ({
    id: `w${i}`,
    source: 'builtin',
    widgetId: 'clock',
    config: {},
    layouts: { lg: l, md: l, sm: l, xs: l },
    canvas: { x: i * 1000, y: 0, w: 200, h: 100 },
  }))
  d.canvasScene = initialScene(d.widgets.map((w) => w.id))
  const a = scene.update(d),
    before = structuredClone(d)
  d.revision++
  d.widgets[0].config = { title: 'private' }
  d.canvasScene.widgetMeta.w0.title = 'renamed'
  d.canvasScene.layers.reverse()
  assert.equal(scene.update(d), a)
  d.widgets[0].canvas!.x = -500
  const b = scene.update(d)
  assert.equal(b.epoch, a.epoch + 1)
  assert.deepEqual(b.renderIndex.queryIntersect({ x: -500, y: 0, w: 200, h: 100 }), ['w0'])
  const c = scene.update(before)
  assert.equal(c.epoch, b.epoch + 1)
  assert.equal(c.renderIndex.bounds!.x, 0)
})
const rect: Rect = { x: 0, y: 0, w: 280, h: 180 },
  viewport: Rect = { x: -100, y: -100, w: 1000, h: 800 }
const base = {
  rect,
  viewport,
  zoom: 1,
  now: 0,
  protected: false,
  retained: false,
  mode: 'safe' as const,
}
test('view retention uses asymmetric overscan, 1.5s grace, immediate return and conservative opaque policy', () => {
  const full = decideVisibility(base)
  assert.equal(full.mounted, true)
  const far = { ...rect, x: 5000 }
  const exiting = decideVisibility({ ...base, rect: far, now: 10, previous: full })
  assert.equal(exiting.mounted, true)
  assert.equal(exiting.level, 'offscreen')
  assert.equal(decideVisibility({ ...base, rect: far, now: 1509, previous: exiting }).mounted, true)
  const off = decideVisibility({ ...base, rect: far, now: 1510, previous: exiting })
  assert.equal(off.mounted, false)
  assert.equal(decideVisibility({ ...base, now: 1511, previous: off }).mounted, true)
  assert.equal(decideVisibility({ ...base, rect: far, retained: true }).mounted, true)
  assert.equal(decideVisibility({ ...base, rect: far, protected: true }).level, 'full')
})
test('LOD first classification, 10% thresholds and 120ms stability; full/observe preserve demand', () => {
  const full = decideVisibility(base)
  const small = { ...base, zoom: 0.35, now: 10, previous: full }
  const candidate = decideVisibility(small)
  assert.equal(candidate.level, 'full')
  assert.equal(decideVisibility({ ...small, previous: candidate, now: 129 }).level, 'full')
  assert.equal(decideVisibility({ ...small, previous: candidate, now: 130 }).level, 'summary')
  assert.equal(decideVisibility({ ...base, zoom: 0.01 }).level, 'outline')
  assert.equal(decideVisibility({ ...base, zoom: 0.2 }).level, 'summary')
  for (const mode of ['full', 'observe'] as const) {
    const state = decideVisibility({ ...base, rect: { ...rect, x: 5000 }, zoom: 0.01, mode })
    assert.equal(state.mounted, true)
    assert.equal(state.active, true)
    assert.equal(state.level, 'full')
  }
})

test('corrupt or stale derived indices fall back to complete exact rectangles', () => {
  const entries = [
      { id: 'visible', x: 0, y: 0, w: 100, h: 100 },
      { id: 'far', x: 10000, y: 0, w: 100, h: 100 },
    ],
    box = { x: 0, y: 0, w: 200, h: 200 }
  const corrupt = {
    epoch: 2,
    bounds: null,
    queryIntersect() {
      throw Error('unavailable')
    },
  }
  assert.deepEqual(
    queryRectIndex(corrupt, 2, box, () => entries),
    ['visible'],
  )
  const stale = buildRectIndex([{ id: 'ghost', x: 0, y: 0, w: 100, h: 100 }], 1)
  assert.deepEqual(
    queryRectIndex(stale, 2, box, () => entries),
    ['visible'],
  )
})
