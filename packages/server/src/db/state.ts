import { createHash } from 'node:crypto'
import { createDashboard, migrateDashboard, validateDashboard, type Dashboard } from '@nav/shared'
import db, { instanceId } from './database.js'

export class StateError extends Error {
  constructor(
    public status: 409 | 412 | 428,
    message: string,
  ) {
    super(message)
  }
}
export function readSnapshot(id = 'default'): Dashboard {
  let row = db.prepare('SELECT * FROM dashboards WHERE id=?').get(id) as any
  if (!row) {
    const d = { ...createDashboard(), id, instanceId }
    db.prepare(
      'INSERT INTO dashboards(id,name,title,columns,row_height,background,state_json,revision) VALUES(?,?,?,?,?,?,?,0)',
    ).run(
      id,
      d.name,
      d.title,
      d.columns,
      d.rowHeight,
      JSON.stringify(d.background),
      JSON.stringify(d),
    )
    row = db.prepare('SELECT * FROM dashboards WHERE id=?').get(id)
  }
  if (row.state_json) {
    const original = JSON.parse(row.state_json)
    if (
      original.widgets?.some(
        (w: any) => w.source === 'builtin' && w.widgetId === 'chat' && w.config?.apiKey,
      )
    )
      db.prepare('INSERT OR IGNORE INTO migration_backups(backup_key,payload) VALUES(?,?)').run(
        `chat-credentials-v1:${id}`,
        row.state_json,
      )
    // A previously merged client may have written state_json without the legacy fields.
    // Recover what still exists in the compatibility columns before using grid fallbacks.
    if (original.layoutMode === undefined && row.layout_mode === 'canvas') {
      const widgetRows = db
        .prepare('SELECT * FROM widget_instances WHERE dashboard_id=? ORDER BY created_at,id')
        .all(id) as any[]
      db.prepare('INSERT OR IGNORE INTO migration_backups(backup_key,payload) VALUES(?,?)').run(
        `legacy-main-v1:${id}`,
        JSON.stringify({
          snapshot: original,
          databaseRows: { dashboard: row, widgets: widgetRows },
        }),
      )
      original.layoutMode = 'canvas'
      original.viewport ??= row.viewport ? JSON.parse(row.viewport) : undefined
      original.viewportWidth ??= row.viewport_width ?? 1920
      original.viewportHeight ??= row.viewport_height ?? 1080
      for (const widget of original.widgets ?? []) {
        const legacy = widgetRows.find((w) => w.id === widget.id)
        if (!widget.canvas && legacy?.canvas) widget.canvas = JSON.parse(legacy.canvas)
      }
    }
    return { ...migrateDashboard(original), revision: row.revision, instanceId }
  }
  const defaults = createDashboard()
  const widgetRows = db
    .prepare('SELECT * FROM widget_instances WHERE dashboard_id=? ORDER BY created_at,id')
    .all(id) as any[]
  const widgets = widgetRows.map((w) => ({
    id: w.id,
    widgetId: w.widget_id,
    source: w.source,
    config: JSON.parse(w.config ?? '{}'),
    layouts: JSON.parse(w.layouts ?? '{}'),
    ...(w.canvas ? { canvas: JSON.parse(w.canvas) } : {}),
  }))
  const original = {
    ...defaults,
    id,
    name: row.name,
    title: row.title ?? defaults.title,
    columns: row.columns,
    rowHeight: row.row_height,
    layoutMode: row.layout_mode ?? 'grid',
    viewport: row.viewport ? JSON.parse(row.viewport) : undefined,
    viewportWidth: row.viewport_width ?? 1920,
    viewportHeight: row.viewport_height ?? 1080,
    background: { ...defaults.background, ...JSON.parse(row.background ?? '{}') },
    widgets,
    layoutVersion: undefined,
  }
  db.prepare('INSERT OR IGNORE INTO migration_backups(backup_key,payload) VALUES(?,?)').run(
    `layout-v1:${id}`,
    JSON.stringify(original),
  )
  // Separate key preserves an exact copy even when an earlier migration created an incomplete backup.
  db.prepare('INSERT OR IGNORE INTO migration_backups(backup_key,payload) VALUES(?,?)').run(
    `legacy-main-v1:${id}`,
    JSON.stringify({ ...original, databaseRows: { dashboard: row, widgets: widgetRows } }),
  )
  return { ...migrateDashboard(original), revision: row.revision, instanceId }
}
export function commitSnapshot(
  snapshot: Dashboard,
  expected: number,
  operationId: string,
): Dashboard {
  validateDashboard(snapshot)
  if (snapshot.instanceId !== instanceId)
    throw new StateError(412, '服务实例已改变，请先重新获取并确认草稿')
  const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  return db.transaction(() => {
    const old = db
      .prepare('SELECT * FROM committed_operations WHERE operation_id=?')
      .get(operationId) as any
    if (old) {
      if (old.request_hash !== hash || old.dashboard_id !== snapshot.id)
        throw new StateError(409, '操作 ID 已用于不同内容')
      return { ...snapshot, revision: JSON.parse(old.response).revision }
    }
    const current = readSnapshot(snapshot.id)
    if (current.revision !== expected) throw new StateError(412, '其他设备已更新，请处理冲突')
    const updated = { ...snapshot, revision: expected + 1 }
    for (const w of updated.widgets) {
      if (
        w.source === 'installed' &&
        !db.prepare('SELECT 1 FROM installed_widgets WHERE widget_id=?').get(w.widgetId)
      )
        throw new StateError(409, '请先安装组件引用的插件')
    }
    db.prepare(
      'UPDATE dashboards SET name=?,title=?,columns=?,row_height=?,background=?,state_json=?,revision=?,layout_mode=?,viewport=?,viewport_width=?,viewport_height=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
    ).run(
      updated.name,
      updated.title,
      updated.columns,
      updated.rowHeight,
      JSON.stringify(updated.background),
      JSON.stringify(updated),
      updated.revision,
      updated.layoutMode ?? 'grid',
      JSON.stringify(updated.viewport ?? null),
      updated.viewportWidth ?? 1920,
      updated.viewportHeight ?? 1080,
      updated.id,
    )
    db.prepare('DELETE FROM widget_instances WHERE dashboard_id=?').run(updated.id)
    const insert = db.prepare(
      'INSERT INTO widget_instances(id,dashboard_id,widget_id,source,config,layouts,canvas) VALUES(?,?,?,?,?,?,?)',
    )
    for (const w of updated.widgets)
      insert.run(
        w.id,
        updated.id,
        w.widgetId,
        w.source,
        JSON.stringify(w.config),
        JSON.stringify(w.layouts),
        w.canvas ? JSON.stringify(w.canvas) : null,
      )
    db.prepare(
      'INSERT INTO committed_operations(operation_id,dashboard_id,request_hash,response) VALUES(?,?,?,?)',
    ).run(operationId, updated.id, hash, JSON.stringify({ revision: updated.revision }))
    db.prepare(
      "DELETE FROM committed_operations WHERE created_at < datetime('now','-30 days')",
    ).run()
    const count = (
      db.prepare('SELECT count(*) AS n FROM committed_operations').get() as { n: number }
    ).n
    if (count > 50000) {
      db.prepare(
        'DELETE FROM committed_operations WHERE rowid IN (SELECT rowid FROM committed_operations ORDER BY created_at,rowid LIMIT 1000)',
      ).run()
    }
    return updated
  })()
}
