import type { NamedView } from '../canvas/namedViewService'
import Dexie, { type Table } from 'dexie'
import type { Dashboard, CanvasViewPreference } from '@nav/shared'
export interface DashboardRow {
  id: string
  data: string
  updatedAt: string
}
export interface InstalledRow {
  widgetId: string
  data: string
  installedAt: string
}
export interface Operation {
  id: string
  snapshot: Dashboard
}
export interface SyncRow {
  key: string
  snapshot: Dashboard
  revision: number
  generation?: number
  pending: Operation[]
  lastSyncAt: string | null
  conflict?: Dashboard
  lease?: { owner: string; until: number }
  error?: string
  authRequired?: boolean
  upgradeRequired?: boolean
}
class NavDatabase extends Dexie {
  namedViews!: Table<NamedView, [string, string]>
  viewPreferences!: Table<CanvasViewPreference, string>
  dashboards!: Table<DashboardRow, string>
  installedWidgets!: Table<InstalledRow, string>
  backups!: Table<{ key: string; data: string }, string>
  sync!: Table<SyncRow, string>
  constructor() {
    super('nav')
    this.version(1).stores({ dashboards: 'id', installedWidgets: 'widgetId' })
    this.version(2).stores({
      dashboards: 'id',
      installedWidgets: 'widgetId',
      backups: 'key',
      sync: 'key',
    })
    this.version(3).stores({ viewPreferences: 'key' })
    this.version(4).stores({ namedViews: '[spaceKey+id],spaceKey,&[spaceKey+nameKey]' })
    this.on('versionchange', () => {
      this.close()
      window.dispatchEvent(new Event('nav-reload-required'))
    })
  }
}
export const localDatabase = new NavDatabase()
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
