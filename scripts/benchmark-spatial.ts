import { clone } from '../packages/frontend/src/utils/clone'
import { writeFileSync, mkdirSync } from 'node:fs'
import {
  buildRectIndex,
  createDashboard,
  initialScene,
  validateDashboard,
  canonical,
} from '../packages/shared/src/index'
const results = []
for (const count of [100, 300, 1000]) {
  const entries = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    x: (i % 32) * 400 - 6000,
    y: Math.floor(i / 32) * 300 - 3000,
    w: 280,
    h: 180,
  }))
  for (const backend of ['linear', 'tree'] as const) {
    const builds: number[] = [],
      queries: number[] = [],
      candidates: number[] = []
    for (let run = 0; run < 300; run++) {
      let start = performance.now()
      const index = buildRectIndex(entries, run, backend)
      builds.push(performance.now() - start)
      start = performance.now()
      const found = index.queryIntersect({
        x: (run % 32) * 200 - 4000,
        y: (run % 16) * 200 - 2000,
        w: 1920,
        h: 1080,
      })
      queries.push(performance.now() - start)
      candidates.push(found.length)
    }
    const p = (values: number[], q: number) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length * q)]
    results.push({
      count,
      backend,
      buildP95: p(builds, 0.95),
      queryP95: p(queries, 0.95),
      builds,
      queries,
      candidates,
    })
  }
}
const d = createDashboard(),
  l = { x: 0, y: 0, w: 3, h: 3 }
d.widgets = Array.from({ length: 100 }, (_, i) => ({
  id: `w${i}`,
  source: 'builtin',
  widgetId: 'clock',
  config: {},
  layouts: { lg: l, md: l, sm: l, xs: l },
  canvas: { x: (i % 10) * 400, y: Math.floor(i / 10) * 300, w: 280, h: 180 },
}))
d.canvasScene = initialScene(d.widgets.map((w) => w.id))
validateDashboard(d)
const bytes = Buffer.byteLength(JSON.stringify(d))
const documentCosts = []
for (const configCharacters of [0, 16000]) {
  const document = clone(d)
  for (const widget of document.widgets)
    widget.config = configCharacters ? { payload: 'x'.repeat(configCharacters) } : {}
  validateDashboard(document)
  const validationMs: number[] = [],
    cloneMs: number[] = [],
    canonicalMs: number[] = []
  for (let run = 0; run < 100; run++) {
    let start = performance.now()
    validateDashboard(document)
    validationMs.push(performance.now() - start)
    start = performance.now()
    clone(document)
    cloneMs.push(performance.now() - start)
    start = performance.now()
    canonical(document)
    canonicalMs.push(performance.now() - start)
  }
  const snapshotBytes = Buffer.byteLength(JSON.stringify(document))
  documentCosts.push({
    configCharactersPerWidget: configCharacters,
    snapshotBytes,
    estimated50FullHistoryBytes: snapshotBytes * 50,
    validationMs,
    cloneMs,
    canonicalMs,
  })
}
mkdirSync('docs/performance', { recursive: true })
writeFileSync(
  'docs/performance/spatial-research.json',
  JSON.stringify(
    {
      seed: 'fixed-grid-32',
      date: new Date().toISOString(),
      scope: '100/300/1000 Rect[] only; no production Dashboard budget change',
      sampleCount: 300,
      legal100WidgetSnapshotBytes: bytes,
      estimated50FullHistoryBytes: bytes * 50,
      results,
      documentCosts,
    },
    null,
    2,
  ),
)
