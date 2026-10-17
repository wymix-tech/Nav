import {
  createDashboard,
  migrateDashboard,
  validateDashboard,
  type Dashboard,
  type InstalledWidget,
  type StorageAdapter,
  type SyncState,
} from '@nav/shared'
import { localDatabase as db, clone } from './localDatabase'
export class LocalAdapter implements StorageAdapter {
  async getDashboard(): Promise<Dashboard> {
    const row = await db.dashboards.get('default')
    const raw = row ? JSON.parse(row.data) : createDashboard()
    if (raw.layoutVersion !== 2)
      await db.backups.put({ key: 'layout-v1:standalone', data: JSON.stringify(raw) })
    const d = migrateDashboard(raw)
    if (!row || raw.layoutVersion !== 2) await this.saveDashboard(d)
    return d
  }
  async saveDashboard(dashboard: Dashboard): Promise<void> {
    validateDashboard(dashboard)
    await db.dashboards.put({
      id: dashboard.id,
      data: JSON.stringify(dashboard),
      updatedAt: new Date().toISOString(),
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
