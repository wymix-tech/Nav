import db from './database.js'

// Dashboard
export function getDashboard(id: string) {
  return db.prepare('SELECT * FROM dashboards WHERE id = ?').get(id) as any
}

export function upsertDashboard(d: { id: string; name: string; columns: number; rowHeight: number }) {
  db.prepare(`
    INSERT INTO dashboards (id, name, columns, row_height, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      columns = excluded.columns,
      row_height = excluded.row_height,
      updated_at = CURRENT_TIMESTAMP
  `).run(d.id, d.name, d.columns, d.rowHeight)
}

// Widget Instances
export function getWidgetInstances(dashboardId: string) {
  return db.prepare('SELECT * FROM widget_instances WHERE dashboard_id = ?').all(dashboardId) as any[]
}

export function insertWidgetInstance(w: any) {
  db.prepare(`
    INSERT INTO widget_instances (id, dashboard_id, widget_id, source, config, layouts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(w.id, w.dashboardId, w.widgetId, w.source, JSON.stringify(w.config), JSON.stringify(w.layouts))
}

export function updateWidgetInstance(id: string, updates: { config?: any; layouts?: any }) {
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
    INSERT OR REPLACE INTO installed_widgets (widget_id, manifest, installed_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(w.widgetId, JSON.stringify(w.manifest))
}

export function deleteInstalledWidget(widgetId: string) {
  db.prepare('DELETE FROM installed_widgets WHERE widget_id = ?').run(widgetId)
}
