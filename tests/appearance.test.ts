import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDashboard,
  initialScene,
  migrateDashboard,
  resolveWidgetAppearance,
  validateDashboard,
  WIDGET_APPEARANCES,
  type WidgetInstance,
} from '../packages/shared/src/index.ts'
const widget = (widgetId = 'clock'): WidgetInstance => {
  const l = { x: 0, y: 0, w: 4, h: 3 }
  return {
    id: 'a',
    widgetId,
    source: 'builtin',
    config: {},
    layouts: { lg: l, md: l, sm: l, xs: l },
  }
}
test('legacy migration does not opt existing components into a new material', () => {
  const old = createDashboard()
  delete old.widgetAppearance
  old.widgets = [widget()]
  const migrated = migrateDashboard(old)
  assert.equal(migrated.widgetAppearance, undefined)
  assert.equal(resolveWidgetAppearance(migrated.widgets[0], migrated.widgetAppearance), 'legacy')
  assert.deepEqual(migrated.widgets, old.widgets)
  assert.equal(createDashboard().widgetAppearance, 'auto')
})
test('auto material preserves readable content, overrides inherit correctly, and plugins stay unchanged', () => {
  for (const id of ['clock', 'search', 'bookmark', 'weather'])
    assert.equal(resolveWidgetAppearance(widget(id), 'auto'), 'glass')
  for (const id of ['chat', 'monitor', 'docker'])
    assert.equal(resolveWidgetAppearance(widget(id), 'auto'), 'solid')
  for (const mode of ['glass', 'solid', 'none', 'legacy'] as const) {
    assert.equal(resolveWidgetAppearance({ ...widget(), appearance: mode }, 'auto'), mode)
  }
  assert.equal(resolveWidgetAppearance({ ...widget(), appearance: 'auto' }, 'solid'), 'glass')
  assert.equal(resolveWidgetAppearance({ ...widget(), source: 'installed' }, 'glass'), 'legacy')
})
test('material values are validated and survive JSON round trips without changing layout or plugin config', () => {
  const d = migrateDashboard(createDashboard())
  d.widgets = [widget()]
  d.canvasScene = initialScene(['a'])
  for (const mode of WIDGET_APPEARANCES) {
    d.widgetAppearance = mode
    d.widgets[0].appearance = mode
    validateDashboard(d)
    assert.deepEqual(migrateDashboard(JSON.parse(JSON.stringify(d))), d)
  }
  for (const invalid of [null, 1, {}, 'transparent', '__proto__']) {
    assert.throws(() => validateDashboard({ ...d, widgetAppearance: invalid }), /组件外观无效/)
    assert.throws(
      () => validateDashboard({ ...d, widgets: [{ ...d.widgets[0], appearance: invalid }] }),
      /单组件外观无效/,
    )
  }
})
