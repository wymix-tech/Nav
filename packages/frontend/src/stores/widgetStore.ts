import { defineStore } from 'pinia'
import { ref } from 'vue'
import { validateInstalled, type InstalledWidget } from '@nav/shared'
import { getStorageAdapter, localMode } from '../services/storageAdapter'
import { useDashboardStore } from './dashboardStore'
import { useAuthStore } from './authStore'
export const useWidgetStore = defineStore('widget', () => {
  const installedWidgets = ref<InstalledWidget[]>([]),
    loading = ref(true),
    error = ref('')
  async function load() {
    try {
      installedWidgets.value = await (await getStorageAdapter()).getInstalledWidgets()
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载插件失败'
    } finally {
      loading.value = false
    }
  }
  async function install(w: InstalledWidget) {
    if (!localMode && !useAuthStore().isAuthenticated) throw new Error('请先登录')
    validateInstalled(w)
    await (await getStorageAdapter()).installWidget(w)
    installedWidgets.value = [...installedWidgets.value.filter((x) => x.widgetId !== w.widgetId), w]
  }
  async function uninstall(id: string) {
    if (
      useDashboardStore().dashboard?.widgets.some(
        (w) => w.source === 'installed' && w.widgetId === id,
      )
    )
      throw new Error('请先删除引用此插件的组件')
    if (!localMode && !useAuthStore().isAuthenticated) throw new Error('请先登录')
    await (await getStorageAdapter()).uninstallWidget(id)
    installedWidgets.value = installedWidgets.value.filter((w) => w.widgetId !== id)
  }
  function getWidget(id: string) {
    return installedWidgets.value.find((w) => w.widgetId === id)
  }
  return { installedWidgets, loading, error, load, install, uninstall, getWidget }
})
