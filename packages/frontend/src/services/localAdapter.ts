import Dexie, { type Table } from 'dexie'
import type {
  Dashboard,
  InstalledWidget,
  StorageAdapter,
  Change,
  SyncState,
} from '@nav/shared'

interface DashboardRow {
  id: string
  data: string
  updatedAt: string
}

interface InstalledWidgetRow {
  widgetId: string
  data: string
  installedAt: string
}

class NavDatabase extends Dexie {
  dashboards!: Table<DashboardRow>
  installedWidgets!: Table<InstalledWidgetRow>

  constructor() {
    super('nav')
    this.version(1).stores({
      dashboards: 'id',
      installedWidgets: 'widgetId',
    })
  }
}

const db = new NavDatabase()

const DEFAULT_DASHBOARD: Dashboard = {
  id: 'default',
  name: '我的导航',
  title: 'INFI.NAV - 个人导航页',
  widgets: [],
  columns: 12,
  rowHeight: 80,
  background: {
    mode: 'color',
    color: '#0c1021',
    images: [],
    interval: 30,
    index: 0,
  },
  layoutMode: 'canvas',
  viewport: { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 },
}

export class LocalAdapter implements StorageAdapter {
  async getDashboard(): Promise<Dashboard> {
    const row = await db.dashboards.get('default')
    if (!row) {
      await db.dashboards.put({
        id: 'default',
        data: JSON.stringify(DEFAULT_DASHBOARD),
        updatedAt: new Date().toISOString(),
      })
      return DEFAULT_DASHBOARD
    }
    return JSON.parse(row.data)
  }

  async saveDashboard(dashboard: Dashboard): Promise<void> {
    await db.dashboards.put({
      id: dashboard.id,
      data: JSON.stringify(dashboard),
      updatedAt: new Date().toISOString(),
    })
  }

  async getInstalledWidgets(): Promise<InstalledWidget[]> {
    const rows = await db.installedWidgets.toArray()
    return rows.map((r) => JSON.parse(r.data))
  }

  async installWidget(widget: InstalledWidget): Promise<void> {
    await db.installedWidgets.put({
      widgetId: widget.widgetId,
      data: JSON.stringify(widget),
      installedAt: new Date().toISOString(),
    })
  }

  async uninstallWidget(widgetId: string): Promise<void> {
    await db.installedWidgets.delete(widgetId)
  }

  async getSyncState(): Promise<SyncState> {
    return { lastSyncAt: null, pendingChanges: 0 }
  }

  async push(_changes: Change[]): Promise<void> {
    // 本地模式无需 push
  }

  async pull(): Promise<Change[]> {
    return []
  }
}
