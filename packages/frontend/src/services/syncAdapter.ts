import type {
  Dashboard,
  InstalledWidget,
  StorageAdapter,
  Change,
  SyncState,
} from '@nav/shared'

// 占位实现，Task 20 会替换为完整的 SyncAdapter
export class SyncAdapter implements StorageAdapter {
  async getDashboard(): Promise<Dashboard> {
    throw new Error('SyncAdapter 未实现')
  }

  async saveDashboard(_dashboard: Dashboard): Promise<void> {
    throw new Error('SyncAdapter 未实现')
  }

  async getInstalledWidgets(): Promise<InstalledWidget[]> {
    throw new Error('SyncAdapter 未实现')
  }

  async installWidget(_widget: InstalledWidget): Promise<void> {
    throw new Error('SyncAdapter 未实现')
  }

  async uninstallWidget(_widgetId: string): Promise<void> {
    throw new Error('SyncAdapter 未实现')
  }

  async getSyncState(): Promise<SyncState> {
    throw new Error('SyncAdapter 未实现')
  }

  async push(_changes: Change[]): Promise<void> {
    throw new Error('SyncAdapter 未实现')
  }

  async pull(): Promise<Change[]> {
    throw new Error('SyncAdapter 未实现')
  }
}
