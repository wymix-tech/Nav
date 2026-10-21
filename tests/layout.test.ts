import test from 'node:test'
import assert from 'node:assert/strict'
import {
  columnsForWidth,
  createDashboard,
  deriveLayout,
  findPlacement,
  migrateDashboard,
  overlaps,
  resolveCollisions,
  validateDashboard,
  type LayoutMap,
} from '../packages/shared/src/index.ts'
test('bounds clamp the whole widget and resolve the changed item collision', () => {
  const map = resolveCollisions(
    { a: { x: 11, y: 0, w: 4, h: 3 }, b: { x: 8, y: 0, w: 4, h: 3 } },
    12,
    'b',
  )
  assert.equal(map.a.x, 8)
  assert.equal(map.b.y, 0)
  assert.ok(!overlaps(map.a, map.b))
})
test('responsive derivation preserves custom base sizes without cumulative drift', () => {
  const d = createDashboard()
  d.widgets = [
    {
      id: 'a',
      widgetId: 'clock',
      source: 'builtin',
      config: {},
      layouts: {
        lg: { x: 8, y: 0, w: 4, h: 6 },
        md: { x: 0, y: 0, w: 1, h: 3 },
        sm: { x: 0, y: 0, w: 1, h: 3 },
        xs: { x: 0, y: 0, w: 1, h: 3 },
      },
    },
  ]
  const original = JSON.stringify(d)
  deriveLayout(d.widgets, 8, 12)
  deriveLayout(d.widgets, 24, 12)
  assert.deepEqual(deriveLayout(d.widgets, 12, 12).a, d.widgets[0].layouts.lg)
  assert.equal(JSON.stringify(d), original)
})
test('orientation does not decide the column count; custom columns remain a cap', () => {
  assert.equal(columnsForWidth(1080), 8)
  assert.equal(columnsForWidth(1300), 12)
  assert.equal(columnsForWidth(2600), 24)
  assert.equal(columnsForWidth(600), 1)
  assert.ok(columnsForWidth(800, 24) < 24)
})
test('legacy layout migration is idempotent and retains custom heights', () => {
  const d = createDashboard()
  delete d.layoutVersion
  delete d.layoutSettings
  const migrated = migrateDashboard(d)
  assert.deepEqual(migrateDashboard(migrated), migrated)
  assert.equal(migrated.baseColumns, 12)
})
test('new dashboards and documents without a saved mode default to infinite canvas', () => {
  const dashboard = createDashboard()
  assert.equal(dashboard.layoutMode, 'canvas')
  delete dashboard.layoutMode
  assert.equal(migrateDashboard(dashboard).layoutMode, 'canvas')
  assert.equal(migrateDashboard({ ...dashboard, layoutMode: 'grid' }).layoutMode, 'grid')
})
test('first-fit appends beyond the former fifty-row search and never returns an occupied cell', () => {
  const map: LayoutMap = { a: { x: 0, y: 0, w: 12, h: 100 } }
  assert.equal(findPlacement(map, 4, 3, 12).y, 100)
})
test('generated layouts satisfy bounds, no overlaps and determinism', () => {
  let seed = 19261
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  for (const cols of [1, 4, 8, 12, 16, 24])
    for (let n = 0; n < 100; n++) {
      const map: LayoutMap = {}
      for (let i = 0; i < 16; i++)
        map[String(i)] = {
          x: Math.floor(rand() * 30),
          y: Math.floor(rand() * 16),
          w: 1 + Math.floor(rand() * 12),
          h: 1 + Math.floor(rand() * 5),
        }
      const output = resolveCollisions(map, cols, '3'),
        values = Object.values(output)
      assert.deepEqual(resolveCollisions(map, cols, '3'), output)
      for (let i = 0; i < values.length; i++) {
        const a = values[i]
        assert.ok(a.x >= 0 && a.x + a.w <= cols)
        for (let j = i + 1; j < values.length; j++) assert.ok(!overlaps(a, values[j]))
      }
    }
})
test('runtime validation rejects invalid bounds, active URLs and stale profile references', () => {
  const d = createDashboard()
  validateDashboard(d)
  d.columns = 0
  assert.throws(() => validateDashboard(d))
  d.columns = 12
  d.layoutProfiles = { 'cols-8': { missing: { x: 0, y: 0, w: 4, h: 3 } } }
  assert.throws(() => validateDashboard(d))
})
