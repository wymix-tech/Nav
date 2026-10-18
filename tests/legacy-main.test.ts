import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateDashboard, validateDashboard } from '../packages/shared/src/index.ts'
const dir = await mkdtemp(join(tmpdir(), 'nav-legacy-main-'))
process.env.NAV_DB_PATH = join(dir, 'legacy.db')
process.env.NAV_JWT_SECRET = 'legacy-test-secret'
process.env.NAV_PASSWORD = 'legacy-test-password'
process.env.NAV_UPLOAD_DIR = join(dir, 'uploads')
const require = createRequire(new URL('../packages/server/package.json', import.meta.url))
const Database = require('better-sqlite3'),
  old = new Database(process.env.NAV_DB_PATH)
old.exec(`CREATE TABLE dashboards(id TEXT PRIMARY KEY,name TEXT NOT NULL,title TEXT,background TEXT,columns INTEGER,row_height INTEGER,layout_mode TEXT,viewport TEXT,viewport_width INTEGER,viewport_height INTEGER,updated_at TEXT);
CREATE TABLE widget_instances(id TEXT PRIMARY KEY,dashboard_id TEXT NOT NULL REFERENCES dashboards(id),widget_id TEXT NOT NULL,source TEXT NOT NULL,config TEXT,layouts TEXT,canvas TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT);`)
const viewport = { panX: 120, panY: 80, zoom: 0.8, homeX: 20, homeY: 40 }
old
  .prepare('INSERT INTO dashboards VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .run(
    'default',
    'Legacy',
    'Old main',
    JSON.stringify({ mode: 'color', color: '#0c1021', images: [], interval: 30, index: 0 }),
    12,
    80,
    'canvas',
    JSON.stringify(viewport),
    1920,
    1080,
    'legacy-time',
  )
const geometry = { x: 640, y: 320, w: 600, h: 400, originalW: 320, originalH: 240 }
for (const [i, widgetId] of ['clock', 'chat', 'docker'].entries()) {
  const l = { x: i * 4, y: 0, w: 4, h: 3 }
  old
    .prepare(
      'INSERT INTO widget_instances(id,dashboard_id,widget_id,source,config,layouts,canvas) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      'legacy_' + widgetId,
      'default',
      widgetId,
      'builtin',
      JSON.stringify(
        widgetId === 'chat' ? { apiKey: 'synthetic-legacy-credential', model: 'test-model' } : {},
      ),
      JSON.stringify({ lg: l, md: l, sm: l, xs: l }),
      JSON.stringify(geometry),
    )
}
old.close()
const { default: db } = await import('../packages/server/src/db/database.ts')
const { readSnapshot, commitSnapshot, migrateCanvasDatabase } =
  await import('../packages/server/src/db/state.ts')
const { createApp } = await import('../packages/server/src/app.ts')
const { generateToken } = await import('../packages/server/src/middleware/auth.ts')
after(async () => {
  db.close()
  await rm(dir, { recursive: true, force: true })
})
test('old main canvas coordinates and viewport are backed up exactly and survive atomic saves', async () => {
  const rows = db.prepare('SELECT * FROM widget_instances ORDER BY id').all()
  const d = readSnapshot()
  assert.equal(d.layoutMode, 'canvas')
  assert.deepEqual(d.viewport, viewport)
  assert.equal(d.viewportWidth, 1920)
  assert.equal(d.viewportHeight, 1080)
  for (const w of d.widgets) assert.deepEqual(w.canvas, geometry)
  assert.equal(d.widgets.find((w) => w.widgetId === 'chat')!.config.apiKey, undefined)
  const backup = JSON.parse(
    (
      db
        .prepare('SELECT payload FROM migration_backups WHERE backup_key=?')
        .get('legacy-main-v1:default') as any
    ).payload,
  )
  assert.deepEqual(
    backup.databaseRows.widgets.sort((a: any, b: any) => a.id.localeCompare(b.id)),
    rows,
  )
  assert.deepEqual(backup.viewport, viewport)
  assert.equal(
    backup.widgets.find((w: any) => w.widgetId === 'chat').config.apiKey,
    'synthetic-legacy-credential',
  )
  migrateCanvasDatabase(true)
  const migrated = readSnapshot()
  const changed = migrateDashboard({ ...migrated, title: 'Only changed title', layoutMode: 'grid' })
  validateDashboard(changed)
  const saved = commitSnapshot(changed, 1, 'legacy-main-save-012345')
  assert.equal(saved.revision, 2)
  for (const row of db.prepare('SELECT canvas FROM widget_instances').all() as any[])
    assert.deepEqual(JSON.parse(row.canvas), geometry)
  const again = readSnapshot()
  assert.deepEqual(
    again.widgets.map((w) => w.canvas),
    d.widgets.map((w) => w.canvas),
  )
  assert.deepEqual(again.canvasSettings, migrated.canvasSettings)
  const app = createApp()
  assert.equal((await app.request('/api/dashboards/default/backup')).status, 401)
  const result = await app.request('/api/dashboards/default/backup', {
    headers: { Authorization: 'Bearer ' + generateToken() },
  })
  assert.equal(result.status, 200)
  assert.ok(
    (await result.json()).backups.some((b: any) => b.backup_key === 'legacy-main-v1:default'),
  )
})
test('invalid canvas/viewport writes fail without replacing stored geometry', () => {
  const d = readSnapshot()
  const invalid = structuredClone(d)
  invalid.widgets[0].canvas!.w = -1
  assert.throws(() => commitSnapshot(invalid, 1, 'invalid-geometry-012345'))
  const badView = structuredClone(d)
  badView.viewport!.zoom = 0
  assert.throws(() => commitSnapshot(badView, 1, 'invalid-viewport-012345'))
  assert.deepEqual(readSnapshot(), d)
})
test('a partial upgrade recovers canvas fields still present in compatibility columns', () => {
  const source = readSnapshot()
  const snapshot: any = {
    ...source,
    id: 'partial',
    widgets: [{ ...source.widgets[0], id: 'partial-clock' }],
  }
  delete snapshot.layoutMode
  delete snapshot.viewport
  delete snapshot.viewportWidth
  delete snapshot.viewportHeight
  delete snapshot.widgets[0].canvas
  db.prepare(
    'INSERT INTO dashboards(id,name,title,columns,row_height,background,layout_mode,viewport,viewport_width,viewport_height,state_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    'partial',
    'partial',
    'partial',
    12,
    80,
    JSON.stringify(source.background),
    'canvas',
    JSON.stringify(viewport),
    1920,
    1080,
    JSON.stringify(snapshot),
  )
  const w = snapshot.widgets[0]
  db.prepare(
    'INSERT INTO widget_instances(id,dashboard_id,widget_id,source,config,layouts,canvas) VALUES(?,?,?,?,?,?,?)',
  ).run(
    w.id,
    'partial',
    w.widgetId,
    'builtin',
    JSON.stringify(w.config),
    JSON.stringify(w.layouts),
    JSON.stringify(geometry),
  )
  const restored = readSnapshot('partial')
  assert.equal(restored.layoutMode, 'canvas')
  assert.deepEqual(restored.viewport, viewport)
  assert.deepEqual(restored.widgets[0].canvas, geometry)
  const backup = JSON.parse(
    (
      db
        .prepare('SELECT payload FROM migration_backups WHERE backup_key=?')
        .get('legacy-main-v1:partial') as any
    ).payload,
  )
  assert.deepEqual(backup.snapshot, snapshot)
})
