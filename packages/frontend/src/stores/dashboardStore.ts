import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Dashboard, WidgetInstance } from '@nav/shared'
import { getStorageAdapter } from '../services/storageAdapter'

export const useDashboardStore = defineStore('dashboard', () => {
  const dashboard = ref<Dashboard | null>(null)
  const loading = ref(true)

  async function load() {
    const adapter = await getStorageAdapter()
    dashboard.value = await adapter.getDashboard()
    loading.value = false
  }

  async function save() {
    if (!dashboard.value) return
    const adapter = await getStorageAdapter()
    await adapter.saveDashboard(dashboard.value)
  }

  function addWidget(instance: WidgetInstance) {
    if (!dashboard.value) return
    dashboard.value.widgets.push(instance)
    save()
  }

  function removeWidget(instanceId: string) {
    if (!dashboard.value) return
    dashboard.value.widgets = dashboard.value.widgets.filter(
      (w) => w.id !== instanceId
    )
    save()
  }

  function updateWidgetConfig(instanceId: string, config: Record<string, any>) {
    if (!dashboard.value) return
    const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
    if (widget) {
      widget.config = config
      save()
    }
  }

  function updateWidgetLayouts(instanceId: string, layouts: WidgetInstance['layouts']) {
    if (!dashboard.value) return
    const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
    if (widget) {
      widget.layouts = layouts
      save()
    }
  }

  return {
    dashboard,
    loading,
    load,
    save,
    addWidget,
    removeWidget,
    updateWidgetConfig,
    updateWidgetLayouts,
  }
})
