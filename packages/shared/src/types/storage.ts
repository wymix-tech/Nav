import type { Dashboard } from './dashboard'
import type { InstalledWidget } from './widget'

export type ChangeOperation = 'create' | 'update' | 'delete'
export type ChangeEntityType = 'dashboard' | 'widget_instance' | 'installed_widget'

export interface Change {
  entityType: ChangeEntityType
  entityId: string
  operation: ChangeOperation
  payload: any
  timestamp: string
}

export interface SyncState {
  lastSyncAt: string | null
  pendingChanges: number
}

export interface StorageAdapter {
  getDashboard(): Promise<Dashboard>
  saveDashboard(dashboard: Dashboard): Promise<void>
  getInstalledWidgets(): Promise<InstalledWidget[]>
  installWidget(widget: InstalledWidget): Promise<void>
  uninstallWidget(widgetId: string): Promise<void>
  getSyncState(): Promise<SyncState>
  push(changes: Change[]): Promise<void>
  pull(): Promise<Change[]>
}
