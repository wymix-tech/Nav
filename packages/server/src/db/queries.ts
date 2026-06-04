import db from './database.js'

// Dashboard
export function getDashboard(id: string) {
  return db.prepare('SELECT * FROM dashboards WHERE id = ?').get(id) as any
}

export function upsertDashboard(d: { id: string; name: string; title?: string; columns: number; rowHeight: number; background?: string; layoutMode?: string; viewport?: string; viewportWidth?: number; viewportHeight?: number }) {
  db.prepare(`
    INSERT INTO dashboards (id, name, title, columns, row_height, background, layout_mode, viewport, viewport_width, viewport_height, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      title = excluded.title,
      columns = excluded.columns,
      row_height = excluded.row_height,
      background = excluded.background,
      layout_mode = excluded.layout_mode,
      viewport = excluded.viewport,
      viewport_width = excluded.viewport_width,
      viewport_height = excluded.viewport_height,
      updated_at = CURRENT_TIMESTAMP
  `).run(d.id, d.name, d.title ?? 'INFI.NAV - 个人导航页', d.columns, d.rowHeight, d.background ?? '{}', d.layoutMode ?? 'canvas', d.viewport ?? '{"panX":0,"panY":0,"zoom":1,"homeX":0,"homeY":0}', d.viewportWidth ?? 1920, d.viewportHeight ?? 1080)
}

// Widget Instances
export function getWidgetInstances(dashboardId: string) {
  return db.prepare('SELECT * FROM widget_instances WHERE dashboard_id = ?').all(dashboardId) as any[]
}

export function insertWidgetInstance(w: any) {
  db.prepare(`
    INSERT INTO widget_instances (id, dashboard_id, widget_id, source, config, layouts, canvas, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(w.id, w.dashboardId, w.widgetId, w.source, JSON.stringify(w.config), JSON.stringify(w.layouts), w.canvas ? JSON.stringify(w.canvas) : null)
}

export function updateWidgetInstance(id: string, updates: { config?: any; layouts?: any; canvas?: any }) {
  const sets: string[] = ['updated_at = CURRENT_TIMESTAMP']
  const values: any[] = []
  if (updates.config !== undefined) {
    sets.push('config = ?')
    values.push(JSON.stringify(updates.config))
  }
  if (updates.layouts !== undefined) {
    sets.push('layouts = ?')
    values.push(JSON.stringify(updates.layouts))
  }
  if (updates.canvas !== undefined) {
    sets.push('canvas = ?')
    values.push(updates.canvas ? JSON.stringify(updates.canvas) : null)
  }
  values.push(id)
  db.prepare(`UPDATE widget_instances SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteWidgetInstance(id: string) {
  db.prepare('DELETE FROM widget_instances WHERE id = ?').run(id)
}

// Installed Widgets
export function getInstalledWidgets() {
  return db.prepare('SELECT * FROM installed_widgets').all() as any[]
}

export function insertInstalledWidget(w: { widgetId: string; manifest: any }) {
  db.prepare(`
    INSERT INTO installed_widgets (widget_id, manifest, installed_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(widget_id) DO UPDATE SET
      manifest = excluded.manifest,
      installed_at = CURRENT_TIMESTAMP
  `).run(w.widgetId, JSON.stringify(w.manifest))
}

export function deleteInstalledWidget(widgetId: string) {
  db.prepare('DELETE FROM installed_widgets WHERE widget_id = ?').run(widgetId)
}
