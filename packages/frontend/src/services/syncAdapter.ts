import type {
  Dashboard,
  InstalledWidget,
  StorageAdapter,
  Change,
  SyncState,
} from '@nav/shared'
import { useAuthStore } from '../stores/authStore'

const API_BASE = '/api'

async function apiFetch(path: string, options: RequestInit = {}) {
  const authStore = useAuthStore()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authStore.getAuthHeaders(),
    ...(options.headers as Record<string, string> ?? {}),
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (res.status === 401) {
    authStore.logout()
    throw new Error('未登录或 Token 已过期')
  }
  return res
}

export class SyncAdapter implements StorageAdapter {
  async getDashboard(): Promise<Dashboard> {
    const res = await apiFetch('/dashboards')
    if (!res.ok) throw new Error('获取仪表盘失败')
    const data = await res.json()
    return {
      id: data.id,
      name: data.name,
      title: data.title ?? 'INFI.NAV - 个人导航页',
      columns: data.columns,
      rowHeight: data.row_height,
      background: data.background ? JSON.parse(data.background) : {
        mode: 'color',
        color: '#0c1021',
        images: [],
        interval: 30,
        index: 0,
      },
      widgets: (data.widgets ?? []).map((w: any) => ({
        id: w.id,
        widgetId: w.widget_id,
        source: w.source,
        config: JSON.parse(w.config ?? '{}'),
        layouts: JSON.parse(w.layouts ?? '{}'),
        canvas: w.canvas ? JSON.parse(w.canvas) : undefined,
      })),
      layoutMode: data.layout_mode ?? 'canvas',
      viewport: data.viewport ? JSON.parse(data.viewport) : { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 },
      viewportWidth: data.viewport_width ?? 1920,
      viewportHeight: data.viewport_height ?? 1080,
    }
  }

  async saveDashboard(dashboard: Dashboard): Promise<void> {
    await apiFetch(`/dashboards/${dashboard.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: dashboard.name,
        title: dashboard.title,
        columns: dashboard.columns,
        rowHeight: dashboard.rowHeight,
        background: dashboard.background,
        layoutMode: dashboard.layoutMode,
        viewport: dashboard.viewport,
        viewportWidth: dashboard.viewportWidth,
        viewportHeight: dashboard.viewportHeight,
      }),
    })
  }

  async getInstalledWidgets(): Promise<InstalledWidget[]> {
    const res = await apiFetch('/installed-widgets')
    if (!res.ok) return []
    return res.json()
  }

  async installWidget(widget: InstalledWidget): Promise<void> {
    await apiFetch('/installed-widgets', {
      method: 'POST',
      body: JSON.stringify(widget),
    })
  }

  async uninstallWidget(widgetId: string): Promise<void> {
    await apiFetch(`/installed-widgets/${widgetId}`, { method: 'DELETE' })
  }

  async getSyncState(): Promise<SyncState> {
    return { lastSyncAt: new Date().toISOString(), pendingChanges: 0 }
  }

  async push(_changes: Change[]): Promise<void> {
    // 简化实现：直接通过 API 操作，不需要额外 push
  }

  async pull(): Promise<Change[]> {
    return []
  }
}
