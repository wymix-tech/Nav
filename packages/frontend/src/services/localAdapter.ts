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
    const needsMigration =
      raw.layoutVersion !== 2 ||
      raw.widgets?.some(
        (w: any) => w.source === 'builtin' && w.widgetId === 'chat' && w.config?.apiKey,
      )
    const backupKey =
      raw.layoutVersion !== 2 ? 'layout-v1:standalone' : 'chat-credentials-v1:standalone'
    if (needsMigration)
      await db.transaction('rw', db.backups, async () => {
        if (!(await db.backups.get(backupKey)))
          await db.backups.add({ key: backupKey, data: JSON.stringify(raw) })
      })
    const d = migrateDashboard(raw)
    if (!row || needsMigration) await this.saveDashboard(d)
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
