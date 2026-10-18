import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CANVAS,
  worldToScreen,
  screenToWorld,
  clientToViewport,
  zoomAt,
  panByScreen,
  fitBounds,
  contentBounds,
  insertRect,
  wheelDelta,
  legacyCamera,
  migrateCanvasDocument,
  withLegacyMirror,
  createDashboard,
  validateDashboard,
  validCamera,
} from '../packages/shared/src/index.ts'
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)
test('world/screen conversions and anchor zoom remain reversible across all supported scales', () => {
  const size = { width: 1366, height: 768 }
  for (const zoom of [CANVAS.minZoom, 0.3, 1, 8])
    for (const x of [-1000000, -183, 0, 1000000]) {
      const c = { centerX: 40000, centerY: -893, zoom },
        p = { x, y: -1234 }
      const s = worldToScreen(p, c, size),
        r = screenToWorld(s, c, size)
      near(r.x, p.x)
      near(r.y, p.y)
      const anchor = { x: 279, y: 467 },
        before = screenToWorld(anchor, c, size),
        after = screenToWorld(anchor, zoomAt(c, anchor, size, zoom * 1.7), size)
      near(before.x, after.x)
      near(before.y, after.y)
    }
  assert.deepEqual(clientToViewport({ x: 400, y: 200 }, { left: 40, top: 20 }), { x: 360, y: 180 })
  assert.deepEqual(panByScreen({ centerX: 0, centerY: 0, zoom: 2 }, 40, -60), {
    centerX: -20,
    centerY: 30,
    zoom: 2,
  })
})
test('fit uses actual content, handles empty and degenerate viewports and exposes minimum zoom', () => {
  const b = contentBounds([{ x: 900000, y: -200000, w: 400, h: 200 }])!
  assert.equal(b.x, 900000)
  const result = fitBounds(b, { width: 1200, height: 800 }, { x: 280, y: 0, w: 920, h: 700 })!
  const center = worldToScreen({ x: 900200, y: -199900 }, result.camera, {
    width: 1200,
    height: 800,
  })
  near(center.x, 740)
  near(center.y, 350)
  assert.equal(
    fitBounds({ x: -1e6, y: 0, w: 2e6, h: 100 }, { width: 300, height: 200 })!.limited,
    true,
  )
  assert.equal(fitBounds(b, { width: 0, height: 800 }), null)
  assert.deepEqual(fitBounds(null, { width: 100, height: 100 })!.camera, {
    centerX: 0,
    centerY: 0,
    zoom: 1,
  })
  assert.throws(() => contentBounds([{ x: NaN, y: 0, w: 4, h: 4 }]))
})
test('wheel units normalize and dense insertion terminates at a visible center fallback', () => {
  assert.equal(wheelDelta(1, 1, 900), 16)
  assert.equal(wheelDelta(1, 2, 900), 900)
  const visible = { x: 10000, y: -10000, w: 1000, h: 1000 }
  const rect = insertRect({ x: 10500, y: -9500 }, { w: 400, h: 200 }, [visible], visible)
  assert.deepEqual(rect, { x: 10300, y: -9600, w: 400, h: 200 })
})
test('legacy camera preserves the old screen projection and document migration preserves exact geometry', () => {
  const old = { panX: 240, panY: -130, zoom: 0.6, homeX: 20, homeY: 30 },
    size = { width: 1366, height: 768 },
    reference = { width: 1920, height: 1080 }
  const ratio = Math.max(
      0.01,
      Math.min(size.width / reference.width, size.height / reference.height),
    ),
    camera = legacyCamera(old, size, reference)
  for (const p of [
    { x: -400, y: 100 },
    { x: 1000, y: -200 },
  ]) {
    const actual = worldToScreen(p, camera, size)
    near(actual.x, ratio * (old.panX + old.zoom * p.x))
    near(actual.y, ratio * (old.panY + old.zoom * p.y))
  }
  const raw: any = {
    ...createDashboard(),
    viewport: old,
    viewportWidth: 1920,
    viewportHeight: 1080,
  }
  delete raw.documentVersion
  delete raw.canvasSettings
  const d = migrateCanvasDocument(raw)
  assert.equal(d.documentVersion, 2)
  assert.deepEqual(d.canvasSettings!.defaultCamera, { centerX: 940, centerY: 510, zoom: 1 })
  assert.deepEqual(migrateCanvasDocument(d), d)
  assert.deepEqual(d.viewport, raw.viewport)
  assert.notEqual(d, raw)
  assert.throws(() => migrateCanvasDocument({ ...raw, documentVersion: 99 }))
})
test('camera validation rejects nonfinite values and compatibility fields cannot overwrite authoritative defaults', () => {
  for (const value of [NaN, Infinity, '1', null])
    assert.equal(validCamera({ centerX: value, centerY: 0, zoom: 1 }), false)
  const d = createDashboard()
  d.canvasSettings!.defaultCamera = { centerX: -1e6, centerY: 1e6, zoom: 8 }
  d.viewport = { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 }
  const mirrored = withLegacyMirror(d)
  validateDashboard(mirrored)
  assert.deepEqual(mirrored.canvasSettings, d.canvasSettings)
  const invalid: any = { ...d, documentVersion: 3 }
  assert.throws(() => validateDashboard(invalid))
})
