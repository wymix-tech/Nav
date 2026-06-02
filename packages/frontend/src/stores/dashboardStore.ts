import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Dashboard, WidgetInstance, CanvasLayout } from '@nav/shared'
import { getStorageAdapter } from '../services/storageAdapter'
import { useAuthStore } from './authStore'

export const useDashboardStore = defineStore('dashboard', () => {
  const dashboard = ref<Dashboard | null>(null)
  const loading = ref(true)

  async function load() {
    const adapter = await getStorageAdapter()
    const data = await adapter.getDashboard()
    // 兼容旧数据
    if (data && !data.layoutMode) data.layoutMode = 'canvas'
    if (data && !data.viewport) {
      data.viewport = { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 }
    }
    dashboard.value = data
    loading.value = false
  }

  async function save() {
    if (!dashboard.value) return
    const adapter = await getStorageAdapter()
    await adapter.saveDashboard(dashboard.value)
  }

  function getAuthHeaders(): Record<string, string> {
    try {
      const authStore = useAuthStore()
      return authStore.getAuthHeaders()
    } catch {
      return {}
    }
  }

  async function saveWidgetToBackend(instance: WidgetInstance) {
    try {
      const res = await fetch(`/api/dashboards/default/widgets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          widgetId: instance.widgetId,
          source: instance.source,
          config: instance.config,
          layouts: instance.layouts,
          canvas: instance.canvas ?? null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        instance.id = data.id
      }
    } catch {
      // 后端不可用，忽略
    }
  }

  function addWidget(instance: WidgetInstance) {
    if (!dashboard.value) return
    dashboard.value.widgets.push(instance)
    save()
    saveWidgetToBackend(instance)
  }

  function removeWidget(instanceId: string) {
    if (!dashboard.value) return
    dashboard.value.widgets = dashboard.value.widgets.filter(
      (w) => w.id !== instanceId
    )
    save()
    fetch(`/api/widgets/${instanceId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => {})
  }

  async function clearAllWidgets() {
    if (!dashboard.value) return
    const ids = dashboard.value.widgets.map((w) => w.id)
    dashboard.value.widgets = []
    save()
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/widgets/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })
      )
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      console.warn(`清空组件：${failed}/${ids.length} 个删除请求失败`)
    }
  }

  function updateWidgetConfig(instanceId: string, config: Record<string, any>) {
    if (!dashboard.value) return
    const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
    if (widget) {
      widget.config = config
      fetch(`/api/widgets/${instanceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ config }),
      }).catch(() => {})
    }
  }

  function updateWidgetCanvas(instanceId: string, canvas: CanvasLayout) {
    if (!dashboard.value) return
    const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
    if (widget) {
      widget.canvas = canvas
      save()
      fetch(`/api/widgets/${instanceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ canvas }),
      }).catch(() => {})
    }
  }

  function updateWidgetLayouts(instanceId: string, layouts: WidgetInstance['layouts']) {
    if (!dashboard.value) return
    const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
    if (widget) {
      widget.layouts = layouts
      fetch(`/api/widgets/${instanceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ layouts }),
      }).catch(() => {})
    }
  }

  return {
    dashboard,
    loading,
    load,
    save,
    addWidget,
    removeWidget,
    clearAllWidgets,
    updateWidgetConfig,
    updateWidgetCanvas,
    updateWidgetLayouts,
  }
})
