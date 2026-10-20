import {
  createDashboard,
  migrateDashboard,
  migrateCanvasDocument,
  validateCurrentDashboard,
  validateCanvasTransition,
  type Dashboard,
  type InstalledWidget,
  type StorageAdapter,
  type SyncState,
} from '@nav/shared'
import { localDatabase as db, clone } from './localDatabase'
export class LocalAdapter implements StorageAdapter {
  async getDashboard(): Promise<Dashboard> {
    return db.transaction('rw', db.dashboards, db.backups, async () => {
      const row = await db.dashboards.get('default')
      const raw = row ? JSON.parse(row.data) : createDashboard()
      const oldCanvas = raw.documentVersion !== 3
      const legacy = raw.layoutVersion !== 2
      const credentials = raw.widgets?.some(
        (w: any) => w.source === 'builtin' && w.widgetId === 'chat' && w.config?.apiKey,
      )
      if (row && (oldCanvas || legacy || credentials)) {
        const key = legacy
          ? 'layout-v1:standalone'
          : credentials
            ? 'chat-credentials-v1:standalone'
            : `canvas-scene-v2:${raw.id}:${raw.revision ?? 0}`
        if (!(await db.backups.get(key))) await db.backups.add({ key, data: row.data })
        if (oldCanvas && raw.documentVersion !== 2)
          await db.backups.put({ key: `canvas-seed:standalone:${raw.id}`, data: row.data })
      }
      const d = migrateCanvasDocument(migrateDashboard(raw))
      if (!row || oldCanvas || legacy || credentials) await this.saveDashboard(d)
      return d
    })
  }

  async saveDashboard(dashboard: Dashboard): Promise<void> {
    validateCurrentDashboard(dashboard)
    await db.transaction('rw', db.dashboards, async () => {
      const previous = await db.dashboards.get(dashboard.id)
      if (previous) {
        const raw = JSON.parse(previous.data)
        if (raw.documentVersion !== undefined && ![2, 3].includes(raw.documentVersion))
          throw new Error('未来或未知文档版本，已停止写入并保留原始数据')
        if (raw.documentVersion === 3) {
          validateCurrentDashboard(raw)
          validateCanvasTransition(raw, dashboard)
        }
      }
      await db.dashboards.put({
        id: dashboard.id,
        data: JSON.stringify(dashboard),
        updatedAt: new Date().toISOString(),
      })
    })
  }
  async getInstalledWidgets(): Promise<InstalledWidget[]> {
    return (await db.installedWidgets.toArray()).map((r) => JSON.parse(r.data))
  }
  async installWidget(widget: InstalledWidget): Promise<void> {
    await db.installedWidgets.put({
      widgetId: widget.widgetId,
      data: JSON.stringify(clone(widget)),
      installedAt: widget.installedAt,
    })
  }
  async uninstallWidget(id: string): Promise<void> {
    await db.installedWidgets.delete(id)
  }
  async getSyncState(): Promise<SyncState> {
    return { lastSyncAt: null, pendingChanges: 0, status: 'local-only' }
  }
  async push(): Promise<void> {
    throw new Error('本地模式不提供独立 push；请使用保存接口')
  }
  async pull(): Promise<never[]> {
    return []
  }
}
