import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { InstalledWidget } from '@nav/shared'
import { getStorageAdapter } from '../services/storageAdapter'

export const useWidgetStore = defineStore('widget', () => {
  const installedWidgets = ref<InstalledWidget[]>([])
  const loading = ref(true)

  async function load() {
    const adapter = await getStorageAdapter()
    installedWidgets.value = await adapter.getInstalledWidgets()
    loading.value = false
  }

  async function install(widget: InstalledWidget) {
    const adapter = await getStorageAdapter()
    await adapter.installWidget(widget)
    installedWidgets.value.push(widget)
  }

  async function uninstall(widgetId: string) {
    const adapter = await getStorageAdapter()
    await adapter.uninstallWidget(widgetId)
    installedWidgets.value = installedWidgets.value.filter(
      (w) => w.widgetId !== widgetId
    )
  }

  function getWidget(widgetId: string): InstalledWidget | undefined {
    return installedWidgets.value.find((w) => w.widgetId === widgetId)
  }

  return {
    installedWidgets,
    loading,
    load,
    install,
    uninstall,
    getWidget,
  }
})
